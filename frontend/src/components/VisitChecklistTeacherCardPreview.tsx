import { memo } from 'react';
import { type LessonAnalyticsTeacherBlock } from '../api/lessonAnalytics';
import TeacherCardBackgroundStatusBanner from './TeacherCardBackgroundStatusBanner';
import type { TeacherCardBackgroundStatus } from '../lib/lessonAnalytics/teacherCardBackgroundStatus';

type Props = {
  block: LessonAnalyticsTeacherBlock;
  onShowFull: () => void;
  /** Краткая строка баллов — только если уже посчитана родителем. */
  scoreLine?: string | null;
  backgroundStatus?: TeacherCardBackgroundStatus | null;
};

/** Лёгкая оболочка карточки: имя + статус, без тяжёлой аналитики. */
function VisitChecklistTeacherCardPreview({ block, onShowFull, scoreLine, backgroundStatus }: Props) {
  const statusLabel = block.status === 'agreed' ? 'Согласовано' : 'Черновик';
  const aiHint = block.aiNarrative?.trim()
    ? ' · есть ИИ-текст'
    : block.aiNarrativeManualEdit
      ? ' · текст методиста'
      : backgroundStatus
        ? ''
        : '';

  return (
    <article
      id={block.id ? `lesson-analytics-teacher-${block.id}` : undefined}
      className="card glass-surface visit-checklist-teacher-card-shell"
      style={{ marginBottom: '1rem', padding: '0.85rem 1rem' }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.5rem',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="admin-dash-kicker" style={{ margin: '0 0 0.2rem', fontSize: '0.72rem' }}>
            Чек-лист посещения урока
          </p>
          <h3 className="admin-dash-title" style={{ fontSize: '1.05rem', margin: 0 }}>
            {block.teacherLabel}
          </h3>
          {scoreLine ? (
            <p className="muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
              <strong style={{ color: 'var(--text, #0f172a)' }}>{scoreLine}</strong>
            </p>
          ) : null}
          <p className="muted" style={{ fontSize: '0.82rem', margin: '0.35rem 0 0' }}>
            {statusLabel}
            {aiHint}
            {!backgroundStatus ? ' · баллы и таблицы — по кнопке или при прокрутке' : null}
          </p>
          {backgroundStatus ? (
            <TeacherCardBackgroundStatusBanner status={backgroundStatus} compact />
          ) : null}
        </div>
        <button type="button" className="btn btn-sm primary" onClick={onShowFull}>
          Показать полностью
        </button>
      </div>
    </article>
  );
}

export default memo(VisitChecklistTeacherCardPreview, (prev, next) => {
  return (
    prev.block === next.block &&
    prev.scoreLine === next.scoreLine &&
    prev.backgroundStatus === next.backgroundStatus
  );
});
