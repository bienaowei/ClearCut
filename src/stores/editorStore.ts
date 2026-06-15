import { create } from 'zustand';
import type {
  EditorMode,
  ExportConfig,
  Point,
  RetainConfig,
} from '../types';

interface EditorState {
  mode: EditorMode;
  image: HTMLImageElement | null;
  imageName: string;
  /** 画布缩放比例（显示坐标 = 原图坐标 * zoom） */
  zoom: number;
  /** 画布平移偏移（屏幕像素） */
  offset: Point;
  /** 光标在原图坐标系下的位置（状态栏用） */
  cursor: Point | null;

  // 画笔参数
  brushSize: number;
  brushHardness: number; // 0(软) ~ 1(硬)

  exportConfig: ExportConfig;
  retainConfig: RetainConfig;

  setMode: (mode: EditorMode) => void;
  setImage: (image: HTMLImageElement | null, name?: string) => void;
  setZoom: (zoom: number) => void;
  setOffset: (offset: Point) => void;
  setCursor: (cursor: Point | null) => void;
  setBrushSize: (size: number) => void;
  setBrushHardness: (hardness: number) => void;
  setExportConfig: (patch: Partial<ExportConfig>) => void;
  setRetainConfig: (patch: Partial<RetainConfig>) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  mode: 'brush',
  image: null,
  imageName: 'image',
  zoom: 1,
  offset: { x: 0, y: 0 },
  cursor: null,

  brushSize: 30,
  brushHardness: 1,

  exportConfig: { mode: 'adaptive', width: 256, height: 256, padding: 0 },
  retainConfig: { mode: 'origin', width: 256, height: 256, padding: 0 },

  setMode: (mode) => set({ mode }),
  setImage: (image, name) =>
    set((s) => ({ image, imageName: name ?? s.imageName })),
  setZoom: (zoom) => set({ zoom }),
  setOffset: (offset) => set({ offset }),
  setCursor: (cursor) => set({ cursor }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setBrushHardness: (brushHardness) => set({ brushHardness }),
  setExportConfig: (patch) =>
    set((s) => ({ exportConfig: { ...s.exportConfig, ...patch } })),
  setRetainConfig: (patch) =>
    set((s) => ({ retainConfig: { ...s.retainConfig, ...patch } })),
}));
