/**
 * График посещения уроков в кабинете учителя.
 * Владельцы (назначают редакторов): Новожилов, Хорошилов.
 */

export const LESSON_VISIT_SCHEDULE_PATH = '/cabinet/feedback/schedule';
export const LESSON_VISIT_SCHEDULE_LEGACY_PATH = '/cabinet/lesson-visits';
export const LESSON_VISIT_SCHEDULE_TITLE = 'График посещения';

export type LessonVisitScheduleIdentity = {
  email?: string | null;
  display_name?: string | null;
  full_name?: string | null;
};

import {
  CABINET_ADMINISTRATION_DEPUTIES,
  type CabinetAdministrationDeputy,
} from './cabinetAdministrationDeputies.ts';

export type LessonVisitScheduleOwner = {
  key: CabinetAdministrationDeputy['key'] | 'novozhilov' | 'primakova';
  emails: string[];
  display_name: string;
  full_names: string[];
};

const NOVOZHILOV_OWNER: LessonVisitScheduleOwner = {
  key: 'novozhilov',
  emails: ['sergey.novogilov@primakov.school', 'novozhilov@primakov.school'],
  display_name: 'Новожилов Сергей Валерьевич',
  full_names: [
    'новожилов сергей валерьевич',
    'сергей валерьевич новожилов',
    'новожилов сергей',
    'сергей новожилов',
  ],
};

export const LESSON_VISIT_SCHEDULE_OWNERS: readonly LessonVisitScheduleOwner[] = [
  ...CABINET_ADMINISTRATION_DEPUTIES,
  NOVOZHILOV_OWNER,
  { key: 'primakova', emails: ['marianna.primakova@primakov.school', 'primakova@primakov.school'], display_name: 'Примакова Марианна Николаевна', full_names: ['примакова марианна николаевна', 'марианна николаевна примакова', 'примакова марианна', 'марианна примакова'] },
];

function collapseSpaces(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeScheduleName(raw: string | null | undefined): string {
  return collapseSpaces(raw)
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function normEmail(raw: string | null | undefined): string {
  return collapseSpaces(raw).toLowerCase();
}

function identityNames(
  user: LessonVisitScheduleIdentity | null | undefined,
  staffName?: string | null,
): string[] {
  return [
    normalizeScheduleName(user?.display_name),
    normalizeScheduleName(user?.full_name),
    normalizeScheduleName(staffName),
  ].filter(Boolean);
}

export function findLessonVisitScheduleOwner(
  user: LessonVisitScheduleIdentity | null | undefined,
  staffName?: string | null,
): LessonVisitScheduleOwner | null {
  if (!user && !staffName) return null;
  const email = normEmail(user?.email);
  const names = identityNames(user, staffName);
  for (const person of LESSON_VISIT_SCHEDULE_OWNERS) {
    if (email && person.emails.includes(email)) return person;
    for (const name of names) {
      if (person.full_names.includes(name)) return person;
    }
  }
  return null;
}

export function canAssignLessonVisitScheduleEditors(
  user: LessonVisitScheduleIdentity | null | undefined,
  staffName?: string | null,
  opts?: { preview?: boolean },
): boolean {
  if (opts?.preview) return false;
  return Boolean(findLessonVisitScheduleOwner(user, staffName));
}

export function isLessonVisitSchedulePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  const norm = path.replace(/^\/cabinet\/as/, '/cabinet');
  return (
    norm === LESSON_VISIT_SCHEDULE_PATH ||
    norm.startsWith(`${LESSON_VISIT_SCHEDULE_PATH}/`) ||
    norm === LESSON_VISIT_SCHEDULE_LEGACY_PATH ||
    norm.startsWith(`${LESSON_VISIT_SCHEDULE_LEGACY_PATH}/`)
  );
}

export function scheduleNameTokens(raw: string | null | undefined): string[] {
  return normalizeScheduleName(raw)
    .replace(/[().,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** «Акбатырова М.Н.» / «Хорошилов Алексей» → фамилия. */
export function scheduleSurname(raw: string | null | undefined): string {
  const tokens = scheduleNameTokens(raw);
  if (!tokens.length) return '';
  const first = tokens[0];
  if (first.length > 2 && !/^[a-zа-я]\.?$/.test(first)) return first;
  return tokens[tokens.length - 1] || first;
}

export function scheduleNameMatches(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = scheduleSurname(left);
  const b = scheduleSurname(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const leftTokens = new Set(scheduleNameTokens(left));
  const rightTokens = new Set(scheduleNameTokens(right));
  return leftTokens.has(b) && rightTokens.has(a);
}
