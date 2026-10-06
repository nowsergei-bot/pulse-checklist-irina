'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  VISIT_CHECKLIST_TITLE,
  displayVisitChecklistTitle,
  ensureVisitFormatSelfAnalysis,
  ensureSubjectSelectFromSeed,
  normalizeSavedChecklist,
  resolvePublicLessonVisitDirectory,
} = require('./lesson-visit-checklist');

test('displayVisitChecklistTitle strips 4.0 from user-visible names', () => {
  assert.equal(displayVisitChecklistTitle('Чек-лист 4.0'), VISIT_CHECKLIST_TITLE);
  assert.equal(displayVisitChecklistTitle('Чек-лист посещения урока 4.0'), 'Чек-лист посещения урока');
  assert.equal(displayVisitChecklistTitle('Чек-лист посещения урока'), 'Чек-лист посещения урока');
  assert.equal(displayVisitChecklistTitle(''), VISIT_CHECKLIST_TITLE);
});

test('ensureSubjectSelectFromSeed upgrades stale text subject to seed select options', () => {
  const stale = {
    v: 1,
    generalFields: [{ id: 'subject', label: 'Предмет', type: 'text', required: true }],
    sections: [],
  };
  const patched = ensureSubjectSelectFromSeed(stale);
  const subject = patched.generalFields.find((f) => f.id === 'subject');
  assert.equal(subject.type, 'select');
  assert.ok(Array.isArray(subject.options));
  assert.ok(subject.options.length >= 35);
  assert.ok(subject.options.includes('Алгебра'));
  assert.ok(subject.options.includes('Информатика'));
});

test('normalizeSavedChecklist patches visit format and subject together', () => {
  const stale = {
    v: 1,
    generalFields: [
      { id: 'visit_format', label: 'Формат посещения урока', type: 'radio', options: ['очно', 'онлайн'] },
      { id: 'subject', label: 'Предмет', type: 'text', required: true },
    ],
    sections: [],
  };
  const patched = normalizeSavedChecklist(stale);
  assert.ok(patched.generalFields.find((f) => f.id === 'visit_format').options.includes('Самоанализ'));
  assert.equal(patched.generalFields.find((f) => f.id === 'subject').type, 'select');
});

test('resolvePublicLessonVisitDirectory prefers seed roster over stale DB snapshot', () => {
  const stale = {
    departments: [{ id: 'dept_old', name: 'Старая кафедра' }],
    teachers: [{ id: 'teacher_old', name: 'Старый Педагог', departmentId: 'dept_old' }],
  };
  const seed = {
    departments: [{ id: 'dept_9', name: 'Международный департамент' }],
    teachers: [{ id: 'teacher_1', name: 'Паньокколо Даниэль Фрэнсис', departmentId: 'dept_9' }],
  };
  const resolved = resolvePublicLessonVisitDirectory(stale, seed);
  assert.equal(resolved.teachers[0].name, 'Паньокколо Даниэль Фрэнсис');
  assert.equal(resolved.departments[0].id, 'dept_9');
});

test('ensureVisitFormatSelfAnalysis adds Самоанализ without duplicating', () => {
  const patched = ensureVisitFormatSelfAnalysis({
    v: 1,
    generalFields: [{ id: 'visit_format', label: 'Формат посещения урока', type: 'radio', options: ['очно', 'онлайн'] }],
    sections: [],
  });
  assert.deepEqual(patched.generalFields[0].options, ['очно', 'онлайн', 'Самоанализ']);
  const again = ensureVisitFormatSelfAnalysis(patched);
  assert.deepEqual(again.generalFields[0].options, ['очно', 'онлайн', 'Самоанализ']);
});

function draftWith(sections, options, extra = {}) {
  return {
    state_json: {
      draft: {
        checklist: {
          generalFields: [{ id: 'visit_format', options }],
          sections: Array.from({ length: sections }, (_, i) => ({ id: `s${i + 1}` })),
        },
      },
    },
    ...extra,
  };
}

test('pickLatestSharedVisitChecklist prefers 10-block rubric over a newer 9-block', () => {
  const { pickLatestSharedVisitChecklist } = require('./lesson-visit-checklist');
  const nine = draftWith(9, ['очно', 'онлайн', 'Самоанализ'], {
    id: 9,
    form_token: 'old9',
    created_at: '2026-09-08T00:00:00.000Z',
    updated_at: '2026-09-08T12:00:00.000Z',
  });
  const ten = draftWith(10, ['очно', 'онлайн', 'Самоанализ'], {
    id: 3,
    form_token: 'new10',
    created_at: '2026-09-07T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  });
  const picked = pickLatestSharedVisitChecklist([nine, ten]);
  assert.equal(picked.form_token, 'new10');
  assert.equal(picked.id, 3);
});

test('pickLatestSharedVisitChecklist uses created_at then id, not updated_at', () => {
  const { pickLatestSharedVisitChecklist } = require('./lesson-visit-checklist');
  const older = draftWith(10, ['очно', 'онлайн', 'Самоанализ'], {
    id: 2,
    form_token: 'older',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-08T00:00:00.000Z',
  });
  const newer = draftWith(10, ['очно', 'онлайн', 'Самоанализ'], {
    id: 4,
    form_token: 'newer',
    created_at: '2026-09-07T00:00:00.000Z',
    updated_at: '2026-09-07T00:00:00.000Z',
  });
  assert.equal(pickLatestSharedVisitChecklist([older, newer]).form_token, 'newer');
  const sameTimeLow = draftWith(10, ['очно', 'онлайн', 'Самоанализ'], {
    id: 5,
    form_token: 'low',
    created_at: '2026-09-07T00:00:00.000Z',
  });
  const sameTimeHigh = draftWith(10, ['очно', 'онлайн', 'Самоанализ'], {
    id: 8,
    form_token: 'high',
    created_at: '2026-09-07T00:00:00.000Z',
  });
  assert.equal(pickLatestSharedVisitChecklist([sameTimeLow, sameTimeHigh]).form_token, 'high');
});
