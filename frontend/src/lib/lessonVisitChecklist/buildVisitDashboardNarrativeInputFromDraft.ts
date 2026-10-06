import { type LessonAnalyticsDraft } from '../../api/lessonAnalytics';
import { filterKeyForRole } from '../excelAnalytics/engine';
import type { ColumnRole } from '../excelAnalytics/types';
import { buildAnalyticRowsFromLessonDraft } from '../lessonAnalytics/buildAnalyticRowsFromLessonDraft';
import { getLessonDraftGridForAnalysis } from '../lessonAnalytics/lessonDraftGrid';
import {
  headersLookLikeVisitChecklistAnalytics,
  resolveLessonAnalyticsColumnRoles,
} from './resolveVisitChecklistGridRoles';
import {
  buildVisitDashboardKpis,
  buildVisitDashboardLlmContext,
  buildVisitDashboardScoreHeatmap,
  buildVisitSectionPhraseAggregate,
  isVisitChecklistAnalytics,
} from './buildVisitChecklistDashboard';

export type VisitDashboardNarrativeInput = {
  llmContext: string;
  uniqueVisits: number;
  filterSummary: string;
};

/** Собирает контекст для ИИ-аналитики среза из сохранённого черновика (без React). */
export function buildVisitDashboardNarrativeInputFromDraft(
  draft: LessonAnalyticsDraft,
  filterSummary = '',
): VisitDashboardNarrativeInput | null {
  const pipeline = buildAnalyticRowsFromLessonDraft(draft);
  if (!pipeline.ok) return null;

  const grid = getLessonDraftGridForAnalysis(draft);
  if (!grid) return null;

  const visitGridRoles = resolveLessonAnalyticsColumnRoles(grid.headers, grid.matrixRows, {
    preferVisitChecklist: true,
  });
  const roles: ColumnRole[] =
    visitGridRoles.roles.length > 0 ? visitGridRoles.roles : grid.rolesForRun;
  const customLabels =
    visitGridRoles && Object.keys(visitGridRoles.customLabels).length > 0
      ? visitGridRoles.customLabels
      : grid.customLabels;
  const ordinalLevels =
    visitGridRoles?.ordinalLevels.length ? visitGridRoles.ordinalLevels : grid.ordinalLevels;

  if (!isVisitChecklistAnalytics(roles) && !headersLookLikeVisitChecklistAnalytics(grid.headers)) {
    return null;
  }

  const teacherFilterKey = roles.includes('filter_teacher_code')
    ? filterKeyForRole('filter_teacher_code', customLabels)
    : null;
  if (!teacherFilterKey) return null;

  const analyticRows = pipeline.analyticRows;
  const metricNumericCols: number[] = [];
  roles.forEach((r, i) => {
    if (r === 'metric_numeric') metricNumericCols.push(i);
  });
  const dateLabel = (() => {
    const di = roles.indexOf('date');
    return di >= 0 ? grid.headers[di]?.trim() || 'Дата' : '';
  })();

  const sectionPhrases = buildVisitSectionPhraseAggregate(
    grid.matrixRows,
    roles,
    analyticRows,
    6,
  );
  const scoreHeatmap = buildVisitDashboardScoreHeatmap(grid.matrixRows, roles, analyticRows);
  const kpis = buildVisitDashboardKpis(
    analyticRows,
    teacherFilterKey,
    roles.includes('filter_custom_2') ? filterKeyForRole('filter_custom_2', customLabels) : null,
  );

  const llmContext = [
    buildVisitDashboardLlmContext({
      filteredRows: analyticRows,
      dashboardRows: analyticRows,
      teacherFilterKey,
      metricNumericCols,
      headers: grid.headers,
      roles,
      rawRows: grid.matrixRows,
      ordinalLevels,
      dateLabel,
      filterSummary,
      sectionPhrases,
      scoreHeatmap,
    }),
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!llmContext.trim()) return null;

  return {
    llmContext,
    uniqueVisits: kpis.uniqueVisits,
    filterSummary,
  };
}
