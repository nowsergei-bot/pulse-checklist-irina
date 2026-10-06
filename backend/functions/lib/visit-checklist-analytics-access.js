'use strict';

const { matchesAllowlistedIdentity } = require('./identity-allowlist');

/** Хорошилов, Майсурадзе, Новожилов, Зенькович, Костюкович — аналитика чек-листа. */
const VISIT_CHECKLIST_ANALYTICS_PEOPLE = [
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
    key: 'kostyukovich',
    emails: ['kostyukovich@primakov.school', 'kostukovich@primakov.school'],
    display_name: 'Костюкович Ирина Сергеевна',
    full_names: [
      'костюкович ирина сергеевна',
      'ирина сергеевна костюкович',
      'костюкович ирина',
      'ирина костюкович',
      'костюкович и.с.',
      'костюкович и. с.',
    ],
  },
];

function findVisitChecklistAnalyticsPerson(user, extraName) {
  if (!user && !extraName) return null;
  for (const person of VISIT_CHECKLIST_ANALYTICS_PEOPLE) {
    if (matchesAllowlistedIdentity(user, extraName, person)) return person;
  }
  return null;
}

function canViewSharedVisitChecklistAnalytics(user, extraName) {
  return Boolean(user?.permissions?.includes('*')||user?.permissions?.includes('pulse.analytics.all')||user?.permissions?.includes('pulse.director.checklist')||findVisitChecklistAnalyticsPerson(user, extraName));
}

function visitChecklistAnalyticsActor(user, sessionUser) {
  return sessionUser || user || null;
}

module.exports = {
  VISIT_CHECKLIST_ANALYTICS_PEOPLE,
  findVisitChecklistAnalyticsPerson,
  canViewSharedVisitChecklistAnalytics,
  visitChecklistAnalyticsActor,
};
