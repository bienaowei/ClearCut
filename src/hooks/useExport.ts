import { useCallback } from 'react';
import type { CropResult, PolygonRegion } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { useCropStore } from '../stores/cropStore';
import { brushEngine } from '../utils/brushEngine';
import {
  clipPolygonToCanvas,
  compositeWithMask,
  cropCanvas,
  getContentBBox,
} from '../utils/canvasUtils';
import { getBBox } from '../utils/polygonMath';
import {
  downloadDataUrl,
  exportResultsAsZip,
  sanitizeName,
} from '../utils/exportUtils';

export function useExport() {
  const image = useEditorStore((s) => s.image);
  const imageName = useEditorStore((s) => s.imageName);
  const exportConfig = useEditorStore((s) => s.exportConfig);
  const retainConfig = useEditorStore((s) => s.retainConfig);

  // ---- 模式一：画笔擦除导出 ----
  const exportBrush = useCallback(
    (autoCrop: boolean) => {
      if (!image) return;
      let canvas = compositeWithMask(image, brushEngine.maskCanvas);
      if (autoCrop) {
        const bbox = getContentBBox(canvas);
        if (bbox) canvas = cropCanvas(canvas, bbox);
      }
      downloadDataUrl(canvas.toDataURL('image/png'), `${imageName}_cutout.png`);
    },
    [image, imageName],
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

  const exportCropAll = useCallback(async () => {
    const results = computeCropResults();
    if (results.length === 0) {
      alert('没有可导出的多边形');
      return;
    }
    await exportResultsAsZip(results, `${imageName}_crops.zip`);
  }, [computeCropResults, imageName]);

  // ---- 模式三：反向裁剪导出 ----
  const exportRetain = useCallback(() => {
    if (!image) return;
    const poly = useCropStore.getState().polygons[0];
    if (!poly || !poly.closed) {
      alert('请先绘制一个保留区域');
      return;
    }
    let target: { width: number; height: number } | null = null;
    let maxScale = Infinity;

    if (retainConfig.mode === 'fixed') {
      target = { width: retainConfig.width, height: retainConfig.height };
    } else if (retainConfig.mode === 'bbox') {
      target = null; // 裁剪到包围盒
    } else {
      // origin：保留原图尺寸，多边形外透明
      const canvas = clipFullImage(image, poly.points);
      downloadDataUrl(
        canvas.toDataURL('image/png'),
        `${imageName}_retain.png`,
      );
      return;
    }
    const canvas = clipPolygonToCanvas(
      image,
      poly.points,
      target,
      retainConfig.padding,
      maxScale,
    );
    downloadDataUrl(canvas.toDataURL('image/png'), `${imageName}_retain.png`);
  }, [image, retainConfig, imageName]);

  return {
    exportBrush,
    computeCropResults,
    exportCropSingle,
    exportCropAll,
    exportRetain,
  };
}

/** 保留原图尺寸：多边形内保留，外部透明 */
function clipFullImage(
  image: HTMLImageElement,
  points: { x: number; y: number }[],
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = image.naturalWidth;
  c.height = image.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, 0, 0);
  return c;
}
