/**
 * 大资源（ORT wasm / SAM / LaMa 模型）加载源解析：**本地优先，云端兜底**。
 *
 *  - 本地：随站点部署的 public/ 下文件（相对 BASE_URL，通常同源）。
 *  - 云端：VITE_ASSET_CDN 指向的 CDN 根，**目录结构与 public/ 完全一致**，
 *          例如 https://xxx.cdn.bspapp.com/ClearCut/ → {CDN}/ort/...、{CDN}/models/...
 *
 * 运行时对每个资源做一次同源 HEAD 探测：本地存在(2xx 且非 SPA 回退)就走本地，
 * 否则回退到 CDN。结果按相对路径缓存，避免重复请求。
 *
 * 注意（跨源隔离）：本应用启用了 COOP/COEP(require-corp)以开多线程 WASM。
 * 因此 CDN 必须为这些资源返回 `Cross-Origin-Resource-Policy: cross-origin`
 * （并允许 CORS），否则跨源加载会被浏览器拦截。HEAD 探测只打同源本地，不涉及此。
 */

/** CDN 根地址（规整为以 / 结尾）。未配置则只用本地。 */
const CDN_BASE = (import.meta.env.VITE_ASSET_CDN as string | undefined)
  ?.trim()
  .replace(/\/?$/, '/');

/** 本地站点根（子路径部署兼容），通常为 '/'。 */
const LOCAL_BASE = import.meta.env.BASE_URL;

function localUrl(rel: string): string {
  return `${LOCAL_BASE}${rel}`;
}

function cdnUrl(rel: string): string | null {
  return CDN_BASE ? `${CDN_BASE}${rel}` : null;
}

/** rel → 解析结果 的缓存（缓存 Promise，并发探测同一资源只发一次 HEAD）。 */
const cache = new Map<string, Promise<string>>();

/**
 * 同源探测某相对路径的本地文件是否真实存在。
 *
 * SPA 服务器（Vite dev / Vercel 等）会把未知路径回退到 index.html 并返回 200，
 * 用 content-type 含 text/html 把这种“假 200”判为不存在，避免误用本地拿到 HTML。
 */
async function existsLocally(rel: string): Promise<boolean> {
  try {
    const res = await fetch(localUrl(rel), { method: 'HEAD' });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    return !ct.includes('text/html');
  } catch {
    return false;
  }
}

/**
 * 解析单个资源的最终 URL：本地有就本地，没有就 CDN（未配 CDN 时永远本地）。
 *
 * 当前用于体积大的 ORT wasm 与 LaMa 权重；SAM 体积小、随 git 自托管，不走此处。
 * @param rel 相对 public/ 的路径，如 'ort/ort-wasm-simd-threaded.jsep.wasm'
 */
export function resolveAsset(rel: string): Promise<string> {
  let p = cache.get(rel);
  if (!p) {
    p = (async () => {
      const remote = cdnUrl(rel);
      if (!remote) return localUrl(rel); // 未配 CDN，只能本地
      return (await existsLocally(rel)) ? localUrl(rel) : remote;
    })();
    cache.set(rel, p);
  }
  return p;
}
