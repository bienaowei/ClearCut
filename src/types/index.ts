export interface Point {
  x: number;
  y: number;
}

export interface PolygonRegion {
  id: string;
  name: string;
  points: Point[]; // 顶点坐标（相对于原图像素）
  closed: boolean;
  color: string; // 显示颜色（自动分配）
}

export type ExportSizeMode = 'fixed' | 'adaptive' | 'original';

export interface ExportConfig {
  mode: ExportSizeMode;
  width: number; // fixed 模式下的目标宽度
  height: number; // fixed 模式下的目标高度
  padding: number; // 内容到边缘的间距
}

export interface CropResult {
  polygon: PolygonRegion;
  dataUrl: string;
  width: number;
  height: number;
}

export type EditorMode = 'brush' | 'crop' | 'retain' | 'inpaint';

/** 智能消除（擦除 + 背景填充）引擎状态 */
export type InpaintStatus = 'idle' | 'loading' | 'running' | 'error';

/** 智能消除的选区工具：手动画笔涂抹 / SAM 智能点选 */
export type InpaintTool = 'brush' | 'sam';

/** 画笔模式下的子工具：手动画笔 / 魔术棒一键去背 / 恢复画笔 */
export type BrushTool = 'brush' | 'wand' | 'restore';

/**
 * 绘制方式：crop 与 retain 模式下共用。
 * pick 仅用于 crop；sam（SAM 智能点选）仅用于 retain。
 */
export type DrawMethod = 'polygon' | 'lasso' | 'pick' | 'sam';

/** SAM 引擎状态（驱动加载/编码/分割中的 UI 提示） */
export type SamStatus =
  | 'idle'
  | 'loading-model'
  | 'encoding'
  | 'ready'
  | 'segmenting'
  | 'error';

/** SAM 点击提示点：图像坐标 + 标签（1=正点保留，0=负点排除） */
export interface SamPoint {
  x: number;
  y: number;
  label: 0 | 1;
}

/** 模式三反向裁剪的导出方式 */
export type RetainExportMode = 'origin' | 'bbox' | 'fixed';

export interface RetainConfig {
  mode: RetainExportMode;
  width: number;
  height: number;
  padding: number;
}
