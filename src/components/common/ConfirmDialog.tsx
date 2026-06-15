import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Icon, { type IconName } from './Icon';

type DialogVariant = 'default' | 'danger' | 'warning';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作：确认按钮使用警示配色 */
  danger?: boolean;
}

export interface AlertOptions {
  title?: string;
  message: string;
  okText?: string;
  variant?: DialogVariant;
}

interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error('对话框 Hook 必须在 ConfirmProvider 内使用');
  return api;
}

/** 应用级确认弹窗：用 await confirm({...}) 替代原生 window.confirm */
export function useConfirm() {
  return useDialog().confirm;
}

/** 应用级提示弹窗：用 await alert({...}) 替代原生 window.alert */
export function useAlert() {
  return useDialog().alert;
}

interface PendingState {
  mode: 'confirm' | 'alert';
  title?: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: DialogVariant;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);

  const close = useCallback((ok: boolean) => {
    setPending((p) => {
      p?.resolve(ok);
      return null;
    });
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setPending({
            mode: 'confirm',
            title: options.title ?? '确认操作',
            message: options.message,
            confirmText: options.confirmText ?? '确认',
            cancelText: options.cancelText ?? '取消',
            variant: options.danger ? 'danger' : 'default',
            resolve,
          });
        }),
      alert: (options) =>
        new Promise<void>((resolve) => {
          const o: AlertOptions =
            typeof options === 'string' ? { message: options } : options;
          setPending({
            mode: 'alert',
            title: o.title ?? '提示',
            message: o.message,
            confirmText: o.okText ?? '确定',
            cancelText: '',
            variant: o.variant ?? 'warning',
            resolve: () => resolve(),
          });
        }),
    }),
    [],
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending && (
        <DialogModal
          state={pending}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
    </DialogContext.Provider>
  );
}

const VARIANT_ICON: Record<DialogVariant, IconName> = {
  default: 'crosshair',
  danger: 'trash',
  warning: 'alert',
};

interface ModalProps {
  state: PendingState;
  onConfirm: () => void;
  onCancel: () => void;
}

function DialogModal({ state, onConfirm, onCancel }: ModalProps) {
  const { mode, title, message, confirmText, cancelText, variant } = state;
  const isAlert = mode === 'alert';
  const confirmRef = useRef<HTMLButtonElement>(null);

  // 自动聚焦主按钮；Enter 确认 / Esc 关闭
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // alert 模式 Esc 等同确定关闭
        isAlert ? onConfirm() : onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAlert, onConfirm, onCancel]);

  return (
    <div
      className="modal-overlay"
      onClick={isAlert ? onConfirm : onCancel}
    >
      <div
        className="modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`confirm-icon ${variant}`}>
          <Icon name={VARIANT_ICON[variant]} size={20} />
        </div>
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          {!isAlert && (
            <button className="ghost" onClick={onCancel}>
              {cancelText}
            </button>
          )}
          <button
            ref={confirmRef}
            className={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
