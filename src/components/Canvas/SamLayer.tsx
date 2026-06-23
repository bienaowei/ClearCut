import { useEffect, useRef } from 'react';
import { Layer, Image as KonvaImage, Circle } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '../../stores/editorStore';
import { useCropStore } from '../../stores/cropStore';
import { keepMaskEngine } from '../../utils/keepMaskEngine';

/**
 * 保留模式预览叠加层（SAM ∪ 多边形/套索）：
 *  - 渲染 keepMaskEngine.overlayCanvas：未保留压暗、已保留/pending/多边形区域亮显。
 *  - SAM 工具激活时，额外渲染当前未确认物体的提示点标记（绿=正点，红=负点）。
 */
export default function SamLayer() {
  const image = useEditorStore((s) => s.image);
  const zoom = useEditorStore((s) => s.zoom);
  const drawMethod = useEditorStore((s) => s.drawMethod);
  const samPoints = useEditorStore((s) => s.samPoints);
  const polygons = useCropStore((s) => s.polygons);
  const overlayRef = useRef<Konva.Image>(null);

  // 引擎刷新 → 触发 Konva 重绘
  useEffect(() => {
    keepMaskEngine.onChange = () => {
      overlayRef.current?.getLayer()?.batchDraw();
    };
    return () => {
      keepMaskEngine.onChange = null;
    };
  }, []);

  // 多边形/套索变化 → 同步进保留蒙版引擎，重建并集预览
  useEffect(() => {
    const closed = polygons
      .filter((p) => p.closed && p.points.length >= 3)
      .map((p) => p.points);
    keepMaskEngine.setPolygons(closed);
  }, [polygons]);

  if (!image || !keepMaskEngine.overlayCanvas) return null;

  // 标记保持恒定屏幕尺寸（除以缩放比）
  const r = 6 / zoom;
  const sw = 2 / zoom;

  return (
    <Layer listening={false}>
      <KonvaImage ref={overlayRef} image={keepMaskEngine.overlayCanvas} x={0} y={0} />
      {drawMethod === 'sam' &&
        samPoints.map((p, i) => (
          <Circle
            key={i}
            x={p.x}
            y={p.y}
            radius={r}
            fill={p.label === 1 ? '#22c55e' : '#ef4444'}
            stroke="#ffffff"
            strokeWidth={sw}
            strokeScaleEnabled={false}
          />
        ))}
    </Layer>
  );
}
