import { formatBilingualCellLabel } from '../excelAnalytics/excelDisplayLabel';

/** Нормализация ФИО для сопоставления педагогов между проектами / периодами. */
export function normalizeTeacherLabel(s: string): string {
  return formatBilingualCellLabel(String(s ?? ''), 'ru')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[«»""]/g, '"');
}

export function teacherLabelsMatch(a: string, b: string): boolean {
  const na = normalizeTeacherLabel(a);
  const nb = normalizeTeacherLabel(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const sa = na.split(/[\s\u00a0]+/)[0] ?? '';
  const sb = nb.split(/[\s\u00a0]+/)[0] ?? '';
  return sa.length > 2 && sb.length > 2 && sa === sb;
}

/** Находит метку педагога в baseline-проекте по нормализованному совпадению. */
export function findMatchingTeacherLabel(
  currentLabel: string,
  baselineLabels: readonly string[],
): string | null {
  for (const bl of baselineLabels) {
    if (teacherLabelsMatch(currentLabel, bl)) return bl;
  }
  return null;
}
