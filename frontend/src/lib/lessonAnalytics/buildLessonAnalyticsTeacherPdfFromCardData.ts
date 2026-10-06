import { type LessonAnalyticsCardTemplate, type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import { countUniqueImportRows, type LessonProseCommentBlock } from '../excelAnalytics/engine';
import {
  buildLessonAnalyticsTeacherPdfBase64,
  buildLessonAnalyticsTeacherPdfBytes,
  humanizeQuickSummaryForPdf,
  type PdfSliceChart,
} from './buildLessonAnalyticsTeacherPdf';
import {
  VISIT_ORDINAL_CHART_TITLE,
  type TeacherCardViewModel,
} from './buildLessonAnalyticsTeacherCardView';
import { getMergedLessonAnalyticsProseRows } from './lessonAnalyticsProseMerge';
import {
  lessonCompScaleHeatmapRowsForPdf,
  lessonCompScaleRowsForPdf,
  type LessonCompetencyScaleAggregate,
  type RubricPhraseBreakdownRow,
} from './lessonCompetencyScale';
import { yieldToMain } from '../yieldToMain';
import { stripDuplicatePulseFromNarrative } from './lessonAnalyticsTeacherPdfDocument';
import { normalizeLessonTeacherNarrativeText } from './lessonTeacherNarrativeSanitize';
import { pickCompactSliceChartsForPdf } from './lessonPdfCompactSliceCharts';
import { resolveLessonPdfVisualOnePage, type ResolvedLessonPdfVisual } from './lessonAnalyticsPdfVisual';
import type { VisitSectionPresence } from '../lessonVisitChecklist/visitChecklistScoring';

export type LessonAnalyticsTeacherPdfBranding = {
  defaultTitle?: string;
  entityCaption?: string;
  ordinalBarsTitle?: string;
  footerLine?: string;
  reportTagline?: string;
  leadLine?: string;
};

function proseBodyFromNumberedRows(rows: string[]): string {
  if (rows.length === 0) return '';
  return rows.map((row, i) => `${i + 1}. ${row}`).join('\n\n');
}

function sliceChartsForPdf(view: TeacherCardViewModel, visitChecklistMode = false): PdfSliceChart[] {
  const out: PdfSliceChart[] = view.sliceCharts.map((c) => ({
    title: c.label,
    items: c.bars.map((b) => ({ label: b.fullName, value: b.uniqueLessons })),
  }));
  if (visitChecklistMode && view.ordDist.length > 0) {
    out.push({
      title: VISIT_ORDINAL_CHART_TITLE,
      items: view.ordDist.map((d) => ({ label: d.level, value: d.count })),
    });
  }
  return out;
}

type CardPdfInput = {
  projectTitle: string;
  teacherLabel: string;
  view: TeacherCardViewModel;
  compAgg: LessonCompetencyScaleAggregate | null;
  proseCommentBlocks: LessonProseCommentBlock[];
  excelSummaryChunks: string[];
  excelRecommendationChunks: string[];
  aiNarrative: string;
  pdfBranding?: LessonAnalyticsTeacherPdfBranding;
  pdfVisual?: ResolvedLessonPdfVisual;
  visitSectionPresence?: VisitSectionPresence[];
  visitChecklistMode?: boolean;
};

function buildOnePageProseSections(
  extraProse: { title: string; body: string }[],
  allSummaryRows: string[],
  allRecRows: string[],
): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];
  const summarySec = extraProse.find((s) => s.title.startsWith('Общие выводы'));
  const recSec = extraProse.find((s) => s.title.includes('Рекомендац'));

  const summaryBody = summarySec?.body.trim() || proseBodyFromNumberedRows(allSummaryRows);
  if (summaryBody) {
    out.push({
      title: summarySec?.title ?? 'Общие выводы по уроку (цитаты из файла)',
      body: summaryBody,
    });
  }

  const recBody = recSec?.body.trim() || proseBodyFromNumberedRows(allRecRows);
  if (recBody) {
    out.push({
      title: recSec?.title ?? 'Рекомендации учителю',
      body: recBody,
    });
  }

  return out;
}

