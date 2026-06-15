import { useEditorStore } from '../../stores/editorStore';
import { useExport } from '../../hooks/useExport';
import { useState } from 'react';

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
      <h3>画笔擦除</h3>
      <p className="hint">在图片上涂抹，擦除区域变为透明。</p>

      <label className="field">
        <span>画笔大小：{brushSize}px</span>
        <input
          type="range"
          min={1}
          max={100}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
        />
      </label>

      <label className="field">
        <span>画笔硬度：{Math.round(brushHardness * 100)}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(brushHardness * 100)}
          onChange={(e) => setBrushHardness(Number(e.target.value) / 100)}
        />
        <small className="muted">硬边完全擦除，软边渐变透明</small>
      </label>

      <hr />

      <label className="checkbox">
        <input
          type="checkbox"
          checked={autoCrop}
          onChange={(e) => setAutoCrop(e.target.checked)}
        />
        <span>导出时自动裁剪到内容包围盒</span>
      </label>

      <button
        className="primary block"
        disabled={!image}
        onClick={() => exportBrush(autoCrop)}
      >
        导出透明 PNG
      </button>
    </div>
  );
}
