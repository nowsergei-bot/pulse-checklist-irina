// Обезличенная аналитика: Модуль 1 по группам и параллелям, разделы и уровни, щадящий режим,
// входное тестирование по полям, ученики и во входном, и в Модуле 1. Только data_admin, без ФИО.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
// База должна быть пустой: тест создаёт схемы monitoring и pulse_read с вымышленными данными.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const route = require('../server/routes.cjs');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('аналитика для data_admin', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
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
    CREATE TABLE pulse_read.group_teachers (teacher_id int, group_id int);
    CREATE TABLE pulse_read.students (id int, full_name text);
    CREATE TABLE pulse_read.group_memberships (id int, student_id int, group_id int);
    CREATE TABLE pulse_read.users (id int, full_name text);
    CREATE TABLE pulse_read.placement_sessions (id int, group_id int, spec_id text, held_on date);
    CREATE TABLE pulse_read.placement_field_scores (id int, session_id int, student_id int, field_id text, score numeric, status text);
    INSERT INTO pulse_read.academic_years VALUES (1, '2026/2027', true, '2026-09-01'), (0, '2025/2026', false, '2025-09-01');
    INSERT INTO pulse_read.groups VALUES (1, '7 AA', '7AA', 'main', 7, 1, NULL), (2, '7 AA', '7AA', 'digital', 7, 1, NULL),
      (3, '8 AB', '8AB', 'main', 8, 1, NULL), (9, '6 AA', '6AA', 'main', 6, 0, NULL);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель Вымышленный', NULL);
    INSERT INTO pulse_read.group_teachers VALUES (1, 1);
    INSERT INTO pulse_read.users VALUES (100, 'Администратор 1'), (101, 'Учитель Вымышленный'), (104, 'Заведующий 1');
    INSERT INTO pulse_read.students SELECT i, 'Ученик Вымышленный ' || i FROM generate_series(1, 8) i;
    -- Ученик 8 выбыл из 7 AA: его баллы внесены в этой группе, в составе его нет.
    INSERT INTO pulse_read.group_memberships VALUES (1, 1, 1), (2, 2, 1), (3, 3, 1), (4, 4, 1), (5, 5, 2), (6, 6, 3), (7, 7, 3), (8, 8, 9);
    INSERT INTO pulse_read.placement_sessions VALUES (100, 1, 's7', '2026-09-10'), (101, 3, 's8', '2026-09-11'), (90, 9, 's6', '2025-09-10');
    INSERT INTO pulse_read.placement_field_scores VALUES
      (1, 100, 1, 'f1', 8, 'complete'), (2, 100, 1, 'f2', 4, 'complete'), (3, 100, 2, 'f1', 6, 'complete'),
      (4, 100, 8, 'f1', 2, 'complete'), (5, 100, 3, 'f1', NULL, 'absent'), (6, 101, 6, 'f1', 5, 'complete'), (7, 90, 1, 'f1', 9, 'complete');
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  await db.query(`INSERT INTO monitoring.user_roles (user_id, role) VALUES (100, 'data_admin'), (104, 'department_head') ON CONFLICT DO NOTHING`);

  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
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
      [v.id, part.id, i + 1, section, level, `${section}: ${level}`, max],
    )).id);
  }
  await db.query("UPDATE monitoring.spec_versions SET status = 'approved' WHERE id = $1", [v.id]);
  const work = async (title, parallel, status, groups) => {
    const w = (await one(
      'INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status, created_by) VALUES ($1, $2, 1, $3, $4, $5, $6, 100) RETURNING id',
      [type.id, title, parallel, v.id, scale.id, status],
    )).id;
    await db.query("INSERT INTO monitoring.work_parts (work_id, part_id, held_on) VALUES ($1, $2, '2026-10-14')", [w, part.id]);
    for (const g of groups) await db.query('INSERT INTO monitoring.work_groups (work_id, group_id) VALUES ($1, $2)', [w, g]);
    return w;
  };
  const w7 = await work('Модуль 1', 7, 'open', [1, 2]);
  const w8 = await work('Модуль 1', 8, 'closed', [3]);
  await work('Модуль 1', 7, 'draft', [1]);
  await work('Модуль 2', 7, 'open', [1]);
  const scores = async (w, student, group, values) => {
    for (const [i, s] of values.entries()) {
      if (s === null) continue;
      await db.query('INSERT INTO monitoring.task_scores (work_id, task_id, student_id, group_id, score, updated_by) VALUES ($1, $2, $3, $4, $5, 100)', [w, tasks[i], student, group, s]);
    }
  };
  // 7 AA (щадящий режим, пороги 85 / 70 / 45): 50 баллов «5»; 26 баллов 52% «3»; 23 балла 46%: обычный «2», щадящий «3»; ученик 4 отсутствовал.
  await scores(w7, 1, 1, [10, 10, 15, 15]);
  await scores(w7, 2, 1, [8, 8, 5, 5]);
  await scores(w7, 3, 1, [9, 9, 3, 2]);
  await db.query("INSERT INTO monitoring.part_status (work_id, part_id, student_id, group_id, status, updated_by) VALUES ($1, $2, 4, 1, 'absent', 100)", [w7, part.id]);
  await scores(w7, 8, 1, [10, 10, 10, 10]);
  await db.query('INSERT INTO monitoring.gentle_groups (work_id, group_id, updated_by) VALUES ($1, 1, 100)', [w7]);
  // 7 AA (ЦГ): 20 баллов 40% «2». 8 AB: 40 баллов «4», у ученика 7 внесён один балл.
  await scores(w7, 5, 2, [5, 5, 5, 5]);
  await scores(w8, 6, 3, [10, 10, 10, 10]);
  await scores(w8, 7, 3, [10, null, null, null]);

  const call = (id, q = {}) => route({ path: '/analytics', method: 'GET', query: q, body: null, user: { id }, db });

  await t.test('только data_admin, проверка на сервере', async () => {
    assert.equal((await call(101)).status, 403);
    assert.equal((await call(104)).status, 403);
    assert.equal((await route({ path: '/analytics', method: 'POST', query: {}, body: '{}', user: { id: 100 }, db })).status, 405);
  });

  let body;
  await t.test('Модуль 1 по группам и параллелям, выбывшие отдельной строкой', async () => {
    const r = await call(100);
    assert.equal(r.status, 200);
    body = r.body;
    assert.deepEqual(body.titles, ['Модуль 1', 'Модуль 2']);
    assert.equal(body.title, 'Модуль 1');
    assert.deepEqual(body.module.works.map(w => w.parallel), [7, 8]); // черновик не считается
    const view = body.module.rows.map(x => [x.row, x.students, x.complete, x.absent, x.not_entered, x.avg_total, x.avg_percent, [x.marks[5], x.marks[4], x.marks[3], x.marks[2]]]);
    assert.deepEqual(view, [
      ['7 AA', 4, 3, 1, 0, 33, 66, [1, 0, 2, 0]],
      ['7 AA · выбыли', 1, 1, 0, 0, 40, 80, [0, 1, 0, 0]],
      ['7 AA (ЦГ)', 1, 1, 0, 0, 20, 40, [0, 0, 0, 1]],
      ['7 параллель', 5, 4, 1, 0, 29.8, 59.5, [1, 0, 2, 1]],
      ['7 параллель · выбыли', 1, 1, 0, 0, 40, 80, [0, 1, 0, 0]],
      ['8 AB', 2, 1, 0, 1, 40, 80, [0, 1, 0, 0]],
      ['8 параллель', 2, 1, 0, 1, 40, 80, [0, 1, 0, 0]],
      ['Все параллели', 7, 5, 1, 1, 31.8, 63.6, [1, 1, 2, 1]],
      ['Все параллели · выбыли', 1, 1, 0, 0, 40, 80, [0, 1, 0, 0]],
    ]);
  });

  await t.test('разделы и уровни: средний процент по полным работам', async () => {
    assert.deepEqual(body.module.section_keys.map(k => k.key), ['Listening|basic', 'Reading|basic', 'Grammar|advanced', 'Vocabulary|advanced']);
    const g = body.module.rows.find(x => x.row === '7 AA');
    assert.deepEqual(g.sections, { 'Listening|basic': 90, 'Reading|basic': 90, 'Grammar|advanced': 51.1, 'Vocabulary|advanced': 48.9 });
    assert.deepEqual(body.module.rows.find(x => x.row === '7 параллель').sections['Listening|basic'], 80);
  });

  await t.test('щадящий режим: у кого отметка стала выше и из какой в какую', async () => {
    const g = body.module.rows.find(x => x.row === '7 AA');
    assert.equal(g.gentle_on, true);
    // Процент один: 100, 52, 46. Щадящие пороги: 46 % даёт «3» вместо «2»; 52 и 100 % отметку не меняют.
    assert.deepEqual(g.gentle, { students: 4, complete: 3, raised: 1, moves: { '2→3': 1 }, avg_percent: 66 });
    assert.deepEqual(body.module.rows.find(x => x.row === '7 AA (ЦГ)').gentle, { students: 0, complete: 0, raised: 0, moves: {}, avg_percent: null });
    assert.deepEqual(body.module.rows.find(x => x.row === '7 параллель').gentle.moves, { '2→3': 1 });
  });

  await t.test('входное тестирование по текущей параллели ученика и полю', async () => {
    assert.deepEqual(body.placement.missing, []);
    assert.deepEqual(body.placement.rows.map(x => [x.parallel, x.spec_id, x.field_id, x.students, x.avg, x.min, x.max]), [
      [7, 's7', 'f1', 2, 7, 6, 8],
      [7, 's7', 'f2', 1, 4, 4, 4],
      [8, 's8', 'f1', 1, 5, 5, 5],
      ['выбыли', 's7', 'f1', 1, 2, 2, 2],
    ]);
    assert.deepEqual(body.placement.parallels, [{ parallel: 7, students: 2 }, { parallel: 8, students: 1 }, { parallel: 'выбыли', students: 1 }]);
  });

  await t.test('ученики и во входном, и в Модуле 1; разницы в процентах пока нет', async () => {
    assert.deepEqual(body.overlap, [
      { parallel: 7, placement: 2, module_any: 5, module_complete: 4, both: 2, both_complete: 2 },
      { parallel: 8, placement: 1, module_any: 2, module_complete: 1, both: 1, both_complete: 1 },
    ]);
    assert.equal(body.percent_difference, null);
  });

  await t.test('другая работа по названию; в ответе нет ФИО', async () => {
    const r = await call(100, { title: 'Модуль 2' });
    assert.equal(r.body.title, 'Модуль 2');
    assert.deepEqual(r.body.module.rows.map(x => x.row), ['7 AA', '7 параллель']);
    assert.equal((await call(100, { title: 'Нет такой' })).body.title, 'Модуль 1');
    assert.doesNotMatch(JSON.stringify(body), /Ученик|Учитель|Администратор|@/);
  });

  await t.test('выбыл из группы, но остался в другой группе параллели: в параллели не выбыл', async () => {
    // Ученик 9 перешёл из 7 AA в 7 AA (ЦГ); его баллы внесены в 7 AA.
    await db.query("INSERT INTO pulse_read.students VALUES (9, 'Ученик Вымышленный 9'); INSERT INTO pulse_read.group_memberships VALUES (9, 9, 2)");
    await scores(w7, 9, 1, [5, 5, 5, 5]);
    const rows = (await call(100)).body.module.rows;
    const count = (name) => rows.find(x => x.row === name)?.students;
    assert.equal(count('7 AA · выбыли'), 2);
    assert.equal(count('7 AA (ЦГ)'), 2);
    assert.equal(count('7 параллель'), 6);
    assert.equal(count('7 параллель · выбыли'), 1);
    assert.equal(count('Все параллели · выбыли'), 1);
  });
});