function lessonCardPdfPayload(input: CardPdfInput, mode: 'full' | 'one-page' = 'full') {
  const { allSummaryRows, allRecRows } = getMergedLessonAnalyticsProseRows(
    input.proseCommentBlocks,
    input.excelSummaryChunks,
    input.excelRecommendationChunks,
  );

  const visitChecklistPdf = Boolean(input.visitChecklistMode && input.visitSectionPresence?.length);
  const hasNumericLevels = Boolean(input.compAgg?.rows.some((r) => r.used.size > 0));
  const phraseBreakdown: RubricPhraseBreakdownRow[] | null =
    visitChecklistPdf || !input.compAgg?.rubricPhraseBreakdown?.length
      ? null
      : input.compAgg.rubricPhraseBreakdown;

  const extraProse: { title: string; body: string }[] = [];
  const summaryBody = proseBodyFromNumberedRows(allSummaryRows);
  if (summaryBody) {
    extraProse.push({ title: 'Общие выводы по уроку (цитаты из файла)', body: summaryBody });
  }
  const recBody = proseBodyFromNumberedRows(allRecRows);
  if (recBody) {
    extraProse.push({ title: 'Рекомендации учителю', body: recBody });
  }
  const quick = humanizeQuickSummaryForPdf(input.view.quick).trim();
  if (quick && mode === 'full' && !visitChecklistPdf) {
    extraProse.push({ title: 'Сводка по баллам', body: quick });
  }

  const proseForPdf =
    mode === 'one-page'
      ? buildOnePageProseSections(extraProse, allSummaryRows, allRecRows)
      : extraProse;

  return {
    projectTitle: input.projectTitle,
    teacherLabel: input.teacherLabel,
    metricBars: [] as { label: string; mean: number }[],
    ordinalBars:
      input.compAgg?.kind === 'visit_checklist' && input.view.ordDist.length > 0
        ? input.view.ordDist.map((d) => ({ level: d.level, count: d.count }))
        : ([] as { level: string; count: number }[]),
    sliceCharts:
      mode === 'one-page'
        ? pickCompactSliceChartsForPdf(input.view)
        : sliceChartsForPdf(input.view, visitChecklistPdf),
    summaryForPedagogue: '',
    narrativePlain: stripDuplicatePulseFromNarrative(
      normalizeLessonTeacherNarrativeText(
        String(input.aiNarrative ?? '')
          .replace(/<[^>]+>/g, '')
          .trim(),
        input.teacherLabel,
      ),
    ),
    lessonCompHeatmapRows:
      mode === 'one-page'
        ? undefined
        : hasNumericLevels && input.compAgg
          ? lessonCompScaleHeatmapRowsForPdf(input.compAgg) ?? []
          : undefined,
    lessonCompScaleRows:
      mode === 'one-page'
        ? null
        : !hasNumericLevels && !phraseBreakdown && input.compAgg
          ? lessonCompScaleRowsForPdf(input.compAgg)
          : null,
    lessonCompPhraseBreakdown: mode === 'one-page' ? null : phraseBreakdown,
    visitSectionPresence: visitChecklistPdf ? input.visitSectionPresence : undefined,
    competencySectionTitle:
      input.compAgg?.kind === 'visit_checklist' ? 'Чек-лист посещения урока' : 'Компетенции',
    lessonCount: countUniqueImportRows(input.view.teacherRows),
    extraProseSections: proseForPdf,
    layoutMode: mode === 'one-page' ? ('lesson-card-one-page' as const) : ('lesson-card' as const),
    pdfBranding: {
      ...input.pdfBranding,
      ordinalBarsTitle:
        input.compAgg?.kind === 'visit_checklist'
          ? VISIT_ORDINAL_CHART_TITLE
          : input.pdfBranding?.ordinalBarsTitle,
    },
    pdfVisual: input.pdfVisual,
    compactOnePage: mode === 'one-page',
  };
}

/**
 * PDF из тех же данных, что карточка на экране (не снимок DOM): текст, таблицы, диаграммы, переносы страниц.
 */
