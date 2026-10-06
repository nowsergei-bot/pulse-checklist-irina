import type { CSSProperties } from 'react';
import { heatmapPctColor } from '../lib/moEngagementAnalytics';
import type { VisitScoreHeatmapSection } from '../lib/lessonVisitChecklist/visitChecklistScoring';

function ratioHeatStyle(ratio: number, hasData: boolean): CSSProperties {
  if (!hasData || ratio <= 0) {
    return {
      background: heatmapPctColor(null),
      color: '#64748b',
      fontWeight: 600,
      textAlign: 'center' as const,
    };
  }
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return {
    background: heatmapPctColor(pct),
    color: '#0f172a',
    fontWeight: 700,
    textAlign: 'center' as const,
  };
}

type Props = {
  sections: VisitScoreHeatmapSection[];
  /** slice — сводка среза; teacher — карточка одного педагога. */
  scope?: 'slice' | 'teacher';
};

/** Тепловая карта баллов рубрики для панели методиста (срез или карточка педагога). */
export default function VisitChecklistScoreHeatmap({ sections, scope = 'slice' }: Props) {
  if (!sections.length) return null;

  const hasData = sections.some((s) => s.items.some((it) => it.visitCount > 0));
  if (!hasData) {
    return (
      <p className="muted" style={{ fontSize: '0.84rem' }}>
        Нет данных для карты баллов — заполните чек-листы и синхронизируйте с аналитикой.
      </p>
    );
  }

  return (
    <div className="visit-checklist-score-heatmap">
      <p className="muted" style={{ fontSize: '0.82rem', lineHeight: 1.45, marginBottom: '0.65rem' }}>
        {scope === 'teacher'
          ? 'Средние баллы по посещениям этого педагога: цвет ячейки — уровень выполнения (% от максимума, светофор как в дашборде вовлечённости). Вид для методиста; в PDF и виде для педагога баллы не показываются.'
          : 'Средние баллы по рубрике (столбец 6 Excel): цвет ячейки — уровень выполнения (% от максимума, светофор как в дашборде вовлечённости). Для методиста — числовая карта; в PDF педагогу баллы не передаются.'}
      </p>
      <div style={{ display: 'grid', gap: '0.85rem' }}>
        {sections.map((sec) => {
          const secPct = Math.round(sec.fillRatio * 100);
          return (
            <details key={sec.code} className="card glass-surface" style={{ padding: '0.55rem 0.75rem' }} open>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
                {sec.code}. {sec.title}
                <span className="muted" style={{ fontWeight: 500, marginLeft: '0.4rem' }}>
                  · ср. {sec.avgEarned} / {sec.maxSectionPoints}{' '}
                  <span
                    style={{
                      ...ratioHeatStyle(sec.fillRatio, sec.fillRatio > 0),
                      display: 'inline-block',
                      padding: '0.05rem 0.35rem',
                      borderRadius: '0.25rem',
                      marginLeft: '0.15rem',
                    }}
                  >
                    ({secPct}%)
                  </span>
                </span>
              </summary>
              <div className="phenomenal-rubric-usage-table-wrap" style={{ marginTop: '0.5rem' }}>
                <table className="phenomenal-rubric-usage-table">
                  <thead>
                    <tr>
                      <th className="phenomenal-rubric-usage-th-lv" style={{ minWidth: '4.5rem' }}>
                        Ср. балл
                      </th>
                      <th className="phenomenal-rubric-usage-th-lv" style={{ minWidth: '4rem' }}>
                        Макс.
                      </th>
                      <th className="phenomenal-rubric-usage-th-lv" style={{ minWidth: '5.5rem' }}>
                        % макс.
                      </th>
                      <th className="phenomenal-rubric-usage-th-dim">Показатель</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.items
                      .filter((it) => it.maxPoints > 0)
                      .map((it, i) => {
                        const pct = Math.round(it.fillRatio * 100);
                        return (
                          <tr key={`${it.indicator}-${i}`}>
                            <td
                              className="phenomenal-rubric-usage-cell"
                              style={ratioHeatStyle(it.fillRatio, it.visitCount > 0)}
                            >
                              {it.avgEarned}
                            </td>
                            <td
                              className="phenomenal-rubric-usage-cell phenomenal-rubric-usage-cell--off"
                              style={{ textAlign: 'center', fontSize: '0.82rem' }}
                            >
                              {it.maxPoints}
                            </td>
                            <td
                              className="phenomenal-rubric-usage-cell"
                              style={ratioHeatStyle(it.fillRatio, it.visitCount > 0)}
                            >
                              {pct}%
                            </td>
                            <td
                              className="phenomenal-rubric-usage-td-dim phenomenal-public-prose"
                              style={{ fontSize: '0.8rem' }}
                            >
                              {it.indicator}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
