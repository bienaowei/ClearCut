import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { useCropStore, createPolygon } from '../stores/cropStore';
import { distance, simplifyPath } from '../utils/polygonMath';
import { useHistory } from './useHistory';

/** 关闭多边形时，点击起点的命中阈值（屏幕像素） */
const CLOSE_HIT_PX = 12;
/** 套索采点的最小屏幕间距（屏幕像素），避免点过密 */
const LASSO_MIN_DIST_PX = 4;
/** 套索结束后路径简化容差（屏幕像素），换算到原图坐标后使用 */
const LASSO_SIMPLIFY_PX = 2;

/**
 * 多边形绘制交互（裁剪/保留模式共用）。
 * 两种模式均可创建多个多边形：
 * - crop 模式：每个多边形各自导出
 * - retain 模式：所有多边形内部保留，外部透明
 */
export function usePolygon() {
  const mode = useEditorStore((s) => s.mode);
  const zoom = useEditorStore((s) => s.zoom);
  const drawMethod = useEditorStore((s) => s.drawMethod);
  const { commitPolygons } = useHistory();

  const addPolygon = useCropStore((s) => s.addPolygon);
  const removePolygon = useCropStore((s) => s.removePolygon);

  const [draft, setDraft] = useState<Point[]>([]);
  const [hover, setHover] = useState<Point | null>(null);
  const [isLasso, setIsLasso] = useState(false);
  const draftRef = useRef<Point[]>([]);
  draftRef.current = draft;
  const lassoActiveRef = useRef(false);

  /** 将一组顶点提交为闭合多边形（多边形/套索共用） */
  const commitPoints = useCallback(
    (pts: Point[]) => {
      if (pts.length < 3) return false;
      addPolygon(createPolygon(pts, true));
      setDraft([]);
      setHover(null);
      commitPolygons();
      return true;
    },
    [addPolygon, commitPolygons],
  );

  const closeDraft = useCallback(() => {
    commitPoints([...draftRef.current]);
  }, [commitPoints]);

  const handleClick = useCallback(
    (pt: Point) => {
      const pts = draftRef.current;
      if (pts.length === 0) {
        // 开始新多边形
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
    [zoom, closeDraft],
  );

  const handleDblClick = useCallback(() => {
    if (draftRef.current.length >= 3) closeDraft();
  }, [closeDraft]);

  const handleMouseMove = useCallback((pt: Point) => {
    setHover(pt);
  }, []);

  // —— 套索（自由手绘）——
  const lassoBegin = useCallback((pt: Point) => {
    lassoActiveRef.current = true;
    setIsLasso(true);
    setHover(null);
    setDraft([pt]);
  }, []);

  const lassoMove = useCallback(
    (pt: Point) => {
      if (!lassoActiveRef.current) return;
      const pts = draftRef.current;
      const last = pts[pts.length - 1];
      if (last && distance(pt, last) * zoom < LASSO_MIN_DIST_PX) return;
      setDraft([...pts, pt]);
    },
    [zoom],
  );

  const lassoEnd = useCallback(() => {
    if (!lassoActiveRef.current) return;
    lassoActiveRef.current = false;
    setIsLasso(false);
    const simplified = simplifyPath(
      draftRef.current,
      LASSO_SIMPLIFY_PX / zoom,
    );
    if (!commitPoints(simplified)) {
      setDraft([]);
      setHover(null);
    }
  }, [zoom, commitPoints]);

  const cancelDraft = useCallback(() => {
    lassoActiveRef.current = false;
    setIsLasso(false);
    setDraft([]);
    setHover(null);
  }, []);

  // 切换绘制方式 / 模式时，丢弃未完成的草稿
  useEffect(() => {
    cancelDraft();
  }, [drawMethod, mode, cancelDraft]);

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
    isLasso,
    handleClick,
    handleDblClick,
    handleMouseMove,
    lassoBegin,
    lassoMove,
    lassoEnd,
    cancelDraft,
  };
}
