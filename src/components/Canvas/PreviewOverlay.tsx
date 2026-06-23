import { Layer, Shape } from 'react-konva';
import { useEditorStore } from '../../stores/editorStore';
import { useCropStore } from '../../stores/cropStore';

/**
 * 模式三反向裁剪预览：多边形外部叠加半透明暗色遮罩，
 * 让用户直观看到"内部保留、外部透明"的最终效果。
 */
export default function PreviewOverlay() {
  const image = useEditorStore((s) => s.image);
  const polygons = useCropStore((s) => s.polygons);
  const regions = polygons.filter((p) => p.closed && p.points.length >= 3);

  if (!image || regions.length === 0) return null;

  const w = image.naturalWidth;
  const h = image.naturalHeight;

  return (
    <Layer listening={false}>
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath();
          // 外框（顺时针）
          ctx.rect(0, 0, w, h);
          // 所有多边形作为挖空区域（evenodd 规则）
          for (const poly of regions) {
            ctx.moveTo(poly.points[0].x, poly.points[0].y);
            for (let i = 1; i < poly.points.length; i++) {
              ctx.lineTo(poly.points[i].x, poly.points[i].y);
            }
            ctx.closePath();
          }
          const c = ctx as unknown as CanvasRenderingContext2D;
          c.fillStyle = 'rgba(20, 12, 12, 0.6)';
          c.fill('evenodd');
          ctx.fillStrokeShape(shape);
        }}
        listening={false}
      />
    </Layer>
  );
}
