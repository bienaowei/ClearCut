/**
 * SlimSAM 模型配置。
 *
 * 模型来源由构建期环境变量 VITE_SAM_MODEL_SOURCE 决定：
 *  - 'local'（默认）：自托管，从 public/models 加载（体积小，随 git 上传，不走 CDN，
 *    以减少云访问次数、不影响已部署功能）。运行 `pnpm sam:download` 拉取到本地。
 *  - 'remote'：HuggingFace 官方 CDN 在线拉取（国内可能慢/连不上）。
 *  - 'mirror'：走 hf-mirror.com 镜像，国内更稳。
 */
export const SAM_MODEL_ID = 'Xenova/slimsam-77-uniform';

export type SamModelSource = 'local' | 'remote' | 'mirror';

export const SAM_MODEL_SOURCE: SamModelSource =
  (import.meta.env.VITE_SAM_MODEL_SOURCE as SamModelSource) || 'local';

/** 自托管模型文件根目录（相对站点根，需以 / 结尾）。BASE_URL 兼容子路径部署。 */
export const SAM_LOCAL_MODEL_PATH = `${import.meta.env.BASE_URL}models/`;

/** hf-mirror 镜像地址 */
export const HF_MIRROR_HOST = 'https://hf-mirror.com';
