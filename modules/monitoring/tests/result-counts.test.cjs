// Счётчики результатов старого раздела на странице schema: только числа, всего и за текущий год.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { resultCounts } = require('../server/schema.cjs');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('счётчики результатов pulse_read', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  t.after(() => db.end());
  // Тесты с базой идут по очереди: все проверки пересоздают pulse_read.
  await db.query('SELECT pg_advisory_lock(73001)');
  await db.query(`
    DROP SCHEMA IF EXISTS pulse_read CASCADE; CREATE SCHEMA pulse_read;
    CREATE TABLE pulse_read.academic_years (id int, label text, is_current boolean, starts_on date);
    CREATE TABLE pulse_read.groups (id int, academic_year_id int);
    CREATE TABLE pulse_read.terms (id int, academic_year_id int);
    CREATE TABLE pulse_read.score_sessions (id int, group_id int, term_id int);
    CREATE TABLE pulse_read.section_scores (id int, score_session_id int, score int);
    CREATE TABLE pulse_read.placement_results (id int, academic_year_id int, student_id int);
    CREATE TABLE pulse_read.placement_excluded (id int, created_at timestamptz);
    CREATE TABLE pulse_read.placement_notes (id int);
    INSERT INTO pulse_read.academic_years VALUES (1, '2025/2026', false, '2025-09-01'), (2, '2026/2027', true, '2026-09-01');
    INSERT INTO pulse_read.groups VALUES (10, 1), (20, 2);
    INSERT INTO pulse_read.terms VALUES (1, 1), (2, 2);
    INSERT INTO pulse_read.score_sessions VALUES (100, 10, 1), (200, 20, 2);
    INSERT INTO pulse_read.section_scores SELECT i, CASE WHEN i <= 3 THEN 100 ELSE 200 END, 5 FROM generate_series(1, 5) i;
    INSERT INTO pulse_read.placement_results SELECT i, CASE WHEN i <= 4 THEN 1 ELSE 2 END, i FROM generate_series(1, 7) i;
    INSERT INTO pulse_read.placement_excluded VALUES (1, '2026-03-01'), (2, '2026-09-15'), (3, '2027-08-31');
  `);

  const r = await resultCounts(db);
  assert.equal(r.current_year, '2026/2027');
  const by = Object.fromEntries(r.tables.map(x => [x.table, [x.kind, x.total, x.current_year]]));
  assert.deepEqual(by, {
    placement_excluded: ['Входное тестирование', 3, 2],
    placement_notes: ['Входное тестирование', 0, null],
    placement_results: ['Входное тестирование', 7, 3],
    score_sessions: ['Связанная таблица', 2, 1],
    section_scores: ['Секционные результаты', 5, 2],
  });
  assert.equal(r.tables.find(x => x.table === 'section_scores').year_by, 'score_session_id → score_sessions.term_id → terms.academic_year_id');
  // Наружу уходят только числа и названия, без строк с данными.
  assert.doesNotMatch(JSON.stringify(r), /student_id/);
});
