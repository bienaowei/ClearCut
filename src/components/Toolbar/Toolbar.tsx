import { useRef } from 'react';
import type { EditorMode } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useHistory } from '../../hooks/useHistory';
import { useExport } from '../../hooks/useExport';
import Icon, { type IconName } from '../common/Icon';

interface Props {
  onPickFile: (file: File) => void;
  onToggleHelp: () => void;
}

const MODES: { key: EditorMode; label: string; icon: IconName }[] = [
  { key: 'brush', label: '画笔擦除', icon: 'brush' },
  { key: 'crop', label: '多边形裁剪', icon: 'scissors' },
  { key: 'retain', label: '多边形保留', icon: 'lasso' },
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

  const exportLabel = mode === 'crop' ? '全部导出' : '导出 PNG';

  return (
    <div className="toolbar">
      <div className="toolbar-group brand">
        <span className="logo">
          <Icon name="scissors" size={18} />
          ClearCut
        </span>
      </div>

      <span className="toolbar-divider" />

      <div className="seg-control modes">
        {MODES.map((m) => (
          <button
            key={m.key}
            className={`seg-item${mode === m.key ? ' active' : ''}`}
            onClick={() => setMode(m.key)}
          >
            <Icon name={m.icon} size={15} />
            {m.label}
          </button>
        ))}
      </div>

      <span className="toolbar-divider" />

      <div className="toolbar-group">
        <button onClick={() => fileRef.current?.click()}>
          <Icon name="image-plus" />
          加载图片
        </button>
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
        <button
          className="icon-btn ghost"
          onClick={doUndo}
          disabled={!canUndo}
          title="撤销 (Ctrl+Z)"
        >
          <Icon name="undo" />
        </button>
        <button
          className="icon-btn ghost"
          onClick={doRedo}
          disabled={!canRedo}
          title="重做 (Ctrl+Shift+Z)"
        >
          <Icon name="redo" />
        </button>
      </div>

      <div className="toolbar-group right">
        <button className="icon-btn ghost" onClick={onToggleHelp} title="快捷键">
          <Icon name="keyboard" />
        </button>
        <button className="primary" onClick={handleExport} disabled={!image}>
          <Icon name="download" />
          {exportLabel}
        </button>
      </div>
    </div>
  );
}
