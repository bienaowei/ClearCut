import { useEffect, useRef } from 'react';
import { Layer, Image as KonvaImage, Circle } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../../stores/editorStore';
import { brushEngine } from '../../utils/brushEngine';
import { useThemeColors } from '../../hooks/useThemeColors';

/** 画笔擦除显示层：实时显示擦除结果 + 跟随光标的画笔预览圈 */
export default function BrushLayer() {
  const image = useEditorStore((s) => s.image);
  const cursor = useEditorStore((s) => s.cursor);
  const brushTool = useEditorStore((s) => s.brushTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const colors = useThemeColors();
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
        {cursor && brushTool === 'brush' && (
          <>
            {/* 深色衬底，保证浅色背景上也能看清 */}
            <Circle
              x={cursor.x}
              y={cursor.y}
              radius={brushSize / 2}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={3}
              strokeScaleEnabled={false}
            />
            {/* 亮色虚线圈 */}
            <Circle
              x={cursor.x}
              y={cursor.y}
              radius={brushSize / 2}
              stroke={colors.brush}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
              dash={[4, 4]}
            />
            {/* 中心点 */}
            <Circle
              x={cursor.x}
              y={cursor.y}
              radius={1.5}
              fill={colors.brush}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={1}
              strokeScaleEnabled={false}
            />
          </>
        )}
      </Layer>
    </>
  );
}
