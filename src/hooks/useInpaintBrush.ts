import { useCallback, useRef } from 'react';
import type { Point } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { inpaintMaskEngine } from '../utils/inpaintMaskEngine';

/**
 * 智能消除的涂抹交互：按下开始、移动连线、抬起结束。
 * 只往涂抹掩码上标记「要擦除」的区域，不触发推理（推理由面板「消除」按钮触发）。
 */
export function useInpaintBrush() {
  const brushSize = useEditorStore((s) => s.inpaintBrushSize);
  const bumpInpaintMask = useEditorStore((s) => s.bumpInpaintMask);
  const drawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);

  const begin = useCallback(
    (pt: Point) => {
      if (!inpaintMaskEngine.ready) return;
      drawing.current = true;
      lastPoint.current = pt;
      inpaintMaskEngine.paintSegment(pt, pt, brushSize);
    },
    [brushSize],
  );

  const move = useCallback(
    (pt: Point) => {
      if (!drawing.current || !lastPoint.current) return;
      inpaintMaskEngine.paintSegment(lastPoint.current, pt, brushSize);
      lastPoint.current = pt;
    },
    [brushSize],
  );

  const end = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    bumpInpaintMask();
  }, [bumpInpaintMask]);

  return { begin, move, end, isDrawing: drawing };
}
