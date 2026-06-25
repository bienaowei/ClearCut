import { useCallback } from 'react';
import type { Point, SamPoint } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { useHistoryStore } from '../stores/historyStore';
import { useCropStore } from '../stores/cropStore';
import { lamaEngine } from '../utils/lamaEngine';
import { inpaintMaskEngine } from '../utils/inpaintMaskEngine';
import { brushEngine } from '../utils/brushEngine';
import { keepMaskEngine } from '../utils/keepMaskEngine';
import { samEngine, type SamPrompt } from '../utils/samEngine';
import { useSam } from './useSam';
import { useDownloadGate } from '../components/common/DownloadGate';

/**
 * 智能消除编排：擦除掩码区域 → LaMa 补全背景 → 替换原图。
 *
 * 设计要点：消除会改变「原图」本身，因此用一套**独立的撤销栈**（下方模块级
 * eraseUndo/eraseRedo）管理，不动全局 history。这样画笔 / 裁剪 / 保留三种模式
 * 的撤销重做完全不受影响——满足「不影响当前三种模式」。
 */

interface Snap {
  img: HTMLImageElement;
  url: string;
}

// 模块级历史栈：保存每次消除前/后的原图。与 React 渲染解耦。
let eraseUndo: Snap[] = [];
let eraseRedo: Snap[] = [];

/** canvas → HTMLImageElement（带常驻 objectURL，存活于栈中不被回收） */
function canvasToImage(canvas: HTMLCanvasElement): Promise<Snap> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('生成图片失败'));
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片解码失败'));
      };
      img.src = url;
    }, 'image/png');
  });
}

function snapOf(image: HTMLImageElement): Snap {
  // 当前 image 的 url 由 useImageLoader 持有；这里仅作占位，撤销时直接复用该 image。
  return { img: image, url: '' };
}

/** 把某张图设为当前原图，并重建各引擎（让三种模式都在新像素上工作） */
function adoptImage(image: HTMLImageElement) {
  const store = useEditorStore.getState();
  store.setImage(image, store.imageName);
  brushEngine.init(image);
  keepMaskEngine.init(image.naturalWidth, image.naturalHeight);
  inpaintMaskEngine.init(image.naturalWidth, image.naturalHeight);
  samEngine.resetImage();
  store.setSamPoints([]);
  store.setSamStatus('idle');
  store.bumpSam();
  useCropStore.getState().clear();
  // 基线像素已变，重置全局历史到新基线（三种模式各自从干净状态重新记录）
  useHistoryStore.getState().reset({ kind: 'brush', mask: null });
}

/** 清空消除撤销栈（加载新图 / 清除图片时调用） */
export function resetEraseHistory() {
  for (const s of [...eraseUndo, ...eraseRedo]) {
    if (s.url) URL.revokeObjectURL(s.url);
  }
  eraseUndo = [];
  eraseRedo = [];
}

export function useInpaint() {
  const setInpaintStatus = useEditorStore((s) => s.setInpaintStatus);
  const bumpInpaintMask = useEditorStore((s) => s.bumpInpaintMask);
  const bumpInpaintHist = useEditorStore((s) => s.bumpInpaintHist);
  // 复用 SAM 编排里的模型加载/编码与不兼容处理（prepare），分割结果并入擦除掩码
  const sam = useSam();
  const ensureDownload = useDownloadGate();

  /** SAM 智能点选：点一下物体→分割→并入擦除掩码（快速选中要消除的东西） */
  const samClick = useCallback(
    async (pt: Point) => {
      const ok = await sam.prepare();
      if (!ok) return;
      const prompts: SamPoint[] = [{ x: pt.x, y: pt.y, label: 1 }];
      setInpaintStatus('idle'); // 点选不占用 loading（loading 留给消除推理）
      try {
        const mask = await samEngine.segment(prompts as SamPrompt[]);
        if (mask) {
          inpaintMaskEngine.addMask(mask);
          bumpInpaintMask();
        }
      } catch (err) {
        console.error('[Inpaint] SAM 点选失败：', err);
      }
    },
    [sam, bumpInpaintMask, setInpaintStatus],
  );

  const run = useCallback(async () => {
    const image = useEditorStore.getState().image;
    if (!image || !inpaintMaskEngine.maskCanvas) return;
    if (!inpaintMaskEngine.hasMask()) return;

    // 首次消除需下载模型：弹窗征询，用户点「确定」后才开始下载并显示进度条。
    if (!lamaEngine.isModelReady()) {
      setInpaintStatus('loading');
      try {
        const ok = await ensureDownload({
          title: '下载智能消除模型',
          message:
            '首次使用智能消除需下载 AI 模型（约 200MB），完成后即可离线使用，无需重复下载。是否开始下载？',
          isReady: () => lamaEngine.isModelReady(),
          download: (onProgress) => lamaEngine.preloadModel(onProgress),
        });
        if (!ok) {
          setInpaintStatus('idle');
          return;
        }
      } catch (err) {
        setInpaintStatus(
          'error',
          err instanceof Error ? err.message : String(err),
        );
        return;
      }
    }

    setInpaintStatus('loading');
    try {
      const result = await lamaEngine.inpaint(
        image,
        inpaintMaskEngine.maskCanvas,
        (phase) => setInpaintStatus(phase === 'running' ? 'running' : 'loading'),
      );
      const next = await canvasToImage(result);
      // 记录消除前的原图，供撤销
      eraseUndo.push(snapOf(image));
      eraseRedo = [];
      adoptImage(next.img);
      bumpInpaintMask();
      bumpInpaintHist();
      setInpaintStatus('idle');
    } catch (err) {
      console.error('[LaMa] 消除失败：', err);
      setInpaintStatus(
        'error',
        err instanceof Error ? err.message : String(err),
      );
    }
  }, [setInpaintStatus, bumpInpaintMask, bumpInpaintHist, ensureDownload]);

  const clearMask = useCallback(() => {
    inpaintMaskEngine.clear();
    bumpInpaintMask();
  }, [bumpInpaintMask]);

  const undoErase = useCallback(() => {
    const prev = eraseUndo.pop();
    if (!prev) return;
    const current = useEditorStore.getState().image;
    if (current) eraseRedo.push(snapOf(current));
    adoptImage(prev.img);
    bumpInpaintHist();
    bumpInpaintMask();
  }, [bumpInpaintHist, bumpInpaintMask]);

  const redoErase = useCallback(() => {
    const next = eraseRedo.pop();
    if (!next) return;
    const current = useEditorStore.getState().image;
    if (current) eraseUndo.push(snapOf(current));
    adoptImage(next.img);
    bumpInpaintHist();
    bumpInpaintMask();
  }, [bumpInpaintHist, bumpInpaintMask]);

  const canUndoErase = () => eraseUndo.length > 0;
  const canRedoErase = () => eraseRedo.length > 0;

  return {
    run,
    samClick,
    clearMask,
    undoErase,
    redoErase,
    canUndoErase,
    canRedoErase,
  };
}
