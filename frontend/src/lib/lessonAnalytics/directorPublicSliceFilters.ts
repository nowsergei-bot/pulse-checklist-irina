import {
  filterKeyForRole,
  isFilterRole,
  PULSE_ORDINAL_LEVEL_KEY,
  type AnalyticRow,
} from '../excelAnalytics/engine';
import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import {
  extractTeacherDepartmentCode,
  teacherDepartmentTitleRu,
} from './teacherCipherDepartment';

/** Синтетическое измерение «кафедра» из префикса шифра в колонке «Педагог». */
export const PULSE_DIRECTOR_DEPT_KEY = '__pulse_director_dept';

export type DirectorPublicFilterSpec = {
  keys: string[];
  labels: Record<string, string>;
};

const RE_DEPT = /кафедр/i;
const RE_SUBJECT = /предмет|дисциплин|subject/i;
const RE_MASTERY = /мастерств|профессиональн[\s-]*методическ|уровен\w*\s*учител/i;

function headerForRole(roles: ColumnRole[], headers: string[], role: ColumnRole): string {
  const i = roles.indexOf(role);
  return i >= 0 ? headers[i]?.trim() ?? '' : '';
}

/**
 * Только три среза для страницы руководителя: кафедра, предмет (из справочника по шифру), уровень пед. мастерства.
 */
export function resolveDirectorPublicFilterKeys(
  roles: ColumnRole[],
  headers: string[],
  customLabels: CustomFilterLabels,
  teacherFilterKey: string | null,
): DirectorPublicFilterSpec {
  const keys: string[] = [];
  const labels: Record<string, string> = {};

  let deptKey: string | null = null;
  for (let i = 0; i < roles.length; i++) {
    const r = roles[i];
    if (!isFilterRole(r)) continue;
    const h = headers[i]?.trim() ?? '';
    const fk = filterKeyForRole(r, customLabels);
    if (RE_DEPT.test(h) || RE_DEPT.test(fk)) {
      deptKey = fk;
      labels[fk] = h || 'Кафедра';
      break;
    }
  }
  if (!deptKey && teacherFilterKey) {
    deptKey = PULSE_DIRECTOR_DEPT_KEY;
    labels[PULSE_DIRECTOR_DEPT_KEY] = 'Кафедра';
  }
  if (deptKey) keys.push(deptKey);

  const subjectIdx = roles.indexOf('filter_subject');
  if (subjectIdx >= 0) {
    const fk = filterKeyForRole('filter_subject', customLabels);
    keys.push(fk);
    labels[fk] = headers[subjectIdx]?.trim() || 'Предмет (по шифру)';
  } else {
    for (let i = 0; i < roles.length; i++) {
      const r = roles[i];
      if (!isFilterRole(r)) continue;
      const h = headers[i]?.trim() ?? '';
      if (!RE_SUBJECT.test(h)) continue;
      const fk = filterKeyForRole(r, customLabels);
      if (!keys.includes(fk)) {
        keys.push(fk);
        labels[fk] = h || 'Предмет (по шифру)';
        break;
      }
    }
  }

  const masteryIdx = roles.indexOf('metric_ordinal_text');
  if (masteryIdx >= 0) {
    keys.push(PULSE_ORDINAL_LEVEL_KEY);
    const h = headers[masteryIdx]?.trim() ?? '';
    labels[PULSE_ORDINAL_LEVEL_KEY] = RE_MASTERY.test(h)
      ? h
      : headerForRole(roles, headers, 'metric_ordinal_text') || 'Уровень пед. мастерства';
  }

  return { keys, labels };
}

export function augmentRowsWithDirectorDepartment(
  rows: AnalyticRow[],
  teacherFilterKey: string | null,
): AnalyticRow[] {
  if (!teacherFilterKey) return rows;
  return rows.map((r) => {
    const teacher = r.filterValues[teacherFilterKey] ?? '';
    const dept = teacherDepartmentTitleRu(extractTeacherDepartmentCode(teacher));
    return {
      ...r,
      filterValues: {
        ...r.filterValues,
        [PULSE_DIRECTOR_DEPT_KEY]: dept,
      },
    };
  });
}
