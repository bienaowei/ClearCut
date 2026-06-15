import { useEffect, useRef } from 'react';
import { Layer, Image as KonvaImage, Circle } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../../stores/editorStore';
import { brushEngine } from '../../utils/brushEngine';

/** 画笔擦除显示层：实时显示擦除结果 + 跟随光标的画笔预览圈 */
export default function BrushLayer() {
  const image = useEditorStore((s) => s.image);
  const cursor = useEditorStore((s) => s.cursor);
  const brushSize = useEditorStore((s) => s.brushSize);
  const imageLayerRef = useRef<Konva.Layer>(null);
  const konvaImageRef = useRef<Konva.Image>(null);

  // 注册引擎刷新回调 → 触发 Konva 重绘
  useEffect(() => {
    brushEngine.onChange = () => {
      konvaImageRef.current?.getLayer()?.batchDraw();
    };
    return () => {
      brushEngine.onChange = null;
    };
  }, []);

  if (!image || !brushEngine.displayCanvas) return null;

  return (
    <>
      <Layer ref={imageLayerRef} listening={false}>
        <KonvaImage
          ref={konvaImageRef}
          image={brushEngine.displayCanvas}
          x={0}
          y={0}
        />
      </Layer>
      <Layer listening={false}>
        {cursor && (
          <Circle
            x={cursor.x}
            y={cursor.y}
            radius={brushSize / 2}
            stroke="#f0a868"
            strokeWidth={1}
            strokeScaleEnabled={false}
            dash={[4, 4]}
          />
        )}
      </Layer>
    </>
  );
}
