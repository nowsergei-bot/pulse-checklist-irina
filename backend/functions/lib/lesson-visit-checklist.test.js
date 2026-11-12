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
  applyTeacherAliases,
  teacherAliasKey,
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
  assert.equal(canUseDirectorSummary({ id: 12, permissions: ['pulse.analytics.all', 'pulse.director.checklist'], display_name: 'Director Test' }, listed), false);
  // право «*» (полный доступ администратора) открывает экран и без списков
  assert.equal(canUseDirectorSummary({ id: 12, permissions: ['*'] }, { personKeys: [], emails: [], userIds: [] }), true);
  assert.equal(canUseDirectorSummary({ permissions: ['x', '*'] }, { personKeys: [], emails: [] }), true);
  assert.equal(canUseDirectorSummary({ permissions: '*' }, { personKeys: [], emails: [] }), false);
  // по умолчанию открыто только двум записям из файла, по их почте; чужая почта и права аналитики не помогают
  assert.deepEqual(access.DIRECTOR_SUMMARY_ACCESS.personKeys, ['maisuradze', 'kostyukovich']);
  assert.deepEqual(access.DIRECTOR_SUMMARY_ACCESS.emails, []);
  assert.deepEqual(access.DIRECTOR_SUMMARY_ACCESS.userIds, [52, 97, 30]);
  assert.equal(canUseDirectorSummary({ id: 52 }), true);
  assert.equal(canUseDirectorSummary({ id: '52' }), true);
  assert.equal(canUseDirectorSummary({ id: 97 }), true);
  assert.equal(canUseDirectorSummary({ id: 98, permissions: ['pulse.analytics.all', 'pulse.director.checklist'] }), false);
  assert.equal(canUseDirectorSummary({ id: 98, permissions: ['*'] }), true);
  assert.equal(canUseDirectorSummary({ id: 53, permissions: ['pulse.director.checklist'] }), false);
  assert.equal(canUseDirectorSummary({ email: DIRECTOR_MAIL, permissions: ['pulse.analytics.all', 'pulse.director.checklist'] }), false);
  const byEmail = (key) => VISIT_CHECKLIST_ANALYTICS_PEOPLE.find((p) => p.key === key).emails;
  for (const key of ['maisuradze', 'kostyukovich']) {
    for (const email of byEmail(key)) assert.equal(canUseDirectorSummary({ email }), true, email);
  }
  for (const key of VISIT_CHECKLIST_ANALYTICS_PEOPLE.map((p) => p.key).filter((k) => !['maisuradze', 'kostyukovich'].includes(k))) {
    for (const email of byEmail(key)) assert.equal(canUseDirectorSummary({ email, permissions: ['pulse.analytics.all', 'pulse.director.checklist'] }), false, key);
  }
  // номер учётной записи работает отдельно от почты и не путается с другими номерами
  const byId = { personKeys: [], emails: [], userIds: [4242] };
  assert.equal(canUseDirectorSummary({ id: 4242, email: OTHER_MAIL }, byId), true);
  assert.equal(canUseDirectorSummary({ id: '4242' }, byId), true);
  assert.equal(canUseDirectorSummary({ id: 4243, permissions: ['pulse.director.checklist'] }, byId), false);
  assert.equal(canUseDirectorSummary({ id: null }, byId), false);
  assert.equal(canUseDirectorSummary({ id: 4242 }, { personKeys: [], emails: [] }), false);
  const names = VISIT_CHECKLIST_ANALYTICS_PEOPLE.find((p) => p.key === 'maisuradze').full_names;
  assert.equal(canUseDirectorSummary({ display_name: names[0], permissions: ['pulse.analytics.all', 'pulse.director.checklist'] }), false);
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
  const stranger = await projects.handlePutLessonVisitProject(patchPool(null), null, false, { id: 31, email: OTHER_MAIL, permissions: ['pulse.analytics.all', 'pulse.director.checklist'] }, 7, putBody({ patch: { newTeacherIds: [] } }));
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

