import { memo, useEffect, useMemo, useRef, useState, startTransition, type ReactNode } from 'react';
import CardOpenTimingBanner from './CardOpenTimingBanner';
import { useBackgroundWorkGate } from '../hooks/useBackgroundWorkGate';
import {
  enqueueHeavyCardReveal,
  estimateHeavyCardEtaSec,
  getHeavyCardQueuePosition,
  isHeavyCardCached,
} from '../lib/heavyCardGate';
import { useProgressiveMountSteps } from '../lib/useProgressiveMountSteps';
import LazyMount from './LazyMount';
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
import { type LessonAnalyticsCardTemplate, type LessonAnalyticsTeacherBlock } from '../api/lessonAnalytics';
import { normalizeLessonCardTemplate } from '../lib/lessonAnalytics/cardTemplate';
import LessonAnalyticsSummaryRecommendationsPanel from './LessonAnalyticsSummaryRecommendationsPanel';
import LessonAnalyticsTeacherRowsPanel from './LessonAnalyticsTeacherRowsPanel';
import type { TeacherCardRowMembership } from '../lib/lessonAnalytics/teacherCardRowMembership';
import { resolveTeacherCardRows } from '../lib/lessonAnalytics/teacherCardRowMembership';
import LessonCompetencyPointsTable from '../lib/lessonAnalytics/LessonCompetencyPointsTable';
import VisitChecklistSectionPresence from './VisitChecklistSectionPresence';
import VisitChecklistScoreHeatmap from './VisitChecklistScoreHeatmap';
import VisitChecklistRubricViewToggle from './VisitChecklistRubricViewToggle';
import VisitChecklistTeacherCardSection from './VisitChecklistTeacherCardSection';
import {
  buildVisitSectionPresence,
  buildVisitTeacherScoreHeatmap,
  buildVisitTeacherSectionScores,
} from '../lib/lessonVisitChecklist/visitChecklistScoring';
import {
  buildLessonAnalyticsTeacherCardView,
  sliceChartsForVisitChecklistTeacher,
  VISIT_ORDINAL_CHART_TITLE,
  type TeacherSliceChart,
} from '../lib/lessonAnalytics/buildLessonAnalyticsTeacherCardView';
import type { TeacherCardCtx } from '../lib/lessonAnalytics/buildLessonAnalyticsTeacherCardView';
import {
  buildLessonCompScaleSummaryQuotes,
  buildLessonCompetencyScaleAggregates,
  buildLessonTeacherRecommendationsQuotes,
} from '../lib/lessonAnalytics/lessonCompetencyScale';
import {
  LESSON_ANALYTICS_TEACHER_CARD_CLASS,
  LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS,
} from '../lib/lessonAnalytics/lessonAnalyticsTeacherDomPdf';
import { isLessonTeacherLocalFallbackText } from '../lib/lessonAnalytics/lessonTeacherNarrativeSanitize';
import { getMergedLessonAnalyticsProseRows } from '../lib/lessonAnalytics/lessonAnalyticsProseMerge';
import { PDF_CARD_KEEP_TOGETHER_CLASS } from '../lib/pdf/captureElementToPdfA4';
import {
  collectLessonProseCommentBlocks,
  countUniqueImportRows,
  dedupeRowsByLessonIdx,
  type AnalyticRow,
} from '../lib/excelAnalytics/engine';
import type { CellPrimitive } from '../lib/excelAnalytics/parse';
import type { ColumnRole, CustomFilterLabels } from '../lib/excelAnalytics/types';
import type { TeacherPeriodComparison } from '../lib/lessonAnalytics/computeLessonPeriodComparison';
import TeacherPeriodComparisonDynamics from './TeacherPeriodComparisonDynamics';
import TeacherCardBackgroundStatusBanner from './TeacherCardBackgroundStatusBanner';
import type { TeacherCardBackgroundStatus } from '../lib/lessonAnalytics/teacherCardBackgroundStatus';

export type LessonAnalyticsTeacherBlockCardProps = {
  block: LessonAnalyticsTeacherBlock;
  /** Данные из чек-листа посещения урока (разделы 1–10, не шкала компетенций Excel). */
  visitChecklistMode?: boolean;
  /** Красная рамка по отдельному срезу выделения (не сужает список). */
  highlightRed?: boolean;
  aiQueueSelected?: boolean;
  onAiQueueSelectChange?: (selected: boolean) => void;
  cardTemplate?: LessonAnalyticsCardTemplate | null;
  /** Текст ИИ для отображения (источник истины — родитель). */
  aiNarrativeText: string;
  teacherCardCtx: TeacherCardCtx;
  teacherFilterKey: string;
  headers: string[];
  rawRows: CellPrimitive[][];
  rolesForLessonMatrix: ColumnRole[];
  customLabels: CustomFilterLabels;
  resolvedEmail: string | null;
  narrativeBusy: boolean;
  /** Фоновая очередь: карточка ещё без ИИ-текста, запрос к модели не на этой карточке. */
  aiPending?: boolean;
  /** ИИ для этой карточки пропущен после таймаута/ошибки (можно повторить вручную). */
  aiGiveUp?: boolean;
  /** Статус JSON-архива карточки (фоновая обработка). */
  cardArchiveStatusText?: string | null;
  /** Развёрнутый статус фоновой обработки (чек-лист). */
  cardBackgroundStatus?: TeacherCardBackgroundStatus | null;
  emailBusy: boolean;
  pdfBusy: boolean;
  pdfCompactBusy?: boolean;
  pdfCaptureBusy: boolean;
  aiBatchRunning: boolean;
  saveBusy: boolean;
  sliceChartsSlot: (charts: TeacherSliceChart[]) => ReactNode;
  onGenerateNarrative: (block: LessonAnalyticsTeacherBlock) => void;
  /** Ручная правка текста до согласования с методистом. */
  onAiNarrativeChange: (blockId: string, text: string) => void;
  /** Отредактировано методистом (в чек-листе — флаг общей аналитики среза). */
  narrativeManualEdit?: boolean;
  /** Карточка свёрнута при первом показе (предпросмотр для методиста). */
  defaultCollapsed?: boolean;
  /** Публичная страница для руководителя — только чтение, без служебных панелей. */
  leaderMode?: boolean;
  /** Карточка как для педагога: плашки разделов, без баллов и служебных таблиц. */
  teacherAudienceView?: boolean;
  /** Чек-лист: переключатель вида карточки в заголовке (админка). */
  showVisitCardViewToggle?: boolean;
  visitCardViewMode?: 'methodist' | 'teacher';
  onVisitCardViewModeChange?: (mode: 'methodist' | 'teacher') => void;
  onAgree: (blockId: string) => void;
  onRevokeAgree: (blockId: string) => void;
  onEmail: (block: LessonAnalyticsTeacherBlock) => void;
  onDownloadPdf: (block: LessonAnalyticsTeacherBlock) => void;
  onDownloadPdfOnePage?: (block: LessonAnalyticsTeacherBlock) => void;
  /** Все строки таблицы после фильтров страницы — для ручного добавления в карточку. */
  poolRows: AnalyticRow[];
  onRowMembershipChange: (blockId: string, membership: TeacherCardRowMembership) => void;
  /** Δ относительно baseline-проекта (динамика периода). */
  periodComparison?: TeacherPeriodComparison | null;
  /** Порядковый номер в списке — для eager-монтирования первых карточек. */
  cardIndex?: number;
  /** Чек-лист: имя и баллы сразу, тяжёлое тело — при прокрутке или по кнопке. */
  deferHeavyBody?: boolean;
  /** Явный выбор карточки (Чек-лист 2.0) — открывать без ожидания простоя. */
  heavyBodyOpenPriority?: boolean;
  /** Чек-лист 2.0: без очереди heavyCardGate, тело сразу после одного кадра. */
  instantHeavyBody?: boolean;
  /** Пошаговый монтаж тяжёлых секций (теплокарты, таблицы). */
  progressiveBody?: boolean;
  /** Чек-лист 2.0: ИИ и кнопки сразу, баллы/таблицы — только после явного открытия. */
  visitDeferScoresOnly?: boolean;
  /** Тяжёлое тело — только по кнопке, без автозагрузки в viewport. */
  heavyBodyManualOnly?: boolean;
  /** Вызывается при явном запросе тяжёлого тела (кнопка «Показать…»). */
  onDeferHeavyBodyOpen?: () => void;
};

