// Сравнение работ с входным тестированием по общим разделам: проценты, сопоставление полей, права.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
// База должна быть пустой: тест создаёт схемы monitoring и pulse_read с вымышленными данными.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('сравнение с входным', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
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
    CREATE TABLE pulse_read.placement_field_scores (id int, session_id int, student_id int, field_id text, score numeric, status text);
    CREATE TABLE pulse_read.placement_spec_uploads (spec_id text, academic_year text, spec_json jsonb, uploaded_at timestamptz, archived_at timestamptz);
    CREATE TABLE pulse_read.placement_approvals (spec_id text, status text);
    INSERT INTO pulse_read.academic_years VALUES (1, '2026/2027', true, '2026-09-01');
    INSERT INTO pulse_read.groups VALUES (1, '11 А', '11A', 'main', 11, 1, NULL), (2, '11 Ц', '11D', 'digital', 11, 1, NULL), (3, '10 А', '10A', 'main', 10, 1, NULL);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL), (2, 102, 'Учитель 2', NULL);
    INSERT INTO pulse_read.users VALUES (1, 'Администратор'), (2, 'Заведующая'), (3, 'Заместитель'), (101, 'Учитель 1'), (102, 'Учитель 2');
    INSERT INTO pulse_read.group_teachers VALUES (1, 1), (2, 2), (1, 3);
    INSERT INTO pulse_read.students SELECT i, 'Ученик ' || i FROM generate_series(1, 6) i;
    INSERT INTO pulse_read.group_memberships VALUES (1, 1, 1), (2, 2, 1), (3, 3, 1), (4, 4, 2), (5, 5, 3), (6, 6, 3);
    INSERT INTO pulse_read.placement_spec_uploads VALUES
      ('p11', '2026/2027', '{"id":"p11","grade":11,"fields":[
        {"id":"l1","section":"Listening","excel_label":"L","max_score":10},
        {"id":"r1","section":"Reading","excel_label":"R","max_score":10},
        {"id":"g1","section":"Use of English","excel_label":"G","max_score":10},
        {"id":"w1","section":"Writing","excel_label":"W","max_score":20},
        {"id":"s1","section":"Speaking","excel_label":"S","max_score":10}]}', '2026-09-01', NULL),
      ('p10', '2026/2027', '{"id":"p10","grade":10,"fields":[
        {"id":"l1","section":"Listening","excel_label":"L","max_score":10},
        {"id":"x1","section":"Проект","excel_label":"P","max_score":5},
        {"id":"r1","section":"Reading","excel_label":"R","proposed_max_score":10}]}', '2026-09-01', NULL);
    INSERT INTO pulse_read.placement_approvals VALUES ('p11', 'approved'), ('p10', 'approved');
    INSERT INTO pulse_read.placement_sessions VALUES (1, 1, 1, 'p11', '2026-09-10'), (2, 1, 2, 'p11', '2026-09-11'), (3, 1, 3, 'p10', '2026-09-12');
    -- Ученик 1: аудирование 50, чтение 60, грамматика и лексика 70, письмо 50, итог 28 из 50 = 56.
    -- Ученик 2: все поля полностью, 100. Ученик 3: входного нет. Ученик 4: аудирование не внесено, итога нет.
    -- Ученик 5 (10 класс): аудирование 80; поле «Проект» не сопоставлено, «Чтение» без утверждённого максимума.
    INSERT INTO pulse_read.placement_field_scores VALUES
      (1, 1, 1, 'l1', 5, 'complete'), (2, 1, 1, 'r1', 6, 'complete'), (3, 1, 1, 'g1', 7, 'complete'), (4, 1, 1, 'w1', 10, 'complete'), (5, 1, 1, 's1', 3, 'complete'),
      (6, 1, 2, 'l1', 10, 'complete'), (7, 1, 2, 'r1', 10, 'complete'), (8, 1, 2, 'g1', 10, 'complete'), (9, 1, 2, 'w1', 20, 'complete'),
      (10, 2, 4, 'l1', NULL, 'absent'), (11, 2, 4, 'r1', 5, 'complete'), (12, 2, 4, 'g1', 5, 'complete'), (13, 2, 4, 'w1', 10, 'complete'),
      (14, 3, 5, 'l1', 8, 'complete'), (15, 3, 5, 'x1', 2, 'complete'), (16, 3, 5, 'r1', 1, 'complete');
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  await db.query("INSERT INTO monitoring.user_roles (user_id, role) VALUES (1, 'data_admin'), (2, 'department_head'), (3, 'deputy'), (101, 'teacher'), (102, 'teacher') ON CONFLICT DO NOTHING");
  const { createWorks } = require('../server/works.cjs');
  const route = require('../server/routes.cjs');
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = (userId, p, method = 'GET', query = {}, body = null) => route({ path: p, method, query, body, user: { id: userId }, db });

  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'ege_mock'");
  const version = await one('SELECT v.id FROM monitoring.spec_versions v JOIN monitoring.specs s ON s.id = v.spec_id WHERE s.type_id = $1', [type.id]);
  const tasks = (await db.query('SELECT id FROM monitoring.spec_tasks WHERE version_id = $1 ORDER BY sort', [version.id])).rows.map(r => r.id);
  const created = await createWorks(db, 1, {
    type_id: type.id, title: 'Пробный ЕГЭ 1', academic_year_id: 1, parallels: [11, 10], spec_version_id: version.id,
    scale_id: null, status: 'open', groups: [1, 2, 3], dates: { test: '2026-11-20' },
  });
  assert.equal(created.status, 200);
  const [w11, w10] = created.body.created;
  const FULL = [2, 3, 7, 3, 2, 7, 6, 5, 7, 6, 14];
  const put = async (workId, studentId, groupId, values) => {
    for (let i = 0; i < values.length; i += 1) {
      await db.query('INSERT INTO monitoring.task_scores (work_id, task_id, student_id, group_id, score, updated_by) VALUES ($1, $2, $3, $4, $5, 1)', [workId, tasks[i], studentId, groupId, values[i]]);
    }
  };
  // Ученик 1: аудирование 6 из 12 = 50, чтение 7 из 12 = 58, грамматика и лексика 9 из 18 = 50, письмо 10 из 20 = 50, итог 32 из 62 = 52.
  await put(w11, 1, 1, [1, 2, 3, 2, 1, 4, 3, 3, 3, 3, 7]);
  await put(w11, 2, 1, FULL);
  await put(w11, 3, 1, FULL);
  await put(w11, 4, 2, FULL);
  await put(w10, 5, 3, FULL);
  // Ученик 6: работа не полная, в сравнение не идёт.
  await put(w10, 6, 3, [1, 1]);

  const byRow = (rows, title) => rows.find(r => r.row === title);

  await t.test('проценты по разделам у учеников с входным и полной работой', async () => {
    const r = await call(1, '/progress/compare', 'GET', { work: 'Пробный ЕГЭ 1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.caption, 'Работы разные, сравниваются проценты выполнения');
    assert.equal(r.body.work, 'Пробный ЕГЭ 1');
    assert.deepEqual(r.body.rows.map(x => x.row), ['10 А', '10 параллель', '11 А', '11 Ц', '11 параллель']);
    const g1 = byRow(r.body.rows, '11 А');
    assert.deepEqual([g1.students, g1.compared, g1.no_data], [3, 2, 1], 'ученик без входного не входит в сравнение');
    assert.deepEqual(g1.sections.total, { start: 78, work: 76, diff: -2, n: 2 });
    assert.deepEqual(g1.sections.listening, { start: 75, work: 75, diff: 0, n: 2 });
    assert.deepEqual(g1.sections.reading, { start: 80, work: 79, diff: -1, n: 2 });
    assert.deepEqual(g1.sections.use, { start: 85, work: 75, diff: -10, n: 2 });
    const g2 = byRow(r.body.rows, '11 Ц');
    assert.equal(g2.digital, true);
    assert.equal(g2.compared, 0, 'без итога входного ученик не считается сравнённым');
    assert.equal(g2.sections.total, null);
    assert.equal(g2.sections.listening, null, 'аудирование входного не внесено');
    assert.deepEqual(g2.sections.reading, { start: 50, work: 100, diff: 50, n: 1 }, 'внесённые разделы сравниваются');
    const p11 = byRow(r.body.rows, '11 параллель');
    assert.deepEqual([p11.students, p11.compared, p11.no_data], [4, 2, 2]);
    const g3 = byRow(r.body.rows, '10 А');
    assert.deepEqual(g3.sections.total, { start: 80, work: 100, diff: 20, n: 1 }, 'несопоставленное поле и поле без утверждённого максимума в итог не идут');
    assert.equal(g3.sections.reading, null);
    assert.ok(!JSON.stringify(r.body).includes('Ученик'), 'без ФИО');
    assert.ok(r.body.placement_fields, 'поля входного видит data_admin');
  });

  await t.test('учитель видит только свои группы, заведующая и заместитель директора все', async () => {
    const own = await call(102, '/progress/compare', 'GET', { work: 'Пробный ЕГЭ 1' });
    assert.equal(own.status, 200);
    assert.deepEqual(own.body.rows.map(x => x.row), ['11 Ц', '11 параллель']);
    assert.equal(own.body.placement_fields, undefined);
    const other = await call(101, '/progress/compare', 'GET', { work: 'Пробный ЕГЭ 1', group: '2' });
    assert.ok(!other.body.rows.some(x => x.row === '11 Ц'), 'чужая группа не отдаётся ни при каком запросе');
    const head = await call(2, '/progress/compare');
    assert.equal(head.body.rows.length, 5);
    assert.equal(head.body.placement_fields, undefined);
    assert.deepEqual((await call(3, '/progress/compare')).body, head.body);
    assert.equal((await call(3, '/progress/placement-map', 'POST', {}, { spec_id: 'p11', field_id: 'r1', section: 'none' })).status, 403, 'заместитель только смотрит');
    assert.equal((await call(999, '/progress/compare')).status, 403, 'без роли модуля нет доступа');
    assert.equal((await call(1, '/progress/compare', 'POST')).status, 405);
  });

  await t.test('сопоставление полей: предложение, сохранение, причины исключения', async () => {
    assert.equal((await call(2, '/progress/placement-map')).status, 403, 'меняет только data_admin');
    assert.equal((await call(101, '/progress/placement-map', 'POST', {}, { spec_id: 'p11', field_id: 'r1', section: 'none' })).status, 403);
    const r = await call(1, '/progress/placement-map');
    assert.equal(r.status, 200);
    const p11 = r.body.specs.find(s => s.spec_id === 'p11');
    const f = (spec, id) => spec.fields.find(x => x.field_id === id);
    assert.deepEqual(p11.parallels, [11]);
    assert.equal(f(p11, 'g1').section, 'use');
    assert.equal(f(p11, 'g1').source_section, 'Use of English');
    assert.equal(f(p11, 's1').reason, 'не сопоставлено');
    const p10 = r.body.specs.find(s => s.spec_id === 'p10');
    assert.equal(f(p10, 'x1').reason, 'не сопоставлено');
    assert.equal(f(p10, 'r1').reason, 'максимум не утверждён');
    assert.equal((await call(1, '/progress/placement-map', 'POST', {}, { spec_id: 'p11', field_id: 'r1', section: 'speaking' })).status, 400);
    assert.equal((await call(1, '/progress/placement-map', 'POST', {}, { spec_id: 'p11', field_id: 'r1', section: 'none' })).status, 200);
    const saved = await call(1, '/progress/placement-map');
    const r1 = f(saved.body.specs.find(s => s.spec_id === 'p11'), 'r1');
    assert.deepEqual([r1.saved, r1.section, r1.saved_by, r1.reason], ['none', null, 'Администратор', 'не сопоставлено']);
    // Без чтения: у ученика 1 входное 22 из 40 = 55.
    const after = await call(1, '/progress/compare', 'GET', { work: 'Пробный ЕГЭ 1' });
    assert.equal(byRow(after.body.rows, '11 А').sections.total.start, 77.5);
    assert.equal(byRow(after.body.rows, '11 А').sections.reading, null);
    await call(1, '/progress/placement-map', 'POST', {}, { spec_id: 'p11', field_id: 'r1', section: null });
    const back = await call(1, '/progress/compare', 'GET', { work: 'Пробный ЕГЭ 1' });
    assert.equal(byRow(back.body.rows, '11 А').sections.total.start, 78, 'снова действует предложение');
  });
});