test('project GET and PATCH with the default list: both listed accounts are opened by number, others are not', async () => {
  const get = async (who) => {
    const r = await projects.handleGetLessonVisitProject(patchPool(null, ['teacher_1']), null, false, who, 7);
    assert.equal(r.statusCode, 200);
    return JSON.parse(r.body);
  };
  for (const id of [52, 97, 30]) {
    const body = await get({ id, email: OTHER_MAIL, permissions: ['pulse.analytics.all'] });
    assert.equal(body.directorSummary, true, String(id));
    assert.equal(body.viewerId, id);
    assert.deepEqual(body.draft.newTeacherIds, ['teacher_1']);
    const pool = patchPool(null);
    const r = await projects.handlePutLessonVisitProject(pool, null, false, { id, permissions: ['pulse.analytics.all'] }, 7, putBody({ patch: { newTeacherIds: [] } }));
    assert.equal(r.statusCode, 200, String(id));
  }
  for (const id of [51, 53, 96, 98]) {
    const body = await get({ id, email: OTHER_MAIL, permissions: ['pulse.analytics.all', 'pulse.director.checklist'] });
    assert.equal(body.directorSummary, false, String(id));
    assert.equal(JSON.stringify(body).includes('newTeacherIds'), false);
    const pool = patchPool(null);
    const r = await projects.handlePutLessonVisitProject(pool, null, false, { id, permissions: ['pulse.analytics.all', 'pulse.director.checklist'] }, 7, putBody({ patch: { newTeacherIds: [] } }));
    assert.equal(r.statusCode, 403, String(id));
  }
  // администратор с правом «*» не из списка: экран и сохранение открыты, ключ API по-прежнему нет
  const admin = { id: 77, email: OTHER_MAIL, permissions: ['*'] };
  const adminBody = await get(admin);
  assert.equal(adminBody.directorSummary, true);
  assert.deepEqual(adminBody.draft.newTeacherIds, ['teacher_1']);
  const adminPool = patchPool(null);
  assert.equal((await projects.handlePutLessonVisitProject(adminPool, null, false, admin, 7, putBody({ patch: { newTeacherIds: [] } }))).statusCode, 200);
  const viaKey = await projects.handleGetLessonVisitProject(patchPool(null, ['teacher_1']), null, true, admin, 7);
  assert.equal(JSON.parse(viaKey.body).directorSummary, false);
});

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

// --- Форма 4.1 (с 09.11.2026) и временное отключение отправки отчётов учителям ---
const fs = require('fs');
const path = require('path');
const { ensureChecklistFormV41 } = require('./lesson-visit-checklist');

const oldForm = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../frontend/src/lib/lessonVisitChecklist/formV4.fixture.json'), 'utf8'),
);

test('ensureChecklistFormV41 brings a saved v4 form to 4.1 and keeps question ids', () => {
  const saved = JSON.parse(JSON.stringify(oldForm));
  saved.generalFields.push({ id: 'custom_note', label: 'Своё поле', type: 'text', required: false });
  const next = ensureChecklistFormV41(saved);
  const questions = next.sections.flatMap((s) => s.questions);
  const oldId = (code) => oldForm.sections.flatMap((s) => s.questions).find((q) => q.code === code).id;
  assert.equal(next.formVersion, '4.1');
  assert.equal(next.sections.length, 12);
  assert.equal(questions.find((q) => q.code === '10.1').id, oldId('3.8'));
  assert.equal(questions.find((q) => q.code === '12.1').id, oldId('10.1'));
  assert.equal(questions.find((q) => q.code === '12.2').id, oldId('10.2'));
  assert.deepEqual(next.legacyQuestions.map((q) => [q.id, q.legacyCode]), [[oldId('10.3'), '10.3']]);
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
  assert.ok(next.generalFields.some((f) => f.id === 'custom_note'));
  assert.equal(next.generalFields.find((f) => f.id === 'lesson_type').type, 'select');
  assert.ok(next.generalFields.find((f) => f.id === 'visit_format').options.includes('Самоанализ'));
  assert.equal(ensureChecklistFormV41(next), next);
  const normalized = normalizeSavedChecklist(JSON.parse(JSON.stringify(oldForm)));
  assert.equal(normalized.formVersion, '4.1');
});

