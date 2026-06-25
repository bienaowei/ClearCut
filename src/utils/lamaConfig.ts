/**
 * LaMa inpainting 模型配置（智能消除：擦除 + 背景填充）。
 *
 * 加载策略：**本地优先，云端兜底**（见 assetSource.ts）。
 *  - 本地：public/models/lama 下的权重，运行 `pnpm lama:download` 拉取。
 *  - 云端：本地缺失时自动回退到 VITE_ASSET_CDN 下的同名路径。
 *
 * 兼容旧配置：若显式设置 VITE_LAMA_MODEL_URL（完整 URL，托管到 OSS/R2/HF 等），
 *            则直接用它，跳过本地/CDN 探测。
 *
 * 注意：fp32 权重 208MB，超过 GitHub 100MB 单文件上限，无法提交进仓库；
 *      正式部署请把权重传到 CDN（VITE_ASSET_CDN）或单独的 VITE_LAMA_MODEL_URL。
 */
import { resolveAsset } from './assetSource';

/** 相对 public/ 的资源路径 */
const LAMA_MODEL_REL = 'models/lama/lama_fp32.onnx';
const ORT_WASM_REL = 'ort/ort-wasm-simd-threaded.jsep.wasm';

/** 显式完整 URL（最高优先级），用于把权重托管到外部 */
const LAMA_EXPLICIT_URL = import.meta.env.VITE_LAMA_MODEL_URL as string | undefined;
const ORT_WASM_EXPLICIT_URL = import.meta.env.VITE_ORT_WASM_URL as string | undefined;

/** 解析 LaMa 权重 URL：显式 URL 优先，否则本地→CDN 兜底。 */
export function getLamaModelUrl(): Promise<string> {
  return LAMA_EXPLICIT_URL
    ? Promise.resolve(LAMA_EXPLICIT_URL)
    : resolveAsset(LAMA_MODEL_REL);
}

/**
 * 解析 ONNX Runtime 的 wasm 二进制 URL（jsep 版，同时支持 WebGPU 与 WASM 后端）。
 *
 * 注意：默认的 ort.bundle.min.mjs 已把 wasm 的 JS 胶水(.mjs)内嵌进包里，
 * 因此**只需覆盖 .wasm 二进制**（走 fetch，不走动态 import）。
 */
export function getOrtWasmUrl(): Promise<string> {
  return ORT_WASM_EXPLICIT_URL
    ? Promise.resolve(ORT_WASM_EXPLICIT_URL)
    : resolveAsset(ORT_WASM_REL);
}

/** LaMa 固定输入分辨率（Carve/LaMa-ONNX 固定 512×512） */
export const LAMA_INPUT_SIZE = 512;
