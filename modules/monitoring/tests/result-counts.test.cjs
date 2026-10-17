// Счётчики результатов старого раздела на странице schema: только числа, всего и за текущий год.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { resultCounts, placementBreakdown, placementSchema, catalogColumns, columnMap } = require('../server/schema.cjs');

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
    CREATE TABLE pulse_read.groups (id int, academic_year_id int, title text, code text, parallel int, campus text);
    CREATE TABLE pulse_read.terms (id int, academic_year_id int);
    CREATE TABLE pulse_read.score_sessions (id int, group_id int, term_id int);
    CREATE TABLE pulse_read.section_scores (id int, score_session_id int, score int);
    CREATE TABLE pulse_read.placement_results (id int, academic_year_id int, student_id int);
    CREATE TABLE pulse_read.placement_excluded (id int, created_at timestamptz);
    CREATE TABLE pulse_read.placement_notes (id int);
    CREATE TABLE pulse_read.placement_sessions (id int, group_id int, spec_id text, held_on date);
    CREATE TABLE pulse_read.placement_field_scores (id int, session_id int, student_id int, field_id text, score numeric, status text);
    INSERT INTO pulse_read.academic_years VALUES (1, '2025/2026', false, '2025-09-01'), (2, '2026/2027', true, '2026-09-01');
    INSERT INTO pulse_read.groups VALUES (10, 1, '6 AE', '6AE', 6, 'main'), (20, 2, '7 AE', '7AE', 7, 'main'), (21, 2, '7 AE', '7AE', 7, 'digital'), (22, 2, '5 BE', '5BE', 5, 'main');
    INSERT INTO pulse_read.terms VALUES (1, 1), (2, 2);
    INSERT INTO pulse_read.score_sessions VALUES (100, 10, 1), (200, 20, 2);
    INSERT INTO pulse_read.section_scores SELECT i, CASE WHEN i <= 3 THEN 100 ELSE 200 END, 5 FROM generate_series(1, 5) i;
    INSERT INTO pulse_read.placement_results SELECT i, CASE WHEN i <= 4 THEN 1 ELSE 2 END, i FROM generate_series(1, 7) i;
    INSERT INTO pulse_read.placement_excluded VALUES (1, '2026-03-01'), (2, '2026-09-15'), (3, '2027-08-31');
    -- Номера сессий входного теста пересекаются с score_sessions: 100 там прошлый год, а здесь текущий.
    INSERT INTO pulse_read.placement_sessions VALUES (100, 20, 's7', '2026-09-10'), (101, 21, 's7', '2026-09-11'), (102, 22, 's5', '2026-09-12'), (90, 10, 's6', '2025-09-10');
    -- Сессия 100: два ученика по два поля, у второго одно поле пустое. Сессия 101: один ученик. Сессия 102 без баллов.
    -- Сессия 90 прошлого года; строка 9 ссылается на несуществующую сессию.
    INSERT INTO pulse_read.placement_field_scores VALUES
      (1, 100, 1, 'f1', 5, 'complete'), (2, 100, 1, 'f2', 3, 'complete'),
      (3, 100, 2, 'f1', 4, 'incomplete'), (4, 100, 2, 'f2', NULL, 'incomplete'),
      (5, 101, 3, 'f1', 2, 'complete'),
      (6, 90, 4, 'f1', 1, 'complete'), (7, 90, 4, 'f2', 1, 'complete'),
      (8, 101, 5, 'f1', NULL, 'absent'),
      (9, 555, 6, 'f1', 1, 'complete');
  `);

  const r = await resultCounts(db);
  assert.equal(r.current_year, '2026/2027');
  const by = Object.fromEntries(r.tables.map(x => [x.table, [x.kind, x.total, x.current_year]]));
  assert.deepEqual(by, {
    placement_excluded: ['Входное тестирование', 3, 2],
    placement_field_scores: ['Входное тестирование', 9, 6],
    placement_notes: ['Входное тестирование', 0, null],
    placement_sessions: ['Входное тестирование', 4, 3],
    placement_results: ['Входное тестирование', 7, 3],
    score_sessions: ['Связанная таблица', 2, 1],
    section_scores: ['Секционные результаты', 5, 2],
  });
  assert.equal(r.tables.find(x => x.table === 'section_scores').year_by, 'score_session_id → score_sessions.term_id → terms.academic_year_id');
  // Баллы входного теста связаны с годом через placement_sessions, а не через score_sessions.
  assert.equal(r.tables.find(x => x.table === 'placement_field_scores').year_by, 'session_id → placement_sessions.group_id → groups.academic_year_id');
  // Наружу уходят только числа и названия, без строк с данными.
  assert.doesNotMatch(JSON.stringify(r), /student_id/);

  // Разбивка по параллелям и группам: сессии, ученики с баллами, заполненные баллы.
  const all = columnMap(await catalogColumns(db));
  const b = await placementBreakdown(db, all, 2);
  assert.deepEqual(b.missing, []);
  assert.deepEqual(b.groups.map(g => [g.parallel, g.title, g.digital, g.sessions, g.students, g.scores]), [
    [5, '5 BE', false, 1, 0, 0],
    [7, '7 AE', false, 1, 2, 3],
    [7, '7 AE', true, 1, 1, 1],
  ]);
  assert.equal(b.scores_without_session, 1);
  assert.ok(b.links.includes('балл → сессия: placement_field_scores.session_id → placement_sessions.id'));
  assert.doesNotMatch(JSON.stringify(b), /"student_id"|full_name/);

  // Материализованные представления тоже попадают в список полей.
  await db.query('CREATE MATERIALIZED VIEW pulse_read.placement_specs AS SELECT 1 AS id, 7 AS grade');
  const cat = await catalogColumns(db);
  assert.deepEqual(cat.filter(c => c.table_name === 'placement_specs').map(c => [c.column_name, c.relkind]), [['id', 'm'], ['grade', 'm']]);

  // Отдельный запрос: поля всех placement_*, включая материализованные; структура по spec_id; группы с несколькими сессиями.
  await db.query(`
    CREATE TABLE pulse_read.placement_spec_catalog (spec_id text, field_id text, max_score numeric);
    INSERT INTO pulse_read.placement_sessions VALUES (103, 20, 's7b', '2026-09-20');
    INSERT INTO pulse_read.placement_field_scores VALUES (10, 103, 1, 'f1', 7, 'complete'), (11, 103, 2, 'f1', NULL, 'absent');
  `);
  const ps = (await placementSchema(db)).body;
  assert.deepEqual(ps.fields.map(f => f.name), ['placement_excluded', 'placement_field_scores', 'placement_notes', 'placement_results', 'placement_sessions', 'placement_spec_catalog', 'placement_specs']);
  assert.equal(ps.fields.find(f => f.name === 'placement_specs').type, 'MATERIALIZED VIEW');
  assert.deepEqual(ps.fields.find(f => f.name === 'placement_spec_catalog').columns.map(c => c.name), ['spec_id', 'field_id', 'max_score']);
  assert.deepEqual(ps.structure_missing, []);
  assert.deepEqual(ps.specs.map(x => [x.spec_id, x.sessions, x.scores, x.parallels]), [['s5', 1, 0, [5]], ['s7', 2, 4, [7]], ['s7b', 1, 1, [7]]]);
  const s7 = ps.specs.find(x => x.spec_id === 's7');
  assert.deepEqual(s7.groups.map(g => [g.title, g.digital, g.sessions, g.scores]), [['7 AE', false, 1, 3], ['7 AE', true, 1, 1]]);
  assert.deepEqual(s7.fields, [
    { field_id: 'f1', rows: 4, filled: 3, min: 2, max: 5, statuses: { absent: 1, complete: 2, incomplete: 1 } },
    { field_id: 'f2', rows: 2, filled: 1, min: 3, max: 3, statuses: { complete: 1, incomplete: 1 } },
  ]);
  assert.deepEqual(s7.statuses, { absent: 1, complete: 3, incomplete: 2 });
  assert.deepEqual(ps.multi_session_groups, [{ title: '7 AE', parallel: 7, digital: false, sessions: [
    { id: 100, held_on: '2026-09-10', spec_id: 's7', scores: 3, rows: 4 },
    { id: 103, held_on: '2026-09-20', spec_id: 's7b', scores: 1, rows: 2 },
  ] }]);
  assert.doesNotMatch(JSON.stringify([ps.specs, ps.multi_session_groups]), /student|full_name/);

  // Без ссылки на сессию разбивка не строится и объясняет, чего не хватает.
  await db.query('ALTER TABLE pulse_read.placement_field_scores RENAME COLUMN session_id TO something_id');
  const none = await placementBreakdown(db, columnMap(await catalogColumns(db)), 2);
  assert.deepEqual(none.groups, []);
  assert.match(none.missing.join(' '), /нет ссылки на сессию/);
});
