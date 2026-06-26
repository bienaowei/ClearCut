import { createCanvas, get2d } from './canvasUtils';
import { MODEL_CACHE_NAME, getLamaModelUrl } from './lamaConfig';

/**
 * LaMa inpainting 引擎（主线程侧薄封装），用于「智能消除」：
 * 把掩码标记的区域擦掉，并由模型补全背景。
 *
 * 真正的推理在 src/workers/lamaWorker.ts 内进行（含 512 缩放、ORT 运行、掩码回贴），
 * 主线程只负责收发 ImageData：因此推理再慢也不会冻结界面（方案1 Worker）。
 *
 * 方案2（多线程 WASM 提速）：跨源隔离时尝试多线程。但 ORT 的嵌套 pthread worker
 * 在某些环境（如 Vite dev 的 module worker）会加载卡死，故首个任务带「看门狗」：
 * 超时未进入推理则判定卡死，终止 worker 改用单线程重试，保证永不永久挂起。
 */

export type LamaProgress = (phase: 'loading' | 'running') => void;

/** 模型下载进度回调：p 为 0~1；无法获知总量时传 null（不确定态）。 */
export type LamaDownloadProgress = (p: number | null) => void;

/**
 * 首个任务加载（含 208MB 权重）的看门狗超时：超过则判定多线程卡死并回退单线程。
 * 本地正常初始化约 5s，留足余量取 30s：既能容忍慢网络/慢机器，又不至于卡死时白等太久。
 */
const LOAD_WATCHDOG_MS = 30_000;

/**
 * 多线程曾卡死的浏览器记忆标记（仿 SAM 的 sam_skip_webgpu）。
 * 一旦回退过，之后该浏览器直接走单线程，避免每次刷新都白等看门狗。
 */
const SKIP_MT_KEY = 'lama_skip_multithread';
function readSkipMultithread(): boolean {
  try {
    return globalThis.localStorage?.getItem(SKIP_MT_KEY) === '1';
  } catch {
    return false;
  }
}
function markSkipMultithread() {
  try {
    globalThis.localStorage?.setItem(SKIP_MT_KEY, '1');
  } catch {
    /* 隐私模式等存储不可用，忽略 */
  }
}

interface Job {
  src: ImageData;
  mask: ImageData;
  width: number;
  height: number;
  onProgress?: LamaProgress;
  resolve: (canvas: HTMLCanvasElement) => void;
  reject: (err: Error) => void;
}

interface Pending {
  job: Job;
  watchdog: ReturnType<typeof setTimeout> | null;
  loaded: boolean;
}

interface PreloadEntry {
  onProgress?: LamaDownloadProgress;
  resolve: () => void;
  reject: (err: Error) => void;
}

class LamaEngine {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  /** 预加载任务（仅下载模型、带进度，不推理）。 */
  private preloads = new Map<number, PreloadEntry>();
  /** 当前使用的线程数；首个任务卡死会被降到 1。 */
  private threads = preferredThreads();
  /** 模型是否已在当前 worker 内加载完成（之后的任务无需再看门狗）。 */
  private sessionReady = false;

  /** 当前 WASM 线程数（供 UI 提示是否处于加速模式） */
  get threadCount(): number {
    return this.threads;
  }

  /** 模型是否已下载并初始化完成（用于下载闸门判断是否需要下载）。 */
  isModelReady(): boolean {
    return this.sessionReady;
  }

