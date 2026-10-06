import { type LessonAnalyticsCardTemplate, type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import {
  collectLessonProseCommentBlocks,
  dedupeRowsByLessonIdx,
} from '../excelAnalytics/engine';
import type { CellPrimitive } from '../excelAnalytics/parse';
import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import {
  sliceChartsForVisitChecklistTeacher,
  type TeacherCardViewModel,
} from './buildLessonAnalyticsTeacherCardView';
import type { LessonAnalyticsTeacherPdfBlockInput } from './buildLessonAnalyticsTeacherPdfFromCardData';
import {
  buildLessonCompScaleSummaryQuotes,
  buildLessonCompetencyScaleAggregates,
  buildLessonTeacherRecommendationsQuotes,
} from './lessonCompetencyScale';
import {
  normalizeLessonCardTemplate,
  pdfBrandingFromCardTemplate,
  pdfVisualFromCardTemplate,
} from './cardTemplate';
import { resolveLessonPdfVisualVisitChecklist } from './lessonAnalyticsPdfVisual';
import { visitChecklistPdfBrandingOverride } from '../lessonVisitChecklist/visitChecklistPdfBranding';
import {
  buildVisitSectionPresence,
  buildVisitTeacherSectionScores,
} from '../lessonVisitChecklist/visitChecklistScoring';
import { resolveTeacherCardRows } from './teacherCardRowMembership';

export type BuildLessonTeacherPdfBlockInputParams = {
  cardTemplate?: LessonAnalyticsCardTemplate | null;
  projectTitle: string;
  block: LessonAnalyticsTeacherBlock;
  view: TeacherCardViewModel;
  teacherFilterKey: string;
  headers: string[];
  rawRows: CellPrimitive[][];
  rolesForLessonMatrix: ColumnRole[];
  customLabels: CustomFilterLabels;
  aiNarrative?: string;
  /** Карточка из чек-листа посещения урока — другие подписи в PDF. */
  visitChecklistMode?: boolean;
  /** Вид для педагога: в PDF только отмеченные пункты рубрики. По умолчанию — да. */
  teacherAudienceView?: boolean;
};

/** Те же поля PDF, что в админке (шаблон карточки, брендинг, pdfVisual). */
export function buildLessonTeacherPdfBlockInput(
  params: BuildLessonTeacherPdfBlockInputParams,
): LessonAnalyticsTeacherPdfBlockInput {
  const {
    cardTemplate,
    projectTitle,
    block,
    view,
    teacherFilterKey,
    headers,
    rawRows,
    rolesForLessonMatrix,
    customLabels,
    aiNarrative = '',
    visitChecklistMode = false,
    teacherAudienceView = true,
  } = params;

  const tpl = normalizeLessonCardTemplate(cardTemplate);
  const sliceCharts =
    tpl.showSliceCharts !== false
      ? visitChecklistMode
        ? sliceChartsForVisitChecklistTeacher(view.sliceCharts)
        : view.sliceCharts
      : [];
  const viewForPdf = {
    ...view,
    sliceCharts,
    quick: tpl.showQuickSummary !== false && !visitChecklistMode ? view.quick : '',
  };
  const onePerLesson = dedupeRowsByLessonIdx(view.teacherRows);
  const proseCommentBlocks =
    tpl.showProsePanel !== false ? collectLessonProseCommentBlocks(onePerLesson) : [];
  const compAgg =
    tpl.showCompetencyTable !== false
      ? buildLessonCompetencyScaleAggregates(
          rawRows,
          rolesForLessonMatrix,
          customLabels,
          teacherFilterKey,
          block.teacherLabel,
        )
      : null;
  const aiText = tpl.showAiNarrative !== false ? aiNarrative : '';

  const visitSectionPresence = visitChecklistMode
    ? (() => {
        const cardRows = resolveTeacherCardRows({
          block,
          teacherFilterKey,
          poolRows: view.teacherRows,
          sliceRows: view.teacherRows,
        });
        const scores = buildVisitTeacherSectionScores(
          rawRows,
          rolesForLessonMatrix,
          customLabels,
          teacherFilterKey,
          block.teacherLabel,
          cardRows.map((r) => r.idx),
        );
        return buildVisitSectionPresence(scores, { markedOnly: teacherAudienceView });
      })()
    : undefined;

  return {
    projectTitle,
    block,
    view: viewForPdf,
    compAgg,
    proseCommentBlocks,
    excelSummaryChunks:
      tpl.showProsePanel !== false
        ? buildLessonCompScaleSummaryQuotes(
            rawRows,
            rolesForLessonMatrix,
            customLabels,
            teacherFilterKey,
            block.teacherLabel,
            headers,
          )
        : [],
    excelRecommendationChunks:
      tpl.showProsePanel !== false
        ? buildLessonTeacherRecommendationsQuotes(
            rawRows,
            rolesForLessonMatrix,
            customLabels,
            teacherFilterKey,
            block.teacherLabel,
          )
        : [],
    aiNarrative: aiText,
    pdfBranding: visitChecklistMode
      ? visitChecklistPdfBrandingOverride(projectTitle, pdfBrandingFromCardTemplate(tpl, projectTitle))
      : pdfBrandingFromCardTemplate(tpl, projectTitle),
    pdfVisual: visitChecklistMode
      ? resolveLessonPdfVisualVisitChecklist(tpl, projectTitle)
      : pdfVisualFromCardTemplate(tpl, projectTitle),
    visitSectionPresence,
    visitChecklistMode,
  };
}
