import type { ReactNode } from 'react';
import StaffAvatar from '../../components/StaffAvatar';
import { PDF_CARD_KEEP_TOGETHER_CLASS } from '../../lib/pdf/captureElementToPdfA4';

export function VisitChecklistCardIdentity({
  name,
  meta,
  photoUrl,
  large,
  children,
  actions,
  actionsClassName,
}: {
  name: string;
  meta: ReactNode;
  photoUrl?: string | null;
  large?: boolean;
  children?: ReactNode;
  actions?: ReactNode;
  actionsClassName?: string;
}) {
  return (
    <div className={`vcd-card__head ${PDF_CARD_KEEP_TOGETHER_CLASS}`}>
      <StaffAvatar className="vcd-card__photo" name={name} photoUrl={photoUrl} size="xl" />
      <div className="vcd-card__identity">
        <h2 className="admin-dash-title" style={{ fontSize: large ? '1.65rem' : '1.15rem', margin: 0, lineHeight: 1.15 }}>
          {name}
        </h2>
        <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
          {meta}
        </p>
        {children}
      </div>
      {actions ? <div className={actionsClassName || 'vcd-card__head-actions'}>{actions}</div> : null}
    </div>
  );
}