  /**
   * 权重字节是否已存在于持久缓存（Cache Storage）。
   * 用于下载闸门：刷新后内存 session 虽丢失（isModelReady=false），但若字节仍在缓存，
   * 则只需从缓存秒读 + 重建会话，无需重新下载，故跳过「是否下载」征询、直接加载。
   * caches 不可用（非安全上下文）或异常时返回 false（按未缓存处理，照常征询）。
   */
  async isModelCached(): Promise<boolean> {
    if (this.sessionReady) return true;
    try {
      if (typeof caches === 'undefined') return false;
      const cache = await caches.open(MODEL_CACHE_NAME);
      const url = await getLamaModelUrl();
      return (await cache.match(url)) !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * 预加载模型：仅下载权重并初始化推理会话（带下载进度），不执行推理。
   * 供「用户点确定后才开始下载」的闸门调用；完成后 run() 可直接推理。
   *
   * 与 dispatch 一样，首次多线程加载时带看门狗：超时判定 pthread 卡死后
   * 终止 worker、降为单线程重试，避免永久挂起。
   */
  preloadModel(onProgress?: LamaDownloadProgress): Promise<void> {
    if (this.sessionReady) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const worker = this.ensureWorker();
      const id = ++this.seq;
      const guarded = !this.sessionReady && this.threads > 1;
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      if (guarded) {
        watchdog = setTimeout(() => {
          console.warn('[LaMa] 预加载多线程超时，回退单线程重试');
          markSkipMultithread();
          this.preloads.delete(id);
          this.terminateWorker();
          this.threads = 1;
          this.preloadModel(onProgress).then(resolve, reject);
        }, LOAD_WATCHDOG_MS);
      }
      const wrappedResolve = () => {
        if (watchdog) clearTimeout(watchdog);
        resolve();
      };
      const wrappedReject = (err: Error) => {
        if (watchdog) clearTimeout(watchdog);
        reject(err);
      };
      this.preloads.set(id, { onProgress, resolve: wrappedResolve, reject: wrappedReject });
      worker.postMessage({ type: 'preload', id, threads: this.threads });
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(
      new URL('../workers/lamaWorker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (e: MessageEvent) => this.onWorkerMessage(e);
    worker.onerror = (e) => {
      // 多线程首个任务加载阶段出错 → 回退单线程重试，不直接失败。
      if (this.threads > 1 && !this.sessionReady) {
        console.warn('[LaMa] 多线程 worker 出错，回退单线程重试：', e.message);
        markSkipMultithread();
        const jobs: Job[] = [];
        for (const [, p] of this.pending) {
          if (p.watchdog) clearTimeout(p.watchdog);
          jobs.push(p.job);
        }
        this.pending.clear();
        this.terminateWorker();
        this.threads = 1;
        for (const job of jobs) this.dispatch(job);
        return;
      }
      this.failAll(new Error(`LaMa worker 错误：${e.message || '未知错误'}`));
    };
    this.worker = worker;
    return worker;
  }

  private terminateWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.sessionReady = false;
  }

  private failAll(err: Error) {
    for (const [, p] of this.pending) {
      if (p.watchdog) clearTimeout(p.watchdog);
      p.job.reject(err);
    }
    this.pending.clear();
    for (const [, pre] of this.preloads) pre.reject(err);
    this.preloads.clear();
  }

  private onWorkerMessage(e: MessageEvent) {
    const { id, phase, progress, result, error } = e.data ?? {};

    // 预加载任务：上报下载进度，完成/出错时结算。
    const pre = this.preloads.get(id);
    if (pre) {
      if (phase === 'downloading') {
        pre.onProgress?.(progress as number | null);
        return;
      }
      this.preloads.delete(id);
      if (error) {
        pre.reject(new Error(error));
        return;
      }
      this.sessionReady = true; // 会话已在 worker 内就绪
      pre.onProgress?.(1);
      pre.resolve();
      return;
    }

    const p = this.pending.get(id);
    if (!p) return;

    if (phase === 'running') {
      // 模型已加载完成、开始推理 → 关掉看门狗，标记会话就绪
      p.loaded = true;
      this.sessionReady = true;
      if (p.watchdog) {
        clearTimeout(p.watchdog);
        p.watchdog = null;
      }
    }
    if (phase) {
      p.job.onProgress?.(phase);
      return;
    }

    this.pending.delete(id);
    if (p.watchdog) clearTimeout(p.watchdog);
    if (error) {
      p.job.reject(new Error(error));
      return;
    }
    const data = result as ImageData;
    const out = createCanvas(data.width, data.height);
    get2d(out).putImageData(data, 0, 0);
    p.job.resolve(out);
  }

  /**
   * 对原图执行擦除 + 背景填充。
   * @param source 原图（全分辨率）
   * @param mask   掩码画布（全分辨率，alpha>0 处为「要擦除」的区域）
   * @returns 补全后的全分辨率画布（仅掩码区域被替换，其余像素保持原图无损）
   */
  inpaint(
    source: HTMLCanvasElement | HTMLImageElement,
    mask: HTMLCanvasElement,
    onProgress?: LamaProgress,
  ): Promise<HTMLCanvasElement> {
    const W = 'naturalWidth' in source ? source.naturalWidth : source.width;
    const H = 'naturalHeight' in source ? source.naturalHeight : source.height;
    const srcCanvas = createCanvas(W, H);
    get2d(srcCanvas).drawImage(source, 0, 0);
    const src = get2d(srcCanvas).getImageData(0, 0, W, H);
    const maskData = get2d(mask).getImageData(0, 0, mask.width, mask.height);

    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      this.dispatch({
        src,
        mask: maskData,
        width: W,
        height: H,
        onProgress,
        resolve,
        reject,
      });
    });
  }

  private dispatch(job: Job) {
    const worker = this.ensureWorker();
    const id = ++this.seq;
    // 仅首个任务（模型尚未加载、且当前为多线程）需要看门狗 + 可回退。
    const guarded = !this.sessionReady && this.threads > 1;

    const entry: Pending = { job, watchdog: null, loaded: false };
    if (guarded) {
      entry.watchdog = setTimeout(() => {
        // 多线程加载疑似卡死：终止 worker，降为单线程，用同一任务重试。
        console.warn('[LaMa] 多线程加载超时，回退单线程重试');
        markSkipMultithread();
        this.pending.delete(id);
        this.terminateWorker();
        this.threads = 1;
        this.dispatch(job);
      }, LOAD_WATCHDOG_MS);
    }
    this.pending.set(id, entry);

    const msg = {
      id,
      src: job.src,
      mask: job.mask,
      width: job.width,
      height: job.height,
      threads: this.threads,
    };
    // 可回退时不转移 buffer（保留副本以便重试）；确定不回退时转移以省一次拷贝。
    if (guarded) {
      worker.postMessage(msg);
    } else {
      worker.postMessage(msg, [job.src.data.buffer, job.mask.data.buffer]);
    }
  }
}

/**
 * 多线程 WASM 提速：worker 已切 classic（vite.config worker.format:'iife'），
 * Emscripten 的 pthread 子 worker 可正常 importScripts，故在跨源隔离时开多线程。
 *
 * 安全网：若某些环境仍卡死，主线程看门狗会终止 worker、降回单线程重试，并写下
 * lama_skip_multithread 标记，之后该浏览器直接走单线程（COOP/COEP 头已就绪）。
 */
function preferredThreads(): number {
  const ENABLE_MULTITHREAD = true; // worker 已切 classic(iife)，pthread 可用
  if (!ENABLE_MULTITHREAD) return 1;
  const isolated =
    typeof globalThis !== 'undefined' &&
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated ===
      true;
  if (!isolated || readSkipMultithread()) return 1;
  const cores =
    typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return Math.min(4, cores);
}

export const lamaEngine = new LamaEngine();
