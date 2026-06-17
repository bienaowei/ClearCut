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

  // 画笔参数
  brushTool: BrushTool; // 画笔 / 魔术棒
  brushSize: number;
  brushHardness: number; // 0(软) ~ 1(硬)

  // 魔术棒参数
  wandTolerance: number; // 0~100，容差
  wandContiguous: boolean; // true=仅连通区域，false=全图同色

  exportConfig: ExportConfig;
  retainConfig: RetainConfig;

  setMode: (mode: EditorMode) => void;
  setDrawMethod: (method: DrawMethod) => void;
  setImage: (image: HTMLImageElement | null, name?: string) => void;
  setZoom: (zoom: number) => void;
  setOffset: (offset: Point) => void;
  setCursor: (cursor: Point | null) => void;
  setBrushTool: (tool: BrushTool) => void;
  setBrushSize: (size: number) => void;
  setBrushHardness: (hardness: number) => void;
  setWandTolerance: (tolerance: number) => void;
  setWandContiguous: (contiguous: boolean) => void;
  setExportConfig: (patch: Partial<ExportConfig>) => void;
  setRetainConfig: (patch: Partial<RetainConfig>) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  mode: 'brush',
  drawMethod: 'polygon',
  image: null,
  imageName: 'image',
  zoom: 1,
  offset: { x: 0, y: 0 },
  cursor: null,

  brushTool: 'brush',
  brushSize: 30,
  brushHardness: 1,

  wandTolerance: 30,
  wandContiguous: true,

  exportConfig: { mode: 'adaptive', width: 256, height: 256, padding: 0 },
  retainConfig: { mode: 'origin', width: 256, height: 256, padding: 0 },

  setMode: (mode) => set({ mode }),
  setDrawMethod: (drawMethod) => set({ drawMethod }),
  setImage: (image, name) =>
    set((s) => ({ image, imageName: name ?? s.imageName })),
  setZoom: (zoom) => set({ zoom }),
  setOffset: (offset) => set({ offset }),
  setCursor: (cursor) => set({ cursor }),
  setBrushTool: (brushTool) => set({ brushTool }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setBrushHardness: (brushHardness) => set({ brushHardness }),
  setWandTolerance: (wandTolerance) => set({ wandTolerance }),
  setWandContiguous: (wandContiguous) => set({ wandContiguous }),
  setExportConfig: (patch) =>
    set((s) => ({ exportConfig: { ...s.exportConfig, ...patch } })),
  setRetainConfig: (patch) =>
    set((s) => ({ retainConfig: { ...s.retainConfig, ...patch } })),
}));
