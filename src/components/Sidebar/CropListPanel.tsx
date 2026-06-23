import { useMemo, useRef, useState } from 'react';
import type { ExportSizeMode } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useCropStore, type LabelEntry } from '../../stores/cropStore';
import { useExport } from '../../hooks/useExport';
import { usePick } from '../../hooks/usePick';
import Icon from '../common/Icon';

const BATCH_NAME_PLACEHOLDER = `粘贴 JSON，例如：
{
  "chalk": "粉笔",
  "duster": "板擦",
  "ruler": "尺子"
}

或一行一个名字：
粉笔
板擦
尺子`;

function parseBatchNames(raw: string): LabelEntry[] {
  const text = raw.trim();
  if (!text) return [];
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.entries(obj).map(([k, v]) => ({
        key: k,
        value: v == null ? undefined : String(v),
      }));
    }
    if (Array.isArray(obj)) {
      return obj.map((v) => ({ key: String(v) }));
    }
  } catch {
    // fall through to newline mode
  }
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ key: s }));
}

const SIZE_MODES: { key: ExportSizeMode; label: string }[] = [
  { key: 'fixed', label: '固定' },
  { key: 'adaptive', label: '自适应' },
  { key: 'original', label: '原始' },
];

export default function CropListPanel() {
  const exportConfig = useEditorStore((s) => s.exportConfig);
  const setExportConfig = useEditorStore((s) => s.setExportConfig);
  const drawMethod = useEditorStore((s) => s.drawMethod);
  const pickAlphaThreshold = useEditorStore((s) => s.pickAlphaThreshold);
  const setPickAlphaThreshold = useEditorStore((s) => s.setPickAlphaThreshold);
  const hasImage = useEditorStore((s) => s.image !== null);
  const polygons = useCropStore((s) => s.polygons);
  const activeId = useCropStore((s) => s.activePolygonId);
  const setActive = useCropStore((s) => s.setActive);
  const updatePolygon = useCropStore((s) => s.updatePolygon);
  const removePolygon = useCropStore((s) => s.removePolygon);
  const reorder = useCropStore((s) => s.reorder);
  const labels = useCropStore((s) => s.labels);
  const labelCursor = useCropStore((s) => s.labelCursor);
  const setLabels = useCropStore((s) => s.setLabels);
  const clearLabels = useCropStore((s) => s.clearLabels);
  const takeLabels = useCropStore((s) => s.takeLabels);
  const nextEntry =
    labelCursor < labels.length ? labels[labelCursor] : null;
  const remainingLabels = Math.max(0, labels.length - labelCursor);

  const { computeCropResults, exportCropSingle, exportCropAll } = useExport();
  const isExporting = useEditorStore((s) => s.isExporting);
  const { pickAll } = usePick();
  const isPick = drawMethod === 'pick';
  const dragIndex = useRef<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');

  const applyBatchNames = () => {
    const entries = parseBatchNames(batchText);
    if (entries.length === 0) {
      alert('没有解析到名称');
      return;
    }
    // 1) 设为标签队列，游标归零（后续新建多边形会按顺序消费）
    setLabels(entries);
    // 2) 立刻按顺序应用到现有多边形，并把游标推进相应步数
    const used = Math.min(entries.length, polygons.length);
    for (let i = 0; i < used; i++) {
      updatePolygon(polygons[i].id, { name: entries[i].key });
    }
    if (used > 0) takeLabels(used);
    setBatchOpen(false);
    setBatchText('');
  };

  const results = useMemo(
    () => computeCropResults(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      JSON.stringify(polygons.map((p) => ({ id: p.id, pts: p.points }))),
      exportConfig.mode,
      exportConfig.width,
      exportConfig.height,
      exportConfig.padding,
    ],
  );
  const resultMap = useMemo(
    () => new Map(results.map((r) => [r.polygon.id, r])),
    [results],
  );

  return (
    <div className="panel-content">
      <header className="panel-head">
        <span className="panel-icon">
          <Icon name="scissors" size={16} />
        </span>
        <div>
          <h3>多边形裁剪</h3>
          <p className="hint">
            {isPick
              ? '点击物品自动框出 · 或下方一键全分'
              : '单击加点 · 双击/点起点闭合 · ESC 取消'}
          </p>
        </div>
      </header>

      {isPick && (
        <div className="card">
          <label className="card-label">点选裁剪</label>
          <div className="slider-row">
            <label>透明阈值</label>
            <span className="value-badge">{pickAlphaThreshold}</span>
          </div>
          <input
            type="range"
            min={0}
            max={128}
            value={pickAlphaThreshold}
            onChange={(e) => setPickAlphaThreshold(Number(e.target.value))}
          />
          <p className="hint">
            alpha 大于阈值的像素算作物品；半透明边缘多则调高
          </p>
          <button
            className="block"
            disabled={!hasImage}
            onClick={() => {
              const n = pickAll();
              if (n === 0) alert('没有识别到不透明物品');
            }}
          >
            <Icon name="target" />
            一键全分
          </button>
        </div>
      )}

      <div className="card">
        <label className="card-label">导出尺寸</label>
        <div className="seg-control">
          {SIZE_MODES.map((m) => (
            <button
              key={m.key}
              className={`seg-item${exportConfig.mode === m.key ? ' active' : ''}`}
              onClick={() => setExportConfig({ mode: m.key })}
            >
              {m.label}
            </button>
          ))}
        </div>

        {exportConfig.mode === 'fixed' && (
          <div className="row">
            <label className="field">
              <span>宽</span>
              <input
                type="number"
                min={1}
                value={exportConfig.width}
                onChange={(e) =>
                  setExportConfig({ width: Math.max(1, Number(e.target.value)) })
                }
              />
            </label>
            <label className="field">
              <span>高</span>
              <input
                type="number"
                min={1}
                value={exportConfig.height}
                onChange={(e) =>
                  setExportConfig({
                    height: Math.max(1, Number(e.target.value)),
                  })
                }
              />
            </label>
          </div>
        )}

        <div className="slider-row">
          <label>内边距</label>
          <span className="value-badge">{exportConfig.padding}px</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={exportConfig.padding}
          onChange={(e) => setExportConfig({ padding: Number(e.target.value) })}
        />
      </div>

      <div className="list-header">
        <span>裁剪列表</span>
        <span className="count-badge">{polygons.length}</span>
        <button
          className="ghost batch-rename-btn"
          onClick={() => setBatchOpen(true)}
          title="粘贴 JSON 设置后续命名顺序"
        >
          <Icon name="wand" size={12} />
          标签预填
        </button>
      </div>
      {nextEntry !== null ? (
        <div
          className="next-label-row"
          title={`剩余 ${remainingLabels} 个标签`}
        >
          <span className="next-label-chip">
            <span className="next-label-prefix">下一个</span>
            <b>{nextEntry.key}</b>
            {nextEntry.value ? (
              <span className="next-label-val">（{nextEntry.value}）</span>
            ) : null}
            <span className="next-label-rest">· 剩 {remainingLabels}</span>
            <button
              className="icon-btn ghost next-label-clear"
              onClick={clearLabels}
              title="清空标签队列"
            >
              <Icon name="close" size={10} />
            </button>
          </span>
        </div>
      ) : null}

      <div className="crop-list">
        {polygons.length === 0 && (
          <p className="empty-list muted">
            {isPick ? '点击画布上的物品，或点「一键全分」' : '还没有多边形，在画布上绘制一个'}
          </p>
        )}
        {polygons.map((poly, i) => {
          const r = resultMap.get(poly.id);
          return (
            <div
              key={poly.id}
              className={`crop-item${poly.id === activeId ? ' active' : ''}${
                dropIndex === i ? ' drop-target' : ''
              }`}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dropIndex !== i) setDropIndex(i);
              }}
              onDragLeave={() => setDropIndex((d) => (d === i ? null : d))}
              onDrop={() => {
                if (dragIndex.current !== null && dragIndex.current !== i) {
                  reorder(dragIndex.current, i);
                }
                dragIndex.current = null;
                setDropIndex(null);
              }}
              onClick={() => setActive(poly.id)}
            >
              <span className="grip">
                <Icon name="grip" size={14} />
              </span>
              <span className="seq">{i + 1}</span>
              <div className="thumb">
                {r ? <img src={r.dataUrl} alt={poly.name} /> : null}
              </div>
              <div className="meta">
                <input
                  className="name-input"
                  value={poly.name}
                  onChange={(e) =>
                    updatePolygon(poly.id, { name: e.target.value })
                  }
                  onClick={(e) => e.stopPropagation()}
                />
                <small className="muted">{r ? `${r.width}×${r.height}` : '—'}</small>
              </div>
              <div className="item-actions">
                <button
                  className="icon-btn ghost"
                  title="单独导出"
                  onClick={(e) => {
                    e.stopPropagation();
                    exportCropSingle(poly);
                  }}
                >
                  <Icon name="download" size={14} />
                </button>
                <button
                  className="icon-btn ghost danger-hover"
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePolygon(poly.id);
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {batchOpen && (
        <div
          className="modal-overlay"
          onClick={() => setBatchOpen(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Icon name="wand" size={16} /> 标签预填
              </h3>
              <button
                className="icon-btn ghost"
                onClick={() => setBatchOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <p className="hint" style={{ marginBottom: 8 }}>
              立即按顺序命名现有 {polygons.length} 个，剩余标签留给后续新建的物品
            </p>
            <textarea
              className="batch-textarea"
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={BATCH_NAME_PLACEHOLDER}
              rows={12}
              autoFocus
            />
            <div className="confirm-actions" style={{ marginTop: 12 }}>
              <button onClick={() => setBatchOpen(false)}>取消</button>
              <button className="primary" onClick={applyBatchNames}>
                应用
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        className="primary block"
        disabled={polygons.length === 0 || isExporting}
        onClick={() => void exportCropAll()}
      >
        {isExporting ? (
          <>
            <Icon name="loader" className="spin" />
            打包中…
          </>
        ) : (
          <>
            <Icon name="download" />
            全部导出 (zip)
          </>
        )}
      </button>
    </div>
  );
}
