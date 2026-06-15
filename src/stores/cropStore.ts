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

export function createPolygon(points: Point[] = [], closed = false): PolygonRegion {
  const idx = polygonSeq++;
  return {
    id: `poly_${Date.now()}_${idx}`,
    name: `物品${idx + 1}`,
    points,
    closed,
    color: PALETTE[idx % PALETTE.length],
  };
}

interface CropState {
  polygons: PolygonRegion[];
  activePolygonId: string | null;

  setPolygons: (polygons: PolygonRegion[], activeId?: string | null) => void;
  addPolygon: (polygon: PolygonRegion) => void;
  updatePolygon: (id: string, patch: Partial<PolygonRegion>) => void;
  removePolygon: (id: string) => void;
  setActive: (id: string | null) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  clear: () => void;
}

export const useCropStore = create<CropState>((set) => ({
  polygons: [],
  activePolygonId: null,

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
}));
