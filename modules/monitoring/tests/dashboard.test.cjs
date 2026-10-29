// Дашборд заместителей директора: плитки, параллели, группы, разделы, группа риска, лучшие результаты, права.
// Ручной пример: Модуль 1 (50 баллов: Listening 10, Reading 10 базовый; Grammar 15, Vocabulary 15 повышенный).
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
// База должна быть пустой: тест создаёт схемы monitoring и pulse_read с вымышленными данными.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { summarize, studentRisk } = require('../server/dashboard.cjs');

test('сводка: средняя отметка с двумя знаками, процент целый, качество и успеваемость', () => {
  const s = summarize([{ percent: 90, mark: '5' }, { percent: 74, mark: '4' }, { percent: 46, mark: '2' }], 3, true);
  assert.deepEqual(
    [s.n, s.m, s.entered, s.avg_percent, s.avg_mark, s.quality, s.success, s.twos],
    [3, 3, 100, 70, 3.67, 67, 67, 1],
  );
  const u = summarize([{ percent: 50, mark: null }, { percent: 65, mark: null }], 4, false);
  assert.deepEqual([u.avg_percent, u.avg_mark, u.quality, u.success, u.twos, u.marks, u.entered], [58, null, null, null, null, null, 50]);
  assert.equal(summarize([], 0, true).avg_mark, null);
});

