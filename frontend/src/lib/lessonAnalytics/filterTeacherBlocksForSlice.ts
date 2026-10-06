import { type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import { roughNormFilterValue } from '../excelAnalytics/filterValueNormalize';
import {
  uniqueFilterValues,
  type AnalyticRow,
  type FilterSelection,
} from '../excelAnalytics/engine';
import type { CellPrimitive } from '../excelAnalytics/parse';
import type { ColumnRole } from '../excelAnalytics/types';
import { matchesSurnameFilter } from '../matchSurnameFilter';

/** Есть ли хотя бы один активный фильтр среза (не «все значения»). */
export function hasActiveSliceFilters(selection: FilterSelection): boolean {
  return Object.values(selection).some(
    (allowed) => allowed != null && allowed.length > 0,
  );
}

/** Уникальные метки педагогов в таблице (для списка карточек — по всему проекту, не по срезу). */
export function listTeacherLabelsFromRows(
  rows: AnalyticRow[],
  teacherFilterKey: string | null,
): string[] {
  if (!teacherFilterKey || !rows.length) return [];
  return uniqueFilterValues(rows, teacherFilterKey)
    .filter((x) => x && x !== '(не указано)')
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Уникальные ФИО педагогов из сырой сетки (синхронизация чек-листа → аналитика). */
export function listTeacherLabelsFromGridCells(
  rows: CellPrimitive[][],
  roles: ColumnRole[],
): string[] {
  const col = roles.indexOf('filter_teacher_code');
  if (col < 0 || !rows.length) return [];
  const labels = new Set<string>();
  for (const line of rows) {
    const v = String(line[col] ?? '').trim();
    if (v && v !== '(не указано)') labels.add(v);
  }
  return [...labels].sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Совпадает ли порядок и число карточек с метками из таблицы. */
export function teacherBlockListMatchesLabels(
  blocks: LessonAnalyticsTeacherBlock[],
  labels: string[],
): boolean {
  if (blocks.length !== labels.length) return false;
  return labels.every((label, i) => String(blocks[i]?.teacherLabel ?? '').trim() === label.trim());
}

/**
 * Ровно одна карточка на каждую метку ФИО; id и aiNarrative подтягиваются из prev по точному ФИО, затем по norm.
 * `idForLabel` — детерминированный id (одинаковый на всех устройствах); без него — случайный UUID.
 */
export function syncTeacherBlocksFromLabels(
  labels: string[],
  prev: LessonAnalyticsTeacherBlock[],
  narrativeForLabel?: (label: string, block?: LessonAnalyticsTeacherBlock) => string,
  idForLabel?: (label: string) => string,
): LessonAnalyticsTeacherBlock[] {
  const narrative = narrativeForLabel ?? (() => '');

  const byExactLabel = new Map<string, LessonAnalyticsTeacherBlock>();
  const byNormLabel = new Map<string, LessonAnalyticsTeacherBlock>();
  for (const b of prev) {
    const label = String(b.teacherLabel ?? '').trim();
    if (!label) continue;
    const prevExact = byExactLabel.get(label);
    const mergedExact = prevExact
      ? {
          ...prevExact,
          ...b,
          aiNarrative:
            String(b.aiNarrative ?? '').trim() ||
            String(prevExact.aiNarrative ?? '').trim() ||
            prevExact.aiNarrative,
        }
      : b;
    byExactLabel.set(label, mergedExact);
    const norm = roughNormFilterValue(label);
    if (!byNormLabel.has(norm)) byNormLabel.set(norm, mergedExact);
  }

  const usedIds = new Set<string>();
  const out: LessonAnalyticsTeacherBlock[] = [];
  for (const rawLabel of labels) {
    const label = String(rawLabel ?? '').trim();
    if (!label) continue;
    let ex = byExactLabel.get(label) ?? byNormLabel.get(roughNormFilterValue(label));
    if (ex && usedIds.has(ex.id)) ex = undefined;

    const aiNarrative = narrative(label, ex);
    const stableId = idForLabel?.(label);
    if (ex) {
      const id = stableId ?? ex.id;
      usedIds.add(id);
      out.push(
        aiNarrative
          ? { ...ex, id, teacherLabel: label, aiNarrative }
          : { ...ex, id, teacherLabel: label },
      );
      continue;
    }
    const id =
      stableId ??
      globalThis.crypto?.randomUUID?.() ??
      `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    usedIds.add(id);
    out.push({
      id,
      teacherLabel: label,
      status: 'draft',
      ...(aiNarrative ? { aiNarrative } : {}),
    });
  }
  return out;
}

/** Карточки педагогов, у которых есть строки в текущем срезе после фильтров. Без активных фильтров — все карточки проекта. */
export function filterTeacherBlocksForSlice(
  blocks: LessonAnalyticsTeacherBlock[],
  filteredRows: AnalyticRow[],
  teacherFilterKey: string | null,
  filterSelection?: FilterSelection | null,
): LessonAnalyticsTeacherBlock[] {
  if (!teacherFilterKey || !blocks.length) return blocks;
  if (!hasActiveSliceFilters(filterSelection ?? {})) return blocks;
  const labelsInSlice = listTeacherLabelsFromRows(filteredRows, teacherFilterKey);
  if (labelsInSlice.length === 0) return [];
  const exact = new Set(labelsInSlice);
  const norms = new Set(labelsInSlice.map((x) => roughNormFilterValue(x)));
  return blocks.filter((b) => {
    const lbl = String(b.teacherLabel ?? '').trim();
    if (exact.has(lbl)) return true;
    return norms.has(roughNormFilterValue(lbl));
  });
}

/** Дополнительный фильтр карточек по части фамилии из поля ФИО. */
export function filterTeacherBlocksBySurname(
  blocks: LessonAnalyticsTeacherBlock[],
  query: string,
): LessonAnalyticsTeacherBlock[] {
  const q = query.trim();
  if (!q) return blocks;
  return blocks.filter((b) => matchesSurnameFilter(b.teacherLabel, q));
}
