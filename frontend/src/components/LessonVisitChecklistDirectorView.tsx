import { motion } from 'framer-motion';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
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
import { type LessonAnalyticsDraft, type LessonAnalyticsTeacherBlock } from '../api/lessonAnalytics';
import LessonAnalyticsTeacherBlockCard from './LessonAnalyticsTeacherBlockCard';
import LessonVisitChecklistDashboardPanel from './LessonVisitChecklistDashboardPanel';
import LessonVisitDashboardNarrativeBlock from './LessonVisitDashboardNarrativeBlock';
import { useDashboardNarrativeDisplay } from '../hooks/useDashboardNarrativeDisplay';
import PulseExcelSliceFiltersPanel from './PulseExcelSliceFiltersPanel';
import VisitChecklistTeachersSection from './VisitChecklistTeachersSection';
import { adminStaggerItem } from '../motion/adminMotion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { displayVisitChecklistTitle, VISIT_CHECKLIST_TITLE } from '../lib/lessonVisitChecklist/normalizeChecklist';
import { useVisitChecklistTeacherBlocks } from '../hooks/useVisitChecklistTeacherBlocks';
import {
  augmentRowsWithDerivedParallel,
  buildAnalyticRows,
  chartSafeFinite,
  expandRowsForMultiValueFilterColumns,
  expandRowsForPulseSurveyMultiSelect,
  filterKeyForRole,
} from '../lib/excelAnalytics/engine';
import { collapseSimilarFilterDimensionValues } from '../lib/excelAnalytics/filterValueNormalize';
import { usePulseExcelSliceFilters } from '../lib/excelAnalytics/usePulseExcelSliceFilters';
import type { ColumnRole, CustomFilterLabels } from '../lib/excelAnalytics/types';
import { buildAnalyticRowsFromLessonDraft } from '../lib/lessonAnalytics/buildAnalyticRowsFromLessonDraft';
import {
  sliceChartsForVisitChecklistTeacher,
  type TeacherSliceChart,
} from '../lib/lessonAnalytics/buildLessonAnalyticsTeacherCardView';
import { filterTeacherBlocksForSlice, hasActiveSliceFilters } from '../lib/lessonAnalytics/filterTeacherBlocksForSlice';
import {
  augmentRowsWithDirectorDepartment,
  resolveDirectorPublicFilterKeys,
} from '../lib/lessonAnalytics/directorPublicSliceFilters';
import { getLessonDraftGridForAnalysis } from '../lib/lessonAnalytics/lessonDraftGrid';
import { normalizeLessonCardTemplate } from '../lib/lessonAnalytics/cardTemplate';
import { PDF_CARD_KEEP_TOGETHER_CLASS } from '../lib/pdf/captureElementToPdfA4';
import { isVisitChecklistAnalytics } from '../lib/lessonVisitChecklist/buildVisitChecklistDashboard';
import {
  headersLookLikeVisitChecklistAnalytics,
  resolveLessonAnalyticsColumnRoles,
} from '../lib/lessonVisitChecklist/resolveVisitChecklistGridRoles';
import { matchesSurnameFilter } from '../lib/matchSurnameFilter';
import { sortTeachersByLabel } from '../lib/lessonAnalytics/teacherCipherDepartment';
import { useDebouncedValue } from '../lib/useDebouncedValue';

