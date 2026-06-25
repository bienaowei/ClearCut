import { createCanvas, get2d } from './canvasUtils';

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

/** 首个任务加载（含 208MB 权重）的看门狗超时：超过则判定多线程卡死并回退单线程。 */
const LOAD_WATCHDOG_MS = 50_000;

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
   * 预加载模型：仅下载权重并初始化推理会话（带下载进度），不执行推理。
   * 供「用户点确定后才开始下载」的闸门调用；完成后 run() 可直接推理。
   */
  preloadModel(onProgress?: LamaDownloadProgress): Promise<void> {
    if (this.sessionReady) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const worker = this.ensureWorker();
      const id = ++this.seq;
      this.preloads.set(id, { onProgress, resolve, reject });
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
 * 当前实测：ORT 多线程 WASM 在本工程跑不起来——Emscripten 的 pthread 子 worker
 * 依赖 `importScripts`，而 ES module worker 没有该 API，导致多线程会话加载永久卡死
 * （dev / 生产构建均复现）。因此**默认单线程**，避免每次都白等看门狗超时。
 *
 * 若日后把 worker 改为 classic（worker.format:'iife'）让 pthread 可用，把这里改回
 * 跨源隔离判定即可（COOP/COEP 头与看门狗回退逻辑已就绪）。
 */
function preferredThreads(): number {
  const ENABLE_MULTITHREAD = false; // 见上：当前架构下多线程不可用
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
