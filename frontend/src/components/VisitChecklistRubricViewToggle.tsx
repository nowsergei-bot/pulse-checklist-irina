import { memo } from 'react';
import './VisitChecklistRubricViewToggle.css';

export type VisitChecklistRubricViewMode = 'methodist' | 'teacher';

type Props = {
  mode: VisitChecklistRubricViewMode;
  onChange: (mode: VisitChecklistRubricViewMode) => void;
  className?: string;
  compact?: boolean;
};

/** Переключатель «Методист» / «Педагог» для рубрики чек-листа. */
function VisitChecklistRubricViewToggle({ mode, onChange, className, compact = false }: Props) {
  return (
    <div
      className={`visit-checklist-rubric-view-toggle${compact ? ' visit-checklist-rubric-view-toggle--compact' : ''}${
        className ? ` ${className}` : ''
      }`}
      role="tablist"
      aria-label="Режим просмотра баллов по рубрикам"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'methodist'}
        className={`visit-checklist-rubric-view-toggle__btn${
          mode === 'methodist' ? ' visit-checklist-rubric-view-toggle__btn--active' : ''
        }`}
        onClick={() => onChange('methodist')}
      >
        Методист
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'teacher'}
        className={`visit-checklist-rubric-view-toggle__btn${
          mode === 'teacher' ? ' visit-checklist-rubric-view-toggle__btn--active' : ''
        }`}
        onClick={() => onChange('teacher')}
      >
        Педагог
      </button>
    </div>
  );
}

export default memo(VisitChecklistRubricViewToggle);