export async function buildLessonAnalyticsTeacherPdfFromCardDataBytes(
  input: CardPdfInput,
): Promise<ArrayBuffer> {
  await yieldToMain();
  return buildLessonAnalyticsTeacherPdfBytes(lessonCardPdfPayload(input));
}

export async function buildLessonAnalyticsTeacherPdfFromCardData(
  input: CardPdfInput,
): Promise<string> {
  await yieldToMain();
  return buildLessonAnalyticsTeacherPdfBase64(lessonCardPdfPayload(input));
}

/** Удобная обёртка: блок педагога + уже собранный view и агрегаты. */
export type LessonAnalyticsTeacherPdfBlockInput = {
  projectTitle: string;
  block: LessonAnalyticsTeacherBlock;
  view: TeacherCardViewModel;
  compAgg: LessonCompetencyScaleAggregate | null;
  proseCommentBlocks: LessonProseCommentBlock[];
  excelSummaryChunks: string[];
  excelRecommendationChunks: string[];
  aiNarrative?: string;
  pdfBranding?: LessonAnalyticsTeacherPdfBranding;
  pdfVisual?: ResolvedLessonPdfVisual;
  visitSectionPresence?: VisitSectionPresence[];
  visitChecklistMode?: boolean;
};

export async function buildLessonAnalyticsTeacherPdfForBlock(
  input: LessonAnalyticsTeacherPdfBlockInput,
): Promise<string> {
  return buildLessonAnalyticsTeacherPdfFromCardData({
    projectTitle: input.projectTitle,
    teacherLabel: input.block.teacherLabel,
    view: input.view,
    compAgg: input.compAgg,
    proseCommentBlocks: input.proseCommentBlocks,
    excelSummaryChunks: input.excelSummaryChunks,
    excelRecommendationChunks: input.excelRecommendationChunks,
    aiNarrative: input.aiNarrative ?? input.block.aiNarrative ?? '',
    pdfBranding: input.pdfBranding,
    pdfVisual: input.pdfVisual,
    visitSectionPresence: input.visitSectionPresence,
    visitChecklistMode: input.visitChecklistMode,
  });
}

export async function buildLessonAnalyticsTeacherPdfForBlockBytes(
  input: LessonAnalyticsTeacherPdfBlockInput,
): Promise<ArrayBuffer> {
  return buildLessonAnalyticsTeacherPdfFromCardDataBytes({
    projectTitle: input.projectTitle,
    teacherLabel: input.block.teacherLabel,
    view: input.view,
    compAgg: input.compAgg,
    proseCommentBlocks: input.proseCommentBlocks,
    excelSummaryChunks: input.excelSummaryChunks,
    excelRecommendationChunks: input.excelRecommendationChunks,
    aiNarrative: input.aiNarrative ?? input.block.aiNarrative ?? '',
    pdfBranding: input.pdfBranding,
    pdfVisual: input.pdfVisual,
    visitSectionPresence: input.visitSectionPresence,
    visitChecklistMode: input.visitChecklistMode,
  });
}

export async function buildLessonAnalyticsTeacherPdfForBlockOnePageBytes(
  input: LessonAnalyticsTeacherPdfBlockInput,
  cardTemplate?: LessonAnalyticsCardTemplate | null,
): Promise<ArrayBuffer> {
  const pdfVisual = cardTemplate
    ? resolveLessonPdfVisualOnePage(cardTemplate, input.projectTitle)
    : input.pdfVisual;
  await yieldToMain();
  return buildLessonAnalyticsTeacherPdfBytes(
    lessonCardPdfPayload(
      {
        projectTitle: input.projectTitle,
        teacherLabel: input.block.teacherLabel,
        view: input.view,
        compAgg: input.compAgg,
        proseCommentBlocks: input.proseCommentBlocks,
        excelSummaryChunks: input.excelSummaryChunks,
        excelRecommendationChunks: input.excelRecommendationChunks,
        aiNarrative: input.aiNarrative ?? input.block.aiNarrative ?? '',
        pdfBranding: input.pdfBranding,
        pdfVisual,
        visitSectionPresence: input.visitSectionPresence,
        visitChecklistMode: input.visitChecklistMode,
      },
      'one-page',
    ),
  );
}
