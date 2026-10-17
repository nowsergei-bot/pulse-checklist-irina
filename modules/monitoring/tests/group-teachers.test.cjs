// Учителя групп из файла составов и вручную: сопоставление «Фамилия И.О.» с учётными записями,
// пробный прогон без записи, применение, видимость групп для учителя, история, права только data_admin.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
// База должна быть пустой: тест создаёт схемы monitoring и pulse_read с вымышленными данными.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const route = require('../server/routes.cjs');
const { capabilities } = require('../server/lib/access.cjs');
const { listWorks } = require('../server/works.cjs');
const { getSheet } = require('../server/sheet.cjs');
const { teacherGroupIds } = require('../server/lib/groups.cjs');
const { personKey, splitTeachers, sameInitials } = require('../server/group-teachers.cjs');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('«Фамилия И.О.» приводится к фамилии и инициалам', () => {
  assert.deepEqual(personKey('Учительская А.Б.'), { surname: 'учительская', initials: 'аб' });
  assert.deepEqual(personKey('учительская а. б.'), { surname: 'учительская', initials: 'аб' });
  assert.deepEqual(personKey('А.Б. Учительская'), { surname: 'учительская', initials: 'аб' });
  assert.deepEqual(personKey('Учительская Анна Борисовна'), { surname: 'учительская', initials: 'аб' });
  assert.deepEqual(personKey('Ёлкина М.П.'), { surname: 'елкина', initials: 'мп' });
  assert.deepEqual(personKey('Первая-Вторая В.'), { surname: 'первая-вторая', initials: 'в' });
  assert.equal(personKey('А.Б.'), null);
  assert.deepEqual(splitTeachers('Учительская А.Б., Преподова В.Г.'), ['Учительская А.Б.', 'Преподова В.Г.']);
  assert.deepEqual(splitTeachers('Учительская А.Б. / Преподова В.Г.'), ['Учительская А.Б.', 'Преподова В.Г.']);
  assert.ok(sameInitials('аб', 'а'));
  assert.ok(!sameInitials('аб', 'ав'));
});

