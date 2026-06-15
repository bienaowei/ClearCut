import { saveAs } from 'file-saver';
import type { CropResult } from '../types';
import type { ZipFileEntry, ZipRequest } from '../workers/zipWorker';

/** 触发单张 PNG 下载 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  saveAs(dataUrl, filename);
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
        saveAs(e.data.blob, zipName);
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
