// Составы групп из файла: сопоставление по ФИО и коду группы, пробный прогон без записи,
// применение поверх Пульса, возврат к Пульсу, права только data_admin.
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
const { normName, normCode, shortName } = require('../server/roster-import.cjs');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('ФИО и код группы приводятся к одному виду', () => {
  assert.equal(normName('  Учёник   Первый  Тестович '), 'ученик первый тестович');
  assert.equal(normName('Ученик-Второй, Первый.'), 'ученик-второй первый');
  assert.equal(shortName('ученик первый тестович'), 'ученик первый');
  assert.equal(shortName('ученик'), '');
  assert.equal(normCode('4 AE'), '4AE');
  assert.equal(normCode('4 АЕ'), '4AE'); // кириллица
  assert.equal(normCode('4-ae'), '4AE');
});

test('составы групп из файла', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  t.after(() => db.end());
  await db.query('SELECT pg_advisory_lock(73001)');

  await db.query(`
    DROP SCHEMA IF EXISTS pulse_read CASCADE; CREATE SCHEMA pulse_read;
    CREATE TABLE pulse_read.academic_years (id int, label text, is_current boolean, starts_on date);
    CREATE TABLE pulse_read.groups (id int, title text, code text, campus text, parallel int, academic_year_id int, archived_at timestamptz, level_code text);
    CREATE TABLE pulse_read.english_teachers (id int, user_id int, full_name text, archived_at timestamptz);
    CREATE TABLE pulse_read.group_teachers (teacher_id int, group_id int);
    CREATE TABLE pulse_read.students (id int, group_id int, full_name text);
    CREATE TABLE pulse_read.group_memberships (id int, student_id int, group_id int);
    CREATE TABLE pulse_read.users (id int, full_name text);
    INSERT INTO pulse_read.academic_years VALUES (1, '2026/2027', true, '2026-09-01'), (0, '2025/2026', false, '2025-09-01');
    INSERT INTO pulse_read.groups (id, title, code, campus, parallel, academic_year_id) VALUES
      (1, '4 AE', '4AE', 'main', 4, 1), (2, '4 BE', '4BE', 'main', 4, 1), (3, '4 AE', '4AE', 'digital', 4, 1),
      (4, '10 E', '10E', 'main', 10, 1), (5, '3 AE', '3AE', 'main', 3, 0);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL);
    INSERT INTO pulse_read.group_teachers VALUES (1, 1);
    INSERT INTO pulse_read.users VALUES (100, 'Администратор 1'), (101, 'Учитель 1'), (104, 'Заведующий 1'), (105, 'Завуч 1');
    INSERT INTO pulse_read.students VALUES
      (1, 1, 'Ученик Один Тестович'), (2, 1, 'Ученик Два Тестович'), (5, 2, 'Ученик Пять Отчествович'),
      (6, 1, 'Ученик Шесть Первович'), (7, 1, 'Ученик Шесть Вторович'), (8, 5, 'Ученик Восемь Тестович'),
      (9, 1, 'Ученик Девять Тестович'), (10, 3, 'Ученик Десять Тестович');
    -- Ученик 8 был только в группе прошлого года; ученик 10 в группе ЦГ, её в файле нет.
    INSERT INTO pulse_read.group_memberships VALUES (1, 1, 1), (2, 2, 1), (3, 6, 1), (4, 7, 1), (5, 9, 1), (6, 5, 2), (7, 8, 5), (8, 10, 3), (9, 1, 3);
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
  const task = await one("INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, 1, 'Reading', 'basic', 'Reading', 10) RETURNING id", [v.id, part.id]);
  await db.query("UPDATE monitoring.spec_versions SET status = 'approved' WHERE id = $1", [v.id]);
  const work = (await one(
    "INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status, created_by) VALUES ($1, 'Вымышленный модуль', 1, 4, $2, $3, 'open', 100) RETURNING id",
    [type.id, v.id, scale.id],
  )).id;
  await db.query("INSERT INTO monitoring.work_parts (work_id, part_id, held_on) VALUES ($1, $2, '2026-10-14')", [work, part.id]);
  await db.query('INSERT INTO monitoring.work_groups (work_id, group_id) VALUES ($1, 1), ($1, 2)', [work]);
  const teacher = capabilities(new Set(['teacher']));
  // Ученику 9 балл внесён в группе 4 AE до загрузки.
  assert.deepEqual((await saveSheet(db, 101, teacher, work, { group_id: 1, changes: [{ student_id: 9, task_id: task.id, score: 6 }] })).body.errors, []);

  const admin = { id: 100, full_name: 'Администратор 1' };
  const call = (user, method, p, body) => route({ path: p, method, query: {}, body, user, db });
  const ids = async (groupId) => (await groupStudents(db, groupId, work)).map(s => Number(s.id)).sort((a, b) => a - b);
  // Строки листа «Составы»: параллель, группа, ФИО ученика, класс.
  const rows = [
    ['4', '4 AE', 'Ученик Один Тестович', '4А'],
    ['4', '4 АЕ', 'Учёник Пять', '4А'],
    ['4', '4 AE', 'Ученик Восемь', '4А'],
    ['4', '4 BE', 'Ученик Два Тестович', '4Б'],
    ['4', '4 BE', 'Ученик Шесть', '4Б'],
    ['4', '4 BE', 'Неизвестный Ученик', '4Б'],
    ['4', '4 ZZ', 'Ученик Один Тестович', '4Б'],
    ['4', '4 AE', '', ''],
  ];

  await t.test('только data_admin, проверка на сервере', async () => {
    for (const id of [101, 104, 105]) {
      const user = { id };
      assert.equal((await call(user, 'GET', '/rosters/import')).status, 403);
      assert.equal((await call(user, 'POST', '/rosters/import/preview', { rows })).status, 403);
      assert.equal((await call(user, 'POST', '/rosters/import/apply', { rows, token: 'x' })).status, 403);
      assert.equal((await call(user, 'POST', '/rosters/import/cancel', {})).status, 403);
    }
  });

  let report;
  await t.test('пробный прогон: сопоставление без записи', async () => {
    const r = await call(admin, 'POST', '/rosters/import/preview', { rows });
    assert.equal(r.status, 200);
    report = r.body;
    assert.deepEqual(report.summary, {
      rows: 7, groups_in_file: 3, groups_found: 2, groups_applied: 2, matched: 4, by_full_name: 2, by_short_name: 2,
      stay: 1, moved: 2, added: 1, not_found: 1, ambiguous: 1, duplicates: 0, leaving: 5, unknown_group_rows: 1,
    });
    assert.deepEqual(report.groups.map(g => [g.title, g.rows, g.matched, g.stay, g.moved, g.added, g.leaving, g.not_found, g.ambiguous]), [
      ['4 AE', 3, 3, 1, 1, 1, 4, 0, 0],
      ['4 BE', 3, 1, 0, 1, 0, 1, 1, 1],
    ]);
    assert.deepEqual(report.not_found, [{ name: 'Неизвестный Ученик', group: '4 BE', cls: '4Б' }]);
    assert.deepEqual(report.ambiguous[0].candidates.map(c => c.full_name).sort(), ['Ученик Шесть Вторович', 'Ученик Шесть Первович']);
    assert.deepEqual(report.moves.map(m => [m.full_name, m.from, m.to, m.how]), [
      ['Ученик Восемь Тестович', [], '4 AE', 'short'],
      ['Ученик Два Тестович', ['4 AE'], '4 BE', 'full'],
      ['Ученик Пять Отчествович', ['4 BE'], '4 AE', 'short'],
    ]);
    assert.deepEqual(report.leaving.map(l => [l.full_name, l.group, l.to]), [
      ['Ученик Два Тестович', '4 AE', ['4 BE']],
      ['Ученик Девять Тестович', '4 AE', []],
      ['Ученик Пять Отчествович', '4 BE', ['4 AE']],
      ['Ученик Шесть Вторович', '4 AE', []],
      ['Ученик Шесть Первович', '4 AE', []],
    ]);
    assert.deepEqual(report.unknown_groups, [{ group: '4 ZZ', rows: 1 }]);
    assert.deepEqual(report.untouched_groups, ['4 AE (ЦГ)', '10 E']);
    assert.equal((await one('SELECT count(*)::int AS n FROM monitoring.roster_imports')).n, 0);
    assert.deepEqual(await ids(1), [1, 2, 6, 7, 9]);
  });

  await t.test('проверка строк', async () => {
    assert.equal((await call(admin, 'POST', '/rosters/import/preview', { rows: 'x' })).status, 400);
    assert.equal((await call(admin, 'POST', '/rosters/import/preview', { rows: [] })).status, 400);
    assert.equal((await call(admin, 'POST', '/rosters/import/preview', { rows: Array(5001).fill(['4', '4 AE', 'Ученик', '']) })).status, 400);
  });

  await t.test('применение: состав по файлу поверх Пульса, баллы остаются за группой', async () => {
    assert.equal((await call(admin, 'POST', '/rosters/import/apply', { rows, token: 'wrong' })).status, 409);
    const r = await call(admin, 'POST', '/rosters/import/apply', { rows, token: report.token });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.groups, r.body.students], [2, 4]);
    assert.deepEqual(await ids(1), [1, 5, 8]);
    assert.deepEqual(await ids(2), [2]);
    // Группы, которых нет в файле, как в Пульсе.
    assert.deepEqual(await ids(3), [1, 10]);
    const sheet = await getSheet(db, 101, teacher, work, 1);
    assert.deepEqual(sheet.body.students.map(s => s.full_name), ['Ученик Восемь Тестович', 'Ученик Один Тестович', 'Ученик Пять Отчествович']);
    assert.deepEqual(sheet.body.left_students.map(s => [s.full_name, s.result.total]), [['Ученик Девять Тестович', 6]]);
    // В базе только пары группа и ученик, строк файла нет.
    assert.equal((await one('SELECT count(*)::int AS n FROM monitoring.roster_import_members')).n, 4);
    const status = await call(admin, 'GET', '/rosters/import');
    assert.deepEqual(status.body.imports.map(i => [i.active, i.groups_count, i.students_count, i.created_by_name]), [[true, 2, 4, 'Администратор 1']]);
    const list = await call(admin, 'GET', '/rosters');
    assert.deepEqual(list.body.groups.filter(g => g.parallel === 4).map(g => [g.title, g.from_file, g.base_count]), [['4 AE', true, 3], ['4 BE', true, 1], ['4 AE', false, 2]]);
  });

  await t.test('поправки работают поверх загрузки', async () => {
    // Ученика 6 нет в составе по файлу: убрать нельзя, добавить можно.
    assert.equal((await call(admin, 'POST', '/rosters/1', { action: 'remove', student_id: 6 })).status, 409);
    assert.equal((await call(admin, 'POST', '/rosters/1', { action: 'add', student_id: 6 })).status, 200);
    assert.deepEqual(await ids(1), [1, 5, 6, 8]);
    const roster = await call(admin, 'GET', '/rosters/1');
    assert.equal(roster.body.group.from_file, true);
    assert.deepEqual(roster.body.students.map(s => [s.id, s.in_base]), [[8, true], [1, true], [5, true], [6, false]]);
  });

  await t.test('повторная загрузка заменяет прежнюю; пробный прогон устаревает', async () => {
    const again = (await call(admin, 'POST', '/rosters/import/preview', { rows: rows.slice(0, 1) })).body;
    // Изменения Пульса, которые не меняют сопоставление, прогон не портят.
    await db.query('INSERT INTO pulse_read.group_memberships VALUES (10, 9, 2)');
    const same = (await call(admin, 'POST', '/rosters/import/preview', { rows: rows.slice(0, 1) })).body;
    assert.equal(same.token, again.token);
    // В Пульсе появился второй ученик с тем же ФИО в той же группе: сопоставление другое, применение отказано.
    await db.query("INSERT INTO pulse_read.students VALUES (11, 1, 'Ученик Один Тестович'); INSERT INTO pulse_read.group_memberships VALUES (11, 11, 1)");
    assert.equal((await call(admin, 'POST', '/rosters/import/apply', { rows: rows.slice(0, 1), token: again.token })).status, 409);
    await db.query('DELETE FROM pulse_read.students WHERE id = 11; DELETE FROM pulse_read.group_memberships WHERE id = 11');
    const r = await call(admin, 'POST', '/rosters/import/apply', { rows: rows.slice(0, 1), token: again.token });
    assert.equal(r.status, 200);
    assert.deepEqual(await ids(1), [1, 6]);
    assert.deepEqual(await ids(2), [5, 9]); // группа 4 BE снова как в Пульсе
    assert.equal((await one('SELECT count(*)::int AS n FROM monitoring.roster_imports WHERE active')).n, 1);
  });

  await t.test('schema показывает отличия файла от Пульса', async () => {
    const page = await call(admin, 'GET', '/schema');
    assert.deepEqual(page.body.import_discrepancies.map(g => [g.group_title, g.in_file, g.in_pulse, g.only_file, g.only_pulse]), [
      ['4 AE', 1, 5, [], ['Ученик Два Тестович', 'Ученик Девять Тестович', 'Ученик Шесть Вторович', 'Ученик Шесть Первович']],
    ]);
  });

  await t.test('вернуть составы из Пульса', async () => {
    assert.equal((await call(admin, 'POST', '/rosters/import/cancel', {})).status, 200);
    assert.equal((await call(admin, 'POST', '/rosters/import/cancel', {})).status, 409);
    assert.deepEqual(await ids(1), [1, 2, 6, 7, 9]);
    const status = await call(admin, 'GET', '/rosters/import');
    assert.deepEqual(status.body.imports.map(i => [i.active, i.cancelled_by_name]), [[false, 'Администратор 1'], [false, null]]);
  });
});
