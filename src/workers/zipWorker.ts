import JSZip from 'jszip';

export interface ZipFileEntry {
  name: string; // 文件名，如 "1_物品1.png"
  dataUrl: string; // PNG dataURL
}

export interface ZipRequest {
  files: ZipFileEntry[];
  manifest: unknown; // 写入 manifest.json
}

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

self.onmessage = async (e: MessageEvent<ZipRequest>) => {
  try {
    const { files, manifest } = e.data;
    const zip = new JSZip();
    for (const f of files) {
      zip.file(f.name, dataUrlToUint8(f.dataUrl));
    }
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    (self as unknown as Worker).postMessage({ ok: true, blob });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
