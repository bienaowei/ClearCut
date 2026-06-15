import { Layer, Line, Circle } from 'react-konva';
import type Konva from 'konva';
import type { Point } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useCropStore } from '../../stores/cropStore';
import { edgeMidpoints } from '../../utils/polygonMath';

interface Props {
  draft: Point[];
  hover: Point | null;
  commitPolygons: () => void;
}

const MIN_VERTICES = 3;

function flatten(points: Point[]): number[] {
  return points.flatMap((p) => [p.x, p.y]);
}

/** 多边形绘制 / 选择 / 顶点编辑层 */
export default function PolygonLayer({ draft, hover, commitPolygons }: Props) {
  const zoom = useEditorStore((s) => s.zoom);
  const polygons = useCropStore((s) => s.polygons);
  const activeId = useCropStore((s) => s.activePolygonId);
  const setActive = useCropStore((s) => s.setActive);
  const updatePolygon = useCropStore((s) => s.updatePolygon);

  const handleR = 5 / zoom;
  const midR = 3.5 / zoom;

  return (
    <Layer>
      {/* 已完成的多边形 */}
      {polygons.map((poly) => {
        const isActive = poly.id === activeId;
        return (
          <Line
            key={poly.id}
            points={flatten(poly.points)}
            closed
            fill={poly.color + (isActive ? '55' : '33')}
            stroke={poly.color}
            strokeWidth={(isActive ? 2 : 1.5) / zoom}
            draggable={isActive}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              setActive(poly.id);
            }}
            onDragMove={(e) => {
              const node = e.target as Konva.Line;
              const dx = node.x();
              const dy = node.y();
              node.position({ x: 0, y: 0 });
              updatePolygon(poly.id, {
                points: poly.points.map((p) => ({
                  x: p.x + dx,
                  y: p.y + dy,
                })),
              });
            }}
            onDragEnd={() => commitPolygons()}
          />
        );
      })}

      {/* 当前激活多边形的顶点 / 边中点手柄 */}
      {polygons
        .filter((p) => p.id === activeId)
        .map((poly) => (
          <VertexHandles
            key={`h_${poly.id}`}
            polygonId={poly.id}
            points={poly.points}
            color={poly.color}
            handleR={handleR}
            midR={midR}
            updatePolygon={updatePolygon}
            commitPolygons={commitPolygons}
          />
        ))}

      {/* 正在绘制的草稿多边形 */}
      {draft.length > 0 && (
        <>
          <Line
            points={[
              ...flatten(draft),
              ...(hover ? [hover.x, hover.y] : []),
            ]}
            stroke="#e8453c"
            strokeWidth={1.5 / zoom}
            dash={[6 / zoom, 4 / zoom]}
          />
          {draft.map((p, i) => (
            <Circle
              key={`d_${i}`}
              x={p.x}
              y={p.y}
              radius={(i === 0 ? 6 : 4) / zoom}
              fill={i === 0 ? '#f0a868' : '#e8453c'}
              stroke="#2a1f1f"
              strokeWidth={1 / zoom}
            />
          ))}
        </>
      )}
    </Layer>
  );
}

interface VHProps {
  polygonId: string;
  points: Point[];
  color: string;
  handleR: number;
  midR: number;
  updatePolygon: (id: string, patch: { points: Point[] }) => void;
  commitPolygons: () => void;
}

function VertexHandles({
  polygonId,
  points,
  handleR,
  midR,
  updatePolygon,
  commitPolygons,
}: VHProps) {
  const mids = edgeMidpoints(points);

  return (
    <>
      {/* 边中点：双击插入新顶点 */}
      {mids.map((m, i) => (
        <Circle
          key={`m_${i}`}
          x={m.x}
          y={m.y}
          radius={midR}
          fill="#f0a868"
          opacity={0.7}
          onDblClick={(e) => {
            e.cancelBubble = true;
            const next = [...points];
            next.splice(i + 1, 0, { x: m.x, y: m.y });
            updatePolygon(polygonId, { points: next });
            commitPolygons();
          }}
        />
      ))}

      {/* 顶点：拖拽移动 / 右键删除 */}
      {points.map((p, i) => (
        <Circle
          key={`v_${i}`}
          x={p.x}
          y={p.y}
          radius={handleR}
          fill="#fff"
          stroke="#e8453c"
          strokeWidth={1.5 / (handleR / 5)}
          strokeScaleEnabled={false}
          draggable
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onDragMove={(e) => {
            const node = e.target;
            const next = [...points];
            next[i] = { x: node.x(), y: node.y() };
            updatePolygon(polygonId, { points: next });
          }}
          onDragEnd={() => commitPolygons()}
          onContextMenu={(e) => {
            e.evt.preventDefault();
            e.cancelBubble = true;
            if (points.length <= MIN_VERTICES) return;
            const next = points.filter((_, idx) => idx !== i);
            updatePolygon(polygonId, { points: next });
            commitPolygons();
          }}
        />
      ))}
    </>
  );
}
