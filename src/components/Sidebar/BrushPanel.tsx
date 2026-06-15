import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useExport } from '../../hooks/useExport';
import Icon from '../common/Icon';

export default function BrushPanel() {
  const brushSize = useEditorStore((s) => s.brushSize);
  const brushHardness = useEditorStore((s) => s.brushHardness);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const setBrushHardness = useEditorStore((s) => s.setBrushHardness);
  const image = useEditorStore((s) => s.image);
  const { exportBrush } = useExport();
  const [autoCrop, setAutoCrop] = useState(false);

  return (
    <div className="panel-content">
      <header className="panel-head">
        <span className="panel-icon">
          <Icon name="brush" size={16} />
        </span>
        <div>
          <h3>画笔擦除</h3>
          <p className="hint">涂抹区域变为透明</p>
        </div>
      </header>

      <div className="card">
        <div className="slider-row">
          <label>画笔大小</label>
          <span className="value-badge">{brushSize}px</span>
        </div>
        <input
          type="range"
          min={1}
          max={100}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
        />

        <div className="slider-row">
          <label>画笔硬度</label>
          <span className="value-badge">{Math.round(brushHardness * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(brushHardness * 100)}
          onChange={(e) => setBrushHardness(Number(e.target.value) / 100)}
        />
        <small className="muted">硬边完全擦除，软边渐变透明</small>
      </div>

      <div className="card">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={autoCrop}
            onChange={(e) => setAutoCrop(e.target.checked)}
          />
          <span>导出时自动裁剪到内容包围盒</span>
        </label>
      </div>

      <button
        className="primary block"
        disabled={!image}
        onClick={() => exportBrush(autoCrop)}
      >
        <Icon name="download" />
        导出透明 PNG
      </button>
    </div>
  );
}
