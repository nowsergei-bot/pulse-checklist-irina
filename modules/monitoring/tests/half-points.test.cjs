// Половина балла: в задании с отметкой «можно 0,5» вносится 0,5, 1,5 и так далее; в остальных только целые.
// Отметку ставит data_admin, в том числе в утверждённой версии. Вымышленные данные.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capabilities } = require('../server/lib/access.cjs');
const { getSheet, saveSheet } = require('../server/sheet.cjs');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('половина балла в отмеченном задании', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
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
    INSERT INTO pulse_read.academic_years VALUES (1, '2026/2027', true, '2026-09-01');
    INSERT INTO pulse_read.groups VALUES (1, '9 А', '9A', 'main', 9, 1, NULL);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL);
    INSERT INTO pulse_read.users VALUES (1, 'Администратор'), (101, 'Учитель 1');
    INSERT INTO pulse_read.group_teachers VALUES (1, 1);
    INSERT INTO pulse_read.students SELECT i, 'Ученик ' || i FROM generate_series(1, 2) i;
    INSERT INTO pulse_read.group_memberships SELECT i, i, 1 FROM generate_series(1, 2) i;
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  await db.query("INSERT INTO monitoring.user_roles (user_id, role) VALUES (1, 'data_admin'), (101, 'teacher') ON CONFLICT DO NOTHING");
  const route = require('../server/routes.cjs');
  const call = (userId, p, method = 'GET', body = null) => route({ path: p, method, query: {}, body, user: { id: userId }, db });
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const teacher = capabilities(new Set(['teacher']));

  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'module'");
  const frame = await one('SELECT id FROM monitoring.frames LIMIT 1');
  const scale = await one('SELECT id FROM monitoring.grade_scales WHERE is_default');
  const spec = await one('INSERT INTO monitoring.specs (type_id, title) VALUES ($1, $2) RETURNING id', [type.id, 'Вымышленный модуль 1, 9 класс']);
  const v = await one('INSERT INTO monitoring.spec_versions (spec_id, version, frame_id, max_points) VALUES ($1, 1, $2, 50) RETURNING id', [spec.id, frame.id]);
  const part = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'test', 'Тест', 1) RETURNING id", [v.id]);
  const rows = [['Listening', 'basic', 'Задания 1-10'], ['Reading', 'basic', 'Задания 11-20'], ['Grammar', 'advanced', 'Задания 26-35'], ['Vocabulary', 'basic', 'Задания 36-45'], ['Writing', 'basic', 'Письмо']];
  const tasks = [];
  for (const [i, [section, level, title]] of rows.entries()) {
    tasks.push(await one('INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, $3, $4, $5, $6, 10) RETURNING id', [v.id, part.id, i + 1, section, level, title]));
  }
  await db.query("UPDATE monitoring.spec_versions SET status = 'approved' WHERE id = $1", [v.id]);
  const work = await one(
    "INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status, created_by) VALUES ($1, 'Модуль 1', 1, 9, $2, $3, 'open', 1) RETURNING id",
    [type.id, v.id, scale.id],
  );
  await db.query('INSERT INTO monitoring.work_parts (work_id, part_id) VALUES ($1, $2)', [work.id, part.id]);
  await db.query('INSERT INTO monitoring.work_groups (work_id, group_id) VALUES ($1, 1)', [work.id]);
  const grammar = tasks[2].id;
  const save = (changes) => saveSheet(db, 101, teacher, work.id, { group_id: 1, changes });

  await t.test('без отметки только целые: и сервер, и база', async () => {
    const r = await save([{ student_id: 1, task_id: grammar, score: 2.5 }]);
    assert.deepEqual(r.body.errors, ['Балл должен быть целым числом от 0 до 10']);
    await assert.rejects(
      db.query('INSERT INTO monitoring.task_scores (work_id, task_id, student_id, group_id, score, updated_by) VALUES ($1, $2, 1, 1, 2.5, 1)', [work.id, grammar]),
      /только целый/,
    );
  });

  await t.test('отметку ставит только data_admin, утверждённая версия не мешает', async () => {
    assert.equal((await call(101, `/specs/tasks/${grammar}/half`, 'POST', { half: true })).status, 403);
    assert.equal((await call(1, `/specs/tasks/${grammar}/half`, 'POST', {})).status, 400);
    const r = await call(1, `/specs/tasks/${grammar}/half`, 'POST', { half: true });
    assert.equal(r.status, 200);
    const list = await call(1, `/specs/versions/${v.id}`);
    assert.deepEqual(list.body.tasks.map(x => x.half), [false, false, true, false, false]);
  });

  await t.test('ввод 0,5: итог, процент, отметка, история', async () => {
    const r = await save([
      { student_id: 1, task_id: tasks[0].id, score: 8 }, { student_id: 1, task_id: tasks[1].id, score: 8 },
      { student_id: 1, task_id: grammar, score: 7.5 }, { student_id: 1, task_id: tasks[3].id, score: 8 }, { student_id: 1, task_id: tasks[4].id, score: 8 },
    ]);
    assert.deepEqual(r.body.errors, []);
    const s = r.body.students.find(x => x.id === 1);
    assert.equal(s.scores[grammar], 7.5);
    assert.equal(s.scores[tasks[0].id], 8, 'целый балл остаётся числом');
    assert.deepEqual([s.result.total, s.result.percent, s.result.mark], [39.5, 79, '4']);
    const h = await one('SELECT new_value FROM monitoring.score_history WHERE task_id = $1 ORDER BY id DESC LIMIT 1', [grammar]);
    assert.equal(h.new_value, '7.5');
    const sheet = await getSheet(db, 101, teacher, work.id, 1);
    assert.equal(sheet.body.tasks.find(x => x.id === grammar).half, true);
    assert.equal(sheet.body.tasks.find(x => x.id === tasks[0].id).half, false);
  });

  await t.test('шаг только 0,5, не больше максимума, в других заданиях целые', async () => {
    assert.deepEqual((await save([{ student_id: 2, task_id: grammar, score: 7.3 }])).body.errors, ['Балл должен быть от 0 до 10 с шагом 0,5']);
    assert.deepEqual((await save([{ student_id: 2, task_id: grammar, score: 10.5 }])).body.errors, ['Балл должен быть от 0 до 10 с шагом 0,5']);
    assert.deepEqual((await save([{ student_id: 2, task_id: tasks[0].id, score: 0.5 }])).body.errors, ['Балл должен быть целым числом от 0 до 10']);
    assert.deepEqual((await save([{ student_id: 2, task_id: grammar, score: 0.5 }])).body.errors, []);
  });

  await t.test('снять отметку нельзя, пока есть баллы с половиной', async () => {
    const r = await call(1, `/specs/tasks/${grammar}/half`, 'POST', { half: false });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /половиной: 2/);
    await save([{ student_id: 1, task_id: grammar, score: 7 }, { student_id: 2, task_id: grammar, score: 1 }]);
    assert.equal((await call(1, `/specs/tasks/${grammar}/half`, 'POST', { half: false })).status, 200);
  });
});
