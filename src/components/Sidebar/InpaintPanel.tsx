import type { InpaintStatus, SamStatus } from '../../types';
import { useEditorStore } from '../../stores/editorStore';
import { useInpaint } from '../../hooks/useInpaint';
import { inpaintMaskEngine } from '../../utils/inpaintMaskEngine';
import Icon from '../common/Icon';

const STATUS_TEXT: Record<InpaintStatus, string> = {
  idle: '点「消除」由 AI 补全背景',
  loading: '正在加载 AI 模型（首次约 200MB，请耐心等待）…',
  running: '正在消除并填充背景…',
  error: '消除失败',
};

const SAM_STATUS_TEXT: Record<SamStatus, string> = {
  idle: '点物体即可智能选中要消除的东西',
  'loading-model': '正在加载智能点选模型（首次较慢）…',
  encoding: '正在分析图片…',
  ready: '点物体加选 · 可多次点选不同物体',
  segmenting: '正在识别…',
  error: '加载失败',
};

export default function InpaintPanel() {
  const tool = useEditorStore((s) => s.inpaintTool);
  const brushSize = useEditorStore((s) => s.inpaintBrushSize);
  const setBrushSize = useEditorStore((s) => s.setInpaintBrushSize);
  const status = useEditorStore((s) => s.inpaintStatus);
  const error = useEditorStore((s) => s.inpaintError);
  const samStatus = useEditorStore((s) => s.samStatus);
  // 版本号变化时重算（引擎/栈为非响应式）
  const maskVersion = useEditorStore((s) => s.inpaintMaskVersion);
  const histVersion = useEditorStore((s) => s.inpaintHistVersion);
  void maskVersion;
  void histVersion;

  const { run, clearMask, undoErase, redoErase, canUndoErase, canRedoErase } =
    useInpaint();

  const isSam = tool === 'sam';
  const hasMask = inpaintMaskEngine.hasMask();
  const busy = status === 'loading' || status === 'running';
  const samBusy =
    samStatus === 'loading-model' ||
    samStatus === 'encoding' ||
    samStatus === 'segmenting';

  return (
    <div className="panel-content">
      <header className="panel-head">
        <span className="panel-icon">
          <Icon name="eraser" size={16} />
        </span>
        <div>
          <h3>智能消除</h3>
          <p className="hint">
            {isSam ? '点选物体 · AI 自动补全背景' : '涂抹遮挡物 · AI 自动补全背景'}
          </p>
        </div>
      </header>

      {isSam ? (
        <div className="card">
          <div className="slider-row">
            <label>智能点选</label>
            {samBusy && <Icon name="loader" size={14} className="spin" />}
          </div>
          <p className="hint" style={{ margin: '2px 0 0' }}>
            {SAM_STATUS_TEXT[samStatus]}
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="slider-row">
            <label>画笔大小</label>
            <span className="value-badge">{brushSize}px</span>
          </div>
          <input
            type="range"
            min={5}
            max={200}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
        </div>
      )}

      <div className="card">
        <div className="slider-row">
          <label>状态</label>
          {busy && <Icon name="loader" size={14} className="spin" />}
        </div>
        <p className="hint" style={{ margin: '2px 0 0' }}>
          {status === 'error' ? `失败：${error ?? ''}` : STATUS_TEXT[status]}
        </p>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="primary"
            style={{ flex: 1 }}
            disabled={!hasMask || busy}
            onClick={() => void run()}
            title="对涂抹区域执行擦除并补全背景"
          >
            <Icon name={busy ? 'loader' : 'eraser'} className={busy ? 'spin' : ''} />
            {busy ? '处理中…' : '消除'}
          </button>
          <button
            className="ghost"
            disabled={!hasMask || busy}
            onClick={clearMask}
            title="清除当前选区"
          >
            清除选区
          </button>
        </div>
      </div>

      <div className="card">
        <label className="card-label">消除历史</label>
        <div className="row">
          <button
            className="ghost"
            style={{ flex: 1 }}
            disabled={!canUndoErase() || busy}
            onClick={undoErase}
            title="撤销上一次消除"
          >
            <Icon name="undo" />
            撤销消除
          </button>
          <button
            className="ghost"
            style={{ flex: 1 }}
            disabled={!canRedoErase() || busy}
            onClick={redoErase}
            title="重做消除"
          >
            <Icon name="redo" />
            重做
          </button>
        </div>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          消除会直接修改原图，可在此撤销；不影响其他模式。
        </p>
      </div>
    </div>
  );
}