function buildVisitScoreCompactLine(
  sections: ReturnType<typeof buildVisitTeacherScoreHeatmap>,
): string | null {
  const withData = sections.filter((s) => s.fillRatio > 0);
  if (!withData.length) return null;
  const avgPct = Math.round(
    (withData.reduce((sum, s) => sum + s.fillRatio, 0) / withData.length) * 100,
  );
  return `Баллы: ${withData.length} разд. · ср. ${avgPct}%`;
}

function VisitExpandedHeatmapSection({
  visitChecklistMode,
  teacherAudienceView,
  visitTeacherRowIdxs,
  rawRows,
  rolesForLessonMatrix,
  customLabels,
  teacherFilterKey,
  teacherLabel,
}: {
  visitChecklistMode: boolean;
  teacherAudienceView: boolean;
  visitTeacherRowIdxs: number[];
  rawRows: CellPrimitive[][];
  rolesForLessonMatrix: ColumnRole[];
  customLabels: CustomFilterLabels;
  teacherFilterKey: string;
  teacherLabel: string;
}) {
  const visitSectionPresence = useMemo(() => {
    if (!visitChecklistMode || !visitTeacherRowIdxs.length) return [];
    const scores = buildVisitTeacherSectionScores(
      rawRows,
      rolesForLessonMatrix,
      customLabels,
      teacherFilterKey,
      teacherLabel,
      visitTeacherRowIdxs,
    );
    return buildVisitSectionPresence(scores, { markedOnly: teacherAudienceView });
  }, [
    visitChecklistMode,
    visitTeacherRowIdxs,
    rawRows,
    rolesForLessonMatrix,
    customLabels,
    teacherFilterKey,
    teacherLabel,
    teacherAudienceView,
  ]);

  const visitTeacherScoreHeatmap = useMemo(() => {
    if (!visitChecklistMode || !visitTeacherRowIdxs.length) return [];
    return buildVisitTeacherScoreHeatmap(
      rawRows,
      rolesForLessonMatrix,
      customLabels,
      teacherFilterKey,
      teacherLabel,
      visitTeacherRowIdxs,
    );
  }, [
    visitChecklistMode,
    visitTeacherRowIdxs,
    rawRows,
    rolesForLessonMatrix,
    customLabels,
    teacherFilterKey,
    teacherLabel,
  ]);

  if (visitChecklistMode && teacherAudienceView && visitSectionPresence.length > 0) {
    return (
      <div className={PDF_CARD_KEEP_TOGETHER_CLASS} style={{ marginTop: '0.65rem' }}>
        <VisitChecklistSectionPresence sections={visitSectionPresence} markedOnly />
      </div>
    );
  }

  if (visitChecklistMode && !teacherAudienceView && visitTeacherScoreHeatmap.length > 0) {
    return (
      <VisitChecklistTeacherCardSection
        title="Баллы по рубрикам чек-листа (вид методиста)"
        subtitle="Средние баллы по разделам 1–10 для посещений этого педагога."
        className={LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}
      >
        <VisitChecklistScoreHeatmap sections={visitTeacherScoreHeatmap} scope="teacher" />
      </VisitChecklistTeacherCardSection>
    );
  }

  return null;
}

