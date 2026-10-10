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

const access = require('./visit-checklist-analytics-access');

// Условные адреса: настоящие почты в тестах не используются.
const DIRECTOR_MAIL = 'director.test@example.test';
const OTHER_MAIL = 'other.test@example.test';

function patchPool(ownerId, storedList) {
  const calls = [];
  const seedIds = loadSeedDirectory().teachers.slice(0, 3).map((t) => t.id);
  const draft = { directory: { departments: [], teachers: [] } };
  if (storedList) draft.newTeacherIds = storedList;
  return {
    calls,
    seedIds,
    async query(sql, args) {
      calls.push({ sql, args });
      if (sql.includes('SELECT id, user_id FROM lesson_visit_projects')) return { rows: [{ id: 7, user_id: ownerId }] };
      if (sql.includes('SELECT id, title, state_json, created_at')) {
        return { rows: [{ id: 7, title: 'T', state_json: { draft }, form_token: 'f', director_share_token: 'd' }] };
      }
      if (sql.includes('SELECT id, title, state_json')) return { rows: [{ id: 7, title: 'T', state_json: { draft } }] };
      if (sql.includes('COUNT(*)')) return { rows: [{ c: 0 }] };
      if (sql.startsWith('UPDATE')) return { rows: [{ id: 7, form_token: 'f', director_share_token: 'd' }] };
      throw new Error(`unexpected sql: ${sql}`);
    },
  };
}
const writes = (pool) => pool.calls.filter((c) => c.sql.trimStart().startsWith('UPDATE'));
const putBody = (value) => ({ body: JSON.stringify(value) });
const director = { id: 12, email: DIRECTOR_MAIL.toUpperCase(), permissions: ['pulse.analytics.all'] };
const analyst = { id: 14, email: OTHER_MAIL, permissions: ['pulse.analytics.all'] };
const plainUser = { id: 13, email: 'plain.test@example.test', permissions: [] };

function withDirectorAccess(fn) {
  return async () => {
    access.DIRECTOR_SUMMARY_ACCESS.emails.push(DIRECTOR_MAIL);
    try {
      await fn();
    } finally {
      access.DIRECTOR_SUMMARY_ACCESS.emails.length = 0;
    }
  };
}

test('canUseDirectorSummary: by session email only, closed by default', () => {
  const { canUseDirectorSummary, VISIT_CHECKLIST_ANALYTICS_PEOPLE } = access;
  const listed = { personKeys: [], emails: ['Director.Test@Example.test'] };
  assert.equal(canUseDirectorSummary({ email: DIRECTOR_MAIL }, listed), true);
  assert.equal(canUseDirectorSummary({ email: `  ${DIRECTOR_MAIL.toUpperCase()} ` }, listed), true);
  assert.equal(canUseDirectorSummary({ email: OTHER_MAIL }, listed), false);
  assert.equal(canUseDirectorSummary(null, listed), false);
  assert.equal(canUseDirectorSummary({}, listed), false);
  assert.equal(canUseDirectorSummary({ email: '' }, { personKeys: [], emails: [''] }), false);
  // право аналитики, ФИО и id доступа не дают
  assert.equal(canUseDirectorSummary({ id: 12, permissions: ['*'], display_name: 'Director Test' }, listed), false);
  // по умолчанию открыто только двум записям из файла, по их почте; чужая почта и права аналитики не помогают
  assert.deepEqual(access.DIRECTOR_SUMMARY_ACCESS.personKeys, ['maisuradze', 'kostyukovich']);
  assert.deepEqual(access.DIRECTOR_SUMMARY_ACCESS.emails, []);
  assert.deepEqual(access.DIRECTOR_SUMMARY_ACCESS.userIds, []);
  assert.equal(canUseDirectorSummary({ email: DIRECTOR_MAIL, permissions: ['*'] }), false);
  const byEmail = (key) => VISIT_CHECKLIST_ANALYTICS_PEOPLE.find((p) => p.key === key).emails;
  for (const key of ['maisuradze', 'kostyukovich']) {
    for (const email of byEmail(key)) assert.equal(canUseDirectorSummary({ email }), true, email);
  }
  for (const key of VISIT_CHECKLIST_ANALYTICS_PEOPLE.map((p) => p.key).filter((k) => !['maisuradze', 'kostyukovich'].includes(k))) {
    for (const email of byEmail(key)) assert.equal(canUseDirectorSummary({ email, permissions: ['*'] }), false, key);
  }
  // номер учётной записи работает отдельно от почты и не путается с другими номерами
  const byId = { personKeys: [], emails: [], userIds: [4242] };
  assert.equal(canUseDirectorSummary({ id: 4242, email: OTHER_MAIL }, byId), true);
  assert.equal(canUseDirectorSummary({ id: '4242' }, byId), true);
  assert.equal(canUseDirectorSummary({ id: 4243, permissions: ['*'] }, byId), false);
  assert.equal(canUseDirectorSummary({ id: null }, byId), false);
  assert.equal(canUseDirectorSummary({ id: 4242 }, { personKeys: [], emails: [] }), false);
  const names = VISIT_CHECKLIST_ANALYTICS_PEOPLE.find((p) => p.key === 'maisuradze').full_names;
  assert.equal(canUseDirectorSummary({ display_name: names[0], permissions: ['*'] }), false);
  // ключ записи из файла даёт только её почты, не ФИО
  const person = VISIT_CHECKLIST_ANALYTICS_PEOPLE[0];
  const byKey = { personKeys: [person.key], emails: [] };
  assert.equal(canUseDirectorSummary({ email: person.emails[0] }, byKey), true);
  assert.equal(canUseDirectorSummary({ display_name: person.full_names[0] }, byKey), false);
  assert.equal(canUseDirectorSummary({ email: VISIT_CHECKLIST_ANALYTICS_PEOPLE[1].emails[0] }, byKey), false);
});

