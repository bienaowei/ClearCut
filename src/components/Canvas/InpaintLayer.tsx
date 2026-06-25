import { useEffect, useRef } from 'react';
import { Layer, Image as KonvaImage, Circle, Group } from 'react-konva';
import type Konva from 'konva';
import type { Point } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import {
  inpaintMaskEngine,
  INPAINT_OVERLAY_OPACITY,
} from '../../utils/inpaintMaskEngine';

/**
 * 智能消除显示层：原图 + 红色涂抹掩码预览 + 跟随光标的画笔圈。
 * 涂抹标记的区域即「将被消除并由 AI 补全背景」的范围。
 */
export default function InpaintLayer() {
  const image = useEditorStore((s) => s.image);
  const brushSize = useEditorStore((s) => s.inpaintBrushSize);
  const inpaintTool = useEditorStore((s) => s.inpaintTool);
  const overlayRef = useRef<Konva.Image>(null);
  const cursorRef = useRef<Konva.Group>(null);

  useEffect(() => {
    inpaintMaskEngine.onChange = () => {
      overlayRef.current?.getLayer()?.batchDraw();
    };
    return () => {
      inpaintMaskEngine.onChange = null;
    };
  }, []);

  // 光标圈走命令式更新：直接移动 Konva 节点，避免每次 mousemove 触发 React 重渲染
  useEffect(() => {
    let last: Point | null = null;
    const apply = (cursor: Point | null) => {
      if (cursor === last) return;
      last = cursor;
      const g = cursorRef.current;
      if (!g) return;
      if (cursor) {
        g.position(cursor);
        g.visible(true);
      } else {
        g.visible(false);
      }
      g.getLayer()?.batchDraw();
    };
    apply(useEditorStore.getState().cursor);
    return useEditorStore.subscribe((s) => apply(s.cursor));
  }, []);

  if (!image) return null;

  return (
    <>
      {/* 原图单独成层：涂抹时静止不动，不参与逐帧重绘 */}
      <Layer listening={false}>
        <KonvaImage image={image} x={0} y={0} />
      </Layer>
      {/* 红色预览单独成层：batchDraw 时只重绘这一层 */}
      <Layer listening={false}>
        {inpaintMaskEngine.overlayCanvas && (
          <KonvaImage
            ref={overlayRef}
            image={inpaintMaskEngine.overlayCanvas}
            x={0}
            y={0}
            opacity={INPAINT_OVERLAY_OPACITY}
          />
        )}
      </Layer>
      <Layer listening={false}>
        {inpaintTool === 'brush' && (
          <Group ref={cursorRef} visible={false}>
            <Circle
              radius={brushSize / 2}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={3}
              strokeScaleEnabled={false}
            />
            <Circle
              radius={brushSize / 2}
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeScaleEnabled={false}
              dash={[4, 4]}
            />
            <Circle
              radius={1.5}
              fill="#ef4444"
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={1}
              strokeScaleEnabled={false}
            />
          </Group>
        )}
      </Layer>
    </>
  );
}
