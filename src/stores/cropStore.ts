import { create } from 'zustand';
import { produce } from 'immer';
import type { Point, PolygonRegion } from '../types';

/** 多边形自动配色（与主题协调的暖色系轮换） */
const PALETTE = [
  '#e8453c',
  '#f0a868',
  '#d4885a',
  '#ff5c52',
  '#c0392b',
  '#e8a13c',
];

let polygonSeq = 0;

export function createPolygon(
  points: Point[] = [],
  closed = false,
  name?: string,
): PolygonRegion {
  const idx = polygonSeq++;
  return {
    id: `poly_${Date.now()}_${idx}`,
    name: name ?? `物品${idx + 1}`,
    points,
    closed,
    color: PALETTE[idx % PALETTE.length],
  };
}

/** 预填标签条目：key 用作多边形名称，value 仅作提示显示 */
export interface LabelEntry {
  key: string;
  value?: string;
}

interface CropState {
  polygons: PolygonRegion[];
  activePolygonId: string | null;
  /** 预填标签队列，新建多边形时按顺序消费 */
  labels: LabelEntry[];
  /** 队列中下一个待用标签的下标 */
  labelCursor: number;

  setPolygons: (polygons: PolygonRegion[], activeId?: string | null) => void;
  addPolygon: (polygon: PolygonRegion) => void;
  updatePolygon: (id: string, patch: Partial<PolygonRegion>) => void;
  removePolygon: (id: string) => void;
  setActive: (id: string | null) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  clear: () => void;

  /** 设置标签队列并将游标重置为 0 */
  setLabels: (labels: LabelEntry[]) => void;
  clearLabels: () => void;
  /** 查看下一个标签，不消费 */
  peekNextLabel: () => LabelEntry | null;
  /** 取走一个标签并前进游标，返回 key */
  takeNextLabel: () => string | null;
  /** 一次取走最多 n 个标签，返回 key 数组 */
  takeLabels: (n: number) => string[];
}

export const useCropStore = create<CropState>((set, get) => ({
  polygons: [],
  activePolygonId: null,
  labels: [],
  labelCursor: 0,

  setPolygons: (polygons, activeId) =>
    set((s) => ({
      polygons,
      activePolygonId:
        activeId !== undefined ? activeId : s.activePolygonId,
    })),

  addPolygon: (polygon) =>
    set(
      produce((s: CropState) => {
        s.polygons.push(polygon);
        s.activePolygonId = polygon.id;
      }),
    ),

  updatePolygon: (id, patch) =>
    set(
      produce((s: CropState) => {
        const p = s.polygons.find((p) => p.id === id);
        if (p) Object.assign(p, patch);
      }),
    ),

  removePolygon: (id) =>
    set(
      produce((s: CropState) => {
        s.polygons = s.polygons.filter((p) => p.id !== id);
        if (s.activePolygonId === id) s.activePolygonId = null;
      }),
    ),

  setActive: (id) => set({ activePolygonId: id }),

  reorder: (fromIndex, toIndex) =>
    set(
      produce((s: CropState) => {
        const [moved] = s.polygons.splice(fromIndex, 1);
        s.polygons.splice(toIndex, 0, moved);
      }),
    ),

  clear: () => set({ polygons: [], activePolygonId: null }),

  setLabels: (labels) => set({ labels, labelCursor: 0 }),

  clearLabels: () => set({ labels: [], labelCursor: 0 }),

  peekNextLabel: () => {
    const { labels, labelCursor } = get();
    return labelCursor < labels.length ? labels[labelCursor] : null;
  },

  takeNextLabel: () => {
    const { labels, labelCursor } = get();
    if (labelCursor >= labels.length) return null;
    set({ labelCursor: labelCursor + 1 });
    return labels[labelCursor].key;
  },

  takeLabels: (n) => {
    const { labels, labelCursor } = get();
    const end = Math.min(labelCursor + n, labels.length);
    const out = labels.slice(labelCursor, end).map((l) => l.key);
    set({ labelCursor: end });
    return out;
  },
}));
