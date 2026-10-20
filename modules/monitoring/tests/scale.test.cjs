// Миграция 004: шкала по Положению о системе оценивания для всех работ, в том числе уже созданных.
// Миграция 010: «4» от 74 % (решение кафедры 20.10.2026).
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
// База должна быть пустой: тест создаёт схему monitoring и применяет миграции.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('миграция 004: шкала по Положению', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  t.after(() => db.end());
  // Тесты с базой идут по очереди: все проверки пересоздают схему monitoring.
  await db.query('SELECT pg_advisory_lock(73001)');

  // Миграция 006 читает справочник учителей: пустые представления pulse_read.
  await db.query(`
    DROP SCHEMA IF EXISTS pulse_read CASCADE; CREATE SCHEMA pulse_read;
    CREATE TABLE pulse_read.users (id int, full_name text);
    CREATE TABLE pulse_read.english_teachers (id int, user_id int, full_name text, archived_at timestamptz);
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const apply = (file) => db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  for (const file of files.filter(f => f < '004')) await apply(file);

  // Работа, созданная до миграции, со старой шкалой и баллами.
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'module'");
  const frame = await one('SELECT id FROM monitoring.frames LIMIT 1');
  const old = await one("SELECT id FROM monitoring.grade_scales WHERE name = 'Пятибалльная'");
  const spec = await one('INSERT INTO monitoring.specs (type_id, title) VALUES ($1, $2) RETURNING id', [type.id, 'Вымышленный модуль']);
  const v = await one('INSERT INTO monitoring.spec_versions (spec_id, version, frame_id, max_points) VALUES ($1, 1, $2, 50) RETURNING id', [spec.id, frame.id]);
  const part = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'test', 'Тест', 1) RETURNING id", [v.id]);
  const task = await one("INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, 1, 'Grammar', 'basic', 'Grammar: базовый', 50) RETURNING id", [v.id, part.id]);
  await db.query("UPDATE monitoring.spec_versions SET status = 'approved', approved_by = 1, approved_at = now() WHERE id = $1", [v.id]);
  const work = await one("INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status) VALUES ($1, 'Работа до миграции', 1, 7, $2, $3, 'open') RETURNING id", [type.id, v.id, old.id]);
  await db.query('INSERT INTO monitoring.task_scores (work_id, task_id, student_id, group_id, score, updated_by) VALUES ($1, $2, 1, 1, 27, 1)', [work.id, task.id]);

  for (const file of files.filter(f => f >= '004')) await apply(file);

  await t.test('одна шкала, она по умолчанию, пороги в процентах', async () => {
    const scales = (await db.query('SELECT name, is_default FROM monitoring.grade_scales')).rows;
    assert.deepEqual(scales, [{ name: 'Положение о системе оценивания', is_default: true }]);
    const rows = (await db.query('SELECT mark, min_percent FROM monitoring.grade_scale_rows ORDER BY min_percent DESC')).rows;
    assert.deepEqual(rows, [{ mark: '5', min_percent: 90 }, { mark: '4', min_percent: 74 }, { mark: '3', min_percent: 50 }, { mark: '2', min_percent: 0 }]);
  });

  await t.test('созданная раньше работа переходит на новую шкалу, баллы на месте', async () => {
    const w = await one('SELECT s.name FROM monitoring.works w JOIN monitoring.grade_scales s ON s.id = w.scale_id WHERE w.id = $1', [work.id]);
    assert.equal(w.name, 'Положение о системе оценивания');
    const s = await one('SELECT score FROM monitoring.task_scores WHERE work_id = $1', [work.id]);
    assert.equal(s.score, 27);
  });

  await t.test('порог только от 0 до 100', async () => {
    const scale = await one('SELECT id FROM monitoring.grade_scales');
    await assert.rejects(db.query("INSERT INTO monitoring.grade_scale_rows (scale_id, mark, min_percent) VALUES ($1, '1', 101)", [scale.id]));
    await assert.rejects(db.query("INSERT INTO monitoring.grade_scale_rows (scale_id, mark) VALUES ($1, '1')", [scale.id]));
  });
});
