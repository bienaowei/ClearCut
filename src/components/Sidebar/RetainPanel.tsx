import type { RetainExportMode } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useCropStore } from '../../stores/cropStore';
import { useExport } from '../../hooks/useExport';
import Icon from '../common/Icon';

const MODES: { key: RetainExportMode; label: string }[] = [
  { key: 'origin', label: '保留原图尺寸' },
  { key: 'bbox', label: '裁剪到包围盒' },
  { key: 'fixed', label: '指定尺寸' },
];

export default function RetainPanel() {
  const retainConfig = useEditorStore((s) => s.retainConfig);
  const setRetainConfig = useEditorStore((s) => s.setRetainConfig);
  const polygons = useCropStore((s) => s.polygons);
  const { exportRetain } = useExport();
  const isExporting = useEditorStore((s) => s.isExporting);
  const hasPoly = polygons.some((p) => p.closed && p.points.length >= 3);

  return (
    <div className="panel-content">
      <header className="panel-head">
        <span className="panel-icon">
          <Icon name="lasso" size={16} />
        </span>
        <div>
          <h3>多边形保留</h3>
          <p className="hint">内部保留 · 外部透明（可多个区域）</p>
        </div>
      </header>

      <div className="card">
        <label className="card-label">导出方式</label>
        <div className="seg-control vertical">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`seg-item${retainConfig.mode === m.key ? ' active' : ''}`}
              onClick={() => setRetainConfig({ mode: m.key })}
            >
              {m.label}
            </button>
          ))}
        </div>

        {retainConfig.mode === 'fixed' && (
          <div className="row">
            <label className="field">
              <span>宽</span>
              <input
                type="number"
                min={1}
                value={retainConfig.width}
                onChange={(e) =>
                  setRetainConfig({ width: Math.max(1, Number(e.target.value)) })
                }
              />
            </label>
            <label className="field">
              <span>高</span>
              <input
                type="number"
                min={1}
                value={retainConfig.height}
                onChange={(e) =>
                  setRetainConfig({
                    height: Math.max(1, Number(e.target.value)),
                  })
                }
              />
            </label>
          </div>
        )}

        {retainConfig.mode !== 'origin' && (
          <>
            <div className="slider-row">
              <label>内边距</label>
              <span className="value-badge">{retainConfig.padding}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={retainConfig.padding}
              onChange={(e) =>
                setRetainConfig({ padding: Number(e.target.value) })
              }
            />
          </>
        )}
      </div>

      <button
        className="primary block"
        disabled={!hasPoly || isExporting}
        onClick={() => void exportRetain()}
      >
        {isExporting ? (
          <>
            <Icon name="loader" className="spin" />
            导出中…
          </>
        ) : (
          <>
            <Icon name="download" />
            导出透明 PNG
          </>
        )}
      </button>
    </div>
  );
}
