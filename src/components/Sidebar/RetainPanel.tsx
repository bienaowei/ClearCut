import type { RetainExportMode } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useCropStore } from '../../stores/cropStore';
import { useExport } from '../../hooks/useExport';

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
  const hasPoly = polygons.length > 0 && polygons[0].closed;

  return (
    <div className="panel-content">
      <h3>多边形保留</h3>
      <p className="hint">绘制一个区域，内部保留、外部透明。仅保留单个多边形。</p>

      <div className="field">
        <span>导出方式</span>
        <div className="seg vertical">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={retainConfig.mode === m.key ? 'active' : ''}
              onClick={() => setRetainConfig({ mode: m.key })}
            >
              {m.label}
            </button>
          ))}
        </div>
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
                setRetainConfig({ height: Math.max(1, Number(e.target.value)) })
              }
            />
          </label>
        </div>
      )}

      {retainConfig.mode !== 'origin' && (
        <label className="field">
          <span>内边距：{retainConfig.padding}px</span>
          <input
            type="range"
            min={0}
            max={100}
            value={retainConfig.padding}
            onChange={(e) =>
              setRetainConfig({ padding: Number(e.target.value) })
            }
          />
        </label>
      )}

      <button
        className="primary block"
        disabled={!hasPoly}
        onClick={exportRetain}
      >
        导出透明 PNG
      </button>
    </div>
  );
}
