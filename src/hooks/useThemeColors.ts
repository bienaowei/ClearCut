import { useThemeStore } from '../stores/themeStore';

/**
 * Konva 画布层使用的主题色。
 * react-konva 不读取 CSS 变量，故按当前主题返回一组色值，
 * 与 index.css 中的主题变量保持语义一致。
 */
export interface CanvasColors {
  /** 画笔预览圈 / 中心点 */
  brush: string;
  /** 绘制中草稿多边形描边、套索描边 */
  draftStroke: string;
  /** 草稿多边形半透明填充（含 alpha 后缀） */
  draftFill: string;
  /** 起始顶点 / 边中点强调色 */
  accent: string;
  /** 草稿顶点描边（与背景对比的衬边） */
  vertexStroke: string;
  /** 顶点手柄填充 */
  vertexFill: string;
}

const DARK: CanvasColors = {
  brush: '#ff7a45',
  draftStroke: '#e8453c',
  draftFill: '#e8453c22',
  accent: '#f0a868',
  vertexStroke: '#2a1f1f',
  vertexFill: '#ffffff',
};

const LIGHT: CanvasColors = {
  brush: '#2e7cf6',
  draftStroke: '#2e7cf6',
  draftFill: '#2e7cf622',
  accent: '#5ba8ff',
  vertexStroke: '#ffffff',
  vertexFill: '#ffffff',
};

export function useThemeColors(): CanvasColors {
  const theme = useThemeStore((s) => s.theme);
  return theme === 'light' ? LIGHT : DARK;
}
