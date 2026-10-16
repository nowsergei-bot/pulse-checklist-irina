// Список работ: учитель видит свои группы с прогрессом внесения, заведующая и data_admin видят таблицу.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capabilities } = require('../server/lib/access.cjs');
const { listWorks } = require('../server/works.cjs');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('список работ для учителя', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  t.after(() => db.end());
  // Тесты с базой идут по очереди: все проверки пересоздают схемы.
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
    INSERT INTO pulse_read.academic_years VALUES (1, '2026/2027', true, '2026-09-01');
    INSERT INTO pulse_read.groups VALUES (1, 'Группа А', 'A', 'main', 4, 1, NULL), (2, 'Группа Б', 'B', 'main', 4, 1, NULL), (3, 'Группа В', 'C', 'digital', 4, 1, NULL);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL);
    INSERT INTO pulse_read.group_teachers VALUES (1, 1), (1, 3);
    INSERT INTO pulse_read.users VALUES (101, 'Учитель 1');
    INSERT INTO pulse_read.students SELECT i, 'Ученик ' || i FROM generate_series(1, 6) i;
    INSERT INTO pulse_read.group_memberships VALUES (1, 1, 1), (2, 2, 1), (3, 3, 1), (4, 4, 2), (5, 5, 3), (6, 6, 3);
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }

  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'module'");
  const frame = await one('SELECT id FROM monitoring.frames LIMIT 1');
  const scale = await one('SELECT id FROM monitoring.grade_scales WHERE is_default');
  const spec = await one('INSERT INTO monitoring.specs (type_id, title) VALUES ($1, $2) RETURNING id', [type.id, 'Вымышленный модуль']);
  const v = await one('INSERT INTO monitoring.spec_versions (spec_id, version, frame_id, max_points) VALUES ($1, 1, $2, 20) RETURNING id', [spec.id, frame.id]);
  const writing = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'writing', 'Письмо', 1) RETURNING id", [v.id]);
  const part = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'test', 'Тест', 2) RETURNING id", [v.id]);
  const w1 = await one("INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, 1, 'Writing', 'basic', 'Writing: basic', 10) RETURNING id", [v.id, writing.id]);
  const t1 = await one("INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, 2, 'Grammar', 'basic', 'Grammar: basic', 10) RETURNING id", [v.id, part.id]);
  await db.query("UPDATE monitoring.spec_versions SET status = 'approved' WHERE id = $1", [v.id]);
  const work = await one(
    "INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status) VALUES ($1, 'Модуль 1', 1, 4, $2, $3, 'open') RETURNING id",
    [type.id, v.id, scale.id],
  );
  await db.query("INSERT INTO monitoring.work_parts (work_id, part_id, held_on) VALUES ($1, $2, '2026-10-13'), ($1, $3, '2026-10-14')", [work.id, writing.id, part.id]);
  await db.query('INSERT INTO monitoring.work_groups (work_id, group_id) VALUES ($1, 1), ($1, 2), ($1, 3)', [work.id]);
  const score = (student, task, value, group) => db.query('INSERT INTO monitoring.task_scores (work_id, task_id, student_id, group_id, score, updated_by) VALUES ($1, $2, $3, $4, $5, 101)', [work.id, task, student, group, value]);
  // Группа А: ученик 1 полностью, ученик 2 отсутствовал на письме и написал тест, ученик 3 только письмо.
  await score(1, w1.id, 5, 1); await score(1, t1.id, 6, 1);
  await db.query("INSERT INTO monitoring.part_status (work_id, part_id, student_id, group_id, status, updated_by) VALUES ($1, $2, 2, 1, 'absent', 101)", [work.id, writing.id]);
  await score(2, t1.id, 7, 1);
  await score(3, w1.id, 4, 1);
  // Группа В: оба ученика полностью.
  for (const s of [5, 6]) { await score(s, w1.id, 3, 3); await score(s, t1.id, 3, 3); }

  await t.test('учитель: только свои группы и прогресс «внесено X из N»', async () => {
    const r = await listWorks(db, 101, capabilities(new Set(['teacher'])));
    assert.equal(r.body.view, 'teacher');
    const groups = r.body.works[0].groups.map(g => [g.title, g.progress.done, g.progress.total]);
    assert.deepEqual(groups, [['Группа А', 2, 3], ['Группа В', 2, 2]]);
    assert.equal('spec_version_id' in r.body.works[0], false);
  });

  await t.test('заведующая и data_admin: таблица без прогресса', async () => {
    for (const roles of [['department_head'], ['data_admin'], ['teacher', 'department_head']]) {
      const r = await listWorks(db, 101, capabilities(new Set(roles)));
      assert.equal(r.body.view, 'table');
      assert.equal(r.body.works[0].groups.length, 3);
      assert.equal(r.body.works[0].groups.some(g => 'progress' in g), false);
    }
  });
});
