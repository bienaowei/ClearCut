import { useState } from 'react';
import type { BrushTool } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useExport } from '../../hooks/useExport';
import { useHistory } from '../../hooks/useHistory';
import { brushEngine } from '../../utils/brushEngine';
import { toleranceToDistance } from '../../utils/magicWand';
import Icon, { type IconName } from '../common/Icon';

const TOOLS: { key: BrushTool; label: string; icon: IconName }[] = [
  { key: 'brush', label: '画笔', icon: 'brush' },
  { key: 'wand', label: '魔术棒', icon: 'wand' },
  { key: 'restore', label: '恢复', icon: 'undo' },
];

export default function BrushPanel() {
  const brushTool = useEditorStore((s) => s.brushTool);
  const setBrushTool = useEditorStore((s) => s.setBrushTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const brushHardness = useEditorStore((s) => s.brushHardness);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const setBrushHardness = useEditorStore((s) => s.setBrushHardness);
  const wandTolerance = useEditorStore((s) => s.wandTolerance);
  const wandContiguous = useEditorStore((s) => s.wandContiguous);
  const setWandTolerance = useEditorStore((s) => s.setWandTolerance);
  const setWandContiguous = useEditorStore((s) => s.setWandContiguous);
  const image = useEditorStore((s) => s.image);
  const { exportBrush } = useExport();
  const { commitBrush } = useHistory();
  const [autoCrop, setAutoCrop] = useState(false);

  // 一键去背：取四角作种子，连通漫水去掉背景
  const handleAutoRemove = () => {
    if (!image) return;
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const seeds = [
      { x: 0, y: 0 },
      { x: w - 1, y: 0 },
      { x: 0, y: h - 1 },
      { x: w - 1, y: h - 1 },
    ];
    const ok = brushEngine.magicErase(seeds, {
      tolerance: toleranceToDistance(wandTolerance),
      contiguous: true,
    });
    if (ok) commitBrush();
  };

  return (
    <div className="panel-content">
      <header className="panel-head">
        <span className="panel-icon">
          <Icon name="brush" size={16} />
        </span>
        <div>
          <h3>画笔擦除</h3>
          <p className="hint">手动涂抹或一键去背</p>
        </div>
      </header>

      <div className="card">
        <button
          className="primary block"
          disabled={!image}
          onClick={handleAutoRemove}
        >
          <Icon name="wand" />
          一键去背景
        </button>
        <small className="muted">
          自动识别四角背景并抹除。可再用画笔/魔术棒补刀，Ctrl+Z 撤销。
        </small>
      </div>

      <div className="card">
        <div className="seg-control" style={{ width: '100%' }}>
          {TOOLS.map((t) => (
            <button
              key={t.key}
              className={`seg-item${brushTool === t.key ? ' active' : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setBrushTool(t.key)}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </button>
          ))}
        </div>

        {brushTool === 'brush' || brushTool === 'restore' ? (
          <>
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
              <span className="value-badge">
                {Math.round(brushHardness * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(brushHardness * 100)}
              onChange={(e) => setBrushHardness(Number(e.target.value) / 100)}
            />
            <small className="muted">
              {brushTool === 'restore'
                ? '在误擦区域涂抹即可恢复原图像素'
                : '硬边完全擦除，软边渐变透明'}
            </small>
          </>
        ) : (
          <>
            <div className="slider-row">
              <label>容差</label>
              <span className="value-badge">{wandTolerance}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={wandTolerance}
              onChange={(e) => setWandTolerance(Number(e.target.value))}
            />
            <small className="muted">值越大去除范围越广，过大会误删主体</small>

            <label className="checkbox" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={wandContiguous}
                onChange={(e) => setWandContiguous(e.target.checked)}
              />
              <span>仅去除连通区域（关闭则清除全图同色）</span>
            </label>
            <small className="muted">在画布上点击背景即可擦除</small>
          </>
        )}
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
