import type { Point } from '../types';
import type { SamMaskResult } from './samEngine';
import { createCanvas, get2d } from './canvasUtils';

/** overlay 画布里存纯红（不透明）；半透明由显示层 Konva opacity 控制 */
const OVERLAY_COLOR = 'rgb(239, 68, 68)';
/** 红色预览在画布上的显示透明度，供显示层引用，保持单一来源 */
export const INPAINT_OVERLAY_OPACITY = 0.45;

/**
 * 智能消除的「涂抹掩码」引擎（模块级单例）。
 *
 * - maskCanvas：用户涂抹标记的「要擦除」区域（不透明=擦除），喂给 LaMa。
 * - overlayCanvas：画布预览层，把掩码渲染成半透明红色，提示将被消除的范围。
 *
 * 与 brushEngine / keepMaskEngine 同构：不进 React 状态，靠 onChange 通知重绘。
 * 仅负责「这次要擦哪」；擦除结果（替换原图）由 useInpaint 管理，互不耦合，
 * 因此完全不影响画笔 / 裁剪 / 保留三种既有模式。
 */
class InpaintMaskEngine {
  maskCanvas: HTMLCanvasElement | null = null;
  overlayCanvas: HTMLCanvasElement | null = null;
  private width = 0;
  private height = 0;
  onChange: (() => void) | null = null;

  init(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.maskCanvas = createCanvas(width, height);
    this.overlayCanvas = createCanvas(width, height);
    this.rebuildOverlay();
  }

  dispose() {
    this.maskCanvas = null;
    this.overlayCanvas = null;
    this.width = 0;
    this.height = 0;
  }

  get ready() {
    return !!(this.maskCanvas && this.overlayCanvas);
  }

  /** 画一段笔画（两点间插值），在掩码上标记擦除区域 */
  paintSegment(from: Point, to: Point, size: number) {
    if (!this.maskCanvas || !this.overlayCanvas) return;
    const radius = size / 2;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const step = Math.max(1, radius * 0.4);
    const count = Math.max(1, Math.ceil(dist / step));
    const ctx = get2d(this.maskCanvas);
    const oCtx = get2d(this.overlayCanvas);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    // overlay 存纯红（不透明），半透明效果交给 Konva 的 opacity，
    // 这样重叠笔触不会逐次叠暗，也无需逐帧重建——成本只与笔画长度相关。
    oCtx.globalCompositeOperation = 'source-over';
    oCtx.fillStyle = OVERLAY_COLOR;
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      oCtx.beginPath();
      oCtx.arc(x, y, radius, 0, Math.PI * 2);
      oCtx.fill();
    }
    this.onChange?.();
  }

  /** 把一次 SAM 分割结果（0/255 二值掩码）并入擦除掩码 */
  addMask(mask: SamMaskResult) {
    if (!this.maskCanvas) return;
    const tmp = createCanvas(mask.width, mask.height);
    const id = new ImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) {
      if (mask.data[i]) id.data[i * 4 + 3] = 255; // 不透明黑=擦除标记
    }
    get2d(tmp).putImageData(id, 0, 0);
    const ctx = get2d(this.maskCanvas);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tmp, 0, 0, this.width, this.height);
    this.rebuildOverlay();
  }

  clear() {
    if (!this.maskCanvas) return;
    get2d(this.maskCanvas).clearRect(0, 0, this.width, this.height);
    this.rebuildOverlay();
  }

  hasMask(): boolean {
    if (!this.maskCanvas) return false;
    const data = get2d(this.maskCanvas).getImageData(
      0,
      0,
      this.width,
      this.height,
    ).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true;
    }
    return false;
  }

  /**
   * 按当前掩码整幅重建红色预览（纯红，透明度由显示层控制）。
   * 仅在整体变更时调用（clear / addMask）；涂抹时不走这里，改为逐点增量 stamp。
   */
  private rebuildOverlay() {
    const o = this.overlayCanvas;
    if (!o || !this.maskCanvas) return;
    const ctx = get2d(o);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.width, this.height);
    // 在掩码形状内填充纯红
    ctx.drawImage(this.maskCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = OVERLAY_COLOR;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'source-over';
    this.onChange?.();
  }
}

export const inpaintMaskEngine = new InpaintMaskEngine();
