// Экран «Динамика» по макету: полнота данных, группы с результатами, разделы, слабые блоки, положение к параллели,
// место в параллели. Вымышленные данные.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { places, weakBlocks, positionChange, lowQuarterCut, tableRow, SECTION_CODES } = require('../server/progress.cjs');

test('место в параллели: при равенстве диапазон', () => {
  const p = places([{ id: 1, percent: 89 }, { id: 2, percent: 89 }, { id: 3, percent: 85 }, { id: 4, percent: 70 }]);
  assert.deepEqual([p.get(1), p.get(2), p.get(3), p.get(4)], ['1-2 из 4', '1-2 из 4', '3 из 4', '4 из 4']);
});

test('слабые блоки: три самых низких ниже 85, по возрастанию; если все от 85, слабых нет', () => {
  const b = (list) => list.map((percent, index) => ({ index, percent }));
  assert.deepEqual(weakBlocks(b([90, 58, 71, 79, 84, 95])).map(x => x.index), [1, 2, 3]);
  assert.deepEqual(weakBlocks(b([90, 84, 99])).map(x => x.index), [1]);
  assert.deepEqual(weakBlocks(b([85, 90, 100])), []);
});

test('положение к параллели и нижняя четверть', () => {
  assert.deepEqual(positionChange(97, 85, 67, 87), { diff: -32, kind: 'down' });
  assert.deepEqual(positionChange(60, 64, 60, 60), { diff: 4, kind: 'same' });
  assert.deepEqual(positionChange(60, 65, 60, 60), { diff: 5, kind: 'up' });
  assert.equal(positionChange(null, 65, 60, 60), null);
  assert.equal(lowQuarterCut([90, 70, 85]), null, 'меньше четырёх: нижней четверти нет');
  assert.equal(lowQuarterCut([90, 70, 85, 60, 88, 99, 77, 65]), 65);
});

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('таблица «группа × работа»: значки, «К старту», параллель только с входным', () => {
  const points = [{ key: 'placement' }, { key: 'm1' }, { key: 'ege1' }];
  const v = (placement, m1, ege1) => {
    const one = (x) => Object.fromEntries([...SECTION_CODES, 'total'].map(c => [c, c === 'total' ? x : null]));
    return { placement: one(placement), m1: one(m1), ege1: one(ege1) };
  };
  // Ученик 3 без входного: в группе считается, в параллели по работам нет.
  const values = new Map([[1, v(96.4, 93, 89.6)], [2, v(90, 87, null)], [3, v(null, 40, 30)]]);
  const g = tableRow([1], values, points, 5, false).total;
  assert.deepEqual(g.cells.map(c => c && [c.percent, c.trend]), [[96, null], [93, 'same'], [90, 'same']]);
  assert.deepEqual(g.to_start, { diff: -7, kind: 'down' });
  const one = tableRow([2], new Map([[2, v(90, null, null)]]), points, 5, false).total;
  assert.deepEqual(one.to_start, { kind: 'one' });
  assert.deepEqual(one.cells.slice(1), [null, null]);
  const grp = tableRow([1, 2, 3], values, points, 5, false).total;
  assert.deepEqual(grp.cells.map(c => c.n), [2, 3, 2]);
  const par = tableRow([1, 2, 3], values, points, 5, true).total;
  assert.deepEqual(par.cells.map(c => [c.percent, c.n]), [[93, 2], [90, 2], [90, 1]]);
  assert.deepEqual(par.to_start, { diff: -4, kind: 'same' });
});

