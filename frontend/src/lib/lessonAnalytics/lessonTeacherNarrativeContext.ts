import type { CellPrimitive } from '../excelAnalytics/parse';
import { applyFilters, filterKeyForRole, type AnalyticRow } from '../excelAnalytics/engine';
import { roughNormFilterValue } from '../excelAnalytics/filterValueNormalize';
import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import {
  buildLessonCompetencyLlmContextRu,
  buildLessonCompetencyScaleAggregates,
} from './lessonCompetencyScale';
import { rowMatchesTeacher, teacherDataColumnIndex } from './lessonAnalyticsRubricHeatmap';

/** Строки одного педагога: точный фильтр, затем нормализованное совпадение метки. */
export function filterAnalyticRowsByTeacherLabel(
  rows: AnalyticRow[],
  teacherFilterKey: string,
  teacherLabel: string,
): AnalyticRow[] {
  const direct = String(teacherLabel ?? '').trim();
  if (!direct || !rows.length) return [];
  const filterLabel = resolveTeacherFilterLabelForRows(rows, teacherFilterKey, direct);
  const exact = applyFilters(rows, { [teacherFilterKey]: [filterLabel] });
  if (exact.length > 0) return exact;
  const wantNorm = roughNormFilterValue(direct);
  return rows.filter((r) => {
    const v = r.filterValues[teacherFilterKey];
    if (v == null) return false;
    return roughNormFilterValue(v) === wantNorm;
  });
}

function resolveTeacherFilterLabelForRows(
  rows: AnalyticRow[],
  teacherFilterKey: string,
  teacherLabel: string,
): string {
  const direct = String(teacherLabel ?? '').trim();
  if (!direct) return direct;
  const sel = { [teacherFilterKey]: [direct] };
  if (applyFilters(rows, sel).length > 0) return direct;
  const wantNorm = roughNormFilterValue(direct);
  for (const v of uniqueFilterValuesInRows(rows, teacherFilterKey)) {
    if (roughNormFilterValue(v) === wantNorm) return v;
  }
  return direct;
}

function uniqueFilterValuesInRows(rows: AnalyticRow[], key: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const v = r.filterValues[key];
    if (v == null || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Факты из сырой матрицы, когда аналитические строки педагога не сопоставились с фильтром. */
export function buildMinimalTeacherFactsExcerpt(
  teacherLabel: string,
  teacherFilterKey: string,
  headers: string[],
  rawRows: CellPrimitive[][],
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
): string {
  const label = String(teacherLabel ?? '').trim();
  if (!label) return '';
  const parts: string[] = [];
  const compAgg = buildLessonCompetencyScaleAggregates(
    rawRows,
    roles,
    customLabels,
    teacherFilterKey,
    label,
  );
  const compText = buildLessonCompetencyLlmContextRu(compAgg);
  if (compText) parts.push(compText);
  const ti = teacherDataColumnIndex(roles, customLabels, teacherFilterKey);
  if (ti >= 0 && rawRows.length) {
    let n = 0;
    for (const line of rawRows) {
      if (!line?.length) continue;
      const cell = ti < line.length ? line[ti] : '';
      if (rowMatchesTeacher(cell, label)) n += 1;
    }
    parts.push(`Строк в исходной таблице для «${label}»: ${n}.`);
  }
  if (!parts.length && roles.includes('filter_teacher_code')) {
    parts.push(
      `Колонка педагога: «${headers[roles.indexOf('filter_teacher_code')] || filterKeyForRole('filter_teacher_code', customLabels)}».`,
    );
  }
  return parts.join('\n\n');
}
