import {
  filterKeyForRole,
  isFilterRole,
  shouldExposePulseSurveyFilterCandidate,
  PULSE_ORDINAL_LEVEL_KEY,
  PULSE_PARALLEL_AUTO_KEY,
} from './engine';
import type { ColumnRole, CustomFilterLabels } from './types';

/** Подписи измерений среза для UI (как в дашборде Excel). */
export function buildFilterKeyLabels(
  roles: ColumnRole[],
  headers: string[],
  customLabels: CustomFilterLabels,
): Record<string, string> {
  const m: Record<string, string> = {};
  roles.forEach((r, i) => {
    if (!isFilterRole(r)) return;
    const fk = filterKeyForRole(r, customLabels);
    m[fk] = headers[i]?.trim() || fk;
  });
  if (roles.includes('filter_class') && !roles.includes('filter_parallel')) {
    m[PULSE_PARALLEL_AUTO_KEY] = 'Параллель (из класса)';
  }
  if (roles.includes('metric_ordinal_text')) {
    const oci = roles.indexOf('metric_ordinal_text');
    m[PULSE_ORDINAL_LEVEL_KEY] = headers[oci]?.trim() || 'Текстовая шкала';
  }
  roles.forEach((r, i) => {
    if (!shouldExposePulseSurveyFilterCandidate(r)) return;
    m[`__pulse_survey_col_${i}`] = headers[i]?.trim() || `Колонка ${i + 1}`;
  });
  return m;
}
