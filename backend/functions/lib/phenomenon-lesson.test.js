'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PHENOMENON_FORM_TOKEN,
  PHENOMENON_CHOICES,
  isPhenomenonRow,
  validatePhenomenonSubmission,
  phenomenonDraft,
} = require('./phenomenon-lesson');
const phenomenonLib = require('./phenomenon-lesson');
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
  ph_coteaching: 'integrated',
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
  const src = fs.readFileSync(path.join(__dirname, '../../../frontend/src/lib/phenomenonChecklist/form.ts'), 'utf8');
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
  assert.equal(teacher.statusCode, 404, 'обычный учитель не видит результаты');
  const methodist = await list({ id: 502, email: 'm@example.org', role: 'methodist', permissions: ['pulse.analytics.view'] });
  assert.equal(methodist.statusCode, 404, 'право просмотра своей аналитики не открывает общие результаты');
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
  const src = fs.readFileSync(path.join(__dirname, '../../../frontend/src/lib/phenomenonChecklist/form.ts'), 'utf8');
  const m = /export const PHENOMENON_OPEN_FOR_ALL = (true|false);/.exec(src);
  assert.ok(m, 'frontend switch');
  assert.equal(m[1] === 'true', phenomenonLib.PHENOMENON_OPEN_FOR_ALL);
});
