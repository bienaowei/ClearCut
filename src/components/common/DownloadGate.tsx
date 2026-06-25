import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import Icon from './Icon';

/**
 * 模型下载闸门：首次使用 AI 功能（智能点选 / 智能消除）需下载较大的模型权重。
 * 这里统一弹窗征询——**用户点「确定」后才开始下载**，并实时显示下载进度条。
 *
 * 用法：const ensureDownload = useDownloadGate();
 *      const ok = await ensureDownload({ title, message, isReady, download });
 *  - isReady() 为 true（模型已就绪）时直接放行，不弹窗。
 *  - 用户取消返回 false；下载出错则 reject（交由调用方的 try/catch 处理）。
 *
 * 注意进度语义：onProgress 上报的是「下载字节」的进度。下载到 100% 后，模型
 * 通常还要做会话创建 / WebGPU 预热等初始化（无字节进度），故进度满后界面切换
 * 为「正在初始化模型…」提示，避免停在 100% 看起来像卡死。
 */

export interface DownloadRequest {
  title: string;
  message: string;
  /** 模型是否已就绪（已就绪则跳过弹窗与下载） */
  isReady: () => boolean;
  /** 真正的下载逻辑；onProgress(0~1) 上报进度，无法获知总量时传 null（不确定态） */
  download: (onProgress: (p: number | null) => void) => Promise<void>;
}

type EnsureDownload = (req: DownloadRequest) => Promise<boolean>;

const DownloadGateContext = createContext<EnsureDownload | null>(null);

export function useDownloadGate(): EnsureDownload {
  const fn = useContext(DownloadGateContext);
  if (!fn) throw new Error('useDownloadGate 必须在 DownloadGateProvider 内使用');
  return fn;
}

interface GateState {
  title: string;
  message: string;
  phase: 'confirm' | 'downloading';
  progress: number | null;
  download: (onProgress: (p: number | null) => void) => Promise<void>;
  resolve: (ok: boolean) => void;
  reject: (err: unknown) => void;
}

export function DownloadGateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<GateState | null>(null);
  /** 当前下载是否已启动，防止 effect 在严格模式下重复触发下载。 */
  const startedRef = useRef(false);

  const ensureDownload = useCallback<EnsureDownload>((req) => {
    if (req.isReady()) return Promise.resolve(true);
    return new Promise<boolean>((resolve, reject) => {
      startedRef.current = false;
      setState({
        title: req.title,
        message: req.message,
        phase: 'confirm',
        progress: null,
        download: req.download,
        resolve,
        reject,
      });
    });
  }, []);

  const onCancel = useCallback(() => {
    setState((s) => {
      s?.resolve(false);
      return null;
    });
  }, []);

  const onConfirm = useCallback(() => {
    // 仅切换到下载态；真正的下载放到 effect 里启动（避免在 setState 更新函数中
    // 触发副作用——那会在严格模式下重复执行，导致下载被发起两次）。
    setState((s) => (s ? { ...s, phase: 'downloading', progress: null } : s));
  }, []);

  // 进入下载态后启动一次下载，进度回调驱动进度条，完成/出错时结算并关闭弹窗。
  useEffect(() => {
    if (!state || state.phase !== 'downloading' || startedRef.current) return;
    startedRef.current = true;
    const { download, resolve, reject } = state;
    download((p) =>
      setState((cur) => (cur ? { ...cur, progress: p } : cur)),
    ).then(
      () => {
        resolve(true);
        setState(null);
      },
      (err) => {
        reject(err);
        setState(null);
      },
    );
  }, [state]);

  return (
    <DownloadGateContext.Provider value={ensureDownload}>
      {children}
      {state && (
        <GateModal state={state} onConfirm={onConfirm} onCancel={onCancel} />
      )}
    </DownloadGateContext.Provider>
  );
}

interface ModalProps {
  state: GateState;
  onConfirm: () => void;
  onCancel: () => void;
}

function GateModal({ state, onConfirm, onCancel }: ModalProps) {
  const { title, message, phase, progress } = state;
  const downloading = phase === 'downloading';
  const pct = progress == null ? null : Math.round(progress * 100);
  // 字节已下载完（100%）但模型仍在创建会话 / 预热 → 提示「初始化」，避免像卡死。
  const initializing = pct != null && pct >= 100;

  return (
    <div className="modal-overlay" onClick={downloading ? undefined : onCancel}>
      <div
        className="modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-icon">
          <Icon
            name={downloading ? 'loader' : 'download'}
            size={20}
            className={downloading ? 'spin' : ''}
          />
        </div>
        <h3 className="confirm-title">{title}</h3>

        {downloading ? (
          <div className="download-progress">
            <div className="download-bar">
              <div
                className={`download-bar-fill${pct == null ? ' indeterminate' : ''}${
                  initializing ? ' pulsing' : ''
                }`}
                style={pct == null ? undefined : { width: `${pct}%` }}
              />
            </div>
            <p className="download-progress-text">
              {pct == null
                ? '正在下载…'
                : initializing
                  ? '下载完成，正在初始化模型…'
                  : `下载中 ${pct}%`}
            </p>
          </div>
        ) : (
          <p className="confirm-message">{message}</p>
        )}

        {!downloading && (
          <div className="confirm-actions">
            <button className="ghost" onClick={onCancel}>
              取消
            </button>
            <button className="primary" onClick={onConfirm} autoFocus>
              确定
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
