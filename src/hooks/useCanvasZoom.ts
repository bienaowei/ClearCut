import { useCallback, useEffect, useState } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '../stores/editorStore';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
const SCALE_BY = 1.08;

/**
 * 画布缩放/平移逻辑：
 * - 滚轮以光标位置为中心缩放
 * - 空格键 + 拖拽平移
 */
export function useCanvasZoom() {
  const zoom = useEditorStore((s) => s.zoom);
  const offset = useEditorStore((s) => s.offset);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setOffset = useEditorStore((s) => s.setOffset);
  const [spaceDown, setSpaceDown] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const oldScale = zoom;
      const mousePointTo = {
        x: (pointer.x - offset.x) / oldScale,
        y: (pointer.y - offset.y) / oldScale,
      };

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      let newScale =
        direction > 0 ? oldScale * SCALE_BY : oldScale / SCALE_BY;
      newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));

      setZoom(newScale);
      setOffset({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    },
    [zoom, offset, setZoom, setOffset],
  );

  return { spaceDown, handleWheel };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