test('frontend and backend seed copies are identical', () => {
  const a = fs.readFileSync(path.join(__dirname, '../data/visit-checklist-default-seed.json'), 'utf8');
  const b = fs.readFileSync(path.join(__dirname, '../../../frontend/src/lib/lessonVisitChecklist/defaultSeed.json'), 'utf8');
  assert.equal(a, b);
});

test('sending a visit report to a teacher is rejected while sending is switched off', async () => {
  const delivery = require('./visit-report-delivery');
  assert.equal(delivery.TEACHER_FEEDBACK_SENDING_ENABLED, false);
  let touched = false;
  const service = delivery.createDeliveryService({
    repository: new Proxy({}, { get: () => { touched = true; return async () => null; } }),
    readLesson: async () => { touched = true; return null; },
    authorize: async () => {},
    canonicalHash: () => 'x',
  });
  await assert.rejects(service.send({}, { id: 1 }, 'snap', 'key'), (error) => {
    assert.equal(error.httpStatus, 403);
    assert.equal(error.publicError, 'Отправка обратной связи учителям временно недоступна');
    return true;
  });
  assert.equal(touched, false);
});

test('dashboard filter accepts any available maximum from 1 to 100', () => {
  const { normalizeFilters } = require('./visit-checklist-dashboard-filters');
  for (const maximum of ['100', '94', '92', '91', '89', '5']) {
    assert.equal(normalizeFilters({ maximum, period: 'all_time' }, new Date('2026-11-20T12:00:00Z')).maximum, maximum);
  }
  for (const maximum of ['0', '101', '9.5', 'abc']) {
    assert.throws(() => normalizeFilters({ maximum, period: 'all_time' }, new Date('2026-11-20T12:00:00Z')));
  }
});

