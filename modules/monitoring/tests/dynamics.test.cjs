// Динамика: от входного через работы, прогресс к старту по порогу, стартовые группы, риск, пробный ЕГЭ, права.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
// База должна быть пустой: тест создаёт схемы monitoring и pulse_read с вымышленными данными.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { trend, dynamicsRisk } = require('../server/progress.cjs');

test('границы порога: +5 рост, -5 снижение, +4 и -4 без изменений', () => {
  assert.equal(trend(5, 5), 'up');
  assert.equal(trend(-5, 5), 'down');
  assert.equal(trend(4, 5), 'same');
  assert.equal(trend(-4, 5), 'same');
  assert.equal(trend(0, 5), 'same');
  assert.equal(trend(null, 5), null);
});

test('риск по динамике: падение к старту на 10 и два снижения подряд', () => {
  assert.deepEqual(dynamicsRisk([60, 50], 5).map(r => r.code), ['drop_to_start']);
  assert.deepEqual(dynamicsRisk([60, 51], 5), [], '9 пунктов не риск');
  assert.deepEqual(dynamicsRisk([60, 55, 56, 51], 5), [], 'снижения не подряд');
  assert.deepEqual(dynamicsRisk([80, 65, 50], 5).map(r => r.code), ['drop_to_start', 'two_drops']);
  assert.deepEqual(dynamicsRisk([null, 70, 64, 58], 5).map(r => r.code), ['two_drops'], 'без входного падение к старту не считается');
  assert.deepEqual(dynamicsRisk([70, null, 64, 58], 5).map(r => r.code), ['drop_to_start', 'two_drops'], 'пропуск работы не разрывает ряд');
});

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('динамика в базе', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
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
    INSERT INTO pulse_read.groups VALUES (1, '11 А', '11A', 'main', 11, 1, NULL), (2, '11 Ц', '11D', 'digital', 11, 1, NULL);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL), (2, 102, 'Учитель 2', NULL);
    INSERT INTO pulse_read.users VALUES (1, 'Администратор'), (2, 'Заведующая'), (101, 'Учитель 1'), (102, 'Учитель 2');
    INSERT INTO pulse_read.group_teachers VALUES (1, 1), (2, 2);
    INSERT INTO pulse_read.students SELECT i, 'Ученик ' || i FROM generate_series(1, 6) i;
    INSERT INTO pulse_read.group_memberships VALUES (1, 1, 1), (2, 2, 1), (3, 3, 1), (4, 4, 1), (5, 5, 1), (6, 6, 2);
    INSERT INTO pulse_read.placement_spec_uploads VALUES ('p11', '2026/2027', '{"id":"p11","grade":11,"fields":[
      {"id":"l1","section":"Listening","max_score":50},{"id":"r1","section":"Reading","max_score":50}]}', '2026-09-01', NULL);
    INSERT INTO pulse_read.placement_approvals VALUES ('p11', 'approved');
    INSERT INTO pulse_read.placement_sessions VALUES (1, 1, 1, 'p11', '2026-09-10'), (2, 1, 2, 'p11', '2026-09-10');
    -- Входное (итог из 100): ученик 1: 45, 2: 55, 3: 46, 4: 54, 5: нет, 6: 80.
    INSERT INTO pulse_read.placement_field_scores (session_id, student_id, field_id, score, status) VALUES
      (1, 1, 'l1', 20, 'complete'), (1, 1, 'r1', 25, 'complete'), (1, 2, 'l1', 30, 'complete'), (1, 2, 'r1', 25, 'complete'),
      (1, 3, 'l1', 23, 'complete'), (1, 3, 'r1', 23, 'complete'), (1, 4, 'l1', 27, 'complete'), (1, 4, 'r1', 27, 'complete'),
      (2, 6, 'l1', 40, 'complete'), (2, 6, 'r1', 40, 'complete');
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  await db.query("INSERT INTO monitoring.user_roles (user_id, role) VALUES (1, 'data_admin'), (2, 'department_head'), (101, 'teacher'), (102, 'teacher') ON CONFLICT DO NOTHING");
  const { createWorks } = require('../server/works.cjs');
  const route = require('../server/routes.cjs');
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = (userId, p, method = 'GET', query = {}, body = null) => route({ path: p, method, query, body, user: { id: userId }, db });
  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'ege_mock'");
  const version = await one('SELECT v.id FROM monitoring.spec_versions v JOIN monitoring.specs s ON s.id = v.spec_id WHERE s.type_id = $1', [type.id]);
  const tasks = (await db.query('SELECT id FROM monitoring.spec_tasks WHERE version_id = $1 ORDER BY sort', [version.id])).rows.map(r => r.id);
  const make = async (title, date) => (await createWorks(db, 1, {
    type_id: type.id, title, academic_year_id: 1, parallels: [11], spec_version_id: version.id, scale_id: null, status: 'open', groups: [1, 2], dates: { test: date },
  })).body.created[0];
  const w1 = await make('Пробный ЕГЭ 1', '2026-10-20');
  const w2 = await make('Пробный ЕГЭ 2', '2026-12-10');
  const put = async (workId, studentId, groupId, values) => {
    for (let i = 0; i < values.length; i += 1) {
      await db.query('INSERT INTO monitoring.task_scores (work_id, task_id, student_id, group_id, score, updated_by) VALUES ($1, $2, $3, $4, $5, 1)', [workId, tasks[i], studentId, groupId, values[i]]);
    }
  };
  const P50 = [1, 1, 3, 1, 1, 3, 3, 2, 3, 3, 10]; // 31 из 62 = 50 %
  const P65 = [2, 3, 7, 3, 2, 7, 6, 5, 5, 0, 0]; // 40 из 62 = 65 %
  for (const id of [1, 2, 3, 4, 5]) await put(w2, id, 1, P50);
  await put(w1, 6, 2, P65);
  await put(w2, 6, 2, P50);

  const row = (body, title) => body.rows.find(r => r.row === title);

  await t.test('линия по работам, прогресс к старту и стартовые группы', async () => {
    const r = await call(1, '/progress/dynamics');
    assert.equal(r.status, 200);
    assert.equal(r.body.parallel, 11);
    assert.deepEqual(r.body.points.map(p => p.title), ['Входное', 'Пробный ЕГЭ 1', 'Пробный ЕГЭ 2']);
    assert.equal(r.body.work, 'Пробный ЕГЭ 2', 'по умолчанию последняя работа');
    assert.equal(r.body.threshold, 5);
    const g = row(r.body, '11 А');
    assert.deepEqual(g.lines.placement.total, { avg: 50, n: 4 });
    assert.equal(g.lines['Пробный ЕГЭ 1'].total, null);
    assert.deepEqual(g.lines['Пробный ЕГЭ 2'].total, { avg: 50, n: 5 });
    assert.deepEqual(g.progress.total, { up: 1, same: 2, down: 1, no_data: 1, students: 5 }, '+5 рост, -5 снижение, +4 и -4 без изменений, без входного не в долях');
    const [low, mid, high] = g.bands.total;
    assert.deepEqual(low, { code: 'low', name: 'меньше 50 %', n: 2, up: 1, same: 1, down: 0, avg_gain: 4.5 });
    assert.deepEqual(mid, { code: 'mid', name: '50-74 %', n: 2, up: 0, same: 1, down: 1, avg_gain: -4.5 });
    assert.equal(high.n, 0);
    assert.equal(high.avg_gain, null);
    const p = row(r.body, '11 параллель');
    assert.deepEqual(p.progress.total, { up: 1, same: 2, down: 2, no_data: 1, students: 6 });
    assert.deepEqual(p.lines['Пробный ЕГЭ 1'].total, { avg: 65, n: 1 });
    const earlier = await call(1, '/progress/dynamics', 'GET', { work: 'Пробный ЕГЭ 1' });
    assert.deepEqual(row(earlier.body, '11 А').progress.total.no_data, 5, 'нет полной работы: нет данных');
  });

  await t.test('карточка ученика и зона риска', async () => {
    const r = await call(1, '/progress/dynamics', 'GET', { group: '2' });
    assert.equal(r.body.group, 2);
    const s = r.body.students.find(x => x.id === 6);
    assert.deepEqual(['placement', 'Пробный ЕГЭ 1', 'Пробный ЕГЭ 2'].map(k => s.values[k].total), [80, 65, 50]);
    assert.equal(s.to_start, -30);
    assert.deepEqual(r.body.risk.map(x => [x.full_name, x.reasons.map(y => y.code)]), [['Ученик 6', ['drop_to_start', 'two_drops']]]);
    assert.equal(r.body.risk[0].reasons[0].text, 'ниже входного на 30 пунктов');
    const head = await call(2, '/progress/dynamics');
    assert.equal(head.body.risk.length, 1, 'заведующая видит риск');
  });

  await t.test('пробный ЕГЭ: первичный балл, блоки, уровни', async () => {
    const r = await call(1, '/progress/dynamics');
    assert.equal(r.body.ege.max_points, 62);
    assert.equal(r.body.ege.blocks.length, 11);
    assert.deepEqual(r.body.ege.blocks[2], { title: 'Задания 3-9', section: 'Аудирование', level: 'high', level_name: 'Повышенный', max: 7 });
    const g = r.body.ege.rows.find(x => x.row === '11 А');
    assert.deepEqual([g.complete, g.avg_total, g.avg_percent, g.blocks[0], g.basic, g.high], [5, 31, 50, 50, 44, 54]);
    assert.ok(!JSON.stringify(r.body).includes('"mark"'), 'без отметок');
  });

  await t.test('учитель: только свои группы и ученики при любом запросе', async () => {
    const r = await call(101, '/progress/dynamics', 'GET', { group: '2', parallel: '11' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.rows.map(x => x.row), ['11 А', '11 параллель']);
    assert.deepEqual(r.body.groups.map(g => g.id), [1]);
    assert.equal(r.body.group, 1, 'чужая группа из запроса не отдаётся');
    assert.equal(r.body.risk, null);
    assert.ok(!JSON.stringify(r.body).includes('Ученик 6'));
    const other = await call(102, '/progress/dynamics', 'GET', { group: '1' });
    assert.deepEqual(other.body.students.map(x => x.id), [6]);
    assert.ok(!JSON.stringify(other.body).includes('Ученик 1"'));
    assert.equal((await call(999, '/progress/dynamics')).status, 403);
    assert.equal((await call(101, '/progress/settings')).status, 403);
    assert.equal((await call(2, '/progress/settings', 'POST', {}, { threshold: 4 })).status, 403);
  });

  await t.test('порог меняет data_admin', async () => {
    assert.equal((await call(1, '/progress/settings', 'POST', {}, { threshold: 0 })).status, 400);
    const s = await call(1, '/progress/settings', 'POST', {}, { threshold: 4 });
    assert.equal(s.status, 200);
    assert.equal(s.body.threshold, 4);
    assert.equal(s.body.updated_by_name, 'Администратор');
    const r = await call(1, '/progress/dynamics');
    assert.deepEqual(row(r.body, '11 А').progress.total, { up: 2, same: 0, down: 2, no_data: 1, students: 5 });
  });
});
