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
  const poly = polygons[0];

  if (!image || !poly || !poly.closed || poly.points.length < 3) return null;

  const w = image.naturalWidth;
  const h = image.naturalHeight;

  return (
    <Layer listening={false}>
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath();
          // 外框（顺时针）
          ctx.rect(0, 0, w, h);
          // 内部多边形（作为挖空区域，evenodd 规则）
          ctx.moveTo(poly.points[0].x, poly.points[0].y);
          for (let i = 1; i < poly.points.length; i++) {
            ctx.lineTo(poly.points[i].x, poly.points[i].y);
          }
          ctx.closePath();
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
