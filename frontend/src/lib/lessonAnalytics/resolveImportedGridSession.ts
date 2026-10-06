import { type LessonAnalyticsDraft } from '../../api/lessonAnalytics';
import { suggestColumnRoles } from '../excelAnalytics/autoMap';
import { formatBilingualCellLabel } from '../excelAnalytics/excelDisplayLabel';
import type { SavedExcelSession } from '../excelAnalytics/excelSessionStorage';
import { primitiveCellToPlainString, type CellPrimitive } from '../excelAnalytics/parse';
import { reviveImportedRows } from '../excelAnalytics/importedGridSerialize';
import { validateRoles, type ColumnRole, type CustomFilterLabels } from '../excelAnalytics/types';

function collectOrdinalValues(rows: CellPrimitive[][], colIndex: number): string[] {
  const s = new Set<string>();
  for (const line of rows) {
    const c = line[colIndex];
    if (c == null || c === '') continue;
    const raw = primitiveCellToPlainString(c);
    const t = formatBilingualCellLabel(raw, 'ru').trim();
    if (t) s.add(t);
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
}

/**
 * Восстанавливает сессию Excel по снимку листа на сервере. Если excelSession отсутствует или не
 * совпадает по колонкам — роли подбираются заново (как при первом открытии файла).
 */
export function resolveSessionAndRowsFromImportedGrid(
  ig: NonNullable<LessonAnalyticsDraft['importedGrid']>,
  ses: SavedExcelSession | null | undefined,
): { session: SavedExcelSession; revivedRows: CellPrimitive[][] } | null {
  if (!ig.headers?.length || !ig.rows?.length) return null;
  const revived = reviveImportedRows(ig.rows);
  if (!revived.length) return null;
  const h = ig.headers;

  const sesRolesOk =
    ses &&
    ses.headers?.length === h.length &&
    ses.roles?.length === h.length &&
    validateRoles(ses.roles).ok;

  let roles: ColumnRole[];
  let customLabels: CustomFilterLabels;
  let ordinalLevels: string[];

  if (sesRolesOk && ses) {
    roles = ses.roles as ColumnRole[];
    customLabels = ses.customLabels ?? {};
    const ordCol = roles.indexOf('metric_ordinal_text');
    ordinalLevels =
      ordCol >= 0 && ses.ordinalLevels?.length
        ? ses.ordinalLevels
        : ordCol >= 0
          ? collectOrdinalValues(revived, ordCol)
          : [];
  } else {
    roles = suggestColumnRoles(h, revived);
    if (!validateRoles(roles).ok) return null;
    customLabels = ses?.customLabels ?? {};
    const oc = roles.indexOf('metric_ordinal_text');
    ordinalLevels = oc >= 0 ? collectOrdinalValues(revived, oc) : [];
  }

  const session: SavedExcelSession = {
    v: 1,
    fingerprint: ses?.fingerprint || 'server-stored-grid',
    fileName: ig.fileName || ses?.fileName || 'file.xlsx',
    sheet: ig.sheet,
    headerRow1Based: ig.headerRow1Based,
    headers: h,
    roles,
    customLabels,
    ordinalLevels,
    filterSelection: ses?.filterSelection ?? {},
    filterPanelHiddenKeys: ses?.filterPanelHiddenKeys ?? [],
  };
  return { session, revivedRows: revived };
}