function VisitExpandedChartsSection({
  visitChecklistMode,
  teacherAudienceView,
  teacherRows,
  headers,
  rawRows,
  rolesForLessonMatrix,
  customLabels,
  teacherFilterKey,
  teacherLabel,
  ordDist,
  sliceCharts,
  sliceChartsSlot,
  tpl,
  periodComparison,
}: {
  visitChecklistMode: boolean;
  teacherAudienceView: boolean;
  teacherRows: AnalyticRow[];
  headers: string[];
  rawRows: CellPrimitive[][];
  rolesForLessonMatrix: ColumnRole[];
  customLabels: CustomFilterLabels;
  teacherFilterKey: string;
  teacherLabel: string;
  ordDist: { level: string; count: number }[];
  sliceCharts: TeacherSliceChart[];
  sliceChartsSlot: (charts: TeacherSliceChart[]) => ReactNode;
  tpl: ReturnType<typeof normalizeLessonCardTemplate>;
  periodComparison?: TeacherPeriodComparison | null;
}) {
  const compAgg = useMemo(
    () =>
      headers.length && rawRows.length
        ? buildLessonCompetencyScaleAggregates(
            rawRows,
            rolesForLessonMatrix,
            customLabels,
            teacherFilterKey,
            teacherLabel,
            visitChecklistMode && teacherRows.length
              ? { rowIdxs: [...new Set(teacherRows.map((r) => r.idx))] }
              : undefined,
          )
        : null,
    [
      headers.length,
      rawRows,
      rolesForLessonMatrix,
      customLabels,
      teacherFilterKey,
      teacherLabel,
      visitChecklistMode,
      teacherRows,
    ],
  );

  const showVisitOrdinal =
    visitChecklistMode && teacherAudienceView && compAgg?.kind === 'visit_checklist' && ordDist.length > 0;

  return (
    <>
      {periodComparison?.matched ? (
        <div className={PDF_CARD_KEEP_TOGETHER_CLASS}>
          <TeacherPeriodComparisonDynamics
            comparison={periodComparison}
            hideRawNumbers={teacherAudienceView}
          />
        </div>
      ) : null}

      {tpl.showSliceCharts !== false && sliceCharts.length > 0 ? sliceChartsSlot(sliceCharts) : null}

      {showVisitOrdinal ? (
        <div className={PDF_CARD_KEEP_TOGETHER_CLASS} style={{ marginTop: '0.65rem' }}>
          <h4 className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>
            {VISIT_ORDINAL_CHART_TITLE}
          </h4>
          <div className="excel-analytics-chart visit-checklist-chart" style={{ maxWidth: 480 }}>
            <ResponsiveContainer width="100%" height={verticalCategoryChartHeight(ordDist.length)}>
              <BarChart
                data={ordDist.map((d) => ({ level: d.level, count: d.count }))}
                layout="vertical"
                margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
                barCategoryGap={8}
              >
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
                <Bar
                  dataKey="count"
                  fill="var(--chart-bar, #e30613)"
                  name="Посещений"
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </>
  );
}

function VisitExpandedProseSection({
  visitChecklistMode,
  teacherRows,
  rawRows,
  rolesForLessonMatrix,
  customLabels,
  teacherFilterKey,
  teacherLabel,
  headers,
  tpl,
}: {
  visitChecklistMode: boolean;
  teacherRows: AnalyticRow[];
  rawRows: CellPrimitive[][];
  rolesForLessonMatrix: ColumnRole[];
  customLabels: CustomFilterLabels;
  teacherFilterKey: string;
  teacherLabel: string;
  headers: string[];
  tpl: ReturnType<typeof normalizeLessonCardTemplate>;
}) {
  const proseCommentBlocks = useMemo(() => {
    const onePerLesson = dedupeRowsByLessonIdx(teacherRows);
    return collectLessonProseCommentBlocks(onePerLesson);
  }, [teacherRows]);

  const excelSummaryChunks = useMemo(
    () =>
      buildLessonCompScaleSummaryQuotes(
        rawRows,
        rolesForLessonMatrix,
        customLabels,
        teacherFilterKey,
        teacherLabel,
        headers,
      ),
    [rawRows, rolesForLessonMatrix, customLabels, teacherFilterKey, teacherLabel, headers],
  );

  const excelRecommendationChunks = useMemo(
    () =>
      buildLessonTeacherRecommendationsQuotes(
        rawRows,
        rolesForLessonMatrix,
        customLabels,
        teacherFilterKey,
        teacherLabel,
      ),
    [rawRows, rolesForLessonMatrix, customLabels, teacherFilterKey, teacherLabel],
  );

  if (tpl.showProsePanel === false) return null;

  return (
    <LessonAnalyticsSummaryRecommendationsPanel
      expandedProse
      visitChecklistSectionHeaders={visitChecklistMode}
      blocks={proseCommentBlocks}
      excelSummaryChunks={excelSummaryChunks}
      excelRecommendationChunks={excelRecommendationChunks}
    />
  );
}

function LessonAnalyticsTeacherBlockCardMetrics({
  block,
  visitChecklistMode,
  teacherCardCtx,
}: {
  block: LessonAnalyticsTeacherBlock;
  visitChecklistMode: boolean;
  teacherCardCtx: TeacherCardCtx;
}) {
  const lessonsInMonitoring = useMemo(() => {
    const view = buildLessonAnalyticsTeacherCardView(block, teacherCardCtx);
    return countUniqueImportRows(view.teacherRows);
  }, [block, teacherCardCtx]);

  if (lessonsInMonitoring <= 0) return null;
  return (
    <p className="muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
      {visitChecklistMode ? 'Наблюдений в срезе' : 'Уроков в мониторинге'}:{' '}
      <strong style={{ color: 'var(--text, #0f172a)' }}>{lessonsInMonitoring}</strong>
    </p>
  );
}

const LessonAnalyticsTeacherBlockCardExpanded = memo(function LessonAnalyticsTeacherBlockCardExpanded({
  block,
  visitChecklistMode,
  leaderMode,
  teacherAudienceView = false,
  teacherCardCtx,
  teacherFilterKey,
  headers,
  rawRows,
  rolesForLessonMatrix,
  customLabels,
  poolRows,
  narrativeBusy,
  saveBusy,
  introText,
  tpl,
  sliceChartsSlot,
  onRowMembershipChange,
  periodComparison,
  progressiveBody = false,
}: {
  block: LessonAnalyticsTeacherBlock;
  visitChecklistMode: boolean;
  leaderMode: boolean;
  teacherAudienceView?: boolean;
  teacherCardCtx: TeacherCardCtx;
  teacherFilterKey: string;
  headers: string[];
  rawRows: CellPrimitive[][];
  rolesForLessonMatrix: ColumnRole[];
  customLabels: CustomFilterLabels;
  poolRows: AnalyticRow[];
  narrativeBusy: boolean;
  saveBusy: boolean;
  introText: string;
  tpl: ReturnType<typeof normalizeLessonCardTemplate>;
  sliceChartsSlot: (charts: TeacherSliceChart[]) => ReactNode;
  onRowMembershipChange: (blockId: string, membership: TeacherCardRowMembership) => void;
  periodComparison?: TeacherPeriodComparison | null;
  progressiveBody?: boolean;
}) {
  const useProgressiveVisitBody = progressiveBody && visitChecklistMode && !leaderMode;
  const progressiveStep = useProgressiveMountSteps(4, useProgressiveVisitBody, block.id);
  const view = useMemo(
    () => buildLessonAnalyticsTeacherCardView(block, teacherCardCtx),
    [block, teacherCardCtx],
  );
  const { teacherRows, quick, sliceCharts: sliceChartsRaw, ordDist } = view;
  const sliceCharts = useMemo(
    () => (visitChecklistMode ? sliceChartsForVisitChecklistTeacher(sliceChartsRaw) : sliceChartsRaw),
    [visitChecklistMode, sliceChartsRaw],
  );

  const compAgg = useMemo(
    () => {
      if (useProgressiveVisitBody) return null;
      return headers.length && rawRows.length
        ? buildLessonCompetencyScaleAggregates(
            rawRows,
            rolesForLessonMatrix,
            customLabels,
            teacherFilterKey,
            block.teacherLabel,
            visitChecklistMode && teacherRows.length
              ? { rowIdxs: [...new Set(teacherRows.map((r) => r.idx))] }
              : undefined,
          )
        : null;
    },
    [
      useProgressiveVisitBody,
      headers.length,
      rawRows,
      rolesForLessonMatrix,
      customLabels,
      teacherFilterKey,
      block.teacherLabel,
      visitChecklistMode,
      teacherRows,
    ],
  );

  const showVisitOrdinal =
    visitChecklistMode && teacherAudienceView && compAgg?.kind === 'visit_checklist' && ordDist.length > 0;

  const visitTeacherRowIdxs = useMemo(() => {
    if (!visitChecklistMode || !teacherRows.length) return [];
    return [...new Set(teacherRows.map((r) => r.idx))];
  }, [visitChecklistMode, teacherRows]);

  const visitSectionPresence = useMemo(() => {
    if (useProgressiveVisitBody || !visitChecklistMode || !visitTeacherRowIdxs.length) return [];
    const scores = buildVisitTeacherSectionScores(
      rawRows,
      rolesForLessonMatrix,
      customLabels,
      teacherFilterKey,
      block.teacherLabel,
      visitTeacherRowIdxs,
    );
    return buildVisitSectionPresence(scores, { markedOnly: teacherAudienceView });
  }, [
    visitChecklistMode,
    visitTeacherRowIdxs,
    rawRows,
    rolesForLessonMatrix,
    customLabels,
    teacherFilterKey,
    block.teacherLabel,
    useProgressiveVisitBody,
  ]);

  const visitTeacherScoreHeatmap = useMemo(() => {
    if (useProgressiveVisitBody || !visitChecklistMode || !visitTeacherRowIdxs.length) return [];
    return buildVisitTeacherScoreHeatmap(
      rawRows,
      rolesForLessonMatrix,
      customLabels,
      teacherFilterKey,
      block.teacherLabel,
      visitTeacherRowIdxs,
    );
  }, [
    visitChecklistMode,
    visitTeacherRowIdxs,
    rawRows,
    rolesForLessonMatrix,
    customLabels,
    teacherFilterKey,
    block.teacherLabel,
    useProgressiveVisitBody,
  ]);

  const proseCommentBlocks = useMemo(() => {
    if (useProgressiveVisitBody) return [];
    const onePerLesson = dedupeRowsByLessonIdx(teacherRows);
    return collectLessonProseCommentBlocks(onePerLesson);
  }, [teacherRows, useProgressiveVisitBody]);

  const excelSummaryChunks = useMemo(() => {
    if (useProgressiveVisitBody) return [];
    return buildLessonCompScaleSummaryQuotes(
      rawRows,
      rolesForLessonMatrix,
      customLabels,
      teacherFilterKey,
      block.teacherLabel,
      headers,
    );
  }, [rawRows, rolesForLessonMatrix, customLabels, teacherFilterKey, block.teacherLabel, headers, useProgressiveVisitBody]);

  const excelRecommendationChunks = useMemo(() => {
    if (useProgressiveVisitBody) return [];
    return buildLessonTeacherRecommendationsQuotes(
        rawRows,
        rolesForLessonMatrix,
        customLabels,
        teacherFilterKey,
        block.teacherLabel,
      );
  }, [rawRows, rolesForLessonMatrix, customLabels, teacherFilterKey, block.teacherLabel, useProgressiveVisitBody]);

  const directorCardLayout = visitChecklistMode && leaderMode;

  const directorProseRows = useMemo(() => {
    if (!directorCardLayout) return { allSummaryRows: [] as string[], allRecRows: [] as string[] };
    return getMergedLessonAnalyticsProseRows(
      proseCommentBlocks,
      excelSummaryChunks,
      excelRecommendationChunks,
    );
  }, [directorCardLayout, proseCommentBlocks, excelSummaryChunks, excelRecommendationChunks]);

  if (directorCardLayout) {
    return (
      <>
        {introText ? (
          <div
            className={`lesson-analytics-card-template-intro phenomenal-public-prose ${PDF_CARD_KEEP_TOGETHER_CLASS}`}
            style={{ marginTop: '0.65rem', fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}
          >
            {introText.split(/\n\n+/).map((p, i) => (
              <p key={`intro-${i}`} style={{ margin: '0.35rem 0' }}>
                {p.trim()}
              </p>
            ))}
          </div>
        ) : null}

        {visitChecklistMode && !teacherAudienceView && visitTeacherScoreHeatmap.length > 0 ? (
          <VisitChecklistTeacherCardSection
            title="Баллы по рубрикам чек-листа"
            subtitle="Средние, максимальные баллы и доля от максимума по разделам 1–10 для посещений этого педагога."
          >
            <VisitChecklistScoreHeatmap sections={visitTeacherScoreHeatmap} scope="teacher" />
          </VisitChecklistTeacherCardSection>
        ) : null}

        {visitChecklistMode && teacherAudienceView && visitSectionPresence.length > 0 ? (
          <VisitChecklistTeacherCardSection
            title="Баллы по рубрикам чек-листа"
            subtitle="Отмеченные пункты по разделам 1–10 — упрощённый вид для педагога без числовых баллов."
          >
            <VisitChecklistSectionPresence sections={visitSectionPresence} markedOnly />
          </VisitChecklistTeacherCardSection>
        ) : null}

        {tpl.showProsePanel !== false ? (
          <>
            {directorProseRows.allSummaryRows.length > 0 ? (
              <VisitChecklistTeacherCardSection
                title="Общие выводы по урокам"
                subtitle="Цитаты из колонки «Общие выводы / summary» и связанных текстовых полей."
              >
                <LessonAnalyticsSummaryRecommendationsPanel
                  expandedProse
                  hideHeading
                  parts="summary"
                  blocks={proseCommentBlocks}
                  excelSummaryChunks={excelSummaryChunks}
                  excelRecommendationChunks={excelRecommendationChunks}
                />
              </VisitChecklistTeacherCardSection>
            ) : null}

            {directorProseRows.allRecRows.length > 0 ? (
              <VisitChecklistTeacherCardSection
                title="Рекомендации учителю"
                subtitle="Тексты из колонки «Рекомендации учителю» по посещениям этого педагога."
              >
                <LessonAnalyticsSummaryRecommendationsPanel
                  expandedProse
                  hideHeading
                  parts="recommendations"
                  blocks={proseCommentBlocks}
                  excelSummaryChunks={excelSummaryChunks}
                  excelRecommendationChunks={excelRecommendationChunks}
                />
              </VisitChecklistTeacherCardSection>
            ) : null}
          </>
        ) : null}
      </>
    );
  }

  if (useProgressiveVisitBody) {
    const progressivePlaceholder = (label: string) => (
      <p className="muted visit-checklist-teacher-card-body-placeholder" style={{ margin: '0.5rem 0 0' }}>
        {label}
      </p>
    );

    return (
      <>
        {introText ? (
          <div
            className={`lesson-analytics-card-template-intro phenomenal-public-prose ${PDF_CARD_KEEP_TOGETHER_CLASS}`}
            style={{ marginTop: '0.65rem', fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}
          >
            {introText.split(/\n\n+/).map((p, i) => (
              <p key={`intro-${i}`} style={{ margin: '0.35rem 0' }}>
                {p.trim()}
              </p>
            ))}
          </div>
        ) : null}

        {progressiveStep >= 1 ? (
          <VisitExpandedHeatmapSection
            visitChecklistMode={visitChecklistMode}
            teacherAudienceView={teacherAudienceView}
            visitTeacherRowIdxs={visitTeacherRowIdxs}
            rawRows={rawRows}
            rolesForLessonMatrix={rolesForLessonMatrix}
            customLabels={customLabels}
            teacherFilterKey={teacherFilterKey}
            teacherLabel={block.teacherLabel}
          />
        ) : (
          progressivePlaceholder('Подготовка теплокарты баллов…')
        )}

        {progressiveStep >= 2 ? (
          <VisitExpandedChartsSection
            visitChecklistMode={visitChecklistMode}
            teacherAudienceView={teacherAudienceView}
            teacherRows={teacherRows}
            headers={headers}
            rawRows={rawRows}
            rolesForLessonMatrix={rolesForLessonMatrix}
            customLabels={customLabels}
            teacherFilterKey={teacherFilterKey}
            teacherLabel={block.teacherLabel}
            ordDist={ordDist}
            sliceCharts={sliceCharts}
            sliceChartsSlot={sliceChartsSlot}
            tpl={tpl}
            periodComparison={periodComparison}
          />
        ) : progressiveStep >= 1 ? (
          progressivePlaceholder('Загрузка графиков…')
        ) : null}

        {progressiveStep >= 3 ? (
          !leaderMode && !teacherAudienceView ? (
            <LessonAnalyticsTeacherRowsPanel
              block={block}
              teacherRows={teacherRows}
              poolRows={poolRows}
              teacherFilterKey={teacherFilterKey}
              roles={rolesForLessonMatrix}
              customLabels={customLabels}
              disabled={block.status === 'agreed' || narrativeBusy || saveBusy}
              onMembershipChange={(membership) => onRowMembershipChange(block.id, membership)}
            />
          ) : null
        ) : progressiveStep >= 2 ? (
          progressivePlaceholder('Загрузка таблицы посещений…')
        ) : null}

        {progressiveStep >= 4 ? (
          <VisitExpandedProseSection
            visitChecklistMode={visitChecklistMode}
            teacherRows={teacherRows}
            rawRows={rawRows}
            rolesForLessonMatrix={rolesForLessonMatrix}
            customLabels={customLabels}
            teacherFilterKey={teacherFilterKey}
            teacherLabel={block.teacherLabel}
            headers={headers}
            tpl={tpl}
          />
        ) : progressiveStep >= 3 ? (
          progressivePlaceholder('Загрузка выводов и рекомендаций…')
        ) : null}
      </>
    );
  }

  return (
    <>
      {introText ? (
        <div
          className={`lesson-analytics-card-template-intro phenomenal-public-prose ${PDF_CARD_KEEP_TOGETHER_CLASS}`}
          style={{ marginTop: '0.65rem', fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}
        >
          {introText.split(/\n\n+/).map((p, i) => (
            <p key={`intro-${i}`} style={{ margin: '0.35rem 0' }}>
              {p.trim()}
            </p>
          ))}
        </div>
      ) : null}

      {visitChecklistMode && teacherAudienceView && visitSectionPresence.length > 0 ? (
        <div className={PDF_CARD_KEEP_TOGETHER_CLASS} style={{ marginTop: '0.65rem' }}>
          <VisitChecklistSectionPresence sections={visitSectionPresence} markedOnly />
        </div>
      ) : null}

      {visitChecklistMode && !teacherAudienceView && visitTeacherScoreHeatmap.length > 0 ? (
        <VisitChecklistTeacherCardSection
          title="Баллы по рубрикам чек-листа (вид методиста)"
          subtitle="Средние баллы по разделам 1–10 для посещений этого педагога."
          className={LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}
        >
          <VisitChecklistScoreHeatmap sections={visitTeacherScoreHeatmap} scope="teacher" />
        </VisitChecklistTeacherCardSection>
      ) : null}

      {periodComparison?.matched ? (
        <div className={PDF_CARD_KEEP_TOGETHER_CLASS}>
          <TeacherPeriodComparisonDynamics
            comparison={periodComparison}
            hideRawNumbers={teacherAudienceView}
          />
        </div>
      ) : null}

      {tpl.showSliceCharts !== false && sliceCharts.length > 0 ? sliceChartsSlot(sliceCharts) : null}

      {showVisitOrdinal ? (
        <div className={PDF_CARD_KEEP_TOGETHER_CLASS} style={{ marginTop: '0.65rem' }}>
          <h4 className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>
            {VISIT_ORDINAL_CHART_TITLE}
          </h4>
          <div className="excel-analytics-chart visit-checklist-chart" style={{ maxWidth: 480 }}>
            <ResponsiveContainer width="100%" height={verticalCategoryChartHeight(ordDist.length)}>
              <BarChart
                data={ordDist.map((d) => ({ level: d.level, count: d.count }))}
                layout="vertical"
                margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
                barCategoryGap={8}
              >
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
                <Bar
                  dataKey="count"
                  fill="var(--chart-bar, #e30613)"
                  name="Посещений"
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {!leaderMode && !(visitChecklistMode && teacherAudienceView) ? (
        <LessonAnalyticsTeacherRowsPanel
          block={block}
          teacherRows={teacherRows}
          poolRows={poolRows}
          teacherFilterKey={teacherFilterKey}
          roles={rolesForLessonMatrix}
          customLabels={customLabels}
          disabled={block.status === 'agreed' || narrativeBusy || saveBusy}
          onMembershipChange={(membership) => onRowMembershipChange(block.id, membership)}
        />
      ) : null}

      {!visitChecklistMode && !teacherAudienceView && tpl.showCompetencyTable !== false && compAgg ? (
        <div className={PDF_CARD_KEEP_TOGETHER_CLASS} style={{ marginTop: '0.5rem' }}>
          <LessonCompetencyPointsTable aggregate={compAgg} />
        </div>
      ) : null}

      {tpl.showProsePanel !== false ? (
        <LessonAnalyticsSummaryRecommendationsPanel
          expandedProse
          visitChecklistSectionHeaders={visitChecklistMode}
          blocks={proseCommentBlocks}
          excelSummaryChunks={excelSummaryChunks}
          excelRecommendationChunks={excelRecommendationChunks}
        />
      ) : null}

      {!teacherAudienceView && tpl.showQuickSummary !== false && quick.trim() && !visitChecklistMode ? (
        <div className={PDF_CARD_KEEP_TOGETHER_CLASS}>
          <h4 className="muted" style={{ fontSize: '0.85rem', marginTop: '0.75rem' }}>
            Сводка по баллам
          </h4>
          <div className="phenomenal-public-prose" style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>
            {quick}
          </div>
        </div>
      ) : null}
    </>
  );
});

function LessonAnalyticsTeacherBlockCardInner({
  block,
  visitChecklistMode = false,
  highlightRed = false,
  aiQueueSelected = false,
  onAiQueueSelectChange,
  cardTemplate: cardTemplateRaw,
  aiNarrativeText,
  teacherCardCtx,
  teacherFilterKey,
  headers,
  rawRows,
  rolesForLessonMatrix,
  customLabels,
  resolvedEmail,
  narrativeBusy,
  aiPending = false,
  aiGiveUp = false,
  cardArchiveStatusText = null,
  cardBackgroundStatus = null,
  emailBusy,
  pdfBusy,
  pdfCompactBusy = false,
  pdfCaptureBusy,
  aiBatchRunning,
  saveBusy,
  sliceChartsSlot,
  onGenerateNarrative,
  onAiNarrativeChange,
  narrativeManualEdit = false,
  defaultCollapsed = false,
  leaderMode = false,
  teacherAudienceView = false,
  showVisitCardViewToggle = false,
  visitCardViewMode = 'methodist',
  onVisitCardViewModeChange,
  onAgree,
  onRevokeAgree,
  onEmail,
  onDownloadPdf,
  onDownloadPdfOnePage,
  poolRows,
  onRowMembershipChange,
  periodComparison,
  cardIndex = 99,
  deferHeavyBody = false,
  heavyBodyOpenPriority = false,
  instantHeavyBody = false,
  progressiveBody = false,
  visitDeferScoresOnly = false,
  heavyBodyManualOnly = false,
  onDeferHeavyBodyOpen,
}: LessonAnalyticsTeacherBlockCardProps) {
  const effectiveDeferHeavyBody = deferHeavyBody && !instantHeavyBody;
  const tpl = normalizeLessonCardTemplate(cardTemplateRaw);
  const introText = String(tpl.introText ?? '').trim();
  const footerText = String(tpl.footerText ?? '').trim();
  const cardRootRef = useRef<HTMLElement | null>(null);
  const [inViewport, setInViewport] = useState(() => !effectiveDeferHeavyBody || instantHeavyBody);
  const [bodyRevealed, setBodyRevealed] = useState(
    () => !effectiveDeferHeavyBody || instantHeavyBody || isHeavyCardCached(block.id),
  );
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyLoadStartedAt, setBodyLoadStartedAt] = useState<number | null>(null);
  const [bodyLoadTick, setBodyLoadTick] = useState(0);
  const [forceRevealManual, setForceRevealManual] = useState(false);
  const [expanded, setExpanded] = useState(() => !defaultCollapsed);
  const [narrativeEditing, setNarrativeEditing] = useState(false);
  const [narrativeDraft, setNarrativeDraft] = useState('');
  const prevAiNarrativeRef = useRef(aiNarrativeText);
  const canEditNarrative = block.status !== 'agreed' && !narrativeBusy;
  const backgroundWorkAllowed = useBackgroundWorkGate();
  const showExpandedHeader = effectiveDeferHeavyBody ? true : expanded;
  const showHeavyBody = showExpandedHeader && (!effectiveDeferHeavyBody || bodyRevealed);
  const showVisitAi =
    visitChecklistMode &&
    (!effectiveDeferHeavyBody || bodyRevealed || visitDeferScoresOnly);
  const showFullBody = showHeavyBody && (!visitDeferScoresOnly || bodyRevealed);

  useEffect(() => {
    if (!effectiveDeferHeavyBody) return;
    setForceRevealManual(false);
    if (!heavyBodyManualOnly && isHeavyCardCached(block.id)) {
      startTransition(() => setBodyRevealed(true));
    } else {
      setBodyRevealed(false);
    }
    setBodyLoading(false);
    setBodyLoadStartedAt(null);
  }, [block.id, effectiveDeferHeavyBody, heavyBodyManualOnly]);

  useEffect(() => {
    if (!effectiveDeferHeavyBody || bodyRevealed) return;
    if (heavyBodyOpenPriority) {
      setInViewport(true);
      return;
    }
    const el = cardRootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInViewport(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInViewport(true);
      },
      { rootMargin: '180px 0px', threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [effectiveDeferHeavyBody, bodyRevealed, heavyBodyOpenPriority]);

  const shouldQueueHeavyBody =
    effectiveDeferHeavyBody &&
    !bodyRevealed &&
    (forceRevealManual ||
      (!heavyBodyManualOnly && (heavyBodyOpenPriority || (inViewport && backgroundWorkAllowed))));

  useEffect(() => {
    if (!shouldQueueHeavyBody) return;
    if (isHeavyCardCached(block.id)) {
      startTransition(() => setBodyRevealed(true));
      return;
    }

    let cancelled = false;
    setBodyLoading(true);
    setBodyLoadStartedAt(Date.now());

    const release = enqueueHeavyCardReveal({
      cardId: block.id,
      respectUserActivity: !forceRevealManual && !heavyBodyOpenPriority,
      onActivate: () => {
        if (cancelled) return;
        setBodyLoadStartedAt((prev) => prev ?? Date.now());
      },
      run: () => {
        if (cancelled) return;
        startTransition(() => {
          setBodyRevealed(true);
          setBodyLoading(false);
          setBodyLoadStartedAt(null);
        });
      },
      isCancelled: () => cancelled,
      onDone: () => {
        if (cancelled) return;
        setBodyLoading(false);
        setBodyLoadStartedAt(null);
      },
    });

    return () => {
      cancelled = true;
      release();
      setBodyLoading(false);
      setBodyLoadStartedAt(null);
    };
  }, [shouldQueueHeavyBody, block.id, forceRevealManual, heavyBodyOpenPriority]);

  useEffect(() => {
    if (!bodyLoading || !bodyLoadStartedAt) return;
    const id = window.setInterval(() => setBodyLoadTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [bodyLoading, bodyLoadStartedAt]);

  void bodyLoadTick;
  const bodyElapsedSec = bodyLoadStartedAt
    ? Math.max(0, Math.floor((Date.now() - bodyLoadStartedAt) / 1000))
    : 0;
  const bodyQueuePos = bodyLoading ? getHeavyCardQueuePosition(block.id) : -1;
  const bodyEtaSec =
    bodyLoading && bodyQueuePos >= 0 ? estimateHeavyCardEtaSec(bodyQueuePos) : bodyLoading ? estimateHeavyCardEtaSec(0) : null;

  const visitTeacherRowIdxs = useMemo(() => {
    if (!visitChecklistMode) return [];
    if (effectiveDeferHeavyBody && !bodyRevealed) return [];
    const rows = resolveTeacherCardRows({
      block,
      teacherFilterKey,
      poolRows: teacherCardCtx.dashboardRows,
      sliceRows: teacherCardCtx.sliceRows,
    });
    if (!rows.length) return [];
    return [...new Set(rows.map((r) => r.idx))];
  }, [
    visitChecklistMode,
    effectiveDeferHeavyBody,
    bodyRevealed,
    block,
    teacherFilterKey,
    teacherCardCtx.dashboardRows,
    teacherCardCtx.sliceRows,
  ]);

  const visitScoreCompactLine = useMemo(() => {
    if (!visitChecklistMode || teacherAudienceView || !visitTeacherRowIdxs.length) return null;
    const sections = buildVisitTeacherScoreHeatmap(
      rawRows,
      rolesForLessonMatrix,
      customLabels,
      teacherFilterKey,
      block.teacherLabel,
      visitTeacherRowIdxs,
    );
    return buildVisitScoreCompactLine(sections);
  }, [
    visitChecklistMode,
    teacherAudienceView,
    visitTeacherRowIdxs,
    rawRows,
    rolesForLessonMatrix,
    customLabels,
    teacherFilterKey,
    block.teacherLabel,
  ]);

  useEffect(() => {
    if (defaultCollapsed && visitChecklistMode) return;
    const had = String(prevAiNarrativeRef.current ?? '').trim();
    const now = String(aiNarrativeText ?? '').trim();
    prevAiNarrativeRef.current = aiNarrativeText;
    if (!had && now) setExpanded(true);
  }, [aiNarrativeText, defaultCollapsed, visitChecklistMode]);

  useEffect(() => {
    if (!narrativeEditing) setNarrativeDraft(aiNarrativeText);
  }, [aiNarrativeText, narrativeEditing]);

  useEffect(() => {
    if (block.status === 'agreed') setNarrativeEditing(false);
  }, [block.status]);

  const startNarrativeEdit = () => {
    setNarrativeDraft(aiNarrativeText);
    setNarrativeEditing(true);
    setExpanded(true);
  };

  const stopSummaryToggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
  };

  const visitCollapsedHint = leaderMode ? (
    <>
      {visitScoreCompactLine ? `${visitScoreCompactLine} · ` : ''}
      разверните карточку для выводов, рекомендаций и ИИ-аналитики
    </>
  ) : (
    <>
      {block.status === 'agreed' ? 'Согласовано' : 'Черновик'}
      {aiNarrativeText.trim() ? ' · есть ИИ-текст' : narrativeBusy || aiPending ? ' · ИИ формируется' : cardBackgroundStatus ? ` · ${cardBackgroundStatus.compactLine}` : ''}
      {' · нажмите «Развернуть» для баллов, выводов и рекомендаций'}
    </>
  );

  const cardHeaderLeft = (
    <div style={{ minWidth: 0, flex: 1 }}>
      {!leaderMode && onAiQueueSelectChange && block.status !== 'agreed' ? (
        <label
          className={`lesson-analytics-teacher-card__queue-pick ${LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.8rem',
            marginBottom: '0.35rem',
            cursor: 'pointer',
          }}
          onClick={stopSummaryToggle}
          onKeyDown={stopSummaryToggle}
        >
          <input
            type="checkbox"
            checked={aiQueueSelected}
            disabled={narrativeBusy || saveBusy}
            onChange={(e) => onAiQueueSelectChange(e.target.checked)}
          />
          <span>В очередь ИИ</span>
        </label>
      ) : null}
      {visitChecklistMode ? (
        <p className="admin-dash-kicker" style={{ margin: '0 0 0.2rem', fontSize: '0.72rem' }}>
          Чек-лист посещения урока
        </p>
      ) : null}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.45rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.45rem',
            minWidth: 0,
            flex: '1 1 280px',
          }}
        >
          <h3
            className={`admin-dash-title lesson-analytics-teacher-card__title ${PDF_CARD_KEEP_TOGETHER_CLASS}`}
            style={{ fontSize: '1.05rem', margin: 0 }}
          >
            {block.teacherLabel}
          </h3>
          {!visitChecklistMode && !leaderMode && cardArchiveStatusText && !aiNarrativeText.trim() ? (
            <span className="muted" style={{ fontSize: '0.75rem' }}>
              {cardArchiveStatusText}
            </span>
          ) : null}
          {visitChecklistMode && cardBackgroundStatus && !aiNarrativeText.trim() ? (
            <TeacherCardBackgroundStatusBanner status={cardBackgroundStatus} compact />
          ) : null}
          {visitChecklistMode && showVisitCardViewToggle && onVisitCardViewModeChange ? (
            <VisitChecklistRubricViewToggle
              compact
              mode={visitCardViewMode ?? 'methodist'}
              onChange={onVisitCardViewModeChange}
            />
          ) : null}
        </div>
        {!leaderMode ? (
          <div
            className={LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}
          >
            <button
              type="button"
              className="btn btn-sm"
              disabled={block.status !== 'agreed' || pdfBusy || pdfCompactBusy || pdfCaptureBusy}
              onClick={() => onDownloadPdf(block)}
            >
              {pdfBusy ? 'PDF…' : 'Скачать PDF'}
            </button>
            {onDownloadPdfOnePage ? (
              <button
                type="button"
                className="btn btn-sm"
                disabled={block.status !== 'agreed' || pdfBusy || pdfCompactBusy || pdfCaptureBusy}
                onClick={() => onDownloadPdfOnePage(block)}
                title="Параллель, предмет и уровень мастерства в один ряд; выводы, рекомендации и полный текст ИИ (1–2 стр.)"
              >
                {pdfCompactBusy ? 'PDF…' : 'PDF (компакт.)'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {visitScoreCompactLine ? (
        <p className="muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
          <strong style={{ color: 'var(--text, #0f172a)' }}>{visitScoreCompactLine}</strong>
        </p>
      ) : showExpandedHeader && (!effectiveDeferHeavyBody || bodyRevealed) ? (
        <LessonAnalyticsTeacherBlockCardMetrics
          block={block}
          visitChecklistMode={visitChecklistMode}
          teacherCardCtx={teacherCardCtx}
        />
      ) : null}
    </div>
  );

  const cardExpandedBody = (
    <LessonAnalyticsTeacherBlockCardExpanded
      block={block}
      visitChecklistMode={visitChecklistMode}
      leaderMode={leaderMode}
      teacherAudienceView={teacherAudienceView}
      teacherCardCtx={teacherCardCtx}
      teacherFilterKey={teacherFilterKey}
      headers={headers}
      rawRows={rawRows}
      rolesForLessonMatrix={rolesForLessonMatrix}
      customLabels={customLabels}
      poolRows={poolRows}
      narrativeBusy={narrativeBusy}
      saveBusy={saveBusy}
      introText={introText}
      tpl={tpl}
      sliceChartsSlot={sliceChartsSlot}
      onRowMembershipChange={onRowMembershipChange}
      periodComparison={periodComparison}
      progressiveBody={progressiveBody}
    />
  );

  const saveNarrativeEdit = () => {
    onAiNarrativeChange(block.id, narrativeDraft);
    setNarrativeEditing(false);
  };

  const cancelNarrativeEdit = () => {
    setNarrativeDraft(aiNarrativeText);
    setNarrativeEditing(false);
  };

  const aiIsLocalFallback = useMemo(
    () => isLessonTeacherLocalFallbackText(aiNarrativeText),
    [aiNarrativeText],
  );

  const visitAiSection =
    visitChecklistMode && tpl.showAiNarrative !== false ? (
      <VisitChecklistTeacherCardSection
        title="ИИ-вывод"
        variant="ai"
        subtitle={
          leaderMode
            ? 'Аналитическая записка по посещениям педагога, сформированная на основе данных чек-листа.'
            : 'Аналитическая записка по посещениям — формируется в фоне, карточку можно просматривать без ожидания.'
        }
      >
        <div
          className={`lesson-analytics-teacher-card__ai-narrative${
            leaderMode ? ' lesson-analytics-teacher-card__ai-narrative--leader' : ''
          }${narrativeBusy ? ' lesson-analytics-teacher-card__ai-narrative--busy' : ''}`}
        >
          {!leaderMode && narrativeEditing ? (
            <div className={LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}>
              <textarea
                className="input lesson-analytics-teacher-card__ai-narrative-editor"
                value={narrativeDraft}
                onChange={(e) => setNarrativeDraft(e.target.value)}
                rows={14}
                placeholder="Текст аналитической записки для педагога. Абзацы — через пустую строку."
                disabled={saveBusy}
              />
              <p className="muted" style={{ fontSize: '0.78rem', margin: '0.35rem 0 0' }}>
                Правки методиста сохраняются в проект автоматически (через несколько секунд) и не перезаписываются
                пакетной ИИ-очередью. Перед почтой и PDF нажмите «Согласовать с методистом».
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-sm primary"
                  disabled={saveBusy || !narrativeDraft.trim()}
                  onClick={saveNarrativeEdit}
                >
                  Сохранить текст
                </button>
                <button type="button" className="btn btn-sm" disabled={saveBusy} onClick={cancelNarrativeEdit}>
                  Отмена
                </button>
              </div>
            </div>
          ) : aiNarrativeText.trim() ? (
            <>
              {!leaderMode ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.35rem',
                  }}
                >
                  {(narrativeManualEdit || block.aiNarrativeManualEdit) ? (
                    <span style={{ fontWeight: 500, fontSize: '0.82rem', color: 'var(--accent, #2563eb)' }}>
                      Отредактировано методистом
                    </span>
                  ) : null}
                  {aiIsLocalFallback && !narrativeBusy ? (
                    <span className="err" style={{ fontWeight: 500, fontSize: '0.82rem' }}>
                      Автосводка (ИИ не ответил)
                    </span>
                  ) : null}
                  {canEditNarrative ? (
                    <button type="button" className="btn btn-sm" onClick={startNarrativeEdit}>
                      Редактировать текст
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="phenomenal-public-prose">
                {aiNarrativeText.split(/\n\n+/).map((p, i) => (
                  <p key={i} className={PDF_CARD_KEEP_TOGETHER_CLASS} style={{ margin: '0.35rem 0' }}>
                    {p.trim()}
                  </p>
                ))}
              </div>
            </>
          ) : aiGiveUp && !aiNarrativeText.trim() ? (
            <p className="err" style={{ fontSize: '0.85rem', margin: 0 }}>
              Сервер ИИ не ответил вовремя. Нажмите «Остановить фоновую ИИ» и запустите очередь снова или
              сузьте срез фильтрами.
            </p>
          ) : narrativeBusy ? (
            cardBackgroundStatus ? (
              <TeacherCardBackgroundStatusBanner status={cardBackgroundStatus} />
            ) : (
              <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                Формируется ИИ-аналитика…
              </p>
            )
          ) : aiPending ? (
            cardBackgroundStatus ? (
              <TeacherCardBackgroundStatusBanner status={cardBackgroundStatus} />
            ) : (
              <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                {cardArchiveStatusText || 'ИИ-аналитика в очереди…'}
              </p>
            )
          ) : !leaderMode && canEditNarrative ? (
            <div className={LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}>
              <button type="button" className="btn btn-sm" onClick={startNarrativeEdit}>
                Ввести текст аналитики вручную
              </button>
            </div>
          ) : (
            cardBackgroundStatus ? (
              <TeacherCardBackgroundStatusBanner status={cardBackgroundStatus} />
            ) : (
              <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                {cardArchiveStatusText || 'ИИ-аналитика формируется…'}
              </p>
            )
          )}
        </div>
      </VisitChecklistTeacherCardSection>
    ) : null;

  const aiNarrativeSection =
    !visitChecklistMode && !leaderMode && tpl.showAiNarrative !== false && (aiNarrativeText || narrativeEditing) ? (
      <div
        className={`lesson-analytics-teacher-card__ai-narrative${
          narrativeBusy ? ' lesson-analytics-teacher-card__ai-narrative--busy' : ''
        }`}
        style={{ marginTop: '0.65rem', fontSize: '0.9rem' }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.35rem',
          }}
        >
          <h4 className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
            {leaderMode ? 'ИИ-аналитика' : `ИИ-аналитика${narrativeBusy ? ' (обновляется…)' : ''}`}
            {(narrativeManualEdit || block.aiNarrativeManualEdit) &&
            aiNarrativeText &&
            !narrativeEditing ? (
              <span style={{ fontWeight: 500, marginLeft: '0.35rem', color: 'var(--accent, #2563eb)' }}>
                · отредактировано методистом
              </span>
            ) : null}
            {aiIsLocalFallback && !narrativeBusy && !narrativeEditing ? (
              <span className="err" style={{ fontWeight: 500, marginLeft: '0.35rem' }}>
                · автосводка (ИИ не ответил)
              </span>
            ) : null}
          </h4>
          {!leaderMode && canEditNarrative && !narrativeEditing ? (
            <button type="button" className="btn btn-sm" onClick={startNarrativeEdit}>
              {aiNarrativeText ? 'Редактировать текст' : 'Ввести текст вручную'}
            </button>
          ) : null}
        </div>
        {!leaderMode && narrativeEditing ? (
          <div className={LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}>
            <textarea
              className="input lesson-analytics-teacher-card__ai-narrative-editor"
              value={narrativeDraft}
              onChange={(e) => setNarrativeDraft(e.target.value)}
              rows={14}
              placeholder="Текст аналитической записки для педагога. Абзацы — через пустую строку."
              disabled={saveBusy}
            />
            <p className="muted" style={{ fontSize: '0.78rem', margin: '0.35rem 0 0' }}>
              Правки методиста сохраняются в проект автоматически (через несколько секунд) и не перезаписываются
              пакетной ИИ-очередью. Перед почтой и PDF нажмите «Согласовать с методистом».
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-sm primary"
                disabled={saveBusy || !narrativeDraft.trim()}
                onClick={saveNarrativeEdit}
              >
                Сохранить текст
              </button>
              <button type="button" className="btn btn-sm" disabled={saveBusy} onClick={cancelNarrativeEdit}>
                Отмена
              </button>
            </div>
          </div>
        ) : aiNarrativeText ? (
          <div className="phenomenal-public-prose">
            {aiNarrativeText.split(/\n\n+/).map((p, i) => (
              <p key={i} className={PDF_CARD_KEEP_TOGETHER_CLASS} style={{ margin: '0.35rem 0' }}>
                {p.trim()}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    ) : !visitChecklistMode && !leaderMode && tpl.showAiNarrative !== false && canEditNarrative && !aiPending && !narrativeBusy ? (
        <div className={LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS} style={{ marginTop: '0.65rem' }}>
          <button type="button" className="btn btn-sm" onClick={startNarrativeEdit}>
            Ввести текст аналитики вручную
          </button>
        </div>
      ) : !visitChecklistMode && !leaderMode && tpl.showAiNarrative !== false && aiPending ? (
        <p className="muted" style={{ marginTop: '0.65rem', fontSize: '0.85rem' }}>
          {cardArchiveStatusText || 'ИИ-аналитика в очереди…'}
        </p>
      ) : !visitChecklistMode && !leaderMode && tpl.showAiNarrative !== false && narrativeBusy ? (
      <p className="muted" style={{ marginTop: '0.65rem', fontSize: '0.85rem' }}>
        Формируется ИИ-аналитика…
      </p>
    ) : null;

  const eagerVisitBody = leaderMode || cardIndex < 2 || instantHeavyBody;

  return (
    <article
      ref={cardRootRef}
      id={block.id ? `lesson-analytics-teacher-${block.id}` : undefined}
      className={`card glass-surface ${LESSON_ANALYTICS_TEACHER_CARD_CLASS}${
        highlightRed ? ' lesson-analytics-teacher-card--red-highlight' : ''
      }`}
      style={{ marginBottom: '1rem', padding: '1rem 1.1rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        {cardHeaderLeft}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
          {effectiveDeferHeavyBody && !bodyRevealed ? (
            <button
              type="button"
              className="btn btn-sm primary"
              disabled={bodyLoading}
              onClick={(e) => {
                e.stopPropagation();
                onDeferHeavyBodyOpen?.();
                setForceRevealManual(true);
              }}
            >
              {bodyLoading
                ? 'Открываем…'
                : visitDeferScoresOnly
                  ? 'Показать баллы и таблицы'
                  : 'Показать полностью'}
            </button>
          ) : null}
          {!effectiveDeferHeavyBody ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
            >
              {expanded ? 'Свернуть' : 'Развернуть'}
            </button>
          ) : null}
        </div>
      </div>

      {effectiveDeferHeavyBody && bodyLoading ? (
        <CardOpenTimingBanner elapsedSec={bodyElapsedSec} etaSec={bodyEtaSec} />
      ) : null}
      {effectiveDeferHeavyBody && !bodyRevealed && !visitDeferScoresOnly ? (
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.5rem', marginBottom: 0 }}>
          {bodyLoading
            ? null
            : visitScoreCompactLine
              ? `${visitScoreCompactLine} · прокрутите к карточке или нажмите «Показать полностью»`
              : inViewport
                ? 'Подготовка краткой сводки…'
                : 'Прокрутите к карточке или нажмите «Показать полностью» для таблиц и ИИ'}
        </p>
      ) : effectiveDeferHeavyBody && !bodyRevealed && visitDeferScoresOnly && !bodyLoading ? (
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.5rem', marginBottom: 0 }}>
          Нажмите «Показать баллы и таблицы» для теплокарты, выводов и рекомендаций.
        </p>
      ) : !showExpandedHeader ? (
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.5rem', marginBottom: 0 }}>
          {visitChecklistMode
            ? visitCollapsedHint
            : `${block.status === 'agreed' ? 'Согласовано' : 'Черновик'}${aiNarrativeText ? ' · есть ИИ-текст' : ''} · нажмите «Развернуть»`}
        </p>
      ) : visitChecklistMode ? (
        visitDeferScoresOnly ? (
          <>
            {showVisitAi ? visitAiSection : null}
            {showHeavyBody ? (
              instantHeavyBody ? (
                cardExpandedBody
              ) : (
                <LazyMount
                  eager={eagerVisitBody}
                  stagger={!eagerVisitBody}
                  minHeight={120}
                  rootMargin="480px 0px"
                  placeholder={
                    <p className="muted visit-checklist-teacher-card-body-placeholder" style={{ marginBottom: 0 }}>
                      Загрузка баллов и таблиц…
                    </p>
                  }
                >
                  {cardExpandedBody}
                </LazyMount>
              )
            ) : null}
          </>
        ) : instantHeavyBody ? (
          <>
            {showFullBody ? visitAiSection : null}
            {showFullBody ? cardExpandedBody : null}
          </>
        ) : (
        <LazyMount
          eager={eagerVisitBody}
          stagger={!eagerVisitBody}
          minHeight={120}
          rootMargin="480px 0px"
          placeholder={
            <p className="muted visit-checklist-teacher-card-body-placeholder" style={{ marginBottom: 0 }}>
              Загрузка баллов, таблиц и ИИ-раздела…
            </p>
          }
        >
          {showFullBody ? cardExpandedBody : null}
          {showFullBody ? visitAiSection : null}
        </LazyMount>
        )
      ) : (
        cardExpandedBody
      )}

      {!visitChecklistMode ? aiNarrativeSection : null}

      {footerText ? (
        <p
          className={`muted lesson-analytics-card-template-footer ${PDF_CARD_KEEP_TOGETHER_CLASS}`}
          style={{ marginTop: '0.65rem', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}
        >
          {footerText}
        </p>
      ) : null}

      {!leaderMode && !visitChecklistMode ? (
        <div className={LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS} style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={narrativeBusy || saveBusy}
            onClick={() => onGenerateNarrative(block)}
            title={
              aiBatchRunning
                ? 'Остановит пакетную очередь и пересоздаст текст только для этой карточки'
                : undefined
            }
          >
            {narrativeBusy ? 'ИИ…' : aiNarrativeText ? 'Пересоздать ИИ-аналитику' : 'Создать ИИ-аналитику'}
          </button>
        </div>
      ) : null}

      {!leaderMode ? (
      <div
        className={LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}
        style={{
          marginTop: '1rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className="btn primary"
          disabled={block.status === 'agreed' || saveBusy}
          onClick={() => onAgree(block.id)}
        >
          Согласовать с методистом
        </button>
        {block.status === 'agreed' ? (
          <>
            <button
              type="button"
              className="btn btn-sm"
              disabled={saveBusy}
              onClick={() => onRevokeAgree(block.id)}
              title="Вернуть карточку в черновик — снова можно править и пересогласовать"
            >
              Отменить согласование
            </button>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Согласовано
              {block.agreedAt ? ` · ${new Date(block.agreedAt).toLocaleString('ru-RU')}` : ''}
              {block.emailedAt ? ` · письмо: ${new Date(block.emailedAt).toLocaleString('ru-RU')}` : ''}
              {block.pdfPrintedAt ? ` · PDF: ${new Date(block.pdfPrintedAt).toLocaleString('ru-RU')}` : ''}
            </span>
          </>
        ) : (
          <span className="muted" style={{ fontSize: '0.82rem' }}>
            До согласования можно править текст аналитики; почта и печать — после согласования.
          </span>
        )}
      </div>
      ) : null}

      {!leaderMode ? (
      <div
        className={LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}
        style={{ marginTop: '0.65rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
      >
        <button
          type="button"
          className="btn"
          disabled={block.status !== 'agreed' || emailBusy}
          onClick={() => onEmail(block)}
        >
          {emailBusy ? 'Отправка…' : 'Отправить на корп. почту'}
        </button>
      </div>
      ) : null}

      {!leaderMode ? (
        resolvedEmail ? (
          <p
            className={`muted ${LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}`}
            style={{ marginTop: '0.35rem', fontSize: '0.8rem' }}
          >
            В справочнике: {resolvedEmail}
          </p>
        ) : (
          <p
            className={`muted ${LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}`}
            style={{ marginTop: '0.35rem', fontSize: '0.8rem' }}
          >
            Почта в справочнике не найдена — добавьте ФИО на hub-странице модуля.
          </p>
        )
      ) : null}
    </article>
  );
}

function teacherBlockCardPropsEqual(
  prev: LessonAnalyticsTeacherBlockCardProps,
  next: LessonAnalyticsTeacherBlockCardProps,
): boolean {
  return (
    prev.block.id === next.block.id &&
    prev.visitChecklistMode === next.visitChecklistMode &&
    prev.leaderMode === next.leaderMode &&
    prev.teacherAudienceView === next.teacherAudienceView &&
    prev.showVisitCardViewToggle === next.showVisitCardViewToggle &&
    prev.visitCardViewMode === next.visitCardViewMode &&
    prev.highlightRed === next.highlightRed &&
    prev.block.aiNarrativeManualEdit === next.block.aiNarrativeManualEdit &&
    prev.narrativeManualEdit === next.narrativeManualEdit &&
    prev.defaultCollapsed === next.defaultCollapsed &&
    prev.deferHeavyBody === next.deferHeavyBody &&
    prev.heavyBodyOpenPriority === next.heavyBodyOpenPriority &&
    prev.instantHeavyBody === next.instantHeavyBody &&
    prev.progressiveBody === next.progressiveBody &&
    prev.visitDeferScoresOnly === next.visitDeferScoresOnly &&
    prev.heavyBodyManualOnly === next.heavyBodyManualOnly &&
    prev.aiQueueSelected === next.aiQueueSelected &&
    prev.block.status === next.block.status &&
    prev.block.teacherLabel === next.block.teacherLabel &&
    String(prev.block.aiNarrative ?? '') === String(next.block.aiNarrative ?? '') &&
    prev.aiNarrativeText === next.aiNarrativeText &&
    prev.narrativeBusy === next.narrativeBusy &&
    prev.block.agreedAt === next.block.agreedAt &&
    prev.block.emailedAt === next.block.emailedAt &&
    prev.aiPending === next.aiPending &&
    prev.aiGiveUp === next.aiGiveUp &&
    prev.cardArchiveStatusText === next.cardArchiveStatusText &&
    prev.cardBackgroundStatus?.title === next.cardBackgroundStatus?.title &&
    prev.cardBackgroundStatus?.etaLine === next.cardBackgroundStatus?.etaLine &&
    prev.cardBackgroundStatus?.hintLine === next.cardBackgroundStatus?.hintLine &&
    prev.aiBatchRunning === next.aiBatchRunning &&
    prev.emailBusy === next.emailBusy &&
    prev.pdfBusy === next.pdfBusy &&
    prev.pdfCompactBusy === next.pdfCompactBusy &&
    prev.pdfCaptureBusy === next.pdfCaptureBusy &&
    prev.saveBusy === next.saveBusy &&
    prev.resolvedEmail === next.resolvedEmail &&
    prev.teacherFilterKey === next.teacherFilterKey &&
    prev.cardTemplate === next.cardTemplate &&
    prev.teacherCardCtx === next.teacherCardCtx &&
    prev.poolRows === next.poolRows &&
    JSON.stringify(prev.block.rowMembership ?? null) === JSON.stringify(next.block.rowMembership ?? null)
  );
}

export default memo(LessonAnalyticsTeacherBlockCardInner, teacherBlockCardPropsEqual);
