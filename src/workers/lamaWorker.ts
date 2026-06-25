/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web';
import {
  getLamaModelUrl,
  LAMA_INPUT_SIZE,
  getOrtWasmUrl,
  MODEL_CACHE_NAME,
} from '../utils/lamaConfig';

/**
 * LaMa 推理 Web Worker。
 *
 * 整个推理（含 512 缩放、张量构建、ORT 运行、掩码回贴）都在 worker 内完成，
 * 主线程只负责收发 ImageData —— 因此推理再慢也不会冻结界面（方案1）。
 * worker 内在跨源隔离时开多线程 WASM（方案2）。
 *
 * 注意：LaMa 的 FFC（傅里叶卷积）在 ORT WebGPU 后端运行时会崩，固定走 WASM。
 */

type InMsg =
  | {
      type?: 'inpaint';
      id: number;
      src: ImageData;
      mask: ImageData;
      width: number;
      height: number;
      threads: number;
    }
  | { type: 'preload'; id: number; threads: number };

type DownloadProgress = (p: number | null) => void;

let configured = false;
let session: ort.InferenceSession | null = null;
let loading: Promise<ort.InferenceSession> | null = null;

async function configure(threads: number) {
  if (configured) return;
  configured = true;
  // 本地优先、CDN 兜底（见 assetSource.ts）。需先 await 解析出最终 URL。
  ort.env.wasm.wasmPaths = { wasm: await getOrtWasmUrl() };
  ort.env.wasm.proxy = false; // 已在 worker 内，无需 ORT 再嵌套 worker
  // 线程数由主线程决定（跨源隔离时多线程；主线程看门狗若判定卡死会重建 worker 传 1）。
  ort.env.wasm.numThreads = Math.max(1, threads);
}

/**
 * 模型权重的持久缓存（Cache Storage）。
 * 与 HTTP 缓存无关、刷新/重启 dev server 后仍在，专治 208MB 权重每次刷新重下。
 * 注意：Cache API 仅在安全上下文（https / localhost）可用；用局域网 IP 走 http
 * 访问时 `caches` 不存在，此处自动降级为直接下载（不报错）。
 */
async function openModelCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(MODEL_CACHE_NAME);
  } catch {
    return null;
  }
}

/**
 * 取模型权重：优先读持久缓存，未命中再流式下载并写回缓存。
 * ORT 的 InferenceSession.create(url) 本身不暴露下载进度，故这里自行用 fetch +
 * ReadableStream 读取字节、按 content-length 估算百分比，再把内存中的权重交给 ORT。
 */
async function fetchModelWithProgress(
  url: string,
  onProgress?: DownloadProgress,
): Promise<Uint8Array> {
  const cache = await openModelCache();
  if (cache) {
    const hit = await cache.match(url);
    if (hit) {
      onProgress?.(1); // 命中缓存：无需下载，直接置满进度
      return new Uint8Array(await hit.arrayBuffer());
    }
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`模型下载失败（HTTP ${res.status}）`);
  const total = Number(res.headers.get('content-length')) || 0;

  let buf: Uint8Array;
  if (!res.body) {
    // 极少数环境拿不到可读流，退化为整块下载（无细粒度进度）
    onProgress?.(null);
    buf = new Uint8Array(await res.arrayBuffer());
  } else {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress?.(total > 0 ? Math.min(1, loaded / total) : null);
    }
    buf = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.length;
    }
  }

  // 写回持久缓存，下次刷新秒开。配额不足（QuotaExceededError）等失败静默降级。
  if (cache) {
    try {
      await cache.put(
        url,
        // buf 始终由普通 ArrayBuffer 支撑；lib 类型把 Uint8Array 误判为可能基于
        // SharedArrayBuffer（worker 开了多线程 SAB），故窄化为 BodyInit。
        new Response(buf as unknown as BodyInit, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(buf.length),
          },
        }),
      );
    } catch {
      /* 忽略：缓存写入失败不影响本次推理 */
    }
  }
  return buf;
}

