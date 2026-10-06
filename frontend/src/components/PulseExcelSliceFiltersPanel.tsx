import { useMemo } from 'react';
import type { FilterSelection } from '../lib/excelAnalytics/engine';
import { hasActiveSliceFilters } from '../lib/lessonAnalytics/filterTeacherBlocksForSlice';

type Section = { id: string; title: string; keys: string[] };

type Props = {
  filterSections: Section[];
  filterKeyDisplayLabel: Record<string, string>;
  filterPanelHiddenKeys: string[];
  filterSelection: FilterSelection;
  valuesForKey: (key: string) => string[];
  onToggleValue: (key: string, val: string, all: string[]) => void;
  onClearKey: (key: string) => void;
  onHideKey: (key: string) => void;
  onShowKey: (key: string) => void;
  onResetAll: () => void;
  onRebuildFromTable?: () => void;
  onShowAllHidden?: () => void;
  compact?: boolean;
  lead?: string;
  /** Без «скрыть измерение» и пересборки из таблицы (страница руководителя). */
  directorMode?: boolean;
  /** Свернуть панель в <details> (по умолчанию закрыта). */
  collapsible?: boolean;
};

function buildActiveFilterHint(
  selection: FilterSelection,
  labels: Record<string, string>,
): string {
  const parts: string[] = [];
  for (const [key, values] of Object.entries(selection)) {
    if (!values?.length) continue;
    const label = labels[key] ?? key;
    parts.push(`${label}: ${values.join(', ')}`);
  }
  const joined = parts.join('; ');
  return joined.length > 110 ? `${joined.slice(0, 107)}…` : joined;
}

export default function PulseExcelSliceFiltersPanel({
  filterSections,
  filterKeyDisplayLabel,
  filterPanelHiddenKeys,
  filterSelection,
  valuesForKey,
  onToggleValue,
  onClearKey,
  onHideKey,
  onShowKey,
  onResetAll,
  onRebuildFromTable,
  onShowAllHidden,
  compact,
  lead,
  directorMode,
  collapsible,
}: Props) {
  const hiddenSet = new Set(filterPanelHiddenKeys);
  const sectionsForDisplay = filterSections
    .map((section) => ({
      ...section,
      keys: section.keys.filter((k) => !hiddenSet.has(k)),
    }))
    .filter((section) => section.keys.length > 0);

  const activeFilterHint = useMemo(
    () => buildActiveFilterHint(filterSelection, filterKeyDisplayLabel),
    [filterSelection, filterKeyDisplayLabel],
  );
  const filtersActive = hasActiveSliceFilters(filterSelection);

  const marginStyle = { marginTop: compact ? '0.75rem' : '1rem' };

  const panelContent = (
    <>
      {!collapsible ? (
        <h2 className="admin-dash-title" style={{ fontSize: compact ? '1rem' : '1.1rem', margin: 0 }}>
          Срез по данным
        </h2>
      ) : null}
      <p className="muted" style={{ fontSize: '0.86rem', marginTop: collapsible ? 0 : '0.45rem', marginBottom: '0.65rem' }}>
        {lead ??
          'Измерения построены из колонок таблицы (маппинг ролей). Отметьте значения — список карточек и тексты ИИ пересчитаются по выборке.'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.65rem' }}>
        {!directorMode && onRebuildFromTable ? (
          <button type="button" className="btn btn-sm" onClick={onRebuildFromTable}>
            Все измерения из таблицы
          </button>
        ) : null}
        <button type="button" className="btn btn-sm" onClick={onResetAll}>
          Сбросить все фильтры
        </button>
      </div>

      {filterSections.length === 0 ? (
        <p className="muted excel-dashboard-slice-empty">
          Нет колонок для среза. Проверьте маппинг: нужны поля с ролями фильтров или графами опроса (не «Не использовать»).
        </p>
      ) : sectionsForDisplay.length === 0 ? (
        <p className="muted excel-dashboard-slice-empty">
          Все измерения скрыты.{' '}
          <button type="button" className="btn btn-sm" onClick={() => onShowAllHidden?.()}>
            Показать все
          </button>
        </p>
      ) : (
        <div className="excel-dashboard-slice-sections">
          {sectionsForDisplay.map((section) => (
            <section key={section.id} className="excel-slice-section">
              <h3 className="excel-slice-section-title">{section.title}</h3>
              <div className="excel-dashboard-slice-filters-grid excel-dashboard-slice-filters-grid--wide">
                {section.keys.map((key) => {
                  const all = valuesForKey(key);
                  const sel = filterSelection[key];
                  return (
                    <div key={key} className="excel-slice-dimension card glass-surface">
                      <div className="excel-slice-dimension-head excel-slice-dimension-head--row">
                        <span className="excel-slice-dimension-label">{filterKeyDisplayLabel[key] ?? key}</span>
                        {!directorMode ? (
                          <button
                            type="button"
                            className="btn excel-slice-dimension-hide"
                            title="Убрать измерение из панели"
                            onClick={() => onHideKey(key)}
                          >
                            Скрыть
                          </button>
                        ) : null}
                      </div>
                      <div className="excel-slice-dimension-body">
                        {all.length === 0 ? (
                          <p className="muted excel-analytics-filter-empty">
                            Нет вариантов при текущем срезе по другим фильтрам.
                          </p>
                        ) : (
                          <div className="excel-analytics-filter-chips">
                            {all.map((val) => {
                              const checked = Array.isArray(sel) && sel.includes(val);
                              return (
                                <label key={val} className="excel-analytics-chip">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggleValue(key, val, all)}
                                  />
                                  <span>{val}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        <div className="excel-analytics-filter-actions">
                          <button type="button" className="btn btn-sm" onClick={() => onClearKey(key)}>
                            Сбросить измерение
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {!directorMode && filterPanelHiddenKeys.length > 0 ? (
        <details className="excel-hidden-filters-details" style={{ marginTop: '0.65rem' }}>
          <summary className="excel-hidden-filters-summary">
            Скрытые измерения ({filterPanelHiddenKeys.length})
          </summary>
          <div className="excel-hidden-filters-list">
            {filterPanelHiddenKeys.map((key) => (
              <button key={key} type="button" className="btn btn-sm" onClick={() => onShowKey(key)}>
                {filterKeyDisplayLabel[key] ?? key}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </>
  );

  if (collapsible) {
    return (
      <details className="card glass-surface pulse-slice-filters-panel pulse-slice-filters-collapsible" style={marginStyle}>
        <summary
          className={`pulse-slice-filters-collapsible-summary${compact ? ' pulse-slice-filters-collapsible-summary--compact' : ''}`}
        >
          <span className="pulse-slice-filters-collapsible-title">Фильтры среза</span>
          {filtersActive ? (
            <span className="pulse-slice-filters-collapsible-hint muted" title={activeFilterHint}>
              {activeFilterHint}
            </span>
          ) : null}
        </summary>
        <div className="pulse-slice-filters-collapsible-body">{panelContent}</div>
      </details>
    );
  }

  return (
    <section className="card glass-surface pulse-slice-filters-panel" style={marginStyle}>
      {panelContent}
    </section>
  );
}
