import { useEffect, useRef, useState } from 'react';
import { Stage } from 'react-konva';
import type Konva from 'konva';
import type { Point } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useCanvasZoom } from '../../hooks/useCanvasZoom';
import { useBrush } from '../../hooks/useBrush';
import { usePolygon } from '../../hooks/usePolygon';
import { useHistory } from '../../hooks/useHistory';
import { useCropStore } from '../../stores/cropStore';
import ImageLayer from './ImageLayer';
import BrushLayer from './BrushLayer';
import PolygonLayer from './PolygonLayer';
import PreviewOverlay from './PreviewOverlay';

interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
  onDropFile: (file: File) => void;
}

export default function EditorCanvas({ containerRef, onDropFile }: Props) {
  const mode = useEditorStore((s) => s.mode);
  const image = useEditorStore((s) => s.image);
  const zoom = useEditorStore((s) => s.zoom);
  const offset = useEditorStore((s) => s.offset);
  const setOffset = useEditorStore((s) => s.setOffset);
  const setCursor = useEditorStore((s) => s.setCursor);
  const setActive = useCropStore((s) => s.setActive);

  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragOver, setDragOver] = useState(false);

  const { spaceDown, handleWheel } = useCanvasZoom();
  const brush = useBrush();
  const polygon = usePolygon();
  const { commitPolygons } = useHistory();

  // 容器尺寸自适应
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const getImagePoint = (): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  };

  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (spaceDown || !image) return;
    const pt = getImagePoint();
    if (!pt) return;
    if (mode === 'brush') {
      brush.begin(pt);
    } else {
      // 点击空白（stage 自身）→ 开始/继续绘制；点中多边形由其自身处理
      if (e.target === e.target.getStage()) {
        if (!polygon.isDrawing) setActive(null);
        polygon.handleClick(pt);
      }
    }
  };

  const onPointerMove = () => {
    if (!image) return;
    const pt = getImagePoint();
    if (!pt) return;
    setCursor(pt);
    if (mode === 'brush') {
      brush.move(pt);
    } else {
      polygon.handleMouseMove(pt);
    }
  };

  const onPointerUp = () => {
    if (mode === 'brush') brush.end();
  };

  const onDblClick = () => {
    if (mode !== 'brush') polygon.handleDblClick();
  };

  return (
    <div
      ref={containerRef}
      className="canvas-area"
      style={{
        cursor: spaceDown ? 'grab' : mode === 'brush' ? 'none' : 'crosshair',
        outline: dragOver ? '2px dashed var(--primary)' : 'none',
        outlineOffset: -8,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onDropFile(file);
      }}
    >
      {!image && (
        <div className="canvas-empty">
          <p>拖拽图片到此处 / 点击「加载图片」/ Ctrl+V 粘贴</p>
          <p className="muted">支持 jpg · png · webp · bmp</p>
        </div>
      )}
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={zoom}
        scaleY={zoom}
        x={offset.x}
        y={offset.y}
        draggable={spaceDown}
        onWheel={handleWheel}
        onDragMove={(e) => {
          if (e.target === e.target.getStage()) {
            setOffset({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onTouchStart={onPointerDown as never}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
        onDblClick={onDblClick}
        onMouseLeave={() => setCursor(null)}
      >
        {mode === 'brush' ? (
          <BrushLayer />
        ) : (
          <>
            <ImageLayer />
            {mode === 'retain' && <PreviewOverlay />}
            <PolygonLayer
              draft={polygon.draft}
              hover={polygon.hover}
              commitPolygons={commitPolygons}
            />
          </>
        )}
      </Stage>
    </div>
  );
}
