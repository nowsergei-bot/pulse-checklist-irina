// Поправки к составам групп: права только data_admin, состав в таблице ввода по дате работы,
// баллы остаются за группой, история с автором, расхождения с Пульсом.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
// База должна быть пустой: тест создаёт схемы monitoring и pulse_read с вымышленными данными.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const route = require('../server/routes.cjs');
const { capabilities } = require('../server/lib/access.cjs');
const { getSheet, saveSheet } = require('../server/sheet.cjs');
const { groupStudents } = require('../server/lib/groups.cjs');
const { discrepancies, validDate } = require('../server/rosters.cjs');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('дата поправки проверяется', () => {
  assert.equal(validDate('2026-10-01'), '2026-10-01');
  assert.equal(validDate('2026-02-30'), null);
  assert.equal(validDate('01.10.2026'), null);
  assert.equal(validDate(''), null);
});

test('поправки к составам групп', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  t.after(() => db.end());
  // Тесты с базой идут по очереди: все проверки пересоздают схему monitoring.
  await db.query('SELECT pg_advisory_lock(73001)');

  await db.query(`
    DROP SCHEMA IF EXISTS pulse_read CASCADE; CREATE SCHEMA pulse_read;
    CREATE TABLE pulse_read.academic_years (id int, label text, is_current boolean, starts_on date);
    CREATE TABLE pulse_read.groups (id int, title text, code text, campus text, parallel int, academic_year_id int, archived_at timestamptz);
    CREATE TABLE pulse_read.english_teachers (id int, user_id int, full_name text, archived_at timestamptz);
    CREATE TABLE pulse_read.group_teachers (teacher_id int, group_id int);
    CREATE TABLE pulse_read.students (id int, group_id int, full_name text);
    CREATE TABLE pulse_read.group_memberships (id int, student_id int, group_id int);
    CREATE TABLE pulse_read.users (id int, full_name text);
    ALTER TABLE pulse_read.groups ADD COLUMN level_code text;
    INSERT INTO pulse_read.academic_years VALUES (1, '2026/2027', true, '2026-09-01'), (0, '2025/2026', false, '2025-09-01');
    INSERT INTO pulse_read.groups VALUES (1, 'Группа А', 'A', 'main', 7, 1, NULL), (2, 'Группа Б', 'B', 'digital', 7, 1, NULL), (3, 'Старая группа', 'S', 'main', 7, 0, NULL);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL), (2, 102, 'Учитель 2', NULL);
    INSERT INTO pulse_read.group_teachers VALUES (1, 1), (2, 2);
    INSERT INTO pulse_read.users VALUES (100, 'Администратор 1'), (101, 'Учитель 1'), (102, 'Учитель 2'), (104, 'Заведующий 1'), (105, 'Завуч 1');
    -- Ученик Б записан в students дважды: такие дубли бывают в Пульсе.
    INSERT INTO pulse_read.students VALUES (1, 1, 'Ученик А'), (2, 1, 'Ученик Б'), (2, 1, 'Ученик Б'), (3, 1, 'Ученик В'), (4, 2, 'Ученик Г'), (5, 2, 'Ученик 5%');
    INSERT INTO pulse_read.group_memberships VALUES (1, 1, 1), (2, 2, 1), (3, 3, 1), (4, 4, 2), (5, 5, 2);
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  await db.query(`INSERT INTO monitoring.user_roles (user_id, role) VALUES (100, 'data_admin'), (104, 'department_head'), (105, 'deputy') ON CONFLICT DO NOTHING`);

  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'module'");
  const frame = await one('SELECT id FROM monitoring.frames LIMIT 1');
  const scale = await one('SELECT id FROM monitoring.grade_scales WHERE is_default');
  const spec = await one('INSERT INTO monitoring.specs (type_id, title) VALUES ($1, $2) RETURNING id', [type.id, 'Вымышленный модуль']);
  const v = await one('INSERT INTO monitoring.spec_versions (spec_id, version, frame_id, max_points) VALUES ($1, 1, $2, 10) RETURNING id', [spec.id, frame.id]);
  const part = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'test', 'Тест', 1) RETURNING id", [v.id]);
  const task = await one(
    "INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, 1, 'Reading', 'basic', 'Reading', 10) RETURNING id",
    [v.id, part.id],
  );
  await db.query("UPDATE monitoring.spec_versions SET status = 'approved' WHERE id = $1", [v.id]);
  // Две работы: проведена 14.10.2026 и без дат (тогда берётся сегодняшний день).
  const makeWork = async (heldOn) => {
    const w = await one(
      "INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status, created_by) VALUES ($1, 'Вымышленный модуль', 1, 7, $2, $3, 'open', 100) RETURNING id",
      [type.id, v.id, scale.id],
    );
    await db.query('INSERT INTO monitoring.work_parts (work_id, part_id, held_on) VALUES ($1, $2, $3)', [w.id, part.id, heldOn]);
    await db.query('INSERT INTO monitoring.work_groups (work_id, group_id) VALUES ($1, 1), ($1, 2)', [w.id]);
    return w.id;
  };
  const work = await makeWork('2026-10-14');
  const undated = await makeWork(null);

  const admin = { id: 100, full_name: 'Администратор 1' };
  const call = (user, method, p, extra = {}) => route({ path: p, method, query: extra.query || {}, body: extra.body, user, db });
  const teacher = capabilities(new Set(['teacher']));
  const names = (r) => r.body.students.map(s => s.full_name);
  const leftNames = (r) => r.body.left_students.map(s => s.full_name);

  // Учитель 1 внёс балл ученику Б в своей группе до поправки.
  const saved = await saveSheet(db, 101, teacher, work, { group_id: 1, changes: [{ student_id: 2, task_id: task.id, score: 7 }] });
  assert.deepEqual(saved.body.errors, []);

  await t.test('экран и действия только для data_admin, проверка на сервере', async () => {
    for (const id of [101, 104, 105]) {
      const user = { id, full_name: 'Пользователь' };
      assert.equal((await call(user, 'GET', '/rosters')).status, 403);
      assert.equal((await call(user, 'GET', '/rosters/1')).status, 403);
      assert.equal((await call(user, 'GET', '/rosters/search', { query: { q: 'Ученик' } })).status, 403);
      assert.equal((await call(user, 'POST', '/rosters/1', { body: { action: 'remove', student_id: 1, from_date: '2026-10-01' } })).status, 403);
      assert.equal((await call(user, 'POST', '/rosters/overrides/1/cancel', { body: {} })).status, 403);
    }
    assert.equal((await one('SELECT count(*)::int AS n FROM monitoring.roster_overrides')).n, 0);
    const list = await call(admin, 'GET', '/rosters');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.groups.map(g => [g.title, g.pulse_count, g.digital]), [['Группа А', 3, false], ['Группа Б', 2, true]]);
  });

  await t.test('проверки поправки', async () => {
    const post = (body, group = 1) => call(admin, 'POST', `/rosters/${group}`, { body });
    assert.equal((await post({ action: 'add', student_id: 1, from_date: '2026-10-01' })).status, 409);
    assert.equal((await post({ action: 'remove', student_id: 4, from_date: '2026-10-01' })).status, 409);
    assert.equal((await post({ action: 'remove', kind: 'transfer', student_id: 1, from_date: '01.10.2026' })).status, 400);
    assert.equal((await post({ action: 'remove', kind: 'transfer', student_id: 1 })).status, 400);
    assert.equal((await post({ action: 'remove', kind: 'other', student_id: 1 })).status, 400);
    assert.equal((await post({ action: 'move', student_id: 1, from_date: '2026-10-01' })).status, 400);
    assert.equal((await post({ action: 'add', student_id: 999, from_date: '2026-10-01' })).status, 400);
    assert.equal((await post({ action: 'add', student_id: 4, from_date: '2026-10-01' }, 3)).status, 404);
    assert.equal((await one('SELECT count(*)::int AS n FROM monitoring.roster_overrides')).n, 0);
  });

  await t.test('«Исправить состав» по умолчанию: ученика нет во всех работах года, его баллы остаются за группой', async () => {
    // Дата при исправлении не нужна и не сохраняется.
    const r = await call(admin, 'POST', '/rosters/1', { body: { action: 'remove', student_id: 2, from_date: '2026-12-31' } });
    assert.equal(r.status, 200);
    assert.deepEqual(await one('SELECT kind, from_date FROM monitoring.roster_overrides WHERE id = $1', [r.body.id]), { kind: 'fix', from_date: null });
    assert.equal((await call(admin, 'POST', '/rosters/1', { body: { action: 'remove', kind: 'transfer', student_id: 2, from_date: '2026-10-05' } })).status, 409);
    const sheet = await getSheet(db, 101, teacher, work, 1);
    assert.deepEqual(names(sheet), ['Ученик А', 'Ученик В']);
    assert.deepEqual(leftNames(sheet), ['Ученик Б']);
    assert.equal(sheet.body.left_students[0].result.total, 7);
    const score = await one('SELECT group_id, score FROM monitoring.task_scores WHERE work_id = $1 AND student_id = 2', [work]);
    assert.deepEqual([score.group_id, score.score], [1, 7]);
  });

  await t.test('перевод с даты не трогает более раннюю работу', async () => {
    assert.equal((await call(admin, 'POST', '/rosters/1', { body: { action: 'remove', kind: 'transfer', student_id: 3, from_date: '2026-11-01' } })).status, 200);
    assert.deepEqual(names(await getSheet(db, 101, teacher, work, 1)), ['Ученик А', 'Ученик В']);
    // Работа без дат: состав на сегодня.
    const today = (await one('SELECT current_date::text AS d')).d;
    const inUndated = (await groupStudents(db, 1, undated)).map(s => s.full_name);
    assert.equal(inUndated.includes('Ученик В'), today < '2026-11-01');
  });

  await t.test('добавить ученика из другой группы: виден в таблице ввода, туда можно внести балл', async () => {
    const found = await call(admin, 'GET', '/rosters/search', { query: { q: 'ученик г' } });
    assert.deepEqual(found.body.students.map(s => [s.full_name, s.groups.map(g => g.title)]), [['Ученик Г', ['Группа Б']]]);
    // % в запросе ищется как буква, а не как шаблон.
    assert.deepEqual((await call(admin, 'GET', '/rosters/search', { query: { q: '5%' } })).body.students.map(s => s.full_name), ['Ученик 5%']);
    assert.deepEqual((await call(admin, 'GET', '/rosters/search', { query: { q: 'к%' } })).body.students, []);

    assert.equal((await call(admin, 'POST', '/rosters/1', { body: { action: 'add', student_id: 4, from_date: '2026-10-01' } })).status, 200);
    const sheet = await getSheet(db, 101, teacher, work, 1);
    assert.deepEqual(names(sheet), ['Ученик А', 'Ученик В', 'Ученик Г']);
    const r = await saveSheet(db, 101, teacher, work, { group_id: 1, changes: [{ student_id: 4, task_id: task.id, score: 9 }] });
    assert.deepEqual(r.body.errors, []);
    // В Пульсе ученик остаётся в группе Б: там он тоже есть, балл виден как внесённый в другой группе.
    const other = await getSheet(db, 102, teacher, work, 2);
    assert.ok(names(other).includes('Ученик Г'));
  });

  await t.test('учитель не видит, что состав поправлен', async () => {
    const sheet = await getSheet(db, 101, teacher, work, 1);
    const text = JSON.stringify(sheet.body);
    assert.ok(!/override|roster|поправ|Администратор/i.test(text));
  });

  await t.test('состав, история с автором, отмена', async () => {
    const r = await call(admin, 'GET', '/rosters/1');
    assert.equal(r.status, 200);
    const rows = Object.fromEntries(r.body.students.map(s => [s.full_name, [s.in_pulse, s.override && s.override.action, s.override && s.override.kind, s.override && s.override.from_date]]));
    assert.deepEqual(rows, {
      'Ученик А': [true, null, null, null],
      'Ученик Б': [true, 'remove', 'fix', null],
      'Ученик В': [true, 'remove', 'transfer', '2026-11-01'],
      'Ученик Г': [false, 'add', 'fix', null],
    });
    assert.deepEqual(r.body.students.find(s => s.full_name === 'Ученик Г').pulse_groups.map(g => g.title), ['Группа Б']);
    assert.deepEqual(r.body.history.map(h => [h.action, h.student, h.changed_by_name]), [
      ['add', 'Ученик Г', 'Администратор 1'],
      ['remove', 'Ученик В', 'Администратор 1'],
      ['remove', 'Ученик Б', 'Администратор 1'],
    ]);

    const b = r.body.students.find(s => s.full_name === 'Ученик Б').override.id;
    assert.equal((await call(admin, 'POST', `/rosters/overrides/${b}/cancel`, { body: {} })).status, 200);
    assert.equal((await call(admin, 'POST', `/rosters/overrides/${b}/cancel`, { body: {} })).status, 409);
    assert.deepEqual(names(await getSheet(db, 101, teacher, work, 1)), ['Ученик А', 'Ученик Б', 'Ученик В', 'Ученик Г']);
    const after = await call(admin, 'GET', '/rosters/1');
    assert.deepEqual(after.body.history[0], { ...after.body.history[0], action: 'cancel', kind: 'fix', student: 'Ученик Б', changed_by_name: 'Администратор 1', from_date: null });
    // После отмены можно снова убрать.
    assert.equal((await call(admin, 'POST', '/rosters/1', { body: { action: 'remove', kind: 'transfer', student_id: 2, from_date: '2026-10-20' } })).status, 200);
  });

  await t.test('расхождения с Пульсом на странице schema', async () => {
    const show = (rows) => rows.map(r => [r.group_title, r.full_name, r.action, r.same_in_pulse]);
    assert.deepEqual(show(await discrepancies(db)), [
      ['Группа А', 'Ученик Б', 'remove', false],
      ['Группа А', 'Ученик В', 'remove', false],
      ['Группа А', 'Ученик Г', 'add', false],
    ]);
    // Пульс сам перевёл ученика Г в группу А: поправка больше не расходится.
    await db.query('INSERT INTO pulse_read.group_memberships VALUES (6, 4, 1)');
    const rows = await discrepancies(db);
    assert.equal(rows.find(r => r.full_name === 'Ученик Г').same_in_pulse, true);
    const page = await call(admin, 'GET', '/schema');
    assert.equal(page.body.roster_discrepancies.length, 3);
    assert.equal((await call({ id: 104 }, 'GET', '/schema')).status, 403);
  });
});
