import type { Point } from '../types';
import { createCanvas, get2d } from './canvasUtils';

export interface WandOptions {
  /** 颜色容差：种子色到目标色的欧氏距离阈值（0~441） */
  tolerance: number;
  /** true=只去掉与种子连通的区域；false=去掉全图所有相近颜色 */
  contiguous: boolean;
}

/** 把 UI 容差(0~100) 映射为颜色距离阈值。30 ≈ 60，足以覆盖 JPG 噪点/轻微渐变。 */
export function toleranceToDistance(ui: number): number {
  return (ui / 100) * 200;
}

/**
 * 计算"需要擦除"的像素，返回一张标记 canvas：
 * 被判定为背景的像素为不透明黑 (alpha=255)，其余透明。
 * 该 canvas 可直接以 source-over 合并进 brushEngine.maskCanvas，
 * 由 destination-out 把对应像素抠成透明。
 *
 * @param image 原图
 * @param seeds 种子点（原图坐标），可多个（如四角自动去背）
 */
export function computeWandMask(
  image: HTMLImageElement,
  seeds: Point[],
  options: WandOptions,
): HTMLCanvasElement {
  const w = image.naturalWidth;
  const h = image.naturalHeight;

  const src = createCanvas(w, h);
  const sctx = get2d(src);
  sctx.drawImage(image, 0, 0);
  const data = sctx.getImageData(0, 0, w, h).data;

  const tol = options.tolerance;
  const tol2 = tol * tol;
  const removed = new Uint8Array(w * h); // 1=擦除

  // 归一化种子点到合法整数像素，并去重
  const normSeeds = seeds
    .map((p) => ({
      x: Math.min(w - 1, Math.max(0, Math.floor(p.x))),
      y: Math.min(h - 1, Math.max(0, Math.floor(p.y))),
    }))
    .filter((p, i, arr) => arr.findIndex((q) => q.x === p.x && q.y === p.y) === i);

  if (options.contiguous) {
    // 连通漫水：每个种子各用自身颜色作 BFS 基准（四角颜色可不同）
    const visited = new Uint8Array(w * h);
    const stack: number[] = [];
    for (const seed of normSeeds) {
      const si = seed.y * w + seed.x;
      const sr = data[si * 4];
      const sg = data[si * 4 + 1];
      const sb = data[si * 4 + 2];
      if (!within(data, si, sr, sg, sb, tol2)) continue;
      stack.push(si);
      visited[si] = 1;
      while (stack.length) {
        const idx = stack.pop()!;
        removed[idx] = 1;
        const x = idx % w;
        const y = (idx - x) / w;
        // 四邻接
        if (x > 0) tryPush(idx - 1);
        if (x < w - 1) tryPush(idx + 1);
        if (y > 0) tryPush(idx - w);
        if (y < h - 1) tryPush(idx + w);
      }

      function tryPush(n: number) {
        if (visited[n]) return;
        visited[n] = 1;
        if (within(data, n, sr, sg, sb, tol2)) stack.push(n);
      }
    }
  } else {
    // 全局：任一像素只要接近任一种子色即擦除
    const colors = normSeeds.map((s) => {
      const i = (s.y * w + s.x) * 4;
      return [data[i], data[i + 1], data[i + 2]] as const;
    });
    for (let i = 0; i < w * h; i++) {
      for (const [sr, sg, sb] of colors) {
        if (within(data, i, sr, sg, sb, tol2)) {
          removed[i] = 1;
          break;
        }
      }
    }
  }

  // 输出标记 canvas
  const out = createCanvas(w, h);
  const octx = get2d(out);
  const outImg = octx.createImageData(w, h);
  const od = outImg.data;
  for (let i = 0; i < removed.length; i++) {
    if (removed[i]) od[i * 4 + 3] = 255; // 黑色不透明
  }
  octx.putImageData(outImg, 0, 0);
  return out;
}

/** 像素 idx 的颜色与 (sr,sg,sb) 的平方距离是否 ≤ 阈值 */
function within(
  data: Uint8ClampedArray,
  idx: number,
  sr: number,
  sg: number,
  sb: number,
  tol2: number,
): boolean {
  const o = idx * 4;
  const dr = data[o] - sr;
  const dg = data[o + 1] - sg;
  const db = data[o + 2] - sb;
  return dr * dr + dg * dg + db * db <= tol2;
}
