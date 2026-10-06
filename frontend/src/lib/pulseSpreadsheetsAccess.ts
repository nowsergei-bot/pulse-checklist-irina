import { isPrimakovaResourceIdentity } from './primakovaResourceAccess.ts';
/**
 * Электронные таблицы Пульса.
 * Создавать и управлять доступом может автор таблицы; любой сотрудник может создать свою.
 * canAssign — только для массовой рассылки «всем» (администрация).
 */

export const PULSE_SPREADSHEETS_PATH = '/cabinet/spreadsheets';
export const PULSE_SPREADSHEETS_TITLE = 'Электронные таблицы';
export const PULSE_SPREADSHEET_PUBLIC_PREFIX = '/tables';

export type PulseSpreadsheetIdentity = {
  email?: string | null;
  display_name?: string | null;
  full_name?: string | null;
};

export type PulseSpreadsheetAdmin = {
  key: string;
  emails: string[];
  display_name: string;
  full_names: string[];
};

export const PULSE_SPREADSHEET_ADMINS: readonly PulseSpreadsheetAdmin[] = [
  {
    key: 'maisuradze',
    emails: ['maysuradze@primakov.school', 'maisuradze@primakov.school'],
    display_name: 'Майсурадзе Майя Отариевна',
    full_names: [
      'майсурадзе майя отариевна',
      'майя отариевна майсурадзе',
      'майсурадзе майя',
      'майя майсурадзе',
    ],
  },
  {
    key: 'khoroshilov',
    emails: ['khoroshilov@primakov.school', 'horoshilov@primakov.school'],
    display_name: 'Хорошилов Алексей Александрович',
    full_names: [
      'хорошилов алексей александрович',
      'алексей александрович хорошилов',
      'хорошилов алексей',
      'алексей хорошилов',
    ],
  },
  {
    key: 'basovsky',
    emails: ['basovsky@primakov.school', 'basovskiy@primakov.school'],
    display_name: 'Басовский Виталий Валерьевич',
    full_names: [
      'басовский виталий валерьевич',
      'виталий валерьевич басовский',
      'басовский виталий',
      'виталий басовский',
    ],
  },
  {
    key: 'prishep',
    emails: ['prishep@primakov.school', 'prischep@primakov.school'],
    display_name: 'Прищеп Александр Александрович',
    full_names: [
      'прищеп александр александрович',
      'александр александрович прищеп',
      'прищеп александр',
      'александр прищеп',
    ],
  },
  {
    key: 'zenkovich',
    emails: ['zenkovich@primakov.school', 'n.zenkovich@primakov.school'],
    display_name: 'Зенькович Наталья Владимировна',
    full_names: [
      'зенькович наталья владимировна',
      'наталья владимировна зенькович',
      'зенькович наталья',
      'наталья зенькович',
    ],
  },
  {
    key: 'eliseev',
    emails: ['eliseev@primakov.school'],
    display_name: 'Елисеев Артемий Сергеевич',
    full_names: [
      'елисеев артемий сергеевич',
      'артемий сергеевич елисеев',
      'елисеев артемий',
      'артемий елисеев',
    ],
  },
  {
    key: 'fadeeva',
    emails: ['fadeeva@primakov.school'],
    display_name: 'Фадеева Дарья Сергеевна',
    full_names: [
      'фадеева дарья сергеевна',
      'дарья сергеевна фадеева',
      'фадеева дарья',
      'дарья фадеева',
    ],
  },
  {
    key: 'shinkevich',
    emails: ['shinkevich@primakov.school'],
    display_name: 'Шинкевич Марина Николаевна',
    full_names: [
      'шинкевич марина николаевна',
      'марина николаевна шинкевич',
      'шинкевич марина',
      'марина шинкевич',
    ],
  },
  {
    key: 'novozhilov',
    emails: ['sergey.novogilov@primakov.school', 'novozhilov@primakov.school'],
    display_name: 'Новожилов Сергей Валерьевич',
    full_names: [
      'новожилов сергей валерьевич',
      'сергей валерьевич новожилов',
      'новожилов сергей',
      'сергей новожилов',
    ],
  },
  {
    key: 'primakova',
    emails: ['marianna.primakova@primakov.school', 'primakova@primakov.school'],
    display_name: 'Примакова Марианна Николаевна',
    full_names: [
      'примакова марианна николаевна',
      'марианна николаевна примакова',
      'примакова марианна',
      'марианна примакова',
    ],
  },
];

