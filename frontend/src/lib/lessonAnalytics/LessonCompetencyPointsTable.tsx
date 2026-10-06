import type { CSSProperties } from 'react';
import type { LessonCompetencyScaleAggregate } from './lessonCompetencyScale';

const HEAT_LEVELS = [0, 1, 2, 3, 4] as const;

/** Тепловая шкала: 0 → белый, max → фирменный красный (как .phenomenal-rubric-usage-cell--on). */
const HEAT_RED = { r: 220, g: 38, b: 38 };

function countHeatStyle(count: number, maxVal: number): CSSProperties {
  const n = Number(count);
  const max = Math.max(0, Number(maxVal));
  if (!Number.isFinite(n) || n <= 0 || max <= 0) {
    return {
      background: '#ffffff',
      color: '#0f172a',
      fontWeight: 600,
      textAlign: 'center' as const,
    };
  }
  const t = Math.min(1, n / max);
  const R = Math.round(255 + (HEAT_RED.r - 255) * t);
  const G = Math.round(255 + (HEAT_RED.g - 255) * t);
  const B = Math.round(255 + (HEAT_RED.b - 255) * t);
  const useLightText = t > 0.52;
  return {
    background: `rgb(${R},${G},${B})`,
    color: useLightText ? '#fff' : '#0f172a',
    fontWeight: 700,
    textAlign: 'center' as const,
  };
}

type Props = {
  aggregate: LessonCompetencyScaleAggregate;
};

/**
 * Матрица «Компетенции»: либо уровни 0–4 из чисел в ячейках, либо (шаблон «Для анализа ИИ»)
 * — число пунктов рубрики, перечисленных через запятую в ячейке.
 */
