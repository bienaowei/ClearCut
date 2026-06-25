import { useCallback } from 'react';
import type { CropResult, PolygonRegion } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { useCropStore } from '../stores/cropStore';
import { brushEngine } from '../utils/brushEngine';
import { keepMaskEngine } from '../utils/keepMaskEngine';
import {
  clipPolygonToCanvas,
  compositeWithMask,
  createCanvas,
  cropCanvas,
  get2d,
  getContentBBox,
} from '../utils/canvasUtils';
import { getBBox } from '../utils/polygonMath';
import {
  downloadDataUrl,
  exportResultsAsZip,
  sanitizeName,
} from '../utils/exportUtils';

/** 让出一帧，让按钮的“导出中”状态先渲染，再跑阻塞主线程的重活 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

export function useExport() {
  const image = useEditorStore((s) => s.image);
  const imageName = useEditorStore((s) => s.imageName);
  const exportConfig = useEditorStore((s) => s.exportConfig);
  const retainConfig = useEditorStore((s) => s.retainConfig);
  const setExporting = useEditorStore((s) => s.setExporting);

  /**
   * 统一包裹导出：置“导出中”→ 让出一帧渲染转圈 → 跑重活 →
   * 复位状态。防重复点击，失败弹提示。
   */
  const runExport = useCallback(
    async (task: () => void | Promise<void>) => {
      if (useEditorStore.getState().isExporting) return;
      setExporting(true);
      try {
        await nextFrame(); // 先让“导出中”渲染出来，再跑阻塞主线程的重活
        await task();
      } catch (err) {
        alert(`导出失败：${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setExporting(false);
      }
    },
    [setExporting],
  );

  // ---- 模式一：画笔擦除导出 ----
  const exportBrush = useCallback(
    (autoCrop: boolean) =>
      runExport(() => {
        if (!image) return;
        let canvas = compositeWithMask(image, brushEngine.maskCanvas);
        if (autoCrop) {
          const bbox = getContentBBox(canvas);
          if (bbox) canvas = cropCanvas(canvas, bbox);
        }
        downloadDataUrl(canvas.toDataURL('image/png'), `${imageName}_cutout.png`);
      }),
    [image, imageName, runExport],
  );

  // ---- 模式二：裁剪结果计算（预览 + 导出共用） ----
  const computeCropResults = useCallback((): CropResult[] => {
    if (!image) return [];
    const polys = useCropStore.getState().polygons.filter((p) => p.closed);
    if (polys.length === 0) return [];

    let target: { width: number; height: number } | null;
    let maxScale = Infinity;

    if (exportConfig.mode === 'fixed') {
      target = { width: exportConfig.width, height: exportConfig.height };
    } else if (exportConfig.mode === 'adaptive') {
      // 取所有包围盒的最大宽高作为统一尺寸；内容居中不放大
      let w = 0;
      let h = 0;
      for (const p of polys) {
        const b = getBBox(p.points);
        w = Math.max(w, b.width);
        h = Math.max(h, b.height);
      }
      target = {
        width: Math.ceil(w) + exportConfig.padding * 2,
        height: Math.ceil(h) + exportConfig.padding * 2,
      };
      maxScale = 1;
    } else {
      target = null; // original：各自包围盒尺寸
    }

    return polys.map((poly) => {
      const canvas = clipPolygonToCanvas(
        image,
        poly.points,
        target,
        exportConfig.padding,
        maxScale,
      );
      return {
        polygon: poly,
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      };
    });
  }, [image, exportConfig]);

  const exportCropSingle = useCallback(
    (poly: PolygonRegion) => {
      const result = computeCropResults().find(
        (r) => r.polygon.id === poly.id,
      );
      if (!result) return;
      downloadDataUrl(
        result.dataUrl,
        `${sanitizeName(poly.name)}.png`,
      );
    },
    [computeCropResults],
  );

  const exportCropAll = useCallback(
    () =>
      runExport(async () => {
        const results = computeCropResults();
        if (results.length === 0) {
          alert('没有可导出的多边形');
          return;
        }
        await exportResultsAsZip(results, `${imageName}_crops.zip`);
      }),
    [computeCropResults, imageName, runExport],
  );

  // ---- 模式三：反向裁剪导出（多区域：内部全部保留，外部透明） ----
  const exportRetain = useCallback(
    () =>
      runExport(() => {
        if (!image) return;

        // 保留区 = SAM 智能点选蒙版 ∪ 多边形/套索区域
        const polys = useCropStore
          .getState()
          .polygons.filter((p) => p.closed && p.points.length >= 3);
        keepMaskEngine.setPolygons(polys.map((p) => p.points));

        if (!keepMaskEngine.hasAny()) {
          alert('请先用智能点选选中物品，或绘制一个保留区域');
          return;
        }

        const full = keepMaskEngine.composite(image);

        if (retainConfig.mode === 'origin') {
          // 保留原图尺寸
          downloadDataUrl(full.toDataURL('image/png'), `${imageName}_retain.png`);
          return;
        }

        const bbox = getContentBBox(full) ?? {
          x: 0,
          y: 0,
          width: image.naturalWidth,
          height: image.naturalHeight,
        };
        const content = cropCanvas(full, bbox);

        let out: HTMLCanvasElement;
        if (retainConfig.mode === 'bbox') {
          // 裁剪到包围盒（含内边距）
          out = padCanvas(content, retainConfig.padding);
        } else {
          // fixed：缩放居中到指定尺寸
          out = fitInto(
            content,
            { width: retainConfig.width, height: retainConfig.height },
            retainConfig.padding,
          );
        }
        downloadDataUrl(out.toDataURL('image/png'), `${imageName}_retain.png`);
      }),
    [image, retainConfig, imageName, runExport],
  );

  // ---- 智能消除：导出整图（消除后的原图即为结果） ----
  const exportInpaint = useCallback(
    () =>
      runExport(() => {
        if (!image) return;
        const out = createCanvas(image.naturalWidth, image.naturalHeight);
        get2d(out).drawImage(image, 0, 0);
        downloadDataUrl(out.toDataURL('image/png'), `${imageName}_cleaned.png`);
      }),
    [image, imageName, runExport],
  );

  return {
    exportBrush,
    computeCropResults,
    exportCropSingle,
    exportCropAll,
    exportRetain,
    exportInpaint,
  };
}

/** 在内容四周补透明内边距 */
function padCanvas(content: HTMLCanvasElement, padding: number): HTMLCanvasElement {
  if (padding <= 0) return content;
  const out = createCanvas(content.width + padding * 2, content.height + padding * 2);
  get2d(out).drawImage(content, padding, padding);
  return out;
}

/** 将内容等比缩放居中到目标尺寸（不放大超过目标，留出内边距） */
function fitInto(
  content: HTMLCanvasElement,
  target: { width: number; height: number },
  padding: number,
): HTMLCanvasElement {
  const out = createCanvas(target.width, target.height);
  const ctx = get2d(out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const availW = target.width - padding * 2;
  const availH = target.height - padding * 2;
  const scale = Math.min(availW / content.width, availH / content.height);
  const drawW = content.width * scale;
  const drawH = content.height * scale;
  ctx.drawImage(
    content,
    (target.width - drawW) / 2,
    (target.height - drawH) / 2,
    drawW,
    drawH,
  );
  return out;
}
