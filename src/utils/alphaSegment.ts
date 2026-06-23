import type { Point } from '../types';
import type { BBox } from './polygonMath';
import { createCanvas, get2d } from './canvasUtils';

/** 把图片画到离屏画布并取出像素数据（含 alpha 通道） */
function readPixels(image: HTMLImageElement): {
  data: Uint8ClampedArray;
  w: number;
  h: number;
} {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const c = createCanvas(w, h);
  const ctx = get2d(c);
  ctx.drawImage(image, 0, 0);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/** BBox 转矩形多边形顶点（顺时针，与裁剪管线一致） */
export function bboxToRectPoints(b: BBox): Point[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ];
}

/**
 * 从点击点出发，对 alpha 通道做四邻接漫水，返回该不透明连通块的包围盒。
 * alpha > threshold 视为实心像素。点到透明处（或越界）返回 null。
 */
export function floodSelectBBox(
  image: HTMLImageElement,
  pt: Point,
  threshold: number,
): BBox | null {
  const { data, w, h } = readPixels(image);
  const x0 = Math.floor(pt.x);
  const y0 = Math.floor(pt.y);
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return null;

  const start = y0 * w + x0;
  if (data[start * 4 + 3] <= threshold) return null;

  const visited = new Uint8Array(w * h);
  const stack: number[] = [start];
  visited[start] = 1;
  let minX = x0;
  let minY = y0;
  let maxX = x0;
  let maxY = y0;

  const tryPush = (n: number) => {
    if (visited[n]) return;
    visited[n] = 1;
    if (data[n * 4 + 3] > threshold) stack.push(n);
  };

  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x > 0) tryPush(idx - 1);
    if (x < w - 1) tryPush(idx + 1);
    if (y > 0) tryPush(idx - w);
    if (y < h - 1) tryPush(idx + w);
  }

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * 扫描整图，按 alpha 通道把所有不透明连通块各自切出包围盒。
 * 面积小于 minArea（像素数）的连通块视为噪点丢弃。
 * 返回结果按从上到下、从左到右排序，便于命名。
 */
export function segmentAllBBoxes(
  image: HTMLImageElement,
  threshold: number,
  minArea: number,
): BBox[] {
  const { data, w, h } = readPixels(image);
  const visited = new Uint8Array(w * h);
  const out: BBox[] = [];
  const stack: number[] = [];

  for (let s = 0; s < w * h; s++) {
    if (visited[s] || data[s * 4 + 3] <= threshold) continue;

    stack.length = 0;
    stack.push(s);
    visited[s] = 1;
    let area = 0;
    let minX = s % w;
    let minY = (s - (s % w)) / w;
    let maxX = minX;
    let maxY = minY;

    while (stack.length) {
      const idx = stack.pop()!;
      area++;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const push = (n: number) => {
        if (visited[n]) return;
        visited[n] = 1;
        if (data[n * 4 + 3] > threshold) stack.push(n);
      };
      if (x > 0) push(idx - 1);
      if (x < w - 1) push(idx + 1);
      if (y > 0) push(idx - w);
      if (y < h - 1) push(idx + w);
    }

    if (area >= minArea) {
      out.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });
    }
  }

  // 按行优先排序：先上后下，同高度再从左到右
  out.sort((a, b) => (Math.abs(a.y - b.y) > 16 ? a.y - b.y : a.x - b.x));
  return out;
}