// --- Чек-лист феноменального урока ------------------------------------------------
{
const {
  PHENOMENON_FORM_TOKEN,
  PHENOMENON_CHOICES,
  isPhenomenonRow,
  validatePhenomenonSubmission,
  phenomenonDraft,
} = require('./lesson-visit-checklist').phenomenon;
const phenomenonLib = require('./lesson-visit-checklist').phenomenon;
const { VISIT_CHECKLIST_ANALYTICS_PEOPLE } = require('./visit-checklist-analytics-access');

/** Временно открывает или закрывает форму для теста и возвращает прежнее значение. */
async function withOpen(open, fn) {
  const before = phenomenonLib.phenomenonAccess.openForAll;
  phenomenonLib.phenomenonAccess.openForAll = open;
  try {
    return await fn();
  } finally {
    phenomenonLib.phenomenonAccess.openForAll = before;
  }
}

/** Сотрудник из существующей записи списка аналитики, по ключу (почта берётся из кода сервера). */
function personByKey(key, extra = {}) {
  const person = VISIT_CHECKLIST_ANALYTICS_PEOPLE.find((p) => p.key === key);
  assert.ok(person, key);
  return { id: 900, role: 'methodist', permissions: [], email: person.emails[0], ...extra };
}
const { pickLatestSharedVisitChecklist, visitChecklistLatestScore } = require('./lesson-visit-checklist');

const MAX_ANSWERS = {
  ph_org: 'full',
  ph_objectives: 'students',
  ph_method: 'varied',
  ph_phenomenon: 'students_link',
  ph_coteaching: 'complement',
  ph_tools: 'high',
  ph_reflection: 'meaningful',
  ph_engagement: 'all',
  ph_communication: 'good',
  ph_overall: 'very_high',
  ph_mastery_1: '9',
  ph_mastery_2: '8',
};

const GENERAL = {
  date: '2026-11-16',
  observer_name: 'Наблюдатель Тестовый',
  class_name: '8А',
  students_count: '24',
  lesson_number: '3',
  teacher1_id: 't1',
  teacher1_name: 'Педагог Первый',
  teacher2_id: 't2',
  teacher2_name: 'Педагог Второй',
};

test('phenomenon submission: valid answers pass, comments optional', () => {
  const r = validatePhenomenonSubmission(GENERAL, MAX_ANSWERS);
  assert.equal(r.ok, true);
  assert.equal(r.general.kind, 'phenomenon');
  assert.equal(r.answers.ph_comments, undefined);
  const withComments = validatePhenomenonSubmission(GENERAL, { ...MAX_ANSWERS, ph_comments: '  Вывод  ' });
  assert.equal(withComments.answers.ph_comments, 'Вывод');
});

test('phenomenon submission: every required field is checked', () => {
  for (const key of ['date', 'observer_name', 'class_name', 'students_count', 'lesson_number', 'teacher1_name', 'teacher2_name']) {
    const r = validatePhenomenonSubmission({ ...GENERAL, [key]: '' }, MAX_ANSWERS);
    assert.equal(r.ok, false, key);
    assert.ok(r.missing.includes(key), key);
  }
  for (const key of Object.keys(MAX_ANSWERS)) {
    const answers = { ...MAX_ANSWERS };
    delete answers[key];
    const r = validatePhenomenonSubmission(GENERAL, answers);
    assert.equal(r.ok, false, key);
    assert.ok(r.missing.includes(key), key);
  }
  assert.equal(validatePhenomenonSubmission(GENERAL, { ...MAX_ANSWERS, ph_org: 'другое' }).ok, false);
  assert.equal(validatePhenomenonSubmission(GENERAL, { ...MAX_ANSWERS, ph_mastery_1: '11' }).ok, false);
});

test('phenomenon submission: the same teacher cannot be first and second', () => {
  const sameId = validatePhenomenonSubmission({ ...GENERAL, teacher2_id: 't1' }, MAX_ANSWERS);
  assert.equal(sameId.ok, false);
  const sameName = validatePhenomenonSubmission(
    { ...GENERAL, teacher2_id: '', teacher2_name: ' педагог  первый ' },
    MAX_ANSWERS,
  );
  assert.equal(sameName.ok, false);
});

test('phenomenon project never becomes the main shared checklist', () => {
  const row = { id: 99, form_token: PHENOMENON_FORM_TOKEN, created_at: '2026-11-16', state_json: { draft: phenomenonDraft() } };
  assert.equal(isPhenomenonRow(row), true);
  assert.equal(visitChecklistLatestScore(row.state_json.draft), 0);
  assert.equal(pickLatestSharedVisitChecklist([row]), null);
});

test('backend choice ids match the frontend form definition', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../../frontend/src/lib/lessonVisitChecklist/publicForm.ts'), 'utf8');
  for (const [itemId, options] of Object.entries(PHENOMENON_CHOICES)) {
    const at = src.indexOf(`id: '${itemId}'`);
    assert.ok(at >= 0, itemId);
    const next = src.indexOf("kind: 'choice'", src.indexOf("kind: 'choice'", at) + 1);
    const block = src.slice(at, next > 0 ? next : undefined);
    const ids = [...block.matchAll(/id: '([a-z_]+)',\s*score/g)].map((m) => m[1]);
    assert.deepEqual(ids, options, itemId);
  }
  assert.match(src, new RegExp(`PHENOMENON_FORM_TOKEN = '${PHENOMENON_FORM_TOKEN}'`));
});

