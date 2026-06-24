import { useCallback, useRef } from 'react';
import type { Point, SamPoint } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { useHistory } from './useHistory';
import {
  samEngine,
  WebGpuIncompatibleError,
  type SamPrompt,
} from '../utils/samEngine';
import { keepMaskEngine } from '../utils/keepMaskEngine';
import { useConfirm } from '../components/common/ConfirmDialog';

/**
 * SAM 智能点选编排：
 *  - prepare：懒加载模型 + 对当前图编码一次。
 *  - addPoint：追加正/负提示点 → 即时分割 → 更新 pending 预览。
 *  - commit：确认当前物体，合并进保留蒙版，开始下一个。
 */
export function useSam() {
  const { commitSam } = useHistory();
  const setSamStatus = useEditorStore((s) => s.setSamStatus);
  const setSamPoints = useEditorStore((s) => s.setSamPoints);
  const bumpSam = useEditorStore((s) => s.bumpSam);
  const confirm = useConfirm();
  /** 当前图是否已写入 SAM 历史基线（用于撤销回到空选择） */
  const baselineRef = useRef(false);

  /**
   * 统一处理 SAM 错误：若本机 WebGPU 与模型不兼容，弹窗征询后刷新页面
   * （刷新后会从头以 WASM 兼容模式运行）；否则照常置为错误状态。
   */
  const handleSamError = useCallback(
    async (err: unknown) => {
      if (err instanceof WebGpuIncompatibleError) {
        setSamStatus('error', '智能点选需刷新页面后使用');
        const ok = await confirm({
          title: '需要刷新页面',
          message:
            '当前显卡的 WebGPU 与智能点选模型不兼容。刷新后将自动切换为兼容模式（CPU 运算，速度稍慢但更稳定）。\n\n是否立即刷新？也可稍后手动刷新启用兼容模式。',
          confirmText: '立即刷新',
          cancelText: '稍后',
        });
        if (ok) location.reload();
        return;
      }
      setSamStatus('error', err instanceof Error ? err.message : String(err));
    },
    [confirm, setSamStatus],
  );

  /** 切图时调用：清空提示点、编码缓存与基线标记 */
  const reset = useCallback(() => {
    samEngine.resetImage();
    setSamPoints([]);
    baselineRef.current = false;
    if (useEditorStore.getState().samStatus !== 'error') {
      setSamStatus('idle');
    }
  }, [setSamPoints, setSamStatus]);

  /** 确保模型已加载、当前图已编码。返回是否就绪。 */
  const prepare = useCallback(async (): Promise<boolean> => {
    const image = useEditorStore.getState().image;
    if (!image) return false;
    try {
      if (!samEngine.isEncoded(image)) {
        setSamStatus('loading-model');
        await samEngine.ensureModel();
        setSamStatus('encoding');
        await samEngine.setImage(image, image);
      }
      setSamStatus('ready');
      return true;
    } catch (err) {
      await handleSamError(err);
      return false;
    }
  }, [setSamStatus, handleSamError]);

  /** 追加一个提示点并重新分割 */
  const addPoint = useCallback(
    async (pt: Point, label: 0 | 1) => {
      const image = useEditorStore.getState().image;
      if (!image) return;
      // 负点必须建立在已有点之上才有意义
      const prev = useEditorStore.getState().samPoints;
      if (label === 0 && prev.length === 0) return;

      const ok = await prepare();
      if (!ok) return;

      // 首次落点前写入一条空基线，保证撤销能回到“未选择”
      if (!baselineRef.current && !keepMaskEngine.hasKeep()) {
        commitSam();
        baselineRef.current = true;
      }

      const next: SamPoint[] = [...prev, { x: pt.x, y: pt.y, label }];
      setSamPoints(next);
      setSamStatus('segmenting');
      try {
        const mask = await samEngine.segment(next as SamPrompt[]);
        keepMaskEngine.setPending(mask);
        setSamStatus('ready');
      } catch (err) {
        await handleSamError(err);
      }
    },
    [prepare, setSamPoints, setSamStatus, commitSam, handleSamError],
  );

  /** 确认当前物体：合并进保留蒙版，清空提示点，存历史 */
  const commit = useCallback(() => {
    if (!keepMaskEngine.hasPending()) return;
    keepMaskEngine.commitPending();
    setSamPoints([]);
    commitSam();
    bumpSam();
  }, [setSamPoints, commitSam, bumpSam]);

  /** 放弃当前未确认物体 */
  const cancelPending = useCallback(() => {
    keepMaskEngine.clearPending();
    setSamPoints([]);
  }, [setSamPoints]);

  return { prepare, addPoint, commit, cancelPending, reset };
}
