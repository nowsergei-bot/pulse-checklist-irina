import type { ReactNode } from 'react';
import type { EaAcademicYear } from '../../lib/englishAssessment/types';

export type FilterGroup = {
  id: number;
  title: string;
  class_id?: number | null;
  class_label?: string | null;
  parallel?: number | null;
};

export default function YearClassGroupBar({
  years,
  yearId,
  onYear,
  classOptions,
  classKey,
  onClass,
  groups,
  groupId,
  onGroup,
  onReset,
  extra,
}: {
  years: EaAcademicYear[];
  yearId: string;
  onYear: (id: string) => void;
  classOptions: { key: string; label: string }[];
  classKey: string;
  onClass: (key: string) => void;
  groups: FilterGroup[];
  groupId: string;
  onGroup: (id: string) => void;
  onReset?: () => void;
  extra?: ReactNode;
}) {
  const applied = [yearId && years.length > 1, classKey !== 'all', Boolean(groupId)].filter(Boolean).length;

  return (
    <div className="ea-filter-bar" role="search" aria-label="Срез">
      <label>
        Учебный год
        <select value={yearId} onChange={(e) => onYear(e.target.value)}>
          {years.length ? (
            years.map((y) => (
              <option key={y.id} value={String(y.id)}>
                {y.label}
              </option>
            ))
          ) : (
            <option value="">—</option>
          )}
        </select>
      </label>
      <label>
        Параллель
        <select
          value={classKey}
          onChange={(e) => onClass(e.target.value)}
        >
          <option value="all">Все классы</option>
          {classOptions.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Группа
        <select value={groupId} onChange={(e) => onGroup(e.target.value)}>
          <option value="">Все группы</option>
          {groups.map((g) => (
            <option key={g.id} value={String(g.id)}>
              {g.title}
            </option>
          ))}
        </select>
      </label>
      {extra}
      {onReset && applied ? (
        <button type="button" className="btn" onClick={onReset}>
          Сбросить{applied > 1 ? ` (${applied})` : ''}
        </button>
      ) : null}
    </div>
  );
}