/** Поддельная БД: проекты и ответы в памяти, учёт обращений к аналитике основного чек-листа. */
function fakePool() {
  const projects = [
    { id: 1, user_id: null, title: 'Чек-лист посещения урока', form_token: 'main-token', director_share_token: 'd1', state_json: { draft: { checklist: null } }, updated_at: 'x' },
  ];
  const responses = [];
  const queries = [];
  return {
    projects,
    responses,
    queries,
    async query(sql, params = []) {
      queries.push(sql);
      if (/^\s*SELECT id, title, state_json, updated_at, form_token, director_share_token\s+FROM lesson_visit_projects WHERE form_token = \$1/.test(sql)) {
        return { rows: projects.filter((p) => p.form_token === params[0]) };
      }
      if (/INSERT INTO lesson_visit_projects/.test(sql)) {
        if (!projects.some((p) => p.form_token === params[2])) {
          projects.push({ id: projects.length + 1, user_id: null, title: params[0], state_json: JSON.parse(params[1]), form_token: params[2], director_share_token: params[3], updated_at: 'y' });
        }
        return { rows: [] };
      }
      if (/INSERT INTO lesson_visit_responses/.test(sql)) {
        const row = { id: responses.length + 1, project_id: params[0], answers_json: JSON.parse(params[1]), created_at: '2026-11-16T10:00:00Z' };
        responses.push(row);
        return { rows: [row] };
      }
      if (/UPDATE lesson_visit_projects SET updated_at/.test(sql)) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

test('phenomenon form: GET creates one shared project, POST stores only there and skips main analytics', () => withOpen(true, async () => {
  const handlers = require('../lesson-visit-projects');
  const pool = fakePool();

  const get1 = await handlers.handleGetPublicLessonVisitForm(pool, PHENOMENON_FORM_TOKEN);
  assert.equal(get1.statusCode, 200);
  const body = JSON.parse(get1.body);
  assert.equal(body.checklist.kind, 'phenomenon');
  await handlers.handleGetPublicLessonVisitForm(pool, PHENOMENON_FORM_TOKEN);
  assert.equal(pool.projects.length, 2, 'one extra project only');
  const ph = pool.projects.find((p) => p.form_token === PHENOMENON_FORM_TOKEN);
  assert.equal(ph.user_id, null);
  assert.equal(body.project.id, ph.id);

  const bad = await handlers.handlePostPublicLessonVisitResponse(pool, PHENOMENON_FORM_TOKEN, {
    body: JSON.stringify({ general: GENERAL, answers: { ...MAX_ANSWERS, ph_overall: '' } }),
  });
  assert.equal(bad.statusCode, 400);
  assert.equal(pool.responses.length, 0);

  const ok = await handlers.handlePostPublicLessonVisitResponse(pool, PHENOMENON_FORM_TOKEN, {
    body: JSON.stringify({ general: GENERAL, answers: MAX_ANSWERS }),
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(pool.responses.length, 1);
  assert.equal(pool.responses[0].project_id, ph.id);
  assert.notEqual(pool.responses[0].project_id, 1);
  // Ни одного обращения к таблицам аналитики основного чек-листа (v3, снимок, карточки).
  const touched = pool.queries.join('\n');
  assert.doesNotMatch(touched, /pulse_v3|lesson_visit_teacher_cards|lesson_visit_cloud|lesson_visit_v3/i);
}));

function withListQueries(pool) {
  const base = pool.query.bind(pool);
  pool.query = async (sql, params = []) => {
    if (/SELECT id, user_id FROM lesson_visit_projects WHERE id = \$1/.test(sql)) {
      return { rows: pool.projects.filter((p) => p.id === Number(params[0])).map((p) => ({ id: p.id, user_id: p.user_id })) };
    }
    // New production visibility checks load department grants and the project directory.
    if (/FROM pulse_visit_report_grants/.test(sql)) return { rows: [] };
    if (/SELECT (?:id,)?state_json FROM lesson_visit_projects WHERE id\s*=\s*\$1/.test(sql)) {
      return { rows: pool.projects.filter((p) => p.id === Number(params[0])).map((p) => ({ id: p.id, state_json: p.state_json })) };
    }
    if (/SELECT form_token FROM lesson_visit_projects WHERE id = \$1/.test(sql)) {
      return { rows: pool.projects.filter((p) => p.id === Number(params[0])).map((p) => ({ form_token: p.form_token })) };
    }
    if (/FROM lesson_visit_responses\s+WHERE project_id = \$1/.test(sql)) {
      return { rows: pool.responses.filter((r) => r.project_id === params[0]) };
    }
    return base(sql, params);
  };
  return pool;
}

test('results of the phenomenon checklist: only the main checklist analytics group gets them', () => withOpen(true, async () => {
  const handlers = require('../lesson-visit-projects');
  const pool = fakePool();
  await handlers.handleGetPublicLessonVisitForm(pool, PHENOMENON_FORM_TOKEN);
  await handlers.handlePostPublicLessonVisitResponse(pool, PHENOMENON_FORM_TOKEN, {
    body: JSON.stringify({ general: GENERAL, answers: MAX_ANSWERS }),
  });
  const ph = pool.projects.find((p) => p.form_token === PHENOMENON_FORM_TOKEN);
  withListQueries(pool);
  const list = (sessionUser) => handlers.handleListLessonVisitResponses(pool, null, false, sessionUser, ph.id);

  const teacher = await list({ id: 501, email: 'teacher@example.org', role: 'teacher', permissions: [] });
  assert.ok([403, 404].includes(teacher.statusCode), 'обычный учитель не видит результаты');
  const methodist = await list({ id: 502, email: 'm@example.org', role: 'methodist', permissions: ['pulse.analytics.view'] });
  assert.ok([403, 404].includes(methodist.statusCode), 'право просмотра своей аналитики без назначения кафедры не открывает общие результаты');
  const anon = await handlers.handleListLessonVisitResponses(pool, null, false, null, ph.id);
  assert.equal(anon.statusCode, 403);

  for (const permissions of [['pulse.analytics.all'], ['*'], ['pulse.director.checklist']]) {
    const ok = await list({ id: 503, email: 'a@example.org', role: 'methodist', permissions });
    assert.equal(ok.statusCode, 200, permissions.join());
    assert.equal(JSON.parse(ok.body).responses.length, 1);
  }
}));

test('closed form: only the two pilot records may submit and read results, others get «Раздел пока недоступен»', () =>
  withOpen(false, async () => {
    const handlers = require('../lesson-visit-projects');
    const pool = withListQueries(fakePool());
    const realResolve = phenomenonLib.resolvePhenomenonActor;
    let actor = null;
    phenomenonLib.resolvePhenomenonActor = async () => actor;
    try {
      const post = () =>
        handlers.handlePostPublicLessonVisitResponse(pool, PHENOMENON_FORM_TOKEN, {
          body: JSON.stringify({ general: GENERAL, answers: MAX_ANSWERS }),
        });
      // Без входа, обычный учитель, администратор с полным доступом и другой человек из списка аналитики: отказ.
      for (const who of [null, { id: 1, email: 'teacher@example.org', permissions: [] }, { id: 2, email: 'admin@example.org', permissions: ['*'] }, personByKey('maisuradze')]) {
        actor = who;
        const r = await post();
        assert.equal(r.statusCode, 403, JSON.stringify(who));
        assert.equal(JSON.parse(r.body).message, 'Раздел пока недоступен');
      }
      assert.equal(pool.responses.length, 0);
      for (const key of phenomenonLib.PHENOMENON_PILOT_PERSON_KEYS) {
        actor = personByKey(key);
        assert.equal((await post()).statusCode, 201, key);
      }
      assert.equal(pool.responses.length, 2);

      const ph = pool.projects.find((p) => p.form_token === PHENOMENON_FORM_TOKEN);
      const list = (sessionUser) => handlers.handleListLessonVisitResponses(pool, null, false, sessionUser, ph.id);
      assert.equal((await list(personByKey('maisuradze'))).statusCode, 404, 'аналитика без пробного доступа не видит');
      assert.equal((await list({ id: 2, email: 'admin@example.org', permissions: ['*'] })).statusCode, 404);
      for (const key of phenomenonLib.PHENOMENON_PILOT_PERSON_KEYS) {
        assert.equal((await list(personByKey(key))).statusCode, 200, key);
      }
      // Основной чек-лист ограничение не затрагивает.
      assert.equal((await handlers.handleListLessonVisitResponses(pool, null, false, personByKey('maisuradze'), 1)).statusCode, 200);
    } finally {
      phenomenonLib.resolvePhenomenonActor = realResolve;
    }
  }));

test('the switch has the same value on the server and in the interface', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../../frontend/src/lib/lessonVisitChecklist/publicForm.ts'), 'utf8');
  const m = /export const PHENOMENON_OPEN_FOR_ALL = (true|false);/.exec(src);
  assert.ok(m, 'frontend switch');
  assert.equal(m[1] === 'true', phenomenonLib.PHENOMENON_OPEN_FOR_ALL);
});
}

// Чистка справочника: старые ответы на убранных и склеенных учителей. Данные обезличены.
const ALIAS_DIRECTORY = {
  departments: [{ id: 'dept_q', name: 'Кафедра Q' }],
  teachers: [{ id: 'teacher_a', name: 'Учитель Первый Тестович', departmentId: 'dept_q' }],
  retiredTeachers: [{ id: 'teacher_gone', name: 'Учитель Ушедший Тестович', departmentId: 'dept_q' }],
  teacherAliases: [{ key: teacherAliasKey('First Teacher'), teacherId: 'teacher_a' }],
};

test('applyTeacherAliases shows a retired teacher by name and keeps the old code', () => {
  const general = { teacher_id: 'teacher_gone', visit_date: '2026-10-01' };
  const out = applyTeacherAliases(general, ALIAS_DIRECTORY);
  assert.equal(out.teacher_id, 'Учитель Ушедший Тестович');
  assert.equal(out.teacher_name, 'Учитель Ушедший Тестович');
  assert.equal(out.legacy_teacher_id, 'teacher_gone');
  assert.equal(out.department_id, 'dept_q');
  assert.equal(out.visit_date, '2026-10-01');
  assert.deepEqual(general, { teacher_id: 'teacher_gone', visit_date: '2026-10-01' });
});

test('applyTeacherAliases merges an old spelling into the directory record', () => {
  for (const general of [
    { teacher_id: 'First  Teacher' },
    { teacher_id: '', teacher_name: 'first teacher' },
    { teacher: 'FIRST TEACHER' },
  ]) {
    const out = applyTeacherAliases(general, ALIAS_DIRECTORY);
    assert.equal(out.teacher_id, 'teacher_a');
    assert.equal(out.teacher_name, 'Учитель Первый Тестович');
  }
  const active = { teacher_id: 'teacher_a', teacher_name: 'First Teacher' };
  assert.equal(applyTeacherAliases(active, ALIAS_DIRECTORY), active);
  const other = { teacher_id: 'Другой Учитель' };
  assert.equal(applyTeacherAliases(other, ALIAS_DIRECTORY), other);
});

test('seed directory keeps every removed and merged teacher resolvable', () => {
  const dir = loadSeedDirectory();
  const active = new Set(dir.teachers.map((t) => t.id));
  assert.ok(dir.retiredTeachers.length > 0);
  for (const gone of dir.retiredTeachers) {
    assert.equal(active.has(gone.id), false);
    assert.ok(String(gone.name || '').trim());
    const out = applyTeacherAliases({ teacher_id: gone.id });
    assert.equal(out.teacher_name, gone.name);
    assert.equal(out.legacy_teacher_id, gone.id);
  }
  const keys = new Set();
  for (const alias of dir.teacherAliases) {
    assert.match(alias.key, /^[0-9a-f]{16}$/);
    assert.ok(active.has(alias.teacherId));
    assert.equal(keys.has(alias.key), false);
    keys.add(alias.key);
  }
  for (const teacher of dir.teachers) {
    assert.equal(keys.has(teacherAliasKey(teacher.name)), false);
  }
});
