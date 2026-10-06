import { memo, type ReactNode } from 'react';
import { type LessonAnalyticsTeacherBlock } from '../api/lessonAnalytics';
import VirtualizedTeacherCardsList from './VirtualizedTeacherCardsList';

type Props = {
  totalCount: number;
  visibleCount: number;
  displayCount: number;
  surnameFilter: string;
  onSurnameFilterChange: (value: string) => void;
  toolbar: ReactNode;
  statusLine?: string | null;
  emptyVisibleMessage: string;
  emptyDisplayMessage: string;
  teachers: LessonAnalyticsTeacherBlock[];
  renderTeacherCard: (block: LessonAnalyticsTeacherBlock, index: number) => ReactNode;
  /** Компактный список ФИО — виден сразу, без раскрытия карточек. */
  teacherDirectory: LessonAnalyticsTeacherBlock[];
  onJumpToTeacher?: (blockId: string) => void;
  scrollToBlockId?: string | null;
  onScrollToBlockHandled?: () => void;
  teachersPending?: boolean;
  /** Подсказка под заголовком секции (по умолчанию — для админки). */
  sectionDescription?: string;
};

function TeacherDirectoryList({
  teachers,
  onJump,
}: {
  teachers: LessonAnalyticsTeacherBlock[];
  onJump?: (blockId: string) => void;
}) {
  if (!teachers.length) return null;
  return (
    <div
      className="card glass-surface"
      style={{
        marginBottom: '0.75rem',
        padding: '0.55rem 0.75rem',
        maxHeight: 220,
        overflowY: 'auto',
      }}
    >
      <div className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.35rem', fontWeight: 600 }}>
        Педагоги в срезе ({teachers.length})
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.35rem 0.65rem',
          fontSize: '0.84rem',
          lineHeight: 1.35,
        }}
      >
        {teachers.map((b) => (
          <li key={b.id}>
            {onJump ? (
              <button
                type="button"
                className="btn btn-sm"
                style={{ padding: '0.15rem 0.45rem', fontSize: '0.82rem' }}
                onClick={() => onJump(b.id)}
              >
                {b.teacherLabel}
              </button>
            ) : (
              <span>{b.teacherLabel}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Секция 4 чек-листа: список педагогов + карточки по ФИО. */
function VisitChecklistTeachersSection({
  totalCount,
  visibleCount,
  displayCount,
  surnameFilter,
  onSurnameFilterChange,
  toolbar,
  statusLine,
  emptyVisibleMessage,
  emptyDisplayMessage,
  teachers,
  renderTeacherCard,
  teacherDirectory,
  onJumpToTeacher,
  scrollToBlockId,
  onScrollToBlockHandled,
  teachersPending = false,
  sectionDescription = 'У каждого педагога — своя карточка: в виде методиста — карта баллов по его посещениям; в виде для педагога — красные плашки разделов без чисел (как в PDF). Переключатель — у имени педагога. Карточки развёрнуты по умолчанию.',
}: Props) {
  const countHint =
    surnameFilter.trim() && displayCount < visibleCount
      ? `(${displayCount} из ${visibleCount})`
      : visibleCount < totalCount
        ? `(${visibleCount} из ${totalCount})`
        : `(${displayCount})`;

  return (
    <section className="visit-checklist-teachers-section" style={{ padding: '0.15rem 0' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.65rem',
          marginBottom: '0.65rem',
        }}
      >
        <h2 className="admin-dash-title" style={{ fontSize: '1.1rem', margin: 0 }}>
          4. Карточки педагогов
          <span className="muted" style={{ fontWeight: 400, marginLeft: '0.45rem', fontSize: '0.88rem' }}>
            {countHint}
          </span>
        </h2>
        <label style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.45rem' }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Фамилия</span>
          <input
            className="input"
            type="search"
            style={{ minWidth: 180, maxWidth: 260 }}
            placeholder="Начните вводить фамилию"
            value={surnameFilter}
            onChange={(e) => onSurnameFilterChange(e.target.value)}
            aria-label="Фильтр карточек по фамилии педагога"
          />
        </label>
      </div>

      <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem', lineHeight: 1.45 }}>
        {sectionDescription}
      </p>

      <TeacherDirectoryList teachers={teacherDirectory} onJump={onJumpToTeacher} />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '0.45rem',
          marginBottom: '0.65rem',
        }}
      >
        {toolbar}
      </div>

      {statusLine ? (
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          {statusLine}
        </p>
      ) : null}

      {teachersPending ? (
        <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '0.65rem' }}>
          Обновляем список карточек…
        </p>
      ) : null}

      {visibleCount === 0 ? (
        <p className="muted card glass-surface" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
          {emptyVisibleMessage}
        </p>
      ) : displayCount === 0 ? (
        <p className="muted card glass-surface" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
          {emptyDisplayMessage}
        </p>
      ) : (
        <VirtualizedTeacherCardsList
          teachers={teachers}
          renderTeacherCard={renderTeacherCard}
          scrollToBlockId={scrollToBlockId}
          onScrollToBlockHandled={onScrollToBlockHandled}
        />
      )}
    </section>
  );
}

export default memo(VisitChecklistTeachersSection);
