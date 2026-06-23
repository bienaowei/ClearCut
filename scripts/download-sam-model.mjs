// 下载 SlimSAM 模型到 public/models 供自托管（VITE_SAM_MODEL_SOURCE=local）。
// 用法：
//   pnpm sam:download            # 走 HuggingFace 官方
//   HF_MIRROR=1 pnpm sam:download # 走 hf-mirror.com 镜像（国内更稳）
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MODEL_ID = 'Xenova/slimsam-77-uniform';
const HOST = process.env.HF_MIRROR ? 'https://hf-mirror.com' : 'https://huggingface.co';
const OUT_ROOT = join(process.cwd(), 'public', 'models', MODEL_ID);

async function listFiles() {
  const res = await fetch(`${HOST}/api/models/${MODEL_ID}`);
  if (!res.ok) throw new Error(`列出文件失败: ${res.status} ${res.statusText}`);
  const info = await res.json();
  return (info.siblings ?? []).map((s) => s.rfilename);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function download(file) {
  const dest = join(OUT_ROOT, file);
  if (await exists(dest)) {
    console.log(`✓ 已存在 ${file}`);
    return;
  }
  const url = `${HOST}/${MODEL_ID}/resolve/main/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${file}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log(`↓ ${file} (${(buf.length / 1e6).toFixed(1)} MB)`);
}

async function main() {
  console.log(`从 ${HOST} 下载 ${MODEL_ID} → public/models/`);
  const files = await listFiles();
  // 只取运行所需：配置 + onnx 权重，跳过 .md / .gitattributes 等
  const wanted = files.filter(
    (f) => f.endsWith('.json') || f.endsWith('.onnx') || f.endsWith('.txt'),
  );
  for (const f of wanted) await download(f);
  console.log('完成。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
