'use strict';

const { matchesAllowlistedIdentity, normalizeAllowlistEmail } = require('./identity-allowlist');

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

/**
 * Кому открыт экран «Сводка для директора» и сохранение списка новых учителей.
 * personKeys: ключи записей из VISIT_CHECKLIST_ANALYTICS_PEOPLE (берутся только их почты, ФИО не используется).
 * emails: отдельные служебные адреса (новых адресов не добавляем).
 * userIds: числовые номера учётных записей Пульса (внутренний номер, не личные данные).
 * Если все списки пусты, экран закрыт для всех.
 * Сейчас: директор (maisuradze) и, временно на время настройки, Костюкович И.С. (kostyukovich); потом её ключ убирается.
 */
const DIRECTOR_SUMMARY_ACCESS = { personKeys: ['maisuradze', 'kostyukovich'], emails: [], userIds: [] };

function directorSummaryEmails(access) {
  const fromPeople = VISIT_CHECKLIST_ANALYTICS_PEOPLE
    .filter((p) => access.personKeys.includes(p.key))
    .flatMap((p) => p.emails);
  return [...fromPeople, ...access.emails].map(normalizeAllowlistEmail).filter(Boolean);
}

/** Только по номеру учётной записи или почте из серверной сессии; без сессии, по ФИО или по правам аналитики доступа нет. */
function canUseDirectorSummary(sessionUser, access = DIRECTOR_SUMMARY_ACCESS) {
  const id = sessionUser?.id;
  if (id != null && Number.isFinite(Number(id)) && (access.userIds || []).map(Number).includes(Number(id))) return true;
  const email = normalizeAllowlistEmail(sessionUser?.email);
  return Boolean(email) && directorSummaryEmails(access).includes(email);
}

module.exports = {
  DIRECTOR_SUMMARY_ACCESS,
  canUseDirectorSummary,
  VISIT_CHECKLIST_ANALYTICS_PEOPLE,
  findVisitChecklistAnalyticsPerson,
  canViewSharedVisitChecklistAnalytics,
  visitChecklistAnalyticsActor,
};