test('экран «Динамика» в базе', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  t.after(() => db.end());
  await db.query('SELECT pg_advisory_lock(73001)');
  // 11 групп 11 параллели: в группах 1 и 2 по два-три ученика, в остальных по одному. Пробный ЕГЭ внесён только в группах 1 и 2.
  const groups = Array.from({ length: 11 }, (_, i) => `(${i + 1}, '11 G${String(i + 1).padStart(2, '0')}', 'G${i + 1}', 'main', 11, 1, NULL)`).join(', ');
  const members = [[1, 1], [2, 1], [3, 2], [4, 2], [5, 2], ...Array.from({ length: 9 }, (_, i) => [6 + i, 3 + i])];
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
    INSERT INTO pulse_read.groups VALUES ${groups};
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL);
    INSERT INTO pulse_read.users VALUES (1, 'Администратор'), (101, 'Учитель 1');
    INSERT INTO pulse_read.group_teachers VALUES (1, 1);
    INSERT INTO pulse_read.students SELECT i, 'Ученик ' || i FROM generate_series(1, 14) i;
    INSERT INTO pulse_read.group_memberships VALUES ${members.map(([s, g], i) => `(${i + 1}, ${s}, ${g})`).join(', ')};
    INSERT INTO pulse_read.placement_spec_uploads VALUES ('p11', '2026/2027', '{"id":"p11","grade":11,"fields":[
      {"id":"l1","section":"Listening","excel_label":"Listening","max_score":50},{"id":"r1","section":"Reading","excel_label":"Reading","max_score":50}]}', '2026-09-01', NULL);
    INSERT INTO pulse_read.placement_approvals VALUES ('p11', 'approved');
    INSERT INTO pulse_read.placement_sessions VALUES (1, 1, 1, 'p11', '2026-09-10'), (2, 1, 2, 'p11', '2026-09-10');
    -- Входное: ученик 1: 97, 2: 60, 3: 70, 4: нет, 5: 40.
    INSERT INTO pulse_read.placement_field_scores (session_id, student_id, field_id, score, status) VALUES
      (1, 1, 'l1', 49, 'complete'), (1, 1, 'r1', 48, 'complete'), (1, 2, 'l1', 30, 'complete'), (1, 2, 'r1', 30, 'complete'),
      (2, 3, 'l1', 35, 'complete'), (2, 3, 'r1', 35, 'complete'), (2, 5, 'l1', 20, 'complete'), (2, 5, 'r1', 20, 'complete');
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  await db.query("INSERT INTO monitoring.user_roles (user_id, role) VALUES (1, 'data_admin'), (101, 'teacher') ON CONFLICT DO NOTHING");
  const { createWorks } = require('../server/works.cjs');
  const route = require('../server/routes.cjs');
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = (userId, query = {}) => route({ path: '/progress/dynamics', method: 'GET', query, body: null, user: { id: userId }, db });
  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'ege_mock'");
  const version = await one('SELECT v.id FROM monitoring.spec_versions v JOIN monitoring.specs s ON s.id = v.spec_id WHERE s.type_id = $1', [type.id]);
  const tasks = (await db.query('SELECT id FROM monitoring.spec_tasks WHERE version_id = $1 ORDER BY sort', [version.id])).rows.map(r => r.id);
  const work = (await createWorks(db, 1, {
    type_id: type.id, title: 'Пробный ЕГЭ 1', academic_year_id: 1, parallels: [11], spec_version_id: version.id, scale_id: null, status: 'open',
    groups: Array.from({ length: 11 }, (_, i) => i + 1), dates: { test: '2026-11-20' },
  })).body.created[0];
  const put = async (studentId, groupId, values) => {
    for (let i = 0; i < values.length; i += 1) {
      await db.query('INSERT INTO monitoring.task_scores (work_id, task_id, student_id, group_id, score, updated_by) VALUES ($1, $2, $3, $4, $5, 1)', [work, tasks[i], studentId, groupId, values[i]]);
    }
  };
  const head = [2, 3, 7, 3, 2, 7, 6, 5, 7];
  await put(1, 1, [...head, 6, 5]); // 53 из 62 = 85 %
  await put(2, 1, [...head, 6, 7]); // 55 = 89 %
  await put(3, 2, [...head, 6, 7]); // 55 = 89 %
  await put(4, 2, [...head, 6, 6]); // 54 = 87 %
  await put(5, 2, [...head, 1, 0]); // 43 = 69 %

  await t.test('плашка: внесено в 2 группах из 11, перечислены 9 без результатов', async () => {
    const r = await call(1);
    assert.equal(r.body.tab, 'Пробный ЕГЭ 1', 'по умолчанию последняя работа с результатами');
    const c = r.body.screen.coverage;
    assert.deepEqual([c.groups_with, c.groups_total, c.students_with, c.students_total], [2, 11, 5, 14]);
    assert.deepEqual(c.with, ['11 G01', '11 G02']);
    assert.equal(c.without.length, 9);
    assert.equal(c.without[0], '11 G03');
  });

  await t.test('группы: полосы только у групп с результатами, по убыванию', async () => {
    const s = (await call(1)).body.screen;
    assert.deepEqual(s.groups.map(g => [g.title, g.percent, g.n]), [['11 G01', 87, 2], ['11 G02', 81.7, 3]]);
    assert.equal(s.parallel_row.percent, 83.8);
    assert.deepEqual(s.cards, { avg_total: 52, avg_percent: 83.8, complete: 5, groups_with: 2, groups_total: 11 });
    assert.equal(s.max_points, 62);
  });

  await t.test('входное: столбца письменной речи нет, раз во входном её нет', async () => {
    const s = (await call(1, { work: 'placement' })).body.screen;
    assert.deepEqual(s.sections.map(x => x.code), ['listening', 'reading']);
    assert.equal(s.position, null);
    const ege = (await call(1)).body.screen;
    assert.deepEqual(ege.sections.map(x => x.code), ['listening', 'reading', 'use', 'writing']);
  });

  await t.test('блоки заданий: проценты и три слабых ниже 85', async () => {
    const s = (await call(1)).body.screen;
    assert.deepEqual(s.blocks.map(b => b.label), ['1', '2', '3-9', '10', '11', '12-18', '19-24', '25-29', '30-36', '37', '38']);
    assert.equal(s.blocks[0].section, 'Аудирование');
    // Задание 37: 6+6+6+6+1 из 30 = 83; задание 38: 5+7+7+6+0 из 70 = 36; остальные 100.
    assert.deepEqual(s.blocks_parallel.slice(9), [83, 36]);
    assert.deepEqual(s.weak, [10, 9]);
    assert.deepEqual(s.blocks_by_group[1].slice(9), [100, 43]);
  });

  await t.test('положение группы: только ученики с обеими работами', async () => {
    const s = (await call(1)).body.screen;
    // Обе работы: 1, 2, 3, 5. Параллель: входное 66,75, ЕГЭ 83. Ученик 4 без входного не входит.
    const g2 = s.position.rows.find(r => r.title === '11 G02');
    assert.deepEqual([g2.n, g2.before, g2.after], [2, -11.8, -4]);
    const g1 = s.position.rows.find(r => r.title === '11 G01');
    assert.deepEqual([g1.n, g1.before, g1.after], [2, 11.8, 4]);
    assert.equal(s.position.complete, false);
  });

  await t.test('ученики: место, положение, зона риска только по самой работе', async () => {
    const s1 = (await call(1, { group: '1' })).body.screen;
    const a = s1.students.find(x => x.id === 1);
    assert.deepEqual([a.percent, a.place, a.position.kind, a.risk], [85, '4 из 5', 'down', false], '97 на входном и 85 на ЕГЭ: «ниже», но не красная строка');
    assert.ok(a.position.diff <= -5);
    const b = s1.students.find(x => x.id === 2);
    assert.equal(b.place, '1-2 из 5');
    const s2 = (await call(1, { group: '2' })).body.screen;
    const low = s2.students.find(x => x.id === 5);
    assert.deepEqual([low.percent, low.risk], [69, true], 'нижняя четверть параллели');
    const none = s2.students.find(x => x.id === 4);
    assert.equal(none.position, null, 'без входного положения нет');
    assert.deepEqual(s2.students.map(x => x.id), [3, 4, 5], 'по проценту, по убыванию');
  });

  await t.test('учитель: только свои группы, ученики чужой группы не отдаются', async () => {
    const r = await call(101, { group: '2' });
    assert.deepEqual(r.body.screen.groups.map(g => g.title), ['11 G01']);
    assert.equal(r.body.screen.group, 1);
    assert.ok(!JSON.stringify(r.body.screen.students).includes('Ученик 3'));
    assert.deepEqual(r.body.table.groups.map(g => g.title), ['11 G01']);
    assert.ok(r.body.table.parallel.total.cells[0].n > r.body.table.groups[0].total.cells[0].n);
  });
});
