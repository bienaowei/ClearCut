import { useRef } from 'react';
import type { EditorMode } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useHistory } from '../../hooks/useHistory';
import { useExport } from '../../hooks/useExport';

interface Props {
  onPickFile: (file: File) => void;
  onToggleHelp: () => void;
}

const MODES: { key: EditorMode; label: string }[] = [
  { key: 'brush', label: '画笔擦除' },
  { key: 'crop', label: '多边形裁剪' },
  { key: 'retain', label: '多边形保留' },
];

export default function Toolbar({ onPickFile, onToggleHelp }: Props) {
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const image = useEditorStore((s) => s.image);
  const fileRef = useRef<HTMLInputElement>(null);

  const { doUndo, doRedo } = useHistory();
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());

  const { exportBrush, exportCropAll, exportRetain } = useExport();

  const handleExport = () => {
    if (mode === 'brush') exportBrush(false);
    else if (mode === 'crop') void exportCropAll();
    else exportRetain();
  };

  const exportLabel =
    mode === 'brush' ? '导出 PNG' : mode === 'crop' ? '全部导出 (zip)' : '导出 PNG';

  return (
    <div className="toolbar">
      <div className="toolbar-group brand">
        <span className="logo">✂ ClearCut</span>
      </div>

      <div className="toolbar-group modes">
        {MODES.map((m) => (
          <button
            key={m.key}
            className={mode === m.key ? 'active' : ''}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        <button onClick={() => fileRef.current?.click()}>加载图片</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/bmp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="toolbar-group">
        <button onClick={doUndo} disabled={!canUndo} title="撤销 (Ctrl+Z)">
          ↶ 撤销
        </button>
        <button onClick={doRedo} disabled={!canRedo} title="重做 (Ctrl+Shift+Z)">
          ↷ 重做
        </button>
      </div>

      <div className="toolbar-group right">
        <button onClick={onToggleHelp} title="快捷键">
          ⌨ 快捷键
        </button>
        <button className="primary" onClick={handleExport} disabled={!image}>
          {exportLabel}
        </button>
      </div>
    </div>
  );
}
