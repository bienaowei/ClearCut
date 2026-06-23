import { useCallback } from 'react';
import type { Point } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { useCropStore, createPolygon } from '../stores/cropStore';
import { useHistory } from './useHistory';
import {
  bboxToRectPoints,
  floodSelectBBox,
  segmentAllBBoxes,
} from '../utils/alphaSegment';

/**
 * 点选裁剪：在透明背景图上点一下某个物品，自动按 alpha 连通域框出包围盒，
 * 生成一个矩形裁剪区，复用现有裁剪/导出管线。
 */
export function usePick() {
  const { commitPolygons } = useHistory();
  const addPolygon = useCropStore((s) => s.addPolygon);
  const setPolygons = useCropStore((s) => s.setPolygons);

  /** 点选单个物品，追加一个裁剪区 */
  const pickAt = useCallback(
    (pt: Point) => {
      const { image, pickAlphaThreshold } = useEditorStore.getState();
      if (!image) return;
      const bbox = floodSelectBBox(image, pt, pickAlphaThreshold);
      // 点到透明处或区域过小则忽略
      if (!bbox || bbox.width < 2 || bbox.height < 2) return;
      const name = useCropStore.getState().takeNextLabel() ?? undefined;
      addPolygon(createPolygon(bboxToRectPoints(bbox), true, name));
      commitPolygons();
    },
    [addPolygon, commitPolygons],
  );

  /** 一键全分：扫描整图所有物品，替换当前裁剪列表。返回识别到的数量 */
  const pickAll = useCallback((): number => {
    const { image, pickAlphaThreshold } = useEditorStore.getState();
    if (!image) return 0;
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    // 噪点过滤：至少 64px 或全图面积的 0.02%
    const minArea = Math.max(64, Math.round(w * h * 0.0002));
    const boxes = segmentAllBBoxes(image, pickAlphaThreshold, minArea);
    if (boxes.length === 0) return 0;
    const names = useCropStore.getState().takeLabels(boxes.length);
    const polys = boxes.map((b, i) =>
      createPolygon(bboxToRectPoints(b), true, names[i]),
    );
    setPolygons(polys, polys[polys.length - 1].id);
    commitPolygons();
    return boxes.length;
  }, [setPolygons, commitPolygons]);

  return { pickAt, pickAll };
}
