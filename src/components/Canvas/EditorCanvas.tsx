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
import { brushEngine } from '../../utils/brushEngine';
import { toleranceToDistance } from '../../utils/magicWand';
import ImageLayer from './ImageLayer';
import BrushLayer from './BrushLayer';
import PolygonLayer from './PolygonLayer';
import PreviewOverlay from './PreviewOverlay';
import Icon from '../common/Icon';

// 魔术棒光标：白描边 + 黑填充，星头在左侧、棒柄朝右下，热点对齐星头(左上)
const WAND_PATH = 'M9 4V2M9 16v-2M16 9h-2M4 9h-2M6.2 11.8 5 13M6.2 6.2 5 5M21 21l-9-9M11.8 6.2 13 5';
const WAND_CURSOR_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='white' stroke-width='3.5'><path d='${WAND_PATH}'/></g><g stroke='black' stroke-width='1.8'><path d='${WAND_PATH}'/></g></svg>`;
const WAND_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(WAND_CURSOR_SVG)}") 4 10, crosshair`;

interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
  onDropFile: (file: File) => void;
}

export default function EditorCanvas({ containerRef, onDropFile }: Props) {
  const mode = useEditorStore((s) => s.mode);
  const brushTool = useEditorStore((s) => s.brushTool);
  const wandTolerance = useEditorStore((s) => s.wandTolerance);
  const wandContiguous = useEditorStore((s) => s.wandContiguous);
  const drawMethod = useEditorStore((s) => s.drawMethod);
  const image = useEditorStore((s) => s.image);
  const zoom = useEditorStore((s) => s.zoom);
  const offset = useEditorStore((s) => s.offset);
  const setOffset = useEditorStore((s) => s.setOffset);
  const setCursor = useEditorStore((s) => s.setCursor);
  const triggerWandFlash = useEditorStore((s) => s.triggerWandFlash);
  const setActive = useCropStore((s) => s.setActive);

  const stageRef = useRef<Konva.Stage>(null);
  const emptyFileRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragOver, setDragOver] = useState(false);

  const { spaceDown, handleWheel } = useCanvasZoom();
  const brush = useBrush();
  const polygon = usePolygon();
  const { commitPolygons, commitBrush } = useHistory();

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
      if (brushTool === 'wand') {
        // 魔术棒：点哪去哪，漫水擦除连通/同色背景
        const ok = brushEngine.magicErase([pt], {
          tolerance: toleranceToDistance(wandTolerance),
          contiguous: wandContiguous,
        });
        if (ok) {
          triggerWandFlash(pt);
          commitBrush();
        }
      } else {
        brush.begin(pt);
      }
    } else if (drawMethod === 'lasso') {
      // 套索：仅在空白处按下开始自由绘制；点中多边形交给其自身处理（选择/拖拽）
      if (e.target === e.target.getStage()) {
        setActive(null);
        polygon.lassoBegin(pt);
      }
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
    } else if (drawMethod === 'lasso') {
      polygon.lassoMove(pt);
    } else {
      polygon.handleMouseMove(pt);
    }
  };

  const onPointerUp = () => {
    if (mode === 'brush') brush.end();
    else if (drawMethod === 'lasso') polygon.lassoEnd();
  };

  const onDblClick = () => {
    if (mode !== 'brush' && drawMethod === 'polygon') polygon.handleDblClick();
  };

  return (
    <div
      ref={containerRef}
      className="canvas-area"
      style={{
        cursor: !image
          ? 'default'
          : spaceDown
          ? 'grab'
          : mode === 'brush' && (brushTool === 'brush' || brushTool === 'restore')
          ? 'none'
          : mode === 'brush' && brushTool === 'wand'
          ? WAND_CURSOR
          : 'crosshair',
      }}
      data-dragover={dragOver ? 'true' : undefined}
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
          <div className="empty-card">
            <div className="empty-icon">
              <Icon name="image-plus" size={34} />
            </div>
            <h2>载入一张图片开始抠图</h2>
            <p className="muted">
              拖拽图片到此处，或 Ctrl+V 粘贴，或点击下方按钮
            </p>
            <button className="primary" onClick={() => emptyFileRef.current?.click()}>
              <Icon name="image-plus" />
              选择图片
            </button>
            <p className="formats">支持 JPG · PNG · WEBP · BMP</p>
          </div>
          <input
            ref={emptyFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onDropFile(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-hint">
            <Icon name="image-plus" size={28} />
            松开以载入图片
          </div>
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
              isLasso={polygon.isLasso}
              commitPolygons={commitPolygons}
            />
          </>
        )}
      </Stage>
    </div>
  );
}
