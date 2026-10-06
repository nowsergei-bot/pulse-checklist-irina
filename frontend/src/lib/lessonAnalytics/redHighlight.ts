import { applyFilters, type AnalyticRow, type FilterSelection } from '../excelAnalytics/engine';
import { roughNormFilterValue } from '../excelAnalytics/filterValueNormalize';

/** Есть ли активные значения красного среза (отдельно от основных фильтров). */
export function isRedHighlightSelectionActive(sel: FilterSelection | null | undefined): boolean {
  if (!sel || typeof sel !== 'object') return false;
  return Object.values(sel).some((v) => Array.isArray(v) && v.length > 0);
}

/**
 * Метки педагогов, у которых в данных есть строки, попадающие в красный срез
 * (применяется к полной таблице / dashboard, не сужает список карточек).
 */
export function teacherNormsMatchingRedHighlight(
  dashboardRows: AnalyticRow[],
  teacherFilterKey: string | null,
  redSelection: FilterSelection | null | undefined,
): Set<string> {
  if (!teacherFilterKey || !isRedHighlightSelectionActive(redSelection)) return new Set();
  const redRows = applyFilters(dashboardRows, redSelection!);
  const out = new Set<string>();
  for (const row of redRows) {
    const label = row.filterValues[teacherFilterKey];
    if (label && label !== '(не указано)') out.add(roughNormFilterValue(label));
  }
  return out;
}

export function buildRedHighlightSelectionForKeys(
  filterKeys: string[],
  saved?: FilterSelection | null,
): FilterSelection {
  const sel: FilterSelection = {};
  for (const k of filterKeys) {
    sel[k] = saved && k in saved ? saved[k] ?? null : null;
  }
  return sel;
}

export function toggleFilterSelectionValue(
  prev: FilterSelection,
  key: string,
  val: string,
  all: string[],
): FilterSelection {
  const cur = prev[key];
  let next: string[] | null;
  if (cur == null) {
    next = [val];
  } else if (Array.isArray(cur)) {
    if (cur.includes(val)) {
      const filtered = cur.filter((x) => x !== val);
      next = filtered.length === 0 ? null : filtered;
    } else {
      next = [...cur, val];
    }
  } else {
    next = [val];
  }
  if (next && next.length === all.length && all.every((a) => next!.includes(a))) {
    next = null;
  }
  return { ...prev, [key]: next };
}
