import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
    // 跨源隔离：启用 SharedArrayBuffer，让 LaMa 多线程 WASM 提速（线上由 vercel.json 配同样的头）。
    // 站内资源（模型、wasm、blob 图片）均同源，不受影响。
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    port: 4173,
    // 与 dev / 线上一致的跨源隔离头，让 `pnpm preview` 也能用多线程 WASM。
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    // 用 classic(iife) 而非 es：ORT 多线程 WASM 的 Emscripten pthread 子 worker
    // 依赖 importScripts，只有 classic 父 worker 里才可用；es module worker 会卡死。
    // 两个 worker(lama/zip)均为纯静态 import、无顶层 await，切 iife 安全。
    format: 'iife',
  },
  // onnxruntime-web 在运行时通过动态 import 从 public/ort/ 加载 wasm 胶水(.mjs)。
  // 若被 Vite 预打包，会给该 URL 加 ?import 查询，导致 public 资源以模块加载失败(500)。
  // 排除预打包后，ORT 用计算路径原生 import，正常命中 public 静态文件。
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
});