function collapseSpaces(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSpreadsheetName(raw: string | null | undefined): string {
  return collapseSpaces(raw)
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function normEmail(raw: string | null | undefined): string {
  return collapseSpaces(raw).toLowerCase();
}

function identityNames(
  user: PulseSpreadsheetIdentity | null | undefined,
  staffName?: string | null,
): string[] {
  return [
    normalizeSpreadsheetName(user?.display_name),
    normalizeSpreadsheetName(user?.full_name),
    normalizeSpreadsheetName(staffName),
  ].filter(Boolean);
}

export function findPulseSpreadsheetAdmin(
  user: PulseSpreadsheetIdentity | null | undefined,
  staffName?: string | null,
): PulseSpreadsheetAdmin | null {
  if (!user && !staffName) return null;
  const email = normEmail(user?.email);
  const names = identityNames(user, staffName);
  for (const person of PULSE_SPREADSHEET_ADMINS) {
    if (email && person.emails.includes(email)) return person;
    for (const name of names) {
      if (person.full_names.includes(name)) return person;
    }
  }
  return null;
}

export function canAssignPulseSpreadsheets(
  user: PulseSpreadsheetIdentity | null | undefined,
  staffName?: string | null,
  opts?: { preview?: boolean },
): boolean {
  if (opts?.preview) return false;
  return Boolean(findPulseSpreadsheetAdmin(user, staffName));
}

export function canCreatePulseSpreadsheets(opts?: { preview?: boolean; authed?: boolean }): boolean {
  if (opts?.preview) return false;
  return opts?.authed !== false;
}

export function canManagePulseWorkbookAccess(
  _user: PulseSpreadsheetIdentity | null | undefined,
  _staffName: string | null | undefined,
  opts?: { preview?: boolean; isAuthor?: boolean },
): boolean {
  if (opts?.preview) return false;
  return Boolean(opts?.isAuthor);
}

export function isPulseSpreadsheetsPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  const norm = path.replace(/^\/cabinet\/as/, '/cabinet');
  return norm === PULSE_SPREADSHEETS_PATH || norm.startsWith(`${PULSE_SPREADSHEETS_PATH}/`);
}

export function isPulseSpreadsheetPublicPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === PULSE_SPREADSHEET_PUBLIC_PREFIX || path.startsWith(`${PULSE_SPREADSHEET_PUBLIC_PREFIX}/`);
}

/** Old schedule URLs and the spreadsheets hub entry → checklist schedule. */
export function lessonVisitsRedirectPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/';
  const prefix = path.startsWith('/cabinet/as') ? '/cabinet/as' : '/cabinet';
  return `${prefix}/feedback/schedule`;
}

/** Teachers temporarily do not see tables; methodists and other staff keep the menu. */
export function canSeePulseSpreadsheetsNav(
  user?: PulseSpreadsheetIdentity & { role?: string | null },
  staff?: { full_name?: string | null; position_actual?: string | null; position_staff?: string | null; display_position?: string | null; department?: string | null } | null,
  opts?: { preview?: boolean; isAdmin?: boolean; platformOwner?: boolean; authed?: boolean },
): boolean {
  if (opts?.authed === false) return false;
  if (isPrimakovaResourceIdentity(user, staff?.full_name)) return true;
  if (opts?.isAdmin || opts?.platformOwner) return true;
  const role = String(user?.role || '').toLowerCase();
  const position = [staff?.position_actual, staff?.position_staff, staff?.display_position].filter(Boolean).join(' ').toLowerCase();
  if (/методист/u.test(position) || role === 'methodist') return true;
  if (/учител|педагог|преподавател/u.test(position) || role === 'teacher') return false;
  return Boolean(user);
}
