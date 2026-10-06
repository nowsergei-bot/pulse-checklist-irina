import { type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import { formatBilingualCellLabel } from '../excelAnalytics/excelDisplayLabel';
import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import { VISIT_CHECKLIST_CHART_COPY } from '../lessonVisitChecklist/visitChecklistCloudUi';
import { resolveTeacherCardRows } from './teacherCardRowMembership';
import {
  buildQuickSummaryRu,
  chartSafeFinite,
  collectMethodicalBarSections,
  countUniqueImportRows,
  countUniqueLessonSemantics,
  dedupeRowsByLessonIdx,
  meanMinMax,
  ordinalDistribution,
  PULSE_ORDINAL_LEVEL_KEY,
  PULSE_PARALLEL_AUTO_KEY,
  topFilterBucketsByUniqueLesson,
  topMetricNumericBucketsByUniqueLesson,
  type AnalyticRow,
  type MethodicalBarSection,
} from '../excelAnalytics/engine';

/** Как в autoMap: число учеников часто заведено как metric_numeric, без filterValues. */
const STUDENT_COUNT_HEADER_RE =
  /количеств\w*\s*(?:учеников|обучающихся)(?:\s*на\s*урок\w*)?|number\s*of\s*students\s*in\s*the\s*lesson|числ\w*\s*ученик/i;

function headerLooksLikeStudentCountColumn(header: string): boolean {
  const s = String(header ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return STUDENT_COUNT_HEADER_RE.test(s);
}

function lessonAnalyticsSliceChartRank(key: string): number {
  if (key.startsWith('__lesson_students_metric_')) return 20;
  const ranks: Record<string, number> = {
    filter_class: 10,
    [PULSE_PARALLEL_AUTO_KEY]: 15,
    filter_subject: 30,
    [PULSE_ORDINAL_LEVEL_KEY]: 40,
    filter_format: 50,
  };
  return ranks[key] ?? 100;
}

function sortLessonAnalyticsSliceCharts(charts: TeacherSliceChart[]): TeacherSliceChart[] {
  return [...charts].sort((a, b) => {
    const dr = lessonAnalyticsSliceChartRank(a.key) - lessonAnalyticsSliceChartRank(b.key);
    if (dr !== 0) return dr;
    return a.label.localeCompare(b.label, 'ru');
  });
}

export type TeacherSliceChart = {
  key: string;
  label: string;
  bars: { short: string; fullName: string; uniqueLessons: number }[];
};

export const VISIT_ORDINAL_CHART_TITLE = VISIT_CHECKLIST_CHART_COPY.ordinalLevel.title;

/** Диаграммы на карточке педагога по чек-листу: только параллель и предмет (уровень урока — отдельно). */
export const VISIT_CHECKLIST_TEACHER_SLICE_KEYS = new Set([
  PULSE_PARALLEL_AUTO_KEY,
  'filter_subject',
]);

export function sliceChartsForVisitChecklistTeacher(charts: TeacherSliceChart[]): TeacherSliceChart[] {
  return charts
    .filter((c) => VISIT_CHECKLIST_TEACHER_SLICE_KEYS.has(c.key))
    .map((c) =>
      c.key === PULSE_PARALLEL_AUTO_KEY
        ? { ...c, label: c.label?.trim() || 'Параллель (из класса)' }
        : c,
    );
}

export type TeacherCardViewModel = {
  teacherRows: AnalyticRow[];
  /** Краткая сводка без длинного блока методических текстов (для экрана). */
  quick: string;
  /** Полная сводка с методическими текстами — для PDF и писем. */
  quickFullForExport: string;
  methodicalBarSections: MethodicalBarSection[];
  chartData: { key: string; label: string; mean: number; n: number }[];
  ordDist: { rank: number; level: string; count: number }[];
  sliceCharts: TeacherSliceChart[];
};

export type TeacherCardCtx = {
  teacherFilterKey: string | null;
  dashboardRows: AnalyticRow[];
  /** Текущий срез страницы; при наличии — строки карточки берутся из него. */
  sliceRows?: AnalyticRow[];
  structuralFilterKeys: string[];
  filterLabels: Record<string, string>;
  metricNumericCols: number[];
  headers: string[];
  roles: ColumnRole[];
  ordinalLevels: string[];
  dateLabel: string;
};

export function buildLessonAnalyticsTeacherCardView(
  block: LessonAnalyticsTeacherBlock,
  ctx: TeacherCardCtx,
): TeacherCardViewModel {
  const {
    teacherFilterKey,
    dashboardRows,
    sliceRows,
    structuralFilterKeys,
    filterLabels,
    metricNumericCols,
    headers,
    roles,
    ordinalLevels,
    dateLabel,
  } = ctx;
  if (!teacherFilterKey) {
    return {
      teacherRows: [],
      quick: '',
      quickFullForExport: '',
      methodicalBarSections: [],
      chartData: [],
      ordDist: [],
      sliceCharts: [],
    };
  }
  const teacherRows = resolveTeacherCardRows({
    block,
    teacherFilterKey,
    poolRows: dashboardRows,
    sliceRows,
  });
  const onePer = dedupeRowsByLessonIdx(teacherRows);
  const numericMetricsAll = metricNumericCols.map((i) => ({
    colIndex: i,
    label: headers[i] || `Колонка ${i + 1}`,
  }));
  /** На экране не дублируем «число учеников» — для него уже есть мини-диаграмма среза по урокам. */
  const numericMetricsForCardUi = numericMetricsAll.filter(
    (m) => !headerLooksLikeStudentCountColumn(headers[m.colIndex] || ''),
  );
  const quickOptsShared = {
    hasTeacherFilter: true as const,
    mentorFilterKey: teacherFilterKey,
    dateLabel,
    hasOrdinal: roles.includes('metric_ordinal_text'),
  };
  const quick = buildQuickSummaryRu(dashboardRows, teacherRows, {
    ...quickOptsShared,
    numericMetrics: numericMetricsForCardUi,
    omitMethodicalSections: true,
    omitTechnicalMeta: true,
  });
  const quickFullForExport = buildQuickSummaryRu(dashboardRows, teacherRows, {
    ...quickOptsShared,
    numericMetrics: numericMetricsAll,
    omitMethodicalSections: false,
  });
  const methodicalBarSections = collectMethodicalBarSections(onePer);
  const chartData = metricNumericCols
    .map((ci) => {
      const mm = meanMinMax(onePer, ci);
      return {
        key: String(ci),
        label: (headers[ci] || `Пункт ${ci + 1}`).slice(0, 42),
        mean: chartSafeFinite(mm?.mean, 0),
        n: chartSafeFinite(mm?.n, 0),
      };
    })
    .filter((d) => d.n > 0 && Number.isFinite(d.mean));
  const ordDist =
    roles.includes('metric_ordinal_text') && ordinalLevels.length
      ? ordinalDistribution(onePer, ordinalLevels).map((d) => ({
          ...d,
          count: Math.max(0, Math.round(chartSafeFinite(d.count, 0))),
        }))
      : [];
  const fromStructural: TeacherSliceChart[] = structuralFilterKeys
    .filter((k) => k !== teacherFilterKey)
    .map((key) => {
      const label = filterLabels[key] ?? key;
      const rawBars = topFilterBucketsByUniqueLesson(teacherRows, key, 10, teacherFilterKey);
      const bars = rawBars.map((b) => {
        const full = formatBilingualCellLabel(b.display, 'ru');
        return {
          short: full.length > 28 ? `${full.slice(0, 25)}…` : full,
          fullName: full,
          uniqueLessons: Math.max(0, Math.round(chartSafeFinite(b.uniqueLessons, 0))),
        };
      });
      return { key, label, bars };
    })
    .filter((c) => c.bars.length > 0);

  const studentMetricCols: number[] = [];
  roles.forEach((r, i) => {
    if (r !== 'metric_numeric') return;
    if (headerLooksLikeStudentCountColumn(headers[i] || '')) studentMetricCols.push(i);
  });
  const fromStudentCount: TeacherSliceChart[] = studentMetricCols.map((ci) => {
    const rawBars = topMetricNumericBucketsByUniqueLesson(teacherRows, ci, 10, teacherFilterKey);
    const bars = rawBars.map((b) => {
      const full = formatBilingualCellLabel(b.display, 'ru');
      return {
        short: full.length > 28 ? `${full.slice(0, 25)}…` : full,
        fullName: full,
        uniqueLessons: Math.max(0, Math.round(chartSafeFinite(b.uniqueLessons, 0))),
      };
    });
    return {
      key: `__lesson_students_metric_${ci}`,
      label: headers[ci]?.trim() || `Колонка ${ci + 1}`,
      bars,
    };
  }).filter((c) => c.bars.length > 0);

  const sliceCharts = sortLessonAnalyticsSliceCharts([...fromStructural, ...fromStudentCount]);
  return { teacherRows, quick, quickFullForExport, methodicalBarSections, chartData, ordDist, sliceCharts };
}

export { countUniqueImportRows, countUniqueLessonSemantics };

export type { CustomFilterLabels };
