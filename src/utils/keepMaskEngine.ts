import { createCanvas, get2d } from './canvasUtils';
import type { SamMaskResult } from './samEngine';
import type { Point } from '../types';

/**
 * 保留蒙版引擎（模块级单例），SAM 智能点选用。
 *
 * - keepCanvas：已确认保留的物体并集（alpha 不透明=保留）。
 * - pendingCanvas：当前正在点选、尚未确认的物体掩码。
 * - overlayCanvas：画布预览层 —— 未保留区域压暗、已保留挖空、pending 高亮。
 *
 * 与 brushEngine 一样不进入 React 状态，靠 onChange 通知 Konva 重绘。
 */
class KeepMaskEngine {
  keepCanvas: HTMLCanvasElement | null = null;
  pendingCanvas: HTMLCanvasElement | null = null;
  overlayCanvas: HTMLCanvasElement | null = null;
  private tmp: HTMLCanvasElement | null = null;
  private width = 0;
  private height = 0;
  /** 多边形/套索区域（原图坐标），与 SAM 蒙版取并集一起保留 */
  private polygons: Point[][] = [];
  onChange: (() => void) | null = null;

  init(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.polygons = [];
    this.keepCanvas = createCanvas(width, height);
    this.pendingCanvas = createCanvas(width, height);
    this.overlayCanvas = createCanvas(width, height);
    this.tmp = createCanvas(width, height);
    this.rebuildOverlay();
  }

  dispose() {
    this.keepCanvas = null;
    this.pendingCanvas = null;
    this.overlayCanvas = null;
    this.tmp = null;
    this.polygons = [];
    this.width = 0;
    this.height = 0;
  }

  get ready() {
    return !!(this.keepCanvas && this.pendingCanvas && this.overlayCanvas);
  }

  /** 用一次 SAM 结果替换当前 pending 掩码 */
  setPending(mask: SamMaskResult | null) {
    if (!this.pendingCanvas) return;
    const ctx = get2d(this.pendingCanvas);
    ctx.clearRect(0, 0, this.width, this.height);
    if (mask) {
      ctx.putImageData(maskToImageData(mask), 0, 0);
    }
    this.rebuildOverlay();
  }

  /** 把 pending 合并进 keep 并清空 pending */
  commitPending() {
    if (!this.keepCanvas || !this.pendingCanvas) return;
    const ctx = get2d(this.keepCanvas);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.pendingCanvas, 0, 0);
    get2d(this.pendingCanvas).clearRect(0, 0, this.width, this.height);
    this.rebuildOverlay();
  }

  clearPending() {
    if (!this.pendingCanvas) return;
    get2d(this.pendingCanvas).clearRect(0, 0, this.width, this.height);
    this.rebuildOverlay();
  }

  /** 同步当前多边形/套索区域（仅闭合、≥3 顶点），用于预览与导出取并集 */
  setPolygons(polygons: Point[][]) {
    this.polygons = polygons;
    this.rebuildOverlay();
  }

  hasPending(): boolean {
    return this.pendingCanvas ? canvasHasContent(this.pendingCanvas) : false;
  }

  hasKeep(): boolean {
    return this.keepCanvas ? canvasHasContent(this.keepCanvas) : false;
  }

  /** keep 蒙版快照（撤销栈用） */
  snapshot(): ImageData | null {
    if (!this.keepCanvas) return null;
    return get2d(this.keepCanvas).getImageData(0, 0, this.width, this.height);
  }

  /** 从快照恢复 keep 蒙版（撤销/重做），同时清空 pending */
  restore(snapshot: ImageData | null) {
    if (!this.keepCanvas || !this.pendingCanvas) return;
    const ctx = get2d(this.keepCanvas);
    ctx.clearRect(0, 0, this.width, this.height);
    if (snapshot) ctx.putImageData(snapshot, 0, 0);
    get2d(this.pendingCanvas).clearRect(0, 0, this.width, this.height);
    this.rebuildOverlay();
  }

  /** 是否有任何保留内容（SAM 蒙版 或 多边形区域） */
  hasAny(): boolean {
    return this.hasKeep() || this.polygons.length > 0;
  }

  /** 把 SAM 蒙版与多边形区域并集画成一张 alpha 蒙版 */
  private buildUnionMask(): HTMLCanvasElement {
    const m = createCanvas(this.width, this.height);
    const ctx = get2d(m);
    if (this.keepCanvas) ctx.drawImage(this.keepCanvas, 0, 0);
    this.fillPolygons(ctx, '#ffffff');
    return m;
  }

  /** 导出：原图仅保留（SAM 蒙版 ∪ 多边形）区域，其余透明 */
  composite(image: HTMLImageElement): HTMLCanvasElement {
    const out = createCanvas(this.width, this.height);
    const ctx = get2d(out);
    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this.buildUnionMask(), 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    return out;
  }

  /** 在给定上下文里填充所有多边形（并集路径） */
  private fillPolygons(ctx: CanvasRenderingContext2D, color: string) {
    if (this.polygons.length === 0) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const pts of this.polygons) {
      if (pts.length < 3) continue;
      pts.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
      );
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }

  /** 重建预览叠加层：未保留压暗 + 已保留/pending/多边形区域亮显 + pending 绿色高亮 */
  private rebuildOverlay() {
    const o = this.overlayCanvas;
    if (!o || !this.keepCanvas || !this.pendingCanvas) return;
    const ctx = get2d(o);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.width, this.height);
    // 没有任何保留内容时不压暗，原图正常显示
    if (!this.hasAny() && !this.hasPending()) {
      this.onChange?.();
      return;
    }
    // 整体压暗
    ctx.fillStyle = 'rgba(12, 14, 18, 0.55)';
    ctx.fillRect(0, 0, this.width, this.height);
    // 挖空已保留 + pending + 多边形（这些区域不压暗）
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(this.keepCanvas, 0, 0);
    ctx.drawImage(this.pendingCanvas, 0, 0);
    this.fillPolygons(ctx, '#000000');
    // 叠加色块标识
    ctx.globalCompositeOperation = 'source-over';
    this.drawTint(ctx, this.keepCanvas, 'rgba(74, 222, 128, 0.16)');
    this.drawTint(ctx, this.pendingCanvas, 'rgba(74, 222, 128, 0.42)');
    ctx.globalCompositeOperation = 'source-over';
    this.onChange?.();
  }

  /** 在 mask 形状内填充纯色（用临时画布做 source-in） */
  private drawTint(
    dst: CanvasRenderingContext2D,
    mask: HTMLCanvasElement,
    color: string,
  ) {
    if (!this.tmp) return;
    const t = get2d(this.tmp);
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, this.width, this.height);
    t.drawImage(mask, 0, 0);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = color;
    t.fillRect(0, 0, this.width, this.height);
    t.globalCompositeOperation = 'source-over';
    dst.drawImage(this.tmp, 0, 0);
  }
}

/** SAM 二值掩码 → 半透明绿色 ImageData（仅 alpha 有效，颜色仅占位） */
function maskToImageData(mask: SamMaskResult): ImageData {
  const { data, width, height } = mask;
  const out = new ImageData(width, height);
  const px = out.data;
  for (let i = 0; i < data.length; i++) {
    const a = data[i];
    if (a) {
      px[i * 4] = 74;
      px[i * 4 + 1] = 222;
      px[i * 4 + 2] = 128;
      px[i * 4 + 3] = 255;
    }
  }
  return out;
}

function canvasHasContent(canvas: HTMLCanvasElement): boolean {
  const ctx = get2d(canvas);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return true;
  }
  return false;
}

export const keepMaskEngine = new KeepMaskEngine();
