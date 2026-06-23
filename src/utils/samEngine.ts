import type {
  RawImage,
  Tensor,
  PreTrainedModel,
  Processor,
} from '@huggingface/transformers';
import {
  SAM_LOCAL_MODEL_PATH,
  SAM_MODEL_ID,
  SAM_MODEL_SOURCE,
  HF_MIRROR_HOST,
} from './samConfig';
import { createCanvas, get2d } from './canvasUtils';

/** transformers.js 体积大（约 1MB + 数十 MB wasm），动态导入：仅在用到 SAM 时才加载 */
type TF = typeof import('@huggingface/transformers');
let tfPromise: Promise<TF> | null = null;
function loadLib(): Promise<TF> {
  if (!tfPromise) tfPromise = import('@huggingface/transformers');
  return tfPromise;
}

/** SAM 点击提示：图像像素坐标 + 标签（1=正点保留，0=负点排除） */
export interface SamPrompt {
  x: number;
  y: number;
  label: 0 | 1;
}

/** 一次分割结果：原图分辨率的二值掩码（255=物体，0=背景） */
export interface SamMaskResult {
  data: Uint8Array;
  width: number;
  height: number;
  score: number;
}

function configureEnv(tf: TF) {
  const env = tf.env;
  // 单线程 WASM：避免依赖 SharedArrayBuffer（无需 COOP/COEP 响应头）。
  // WebGPU 为主路径时此项不影响性能。
  try {
    const wasm = env.backends?.onnx?.wasm;
    if (wasm) wasm.numThreads = 1;
  } catch {
    /* 某些环境下该字段不可写，忽略 */
  }

  if (SAM_MODEL_SOURCE === 'local') {
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = SAM_LOCAL_MODEL_PATH;
  } else {
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    if (SAM_MODEL_SOURCE === 'mirror') {
      env.remoteHost = HF_MIRROR_HOST;
    }
  }
}

function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/** 给一个 promise 加超时：超时则 reject，用于兜底卡死的后端初始化 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`后端初始化超时（${ms}ms）`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * SlimSAM 推理引擎（模块级单例）。
 *
 * 用法：ensureModel() 懒加载模型 → setImage() 对当前图编码一次（缓存 embedding）
 * → segment() 对若干提示点即时出掩码。编码较慢（秒级），分割很快（几十毫秒）。
 */
class SamEngine {
  private tf: TF | null = null;
  private model: PreTrainedModel | null = null;
  private processor: Processor | null = null;
  private loadingPromise: Promise<void> | null = null;
  private backend: 'webgpu' | 'wasm' | null = null;

  /** 当前已编码图像的标识，避免重复编码 */
  private encodedToken: unknown = null;
  private imageEmbeddings: Record<string, Tensor> | null = null;
  private originalSizes: [number, number][] | null = null;
  private reshapedSizes: [number, number][] | null = null;
  private encodingPromise: Promise<void> | null = null;

  get usedBackend() {
    return this.backend;
  }

