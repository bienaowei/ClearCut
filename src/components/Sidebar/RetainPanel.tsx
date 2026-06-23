import type { RetainExportMode, SamStatus } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useCropStore } from '../../stores/cropStore';
import { useExport } from '../../hooks/useExport';
import { useSam } from '../../hooks/useSam';
import { keepMaskEngine } from '../../utils/keepMaskEngine';
import Icon from '../common/Icon';

const MODES: { key: RetainExportMode; label: string }[] = [
  { key: 'origin', label: '保留原图尺寸' },
  { key: 'bbox', label: '裁剪到包围盒' },
  { key: 'fixed', label: '指定尺寸' },
];

const SAM_STATUS_TEXT: Record<SamStatus, string> = {
  idle: '点击物品即可智能选中',
  'loading-model': '正在加载 AI 模型（首次较慢）…',
  encoding: '正在分析图片…',
  ready: '点击物品加选 · Shift+点击排除',
  segmenting: '正在识别…',
  error: '加载失败',
};

export default function RetainPanel() {
  const retainConfig = useEditorStore((s) => s.retainConfig);
  const setRetainConfig = useEditorStore((s) => s.setRetainConfig);
  const drawMethod = useEditorStore((s) => s.drawMethod);
  const polygons = useCropStore((s) => s.polygons);
  const { exportRetain } = useExport();
  const sam = useSam();
  const isExporting = useEditorStore((s) => s.isExporting);

  const isSam = drawMethod === 'sam';
  const samStatus = useEditorStore((s) => s.samStatus);
  const samError = useEditorStore((s) => s.samError);
  const samPoints = useEditorStore((s) => s.samPoints);
  // samVersion 变化时重算 hasKeep（keepMaskEngine 非响应式）
  const samVersion = useEditorStore((s) => s.samVersion);
  void samVersion;

  const hasPoly = polygons.some((p) => p.closed && p.points.length >= 3);
  // 可导出条件 = SAM 蒙版 ∪ 多边形/套索（二者任一有内容即可）
  const hasKeep = keepMaskEngine.hasKeep() || hasPoly;
  const busy = samStatus === 'loading-model' || samStatus === 'encoding';

  return (
    <div className="panel-content">
      <header className="panel-head">
        <span className="panel-icon">
          <Icon name={isSam ? 'wand' : 'lasso'} size={16} />
        </span>
        <div>
          <h3>{isSam ? '智能点选 (SAM)' : '多边形保留'}</h3>
          <p className="hint">
            {isSam
              ? '点物品自动描边 · 可与多边形/套索叠加'
              : '内部保留 · 可与智能点选叠加'}
          </p>
        </div>
      </header>

      {isSam && (
        <div className="card">
          <div className="slider-row">
            <label>状态</label>
            {busy && <Icon name="loader" size={14} className="spin" />}
          </div>
          <p className="hint" style={{ margin: '2px 0 0' }}>
            {samStatus === 'error'
              ? `加载失败：${samError ?? ''}`
              : SAM_STATUS_TEXT[samStatus]}
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="primary"
              style={{ flex: 1 }}
              disabled={samPoints.length === 0}
              onClick={() => sam.commit()}
              title="确认当前物体并开始下一个 (Enter)"
            >
              <Icon name="target" />
              确认 (Enter)
            </button>
            <button
              className="ghost"
              disabled={samPoints.length === 0}
              onClick={() => sam.cancelPending()}
              title="放弃当前未确认的选择 (Esc)"
            >
              放弃
            </button>
          </div>
        </div>
      )}

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
        disabled={!hasKeep || isExporting}
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
