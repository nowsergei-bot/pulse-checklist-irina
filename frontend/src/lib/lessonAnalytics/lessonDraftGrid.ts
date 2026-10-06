import { type LessonAnalyticsDraft } from '../../api/lessonAnalytics';
import { applyServiceTimestampIgnore } from '../excelAnalytics/serviceTimestamp';
import type { CellPrimitive } from '../excelAnalytics/parse';
import { validateRoles, type ColumnRole, type CustomFilterLabels } from '../excelAnalytics/types';
import { resolveSessionAndRowsFromImportedGrid } from './resolveImportedGridSession';

/** Восстанавливает сырые строки и роли после отсечения служебной колонки времени — как в аналитическом конвейере. */
export function getLessonDraftGridForAnalysis(draft: LessonAnalyticsDraft): {
  headers: string[];
  matrixRows: CellPrimitive[][];
  rolesForRun: ColumnRole[];
  customLabels: CustomFilterLabels;
  ordinalLevels: string[];
} | null {
  const ig = draft.importedGrid;
  const ses = draft.excelSession;
  if (!ig?.headers?.length || !ig.rows?.length) return null;
  const resolved = resolveSessionAndRowsFromImportedGrid(ig, ses);
  if (!resolved) return null;
  const h = ig.headers;
  const matrixRows = resolved.revivedRows;
  const rolesInput = resolved.session.roles as ColumnRole[];
  if (!validateRoles(rolesInput).ok) return null;
  const { roles: rolesForRun } = applyServiceTimestampIgnore(h, matrixRows, rolesInput);
  if (!validateRoles(rolesForRun).ok) return null;
  return {
    headers: h,
    matrixRows,
    rolesForRun,
    customLabels: resolved.session.customLabels ?? {},
    ordinalLevels: resolved.session.ordinalLevels ?? [],
  };
}
