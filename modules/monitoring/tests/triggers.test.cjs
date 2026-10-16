// Проверка триггеров миграции 003 на отдельной пустой базе PostgreSQL.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
// База должна быть пустой: тест создаёт схему monitoring и применяет все миграции.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('триггеры миграции 003', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  t.after(() => db.end());
  // Тесты с базой идут по очереди: обе проверки пересоздают схему monitoring.
  await db.query('SELECT pg_advisory_lock(73001)');

  // Миграция 006 читает справочник учителей: пустые представления pulse_read.
  await db.query(`
    DROP SCHEMA IF EXISTS pulse_read CASCADE; CREATE SCHEMA pulse_read;
    CREATE TABLE pulse_read.users (id int, full_name text);
    CREATE TABLE pulse_read.english_teachers (id int, user_id int, full_name text, archived_at timestamptz);
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }

  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'module'");
  const frame = await one('SELECT id FROM monitoring.frames LIMIT 1');
  const scale = await one('SELECT id FROM monitoring.grade_scales LIMIT 1');
  const spec = await one('INSERT INTO monitoring.specs (type_id, title) VALUES ($1, $2) RETURNING id', [type.id, 'Модуль 1']);

  async function version(n) {
    const v = await one('INSERT INTO monitoring.spec_versions (spec_id, version, frame_id, max_points) VALUES ($1, $2, $3, 50) RETURNING id', [spec.id, n, frame.id]);
    const part = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'test', 'Тест', 1) RETURNING id", [v.id]);
    const task = await one("INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, 1, 'Grammar', 'advanced', 'Grammar: повышенный', 10) RETURNING id", [v.id, part.id]);
    return { id: v.id, part: part.id, task: task.id };
  }
  const v1 = await version(1);
  const v2 = await version(2);
  await db.query("UPDATE monitoring.spec_versions SET status = 'approved', approved_by = 1, approved_at = now() WHERE id = $1", [v1.id]);

  await t.test('утверждённую версию нельзя изменить или удалить', async () => {
    await assert.rejects(db.query('UPDATE monitoring.spec_versions SET max_points = 40 WHERE id = $1', [v1.id]), /Утверждённую версию спецификации нельзя/);
    await assert.rejects(db.query('DELETE FROM monitoring.spec_versions WHERE id = $1', [v1.id]), /Утверждённую версию спецификации нельзя/);
  });

  await t.test('части и задания утверждённой версии нельзя изменить, удалить или добавить', async () => {
    await assert.rejects(db.query('UPDATE monitoring.spec_tasks SET max_points = 5 WHERE id = $1', [v1.task]), /утверждённой версии/);
    await assert.rejects(db.query('DELETE FROM monitoring.spec_tasks WHERE id = $1', [v1.task]), /утверждённой версии/);
    await assert.rejects(db.query("UPDATE monitoring.spec_parts SET name = 'Другое' WHERE id = $1", [v1.part]), /утверждённой версии/);
    await assert.rejects(db.query("INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, 2, 'Reading', 'basic', 'Новое', 5)", [v1.id, v1.part]), /утверждённой версии/);
  });

  await t.test('черновик можно править', async () => {
    await db.query('UPDATE monitoring.spec_tasks SET max_points = 5 WHERE id = $1', [v2.task]);
    await db.query('UPDATE monitoring.spec_versions SET max_points = 45 WHERE id = $1', [v2.id]);
  });

  const work = await one("INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status, is_test) VALUES ($1, 'Проверка', 1, 7, $2, $3, 'open', true) RETURNING id", [type.id, v1.id, scale.id]);
  const insertScore = (task, score) => db.query('INSERT INTO monitoring.task_scores (work_id, task_id, student_id, group_id, score, updated_by) VALUES ($1, $2, 1, 1, $3, 1)', [work.id, task, score]);

  await t.test('балл больше максимума задания отклоняется', async () => {
    await assert.rejects(insertScore(v1.task, 11), /Балл 11 больше максимума задания \(10\)/);
  });

  await t.test('задание из другой версии спецификации отклоняется', async () => {
    await assert.rejects(insertScore(v2.task, 3), /Задание не относится к спецификации этой работы/);
  });

  await t.test('балл в пределах максимума и пустой балл сохраняются, повторный балл не создаётся', async () => {
    await insertScore(v1.task, 10);
    await assert.rejects(insertScore(v1.task, 4), /duplicate key/);
    await db.query('UPDATE monitoring.task_scores SET score = NULL WHERE work_id = $1', [work.id]);
    await assert.rejects(db.query('UPDATE monitoring.task_scores SET score = 12 WHERE work_id = $1', [work.id]), /больше максимума/);
  });

  await t.test('работа только по утверждённой версии спецификации', async () => {
    await assert.rejects(db.query("INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, is_test) VALUES ($1, 'Черновик', 1, 7, $2, $3, true)", [type.id, v2.id, scale.id]), /Работу можно создать только по утверждённой спецификации/);
    await assert.rejects(db.query('UPDATE monitoring.works SET spec_version_id = $2 WHERE id = $1', [work.id, v2.id]), /Работу можно создать только по утверждённой спецификации/);
    await db.query("UPDATE monitoring.works SET title = 'Проверка 2' WHERE id = $1", [work.id]);
  });

  await t.test('отметка о присутствии только для части из спецификации работы', async () => {
    const mark = part => db.query("INSERT INTO monitoring.part_status (work_id, part_id, student_id, group_id, status, updated_by) VALUES ($1, $2, 1, 1, 'absent', 1)", [work.id, part]);
    await assert.rejects(mark(v2.part), /Часть не относится к спецификации этой работы/);
    await mark(v1.part);
    await assert.rejects(db.query('UPDATE monitoring.part_status SET part_id = $2 WHERE work_id = $1', [work.id, v2.part]), /Часть не относится к спецификации этой работы/);
  });

  await t.test('половинок баллов нет', async () => {
    // Баллы приходят параметром запроса: дробное значение база не принимает.
    await assert.rejects(db.query('UPDATE monitoring.task_scores SET score = $2 WHERE work_id = $1', [work.id, 2.5]), /integer/);
  });
});