function VisitTeacherSliceCharts({ charts }: { charts: TeacherSliceChart[] }) {
  const safeCharts = useMemo(
    () =>
      charts.map(({ key, label, bars }) => ({
        key,
        label,
        bars: bars.map((b) => ({
          ...b,
          uniqueLessons: chartSafeFinite(b.uniqueLessons, 0),
        })),
      })),
    [charts],
  );
  if (safeCharts.length === 0) return null;
  return (
    <div className={`lesson-analytics-slice-charts-wrap ${PDF_CARD_KEEP_TOGETHER_CLASS}`}>
      <h4 className="muted lesson-analytics-teacher-chart-title" style={{ fontSize: '0.85rem' }}>
        Параллель и предмет
      </h4>
      <p className="muted" style={{ fontSize: '0.78rem', marginTop: 4, marginBottom: 8 }}>
        По наблюдениям педагога: в каких параллелях и по каким предметам проводились уроки.
      </p>
      <div className="excel-filter-distributions-grid">
        {safeCharts.map(({ key, label, bars }) => (
          <div
            key={key}
            className={`excel-filter-distribution-mini card glass-surface ${PDF_CARD_KEEP_TOGETHER_CLASS}`}
          >
            <h4 className="excel-filter-distribution-mini-title">{label}</h4>
            <div className="excel-analytics-chart excel-filter-distribution-mini-chart visit-checklist-chart">
              <ResponsiveContainer width="100%" height={verticalCategoryChartHeight(bars.length)}>
                <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 4 }} barCategoryGap={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fontSize: 10, letterSpacing: 0 }} />
                  <YAxis
                    type="category"
                    dataKey="short"
                    width={140}
                    interval={0}
                    tickLine={false}
                    tick={(props) => (
                      <VisitChecklistCategoryTick x={props.x} y={props.y} payload={props.payload} wrapWidth={16} />
                    )}
                  />
                  <Tooltip />
                  <Bar dataKey="uniqueLessons" fill="var(--chart-bar, #e30613)" name="Посещений" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DirectorContentSkeleton() {
  return (
    <div className="card glass-surface" style={{ marginTop: '1rem', padding: '1rem', opacity: 0.78 }}>
      <p className="muted" style={{ margin: 0 }}>
        Подготовка фильтров, сводки и карточек педагогов…
      </p>
    </div>
  );
}

type LeaderViewMode = 'methodist' | 'teacher';

type Props = {
  projectTitle: string;
  updatedAt: string | null;
  draft: LessonAnalyticsDraft;
  /** Ключ фонового кэша ИИ-аналитики (страница руководителя). */
  narrativeCacheKey?: string | null;
};

type ContentProps = {
  draft: LessonAnalyticsDraft;
  leaderViewMode: LeaderViewMode;
  narrativeCacheKey?: string | null;
};

function LessonVisitChecklistDirectorContent({ draft, leaderViewMode, narrativeCacheKey }: ContentProps) {
  const [teacherSurnameFilter, setTeacherSurnameFilter] = useState('');
  const debouncedTeacherSurnameFilter = useDebouncedValue(teacherSurnameFilter, 300);

  const pipeline = useMemo(() => buildAnalyticRowsFromLessonDraft(draft), [draft]);
  const gridForRubric = useMemo(() => getLessonDraftGridForAnalysis(draft), [draft]);
  const visitGridRoles = useMemo(() => {
    if (!gridForRubric) return null;
    return resolveLessonAnalyticsColumnRoles(gridForRubric.headers, gridForRubric.matrixRows, {
      preferVisitChecklist: true,
    });
  }, [gridForRubric]);

  const excelSession = draft.excelSession;
  const headers = gridForRubric?.headers ?? excelSession?.headers ?? [];
  const rolesForAnalysis = useMemo(() => {
    if (visitGridRoles?.roles.length) return visitGridRoles.roles;
    return gridForRubric?.rolesForRun ?? ((excelSession?.roles ?? []) as ColumnRole[]);
  }, [visitGridRoles, gridForRubric, excelSession?.roles]);
  const customLabels = useMemo(() => {
    if (visitGridRoles && Object.keys(visitGridRoles.customLabels).length > 0) {
      return visitGridRoles.customLabels;
    }
    return (excelSession?.customLabels ?? gridForRubric?.customLabels ?? {}) as CustomFilterLabels;
  }, [visitGridRoles, excelSession?.customLabels, gridForRubric?.customLabels]);
  const ordinalLevels = useMemo(() => {
    if (visitGridRoles?.ordinalLevels.length) return visitGridRoles.ordinalLevels;
    return excelSession?.ordinalLevels ?? gridForRubric?.ordinalLevels ?? [];
  }, [visitGridRoles, excelSession?.ordinalLevels, gridForRubric?.ordinalLevels]);
  const rawRows = gridForRubric?.matrixRows ?? [];

  const analyticRows = useMemo(() => {
    if (!gridForRubric) return pipeline.ok ? pipeline.analyticRows : [];
    const roles = rolesForAnalysis;
    const labels =
      visitGridRoles && Object.keys(visitGridRoles.customLabels).length > 0
        ? visitGridRoles.customLabels
        : gridForRubric.customLabels;
    const ord =
      visitGridRoles?.ordinalLevels.length ? visitGridRoles.ordinalLevels : gridForRubric.ordinalLevels;
    let built = buildAnalyticRows(
      gridForRubric.headers,
      gridForRubric.matrixRows,
      roles,
      labels,
      ord,
    );
    built = expandRowsForMultiValueFilterColumns(built, roles, labels);
    built = augmentRowsWithDerivedParallel(built, roles, labels);
    built = expandRowsForPulseSurveyMultiSelect(built, roles);
    built = collapseSimilarFilterDimensionValues(built, roles, labels);
    return built;
  }, [gridForRubric, pipeline, rolesForAnalysis, visitGridRoles]);

  const visitChecklistMode = useMemo(
    () => isVisitChecklistAnalytics(rolesForAnalysis) || headersLookLikeVisitChecklistAnalytics(headers),
    [rolesForAnalysis, headers],
  );

  const teacherFilterKey = useMemo(() => {
    if (!rolesForAnalysis.includes('filter_teacher_code')) return null;
    return filterKeyForRole('filter_teacher_code', customLabels);
  }, [rolesForAnalysis, customLabels]);

  const directorFilterSpec = useMemo(
    () => resolveDirectorPublicFilterKeys(rolesForAnalysis, headers, customLabels, teacherFilterKey),
    [rolesForAnalysis, headers, customLabels, teacherFilterKey],
  );

  const analyticRowsForSlice = useMemo(() => {
    if (!teacherFilterKey) return analyticRows;
    return augmentRowsWithDirectorDepartment(analyticRows, teacherFilterKey);
  }, [analyticRows, teacherFilterKey]);

  const sliceFilters = usePulseExcelSliceFilters({
    analyticRows: analyticRowsForSlice,
    roles: rolesForAnalysis,
    headers,
    customLabels,
    initialFilterSelection: excelSession?.filterSelection ?? null,
    initialFilterPanelHiddenKeys: [],
    restrictedFilterKeys: directorFilterSpec?.keys ?? null,
    restrictedFilterLabels: directorFilterSpec?.labels,
  });

  const visitFilterSummaryRu = useMemo(() => {
    const parts: string[] = [];
    for (const [key, values] of Object.entries(sliceFilters.filterSelection)) {
      if (!values?.length) continue;
      const label = sliceFilters.filterKeyDisplayLabel[key] ?? key;
      parts.push(`${label}: ${values.join(', ')}`);
    }
    return parts.join('; ');
  }, [sliceFilters.filterSelection, sliceFilters.filterKeyDisplayLabel]);

  const metricNumericCols = useMemo(() => {
    const idxs: number[] = [];
    rolesForAnalysis.forEach((r, i) => {
      if (r === 'metric_numeric') idxs.push(i);
    });
    return idxs;
  }, [rolesForAnalysis]);

  const dateLabel = useMemo(() => {
    const di = rolesForAnalysis.indexOf('date');
    return di >= 0 ? headers[di]?.trim() || 'Дата' : '';
  }, [rolesForAnalysis, headers]);

  const dashboardNarrativeDisplay = useDashboardNarrativeDisplay({
    draft,
    cacheKey: narrativeCacheKey,
    prefetch: Boolean(narrativeCacheKey),
  });
  const dashboardNarrative = dashboardNarrativeDisplay.text;
  const dashboardNarrativeSource = dashboardNarrativeDisplay.source;
  const dashboardNarrativeLoading = dashboardNarrativeDisplay.loading;

  const teacherBlocksAllRaw = draft.teacherBlocks ?? [];
  const visitChecklistTeacherBlocks = useVisitChecklistTeacherBlocks({
    enabled: visitChecklistMode,
    teacherFilterKey,
    dashboardRows: sliceFilters.dashboardRows,
    rawRows,
    roles: rolesForAnalysis,
    persistedBlocks: teacherBlocksAllRaw,
  });
  const teacherBlocksAll = visitChecklistTeacherBlocks.blocks;
  const visibleTeacherBlocks = useMemo(
    () =>
      filterTeacherBlocksForSlice(
        teacherBlocksAll,
        sliceFilters.filteredRows,
        teacherFilterKey,
        sliceFilters.filterSelection,
      ),
    [teacherBlocksAll, sliceFilters.filteredRows, sliceFilters.filterSelection, teacherFilterKey],
  );

  const displayTeacherBlocks = useMemo(() => {
    const q = debouncedTeacherSurnameFilter.trim();
    if (!q) return visibleTeacherBlocks;
    return visibleTeacherBlocks.filter((b) => matchesSurnameFilter(b.teacherLabel, q));
  }, [visibleTeacherBlocks, debouncedTeacherSurnameFilter]);

  const sortedTeacherBlocks = useMemo(
    () => sortTeachersByLabel(displayTeacherBlocks, (b) => b.teacherLabel),
    [displayTeacherBlocks],
  );

  const cardTemplate = useMemo(() => normalizeLessonCardTemplate(draft.cardTemplate ?? null), [draft.cardTemplate]);

  const teacherCardCtx = useMemo(
    () => ({
      teacherFilterKey,
      dashboardRows: sliceFilters.dashboardRows,
      sliceRows: hasActiveSliceFilters(sliceFilters.filterSelection)
        ? sliceFilters.filteredRows
        : undefined,
      structuralFilterKeys: sliceFilters.filterKeys,
      filterLabels: sliceFilters.filterLabels,
      metricNumericCols,
      headers,
      roles: rolesForAnalysis,
      ordinalLevels,
      dateLabel,
    }),
    [
      teacherFilterKey,
      sliceFilters.dashboardRows,
      sliceFilters.filteredRows,
      sliceFilters.filterSelection,
      sliceFilters.filterKeys,
      sliceFilters.filterLabels,
      metricNumericCols,
      headers,
      rolesForAnalysis,
      ordinalLevels,
      dateLabel,
    ],
  );

  const noop = useCallback(() => {}, []);

  const renderTeacherCard = useCallback(
    (block: LessonAnalyticsTeacherBlock, _cardIndex = 0) => {
      const aiText = String(block.aiNarrative ?? '').trim();
      const cardArchiveStatusText = aiText ? null : 'ИИ-аналитика готовится — обновите страницу позже';
      return (
        <LessonAnalyticsTeacherBlockCard
          key={`${block.id}-${leaderViewMode}`}
          block={block}
          visitChecklistMode
          leaderMode
          teacherAudienceView={leaderViewMode === 'teacher'}
          defaultCollapsed={false}
          cardTemplate={cardTemplate}
          aiNarrativeText={aiText}
          cardArchiveStatusText={cardArchiveStatusText}
          teacherCardCtx={teacherCardCtx}
          teacherFilterKey={teacherFilterKey!}
          headers={headers}
          rawRows={rawRows}
          rolesForLessonMatrix={rolesForAnalysis}
          customLabels={customLabels}
          resolvedEmail={null}
          narrativeBusy={false}
          emailBusy={false}
          pdfBusy={false}
          pdfCaptureBusy={false}
          aiBatchRunning={false}
          saveBusy={false}
          sliceChartsSlot={(charts) => (
            <VisitTeacherSliceCharts charts={sliceChartsForVisitChecklistTeacher(charts)} />
          )}
          onGenerateNarrative={noop}
          onAgree={noop}
          onRevokeAgree={noop}
          onEmail={noop}
          onDownloadPdf={noop}
          onAiNarrativeChange={noop}
          poolRows={sliceFilters.dashboardRows}
          onRowMembershipChange={noop}
        />
      );
    },
    [
      cardTemplate,
      teacherCardCtx,
      teacherFilterKey,
      headers,
      rawRows,
      rolesForAnalysis,
      customLabels,
      sliceFilters.dashboardRows,
      leaderViewMode,
      noop,
    ],
  );

  if (!visitChecklistMode) {
    return (
      <div className="card glass-surface" style={{ marginTop: '1rem' }}>
        <p className="err">Ссылка относится к обычной аналитике уроков, не к чек-листу посещения.</p>
      </div>
    );
  }

  if (!gridForRubric && !pipeline.ok) {
    return (
      <motion.div className="card glass-surface" style={{ marginTop: '1rem' }} variants={adminStaggerItem}>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          {pipeline.reason}
        </p>
      </motion.div>
    );
  }

  const dashboardPanel =
    leaderViewMode === 'methodist' && visitChecklistMode && analyticRows.length > 0 && teacherFilterKey ? (
      <LessonVisitChecklistDashboardPanel
        embedded
        leaderMode
        hideScoreHeatmap
        filteredRows={sliceFilters.filteredRows}
        dashboardRows={sliceFilters.dashboardRows}
        roles={rolesForAnalysis}
        headers={headers}
        rawRows={rawRows}
        customLabels={customLabels}
        ordinalLevels={ordinalLevels}
        teacherFilterKey={teacherFilterKey}
        filterSummary={visitFilterSummaryRu}
        dashboardNarrative={dashboardNarrative}
        dashboardNarrativeSource={dashboardNarrativeSource}
        narrativeDraft={draft}
        narrativeCacheKey={narrativeCacheKey}
        hideNarrativeSection
        onDashboardNarrativeChange={noop}
      />
    ) : null;

  const teachersSection =
    teacherFilterKey && visitChecklistTeacherBlocks.ready ? (
      <VisitChecklistTeachersSection
        totalCount={teacherBlocksAll.length}
        visibleCount={visibleTeacherBlocks.length}
        displayCount={displayTeacherBlocks.length}
        surnameFilter={teacherSurnameFilter}
        onSurnameFilterChange={setTeacherSurnameFilter}
        teacherDirectory={displayTeacherBlocks}
        onJumpToTeacher={(blockId) => {
          document
            .getElementById(`lesson-analytics-teacher-${blockId}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        toolbar={null}
        sectionDescription={
          leaderViewMode === 'methodist'
            ? 'Карточки развёрнуты: баллы, выводы, рекомендации и ИИ-аналитика видны сразу внутри карточки.'
            : 'Упрощённые карточки для педагога: разделы чек-листа, выводы, рекомендации и ИИ-аналитика — без числовых баллов.'
        }
        emptyVisibleMessage="По выбранным фильтрам нет педагогов с данными. Сбросьте или расширьте срез в панели выше."
        emptyDisplayMessage="Нет педагогов с такой фамилией. Очистите поле «Фамилия» или измените запрос."
        teachers={sortedTeacherBlocks}
        renderTeacherCard={renderTeacherCard}
      />
    ) : teacherFilterKey ? (
      <p className="muted card glass-surface" style={{ marginTop: '1rem', padding: '1rem' }}>
        {visitChecklistTeacherBlocks.teacherLabels.length === 0
          ? 'Нет педагогов в данных чек-листа для выбранного среза.'
          : 'Нет карточек педагогов для отображения.'}
      </p>
    ) : null;

  return (
    <>
      {analyticRows.length > 0 && sliceFilters.filterSections.length > 0 ? (
        <PulseExcelSliceFiltersPanel
          collapsible
          compact
          directorMode
          filterSections={sliceFilters.filterSections}
          filterKeyDisplayLabel={sliceFilters.filterKeyDisplayLabel}
          filterPanelHiddenKeys={sliceFilters.filterPanelHiddenKeys}
          filterSelection={sliceFilters.filterSelection}
          valuesForKey={sliceFilters.valuesForKey}
          onToggleValue={sliceFilters.toggleFilterValue}
          onClearKey={sliceFilters.clearFilterKey}
          onHideKey={sliceFilters.hideFilterKey}
          onShowKey={sliceFilters.showFilterKey}
          onShowAllHidden={() => sliceFilters.setFilterPanelHiddenKeys([])}
          onResetAll={sliceFilters.resetAllFilters}
          lead={
            leaderViewMode === 'methodist'
              ? 'Срез по кафедре, предмету и уровню педагогического мастерства. ИИ-аналитика среза — выше карточек; KPI — в сводке ниже.'
              : 'Срез по кафедре, предмету и уровню педагогического мастерства. Ниже — карточки педагогов по выбранной выборке.'
          }
        />
      ) : null}

      {dashboardNarrative || dashboardNarrativeLoading ? (
        <LessonVisitDashboardNarrativeBlock
          title={leaderViewMode === 'teacher' ? 'Аналитическая записка' : 'ИИ-аналитика'}
          text={dashboardNarrative}
          loading={dashboardNarrativeLoading}
        />
      ) : null}
      <section style={{ marginTop: '1rem' }}>{teachersSection}</section>
      {leaderViewMode === 'methodist' && dashboardPanel ? (
        <details style={{ marginTop: '1rem' }}>
          <summary
            className="admin-dash-title card glass-surface"
            style={{
              fontSize: '1.05rem',
              cursor: 'pointer',
              listStylePosition: 'outside',
              padding: '0.75rem 1rem',
              display: 'block',
            }}
          >
            Сводка по чек-листу (KPI)
          </summary>
          {dashboardPanel}
        </details>
      ) : null}
    </>
  );
}

export default function LessonVisitChecklistDirectorView({
  projectTitle,
  updatedAt,
  draft,
  narrativeCacheKey,
}: Props) {
  const shownTitle = displayVisitChecklistTitle(projectTitle || draft.title);
  useDocumentTitle(shownTitle ? `${shownTitle} · чек-лист` : VISIT_CHECKLIST_TITLE);

  const [leaderViewMode, setLeaderViewMode] = useState<LeaderViewMode>('methodist');
  const [contentReady, setContentReady] = useState(true);

  useEffect(() => {
    setContentReady(true);
  }, [draft]);

  return (
    <div className="page lesson-analytics-project-page lesson-visit-director-page">
      <motion.div className="card glass-surface" style={{ marginTop: '1rem' }} variants={adminStaggerItem}>
        <p className="admin-dash-kicker">Просмотр для руководителя · Чек-лист посещения урока</p>
        <h1 className="admin-dash-title">{shownTitle || VISIT_CHECKLIST_TITLE}</h1>
        <p className="muted admin-dash-lead">
          Карточки педагогов по выбранному срезу: вид методиста — карта баллов по посещениям; вид педагога — плашки разделов
          без чисел. Данные обновляются при каждом открытии ссылки.
        </p>
        {updatedAt ? (
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
            Обновлено: {new Date(updatedAt).toLocaleString('ru-RU')}
          </p>
        ) : null}
        <div
          className="lesson-visit-leader-view-toggle"
          role="tablist"
          aria-label="Режим просмотра для руководителя"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.45rem',
            marginTop: '1rem',
            padding: '0.35rem',
            borderRadius: 10,
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
            background: 'var(--surface-muted, rgba(15,23,42,0.03))',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={leaderViewMode === 'methodist'}
            className={`btn btn-sm${leaderViewMode === 'methodist' ? ' primary' : ''}`}
            onClick={() => startTransition(() => setLeaderViewMode('methodist'))}
          >
            Как видит методист
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={leaderViewMode === 'teacher'}
            className={`btn btn-sm${leaderViewMode === 'teacher' ? ' primary' : ''}`}
            onClick={() => startTransition(() => setLeaderViewMode('teacher'))}
          >
            Как видит педагог
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.55rem', lineHeight: 1.45 }}>
          {leaderViewMode === 'methodist'
            ? 'Карточки с картой баллов по каждому педагогу и обзорная сводка среза.'
            : 'Упрощённые карточки: красные плашки разделов, параллель, предмет и оценка урока — без числовых баллов.'}
        </p>
      </motion.div>

      {contentReady ? (
        <LessonVisitChecklistDirectorContent
          draft={draft}
          leaderViewMode={leaderViewMode}
          narrativeCacheKey={narrativeCacheKey}
        />
      ) : (
        <DirectorContentSkeleton />
      )}
    </div>
  );
}
