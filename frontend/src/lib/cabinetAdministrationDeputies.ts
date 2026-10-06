/**
 * Директор и заместители директора — расширенные кнопки кабинета.
 * Email или полное ФИО; одной фамилии недостаточно.
 */

export type CabinetAdministrationDeputyIdentity = {
  email?: string | null;
  display_name?: string | null;
  full_name?: string | null;
};

export type CabinetAdministrationDeputy = {
  key: 'maisuradze' | 'khoroshilov' | 'basovsky' | 'zenkovich';
  emails: string[];
  display_name: string;
  full_names: string[];
};

export const CABINET_ADMINISTRATION_DEPUTIES: readonly CabinetAdministrationDeputy[] = [
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
];

function collapseSpaces(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePersonName(raw: string | null | undefined): string {
  return collapseSpaces(raw)
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function normEmail(raw: string | null | undefined): string {
  return collapseSpaces(raw).toLowerCase();
}

function identityNames(
  user: CabinetAdministrationDeputyIdentity | null | undefined,
  staffName?: string | null,
): string[] {
  return [
    normalizePersonName(user?.display_name),
    normalizePersonName(user?.full_name),
    normalizePersonName(staffName),
  ].filter(Boolean);
}

export function findCabinetAdministrationDeputy(
  user: CabinetAdministrationDeputyIdentity | null | undefined,
  staffName?: string | null,
): CabinetAdministrationDeputy | null {
  if (!user && !staffName) return null;
  const email = normEmail(user?.email);
  const names = identityNames(user, staffName);
  for (const person of CABINET_ADMINISTRATION_DEPUTIES) {
    if (email && person.emails.includes(email)) return person;
    for (const name of names) {
      if (person.full_names.includes(name)) return person;
    }
  }
  return null;
}

export function isCabinetAdministrationDeputy(
  user: CabinetAdministrationDeputyIdentity | null | undefined,
  staffName?: string | null,
): boolean {
  return Boolean(findCabinetAdministrationDeputy(user, staffName));
}
