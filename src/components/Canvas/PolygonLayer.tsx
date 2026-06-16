import { Layer, Line, Circle, Group } from 'react-konva';
import type Konva from 'konva';
import type { Point } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useCropStore } from '../../stores/cropStore';
import { edgeMidpoints } from '../../utils/polygonMath';
import { useThemeColors, type CanvasColors } from '../../hooks/useThemeColors';

interface Props {
  draft: Point[];
  hover: Point | null;
  isLasso: boolean;
  commitPolygons: () => void;
}

const MIN_VERTICES = 3;

function flatten(points: Point[]): number[] {
  return points.flatMap((p) => [p.x, p.y]);
}

/** 多边形绘制 / 选择 / 顶点编辑层 */
export default function PolygonLayer({
  draft,
  hover,
  isLasso,
  commitPolygons,
}: Props) {
  const zoom = useEditorStore((s) => s.zoom);
  const polygons = useCropStore((s) => s.polygons);
  const activeId = useCropStore((s) => s.activePolygonId);
  const setActive = useCropStore((s) => s.setActive);
  const updatePolygon = useCropStore((s) => s.updatePolygon);
  const colors = useThemeColors();

  const handleR = 5 / zoom;
  const midR = 3.5 / zoom;

  return (
    <Layer>
      {/* 未激活的多边形：仅显示，点击选中 */}
      {polygons.map((poly) => {
        if (poly.id === activeId) return null;
        return (
          <Line
            key={poly.id}
            points={flatten(poly.points)}
            closed
            fill={poly.color + '33'}
            stroke={poly.color}
            strokeWidth={1.5 / zoom}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              setActive(poly.id);
            }}
          />
        );
      })}

      {/* 激活的多边形：线条 + 手柄整体放进可拖动的 Group，
          拖动时由 Konva 原生平移（不触发 React 重渲染，因此不抖动），
          只在拖动结束时把累计位移一次性烘焙进顶点。 */}
      {polygons
        .filter((p) => p.id === activeId)
        .map((poly) => (
          <Group
            key={poly.id}
            draggable
            onDragEnd={(e) => {
              const node = e.target as Konva.Group;
              const dx = node.x();
              const dy = node.y();
              node.position({ x: 0, y: 0 });
              if (dx === 0 && dy === 0) return;
              updatePolygon(poly.id, {
                points: poly.points.map((p) => ({
                  x: p.x + dx,
                  y: p.y + dy,
                })),
              });
              commitPolygons();
            }}
          >
            {/* 注意：此处不要 cancelBubble，否则事件无法冒泡到 Group，导致整体拖不动 */}
            <Line
              points={flatten(poly.points)}
              closed
              fill={poly.color + '55'}
              stroke={poly.color}
              strokeWidth={2 / zoom}
            />
            <VertexHandles
              polygonId={poly.id}
              points={poly.points}
              color={poly.color}
              handleR={handleR}
              midR={midR}
              colors={colors}
              updatePolygon={updatePolygon}
              commitPolygons={commitPolygons}
            />
          </Group>
        ))}

      {/* 正在绘制的套索（自由手绘）草稿 */}
      {draft.length > 0 && isLasso && (
        <Line
          points={flatten(draft)}
          closed
          fill={colors.draftFill}
          stroke={colors.draftStroke}
          strokeWidth={1.5 / zoom}
          lineCap="round"
          lineJoin="round"
          tension={0.2}
        />
      )}

      {/* 正在绘制的草稿多边形 */}
      {draft.length > 0 && !isLasso && (
        <>
          <Line
            points={[
              ...flatten(draft),
              ...(hover ? [hover.x, hover.y] : []),
            ]}
            stroke={colors.draftStroke}
            strokeWidth={1.5 / zoom}
            dash={[6 / zoom, 4 / zoom]}
          />
          {draft.map((p, i) => (
            <Circle
              key={`d_${i}`}
              x={p.x}
              y={p.y}
              radius={(i === 0 ? 6 : 4) / zoom}
              fill={i === 0 ? colors.accent : colors.draftStroke}
              stroke={colors.vertexStroke}
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
  colors: CanvasColors;
  updatePolygon: (id: string, patch: { points: Point[] }) => void;
  commitPolygons: () => void;
}

function VertexHandles({
  polygonId,
  points,
  handleR,
  midR,
  colors,
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
          fill={colors.accent}
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
          fill={colors.vertexFill}
          stroke={colors.draftStroke}
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