test('patch.newTeacherIds: listed person may change only that field on a shared project', withDirectorAccess(async () => {
  const pool = patchPool(null);
  const ids = [pool.seedIds[1], pool.seedIds[0], pool.seedIds[0], 'not_a_teacher'];
  const r = await projects.handlePutLessonVisitProject(pool, null, false, director, 7, putBody({ patch: { newTeacherIds: ids } }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.body).newTeacherIds, [pool.seedIds[0], pool.seedIds[1]].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
  const w = writes(pool);
  assert.equal(w.length, 1);
  assert.match(w[0].sql, /jsonb_build_object\('newTeacherIds'/);
  assert.doesNotMatch(w[0].sql, /updated_at|title|form_token|user_id/);
  assert.equal(JSON.parse(w[0].args[1]).includes('not_a_teacher'), false);
}));

test('patch.newTeacherIds: analyst, owner and plain user without the right get 403 and nothing is written', withDirectorAccess(async () => {
  for (const [who, owner] of [[analyst, null], [plainUser, 13], [plainUser, null], [analyst, 14]]) {
    const pool = patchPool(owner);
    const r = await projects.handlePutLessonVisitProject(pool, null, false, who, 7, putBody({ patch: { newTeacherIds: [] } }));
    assert.equal(r.statusCode, 403);
    assert.equal(writes(pool).length, 0);
  }
  const anonymous = await projects.handlePutLessonVisitProject(patchPool(null), null, false, null, 7, putBody({ patch: { newTeacherIds: [] } }));
  assert.equal(anonymous.statusCode, 403);
}));

test('patch.newTeacherIds: API key cannot save the list, even when a listed session is passed along', withDirectorAccess(async () => {
  const keyed = patchPool(null);
  assert.equal((await projects.handlePutLessonVisitProject(keyed, null, true, null, 7, putBody({ patch: { newTeacherIds: [] } }))).statusCode, 403);
  assert.equal((await projects.handlePutLessonVisitProject(keyed, null, true, director, 7, putBody({ patch: { newTeacherIds: [] } }))).statusCode, 403);
  assert.equal(writes(keyed).length, 0);
}));

test('patch.newTeacherIds: closed for everyone when the access list is empty, and for a listed address that does not match', async () => {
  const saved = access.DIRECTOR_SUMMARY_ACCESS.personKeys.splice(0);
  try {
    const pool = patchPool(null);
    const r = await projects.handlePutLessonVisitProject(pool, null, false, director, 7, putBody({ patch: { newTeacherIds: [] } }));
    assert.equal(r.statusCode, 403);
    assert.equal(writes(pool).length, 0);
  } finally {
    access.DIRECTOR_SUMMARY_ACCESS.personKeys.push(...saved);
  }
});

test('patch.newTeacherIds: a person listed by key passes with the address recorded in the access file', async () => {
  const email = access.VISIT_CHECKLIST_ANALYTICS_PEOPLE.find((p) => p.key === 'maisuradze').emails[0];
  const pool = patchPool(null);
  const r = await projects.handlePutLessonVisitProject(pool, null, false, { id: 30, email }, 7, putBody({ patch: { newTeacherIds: [] } }));
  assert.equal(r.statusCode, 200);
  const stranger = await projects.handlePutLessonVisitProject(patchPool(null), null, false, { id: 31, email: OTHER_MAIL, permissions: ['*'] }, 7, putBody({ patch: { newTeacherIds: [] } }));
  assert.equal(stranger.statusCode, 403);
});

test('patch.newTeacherIds: listed person cannot patch a project owned by another user', withDirectorAccess(async () => {
  const pool = patchPool(99);
  const r = await projects.handlePutLessonVisitProject(pool, null, false, director, 7, putBody({ patch: { newTeacherIds: [] } }));
  assert.equal(r.statusCode, 404);
  assert.equal(writes(pool).length, 0);
}));

test('patch mode accepts nothing but newTeacherIds', withDirectorAccess(async () => {
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
    const r = await projects.handlePutLessonVisitProject(pool, null, false, director, 7, putBody(body));
    assert.equal(r.statusCode, 400, JSON.stringify(body));
    assert.equal(writes(pool).length, 0);
  }
}));

test('analytics rights alone still do not allow a full project write', async () => {
  const pool = patchPool(null);
  const r = await projects.handlePutLessonVisitProject(pool, null, false, analyst, 7, putBody({ draft: { title: 'x' } }));
  assert.equal(r.statusCode, 404);
  assert.equal(writes(pool).length, 0);
});

test('full write keeps the stored list for everyone except the listed person', withDirectorAccess(async () => {
  const draft = { title: 'x', newTeacherIds: ['teacher_1'] };
  // владелец без права: список из тела отбрасывается, а в базе остаётся прежний
  const owned = patchPool(13, ['teacher_2']);
  const r = await projects.handlePutLessonVisitProject(owned, null, false, plainUser, 7, putBody({ draft }));
  assert.equal(r.statusCode, 200);
  assert.equal('newTeacherIds' in JSON.parse(r.body).draft, false);
  const [w] = writes(owned);
  assert.equal('newTeacherIds' in JSON.parse(w.args[2]).draft, false);
  assert.match(w.sql, /state_json->'draft'->'newTeacherIds'/);
  // ключ API ведёт себя так же
  const keyed = patchPool(null);
  await projects.handlePutLessonVisitProject(keyed, null, true, null, 7, putBody({ draft }));
  assert.match(writes(keyed)[0].sql, /state_json->'draft'->'newTeacherIds'/);
  // человек из списка пишет черновик как раньше
  const own = patchPool(12);
  const listed = await projects.handlePutLessonVisitProject(own, null, false, director, 7, putBody({ draft }));
  assert.deepEqual(JSON.parse(listed.body).draft.newTeacherIds, ['teacher_1']);
  assert.doesNotMatch(writes(own)[0].sql, /state_json->'draft'->'newTeacherIds'/);
}));

test('project GET: directorSummary flag is computed on the server and the list is hidden from others', withDirectorAccess(async () => {
  const stored = ['teacher_1', 'teacher_2'];
  const get = async (who, viaKey = false, owner = null) => {
    const r = await projects.handleGetLessonVisitProject(patchPool(owner, stored), null, viaKey, who, 7);
    assert.equal(r.statusCode, 200);
    return JSON.parse(r.body);
  };
  const forDirector = await get(director);
  assert.equal(forDirector.directorSummary, true);
  assert.deepEqual(forDirector.draft.newTeacherIds, stored);
  // собственный номер учётной записи отдаётся человеку, ключу API нет
  assert.equal(forDirector.viewerId, 12);
  assert.equal((await get(director, true)).viewerId, null);
  for (const [who, viaKey, owner] of [[analyst, false, null], [plainUser, false, 13], [null, true, null], [director, true, null]]) {
    const body = await get(who, viaKey, owner);
    assert.equal(body.directorSummary, false);
    assert.equal('newTeacherIds' in body.draft, false);
    assert.equal(JSON.stringify(body).includes('newTeacherIds'), false);
  }
}));

test('project POST does not let an unlisted author set the list', withDirectorAccess(async () => {
  const create = async (who) => {
    const client = { async query(sql) { return sql.includes('INSERT INTO lesson_visit_projects') ? { rows: [{ id: 5, title: 'T', form_token: 'f', director_share_token: 'd' }] } : { rows: [{ id: 6, director_share_token: 'x' }] }; }, release() {} };
    const pool = { connect: async () => client };
    const r = await projects.handlePostLessonVisitProject(pool, null, false, who, putBody({ draft: { title: 'x', newTeacherIds: ['teacher_1'] } }));
    assert.equal(r.statusCode, 201);
    return JSON.parse(r.body).draft;
  };
  assert.equal('newTeacherIds' in (await create(analyst)), false);
  assert.deepEqual((await create(director)).newTeacherIds, ['teacher_1']);
}));
