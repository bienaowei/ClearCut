/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web';
import {
  getLamaModelUrl,
  LAMA_INPUT_SIZE,
  getOrtWasmUrl,
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
 * 流式下载模型权重并上报进度。
 * ORT 的 InferenceSession.create(url) 本身不暴露下载进度，故这里自行用 fetch +
 * ReadableStream 读取字节、按 content-length 估算百分比，再把内存中的权重交给 ORT。
 */
async function fetchModelWithProgress(
  url: string,
  onProgress?: DownloadProgress,
): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`模型下载失败（HTTP ${res.status}）`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) {
    // 极少数环境拿不到可读流，退化为整块下载（无细粒度进度）
    onProgress?.(null);
    return new Uint8Array(await res.arrayBuffer());
  }
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
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
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

  // 缩放到模型输入尺寸
  const img512 = newCanvas(S, S);
  ctx2d(img512).drawImage(srcC, 0, 0, S, S);
  const mask512 = newCanvas(S, S);
  ctx2d(mask512).drawImage(maskC, 0, 0, S, S);
  const imgPix = ctx2d(img512).getImageData(0, 0, S, S).data;
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

  // 仅把掩码区域（羽化）的补全像素贴回原图，其余保持原图无损
  const result = newCanvas(W, H);
  const rctx = ctx2d(result);
  rctx.drawImage(srcC, 0, 0);

  const filled = newCanvas(W, H);
  const fctx = ctx2d(filled);
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(out512, 0, 0, W, H);

  const soft = newCanvas(W, H);
  const sctx = ctx2d(soft);
  sctx.filter = 'blur(2px)';
  sctx.drawImage(maskC, 0, 0, W, H);
  sctx.filter = 'none';

  fctx.globalCompositeOperation = 'destination-in';
  fctx.drawImage(soft, 0, 0);
  fctx.globalCompositeOperation = 'source-over';
  rctx.drawImage(filled, 0, 0);

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
