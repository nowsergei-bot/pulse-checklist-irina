import { scheduleNameMatches } from '../lessonVisitScheduleAccess.ts';

export const UNKNOWN_TEACHER_LABEL = 'Педагог без ФИО';

export type VisitScheduleMatchRow = {
  class_name?: string | null;
  class?: string | null;
  visitor?: string | null;
  visitor_name?: string | null;
  teacher?: string | null;
};

const LATIN_TO_CYR: Record<string, string> = {
  A: 'А',
  B: 'В',
  C: 'С',
  E: 'Е',
  H: 'Н',
  K: 'К',
  M: 'М',
  O: 'О',
  P: 'Р',
  T: 'Т',
  X: 'Х',
  Y: 'У',
};

function collapseSpaces(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function looksLikeTeacherCode(raw: string | null | undefined): boolean {
  const label = collapseSpaces(raw);
  return /^(?:teacher[_-]?[a-z0-9]+|t\d+)$/i.test(label);
}

export function isUnknownTeacherLabel(raw: string | null | undefined): boolean {
  const label = collapseSpaces(raw);
  return !label || label === UNKNOWN_TEACHER_LABEL || looksLikeTeacherCode(label);
}

export function normalizeVisitClass(raw: string | null | undefined): string {
  let n = collapseSpaces(raw).toLocaleUpperCase('ru-RU');
  n = n.replace(/[ABCEHKMOPTXY]/g, (ch) => LATIN_TO_CYR[ch] || ch);
  return n.replace(/[.\-_/]/g, '').replace(/\s+/g, '');
}

function personKey(raw: string | null | undefined): string {
  return collapseSpaces(raw)
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function visitorsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = collapseSpaces(left);
  const b = collapseSpaces(right);
  if (!a || !b) return false;
  if (personKey(a) === personKey(b)) return true;
  return scheduleNameMatches(a, b);
}

function visitHint(raw: VisitScheduleMatchRow | null | undefined): { class_name: string; visitor: string } {
  const row = raw || {};
  return {
    class_name: collapseSpaces(row.class_name || row.class),
    visitor: collapseSpaces(row.visitor || row.visitor_name),
  };
}

function usableTeacherName(raw: string | null | undefined): string {
  const name = collapseSpaces(raw);
  return isUnknownTeacherLabel(name) ? '' : name;
}

export function matchTeacherFromVisitSchedule(
  scheduleRows: VisitScheduleMatchRow[] | null | undefined,
  hint: VisitScheduleMatchRow | null | undefined,
): string | null {
  const { class_name, visitor } = visitHint(hint);
  const klass = normalizeVisitClass(class_name);
  if (!klass || !visitor) return null;
  const names = new Map<string, string>();
  for (const row of scheduleRows || []) {
    const teacher = usableTeacherName(row.teacher);
    if (!teacher) continue;
    if (normalizeVisitClass(row.class_name || row.class) !== klass) continue;
    if (!visitorsMatch(row.visitor || row.visitor_name, visitor)) continue;
    const key = personKey(teacher);
    if (!key) continue;
    if (!names.has(key)) names.set(key, teacher);
  }
  if (names.size !== 1) return null;
  return [...names.values()][0] || null;
}

export function resolveTeacherLabelFromSchedule(
  scheduleRows: VisitScheduleMatchRow[] | null | undefined,
  visits: VisitScheduleMatchRow[] | null | undefined,
): string | null {
  const names = new Map<string, string>();
  for (const visit of visits || []) {
    const name = matchTeacherFromVisitSchedule(scheduleRows, visit);
    if (!name) continue;
    const key = personKey(name);
    if (!names.has(key)) names.set(key, name);
  }
  if (names.size !== 1) return null;
  return [...names.values()][0] || null;
}
