import type { CropResult } from '../types';
import type { ZipFileEntry, ZipRequest } from '../workers/zipWorker';

/**
 * 通过隐藏的 <a download> 触发下载。
 * 不走 file-saver 的兜底逻辑（在 macOS WebView / 部分 Safari 下会
 * 用 location.href 跳转页面，导致 React 应用重挂载、已加载的图片被清空）。
 */
function triggerDownload(data: Blob | string, filename: string): void {
  const isBlob = typeof data !== 'string';
  const url = isBlob ? URL.createObjectURL(data) : data;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (isBlob) {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** 触发单张 PNG 下载 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  triggerDownload(dataUrl, filename);
}

/** 清洗文件名中的非法字符 */
export function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'unnamed';
}

export interface ManifestEntry {
  index: number;
  name: string;
  file: string;
  width: number;
  height: number;
  points: { x: number; y: number }[];
}

export function buildManifest(results: CropResult[]): {
  generatedAt: string;
  count: number;
  items: ManifestEntry[];
} {
  return {
    generatedAt: new Date().toISOString(),
    count: results.length,
    items: results.map((r, i) => ({
      index: i + 1,
      name: r.polygon.name,
      file: `${i + 1}_${sanitizeName(r.polygon.name)}.png`,
      width: r.width,
      height: r.height,
      points: r.polygon.points.map((p) => ({ x: p.x, y: p.y })),
    })),
  };
}

/**
 * 在 Web Worker 中将裁剪结果打包为 zip 并下载。
 */
export async function exportResultsAsZip(
  results: CropResult[],
  zipName = 'clearcut_export.zip',
): Promise<void> {
  const manifest = buildManifest(results);
  const files: ZipFileEntry[] = results.map((r, i) => ({
    name: `${i + 1}_${sanitizeName(r.polygon.name)}.png`,
    dataUrl: r.dataUrl,
  }));

  const worker = new Worker(
    new URL('../workers/zipWorker.ts', import.meta.url),
    { type: 'module' },
  );

  await new Promise<void>((resolve, reject) => {
    worker.onmessage = (
      e: MessageEvent<{ ok: boolean; blob?: Blob; error?: string }>,
    ) => {
      if (e.data.ok && e.data.blob) {
        triggerDownload(e.data.blob, zipName);
        resolve();
      } else {
        reject(new Error(e.data.error ?? '打包失败'));
      }
      worker.terminate();
    };
    worker.onerror = (err) => {
      reject(err.error ?? new Error('Worker 错误'));
      worker.terminate();
    };
    const req: ZipRequest = { files, manifest };
    worker.postMessage(req);
  });
}
