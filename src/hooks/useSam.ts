import { useCallback, useRef } from 'react';
import type { Point, SamPoint } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { useHistory } from './useHistory';
import { samEngine, type SamPrompt } from '../utils/samEngine';
import { keepMaskEngine } from '../utils/keepMaskEngine';

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
  /** 当前图是否已写入 SAM 历史基线（用于撤销回到空选择） */
  const baselineRef = useRef(false);

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
      setSamStatus('error', err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [setSamStatus]);

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
        setSamStatus('error', err instanceof Error ? err.message : String(err));
      }
    },
    [prepare, setSamPoints, setSamStatus, commitSam],
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
