import { useCallback, useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useCropStore } from '../stores/cropStore';
import { useHistoryStore } from '../stores/historyStore';
import { brushEngine } from '../utils/brushEngine';
import { keepMaskEngine } from '../utils/keepMaskEngine';
import { samEngine } from '../utils/samEngine';
import { inpaintMaskEngine } from '../utils/inpaintMaskEngine';
import { resetEraseHistory } from './useInpaint';
import { useAlert } from '../components/common/ConfirmDialog';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];

/**
 * 当前图片的 blob URL。必须在图片整个生命周期内保持有效：
 * 浏览器在内存压力下会丢弃已解码的位图，之后会用 img.src 重新解码，
 * 若此时 URL 已被吊销，drawImage 会画出空白（表现为“图片被清空”）。
 * 因此只在加载新图 / 清除时才吊销上一张的 URL。
 */
let currentObjectUrl: string | null = null;

function releaseCurrentObjectUrl(): void {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      // 吊销上一张、保留当前这张，避免位图被回收后无法重新解码
      releaseCurrentObjectUrl();
      currentObjectUrl = url;
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}

/**
 * 计算图片自适应视口的初始缩放与居中偏移。
 */
function fitImage(
  img: HTMLImageElement,
  viewport: { width: number; height: number },
) {
  const margin = 40;
  const scale = Math.min(
    (viewport.width - margin) / img.naturalWidth,
    (viewport.height - margin) / img.naturalHeight,
    1,
  );
  const zoom = scale > 0 ? scale : 1;
  return {
    zoom,
    offset: {
      x: (viewport.width - img.naturalWidth * zoom) / 2,
      y: (viewport.height - img.naturalHeight * zoom) / 2,
    },
  };
}

export function useImageLoader(
  viewportRef: React.RefObject<HTMLDivElement>,
) {
  const setImage = useEditorStore((s) => s.setImage);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setOffset = useEditorStore((s) => s.setOffset);
  const clearCrop = useCropStore((s) => s.clear);
  const resetHistory = useHistoryStore((s) => s.reset);
  const alert = useAlert();

  const applyImage = useCallback(
    async (blob: Blob, name?: string) => {
      const img = await loadImageFromBlob(blob);
      setImage(img, name);
      brushEngine.init(img);
      keepMaskEngine.init(img.naturalWidth, img.naturalHeight);
      inpaintMaskEngine.init(img.naturalWidth, img.naturalHeight);
      resetEraseHistory();
      samEngine.resetImage();
      useEditorStore.getState().setSamPoints([]);
      useEditorStore.getState().setSamStatus('idle');
      useEditorStore.getState().setInpaintStatus('idle');
      useEditorStore.getState().bumpSam();
      useEditorStore.getState().bumpInpaintMask();
      useEditorStore.getState().bumpInpaintHist();
      clearCrop();
      resetHistory({ kind: 'brush', mask: null });

      const vp = viewportRef.current;
      if (vp) {
        const { zoom, offset } = fitImage(img, {
          width: vp.clientWidth,
          height: vp.clientHeight,
        });
        setZoom(zoom);
        setOffset(offset);
      }
    },
    [setImage, setZoom, setOffset, clearCrop, resetHistory, viewportRef],
  );

  const loadFromFile = useCallback(
    (file: File) => {
      if (!ACCEPTED.includes(file.type)) {
        void alert({
          title: '无法加载图片',
          message: '不支持的图片格式，请使用 JPG / PNG / WEBP / BMP',
        });
        return;
      }
      void applyImage(file, stripExt(file.name));
    },
    [applyImage, alert],
  );

  /** 清除当前图片，恢复到空白初始状态 */
  const clearImage = useCallback(() => {
    releaseCurrentObjectUrl();
    setImage(null, 'image');
    brushEngine.dispose();
    keepMaskEngine.dispose();
    inpaintMaskEngine.dispose();
    resetEraseHistory();
    samEngine.resetImage();
    useEditorStore.getState().setSamPoints([]);
    useEditorStore.getState().setSamStatus('idle');
    useEditorStore.getState().setInpaintStatus('idle');
    clearCrop();
    resetHistory();
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [setImage, clearCrop, resetHistory, setZoom, setOffset]);

  // 粘贴剪贴板图片
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            void applyImage(file, 'pasted');
            e.preventDefault();
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [applyImage]);

  return { loadFromFile, clearImage };
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}
