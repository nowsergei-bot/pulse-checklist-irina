// Своя спецификация группы (миграция 016, задание Иры 30.10): группа в работе вносит и считается по своей спецификации,
// в аналитике параллели группы сравниваются по проценту.
// Ручной пример, вымышленные данные. Работа «Модуль 1», 11 параллель:
//   спецификация работы 50 баллов: Listening 10, Reading 10 базовый; Grammar 15, Vocabulary 15 повышенный;
//   своя спецификация группы «11 Х» 54 балла: Listening 12, Reading 12 базовый; Grammar 15, Vocabulary 15 повышенный.
//   11 А: 45 из 50 (90 %), 37 (74 %), 23 (46 %). 11 Х: 54 из 54 (100 %), 27 из 54 (50 %), один отсутствовал.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('своя спецификация группы в базе', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
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
    INSERT INTO pulse_read.groups VALUES (1, '11 А', '11A', 'main', 11, 1, NULL), (2, '11 Х', '11X', 'main', 11, 1, NULL);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL), (2, 102, 'Учитель 2', NULL);
    INSERT INTO pulse_read.users VALUES (1, 'Администратор'), (101, 'Учитель 1'), (102, 'Учитель 2'), (104, 'Заведующая');
    INSERT INTO pulse_read.group_teachers VALUES (1, 1), (2, 2);
    INSERT INTO pulse_read.students SELECT i, 'Ученик ' || i FROM generate_series(1, 6) i;
    INSERT INTO pulse_read.group_memberships VALUES (1, 1, 1), (2, 2, 1), (3, 3, 1), (4, 4, 2), (5, 5, 2), (6, 6, 2);
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  await db.query(`INSERT INTO monitoring.user_roles (user_id, role) VALUES (1, 'data_admin'), (104, 'department_head'),
    (101, 'teacher'), (102, 'teacher') ON CONFLICT DO NOTHING`);
  const route = require('../server/routes.cjs');
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = (userId, p, method = 'GET', query = {}, body = null) => route({ path: p, method, query, body, user: { id: userId }, db });

  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'module'");
  const frame = await one('SELECT id FROM monitoring.frames LIMIT 1');
  const scale = await one('SELECT id FROM monitoring.grade_scales WHERE is_default');
  const version = async (title, max, rows) => {
    const spec = await one('INSERT INTO monitoring.specs (type_id, title) VALUES ($1, $2) RETURNING id', [type.id, title]);
    const v = await one('INSERT INTO monitoring.spec_versions (spec_id, version, frame_id, max_points) VALUES ($1, 1, $2, $3) RETURNING id', [spec.id, frame.id, max]);
    const part = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'test', 'Тест', 1) RETURNING id", [v.id]);
    const tasks = [];
    for (const [i, [section, level, points]] of rows.entries()) {
      tasks.push((await one(
        'INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [v.id, part.id, i + 1, section, level, `Задание ${i + 1}`, points],
      )).id);
    }
    await db.query("UPDATE monitoring.spec_versions SET status = 'approved' WHERE id = $1", [v.id]);
    return { id: v.id, part: part.id, tasks };
  };
  const general = await version('Модуль 1', 50, [['Listening', 'basic', 10], ['Reading', 'basic', 10], ['Grammar', 'advanced', 15], ['Vocabulary', 'advanced', 15]]);
  const own = await version('Модуль 1, 11 Х', 54, [['Listening', 'basic', 12], ['Reading', 'basic', 12], ['Grammar', 'advanced', 15], ['Vocabulary', 'advanced', 15]]);
  const { createWorks } = require('../server/works.cjs');
  const workBody = {
    type_id: type.id, title: 'Модуль 1', academic_year_id: 1, parallels: [11], spec_version_id: general.id, scale_id: scale.id,
    status: 'open', groups: [1, 2], dates: { test: '2026-10-14' },
  };
  const w = (await createWorks(db, 1, workBody)).body.created[0];
  const edit = (groupSpecs, user = 1) => call(user, `/works/${w}`, 'POST', {}, { ...workBody, parallels: undefined, group_specs: groupSpecs });

  await t.test('назначить: только data_admin, только утверждённая версия того же вида', async () => {
    assert.equal((await edit({ 2: own.id }, 104)).status, 403);
    const ege = await one("SELECT v.id FROM monitoring.spec_versions v JOIN monitoring.specs s ON s.id = v.spec_id JOIN monitoring.assessment_types t ON t.id = s.type_id WHERE t.code = 'ege_mock'");
    assert.equal((await edit({ 2: ege.id })).status, 400, 'спецификация другого вида');
    assert.equal((await edit({ 3: own.id })).status, 400, 'группа не из работы');
    const r = await edit({ 2: own.id });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const got = (await call(1, `/works/${w}`)).body.work;
    assert.deepEqual(got.group_specs, { 2: own.id });
    assert.deepEqual(got.groups_with_results, []);
    const parts = (await db.query('SELECT part_id, held_on::text FROM monitoring.work_parts WHERE work_id = $1 ORDER BY part_id', [w])).rows;
    assert.deepEqual(parts, [{ part_id: general.part, held_on: '2026-10-14' }, { part_id: own.part, held_on: '2026-10-14' }], 'дата части своей спецификации');
  });

  await t.test('таблица группы: задания и максимум своей спецификации; у других групп спецификация работы', async () => {
    const x = await call(102, `/works/${w}/sheet`, 'GET', { group: '2' });
    assert.equal(x.status, 200);
    assert.deepEqual([x.body.work.spec_title, x.body.work.max_points, x.body.work.own_spec], ['Модуль 1, 11 Х', 54, true]);
    assert.deepEqual(x.body.tasks.map(t => t.id), own.tasks);
    const a = await call(101, `/works/${w}/sheet`, 'GET', { group: '1' });
    assert.deepEqual([a.body.work.max_points, a.body.work.own_spec], [50, false]);
    assert.deepEqual(a.body.tasks.map(t => t.id), general.tasks);
  });

  const save = (user, group, student, tasks, values) => call(user, `/works/${w}/sheet`, 'POST', {}, {
    group_id: group, changes: values.map((score, i) => ({ student_id: student, task_id: tasks[i], score })),
  });

  await t.test('ввод: баллы по своей спецификации, процент из 54, отметка по шкале работы', async () => {
    let r = await save(102, 2, 4, own.tasks, [12, 12, 15, 15]);
    assert.deepEqual(r.body.errors, []);
    assert.deepEqual([r.body.students[0].result.total, r.body.students[0].result.percent, r.body.students[0].result.mark], [54, 100, '5']);
    r = await save(102, 2, 5, own.tasks, [6, 6, 10, 5]);
    assert.deepEqual([r.body.students[0].result.total, r.body.students[0].result.percent, r.body.students[0].result.mark], [27, 50, '3']);
    r = await save(102, 2, 5, general.tasks, [1]);
    assert.deepEqual(r.body.errors, ['Задание не из этой работы'], 'задание спецификации работы в группе со своей спецификацией');
    await call(102, `/works/${w}/sheet`, 'POST', {}, { group_id: 2, changes: [{ student_id: 6, part_id: own.part, absent: true }] });
    await save(101, 1, 1, general.tasks, [10, 10, 15, 10]);
    await save(101, 1, 2, general.tasks, [8, 7, 10, 12]);
    await save(101, 1, 3, general.tasks, [5, 5, 5, 8]);
    // Проверка в базе: задание не из спецификации группы, где вносят.
    await assert.rejects(
      db.query('INSERT INTO monitoring.task_scores (work_id, task_id, student_id, group_id, score, updated_by) VALUES ($1, $2, 6, 2, 1, 1)', [w, general.tasks[0]]),
      /не относится к спецификации/,
    );
    await assert.rejects(
      db.query('INSERT INTO monitoring.task_scores (work_id, task_id, student_id, group_id, score, updated_by) VALUES ($1, $2, 3, 1, 1, 1)', [w, own.tasks[0]]),
      /не относится к спецификации/,
    );
    await assert.rejects(
      db.query("INSERT INTO monitoring.part_status (work_id, part_id, student_id, group_id, status, updated_by) VALUES ($1, $2, 3, 1, 'absent', 1)", [w, own.part]),
      /не относится к спецификации/,
    );
  });

  await t.test('сменить или убрать свою спецификацию нельзя, пока у группы есть результаты', async () => {
    assert.equal((await edit({})).status, 409);
    const other = await version('Модуль 1, 11 Х, вариант 2', 54, [['Listening', 'basic', 54]]);
    assert.equal((await edit({ 2: other.id })).status, 409);
    assert.equal((await edit({ 1: own.id, 2: own.id })).status, 409, 'у 11 А тоже есть результаты');
    assert.equal((await edit({ 2: own.id })).status, 200, 'без изменений сохраняется');
    assert.deepEqual((await call(1, `/works/${w}`)).body.work.groups_with_results, [1, 2]);
  });

  await t.test('список работ: своя спецификация группы, прогресс учителя по ней', async () => {
    const admin = (await call(1, '/works')).body.works[0];
    assert.deepEqual(admin.groups.find(g => g.id === 2).own_spec, { title: 'Модуль 1, 11 Х', version: 1, max_points: 54 });
    assert.equal(admin.groups.find(g => g.id === 1).own_spec, undefined);
    const teacher = (await call(102, '/works')).body.works[0];
    assert.deepEqual(teacher.groups[0].progress, { total: 3, done: 3 }, 'двое внесены, один отсутствовал');
  });

  await t.test('аналитика: группы сравниваются по проценту, средний итог параллели не считается', async () => {
    const a = await call(104, '/analytics', 'GET', { title: 'Модуль 1' });
    assert.equal(a.status, 200);
    const rows = a.body.module.rows;
    const g1 = rows.find(r => r.group_id === 1);
    const g2 = rows.find(r => r.group_id === 2);
    const par = rows.find(r => r.kind === 'parallel');
    assert.deepEqual([g1.avg_total, g1.avg_percent, g1.own_spec], [35, 70, undefined]);
    assert.deepEqual([g2.avg_total, g2.avg_percent, g2.complete, g2.absent], [40.5, 75, 2, 1]);
    assert.deepEqual(g2.own_spec, { title: 'Модуль 1, 11 Х', max_points: 54 });
    // 90, 74, 46, 100, 50: средний процент 72.
    assert.deepEqual([par.avg_percent, par.avg_total, par.mixed_max, par.complete], [72, null, [50, 54], 5]);
    assert.deepEqual(par.marks, { 5: 2, 4: 1, 3: 1, 2: 1 });
    // Listening базовый: (10 + 8 + 5) из 30 и (12 + 6) из 24 → 41 / 54.
    assert.equal(par.sections['Listening|basic'], 75.9);
    assert.equal(g2.sections['Listening|basic'], 75);
    const risk = await call(104, '/analytics/risk', 'GET', { title: 'Модуль 1' });
    const s5 = risk.body.students.find(s => s.full_name === 'Ученик 5');
    assert.deepEqual([s5.total, s5.max_points, s5.percent], [27, 54, 50]);
  });

  await t.test('дашборд: проценты и разделы по своей спецификации, блоки только спецификации работы', async () => {
    const b = (await call(104, '/dashboard', 'GET', { work: 'Модуль 1' })).body;
    assert.equal(b.work.max_points, null, 'максимумы разные');
    assert.equal(b.parallels[0].avg_percent, 72);
    assert.equal(b.groups.find(g => g.group_id === 2).avg_percent, 75);
    assert.equal(b.parallels[0].cells.sections['s:Listening'], 76, '41 из 54');
    assert.deepEqual(b.columns.tasks.map(c => c.label), ['1', '2', '3', '4']);
    assert.deepEqual(b.groups.find(g => g.group_id === 2).cells.tasks, {}, 'у группы со своей спецификацией блоков работы нет');
    assert.equal(b.parallels[0].cells.tasks['t:Задание 1'], 77, 'блок 1 только по 11 А: 23 из 30');
    const g = (await call(104, '/dashboard/group', 'GET', { work: 'Модуль 1', group: '2' })).body;
    assert.equal(g.work.max_points, 54);
    assert.deepEqual(g.students.map(s => [s.full_name, s.total, s.percent, s.mark]), [['Ученик 4', 54, 100, '5'], ['Ученик 5', 27, 50, '3'], ['Ученик 6', null, null, null]]);
  });

  await t.test('«Динамика»: процент по своей спецификации, средний балл только по одной спецификации', async () => {
    const d = (await call(104, '/progress/dynamics', 'GET', { parallel: '11', work: 'Модуль 1' })).body;
    assert.equal(d.screen.parallel_row.percent, 72);
    assert.equal(d.screen.cards.avg_total, null);
    const g2 = d.screen.groups.find(g => g.group_id === 2);
    assert.deepEqual([g2.percent, g2.avg_total], [75, null]);
    assert.equal(d.screen.groups.find(g => g.group_id === 1).avg_total, 35);
    assert.deepEqual(d.screen.blocks_by_group[2], [null, null, null, null], 'блоков работы у 11 Х нет');
    const x = (await call(104, '/progress/dynamics', 'GET', { parallel: '11', work: 'Модуль 1', group: '2' })).body.screen;
    assert.equal(x.group_max_points, 54, 'таблица учеников 11 Х: балл из 54');
    assert.equal(d.screen.group_max_points, 50);
  });
});
