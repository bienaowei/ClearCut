import { create } from 'zustand';
import type { PolygonRegion } from '../types';

const MAX_STEPS = 30;

/** 撤销/重做快照：不同模式携带不同 payload */
export type HistorySnapshot =
  | { kind: 'brush'; mask: ImageData | null }
  | {
      kind: 'polygons';
      polygons: PolygonRegion[];
      activePolygonId: string | null;
    };

interface HistoryState {
  stack: HistorySnapshot[];
  index: number;
  /** 提交一个新的检查点（代表某次操作完成后的状态） */
  commit: (snapshot: HistorySnapshot) => void;
  /** 重置历史栈，通常在加载新图片 / 切换模式时调用 */
  reset: (initial?: HistorySnapshot) => void;
  undo: () => HistorySnapshot | null;
  redo: () => HistorySnapshot | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  stack: [],
  index: -1,

  commit: (snapshot) =>
    set((state) => {
      // 截断当前 index 之后的 redo 分支
      let nextStack = state.stack.slice(0, state.index + 1);
      nextStack.push(snapshot);
      // 限制栈深度，丢弃最早记录
      if (nextStack.length > MAX_STEPS) {
        nextStack = nextStack.slice(nextStack.length - MAX_STEPS);
      }
      return { stack: nextStack, index: nextStack.length - 1 };
    }),

  reset: (initial) =>
    set(() =>
      initial
        ? { stack: [initial], index: 0 }
        : { stack: [], index: -1 },
    ),

  undo: () => {
    const { index, stack } = get();
    if (index <= 0) return null;
    const nextIndex = index - 1;
    set({ index: nextIndex });
    return stack[nextIndex];
  },

  redo: () => {
    const { index, stack } = get();
    if (index >= stack.length - 1) return null;
    const nextIndex = index + 1;
    set({ index: nextIndex });
    return stack[nextIndex];
  },

  canUndo: () => get().index > 0,
  canRedo: () => get().index < get().stack.length - 1,
}));
