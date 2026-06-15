import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { useCropStore, createPolygon } from '../stores/cropStore';
import { distance } from '../utils/polygonMath';
import { useHistory } from './useHistory';

/** 关闭多边形时，点击起点的命中阈值（屏幕像素） */
const CLOSE_HIT_PX = 12;

/**
 * 多边形绘制交互（裁剪/保留模式共用）。
 * - crop 模式：可创建多个多边形
 * - retain 模式：仅保留一个，新建替换旧的
 */
export function usePolygon() {
  const mode = useEditorStore((s) => s.mode);
  const zoom = useEditorStore((s) => s.zoom);
  const { commitPolygons } = useHistory();

  const addPolygon = useCropStore((s) => s.addPolygon);
  const removePolygon = useCropStore((s) => s.removePolygon);
  const setActive = useCropStore((s) => s.setActive);
  const clear = useCropStore((s) => s.clear);

  const [draft, setDraft] = useState<Point[]>([]);
  const [hover, setHover] = useState<Point | null>(null);
  const draftRef = useRef<Point[]>([]);
  draftRef.current = draft;

  const closeDraft = useCallback(() => {
    const pts = draftRef.current;
    if (pts.length < 3) return;
    if (mode === 'retain') clear(); // 单个多边形，替换旧的
    const poly = createPolygon([...pts], true);
    addPolygon(poly);
    setDraft([]);
    setHover(null);
    commitPolygons();
  }, [mode, addPolygon, clear, commitPolygons]);

  const handleClick = useCallback(
    (pt: Point) => {
      const pts = draftRef.current;
      if (pts.length === 0) {
        // 开始新多边形
        if (mode === 'retain') {
          setActive(null);
        }
        setDraft([pt]);
        return;
      }
      // 点击起点附近 → 闭合
      const start = pts[0];
      if (pts.length >= 3 && distance(pt, start) * zoom <= CLOSE_HIT_PX) {
        closeDraft();
        return;
      }
      setDraft([...pts, pt]);
    },
    [mode, zoom, setActive, closeDraft],
  );

  const handleDblClick = useCallback(() => {
    if (draftRef.current.length >= 3) closeDraft();
  }, [closeDraft]);

  const handleMouseMove = useCallback((pt: Point) => {
    setHover(pt);
  }, []);

  const cancelDraft = useCallback(() => {
    setDraft([]);
    setHover(null);
  }, []);

  // 键盘：ESC 取消绘制；Delete 删除选中多边形
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable)
          return;
      }
      if (e.key === 'Escape') {
        if (draftRef.current.length > 0) {
          e.preventDefault();
          cancelDraft();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeId = useCropStore.getState().activePolygonId;
        if (activeId && draftRef.current.length === 0) {
          e.preventDefault();
          removePolygon(activeId);
          commitPolygons();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelDraft, removePolygon, commitPolygons]);

  const isDrawing = draft.length > 0;

  return {
    draft,
    hover,
    isDrawing,
    handleClick,
    handleDblClick,
    handleMouseMove,
    cancelDraft,
  };
}