async function ensureSession(
  threads: number,
  onProgress?: DownloadProgress,
): Promise<ort.InferenceSession> {
  if (session) return session;
  if (!loading) {
    loading = (async () => {
      await configure(threads);
      const modelUrl = await getLamaModelUrl();
      const weights = await fetchModelWithProgress(modelUrl, onProgress);
      return ort.InferenceSession.create(weights, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    })();
  }
  session = await loading;
  return session;
}

function newCanvas(w: number, h: number): OffscreenCanvas {
  return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
}
function ctx2d(c: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('无法获取 OffscreenCanvas 2D 上下文');
  return g;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** 掩码膨胀像素（512 局部空间）：外扩以吃掉阴影/抗锯齿残影 */
const MASK_DILATE_PX = 6;
/** 包围盒外扩比例（相对长边）：给模型留背景上下文 */
const CROP_PAD_RATIO = 0.3;
/** 包围盒最小外扩像素（全分辨率） */
const CROP_MIN_PAD = 24;

/** 扫描画布 alpha>8 的像素包围盒；全空返回 null */
function maskBBox(data: Uint8ClampedArray, w: number, h: number) {
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** blur+阈值近似形态学膨胀：把掩码外扩 r 像素，alpha 输出 0/255 */
function dilate(
  src: OffscreenCanvas,
  w: number,
  h: number,
  r: number,
): OffscreenCanvas {
  const out = newCanvas(w, h);
  const c = ctx2d(out);
  if (r > 0) c.filter = `blur(${r}px)`;
  c.drawImage(src, 0, 0);
  c.filter = 'none';
  if (r <= 0) return out;
  const id = c.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 8 ? 255 : 0;
  c.putImageData(id, 0, 0);
  return out;
}

async function runInpaint(
  srcData: ImageData,
  maskData: ImageData,
  W: number,
  H: number,
  threads: number,
): Promise<ImageData> {
  const s = await ensureSession(threads);
  const S = LAMA_INPUT_SIZE;

  // 全分辨率原图 / 掩码落到画布
  const srcC = newCanvas(W, H);
  ctx2d(srcC).putImageData(srcData, 0, 0);
  const maskC = newCanvas(W, H);
  ctx2d(maskC).putImageData(maskData, 0, 0);

  // ① 在下采样的探针上求掩码包围盒（避免对大图做全分辨率 JS 扫描）
  const probeScale = Math.min(1, S / Math.max(W, H));
  const pw = Math.max(1, Math.round(W * probeScale));
  const ph = Math.max(1, Math.round(H * probeScale));
  const probe = newCanvas(pw, ph);
  ctx2d(probe).drawImage(maskC, 0, 0, pw, ph);
  const bbP = maskBBox(ctx2d(probe).getImageData(0, 0, pw, ph).data, pw, ph);
  if (!bbP) return srcData; // 无掩码，原样返回

  // 探针坐标 → 全分辨率坐标
  const bx = bbP.x / probeScale;
  const by = bbP.y / probeScale;
  const bw = bbP.w / probeScale;
  const bh = bbP.h / probeScale;

  // ② 外扩并取正方形局部，夹进图像边界（只在这块做高分辨率推理）
  const pad = Math.max(
    CROP_MIN_PAD,
    Math.round(Math.max(bw, bh) * CROP_PAD_RATIO),
  );
  const cropS = Math.min(Math.round(Math.max(bw, bh) + pad * 2), W, H);
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const cropX = Math.max(0, Math.min(Math.round(cx - cropS / 2), W - cropS));
  const cropY = Math.max(0, Math.min(Math.round(cy - cropS / 2), H - cropS));

  // 裁出局部原图 + 掩码，并缩到模型输入尺寸 512
  const img512 = newCanvas(S, S);
  const ig = ctx2d(img512);
  ig.imageSmoothingEnabled = true;
  ig.imageSmoothingQuality = 'high';
  ig.drawImage(srcC, cropX, cropY, cropS, cropS, 0, 0, S, S);
  const rawMask512 = newCanvas(S, S);
  ctx2d(rawMask512).drawImage(maskC, cropX, cropY, cropS, cropS, 0, 0, S, S);

  // ③ 在 512 局部上膨胀掩码（廉价；吃掉阴影/抗锯齿残影）
  const mask512 = dilate(rawMask512, S, S, MASK_DILATE_PX);

  const imgPix = ig.getImageData(0, 0, S, S).data;
  const mskPix = ctx2d(mask512).getImageData(0, 0, S, S).data;

  // 张量：image [1,3,S,S] 归一化 planar RGB；mask [1,1,S,S] 二值（1=擦除）
  const plane = S * S;
  const imgArr = new Float32Array(3 * plane);
  const mskArr = new Float32Array(plane);
  for (let i = 0; i < plane; i++) {
    imgArr[i] = imgPix[i * 4] / 255;
    imgArr[i + plane] = imgPix[i * 4 + 1] / 255;
    imgArr[i + 2 * plane] = imgPix[i * 4 + 2] / 255;
    mskArr[i] = mskPix[i * 4 + 3] > 8 ? 1 : 0;
  }
  const results = await s.run({
    image: new ort.Tensor('float32', imgArr, [1, 3, S, S]),
    mask: new ort.Tensor('float32', mskArr, [1, 1, S, S]),
  });
  const outData = results[s.outputNames[0]].data as Float32Array;

  // 输出 [1,3,S,S]，值域 0~255（Carve 版 ONNX 已乘 255）→ 512 画布
  const out512 = newCanvas(S, S);
  const outImg = new ImageData(S, S);
  for (let i = 0; i < plane; i++) {
    outImg.data[i * 4] = clamp255(outData[i]);
    outImg.data[i * 4 + 1] = clamp255(outData[i + plane]);
    outImg.data[i * 4 + 2] = clamp255(outData[i + 2 * plane]);
    outImg.data[i * 4 + 3] = 255;
  }
  ctx2d(out512).putImageData(outImg, 0, 0);

  // ④ 512 输出放大回 crop 尺寸，按羽化掩码仅贴掩码区，再合成回原图
  const filled = newCanvas(cropS, cropS);
  const fctx = ctx2d(filled);
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(out512, 0, 0, S, S, 0, 0, cropS, cropS);

  const soft = newCanvas(cropS, cropS);
  const sctx = ctx2d(soft);
  sctx.filter = 'blur(2px)';
  sctx.drawImage(mask512, 0, 0, S, S, 0, 0, cropS, cropS);
  sctx.filter = 'none';

  fctx.globalCompositeOperation = 'destination-in';
  fctx.drawImage(soft, 0, 0);
  fctx.globalCompositeOperation = 'source-over';

  const result = newCanvas(W, H);
  const rctx = ctx2d(result);
  rctx.drawImage(srcC, 0, 0);
  rctx.drawImage(filled, cropX, cropY);
  return rctx.getImageData(0, 0, W, H);
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;

  // 预加载：仅下载并初始化模型（带进度），不做推理。用于「点确定后下载」闸门。
  if (msg.type === 'preload') {
    const { id, threads } = msg;
    try {
      await ensureSession(threads, (p) =>
        self.postMessage({ id, phase: 'downloading', progress: p }),
      );
      self.postMessage({ id }); // 无 phase / error → 视为完成
    } catch (err) {
      self.postMessage({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const { id, src, mask, width, height, threads } = msg;
  try {
    self.postMessage({ id, phase: 'loading' });
    await ensureSession(threads);
    self.postMessage({ id, phase: 'running' });
    const result = await runInpaint(src, mask, width, height, threads);
    self.postMessage({ id, result }, { transfer: [result.data.buffer] });
  } catch (err) {
    self.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
