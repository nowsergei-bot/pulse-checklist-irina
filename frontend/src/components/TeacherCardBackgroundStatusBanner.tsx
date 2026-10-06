import { memo } from 'react';
import type { TeacherCardBackgroundStatus } from '../lib/lessonAnalytics/teacherCardBackgroundStatus';

type Props = {
  status: TeacherCardBackgroundStatus;
  /** Компактный вид для превью карточки. */
  compact?: boolean;
};

function TeacherCardBackgroundStatusBanner({ status, compact = false }: Props) {
  if (compact) {
    return (
      <p className="visit-checklist-teacher-card-bg-status visit-checklist-teacher-card-bg-status--compact muted">
        {status.compactLine}
        {' · '}
        {status.hintLine}
      </p>
    );
  }

  return (
    <div className="visit-checklist-teacher-card-bg-status" role="status">
      <p className="visit-checklist-teacher-card-bg-status__title">{status.title}</p>
      {status.etaLine ? (
        <p className="visit-checklist-teacher-card-bg-status__eta muted">{status.etaLine}</p>
      ) : null}
      <p className="visit-checklist-teacher-card-bg-status__hint muted">{status.hintLine}</p>
    </div>
  );
}

export default memo(TeacherCardBackgroundStatusBanner);
