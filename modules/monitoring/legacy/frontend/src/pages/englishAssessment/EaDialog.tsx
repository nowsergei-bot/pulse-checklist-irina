import type { ReactNode } from 'react';
import { useEffect } from 'react';

type Props = {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  danger?: boolean;
  /** Info-only dialog with a single close action */
  dismissLabel?: string;
};

export default function EaDialog({
  open,
  title,
  children,
  confirmLabel = 'Продолжить',
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
  danger,
  dismissLabel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const single = Boolean(dismissLabel) && !onConfirm;

  return (
    <div className="ea-dialog" role="presentation">
      <button type="button" className="ea-dialog__backdrop" aria-label="Закрыть" onClick={() => onCancel?.()} />
      <div className="ea-dialog__panel card glass-surface" role="dialog" aria-modal="true" aria-labelledby="ea-dialog-title">
        <h3 id="ea-dialog-title" className="ea-dialog__title">
          {title}
        </h3>
        {children ? <div className="ea-dialog__body">{children}</div> : null}
        <div className="ea-dialog__actions">
          {single ? (
            <button type="button" className="btn primary" onClick={() => onCancel?.()}>
              {dismissLabel}
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => onCancel?.()}>
                {cancelLabel}
              </button>
              {onConfirm ? (
                <button type="button" className={`btn${danger ? '' : ' primary'}${danger ? ' ea-dialog__danger' : ''}`} onClick={onConfirm}>
                  {confirmLabel}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
