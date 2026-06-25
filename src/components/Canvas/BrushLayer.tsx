import { useEffect, useRef, useState } from 'react';
import { Layer, Image as KonvaImage, Circle, Group } from 'react-konva';
import type Konva from 'konva';
import type { Point } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { brushEngine } from '../../utils/brushEngine';
import { useThemeColors } from '../../hooks/useThemeColors';

/** 画笔擦除显示层：实时显示擦除结果 + 跟随光标的画笔预览圈 */
export default function BrushLayer() {
  const image = useEditorStore((s) => s.image);
  const brushTool = useEditorStore((s) => s.brushTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const wandFlash = useEditorStore((s) => s.wandFlash);
  const cursorRef = useRef<Konva.Group>(null);
  const [flashProgress, setFlashProgress] = useState<{
    id: number;
    x: number;
    y: number;
    t: number; // 0~1
  } | null>(null);
  const colors = useThemeColors();
  const imageLayerRef = useRef<Konva.Layer>(null);
  const konvaImageRef = useRef<Konva.Image>(null);

  // 魔术棒点击 → 启动一次扩散动画（500ms）
  useEffect(() => {
    if (!wandFlash) return;
    const { id, x, y } = wandFlash;
    const start = performance.now();
    const DURATION = 500;
    let raf = 0;
    const loop = () => {
      const t = Math.min(1, (performance.now() - start) / DURATION);
      setFlashProgress({ id, x, y, t });
      if (t < 1) raf = requestAnimationFrame(loop);
      else setFlashProgress(null);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [wandFlash]);

  // 注册引擎刷新回调 → 触发 Konva 重绘
  useEffect(() => {
    brushEngine.onChange = () => {
      konvaImageRef.current?.getLayer()?.batchDraw();
    };
    return () => {
      brushEngine.onChange = null;
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
        {flashProgress && (() => {
          const { x, y, t } = flashProgress;
          const eased = 1 - Math.pow(1 - t, 2); // easeOutQuad
          const N = 8;
          const maxDist = 30;
          const sparks = Array.from({ length: N }, (_, i) => {
            const ang = (i / N) * Math.PI * 2 + Math.PI / 8;
            const d = eased * maxDist;
            const px = x + Math.cos(ang) * d;
            const py = y + Math.sin(ang) * d;
            const r = Math.max(0, 2.4 * (1 - t));
            return (
              <Circle
                key={i}
                x={px}
                y={py}
                radius={r}
                fill={colors.brush}
                opacity={1 - t}
              />
            );
          });
          // 中心快速 pop：先放大再消失
          const pop = t < 0.35 ? t / 0.35 : 1;
          const popR = 2 + pop * 6 * (1 - t);
          return (
            <>
              {sparks}
              <Circle
                x={x}
                y={y}
                radius={popR}
                fill={colors.brush}
                opacity={(1 - t) * 0.85}
              />
            </>
          );
        })()}
        {(brushTool === 'brush' || brushTool === 'restore') && (() => {
          const ringColor = brushTool === 'restore' ? '#22c55e' : colors.brush;
          return (
            <Group ref={cursorRef} visible={false}>
              {/* 深色衬底，保证浅色背景上也能看清 */}
              <Circle
                radius={brushSize / 2}
                stroke="rgba(0,0,0,0.55)"
                strokeWidth={3}
                strokeScaleEnabled={false}
              />
              {/* 亮色虚线圈 */}
              <Circle
                radius={brushSize / 2}
                stroke={ringColor}
                strokeWidth={1.5}
                strokeScaleEnabled={false}
                dash={[4, 4]}
              />
              {/* 中心点 */}
              <Circle
                radius={1.5}
                fill={ringColor}
                stroke="rgba(0,0,0,0.55)"
                strokeWidth={1}
                strokeScaleEnabled={false}
              />
            </Group>
          );
        })()}
      </Layer>
    </>
  );
}