test('причины группы риска у ученика', () => {
  const st = { threshold: 5, drop_to_start: 10 };
  assert.deepEqual(studentRisk([90, 74], 1, '4', st).map(r => r.code), ['drop'], 'снижение на 16');
  assert.deepEqual(studentRisk([60, 51], 1, '3', st), [], '9 пунктов не риск');
  assert.deepEqual(studentRisk([50, 46], 1, '2', st).map(r => r.code), ['two']);
  assert.deepEqual(studentRisk([100, 92, 50], 2, null, st).map(r => r.code), ['drop', 'two_drops']);
  assert.deepEqual(studentRisk([100, 92, 50], 1, null, st), [], 'работы после выбранной не учитываются');
  assert.deepEqual(studentRisk([null, 80, 74, 68], 3, null, st).map(r => r.code), ['two_drops'], 'без входного только два снижения');
  assert.deepEqual(studentRisk([90, 79], 1, null, { threshold: 5, drop_to_start: 12 }), [], 'порог из настроек');
});

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('дашборд в базе', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  t.after(() => db.end());
  await db.query('SELECT pg_advisory_lock(73001)');
  await db.query(`
    DROP SCHEMA IF EXISTS pulse_read CASCADE; CREATE SCHEMA pulse_read;
    CREATE TABLE pulse_read.academic_years (id int, label text, is_current boolean, starts_on date);
    CREATE TABLE pulse_read.groups (id int, title text, code text, campus text, parallel int, academic_year_id int, archived_at timestamptz);
    CREATE TABLE pulse_read.english_teachers (id int, user_id int, full_name text, archived_at timestamptz);
    CREATE TABLE pulse_read.users (id int, full_name text);
    CREATE TABLE pulse_read.group_teachers (teacher_id int, group_id int);
    CREATE TABLE pulse_read.students (id int, full_name text);
    CREATE TABLE pulse_read.group_memberships (id int, student_id int, group_id int);
    CREATE TABLE pulse_read.placement_sessions (id int, academic_year_id int, group_id int, spec_id text, held_on date);
    CREATE TABLE pulse_read.placement_field_scores (id serial, session_id int, student_id int, field_id text, score numeric, status text);
    CREATE TABLE pulse_read.placement_spec_uploads (spec_id text, academic_year text, spec_json jsonb, uploaded_at timestamptz, archived_at timestamptz);
    CREATE TABLE pulse_read.placement_approvals (spec_id text, status text);
    INSERT INTO pulse_read.academic_years VALUES (1, '2026/2027', true, '2026-09-01');
    INSERT INTO pulse_read.groups VALUES (1, '9 А', '9A', 'main', 9, 1, NULL), (2, '9 Ц', '9D', 'digital', 9, 1, NULL), (3, '11 А', '11A', 'main', 11, 1, NULL);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL), (2, 102, 'Учитель 2', NULL);
    INSERT INTO pulse_read.users VALUES (1, 'Администратор'), (101, 'Учитель 1'), (102, 'Учитель 2'), (104, 'Заведующая'), (105, 'Заместитель');
    INSERT INTO pulse_read.group_teachers VALUES (1, 1), (1, 2), (2, 3);
    INSERT INTO pulse_read.students SELECT i, 'Ученик ' || i FROM generate_series(1, 9) i;
    INSERT INTO pulse_read.group_memberships VALUES (1, 1, 1), (2, 2, 1), (3, 3, 1), (4, 4, 1), (5, 5, 2), (6, 6, 2), (7, 7, 2), (8, 8, 3), (9, 9, 3);
    INSERT INTO pulse_read.placement_spec_uploads VALUES
      ('p9', '2026/2027', '{"id":"p9","grade":9,"fields":[{"id":"l1","section":"Listening","max_score":50},{"id":"r1","section":"Reading","max_score":50}]}', '2026-09-01', NULL),
      ('p11', '2026/2027', '{"id":"p11","grade":11,"fields":[{"id":"l1","section":"Listening","max_score":50},{"id":"r1","section":"Reading","max_score":50}]}', '2026-09-01', NULL);
    INSERT INTO pulse_read.placement_approvals VALUES ('p9', 'approved'), ('p11', 'approved');
    INSERT INTO pulse_read.placement_sessions VALUES (1, 1, 1, 'p9', '2026-09-10'), (2, 1, 2, 'p9', '2026-09-10'), (3, 1, 3, 'p11', '2026-09-10');
    -- Входное, итог из 100: ученик 1: 60, 2: 90, 3: 50, 5: 80, 8: 100, 9: 100.
    INSERT INTO pulse_read.placement_field_scores (session_id, student_id, field_id, score, status) VALUES
      (1, 1, 'l1', 30, 'complete'), (1, 1, 'r1', 30, 'complete'), (1, 2, 'l1', 45, 'complete'), (1, 2, 'r1', 45, 'complete'),
      (1, 3, 'l1', 25, 'complete'), (1, 3, 'r1', 25, 'complete'), (2, 5, 'l1', 40, 'complete'), (2, 5, 'r1', 40, 'complete'),
      (3, 8, 'l1', 50, 'complete'), (3, 8, 'r1', 50, 'complete'), (3, 9, 'l1', 50, 'complete'), (3, 9, 'r1', 50, 'complete');
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  await db.query(`INSERT INTO monitoring.user_roles (user_id, role) VALUES (1, 'data_admin'), (104, 'department_head'), (105, 'deputy'),
    (101, 'teacher'), (102, 'teacher') ON CONFLICT DO NOTHING`);
  const route = require('../server/routes.cjs');
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = (userId, p, method = 'GET', query = {}, body = null) => route({ path: p, method, query, body, user: { id: userId }, db });

  // Модуль 1 (с отметкой) в 9 и 11 параллели.
  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'module'");
  const frame = await one('SELECT id FROM monitoring.frames LIMIT 1');
  const scale = await one('SELECT id FROM monitoring.grade_scales WHERE is_default');
  const spec = await one('INSERT INTO monitoring.specs (type_id, title) VALUES ($1, $2) RETURNING id', [type.id, 'Вымышленный модуль']);
  const v = await one('INSERT INTO monitoring.spec_versions (spec_id, version, frame_id, max_points) VALUES ($1, 1, $2, 50) RETURNING id', [spec.id, frame.id]);
  const part = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'test', 'Тест', 1) RETURNING id", [v.id]);
  const tasks = [];
  for (const [i, [section, level, max]] of [['Listening', 'basic', 10], ['Reading', 'basic', 10], ['Grammar', 'advanced', 15], ['Vocabulary', 'advanced', 15]].entries()) {
    tasks.push((await one(
      'INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [v.id, part.id, i + 1, section, level, `Задание ${i + 1}`, max],
    )).id);
  }
  await db.query("UPDATE monitoring.spec_versions SET status = 'approved' WHERE id = $1", [v.id]);
  const work = async (parallel, groups) => {
    const w = (await one(
      "INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status, created_by) VALUES ($1, 'Модуль 1', 1, $2, $3, $4, 'open', 1) RETURNING id",
      [type.id, parallel, v.id, scale.id],
    )).id;
    await db.query("INSERT INTO monitoring.work_parts (work_id, part_id, held_on) VALUES ($1, $2, '2026-10-14')", [w, part.id]);
    for (const g of groups) await db.query('INSERT INTO monitoring.work_groups (work_id, group_id) VALUES ($1, $2)', [w, g]);
    return w;
  };
  const w9 = await work(9, [1, 2]);
  const w11 = await work(11, [3]);
  const put = async (w, student, group, values, list = tasks) => {
    for (const [i, s] of values.entries()) {
      if (s === null) continue;
      await db.query('INSERT INTO monitoring.task_scores (work_id, task_id, student_id, group_id, score, updated_by) VALUES ($1, $2, $3, $4, $5, 1)', [w, list[i], student, group, s]);
    }
  };
  // 9 А: 45 баллов (90 %, «5»), 37 (74 %, «4»), 23 (46 %, «2»), ученик 4 отсутствовал.
  await put(w9, 1, 1, [10, 10, 15, 10]);
  await put(w9, 2, 1, [8, 7, 10, 12]);
  await put(w9, 3, 1, [5, 5, 5, 8]);
  await db.query("INSERT INTO monitoring.part_status (work_id, part_id, student_id, group_id, status, updated_by) VALUES ($1, $2, 4, 1, 'absent', 1)", [w9, part.id]);
  // 9 Ц: 50 баллов (100 %, «5»); ученику 6 ничего не внесено, ученику 7 один балл: внесено 1 из 3, меньше половины.
  await put(w9, 5, 2, [10, 10, 15, 15]);
  await put(w9, 7, 2, [10, null, null, null]);
  // 11 А: 50 (100 %, «5») и 46 (92 %, «5»).
  await put(w11, 8, 3, [10, 10, 15, 15]);
  await put(w11, 9, 3, [9, 9, 14, 14]);

  // Пробный ЕГЭ 1 (без отметки) в 11 параллели, позже модуля.
  const { createWorks } = require('../server/works.cjs');
  const ege = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'ege_mock'");
  const egeV = await one('SELECT v.id FROM monitoring.spec_versions v JOIN monitoring.specs s ON s.id = v.spec_id WHERE s.type_id = $1', [ege.id]);
  const egeTasks = (await db.query('SELECT id FROM monitoring.spec_tasks WHERE version_id = $1 ORDER BY sort', [egeV.id])).rows.map(r => r.id);
  const we = (await createWorks(db, 1, {
    type_id: ege.id, title: 'Пробный ЕГЭ 1', academic_year_id: 1, parallels: [11], spec_version_id: egeV.id, scale_id: null, status: 'open', groups: [3], dates: { test: '2026-10-20' },
  })).body.created[0];
  await put(we, 8, 3, [2, 3, 7, 3, 2, 7, 6, 5, 5, 0, 0], egeTasks); // 40 из 62 = 65 %
  await put(we, 9, 3, [1, 1, 3, 1, 1, 3, 3, 2, 3, 3, 10], egeTasks); // 31 из 62 = 50 %

  const dash = async (q = {}, user = 105) => {
    const r = await call(user, '/dashboard', 'GET', q);
    assert.equal(r.status, 200);
    return r.body;
  };

  await t.test('фильтр работ: входное, модуль, пробный ЕГЭ; по умолчанию последняя с результатами', async () => {
    const b = await dash();
    assert.deepEqual(b.works.map(w => w.title), ['Входное', 'Модуль 1', 'Пробный ЕГЭ 1']);
    assert.equal(b.work.title, 'Пробный ЕГЭ 1');
  });

  await t.test('плитки по школе: отсутствовавшие не учитываются, школа не среднее средних', async () => {
    const s = (await dash({ work: 'Модуль 1' })).school;
    // Полные: 90, 74, 46, 100, 100, 92 → 83,67 → 84; отметки 5, 4, 2, 5, 5, 5 → 4,33; ожидалось 9 − 1 отсутствовавший = 8.
    assert.deepEqual([s.n, s.m, s.entered, s.avg_percent, s.avg_mark, s.quality, s.success], [6, 8, 75, 84, 4.33, 83, 83]);
  });

  await t.test('по параллелям и группам: ручной пример', async () => {
    const b = await dash({ work: 'Модуль 1' });
    const p9 = b.parallels.find(p => p.parallel === 9);
    // 90, 74, 46, 100: среднее 77,5 → 78, не (70 + 100) / 2.
    assert.deepEqual([p9.n, p9.m, p9.avg_percent, p9.avg_mark, p9.quality, p9.success, p9.marks], [4, 6, 78, 4, 75, 75, { 5: 2, 4: 1, 3: 0, 2: 1 }]);
    assert.deepEqual(b.parallels.map(p => p.parallel), [9, 11]);
    const g = b.groups.find(x => x.group_id === 1);
    assert.deepEqual([g.title, g.teacher, g.n, g.m, g.avg_percent, g.avg_mark, g.twos, g.quality, g.success], ['9 А', 'Учитель 1', 3, 3, 70, 3.67, 1, 67, 67]);
    const d = b.groups.find(x => x.group_id === 2);
    assert.deepEqual([d.title, d.n, d.m, d.avg_percent], ['9 Ц (ЦГ)', 1, 3, 100]);
  });

  await t.test('разделы: сумма баллов / сумма максимумов, уровни и задания', async () => {
    const b = await dash({ work: 'Модуль 1' });
    const g = b.groups.find(x => x.group_id === 1).cells;
    // Listening 23/30, Reading 22/30, Grammar 30/45, Vocabulary 30/45.
    assert.deepEqual(g.sections, { 's:Listening': 77, 's:Reading': 73, 's:Grammar': 67, 's:Vocabulary': 67 });
    assert.equal(g.levels['l:Grammar|advanced'], 67);
    assert.equal(g.tasks['t:Задание 1'], 77);
    assert.deepEqual(b.columns.sections.map(c => c.label), ['Listening', 'Reading', 'Grammar', 'Vocabulary']);
    assert.deepEqual(b.columns.levels.map(c => c.label), ['Listening баз.', 'Reading баз.', 'Grammar пов.', 'Vocabulary пов.']);
    assert.deepEqual(b.columns.tasks.map(c => c.label), ['1', '2', '3', '4']);
    assert.equal(b.columns.tasks[2].hint, 'Grammar, повышенный уровень, максимум 15');
    // Параллель по всем ученикам: Listening (10 + 8 + 5 + 10) / 40.
    assert.equal(b.parallels.find(p => p.parallel === 9).cells.sections['s:Listening'], 83);
  });

  await t.test('пробный ЕГЭ: без отметок, разделы по-русски, 11 блоков, уровни баз. и выс.', async () => {
    const b = await dash({ work: 'Пробный ЕГЭ 1' });
    assert.equal(b.work.graded, false);
    assert.deepEqual([b.school.avg_percent, b.school.avg_mark, b.school.quality, b.school.success, b.school.marks], [58, null, null, null, null]);
    assert.ok(b.groups.every(g => g.avg_mark === null && g.twos === null));
    assert.deepEqual(b.columns.sections.map(c => c.label), ['Аудирование', 'Чтение', 'Грамматика и лексика', 'Письменная речь']);
    assert.equal(b.columns.tasks.length, 11);
    assert.ok(b.columns.levels.some(c => / баз\.$/.test(c.label)) && b.columns.levels.some(c => / выс\.$/.test(c.label)));
    assert.equal(b.risk.counts.two, 0, 'без отметок нет причины «2»');
  });

  await t.test('входное: проценты без отметок', async () => {
    const b = await dash({ work: 'placement' });
    assert.equal(b.work.title, 'Входное');
    assert.equal(b.school.avg_mark, null);
    assert.deepEqual(b.columns.levels, []);
    assert.equal(b.parallels.find(p => p.parallel === 9).avg_percent, 70, '60, 90, 50, 80');
  });

  await t.test('группа риска: группы и ученики по трём причинам, пороги из настроек', async () => {
    let b = await dash({ work: 'Модуль 1' });
    assert.deepEqual(b.risk.groups.map(g => [g.title, g.reasons.map(r => r.code), g.twos, g.marked]), [['9 А', ['twos'], 1, 3]], '«2» у 1 из 3, средний 70 не ниже 70');
    assert.deepEqual(b.risk.students.map(s => [s.full_name, s.reasons.map(r => r.code)]), [['Ученик 2', ['drop']], ['Ученик 3', ['two']]]);
    assert.deepEqual(b.risk.counts, { two: 1, drop: 1, two_drops: 0 });
    assert.equal(b.risk.students[0].teacher, 'Учитель 1');
    assert.deepEqual(b.risk.students[0].values, { placement: 90, 'Модуль 1': 74 });
    b = await dash({ work: 'Пробный ЕГЭ 1' });
    assert.deepEqual(b.risk.students.map(s => [s.full_name, s.reasons.map(r => r.code)]), [['Ученик 8', ['drop']], ['Ученик 9', ['drop', 'two_drops']]]);
    assert.equal((await call(105, '/progress/settings', 'POST', {}, { group_avg_below: 75 })).status, 403, 'пороги меняет только data_admin');
    assert.equal((await call(1, '/progress/settings', 'POST', {}, { group_avg_below: 0 })).status, 400);
    const saved = await call(1, '/progress/settings', 'POST', {}, { group_avg_below: 75, drop_to_start: 20 });
    assert.deepEqual([saved.body.threshold, saved.body.group_avg_below, saved.body.drop_to_start, saved.body.group_twos_from], [5, 75, 20, 25]);
    b = await dash({ work: 'Модуль 1' });
    assert.deepEqual(b.risk.groups[0].reasons.map(r => r.code), ['avg', 'twos']);
    assert.deepEqual(b.risk.students.map(s => s.full_name), ['Ученик 3'], 'снижение на 16 меньше порога 20');
    await call(1, '/progress/settings', 'POST', {}, { group_avg_below: 70, drop_to_start: 10 });
  });

  await t.test('лучшие: группа с внесением меньше половины не попадает в рейтинг', async () => {
    const b = await dash({ work: 'Модуль 1' });
    assert.deepEqual(b.top.excluded, ['9 Ц (ЦГ)']);
    assert.deepEqual(b.top.groups.map(g => g.title), ['11 А', '9 А']);
    assert.deepEqual(b.top.best_by_parallel.map(g => [g.parallel, g.title]), [[9, '9 А'], [11, '11 А']]);
    assert.deepEqual(b.top.parallels.map(p => p.parallel), [11, 9]);
    assert.deepEqual(b.top.students.map(s => [s.full_name, s.percent]), [['Ученик 5', 100], ['Ученик 8', 100], ['Ученик 9', 92], ['Ученик 1', 90]]);
  });

  await t.test('таблица учеников группы', async () => {
    const r = await call(105, '/dashboard/group', 'GET', { work: 'Модуль 1', group: '1' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.students.map(s => [s.full_name, s.percent, s.mark, s.start, s.state]), [
      ['Ученик 1', 90, '5', 60, 'полная работа'], ['Ученик 2', 74, '4', 90, 'полная работа'],
      ['Ученик 3', 46, '2', 50, 'полная работа'], ['Ученик 4', null, null, null, 'отсутствовал(а)'],
    ]);
    const e = await call(105, '/dashboard/group', 'GET', { work: 'Пробный ЕГЭ 1', group: '3' });
    assert.ok(e.body.students.every(s => s.mark === null));
    assert.equal((await call(105, '/dashboard/group', 'GET', { work: 'Модуль 1', group: '99' })).status, 404);
  });

  await t.test('дашборд видят заместитель директора, заведующая и data_admin; учитель ни по одному адресу', async () => {
    for (const user of [105, 104, 1]) assert.equal((await call(user, '/dashboard')).status, 200, `роль ${user}`);
    assert.deepEqual(await dash({ work: 'Модуль 1' }, 104), await dash({ work: 'Модуль 1' }, 105), 'заведующая видит то же');
    for (const user of [101, 999]) {
      for (const p of ['/dashboard', '/dashboard/group', '/dashboard/', '/dashboard/x']) {
        for (const method of ['GET', 'POST']) {
          const r = await call(user, p, method, { work: 'Модуль 1', group: '1' }, '{}');
          assert.equal(r.status, 403, `${user} ${method} ${p}`);
        }
      }
    }
    assert.equal((await call(105, '/dashboard', 'POST', {}, '{}')).status, 405, 'дашборд только чтение');
  });

  await t.test('заместитель директора не меняет баллы ни по одному адресу', async () => {
    const before = (await db.query('SELECT count(*)::int AS n, sum(score) AS s FROM monitoring.task_scores')).rows[0];
    const sheet = await call(105, `/works/${w9}/sheet`, 'GET', { group: '1' });
    assert.equal(sheet.status, 200, 'таблицу видит');
    assert.equal(sheet.body.can_edit, false);
    const attempts = [
      [`/works/${w9}/sheet`, { group_id: 1, changes: [{ student_id: 3, task_id: tasks[0], score: 10 }] }],
      [`/works/${w9}/sheet`, { group_id: 1, changes: [{ student_id: 4, part_id: part.id, absent: false }] }],
      [`/works/${w9}/gentle`, { group_id: 1, enabled: true, confirm: true }],
      [`/works/${w9}`, { status: 'closed' }],
      ['/works', { title: 'x' }],
      ['/specs', {}],
      [`/specs/tasks/${tasks[2]}/half`, { half: true }],
      ['/rosters/1', { action: 'remove', student_id: 3 }],
      ['/progress/settings', { threshold: 4 }],
      ['/progress/placement-map', { spec_id: 'p9', field_id: 'l1', section: 'none' }],
      ['/roles', { user_id: 105, role: 'data_admin', add: true }],
    ];
    for (const [p, body] of attempts) {
      const r = await call(105, p, 'POST', {}, JSON.stringify(body));
      assert.equal(r.status, 403, p);
    }
    const after = (await db.query('SELECT count(*)::int AS n, sum(score) AS s FROM monitoring.task_scores')).rows[0];
    assert.deepEqual(after, before);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM monitoring.part_status WHERE status = 'absent'")).rows[0].n, 1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM monitoring.gentle_groups')).rows[0].n, 0);
  });

  await t.test('в ответе нет почт', async () => {
    assert.doesNotMatch(JSON.stringify(await dash({ work: 'Модуль 1' })), /@/);
  });
});
