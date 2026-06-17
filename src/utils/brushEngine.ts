import type { Point } from '../types';
import { createCanvas, get2d } from './canvasUtils';
import { computeWandMask, type WandOptions } from './magicWand';

/**
 * 画笔引擎（模块级单例）。
 * - maskCanvas：记录被擦除区域（不透明标记），用于撤销快照与导出。
 * - displayCanvas：原图应用 destination-out 后的实时显示结果。
 *
 * 不进入 React 响应式状态，避免序列化/性能问题。
 */
class BrushEngine {
  private image: HTMLImageElement | null = null;
  maskCanvas: HTMLCanvasElement | null = null;
  displayCanvas: HTMLCanvasElement | null = null;
  /** 显示层刷新回调（由 BrushLayer 注册，触发 Konva 重绘） */
  onChange: (() => void) | null = null;

  init(image: HTMLImageElement) {
    this.image = image;
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    this.maskCanvas = createCanvas(w, h);
    this.displayCanvas = createCanvas(w, h);
    this.rebuildDisplay();
  }

  dispose() {
    this.image = null;
    this.maskCanvas = null;
    this.displayCanvas = null;
  }

  get ready() {
    return !!(this.image && this.maskCanvas && this.displayCanvas);
  }

  /** 用当前 mask 重建 displayCanvas（撤销/重做后调用） */
  rebuildDisplay() {
    if (!this.image || !this.displayCanvas || !this.maskCanvas) return;
    const ctx = get2d(this.displayCanvas);
    ctx.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.image, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(this.maskCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    this.onChange?.();
  }

  /**
   * 画一段笔画（两点之间），同步擦除 displayCanvas 并在 mask 上记录。
   * @param from 起点（原图坐标）
   * @param to 终点（原图坐标）
   * @param size 画笔直径（原图像素）
   * @param hardness 0(软) ~ 1(硬)
   */
  paintSegment(from: Point, to: Point, size: number, hardness: number) {
    if (!this.maskCanvas || !this.displayCanvas) return;
    const radius = size / 2;
    // 路径插值补点，防止快速移动断线
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const step = Math.max(1, radius * 0.4);
    const count = Math.max(1, Math.ceil(dist / step));

    const maskCtx = get2d(this.maskCanvas);
    const dispCtx = get2d(this.displayCanvas);

    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      this.stampDab(maskCtx, x, y, radius, hardness, 'source-over');
      this.stampDab(dispCtx, x, y, radius, hardness, 'destination-out');
    }
    this.onChange?.();
  }

  private stampDab(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    hardness: number,
    op: GlobalCompositeOperation,
  ) {
    ctx.save();
    ctx.globalCompositeOperation = op;
    if (hardness >= 0.999) {
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 软边：径向渐变，hardness 控制实心核心比例
      const grad = ctx.createRadialGradient(x, y, radius * hardness, x, y, radius);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * 魔术棒 / 一键去背：从种子点漫水识别背景并合并进 mask（擦成透明）。
   * 复用画笔的 maskCanvas，因此撤销/重做、导出、后续画笔补刀全部自动生效。
   * 调用方负责在成功后存一次历史快照。
   * @returns 是否产生了有效擦除
   */
  magicErase(seeds: Point[], options: WandOptions): boolean {
    if (!this.image || !this.maskCanvas) return false;
    const eraseCanvas = computeWandMask(this.image, seeds, options);
    const ctx = get2d(this.maskCanvas);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(eraseCanvas, 0, 0);
    this.rebuildDisplay();
    return true;
  }

  /** 导出 mask 的快照（撤销栈用） */
  snapshot(): ImageData | null {
    if (!this.maskCanvas) return null;
    const ctx = get2d(this.maskCanvas);
    return ctx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
  }

  /** 从快照恢复 mask，并重建显示 */
  restore(snapshot: ImageData | null) {
    if (!this.maskCanvas) return;
    const ctx = get2d(this.maskCanvas);
    ctx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    if (snapshot) ctx.putImageData(snapshot, 0, 0);
    this.rebuildDisplay();
  }

  /** 是否有任何擦除痕迹 */
  hasMask(): boolean {
    if (!this.maskCanvas) return false;
    const ctx = get2d(this.maskCanvas);
    const { width, height } = this.maskCanvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true;
    }
    return false;
  }
}

export const brushEngine = new BrushEngine();
