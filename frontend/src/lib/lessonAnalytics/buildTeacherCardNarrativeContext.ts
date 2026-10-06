import { type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import {
  buildRichLlmContextRu,
  countUniqueImportRows,
  countUniqueLessonSemantics,
  type AnalyticRow,
} from '../excelAnalytics/engine';
import type { CellPrimitive } from '../excelAnalytics/parse';
import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import { rolesIncludeVisitChecklistSections } from '../lessonVisitChecklist/visitChecklistAnalyticsMapping';
import {
  VISIT_CHECKLIST_TEACHER_SLICE_KEYS,
} from './buildLessonAnalyticsTeacherCardView';
import { PULSE_ORDINAL_LEVEL_KEY } from '../excelAnalytics/engine';
import {
  buildVisitScoringLlmContextRu,
  buildVisitTeacherSectionScores,
  buildVisitChecklistLabelHintsForLlm,
  visitChecklistRubricComments,
} from '../lessonVisitChecklist/visitChecklistScoring';
import {
  buildLessonCompetencyLlmContextRu,
  buildLessonCompetencyScaleAggregates,
} from './lessonCompetencyScale';
import { buildMinimalTeacherFactsExcerpt } from './lessonTeacherNarrativeContext';
import { resolveTeacherCardRows } from './teacherCardRowMembership';
import { buildLessonPeriodComparisonContextRu } from './buildLessonPeriodComparisonContextRu';
import type { TeacherPeriodComparison } from './computeLessonPeriodComparison';
import { type LessonAnalyticsAnalysisPeriod } from '../../api/lessonAnalytics';

export type TeacherNarrativeContextPayload = {
  numericSummary: string;
  compFactsForFallback: string;
  filterSummary: string;
  analysisMode: 'teacher_critical' | 'visit_checklist' | 'visit_checklist_teacher';
  userFocus: string;
  fastMode: boolean;
  meta: {
    filteredRowCount: number;
    uniqueImportRows: number;
    semanticLessonCount: number;
  };
};

export type BuildTeacherCardNarrativeContextOpts = {
  block: LessonAnalyticsTeacherBlock;
  teacherFilterKey: string;
  sliceRows?: AnalyticRow[];
  dashboardRows: AnalyticRow[];
  filterKeys: string[];
  filterLabels: Record<string, string>;
  metricNumericCols: number[];
  headers: string[];
  rawRows: CellPrimitive[][];
  roles: ColumnRole[];
  customLabels: CustomFilterLabels;
  ordinalLevels: string[];
  dateLabel: string;
  aiUserFocus: string;
  /** Быстрее и ровнее: меньше фактов в промпте, короче ответ модели. */
  fastMode: boolean;
  /** Календарный период / baseline для сравнения (см. design doc). */
  analysisPeriod?: LessonAnalyticsAnalysisPeriod | null;
  /** Агрегаты Δ для промпта ИИ (если baseline загружен). */
  periodComparison?: TeacherPeriodComparison | null;
};

const CONTEXT_MAX_CHARS_FAST = 9_500;
const CONTEXT_MAX_CHARS_STANDARD = 13_000;

function sliceKeysWithoutTeacher(filterKeys: string[], teacherFilterKey: string): string[] {
  return filterKeys.filter((k) => k !== teacherFilterKey);
}

/**
 * Контекст для /api/excel-narrative-summary по одной карточке педагога.
 * Уже отфильтрованные строки + компетенции; без списка «все педагоги».
 */
export function buildTeacherCardNarrativeContext(
  opts: BuildTeacherCardNarrativeContextOpts,
): TeacherNarrativeContextPayload | null {
  const { block, teacherFilterKey, sliceRows, dashboardRows } = opts;
  const teacherRows = resolveTeacherCardRows({
    block,
    teacherFilterKey,
    poolRows: dashboardRows,
    sliceRows,
  });
  if (!teacherRows.length) return null;

  const filterLabel = block.teacherLabel.trim();
  const imp = countUniqueImportRows(teacherRows);
  const sem = countUniqueLessonSemantics(teacherRows, teacherFilterKey);

  const visitMode = rolesIncludeVisitChecklistSections(opts.roles);
  const rowIdxs = [...new Set(teacherRows.map((r) => r.idx))];

  const periodBlock = buildLessonPeriodComparisonContextRu(opts.analysisPeriod, opts.periodComparison);

  const compAgg = buildLessonCompetencyScaleAggregates(
    opts.rawRows,
    opts.roles,
    opts.customLabels,
    teacherFilterKey,
    filterLabel,
  );

  const visitScores = visitMode
    ? buildVisitTeacherSectionScores(
        opts.rawRows,
        opts.roles,
        opts.customLabels,
        teacherFilterKey,
        filterLabel,
        rowIdxs,
      )
    : null;

  const rubricComments = visitMode && !opts.fastMode ? visitChecklistRubricComments() : [];
  const visitCommentsBlock =
    rubricComments.length > 0
      ? [
          'Методические комментарии к показателям (из Excel):',
          ...rubricComments.map((c) => `  • «${c.indicator}»: ${c.comment}`),
        ].join('\n')
      : '';

  const visitScoreText =
    visitScores && visitScores.length
      ? buildVisitScoringLlmContextRu(visitScores, { audience: 'teacher', visitCount: imp })
      : '';

  const compText = visitMode ? visitScoreText : buildLessonCompetencyLlmContextRu(compAgg);

  const numericMetrics = opts.metricNumericCols.map((ci) => ({
    colIndex: ci,
    label: opts.headers[ci] || `Колонка ${ci + 1}`,
  }));

  const facetKeysAll = sliceKeysWithoutTeacher(opts.filterKeys, teacherFilterKey);
  const facetKeys = visitMode
    ? facetKeysAll.filter(
        (k) => VISIT_CHECKLIST_TEACHER_SLICE_KEYS.has(k) || k === PULSE_ORDINAL_LEVEL_KEY,
      )
    : opts.fastMode
      ? facetKeysAll.slice(0, 4)
      : facetKeysAll;

  const rich = buildRichLlmContextRu(teacherRows, teacherRows, {
    dateLabel: opts.dateLabel,
    numericMetrics: opts.fastMode ? numericMetrics.slice(0, 12) : numericMetrics,
    hasOrdinal: opts.roles.includes('metric_ordinal_text'),
    ordinalLevels: opts.ordinalLevels,
    teacherFilterKey: null,
    filterKeys: facetKeys,
    filterLabels: opts.filterLabels,
  });

  const labelHints = visitMode ? buildVisitChecklistLabelHintsForLlm() : '';

  const headerLines = [
    `=== Педагог: ${filterLabel} ===`,
    `Уроков в карточке (уникальных строк наблюдений): ${imp}.`,
    sem !== imp ? `Служебно: аналитических строк после развёртки рубрики — ${sem}; в формулировках об объёме используй ${imp}.` : '',
    'Не перечисляй других педагогов — только этот срез.',
  ].filter(Boolean);

  let numericSummary = [headerLines.join('\n'), periodBlock, labelHints, visitCommentsBlock, compText, rich]
    .filter(Boolean)
    .join('\n\n\n');

  if (!numericSummary.trim()) {
    numericSummary = buildMinimalTeacherFactsExcerpt(
      filterLabel,
      teacherFilterKey,
      opts.headers,
      opts.rawRows,
      opts.roles,
      opts.customLabels,
    );
  }

  const cap = opts.fastMode ? CONTEXT_MAX_CHARS_FAST : CONTEXT_MAX_CHARS_STANDARD;
  if (numericSummary.length > cap) {
    numericSummary =
      numericSummary.slice(0, cap) +
      '\n\n[… часть второстепенных фактов опущена для стабильного и быстрого ответа ИИ …]';
  }

  const baseFocus = visitMode
    ? 'По чек-листу посещения урока: выдели слабые темы (<55% от максимума), объясни педагогу как выстроить урок. Учитывай методические пометки. Не перечисляй коды пунктов (4.3, 7.8 и т.п.) — называй показатели короткими метками из 2–3 слов. Пиши связными абзацами, без списков кодов. Не называй сырые баллы и проценты в итоговом тексте.'
    : 'Жёстко и по делу: слабые компетенции, редкие пункты рубрики, низкие баллы, пробелы. Без общих похвал без опоры на цифры.';
  const tplFocus = String(opts.aiUserFocus ?? '').trim();
  const fastNote = opts.fastMode
    ? 'Краткий режим: 4–6 абзацев, без воды; структура разделов из инструкции обязательна.'
    : '';

  return {
    numericSummary,
    compFactsForFallback: compText,
    filterSummary: `Один педагог: «${filterLabel}». Не смешивать с другими ФИО из файла.`,
    analysisMode: visitMode ? 'visit_checklist_teacher' : 'teacher_critical',
    userFocus: [baseFocus, fastNote, tplFocus ? `Дополнительно от методиста: ${tplFocus}` : '']
      .filter(Boolean)
      .join('\n\n'),
    fastMode: opts.fastMode,
    meta: {
      filteredRowCount: teacherRows.length,
      uniqueImportRows: imp,
      semanticLessonCount: sem,
    },
  };
}
