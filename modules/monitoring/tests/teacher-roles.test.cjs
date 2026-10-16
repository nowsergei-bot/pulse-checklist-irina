// Миграция 006: роль «учитель» всем действующим учителям английского с учётной записью.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('миграция 006: роль учителя по справочнику учителей английского', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  t.after(() => db.end());
  // Тесты с базой идут по очереди: все проверки пересоздают схемы.
  await db.query('SELECT pg_advisory_lock(73001)');
  await db.query(`
    DROP SCHEMA IF EXISTS pulse_read CASCADE; CREATE SCHEMA pulse_read;
    CREATE TABLE pulse_read.users (id int, full_name text);
    CREATE TABLE pulse_read.english_teachers (id int, user_id int, full_name text, archived_at timestamptz);
    -- 1: учитель с учётной записью; 2: в архиве; 3: без учётной записи; 4: user_id без строки в users;
    -- 5: учитель, у которого роль уже есть; 6: две строки справочника на одну учётную запись.
    INSERT INTO pulse_read.users VALUES (101, 'Учитель 1'), (102, 'Учитель 2'), (105, 'Учитель 5'), (106, 'Учитель 6'), (107, 'Администратор 1');
    INSERT INTO pulse_read.english_teachers VALUES
      (1, 101, 'Учитель 1', NULL), (2, 102, 'Учитель 2', now()), (3, NULL, 'Учитель 3', NULL),
      (4, 104, 'Учитель 4', NULL), (5, 105, 'Учитель 5', NULL), (6, 106, 'Учитель 6', NULL), (7, 106, 'Учитель 6', NULL);
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files.filter(f => f < '006')) await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  await db.query("INSERT INTO monitoring.user_roles VALUES (105, 'teacher'), (105, 'department_head'), (107, 'deputy')");
  for (const file of files.filter(f => f >= '006')) await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));

  const roles = (await db.query('SELECT user_id, role FROM monitoring.user_roles ORDER BY user_id, role')).rows;
  assert.deepEqual(roles, [
    { user_id: 101, role: 'teacher' },
    { user_id: 105, role: 'department_head' },
    { user_id: 105, role: 'teacher' },
    { user_id: 106, role: 'teacher' },
    { user_id: 107, role: 'deputy' },
  ]);
  assert.equal(roles.some(r => r.role === 'data_admin'), false);
});
