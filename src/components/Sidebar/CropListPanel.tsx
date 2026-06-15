import { useMemo, useRef, useState } from 'react';
import type { ExportSizeMode } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useCropStore } from '../../stores/cropStore';
import { useExport } from '../../hooks/useExport';

const SIZE_MODES: { key: ExportSizeMode; label: string }[] = [
  { key: 'fixed', label: '固定尺寸' },
  { key: 'adaptive', label: '自适应统一' },
  { key: 'original', label: '原始尺寸' },
];

export default function CropListPanel() {
  const exportConfig = useEditorStore((s) => s.exportConfig);
  const setExportConfig = useEditorStore((s) => s.setExportConfig);
  const polygons = useCropStore((s) => s.polygons);
  const activeId = useCropStore((s) => s.activePolygonId);
  const setActive = useCropStore((s) => s.setActive);
  const updatePolygon = useCropStore((s) => s.updatePolygon);
  const removePolygon = useCropStore((s) => s.removePolygon);
  const reorder = useCropStore((s) => s.reorder);

  const { computeCropResults, exportCropSingle, exportCropAll } = useExport();
  const dragIndex = useRef<number | null>(null);
  const [, force] = useState(0);

  // 预览结果（随多边形与配置变化重算）
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
      <h3>多边形裁剪</h3>
      <p className="hint">单击加顶点，双击/点起点闭合，ESC 取消。</p>

      <div className="field">
        <span>导出尺寸模式</span>
        <div className="seg">
          {SIZE_MODES.map((m) => (
            <button
              key={m.key}
              className={exportConfig.mode === m.key ? 'active' : ''}
              onClick={() => setExportConfig({ mode: m.key })}
            >
              {m.label}
            </button>
          ))}
        </div>
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
                setExportConfig({ height: Math.max(1, Number(e.target.value)) })
              }
            />
          </label>
        </div>
      )}

      <label className="field">
        <span>内边距：{exportConfig.padding}px</span>
        <input
          type="range"
          min={0}
          max={100}
          value={exportConfig.padding}
          onChange={(e) => setExportConfig({ padding: Number(e.target.value) })}
        />
      </label>

      <hr />

      <div className="list-header">
        <span>裁剪列表（{polygons.length}）</span>
      </div>

      <div className="crop-list">
        {polygons.length === 0 && (
          <p className="muted">还没有多边形，在画布上绘制一个。</p>
        )}
        {polygons.map((poly, i) => {
          const r = resultMap.get(poly.id);
          return (
            <div
              key={poly.id}
              className={`crop-item${poly.id === activeId ? ' active' : ''}`}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex.current !== null && dragIndex.current !== i) {
                  reorder(dragIndex.current, i);
                  force((n) => n + 1);
                }
                dragIndex.current = null;
              }}
              onClick={() => setActive(poly.id)}
            >
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
                <small className="muted">
                  {r ? `${r.width}×${r.height}` : '—'}
                </small>
              </div>
              <div className="item-actions">
                <button
                  title="单独导出"
                  onClick={(e) => {
                    e.stopPropagation();
                    exportCropSingle(poly);
                  }}
                >
                  ⬇
                </button>
                <button
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePolygon(poly.id);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="primary block"
        disabled={polygons.length === 0}
        onClick={() => void exportCropAll()}
      >
        全部导出 (zip)
      </button>
    </div>
  );
}