test('учителя групп из файла', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
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
    INSERT INTO pulse_read.academic_years VALUES (1, '2026/2027', true, '2026-09-01');
    INSERT INTO pulse_read.groups (id, title, code, campus, parallel, academic_year_id) VALUES
      (1, '1 AC', '1AC', 'main', 1, 1), (2, '1 AG', '1AG', 'main', 1, 1), (3, '3 AG', '3AG', 'main', 3, 1),
      (4, '4 AF', '4AF', 'main', 4, 1), (5, '4 AF', '4AF', 'digital', 4, 1), (6, '10 E', '10E', 'main', 10, 1), (7, '2 AB', '2AB', 'main', 2, 1);
    -- Учитель 3 в Пульсе под прежней фамилией; учитель 4 без учётной записи.
    INSERT INTO pulse_read.english_teachers VALUES
      (1, 201, 'Учительская Анна Борисовна', NULL), (2, 202, 'Преподова Вера Глебовна', NULL),
      (3, 203, 'Прежняя Дарья Евгеньевна', NULL), (4, NULL, 'Безучётная Жанна Зиновьевна', NULL);
    INSERT INTO pulse_read.group_teachers VALUES (2, 1), (2, 2), (1, 3), (3, 4), (1, 5), (4, 6);
    -- 204: тёзка учителя 201, но не учитель английского; 205 и 206: одинаковые фамилия и инициалы.
    INSERT INTO pulse_read.users VALUES
      (100, 'Администратор 1'), (104, 'Заведующий 1'), (105, 'Завуч 1'),
      (201, 'Учительская Анна Борисовна'), (202, 'Преподова Вера Глебовна'), (203, 'Прежняя Дарья Евгеньевна'),
      (204, 'Учительская Алла Борисовна'), (205, 'Двойная Ирина Ивановна'), (206, 'Двойная Инна Игоревна'), (207, 'Ёлкина Мария Петровна');
    INSERT INTO pulse_read.students VALUES (1, 1, 'Ученик 1'), (2, 2, 'Ученик 2');
    INSERT INTO pulse_read.group_memberships VALUES (1, 1, 1), (2, 2, 2);
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  await db.query(`INSERT INTO monitoring.user_roles (user_id, role) VALUES (100, 'data_admin'), (104, 'department_head'), (105, 'deputy'),
    (201, 'teacher'), (202, 'teacher'), (203, 'teacher'), (205, 'teacher') ON CONFLICT DO NOTHING`);

  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'module'");
  const frame = await one('SELECT id FROM monitoring.frames LIMIT 1');
  const scale = await one('SELECT id FROM monitoring.grade_scales WHERE is_default');
  const spec = await one('INSERT INTO monitoring.specs (type_id, title) VALUES ($1, $2) RETURNING id', [type.id, 'Вымышленный модуль']);
  const v = await one('INSERT INTO monitoring.spec_versions (spec_id, version, frame_id, max_points) VALUES ($1, 1, $2, 10) RETURNING id', [spec.id, frame.id]);
  const part = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'test', 'Тест', 1) RETURNING id", [v.id]);
  await db.query("INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, 1, 'Reading', 'basic', 'Reading', 10)", [v.id, part.id]);
  await db.query("UPDATE monitoring.spec_versions SET status = 'approved' WHERE id = $1", [v.id]);
  const work = (await one(
    "INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status, created_by) VALUES ($1, 'Вымышленный модуль', 1, 1, $2, $3, 'open', 100) RETURNING id",
    [type.id, v.id, scale.id],
  )).id;
  await db.query('INSERT INTO monitoring.work_groups (work_id, group_id) VALUES ($1, 1), ($1, 2)', [work]);

  const admin = { id: 100, full_name: 'Администратор 1' };
  const call = (user, method, p, body) => route({ path: p, method, query: {}, body, user, db });
  const teacher = capabilities(new Set(['teacher']));
  const head = capabilities(new Set(['department_head']));
  // Строки для сервера: параллель, группа, текст ячейки «Учитель».
  const rows = [
    ['1', '1 AC', 'Учительская А.Б.'],
    ['1', '1 АG', 'учительская а. б.'],
    ['2', '2 AB', 'Елкина М.П.'],
    ['3', '3 AG', 'Учительская А.Б.'],
    ['4', '4 AF', 'Новая Д.Е.'],
    ['4', '4 AF', 'Двойная И.И.'],
    ['10', '10 E', 'Двойная И.И.'],
    ['5', '5 ZZ', 'Учительская А.Б.'],
    ['1', '1 AC', ''],
  ];

  await t.test('только data_admin, проверка на сервере', async () => {
    for (const id of [201, 104, 105]) {
      const user = { id };
      assert.equal((await call(user, 'GET', '/rosters/teachers')).status, 403);
      assert.equal((await call(user, 'POST', '/rosters/teachers/preview', { rows })).status, 403);
      assert.equal((await call(user, 'POST', '/rosters/teachers/apply', { rows, token: 'x' })).status, 403);
      assert.equal((await call(user, 'POST', '/rosters/teachers/1', { action: 'set', user_id: id })).status, 403);
      assert.equal((await call(user, 'POST', '/rosters/teachers/1/reset', {})).status, 403);
    }
  });

  await t.test('до назначений учитель видит группы по Пульсу', async () => {
    assert.deepEqual(await teacherGroupIds(db, 201), [3, 5]);
    assert.deepEqual(await teacherGroupIds(db, 202), [1, 2]);
    const w = await listWorks(db, 202, teacher);
    assert.deepEqual(w.body.works.map(x => x.groups.map(g => g.id)), [[1, 2]]);
  });

  let report;
  await t.test('пробный прогон: сопоставление без записи', async () => {
    const r = await call(admin, 'POST', '/rosters/teachers/preview', { rows });
    assert.equal(r.status, 200);
    report = r.body;
    assert.deepEqual(report.summary, { groups: 6, same: 1, differs: 3, not_found: 1, ambiguous: 1, no_role: 1, unknown_group_rows: 1 });
    const view = report.groups.map(g => [g.title, g.status, g.pulse.map(p => p.full_name), g.entries.map(e => [e.text, e.status, e.user && e.user.full_name])]);
    assert.deepEqual(view, [
      ['1 AC', 'differs', ['Преподова Вера Глебовна'], [['Учительская А.Б.', 'found', 'Учительская Анна Борисовна']]],
      ['1 AG', 'differs', ['Преподова Вера Глебовна'], [['учительская а. б.', 'found', 'Учительская Анна Борисовна']]],
      ['2 AB', 'differs', [], [['Елкина М.П.', 'found', 'Ёлкина Мария Петровна']]],
      ['3 AG', 'same', ['Учительская Анна Борисовна'], [['Учительская А.Б.', 'found', 'Учительская Анна Борисовна']]],
      ['4 AF', 'not_found', ['Прежняя Дарья Евгеньевна'], [['Новая Д.Е.', 'not_found', null], ['Двойная И.И.', 'ambiguous', null]]],
      ['10 E', 'ambiguous', ['Безучётная Жанна Зиновьевна'], [['Двойная И.И.', 'ambiguous', null]]],
    ]);
    // Неоднозначность: кандидаты с текущими группами; у 205 есть роль «Учитель», у 206 нет.
    const amb = report.groups.find(g => g.title === '10 E').entries[0].candidates;
    assert.deepEqual(amb.map(c => [c.id, c.no_role]), [[206, true], [205, false]]);
    // Учётной записи без роли «Учитель» модуль не откроется: это видно в прогоне.
    assert.equal(report.groups.find(g => g.title === '2 AB').entries[0].user.no_role, true);
    assert.deepEqual(report.unknown_groups, [{ group: '5 ZZ', rows: 1 }]);
    // Ничего не записано, почт и текста файла в ответе нет.
    assert.equal((await one('SELECT count(*)::int AS n FROM monitoring.group_teacher_assignments')).n, 0);
    assert.doesNotMatch(JSON.stringify(report), /@/);
  });

  await t.test('проверка строк', async () => {
    assert.equal((await call(admin, 'POST', '/rosters/teachers/preview', { rows: 'x' })).status, 400);
    assert.equal((await call(admin, 'POST', '/rosters/teachers/preview', { rows: Array(5001).fill(['1', '1 AC', 'Учительская А.Б.']) })).status, 400);
    assert.equal((await call(admin, 'POST', '/rosters/teachers/apply', { rows, token: report.token, manual: [[4, 0, 999]] })).status, 404);
  });

  await t.test('применение: файл и ручной выбор, не найденные без выбора не меняются', async () => {
    assert.equal((await call(admin, 'POST', '/rosters/teachers/apply', { rows, token: 'wrong' })).status, 409);
    // 4 AF: «Новая Д.Е.» в Пульсе под прежней фамилией, выбрана вручную; из двух «Двойная И.И.» выбрана 205.
    const r = await call(admin, 'POST', '/rosters/teachers/apply', { rows, token: report.token, manual: [[4, 0, 203], [4, 1, 205]] });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.groups, r.body.skipped, r.body.added, r.body.removed], [5, 1, 6, 0]);
    const a = (await db.query('SELECT group_id, user_id, source FROM monitoring.group_teacher_assignments ORDER BY group_id, user_id')).rows;
    assert.deepEqual(a.map(x => [x.group_id, x.user_id, x.source]), [
      [1, 201, 'file'], [2, 201, 'file'], [3, 201, 'file'], [4, 203, 'manual'], [4, 205, 'manual'], [7, 207, 'file'],
    ]);
    // Учитель по файлу видит свои группы; прежний учитель по Пульсу их больше не видит.
    assert.deepEqual(await teacherGroupIds(db, 201), [1, 2, 3, 5]); // 4 AF (ЦГ) в файле нет: по Пульсу
    assert.deepEqual(await teacherGroupIds(db, 202), []);
    assert.deepEqual(await teacherGroupIds(db, 203), [4]);
    assert.deepEqual(await teacherGroupIds(db, 205), [4]);
    assert.deepEqual((await listWorks(db, 201, teacher)).body.works.map(x => x.groups.map(g => g.id)), [[1, 2]]);
    assert.deepEqual((await listWorks(db, 202, teacher)).body.works, []);
    assert.equal((await getSheet(db, 202, teacher, work, 1)).status, 403);
    assert.equal((await getSheet(db, 201, teacher, work, 1)).body.can_edit, true);
    // Права заведующей не меняются: она видит все группы работы.
    assert.deepEqual((await listWorks(db, 104, head)).body.works.map(x => x.groups.map(g => g.id)), [[1, 2]]);
  });

  await t.test('повторное применение того же файла ничего не меняет и не теряет ручной выбор', async () => {
    const again = (await call(admin, 'POST', '/rosters/teachers/preview', { rows })).body;
    assert.equal(again.groups.find(g => g.title === '1 AC').status, 'same');
    assert.deepEqual(again.groups.find(g => g.title === '4 AF').module.map(m => [m.id, m.source]), [[203, 'manual'], [205, 'manual']]);
    const r = await call(admin, 'POST', '/rosters/teachers/apply', { rows, token: again.token });
    assert.deepEqual([r.body.groups, r.body.skipped, r.body.added, r.body.changed, r.body.removed], [4, 2, 0, 0, 0]);
    assert.deepEqual(await teacherGroupIds(db, 203), [4]);
  });

  await t.test('вручную: назначить, добавить, снять, вернуть как в Пульсе', async () => {
    assert.equal((await call(admin, 'POST', '/rosters/teachers/6', { action: 'set', user_id: 999 })).status, 404);
    assert.equal((await call(admin, 'POST', '/rosters/teachers/99', { action: 'set', user_id: 205 })).status, 404);
    assert.equal((await call(admin, 'POST', '/rosters/teachers/6', { action: 'x', user_id: 205 })).status, 400);
    let schema = await call(admin, 'GET', '/schema');
    assert.ok(schema.body.groups_without_account.some(g => g.title === '10 E'));
    assert.equal((await call(admin, 'POST', '/rosters/teachers/6', { action: 'set', user_id: 206 })).status, 200);
    assert.equal((await call(admin, 'POST', '/rosters/teachers/6', { action: 'add', user_id: 205 })).status, 200);
    assert.deepEqual(await teacherGroupIds(db, 205), [4, 6]);
    assert.equal((await call(admin, 'POST', '/rosters/teachers/6', { action: 'remove', user_id: 206 })).status, 200);
    assert.equal((await call(admin, 'POST', '/rosters/teachers/6', { action: 'remove', user_id: 206 })).status, 409);
    schema = await call(admin, 'GET', '/schema');
    assert.ok(!schema.body.groups_without_account.some(g => g.title === '10 E'));
    // Вернуть как в Пульсе: назначения снимаются, учитель группы снова по Пульсу.
    assert.equal((await call(admin, 'POST', '/rosters/teachers/1/reset', {})).status, 200);
    assert.equal((await call(admin, 'POST', '/rosters/teachers/1/reset', {})).status, 409);
    assert.deepEqual(await teacherGroupIds(db, 202), [1]);
    assert.deepEqual(await teacherGroupIds(db, 201), [2, 3, 5]);
  });

  await t.test('таблица на вкладке и история с автором', async () => {
    const r = await call(admin, 'GET', '/rosters/teachers');
    assert.equal(r.status, 200);
    const view = r.body.groups.map(g => [g.title, g.module.map(m => [m.full_name, m.source]), g.pulse.map(p => p.full_name)]);
    assert.deepEqual(view, [
      ['1 AC', [], ['Преподова Вера Глебовна']],
      ['1 AG', [['Учительская Анна Борисовна', 'file']], ['Преподова Вера Глебовна']],
      ['2 AB', [['Ёлкина Мария Петровна', 'file']], []],
      ['3 AG', [['Учительская Анна Борисовна', 'file']], ['Учительская Анна Борисовна']],
      ['4 AF', [['Прежняя Дарья Евгеньевна', 'manual'], ['Двойная Ирина Ивановна', 'manual']], ['Прежняя Дарья Евгеньевна']],
      ['4 AF (ЦГ)', [], ['Учительская Анна Борисовна']],
      ['10 E', [['Двойная Ирина Ивановна', 'manual']], ['Безучётная Жанна Зиновьевна']],
    ]);
    assert.equal(r.body.groups.find(g => g.title === '10 E').pulse[0].has_account, false);
    assert.equal(r.body.groups.find(g => g.title === '2 AB').module[0].no_role, true);
    const h = r.body.history.map(x => [x.group, x.teacher, x.action, x.how, x.changed_by_name]);
    assert.deepEqual(h.slice(0, 4), [
      ['1 AC', 'Учительская Анна Борисовна', 'remove', 'pulse', 'Администратор 1'],
      ['10 E', 'Двойная Инна Игоревна', 'remove', 'manual', 'Администратор 1'],
      ['10 E', 'Двойная Ирина Ивановна', 'assign', 'manual', 'Администратор 1'],
      ['10 E', 'Двойная Инна Игоревна', 'assign', 'manual', 'Администратор 1'],
    ]);
    assert.equal(h.length, 10);
    // Экран «Роли» показывает группы так же, как их видит учитель.
    const roles = await call(admin, 'GET', '/roles');
    assert.deepEqual(roles.body.users.find(u => u.id === 202).groups.map(g => g.title), ['1 AC']);
  });
});
