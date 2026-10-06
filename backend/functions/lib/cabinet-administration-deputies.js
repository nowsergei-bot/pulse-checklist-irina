'use strict';

const { matchesAllowlistedIdentity } = require('./identity-allowlist');

/** Директор и заместители — расширенные кнопки кабинета. */
const CABINET_ADMINISTRATION_DEPUTIES = [
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

function findCabinetAdministrationDeputy(user, staffName) {
  if (!user && !staffName) return null;
  for (const person of CABINET_ADMINISTRATION_DEPUTIES) {
    if (matchesAllowlistedIdentity(user, staffName, person)) return person;
  }
  return null;
}

function isCabinetAdministrationDeputy(user, staffName) {
  return Boolean(findCabinetAdministrationDeputy(user, staffName));
}

module.exports = {
  CABINET_ADMINISTRATION_DEPUTIES,
  findCabinetAdministrationDeputy,
  isCabinetAdministrationDeputy,
};
