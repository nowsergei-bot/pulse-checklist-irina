import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { VisitChecklistCategoryTick } from './VisitChecklistCategoryTick';
import { verticalCategoryChartHeight } from '../lib/lessonVisitChecklist/visitChecklistCloudUi';
import { postExcelNarrativeSummary } from '../api/excel';
import { type LessonAnalyticsDraft } from '../api/lessonAnalytics';
import { useDashboardNarrativeDisplay } from '../hooks/useDashboardNarrativeDisplay';
import AiWaitIndicator from './AiWaitIndicator';
import { filterKeyForRole, type AnalyticRow } from '../lib/excelAnalytics/engine';
import type { CellPrimitive } from '../lib/excelAnalytics/parse';
import type { ColumnRole, CustomFilterLabels } from '../lib/excelAnalytics/types';
import {
  buildVisitDashboardKpis,
  buildVisitDashboardLlmContext,
  buildVisitDashboardScoreHeatmap,
  buildVisitOrdinalDistribution,
  buildVisitSectionPhraseAggregate,
} from '../lib/lessonVisitChecklist/buildVisitChecklistDashboard';
import VisitChecklistScoreHeatmap from './VisitChecklistScoreHeatmap';

type Props = {
  filteredRows: AnalyticRow[];
  dashboardRows: AnalyticRow[];
  roles: ColumnRole[];
  headers: string[];
  rawRows: CellPrimitive[][];
  customLabels: CustomFilterLabels;
  ordinalLevels: string[];
  teacherFilterKey: string | null;
  filterSummary?: string;
  /** Сохранённый текст аналитики среза (ИИ или правка методиста). */
  dashboardNarrative: string;
  dashboardNarrativeSource?: 'llm' | 'manual' | null;
  onDashboardNarrativeChange: (text: string, source: 'llm' | 'manual') => void;
  onPersist?: () => void;
  disabled?: boolean;
  /** Публичная страница для руководителя — без редактирования и служебных блоков. */
  leaderMode?: boolean;
  /** Внутри вкладки — без верхнего отступа секции. */
  embedded?: boolean;
  /** Скрыть тепловую карту среза — баллы показываются в карточках педагогов. */
  hideScoreHeatmap?: boolean;
  /** Черновик + ключ кэша для фоновой ИИ-аналитики (админка / руководитель). */
  narrativeDraft?: LessonAnalyticsDraft | null;
  narrativeCacheKey?: string | null;
  /** Контур ИИ: closed — Qwen Пульса; open — OpenRouter (роутер) / открытый API. */
  llmProvider?: import('../api/lessonAnalytics').LessonAnalyticsLlmProvider;
  /** Текст уже показан выше страницы — не дублировать в панели. */
  hideNarrativeSection?: boolean;
};

