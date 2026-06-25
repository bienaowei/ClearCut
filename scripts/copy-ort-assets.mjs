// 把 onnxruntime-web 的 wasm 运行时拷到 public/ort/，供 LaMa 推理本地加载。
// 与自托管 SAM 模型同思路：不依赖外部 CDN，国内网络也能稳定加载。
// 在 postinstall 与 build 前自动执行；也可手动 `pnpm ort:assets`。
import { createRequire } from 'node:module';
import { mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

async function main() {
  // 解析已安装的 onnxruntime-web 的 dist 目录（pnpm 软链也能正确定位）
  const mainEntry = require.resolve('onnxruntime-web');
  const distDir = dirname(mainEntry);
  const outDir = join(process.cwd(), 'public', 'ort');
  await mkdir(outDir, { recursive: true });

  const files = await readdir(distDir);
  // 运行时只需 wasm 二进制及其 JS 胶水（.mjs）。其余打包产物不拷。
  const wanted = files.filter(
    (f) => /^ort-wasm.*\.(wasm|mjs)$/.test(f),
  );
  if (wanted.length === 0) {
    console.warn('[ort:assets] 未在', distDir, '找到 ort-wasm-* 文件');
    return;
  }
  for (const f of wanted) {
    const src = join(distDir, f);
    const dest = join(outDir, f);
    await copyFile(src, dest);
    const { size } = await stat(dest);
    console.log(`↳ ${f} (${(size / 1e6).toFixed(1)} MB)`);
  }
  console.log(`[ort:assets] 完成 → public/ort/（${wanted.length} 个文件）`);
}

main().catch((err) => {
  console.error('[ort:assets] 失败：', err);
  process.exit(1);
});
