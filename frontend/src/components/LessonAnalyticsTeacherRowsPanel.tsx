import { useMemo, useState } from 'react';
import { type LessonAnalyticsTeacherBlock } from '../api/lessonAnalytics';
import type { AnalyticRow } from '../lib/excelAnalytics/engine';
import type { ColumnRole, CustomFilterLabels } from '../lib/excelAnalytics/types';
import {
  addRowToTeacherMembership,
  analyticRowMembershipKey,
  formatTeacherCardRowSummary,
  normalizeTeacherCardRowMembership,
  removeRowFromTeacherMembership,
  rowMembershipSource,
  type TeacherCardRowMembership,
} from '../lib/lessonAnalytics/teacherCardRowMembership';
import { LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS } from '../lib/lessonAnalytics/lessonAnalyticsTeacherDomPdf';

export type LessonAnalyticsTeacherRowsPanelProps = {
  block: LessonAnalyticsTeacherBlock;
  teacherRows: AnalyticRow[];
  poolRows: AnalyticRow[];
  teacherFilterKey: string;
  roles: ColumnRole[];
  customLabels: CustomFilterLabels;
  disabled?: boolean;
  onMembershipChange: (membership: TeacherCardRowMembership) => void;
};

export default function LessonAnalyticsTeacherRowsPanel({
  block,
  teacherRows,
  poolRows,
  teacherFilterKey,
  roles,
  customLabels,
  disabled = false,
  onMembershipChange,
}: LessonAnalyticsTeacherRowsPanelProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const membership = normalizeTeacherCardRowMembership(block.rowMembership);
  const hasOverrides = membership.includeKeys.length > 0 || membership.excludeKeys.length > 0;

  const inCardKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of teacherRows) s.add(analyticRowMembershipKey(r, teacherFilterKey));
    return s;
  }, [teacherRows, teacherFilterKey]);

  const cardEntries = useMemo(
    () =>
      teacherRows.map((row) => ({
        row,
        key: analyticRowMembershipKey(row, teacherFilterKey),
        summary: formatTeacherCardRowSummary(row, teacherFilterKey, roles, customLabels),
        source: rowMembershipSource(row, teacherFilterKey, block),
      })),
    [teacherRows, teacherFilterKey, roles, customLabels, block],
  );

  const availableToAdd = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { row: AnalyticRow; key: string; summary: string }[] = [];
    for (const row of poolRows) {
      const key = analyticRowMembershipKey(row, teacherFilterKey);
      if (inCardKeys.has(key)) continue;
      const summary = formatTeacherCardRowSummary(row, teacherFilterKey, roles, customLabels);
      if (q && !summary.toLowerCase().includes(q)) continue;
      out.push({ row, key, summary });
      if (out.length >= 80) break;
    }
    return out;
  }, [poolRows, inCardKeys, query, teacherFilterKey, roles, customLabels]);

  const removeRow = (key: string, wasManualInclude: boolean) => {
    onMembershipChange(removeRowFromTeacherMembership(membership, key, wasManualInclude));
  };

  const addRow = (key: string) => {
    onMembershipChange(addRowToTeacherMembership(membership, key));
    setQuery('');
  };

  const resetOverrides = () => {
    if (!hasOverrides) return;
    if (!window.confirm('Сбросить все ручные правки состава карточки? Строки снова подтянутся только по ФИО из таблицы.')) {
      return;
    }
    onMembershipChange({ includeKeys: [], excludeKeys: [] });
  };

  return (
    <details
      className={`lesson-analytics-teacher-rows-panel ${LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}`}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      style={{ marginTop: '0.65rem' }}
    >
      <summary
        className="lesson-analytics-teacher-rows-panel__summary"
        style={{ cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}
      >
        Строки в карточке ({teacherRows.length})
        {hasOverrides ? (
          <span className="lesson-analytics-teacher-rows-panel__badge" style={{ marginLeft: '0.4rem' }}>
            ручная правка
          </span>
        ) : null}
      </summary>

      <div style={{ marginTop: '0.5rem' }}>
        <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 0.5rem' }}>
          Если Пульс перепутал похожие фамилии, уберите лишние строки или добавьте нужные из всей таблицы. После
          изменения пересоздайте ИИ-аналитику.
        </p>

        {cardEntries.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.82rem' }}>
            Нет строк — добавьте наблюдения из таблицы ниже.
          </p>
        ) : (
          <ul className="lesson-analytics-teacher-rows-panel__list">
            {cardEntries.map(({ key, summary, source }) => (
              <li key={key} className="lesson-analytics-teacher-rows-panel__item">
                <span className="lesson-analytics-teacher-rows-panel__text">{summary}</span>
                {source === 'manual-include' ? (
                  <span className="lesson-analytics-teacher-rows-panel__tag">добавлено</span>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={disabled}
                  onClick={() => removeRow(key, source === 'manual-include')}
                >
                  Убрать
                </button>
              </li>
            ))}
          </ul>
        )}

        <h5 className="muted" style={{ fontSize: '0.82rem', margin: '0.75rem 0 0.35rem' }}>
          Добавить из таблицы
        </h5>
        <input
          className="input"
          type="search"
          placeholder="Поиск по №, дате, классу, другому педагогу…"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', maxWidth: 420, marginBottom: '0.4rem' }}
        />
        {availableToAdd.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            {query.trim() ? 'Ничего не найдено вне этой карточки.' : 'Все строки среза уже в карточке или таблица пуста.'}
          </p>
        ) : (
          <ul className="lesson-analytics-teacher-rows-panel__list lesson-analytics-teacher-rows-panel__list--add">
            {availableToAdd.map(({ key, summary }) => (
              <li key={key} className="lesson-analytics-teacher-rows-panel__item">
                <span className="lesson-analytics-teacher-rows-panel__text">{summary}</span>
                <button type="button" className="btn btn-sm primary" disabled={disabled} onClick={() => addRow(key)}>
                  В карточку
                </button>
              </li>
            ))}
          </ul>
        )}
        {availableToAdd.length >= 80 ? (
          <p className="muted" style={{ fontSize: '0.76rem', marginTop: '0.25rem' }}>
            Показаны первые 80 совпадений — уточните поиск.
          </p>
        ) : null}

        {hasOverrides ? (
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: '0.5rem' }}
            disabled={disabled}
            onClick={resetOverrides}
          >
            Сбросить ручные правки
          </button>
        ) : null}
      </div>
    </details>
  );
}
