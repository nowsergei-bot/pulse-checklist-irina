'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canViewSharedVisitChecklistAnalytics,
  findVisitChecklistAnalyticsPerson,
} = require('./visit-checklist-analytics-access');

test('grants Хорошилов, Майсурадзе, Новожилов, Зенькович, Костюкович by email or listed FIO', () => {
  assert.equal(
    findVisitChecklistAnalyticsPerson({ email: 'khoroshilov@primakov.school' })?.key,
    'khoroshilov',
  );
  assert.equal(
    canViewSharedVisitChecklistAnalytics({ display_name: 'Алексей Александрович Хорошилов' }),
    true,
  );
  assert.equal(
    canViewSharedVisitChecklistAnalytics({ display_name: 'Майсурадзе Майя Отариевна' }),
    true,
  );
  assert.equal(canViewSharedVisitChecklistAnalytics({ email: 'maisuradze@primakov.school' }), true);
  assert.equal(
    canViewSharedVisitChecklistAnalytics({ display_name: 'Новожилов Сергей Валерьевич' }),
    true,
  );
  assert.equal(
    canViewSharedVisitChecklistAnalytics({ email: 'sergey.novogilov@primakov.school' }),
    true,
  );
  assert.equal(
    findVisitChecklistAnalyticsPerson({ display_name: 'Зенькович Наталья Владимировна' })?.key,
    'zenkovich',
  );
  assert.equal(
    canViewSharedVisitChecklistAnalytics({ email: 'zenkovich@primakov.school' }),
    true,
  );
  assert.equal(
    findVisitChecklistAnalyticsPerson({ display_name: 'Костюкович Ирина Сергеевна' })?.key,
    'kostyukovich',
  );
  assert.equal(
    canViewSharedVisitChecklistAnalytics({ email: 'kostyukovich@primakov.school' }),
    true,
  );
  assert.equal(canViewSharedVisitChecklistAnalytics({ display_name: 'Костюкович И.С.' }), true);
  assert.equal(
    findVisitChecklistAnalyticsPerson({ full_name: 'Басовский Виталий Валерьевич' })?.key,
    'basovsky',
  );
  assert.equal(canViewSharedVisitChecklistAnalytics({ email: 'basovsky@primakov.school' }), true);
});

test('does not grant by surname alone or to other staff', () => {
  assert.equal(canViewSharedVisitChecklistAnalytics({ display_name: 'Хорошилов' }), false);
  assert.equal(canViewSharedVisitChecklistAnalytics({ display_name: 'Хорошилов Иван' }), false);
  assert.equal(canViewSharedVisitChecklistAnalytics({ display_name: 'Майсурадзе' }), false);
  assert.equal(canViewSharedVisitChecklistAnalytics({ display_name: 'Новожилов' }), false);
  assert.equal(canViewSharedVisitChecklistAnalytics({ display_name: 'Зенькович' }), false);
  assert.equal(canViewSharedVisitChecklistAnalytics({ display_name: 'Костюкович' }), false);
  assert.equal(
    canViewSharedVisitChecklistAnalytics({ display_name: 'Новожилов Иван Петрович' }),
    false,
  );
  assert.equal(
    canViewSharedVisitChecklistAnalytics({ display_name: 'Волкова Наталья Анатольевна' }),
    false,
  );
  assert.equal(canViewSharedVisitChecklistAnalytics({ role: 'admin' }), false);
});
