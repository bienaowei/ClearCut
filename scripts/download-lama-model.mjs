// 下载 LaMa inpainting ONNX 权重到 public/models/lama/，供智能消除（擦除+背景填充）自托管。
// 用法：
//   pnpm lama:download             # 走 HuggingFace 官方
//   HF_MIRROR=1 pnpm lama:download # 走 hf-mirror.com 镜像（国内更稳）
//
// 注意：lama_fp32.onnx 约 208MB，超过 GitHub 单文件 100MB 上限，默认 .gitignore，
//      仅本地保留。若要部署，需把它托管到外部（OSS / R2 / HF）再调整 lamaConfig。
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const REPO = 'Carve/LaMa-ONNX';
const FILE = 'lama_fp32.onnx'; // opset17，Carve 官方推荐版本
const HOST = process.env.HF_MIRROR ? 'https://hf-mirror.com' : 'https://huggingface.co';
const OUT_DIR = join(process.cwd(), 'public', 'models', 'lama');

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const dest = join(OUT_DIR, FILE);
  if (await exists(dest)) {
    console.log(`✓ 已存在 ${FILE}，跳过`);
    return;
  }
  const url = `${HOST}/${REPO}/resolve/main/${FILE}`;
  console.log(`从 ${url} 下载（约 208MB，请耐心等待）…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${FILE}: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log(`↓ ${FILE} (${(buf.length / 1e6).toFixed(1)} MB) → public/models/lama/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
