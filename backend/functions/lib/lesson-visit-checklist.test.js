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
  buildTeacherUnitMap,
  sanitizeNewTeacherIds,
  loadSeedDirectory,
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

test('buildTeacherUnitMap matches staff by normalized name and keeps every unit', () => {
  const teachers = [
    { id: 't1', name: 'Учитель Первый' },
    { id: 't2', name: 'Учёный Второй' },
    { id: 't3', name: 'Учитель Третий' },
    { id: 't4', name: 'Учитель Четвёртый' },
  ];
  const staff = [
    { full_name: '  учитель  первый ', department: 'Подразделение A' },
    { full_name: 'Ученый Второй', department: 'Подразделение B' },
    { full_name: 'Ученый Второй', department: 'Подразделение A' },
    { full_name: 'Ученый Второй', department: 'Подразделение A' },
    { full_name: 'Учитель Четвертый', department: '' },
    { full_name: '', department: 'Подразделение C' },
  ];
  assert.deepEqual(buildTeacherUnitMap(staff, teachers), {
    t1: ['Подразделение A'],
    t2: ['Подразделение A', 'Подразделение B'],
    t3: [],
    t4: [],
  });
});

test('buildTeacherUnitMap tolerates empty input', () => {
  assert.deepEqual(buildTeacherUnitMap(null, null), {});
  assert.deepEqual(buildTeacherUnitMap([], [{ id: 1, name: 'Учитель' }]), { 1: [] });
});

test('sanitizeNewTeacherIds keeps known ids once, sorted, and rejects bad shapes', () => {
  const teachers = [{ id: 'teacher_2' }, { id: 'teacher_10' }, { id: 'teacher_3' }];
  assert.deepEqual(
    sanitizeNewTeacherIds([' teacher_10', 'teacher_2', 'teacher_2', 'unknown'], teachers),
    ['teacher_2', 'teacher_10'],
  );
  assert.deepEqual(sanitizeNewTeacherIds([], teachers), []);
  assert.equal(sanitizeNewTeacherIds('teacher_2', teachers), null);
  assert.equal(sanitizeNewTeacherIds([1], teachers), null);
  assert.equal(sanitizeNewTeacherIds([''], teachers), null);
  assert.equal(sanitizeNewTeacherIds(['x'.repeat(65)], teachers), null);
  assert.equal(sanitizeNewTeacherIds(new Array(501).fill('teacher_2'), teachers), null);
  assert.deepEqual(sanitizeNewTeacherIds(['teacher_2'], null), []);
});

// --- PUT patch.newTeacherIds: серверная проверка прав ---------------------------------
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'nodemailer') return { createTransport: () => ({ sendMail: async () => ({}) }) };
  return originalLoad.call(this, request, ...rest);
};
const projects = require('../lesson-visit-projects');
Module._load = originalLoad;

function patchPool(ownerId) {
  const calls = [];
  const seedIds = loadSeedDirectory().teachers.slice(0, 3).map((t) => t.id);
  return {
    calls,
    seedIds,
    async query(sql, args) {
      calls.push({ sql, args });
      if (sql.includes('SELECT id, user_id FROM lesson_visit_projects')) return { rows: [{ id: 7, user_id: ownerId }] };
      if (sql.includes('SELECT id, title, state_json')) {
        return { rows: [{ id: 7, title: 'T', state_json: { draft: { directory: { departments: [], teachers: [] } } } }] };
      }
      if (sql.startsWith('UPDATE')) return { rows: [{ id: 7, form_token: 'f', director_share_token: 'd' }] };
      throw new Error(`unexpected sql: ${sql}`);
    },
  };
}
const writes = (pool) => pool.calls.filter((c) => c.sql.trimStart().startsWith('UPDATE'));
const putBody = (value) => ({ body: JSON.stringify(value) });
const analyst = { id: 12, permissions: ['pulse.analytics.all'] };
const plainUser = { id: 13, permissions: [] };

test('patch.newTeacherIds: analyst may change only that field on a shared project', async () => {
  const pool = patchPool(null);
  const ids = [pool.seedIds[1], pool.seedIds[0], pool.seedIds[0], 'not_a_teacher'];
  const r = await projects.handlePutLessonVisitProject(pool, null, false, analyst, 7, putBody({ patch: { newTeacherIds: ids } }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.body).newTeacherIds, [pool.seedIds[0], pool.seedIds[1]].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
  const w = writes(pool);
  assert.equal(w.length, 1);
  assert.match(w[0].sql, /jsonb_build_object\('newTeacherIds'/);
  assert.doesNotMatch(w[0].sql, /updated_at|title|form_token|user_id/);
  assert.equal(JSON.parse(w[0].args[1]).includes('not_a_teacher'), false);
});

test('patch.newTeacherIds: user without analytics rights and not the owner is refused', async () => {
  const pool = patchPool(null);
  const r = await projects.handlePutLessonVisitProject(pool, null, false, plainUser, 7, putBody({ patch: { newTeacherIds: [] } }));
  assert.equal(r.statusCode, 404);
  assert.equal(writes(pool).length, 0);
  const anonymous = await projects.handlePutLessonVisitProject(patchPool(null), null, false, null, 7, putBody({ patch: { newTeacherIds: [] } }));
  assert.equal(anonymous.statusCode, 403);
});

test('patch.newTeacherIds: analyst cannot patch a project owned by another user', async () => {
  const pool = patchPool(99);
  const r = await projects.handlePutLessonVisitProject(pool, null, false, analyst, 7, putBody({ patch: { newTeacherIds: [] } }));
  assert.equal(r.statusCode, 404);
  assert.equal(writes(pool).length, 0);
});

test('patch.newTeacherIds: owner and API key keep their existing right to write', async () => {
  const owned = patchPool(13);
  assert.equal((await projects.handlePutLessonVisitProject(owned, null, false, plainUser, 7, putBody({ patch: { newTeacherIds: [] } }))).statusCode, 200);
  const keyed = patchPool(null);
  assert.equal((await projects.handlePutLessonVisitProject(keyed, null, true, null, 7, putBody({ patch: { newTeacherIds: [] } }))).statusCode, 200);
});

test('patch mode accepts nothing but newTeacherIds', async () => {
  for (const body of [
    { patch: { newTeacherIds: [], title: 'x' } },
    { patch: { title: 'x' } },
    { patch: { checklist: null } },
    { patch: {} },
    { patch: null },
    { patch: { newTeacherIds: 'teacher_1' } },
    { patch: { newTeacherIds: [] }, draft: { title: 'x' } },
    { patch: { newTeacherIds: [] }, title: 'x' },
  ]) {
    const pool = patchPool(null);
    const r = await projects.handlePutLessonVisitProject(pool, null, false, analyst, 7, putBody(body));
    assert.equal(r.statusCode, 400, JSON.stringify(body));
    assert.equal(writes(pool).length, 0);
  }
});

test('analytics rights alone still do not allow a full project write', async () => {
  const pool = patchPool(null);
  const r = await projects.handlePutLessonVisitProject(pool, null, false, analyst, 7, putBody({ draft: { title: 'x' } }));
  assert.equal(r.statusCode, 404);
  assert.equal(writes(pool).length, 0);
});