export default function LessonCompetencyPointsTable({ aggregate }: Props) {
  const { rows, hasAny, rubricPhraseBreakdown, kind } = aggregate;
  const isVisitChecklist = kind === 'visit_checklist';
  const sectionTitle = isVisitChecklist ? 'Чек-лист посещения урока' : 'Компетенции';
  const sectionAria = isVisitChecklist ? 'Чек-лист посещения урока' : 'Компетенции';
  const hasNumericLevels = rows.some((r) => r.used.size > 0);
  const maxTokensOneCell = rows.length ? Math.max(...rows.map((r) => r.maxCommaTokensInCell), 0) : 0;
  const sumPeakLevels = rows.reduce((s, r) => s + (r.peakLevel ?? 0), 0);
  const sumGlobalMax = rows.reduce((s, r) => s + r.globalMaxItemsInColumn, 0);
  const hasPhraseDetail = Boolean(rubricPhraseBreakdown?.length);

  const maxSliceAcrossRows = rows.length
    ? Math.max(0, ...rows.map((r) => r.maxCommaTokensInCell))
    : 0;

  return (
    <section className="phenomenal-rubric-usage" aria-label={sectionAria}>
      <h4 className="phenomenal-rubric-usage-title">{sectionTitle}</h4>
      <p className="muted phenomenal-rubric-usage-lead" style={{ fontSize: '0.82rem', lineHeight: 1.45 }}>
        {isVisitChecklist ? (
          <>
            По разделам <strong>1–10</strong> официального чек-листа: отмеченные пункты (код и формулировка ответа) из всех
            посещений педагога.{' '}
            {hasPhraseDetail ? (
              <>
                Ниже — <strong>тепловая карта вхождений</strong> по каждому разделу; чем чаще пункт встречается в срезе, тем
                насыщеннее ячейка.
              </>
            ) : (
              <>Сводка по числу пунктов в ячейках раздела.</>
            )}
          </>
        ) : hasNumericLevels ? (
          <>
            Уровни <strong>0–4</strong> из назначенных столбцов шкалы: в каждой ячейке Excel могут быть перечислены числа
            через запятую. Здесь отмечены все уровни, которые встретились хотя бы в одном уроке этого педагога.{' '}
            <span className="phenomenal-rubric-usage-legend">
              <span className="phenomenal-rubric-usage-swatch phenomenal-rubric-usage-swatch--on" /> уровень есть в
              данных
            </span>
            {' · '}
            <span className="phenomenal-rubric-usage-legend">
              <span className="phenomenal-rubric-usage-swatch phenomenal-rubric-usage-swatch--off" /> нет
            </span>
          </>
        ) : (
          <>
            По шаблону «Для анализа ИИ» в ячейках перечислены <strong>формулировки пунктов рубрики</strong> через запятую
            (не числа 0–4).{' '}
            {hasPhraseDetail ? (
              <>
                Ниже по каждому блоку — <strong>какие именно формулировки</strong> встречаются в срезе и сколько раз (по
                числу вхождений в ячейках); сводка «макс. в ячейке» — вспомогательная.
              </>
            ) : (
              <>
                Ниже — сколько таких пунктов в одной ячейке у этого педагога и опорный максимум по столбцу по всему файлу.
              </>
            )}
          </>
        )}
      </p>
      {hasAny && hasNumericLevels ? (
        <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.55rem', lineHeight: 1.45 }}>
          По срезу этого педагога: максимум отметок <strong>0–4</strong> в одной ячейке (по всем блокам) —{' '}
          <strong>{maxTokensOneCell}</strong>; сумма пиковых уровней по строкам рубрики — <strong>{sumPeakLevels}</strong>{' '}
          (теор. макс. {rows.length * 4}, если во всех блоках встречался уровень 4).
        </p>
      ) : null}
      {hasAny && !hasNumericLevels ? (
        <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.55rem', lineHeight: 1.45 }}>
          {hasPhraseDetail ? (
            <>
              Дополнительно: наибольшее число пунктов в одной ячейке среди граф — <strong>{maxTokensOneCell}</strong>; сумма
              опорных максимумов по столбцам (по файлу) — <strong>{sumGlobalMax}</strong>.
            </>
          ) : (
            <>
              По срезу: наибольшее число пунктов в одной ячейке среди граф — <strong>{maxTokensOneCell}</strong>; сумма опорных
              максимумов по столбцам (по файлу) — <strong>{sumGlobalMax}</strong>.
            </>
          )}
        </p>
      ) : null}
      {!hasAny ? (
        <p className="muted phenomenal-rubric-usage-empty" style={{ marginBottom: 0 }}>
          {isVisitChecklist
            ? 'Нет данных по разделам чек-листа для этого педагога — проверьте ответы и синхронизацию с аналитикой.'
            : 'Нет данных в столбцах компетенций для этого педагога — проверьте маппинг ролей «Компетенции 0–4» и заполнение ячеек.'}
        </p>
      ) : hasNumericLevels ? (
        <div className="phenomenal-rubric-usage-table-wrap">
          <table className="phenomenal-rubric-usage-table">
            <thead>
              <tr>
                <th className="phenomenal-rubric-usage-th-dim">Компетенция</th>
                {HEAT_LEVELS.map((lv) => (
                  <th key={lv} className="phenomenal-rubric-usage-th-lv">
                    {lv}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  <td className="phenomenal-rubric-usage-td-dim phenomenal-public-prose" style={{ fontSize: '0.82rem' }}>
                    {ri + 1}. {r.title}
                  </td>
                  {HEAT_LEVELS.map((lv) => {
                    const on = r.used.has(lv);
                    return (
                      <td
                        key={lv}
                        className={`phenomenal-rubric-usage-cell ${on ? 'phenomenal-rubric-usage-cell--on' : 'phenomenal-rubric-usage-cell--off'}`}
                        title={on ? `Уровень ${lv} есть в срезе` : `Уровень ${lv} не встречался`}
                      >
                        {on ? '·' : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {hasPhraseDetail && rubricPhraseBreakdown
            ? rubricPhraseBreakdown.map((sec, si) => {
                const maxInSection = sec.phrases.length
                  ? Math.max(1, ...sec.phrases.map((p) => p.count))
                  : 1;
                return (
                  <div key={`ph-${si}`} style={{ marginTop: si === 0 ? 0 : '1rem' }}>
                    <h5 className="muted phenomenal-rubric-usage-title" style={{ fontSize: '0.88rem', marginBottom: '0.45rem' }}>
                      {isVisitChecklist ? sec.title : `${si + 1}. ${sec.title}`}
                    </h5>
                    <div className="phenomenal-rubric-usage-table-wrap">
                      <table className="phenomenal-rubric-usage-table">
                        <thead>
                          <tr>
                            <th className="phenomenal-rubric-usage-th-dim">Пункт / формулировка</th>
                            <th className="phenomenal-rubric-usage-th-lv" style={{ minWidth: '7.5rem', textAlign: 'center' }}>
                              Вхождений в срезе
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sec.phrases.map((p, pi) => (
                            <tr key={pi}>
                              <td
                                className="phenomenal-rubric-usage-td-dim phenomenal-public-prose"
                                style={{ fontSize: '0.82rem' }}
                              >
                                {p.text}
                              </td>
                              <td className="phenomenal-rubric-usage-cell" style={countHeatStyle(p.count, maxInSection)}>
                                {p.count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            : null}
          {!hasPhraseDetail ? (
            <div className="phenomenal-rubric-usage-table-wrap">
              <table className="phenomenal-rubric-usage-table">
                <thead>
                  <tr>
                    <th className="phenomenal-rubric-usage-th-dim">Компетенция</th>
                    <th className="phenomenal-rubric-usage-th-lv" style={{ minWidth: '6.5rem' }}>
                      Макс. пунктов (файл)
                    </th>
                    <th className="phenomenal-rubric-usage-th-lv" style={{ minWidth: '6.5rem' }}>
                      Макс. в ячейке (срез)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri}>
                      <td className="phenomenal-rubric-usage-td-dim phenomenal-public-prose" style={{ fontSize: '0.82rem' }}>
                        {isVisitChecklist ? r.title : `${ri + 1}. ${r.title}`}
                      </td>
                      <td className="phenomenal-rubric-usage-cell phenomenal-rubric-usage-cell--off" style={{ textAlign: 'center' }}>
                        {r.globalMaxItemsInColumn > 0 ? r.globalMaxItemsInColumn : '—'}
                      </td>
                      <td
                        className="phenomenal-rubric-usage-cell"
                        style={countHeatStyle(
                          r.maxCommaTokensInCell,
                          Math.max(maxSliceAcrossRows, 1),
                        )}
                      >
                        {r.maxCommaTokensInCell > 0 ? r.maxCommaTokensInCell : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
