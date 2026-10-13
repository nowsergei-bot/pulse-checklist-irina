import type { ReactNode } from 'react';
import { useEffect } from 'react';

// Окно подтверждения по образцу раздела английского (legacy EaDialog).
type Props = {
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export default function Dialog({ title, children, confirmLabel = 'Продолжить', cancelLabel = 'Отмена', onConfirm, onCancel, busy }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="mon-dialog" role="presentation">
      <button type="button" className="mon-dialog__backdrop" aria-label="Закрыть" onClick={onCancel} />
      <div className="mon-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="mon-dialog-title">
        <h3 id="mon-dialog-title" className="mon-dialog__title">{title}</h3>
        {children ? <div className="mon-dialog__body">{children}</div> : null}
        <div className="mon-dialog__actions">
          <button type="button" className="mon-btn" onClick={onCancel}>{onConfirm ? cancelLabel : 'Закрыть'}</button>
          {onConfirm ? (
            <button type="button" className="mon-btn mon-btn--primary" disabled={busy} onClick={onConfirm}>
              {confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
