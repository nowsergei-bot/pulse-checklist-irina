import { useMemo } from 'react';
import type { FilterSelection } from '../lib/excelAnalytics/engine';
import { isRedHighlightSelectionActive } from '../lib/lessonAnalytics/redHighlight';

type Section = { id: string; title: string; keys: string[] };

type Props = {
  filterSections: Section[];
  filterKeyDisplayLabel: Record<string, string>;
  filterPanelHiddenKeys: string[];
  redHighlightSelection: FilterSelection;
  valuesForKey: (key: string) => string[];
  onToggleRedValue: (key: string, val: string, all: string[]) => void;
  onClearRedHighlight: () => void;
  /** Свернуть панель в <details> (по умолчанию закрыта). */
  collapsible?: boolean;
};

function buildActiveRedHighlightHint(
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

export default function LessonAnalyticsRedHighlightPanel({
  filterSections,
  filterKeyDisplayLabel,
  filterPanelHiddenKeys,
  redHighlightSelection,
  valuesForKey,
  onToggleRedValue,
  onClearRedHighlight,
  collapsible,
}: Props) {
  const hiddenSet = new Set(filterPanelHiddenKeys);
  const sectionsForDisplay = filterSections
    .map((section) => ({
      ...section,
      keys: section.keys.filter((k) => !hiddenSet.has(k)),
    }))
    .filter((section) => section.keys.length > 0);

  const active = isRedHighlightSelectionActive(redHighlightSelection);
  const activeHint = useMemo(
    () => buildActiveRedHighlightHint(redHighlightSelection, filterKeyDisplayLabel),
    [redHighlightSelection, filterKeyDisplayLabel],
  );

  const marginStyle = { marginTop: '1rem' };

  const panelContent = (
    <>
      {!collapsible ? (
        <h2 className="admin-dash-title" style={{ fontSize: '1.05rem', margin: 0 }}>
          Красное выделение карточек
        </h2>
      ) : null}
      <p
        className="muted"
        style={{
          fontSize: '0.86rem',
          marginTop: collapsible ? 0 : '0.45rem',
          marginBottom: '0.65rem',
        }}
      >
        Отдельно от среза выше: отметьте значения — карточки педагогов с уроками в этой выборке подсветятся красной
        рамкой. Список карточек не сужается.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.65rem' }}>
        <button type="button" className="btn btn-sm" onClick={onClearRedHighlight} disabled={!active}>
          Сбросить красное выделение
        </button>
        {active ? (
          <span className="muted" style={{ fontSize: '0.82rem', alignSelf: 'center' }}>
            Выделение активно
          </span>
        ) : null}
      </div>

      {sectionsForDisplay.length === 0 ? (
        <p className="muted">Сначала настройте измерения в блоке «Срез по данным».</p>
      ) : (
        <div className="excel-dashboard-slice-sections">
          {sectionsForDisplay.map((section) => (
            <section key={section.id} className="excel-slice-section">
              <h3 className="excel-slice-section-title">{section.title}</h3>
              <div className="excel-dashboard-slice-filters-grid excel-dashboard-slice-filters-grid--wide">
                {section.keys.map((key) => {
                  const all = valuesForKey(key);
                  const sel = redHighlightSelection[key];
                  return (
                    <div key={key} className="excel-slice-dimension card glass-surface">
                      <div className="excel-slice-dimension-head excel-slice-dimension-head--row">
                        <span className="excel-slice-dimension-label">
                          {filterKeyDisplayLabel[key] ?? key}
                        </span>
                      </div>
                      <div className="excel-slice-dimension-body">
                        {all.length === 0 ? (
                          <p className="muted excel-analytics-filter-empty">Нет вариантов в данных.</p>
                        ) : (
                          <div className="excel-analytics-filter-chips lesson-analytics-red-highlight-chips">
                            {all.map((val) => {
                              const checked = Array.isArray(sel) && sel.includes(val);
                              return (
                                <label
                                  key={val}
                                  className={`excel-analytics-chip lesson-analytics-red-chip${
                                    checked ? ' lesson-analytics-red-chip--on' : ''
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggleRedValue(key, val, all)}
                                  />
                                  <span>{val}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );

  if (collapsible) {
    return (
      <details
        className="card glass-surface lesson-analytics-red-highlight-panel pulse-slice-filters-collapsible"
        style={marginStyle}
      >
        <summary className="pulse-slice-filters-collapsible-summary">
          <span className="pulse-slice-filters-collapsible-title">Красное выделение карточек</span>
          {active ? (
            <span className="pulse-slice-filters-collapsible-hint muted" title={activeHint}>
              {activeHint}
            </span>
          ) : null}
        </summary>
        <div className="pulse-slice-filters-collapsible-body">{panelContent}</div>
      </details>
    );
  }

  return (
    <section className="card glass-surface lesson-analytics-red-highlight-panel" style={marginStyle}>
      {panelContent}
    </section>
  );
}
