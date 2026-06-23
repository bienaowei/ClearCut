import { create } from 'zustand';
import type {
  BrushTool,
  DrawMethod,
  EditorMode,
  ExportConfig,
  Point,
  RetainConfig,
} from '../types';

interface EditorState {
  mode: EditorMode;
  /** crop / retain 模式下的绘制方式：逐点多边形 or 自由套索 */
  drawMethod: DrawMethod;
  image: HTMLImageElement | null;
  imageName: string;
  /** 画布缩放比例（显示坐标 = 原图坐标 * zoom） */
  zoom: number;
  /** 画布平移偏移（屏幕像素） */
  offset: Point;
  /** 光标在原图坐标系下的位置（状态栏用） */
  cursor: Point | null;
  /** 魔术棒点击反馈：每次点击递增 id，触发画布上的扩散动画 */
  wandFlash: { x: number; y: number; id: number } | null;

  // 画笔参数
  brushTool: BrushTool; // 画笔 / 魔术棒
  brushSize: number;
  brushHardness: number; // 0(软) ~ 1(硬)

  // 魔术棒参数
  wandTolerance: number; // 0~100，容差
  wandContiguous: boolean; // true=仅连通区域，false=全图同色

  // 点选裁剪参数：alpha > 阈值 视为实心像素（0~255）
  pickAlphaThreshold: number;

  exportConfig: ExportConfig;
  retainConfig: RetainConfig;

  /** 是否正在导出（用于按钮转圈/禁用，避免重复点击重复建 Worker） */
  isExporting: boolean;

  setMode: (mode: EditorMode) => void;
  setDrawMethod: (method: DrawMethod) => void;
  setImage: (image: HTMLImageElement | null, name?: string) => void;
  setZoom: (zoom: number) => void;
  setOffset: (offset: Point) => void;
  setCursor: (cursor: Point | null) => void;
  triggerWandFlash: (pt: Point) => void;
  setBrushTool: (tool: BrushTool) => void;
  setBrushSize: (size: number) => void;
  setBrushHardness: (hardness: number) => void;
  setWandTolerance: (tolerance: number) => void;
  setWandContiguous: (contiguous: boolean) => void;
  setPickAlphaThreshold: (threshold: number) => void;
  setExportConfig: (patch: Partial<ExportConfig>) => void;
  setRetainConfig: (patch: Partial<RetainConfig>) => void;
  setExporting: (isExporting: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  mode: 'brush',
  drawMethod: 'polygon',
  image: null,
  imageName: 'image',
  zoom: 1,
  offset: { x: 0, y: 0 },
  cursor: null,
  wandFlash: null,

  brushTool: 'brush',
  brushSize: 30,
  brushHardness: 1,

  wandTolerance: 30,
  wandContiguous: true,

  pickAlphaThreshold: 10,

  exportConfig: { mode: 'adaptive', width: 100, height: 100, padding: 0 },
  retainConfig: { mode: 'origin', width: 100, height: 100, padding: 0 },

  isExporting: false,

  setMode: (mode) =>
    set((s) => ({
      mode,
      // pick 仅在 crop 模式有效，切到其他模式时回退到多边形
      drawMethod:
        mode !== 'crop' && s.drawMethod === 'pick' ? 'polygon' : s.drawMethod,
    })),
  setDrawMethod: (drawMethod) => set({ drawMethod }),
  setImage: (image, name) =>
    set((s) => ({ image, imageName: name ?? s.imageName })),
  setZoom: (zoom) => set({ zoom }),
  setOffset: (offset) => set({ offset }),
  setCursor: (cursor) => set({ cursor }),
  triggerWandFlash: (pt) =>
    set((s) => ({
      wandFlash: { x: pt.x, y: pt.y, id: (s.wandFlash?.id ?? 0) + 1 },
    })),
  setBrushTool: (brushTool) => set({ brushTool }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setBrushHardness: (brushHardness) => set({ brushHardness }),
  setWandTolerance: (wandTolerance) => set({ wandTolerance }),
  setWandContiguous: (wandContiguous) => set({ wandContiguous }),
  setPickAlphaThreshold: (pickAlphaThreshold) => set({ pickAlphaThreshold }),
  setExportConfig: (patch) =>
    set((s) => ({ exportConfig: { ...s.exportConfig, ...patch } })),
  setRetainConfig: (patch) =>
    set((s) => ({ retainConfig: { ...s.retainConfig, ...patch } })),
  setExporting: (isExporting) => set({ isExporting }),
}));