  /** 懒加载模型 + 处理器（只执行一次）。 */
  async ensureModel(): Promise<void> {
    if (this.model && this.processor) return;
    if (this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = this.loadModel().catch((err) => {
      // 失败后允许重试
      this.loadingPromise = null;
      throw err;
    });
    return this.loadingPromise;
  }

  private async loadModel(): Promise<void> {
    const tf = await loadLib();
    this.tf = tf;
    configureEnv(tf);
    this.processor = (await tf.AutoProcessor.from_pretrained(
      SAM_MODEL_ID,
    )) as Processor;

    // WebGPU 优先、WASM 回退。dtype 各后端取稳妥值，失败再退默认。
    const attempts: { device: 'webgpu' | 'wasm'; dtype?: string }[] = [];
    if (hasWebGPU()) attempts.push({ device: 'webgpu', dtype: 'fp16' });
    attempts.push({ device: 'wasm', dtype: 'q8' });
    attempts.push({ device: 'wasm' });

    let lastErr: unknown;
    for (const opt of attempts) {
      try {
        // WebGPU 偶尔会“宣称可用但初始化卡死”，加超时兜底回退到 WASM
        const timeoutMs = opt.device === 'webgpu' ? 20000 : 0;
        this.model = (await withTimeout(
          tf.AutoModel.from_pretrained(SAM_MODEL_ID, {
            device: opt.device,
            ...(opt.dtype ? { dtype: opt.dtype as never } : {}),
          }) as Promise<PreTrainedModel>,
          timeoutMs,
        )) as PreTrainedModel;
        this.backend = opt.device;
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error('SAM 模型加载失败');
  }

  /** 当前图是否已完成编码 */
  isEncoded(token: unknown): boolean {
    return this.encodedToken === token && !!this.imageEmbeddings;
  }

  /** 切换图片时清掉编码缓存，下次 setImage 重新编码 */
  resetImage() {
    this.encodedToken = null;
    this.imageEmbeddings = null;
    this.originalSizes = null;
    this.reshapedSizes = null;
    this.encodingPromise = null;
  }

  /**
   * 对一张图编码（vision encoder）并缓存。token 用于去重（同一张图只编码一次）。
   * 需先 ensureModel()。
   */
  async setImage(image: HTMLImageElement, token: unknown): Promise<void> {
    if (!this.model || !this.processor) {
      throw new Error('模型尚未加载');
    }
    if (this.isEncoded(token)) return;
    if (this.encodingPromise && this.encodedToken === token) {
      return this.encodingPromise;
    }

    this.encodedToken = token;
    this.encodingPromise = (async () => {
      const raw = imageToRaw(this.tf!, image);
      const inputs = await this.processor!(raw);
      const embeddings = await (
        this.model as unknown as {
          get_image_embeddings: (
            i: unknown,
          ) => Promise<Record<string, Tensor>>;
        }
      ).get_image_embeddings(inputs);
      this.imageEmbeddings = embeddings;
      this.originalSizes = (inputs as { original_sizes: [number, number][] })
        .original_sizes;
      this.reshapedSizes = (
        inputs as { reshaped_input_sizes: [number, number][] }
      ).reshaped_input_sizes;
    })();

    try {
      await this.encodingPromise;
    } catch (err) {
      this.resetImage();
      throw err;
    }
  }

  /**
   * 用一组提示点分割，返回得分最高的掩码（原图分辨率）。
   * 需先 setImage()。
   */
  async segment(prompts: SamPrompt[]): Promise<SamMaskResult | null> {
    if (
      !this.model ||
      !this.processor ||
      !this.imageEmbeddings ||
      !this.originalSizes ||
      !this.reshapedSizes
    ) {
      throw new Error('请先编码图像');
    }
    if (prompts.length === 0) return null;

    // 提示点需从“原图像素坐标”换算到“模型 reshaped 输入坐标”，
    // 否则点会落到错误位置（表现为选中背景而非物体）。
    const [origH, origW] = this.originalSizes[0];
    const [reH, reW] = this.reshapedSizes[0];
    const sx = reW / origW;
    const sy = reH / origH;

    const n = prompts.length;
    const pointData = new Float32Array(n * 2);
    const labelData = new BigInt64Array(n);
    prompts.forEach((p, i) => {
      pointData[i * 2] = p.x * sx;
      pointData[i * 2 + 1] = p.y * sy;
      labelData[i] = BigInt(p.label);
    });
    const input_points = new this.tf!.Tensor('float32', pointData, [1, 1, n, 2]);
    const input_labels = new this.tf!.Tensor('int64', labelData, [1, 1, n]);

    const outputs = (await (this.model as unknown as (
      args: Record<string, unknown>,
    ) => Promise<{ pred_masks: Tensor; iou_scores: Tensor }>)({
      ...this.imageEmbeddings,
      input_points,
      input_labels,
    })) as { pred_masks: Tensor; iou_scores: Tensor };

    const masks = await (
      this.processor as unknown as {
        post_process_masks: (
          m: Tensor,
          o: [number, number][],
          r: [number, number][],
        ) => Promise<Tensor[]>;
      }
    ).post_process_masks(
      outputs.pred_masks,
      this.originalSizes,
      this.reshapedSizes,
    );

    return pickBestMask(masks[0], outputs.iou_scores);
  }
}

/** HTMLImageElement → transformers RawImage（RGBA 四通道） */
function imageToRaw(tf: TF, image: HTMLImageElement): RawImage {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const c = createCanvas(w, h);
  const ctx = get2d(c);
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  return new tf.RawImage(new Uint8ClampedArray(data), w, h, 4);
}

/** 从 [1, nMasks, H, W] 的预测里挑 IoU 最高的一张，转成 0/255 二值掩码 */
function pickBestMask(maskTensor: Tensor, iouScores: Tensor): SamMaskResult {
  const dims = maskTensor.dims;
  const H = dims[dims.length - 2];
  const W = dims[dims.length - 1];
  const nMasks = dims.length >= 3 ? dims[dims.length - 3] : 1;
  const planeSize = H * W;

  const scores = iouScores.data as ArrayLike<number>;
  let best = 0;
  for (let i = 1; i < nMasks; i++) {
    if (Number(scores[i]) > Number(scores[best])) best = i;
  }

  const src = maskTensor.data as ArrayLike<number | bigint | boolean>;
  const off = best * planeSize;
  const out = new Uint8Array(planeSize);
  for (let i = 0; i < planeSize; i++) {
    out[i] = src[off + i] ? 255 : 0;
  }
  return { data: out, width: W, height: H, score: Number(scores[best]) };
}

export const samEngine = new SamEngine();
