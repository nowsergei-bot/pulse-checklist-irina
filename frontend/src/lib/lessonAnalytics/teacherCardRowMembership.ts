import { type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import { formatBilingualCellLabel } from '../excelAnalytics/excelDisplayLabel';
import {
  filterKeyForRole,
  lessonIdentityKey,
  type AnalyticRow,
} from '../excelAnalytics/engine';
import { roughNormFilterValue } from '../excelAnalytics/filterValueNormalize';
import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import { filterAnalyticRowsByTeacherLabel } from './lessonTeacherNarrativeContext';

/** Ручной состав карточки педагога (ключи аналитических строк). */
export type TeacherCardRowMembership = {
  /** Включить в карточку, даже если в колонке «Педагог» другое ФИО. */
  includeKeys: string[];
  /** Исключить из карточки, даже если ФИО совпадает. */
  excludeKeys: string[];
};

export function emptyTeacherCardRowMembership(): TeacherCardRowMembership {
  return { includeKeys: [], excludeKeys: [] };
}

export function normalizeTeacherCardRowMembership(
  raw?: Partial<TeacherCardRowMembership> | null,
): TeacherCardRowMembership {
  const inc = [...new Set((raw?.includeKeys ?? []).map((k) => String(k).trim()).filter(Boolean))];
  const exc = [...new Set((raw?.excludeKeys ?? []).map((k) => String(k).trim()).filter(Boolean))];
  const excSet = new Set(exc);
  return {
    includeKeys: inc.filter((k) => !excSet.has(k)),
    excludeKeys: exc,
  };
}

/** Стабильный ключ аналитической строки в пределах проекта (для ручного состава карточки). */
export function analyticRowMembershipKey(row: AnalyticRow, teacherFilterKey: string): string {
  const base = lessonIdentityKey(row);
  const sp = row.splitPart != null ? `:sp${row.splitPart}` : '';
  const teacher = row.filterValues[teacherFilterKey];
  const tv = teacher ? `:tv:${roughNormFilterValue(teacher)}` : '';
  return `${base}${sp}${tv}`;
}

export type ResolveTeacherCardRowsOpts = {
  block: LessonAnalyticsTeacherBlock;
  teacherFilterKey: string;
  /** Вся таблица после фильтров страницы — для ручного добавления строк. */
  poolRows: AnalyticRow[];
  /** Текущий срез (если задан — сначала ищем авто-строки здесь). */
  sliceRows?: AnalyticRow[];
};

/** Строки, входящие в карточку: авто по ФИО ± ручные include/exclude. */
export function resolveTeacherCardRows(opts: ResolveTeacherCardRowsOpts): AnalyticRow[] {
  const membership = normalizeTeacherCardRowMembership(opts.block.rowMembership);
  const exclude = new Set(membership.excludeKeys);
  const include = new Set(membership.includeKeys);
  const key = (r: AnalyticRow) => analyticRowMembershipKey(r, opts.teacherFilterKey);

  const basePool = opts.sliceRows?.length ? opts.sliceRows : opts.poolRows;
  let autoRows = filterAnalyticRowsByTeacherLabel(
    basePool,
    opts.teacherFilterKey,
    opts.block.teacherLabel,
  );
  if (autoRows.length === 0 && opts.poolRows.length > 0) {
    autoRows = filterAnalyticRowsByTeacherLabel(
      opts.poolRows,
      opts.teacherFilterKey,
      opts.block.teacherLabel,
    );
  }

  const byKey = new Map<string, AnalyticRow>();
  for (const r of autoRows) {
    const k = key(r);
    if (!exclude.has(k)) byKey.set(k, r);
  }
  for (const r of opts.poolRows) {
    const k = key(r);
    if (!include.has(k) || exclude.has(k)) continue;
    byKey.set(k, r);
  }

  return [...byKey.values()].sort((a, b) => a.idx - b.idx);
}

/** Лёгкая подпись строк наблюдений педагога (без полной сборки карточки). */
export function buildTeacherRowIdxSignature(opts: ResolveTeacherCardRowsOpts): string {
  const rows = resolveTeacherCardRows(opts);
  if (!rows.length) return '';
  return [...new Set(rows.map((r) => r.idx))].sort((a, b) => a - b).join(',');
}

export function rowMembershipSource(
  row: AnalyticRow,
  teacherFilterKey: string,
  block: LessonAnalyticsTeacherBlock,
): 'auto' | 'manual-include' | 'manual-exclude' {
  const k = analyticRowMembershipKey(row, teacherFilterKey);
  const m = normalizeTeacherCardRowMembership(block.rowMembership);
  if (m.excludeKeys.includes(k)) return 'manual-exclude';
  if (m.includeKeys.includes(k)) return 'manual-include';
  return 'auto';
}

export function formatTeacherCardRowSummary(
  row: AnalyticRow,
  teacherFilterKey: string,
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
): string {
  const parts: string[] = [];
  if (row.sourceRowId?.trim()) parts.push(`№ ${row.sourceRowId.trim()}`);
  else parts.push(`поз. ${row.idx + 1}`);
  if (row.date) parts.push(row.date);
  const teacher = row.filterValues[teacherFilterKey];
  if (teacher && teacher !== '(не указано)') {
    parts.push(`пед.: ${formatBilingualCellLabel(teacher, 'ru')}`);
  }
  const classKey = roles.includes('filter_class')
    ? filterKeyForRole('filter_class', customLabels)
    : null;
  const subjectKey = roles.includes('filter_subject')
    ? filterKeyForRole('filter_subject', customLabels)
    : null;
  const cls = classKey ? row.filterValues[classKey] : null;
  const subj = subjectKey ? row.filterValues[subjectKey] : null;
  if (cls && cls !== '(не указано)') parts.push(`кл.: ${formatBilingualCellLabel(cls, 'ru')}`);
  if (subj && subj !== '(не указано)') parts.push(`пр.: ${formatBilingualCellLabel(subj, 'ru')}`);
  if (row.rowLabel?.trim()) parts.push(row.rowLabel.trim().slice(0, 48));
  return parts.join(' · ');
}

export function addRowToTeacherMembership(
  membership: TeacherCardRowMembership,
  rowKey: string,
): TeacherCardRowMembership {
  const m = normalizeTeacherCardRowMembership(membership);
  const excludeKeys = m.excludeKeys.filter((k) => k !== rowKey);
  const includeKeys = m.includeKeys.includes(rowKey) ? m.includeKeys : [...m.includeKeys, rowKey];
  return normalizeTeacherCardRowMembership({ includeKeys, excludeKeys });
}

export function removeRowFromTeacherMembership(
  membership: TeacherCardRowMembership,
  rowKey: string,
  wasManualInclude: boolean,
): TeacherCardRowMembership {
  const m = normalizeTeacherCardRowMembership(membership);
  const includeKeys = m.includeKeys.filter((k) => k !== rowKey);
  if (wasManualInclude) {
    return normalizeTeacherCardRowMembership({ includeKeys, excludeKeys: m.excludeKeys });
  }
  const excludeKeys = m.excludeKeys.includes(rowKey) ? m.excludeKeys : [...m.excludeKeys, rowKey];
  return normalizeTeacherCardRowMembership({ includeKeys, excludeKeys });
}