export default function LessonVisitChecklistDashboardPanel({
  filteredRows,
  dashboardRows,
  roles,
  headers,
  rawRows,
  customLabels,
  ordinalLevels,
  teacherFilterKey,
  filterSummary,
  dashboardNarrative,
  dashboardNarrativeSource,
  onDashboardNarrativeChange,
  onPersist,
  disabled = false,
  leaderMode = false,
  embedded = false,
  hideScoreHeatmap = true,
  narrativeDraft = null,
  narrativeCacheKey = null,
  llmProvider = 'closed',
  hideNarrativeSection = false,
}: Props) {
  const narrativeDraftForPrefetch = useMemo(
    (): LessonAnalyticsDraft =>
      narrativeDraft ?? {
        title: '',
        updatedAt: '',
        excelSession: null,
        teacherBlocks: [],
        dashboardNarrative,
        dashboardNarrativeSource: dashboardNarrativeSource ?? null,
      },
    [narrativeDraft, dashboardNarrative, dashboardNarrativeSource],
  );
  const prefetchedNarrative = useDashboardNarrativeDisplay({
    draft: narrativeDraftForPrefetch,
    cacheKey: narrativeCacheKey,
    prefetch: Boolean(narrativeCacheKey),
  });
  const departmentFilterKey = roles.includes('filter_custom_2')
    ? filterKeyForRole('filter_custom_2', customLabels)
    : null;

  const kpis = useMemo(
    () => buildVisitDashboardKpis(filteredRows, teacherFilterKey, departmentFilterKey),
    [filteredRows, teacherFilterKey, departmentFilterKey],
  );

  const ordDist = useMemo(
    () => buildVisitOrdinalDistribution(filteredRows, ordinalLevels),
    [filteredRows, ordinalLevels],
  );

  const sectionPhrases = useMemo(
    () => buildVisitSectionPhraseAggregate(rawRows, roles, filteredRows, 6),
    [rawRows, roles, filteredRows],
  );

  const scoreHeatmap = useMemo(
    () => buildVisitDashboardScoreHeatmap(rawRows, roles, filteredRows),
    [rawRows, roles, filteredRows],
  );

  const metricNumericCols = useMemo(() => {
    const idxs: number[] = [];
    roles.forEach((r, i) => {
      if (r === 'metric_numeric') idxs.push(i);
    });
    return idxs;
  }, [roles]);

  const dateLabel = useMemo(() => {
    const di = roles.indexOf('date');
    return di >= 0 ? headers[di]?.trim() || 'Дата' : '';
  }, [roles, headers]);

  const llmContext = useMemo(
    () =>
      buildVisitDashboardLlmContext({
        filteredRows,
        dashboardRows,
        teacherFilterKey,
        metricNumericCols,
        headers,
        roles,
        rawRows,
        ordinalLevels,
        dateLabel,
        filterSummary,
        sectionPhrases,
        scoreHeatmap,
      }),
    [
      filteredRows,
      dashboardRows,
      teacherFilterKey,
      metricNumericCols,
      headers,
      roles,
      rawRows,
      ordinalLevels,
      dateLabel,
      filterSummary,
      sectionPhrases,
      scoreHeatmap,
    ],
  );

  const [aiNarrative, setAiNarrative] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(dashboardNarrative);
  const aiFetchKeyRef = useRef<string | null>(null);
  const dashboardNarrativeRef = useRef(dashboardNarrative);
  const onDashboardNarrativeChangeRef = useRef(onDashboardNarrativeChange);
  dashboardNarrativeRef.current = dashboardNarrative;
  onDashboardNarrativeChangeRef.current = onDashboardNarrativeChange;

  const llmFetchKey = useMemo(
    () => `${filterSummary ?? ''}\u0001${filteredRows.length}\u0001${kpis.uniqueVisits}\u0001${llmContext}`,
    [filterSummary, filteredRows.length, kpis.uniqueVisits, llmContext],
  );

  useEffect(() => {
    if (!editing) setDraft(dashboardNarrative);
  }, [dashboardNarrative, editing]);

  useEffect(() => {
    if (
      leaderMode ||
      !llmContext.trim() ||
      dashboardNarrativeSource === 'manual' ||
      prefetchedNarrative.text.trim()
    ) {
      setAiNarrative(null);
      setAiLoading(false);
      setAiHint(null);
      aiFetchKeyRef.current = null;
      return;
    }
    if (dashboardNarrativeRef.current.trim() && aiFetchKeyRef.current === llmFetchKey) {
      setAiLoading(false);
      return;
    }
    if (aiFetchKeyRef.current === llmFetchKey) return;
    let cancelled = false;
    setAiLoading(true);
    setAiHint(null);
    const t = setTimeout(() => {
      aiFetchKeyRef.current = llmFetchKey;
      void postExcelNarrativeSummary({
        context: {
          numericSummary: llmContext.slice(0, 22000),
          filterSummary: filterSummary?.trim() || undefined,
          analysisMode: 'visit_checklist',
          userFocus:
            'Сфокусируйся на слабых темах (факт vs максимум рубрики). Учти комментарии методиста. Дай рекомендации по построению урока и приоритеты для методиста. Пиши связными абзацами; не используй коды пунктов (4.3, 7.8) — только краткие смысловые названия показателей из 2–3 слов.',
          meta: {
            filteredRowCount: filteredRows.length,
            uniqueImportRows: kpis.uniqueVisits,
          },
          llmProvider: llmProvider === 'open' ? 'open' : undefined,
        },
      })
        .then((res) => {
          if (cancelled) return;
          if (res.source === 'llm' && res.narrative?.trim()) {
            const text = res.narrative.trim();
            setAiNarrative(text);
            if (!dashboardNarrativeRef.current.trim()) {
              onDashboardNarrativeChangeRef.current(text, 'llm');
            }
            setAiHint(null);
          } else {
            setAiNarrative(null);
            setAiHint(res.hint?.trim() || 'ИИ не вернул текст — используйте машинную сводку ниже или введите аналитику вручную.');
          }
        })
        .catch(() => {
          if (!cancelled) {
            aiFetchKeyRef.current = null;
            setAiNarrative(null);
            setAiHint('Не удалось получить ИИ-отчёт по срезу. Проверьте связь с API и повторите позже.');
          }
        })
        .finally(() => {
          if (!cancelled) setAiLoading(false);
        });
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setAiLoading(false);
    };
  }, [
    llmFetchKey,
    llmContext,
    filterSummary,
    filteredRows.length,
    kpis.uniqueVisits,
    dashboardNarrativeSource,
    leaderMode,
    prefetchedNarrative.text,
    llmProvider,
  ]);

  const displayNarrative =
    dashboardNarrative.trim() ||
    prefetchedNarrative.text.trim() ||
    aiNarrative?.trim() ||
    '';
  const narrativeLoading = !displayNarrative && (aiLoading || prefetchedNarrative.loading);

  const saveEdit = useCallback(() => {
    onDashboardNarrativeChange(draft.trim(), 'manual');
    setEditing(false);
    onPersist?.();
  }, [draft, onDashboardNarrativeChange, onPersist]);

  const phrasesBySection = useMemo(() => {
    const m = new Map<string, typeof sectionPhrases>();
    for (const row of sectionPhrases) {
      const cur = m.get(row.sectionTitle) ?? [];
      cur.push(row);
      m.set(row.sectionTitle, cur);
    }
    return [...m.entries()];
  }, [sectionPhrases]);

  return (
    <section
      className="card glass-surface lesson-visit-dashboard"
      style={{ marginTop: embedded ? 0 : '1rem' }}
    >
      <h2 className="admin-dash-title" style={{ fontSize: '1.1rem' }}>
        {leaderMode ? 'Сводка по чек-листу' : '3. Сводка по чек-листу (срез)'}
      </h2>
      {!leaderMode ? (
        <p className="muted" style={{ fontSize: '0.88rem', marginTop: '0.35rem' }}>
          Обзор среза: KPI, уровень урока, частые пункты и общая ИИ-аналитика. Карта баллов по каждому педагогу —
          в его карточке (вид методиста).
        </p>
      ) : (
        <p className="muted" style={{ fontSize: '0.88rem', marginTop: '0.35rem' }}>
          Обзор среза: KPI, уровень методического мастерства, частые отмеченные пункты и аналитическая записка. Карта баллов
          по педагогам — в карточках (вид методиста).
        </p>
      )}

      <div className="lesson-visit-dashboard-kpis" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginTop: '0.85rem' }}>
        <div className="card glass-surface" style={{ padding: '0.65rem 0.9rem', minWidth: 120 }}>
          <div className="muted" style={{ fontSize: '0.78rem' }}>Посещений</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{kpis.uniqueVisits}</div>
        </div>
        <div className="card glass-surface" style={{ padding: '0.65rem 0.9rem', minWidth: 120 }}>
          <div className="muted" style={{ fontSize: '0.78rem' }}>Педагогов</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{kpis.uniqueTeachers}</div>
        </div>
        <div className="card glass-surface" style={{ padding: '0.65rem 0.9rem', minWidth: 120 }}>
          <div className="muted" style={{ fontSize: '0.78rem' }}>Кафедр</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{kpis.uniqueDepartments}</div>
        </div>
      </div>

      {!hideScoreHeatmap && scoreHeatmap.length > 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <h3 className="muted" style={{ fontSize: '0.9rem', marginBottom: '0.45rem' }}>
            Карта баллов по разделам чек-листа
          </h3>
          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', lineHeight: 1.45 }}>
            {leaderMode
              ? 'Средние баллы по показателям рубрики: сравнение фактического результата с максимально возможным по каждому разделу. Краснее ячейка — выше доля от максимума.'
              : 'Средние баллы по показателям рубрики (колонка 6 Excel): сравнение фактического результата с максимально возможным по каждому разделу. Краснее ячейка — выше доля от максимума.'}
          </p>
          <VisitChecklistScoreHeatmap sections={scoreHeatmap} />
        </div>
      ) : null}

      {ordDist.length > 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <h3 className="muted" style={{ fontSize: '0.9rem', marginBottom: '0.45rem' }}>
            {leaderMode
              ? 'Уровень методического мастерства'
              : 'Уровень представленного урока (по посещениям среза)'}
          </h3>
          <div className="excel-analytics-chart visit-checklist-chart" style={{ maxWidth: 520 }}>
            <ResponsiveContainer width="100%" height={verticalCategoryChartHeight(ordDist.length)}>
              <BarChart data={ordDist.map((d) => ({ level: d.level, count: d.count }))} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis type="number" tick={{ fontSize: 10, letterSpacing: 0 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="level"
                  width={168}
                  interval={0}
                  tickLine={false}
                  tick={(props) => (
                    <VisitChecklistCategoryTick x={props.x} y={props.y} payload={props.payload} wrapWidth={18} />
                  )}
                />
                <Tooltip />
                <Bar dataKey="count" fill="var(--chart-bar, #e30613)" name="Посещений" radius={[0, 3, 3, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {phrasesBySection.length > 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <h3 className="muted" style={{ fontSize: '0.9rem', marginBottom: '0.45rem' }}>
            Частые отмеченные пункты по разделам чек-листа
          </h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {phrasesBySection.map(([title, rows]) => (
              <details key={title} className="card glass-surface" style={{ padding: '0.5rem 0.75rem' }} open>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>{title}</summary>
                <ul
                  style={{
                    margin: '0.5rem 0 0',
                    paddingLeft: '1.1rem',
                    fontSize: '0.84rem',
                    lineHeight: 1.45,
                  }}
                >
                  {rows.map((r, i) => (
                    <li
                      key={`${r.phrase}-${i}`}
                      style={{ marginBottom: '0.3rem', whiteSpace: 'normal', wordBreak: 'break-word' }}
                    >
                      {r.phrase} <span className="muted">({r.count})</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      ) : null}

      {!hideNarrativeSection ? (
      <div className="lesson-visit-dashboard-narrative" style={{ marginTop: '1.15rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <h3 className="muted" style={{ fontSize: '0.9rem', margin: 0 }}>
            {leaderMode ? 'Аналитическая записка' : 'ИИ-аналитика среза'}
            {!leaderMode && dashboardNarrativeSource === 'manual' ? (
              <span className="muted" style={{ fontWeight: 500, marginLeft: '0.35rem' }}>
                · отредактировано методистом
              </span>
            ) : null}
          </h3>
          {!leaderMode ? (
            <AiWaitIndicator active={narrativeLoading} compact label="ИИ-отчёт по срезу" typicalMinSec={12} typicalMaxSec={45} />
          ) : null}
          {!leaderMode && !editing && !disabled ? (
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              {displayNarrative ? 'Редактировать' : 'Ввести вручную'}
            </button>
          ) : null}
        </div>

        {!leaderMode && aiHint && !displayNarrative ? <p className="err" style={{ fontSize: '0.82rem' }}>{aiHint}</p> : null}

        {!leaderMode && editing ? (
          <>
            <textarea
              className="input lesson-analytics-teacher-card__ai-narrative-editor"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              placeholder="Аналитическая записка по текущему срезу чек-листа. Абзацы — через пустую строку."
              disabled={disabled}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-sm primary" disabled={disabled || !draft.trim()} onClick={saveEdit}>
                Сохранить текст
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={disabled}
                onClick={() => {
                  setDraft(dashboardNarrative);
                  setEditing(false);
                }}
              >
                Отмена
              </button>
            </div>
          </>
        ) : displayNarrative ? (
          <article className="excel-ai-report-prose phenomenal-public-prose">
            {displayNarrative.split(/\n\n+/).map((p, i) => (
              <p key={i} style={{ margin: '0.35rem 0' }}>
                {p.trim()}
              </p>
            ))}
          </article>
        ) : !leaderMode && narrativeLoading ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>Формируется ИИ-аналитика по срезу…</p>
        ) : !displayNarrative ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            {leaderMode
              ? 'Аналитическая записка пока не подготовлена.'
              : 'Нет текста аналитики — дождитесь ответа ИИ или введите вручную.'}
          </p>
        ) : null}

        {!leaderMode ? (
          <details style={{ marginTop: '0.75rem' }}>
            <summary className="muted excel-ai-report-facts-summary" style={{ cursor: 'pointer', fontSize: '0.82rem' }}>
              Исходные факты (машинная сводка)
            </summary>
            <pre className="excel-analytics-pre excel-dash-pre" style={{ marginTop: '0.45rem', fontSize: '0.78rem', maxHeight: 240, overflow: 'auto' }}>
              {llmContext}
            </pre>
          </details>
        ) : null}
      </div>
      ) : null}
    </section>
  );
}
