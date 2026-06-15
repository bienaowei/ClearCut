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

export type EditorMode = 'brush' | 'crop' | 'retain';

/** 多边形 / 套索：crop 与 retain 模式下的绘制方式 */
export type DrawMethod = 'polygon' | 'lasso';

/** 模式三反向裁剪的导出方式 */
export type RetainExportMode = 'origin' | 'bbox' | 'fixed';

export interface RetainConfig {
  mode: RetainExportMode;
  width: number;
  height: number;
  padding: number;
}
