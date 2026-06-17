import { useCallback, useRef } from 'react';
import type { Point } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { brushEngine } from '../utils/brushEngine';
import { useHistory } from './useHistory';

/**
 * 画笔交互逻辑：按下开始、移动连线、抬起结束并存快照。
 * 接收的点均为原图坐标。
 */
export function useBrush() {
  const brushTool = useEditorStore((s) => s.brushTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const brushHardness = useEditorStore((s) => s.brushHardness);
  const { commitBrush } = useHistory();

  const drawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);

  const mode: 'erase' | 'restore' = brushTool === 'restore' ? 'restore' : 'erase';

  const begin = useCallback(
    (pt: Point) => {
      if (!brushEngine.ready) return;
      drawing.current = true;
      lastPoint.current = pt;
      // 起点也擦/恢复一下（单击点也生效）
      brushEngine.paintSegment(pt, pt, brushSize, brushHardness, mode);
    },
    [brushSize, brushHardness, mode],
  );

  const move = useCallback(
    (pt: Point) => {
      if (!drawing.current || !lastPoint.current) return;
      brushEngine.paintSegment(
        lastPoint.current,
        pt,
        brushSize,
        brushHardness,
        mode,
      );
      lastPoint.current = pt;
    },
    [brushSize, brushHardness, mode],
  );

  const end = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    commitBrush();
  }, [commitBrush]);

  return { begin, move, end, isDrawing: drawing };
}
