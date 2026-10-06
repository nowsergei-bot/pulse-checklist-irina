import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import { repairLessonObservationColumnRoles, suggestColumnRoles } from '../excelAnalytics/autoMap';
import {
  buildLessonVisitColumnRoles,
  buildLessonVisitCustomLabels,
  LESSON_VISIT_ORDINAL_LEVELS,
  rolesIncludeVisitChecklistSections,
} from './visitChecklistAnalyticsMapping';

/** Достаточно совпадений с шаблоном чек-листа, чтобы не полагаться на эвристики Excel. */
const MIN_VISIT_SECTION_ROLES = 3;

export function countVisitChecklistSectionRoles(roles: ColumnRole[]): number {
  return roles.filter((r) => r.startsWith('lesson_visit_sec_')).length;
}

/** Заголовки похожи на экспорт «Для анализа ИИ» / синхронизацию чек-листа посещения урока. */
export function headersLookLikeVisitChecklistAnalytics(headers: string[]): boolean {
  if (!headers.length) return false;
  const roles = buildLessonVisitColumnRoles(headers);
  return countVisitChecklistSectionRoles(roles) >= MIN_VISIT_SECTION_ROLES;
}

export type VisitChecklistGridRoles = {
  roles: ColumnRole[];
  customLabels: CustomFilterLabels;
  ordinalLevels: string[];
};

/** Фиксированные роли чек-листа — без suggestColumnRoles. */
export function visitChecklistGridRolesFromHeaders(headers: string[]): VisitChecklistGridRoles | null {
  if (!headersLookLikeVisitChecklistAnalytics(headers)) return null;
  const roles = buildLessonVisitColumnRoles(headers);
  if (countVisitChecklistSectionRoles(roles) < MIN_VISIT_SECTION_ROLES) return null;
  return {
    roles,
    customLabels: buildLessonVisitCustomLabels(),
    ordinalLevels: [...LESSON_VISIT_ORDINAL_LEVELS],
  };
}

/**
 * Для аналитики уроков: приоритет шаблона чек-листа (онлайн-форма или плоский Excel),
 * иначе — стандартный autoMap наблюдений.
 */
export function resolveLessonAnalyticsColumnRoles(
  headers: string[],
  rows: import('../excelAnalytics/parse').CellPrimitive[][],
  opts?: { preferVisitChecklist?: boolean },
): VisitChecklistGridRoles & { fromVisitTemplate: boolean } {
  const prefer = opts?.preferVisitChecklist ?? false;
  const visit = visitChecklistGridRolesFromHeaders(headers);
  if (visit && (prefer || headersLookLikeVisitChecklistAnalytics(headers))) {
    return { ...visit, fromVisitTemplate: true };
  }
  const suggested = repairLessonObservationColumnRoles(headers, rows, suggestColumnRoles(headers, rows));
  if (!prefer && rolesIncludeVisitChecklistSections(suggested)) {
    const visitFromRepair = visitChecklistGridRolesFromHeaders(headers);
    if (visitFromRepair) {
      return { ...visitFromRepair, fromVisitTemplate: true };
    }
  }
  return {
    roles: suggested,
    customLabels: {},
    ordinalLevels: [],
    fromVisitTemplate: false,
  };
}
