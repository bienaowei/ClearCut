import type { Point } from '../types';
import { getBBox, type BBox } from './polygonMath';

/** 创建一个离屏 canvas */
export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

export function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法获取 2D 上下文');
  return ctx;
}

/**
 * 将原图与 alpha 遮罩合成为透明背景结果。
 * 遮罩中被擦除的区域（destination-out 绘制过）对应透明。
 */
export function compositeWithMask(
  image: HTMLImageElement,
  mask: HTMLCanvasElement | null,
): HTMLCanvasElement {
  const out = createCanvas(image.naturalWidth, image.naturalHeight);
  const ctx = get2d(out);
  ctx.drawImage(image, 0, 0);
  if (mask) {
    // 遮罩里"已擦除"的像素是不透明的标记，用它来 destination-out 抠掉
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  return out;
}

/** 计算 canvas 中非透明像素的内容包围盒，用于自动裁剪 */
export function getContentBBox(canvas: HTMLCanvasElement): BBox | null {
  const ctx = get2d(canvas);
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** 裁剪 canvas 到指定包围盒，返回新 canvas */
export function cropCanvas(canvas: HTMLCanvasElement, bbox: BBox): HTMLCanvasElement {
  const out = createCanvas(bbox.width, bbox.height);
  const ctx = get2d(out);
  ctx.drawImage(
    canvas,
    bbox.x,
    bbox.y,
    bbox.width,
    bbox.height,
    0,
    0,
    bbox.width,
    bbox.height,
  );
  return out;
}

/**
 * 用多边形裁剪原图区域，输出到目标尺寸的 canvas。
 * @param image 原图
 * @param points 多边形顶点（原图坐标）
 * @param target 目标输出尺寸；null 表示按包围盒原始尺寸
 * @param padding 内容到边缘的间距
 */
export function clipPolygonToCanvas(
  image: HTMLImageElement,
  points: Point[],
  target: { width: number; height: number } | null,
  padding = 0,
  maxScale = Infinity,
): HTMLCanvasElement {
  const bbox = getBBox(points);
  // 先在原图坐标系裁出多边形内容
  const clipCanvas = createCanvas(image.naturalWidth, image.naturalHeight);
  const clipCtx = get2d(clipCanvas);
  clipCtx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) clipCtx.moveTo(p.x, p.y);
    else clipCtx.lineTo(p.x, p.y);
  });
  clipCtx.closePath();
  clipCtx.clip();
  clipCtx.drawImage(image, 0, 0);

  // 裁到包围盒
  const content = cropCanvas(clipCanvas, bbox);

  if (!target) return content;

  // 缩放居中到目标尺寸
  const out = createCanvas(target.width, target.height);
  const ctx = get2d(out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const availW = target.width - padding * 2;
  const availH = target.height - padding * 2;
  const scale = Math.min(
    availW / content.width,
    availH / content.height,
    maxScale,
  );
  const drawW = content.width * scale;
  const drawH = content.height * scale;
  const dx = (target.width - drawW) / 2;
  const dy = (target.height - drawH) / 2;
  ctx.drawImage(content, dx, dy, drawW, drawH);
  return out;
}
