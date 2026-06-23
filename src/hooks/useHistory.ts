import { useCallback } from 'react';
import { useHistoryStore, type HistorySnapshot } from '../stores/historyStore';
import { useCropStore } from '../stores/cropStore';
import { useEditorStore } from '../stores/editorStore';
import { brushEngine } from '../utils/brushEngine';
import { keepMaskEngine } from '../utils/keepMaskEngine';

/** 把一个快照应用回对应的领域状态 */
function applySnapshot(snapshot: HistorySnapshot) {
  if (snapshot.kind === 'brush') {
    brushEngine.restore(snapshot.mask);
  } else if (snapshot.kind === 'sam') {
    keepMaskEngine.restore(snapshot.keep);
    useEditorStore.getState().setSamPoints([]);
    useEditorStore.getState().bumpSam();
  } else {
    useCropStore
      .getState()
      .setPolygons(snapshot.polygons, snapshot.activePolygonId);
  }
}

export function useHistory() {
  const commit = useHistoryStore((s) => s.commit);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  /** 提交当前画笔遮罩为一个检查点 */
  const commitBrush = useCallback(() => {
    commit({ kind: 'brush', mask: brushEngine.snapshot() });
  }, [commit]);

  /** 提交当前 SAM 保留蒙版为一个检查点 */
  const commitSam = useCallback(() => {
    commit({ kind: 'sam', keep: keepMaskEngine.snapshot() });
  }, [commit]);

  /** 提交当前多边形集合为一个检查点 */
  const commitPolygons = useCallback(() => {
    const { polygons, activePolygonId } = useCropStore.getState();
    commit({
      kind: 'polygons',
      // 深拷贝，避免后续 mutation 影响历史
      polygons: JSON.parse(JSON.stringify(polygons)),
      activePolygonId,
    });
  }, [commit]);

  const doUndo = useCallback(() => {
    const snap = undo();
    if (snap) applySnapshot(snap);
  }, [undo]);

  const doRedo = useCallback(() => {
    const snap = redo();
    if (snap) applySnapshot(snap);
  }, [redo]);

  return { commitBrush, commitSam, commitPolygons, doUndo, doRedo };
}
