// Щадящий режим: права, расчёт по группе, кнопка для параллели, подсчёт изменений, история.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
// База должна быть пустой: тест создаёт схемы monitoring и pulse_read с вымышленными данными.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capabilities } = require('../server/lib/access.cjs');
const { getSheet, saveSheet, setGentle } = require('../server/sheet.cjs');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('щадящий режим', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
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
    CREATE TABLE pulse_read.students (id int, full_name text);
    CREATE TABLE pulse_read.group_memberships (id int, student_id int, group_id int);
    CREATE TABLE pulse_read.users (id int, full_name text);
    INSERT INTO pulse_read.academic_years VALUES (1, '2026/2027', true, '2026-09-01');
    INSERT INTO pulse_read.groups VALUES (1, 'Группа А', 'A', 'main', 7, 1, NULL), (2, 'Группа Б', 'B', 'digital', 7, 1, NULL);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL);
    INSERT INTO pulse_read.group_teachers VALUES (1, 1);
    INSERT INTO pulse_read.users VALUES (100, 'Администратор 1'), (101, 'Учитель 1'), (104, 'Заведующий 1');
    INSERT INTO pulse_read.students VALUES (1, 'Ученик А'), (2, 'Ученик Б'), (3, 'Ученик В'), (4, 'Ученик Г'), (5, 'Ученик Д'), (6, 'Ученик Е');
    INSERT INTO pulse_read.group_memberships SELECT i, i, 1 FROM generate_series(1, 5) i;
    INSERT INTO pulse_read.group_memberships VALUES (6, 6, 2);
  `);
  // Миграции после pulse_read: миграция 006 читает справочник учителей.
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }

  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const type = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'module'");
  const frame = await one('SELECT id FROM monitoring.frames LIMIT 1');
  const scale = await one('SELECT id FROM monitoring.grade_scales WHERE is_default');
  const spec = await one('INSERT INTO monitoring.specs (type_id, title) VALUES ($1, $2) RETURNING id', [type.id, 'Вымышленный модуль']);
  const v = await one('INSERT INTO monitoring.spec_versions (spec_id, version, frame_id, max_points) VALUES ($1, 1, $2, 50) RETURNING id', [spec.id, frame.id]);
  const part = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'test', 'Тест', 1) RETURNING id", [v.id]);
  // Базовые 20 баллов, повышенные 30.
  const rows = [['Listening', 'basic', 10], ['Reading', 'basic', 10], ['Grammar', 'advanced', 15], ['Vocabulary', 'advanced', 15]];
  const tasks = [];
  for (const [i, [section, level, max]] of rows.entries()) {
    tasks.push(await one(
      'INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [v.id, part.id, i + 1, section, level, `${section}: ${level}`, max],
    ));
  }
  await db.query("UPDATE monitoring.spec_versions SET status = 'approved' WHERE id = $1", [v.id]);
  const work = await one(
    "INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status, created_by) VALUES ($1, 'Вымышленный модуль', 1, 7, $2, $3, 'open', 100) RETURNING id",
    [type.id, v.id, scale.id],
  );
  await db.query('INSERT INTO monitoring.work_parts (work_id, part_id) VALUES ($1, $2)', [work.id, part.id]);
  await db.query('INSERT INTO monitoring.work_groups (work_id, group_id) VALUES ($1, 1), ($1, 2)', [work.id]);

  const teacher = capabilities(new Set(['teacher']));
  const head = capabilities(new Set(['department_head']));
  // Заведующая, если право вернуть настройкой GENTLE_SWITCH_ROLES.
  const headSwitch = capabilities(new Set(['department_head']), ['data_admin', 'department_head']);
  const deputy = capabilities(new Set(['deputy']));
  const admin = capabilities(new Set(['data_admin']));
  const setStatus = (status) => db.query('UPDATE monitoring.works SET status = $2 WHERE id = $1', [work.id, status]);
  // [базовые, повышенные] делятся поровну между двумя заданиями уровня.
  const marks = { 1: [16, 8], 2: [18, 15], 3: [19, 20], 4: [20, 25], 5: [12, 26] };
  const changes = [];
  for (const [id, [basic, advanced]] of Object.entries(marks)) {
    const values = [Math.ceil(basic / 2), Math.floor(basic / 2), Math.ceil(advanced / 2), Math.floor(advanced / 2)];
    values.forEach((score, i) => changes.push({ student_id: Number(id), task_id: tasks[i].id, score }));
  }
  const saved = await saveSheet(db, 101, teacher, work.id, { group_id: 1, changes });
  assert.deepEqual(saved.body.errors, []);
  const results = (r) => Object.fromEntries(r.body.students.map(s => [s.full_name.slice(-1), [s.result.total, s.result.percent, s.result.gentle_percent, s.result.mark]]));

  await t.test('по умолчанию выключен: обычный процент и отметка', async () => {
    const r = await getSheet(db, 101, teacher, work.id, 1);
    assert.equal(r.body.gentle.enabled, false);
    assert.equal(r.body.gentle.can_change, false);
    assert.deepEqual(r.body.gentle.history, []);
    assert.deepEqual(results(r), {
      А: [24, 48, null, '2'], Б: [33, 66, null, '3'], В: [39, 78, null, '4'], Г: [45, 90, null, '5'], Д: [38, 76, null, '4'],
    });
  });

  await t.test('менять может только data_admin; заведующая, учитель и завуч не могут', async () => {
    for (const caps of [teacher, deputy, head, capabilities(new Set())]) {
      const r = await setGentle(db, { full_name: 'Учитель 1' }, 101, caps, work.id, { group_id: 1, enabled: true, confirm: true });
      assert.equal(r.status, 403);
    }
    const byHead = (await getSheet(db, 104, head, work.id, 1)).body.gentle;
    assert.deepEqual([byHead.can_change, byHead.history], [false, []]);
    assert.equal((await getSheet(db, 100, admin, work.id, 1)).body.gentle.can_change, true);
    const none = await one('SELECT count(*)::int AS n FROM monitoring.gentle_groups');
    assert.equal(none.n, 0);
    assert.equal((await setGentle(db, {}, 100, admin, work.id, { group_id: 1, enabled: 'да' })).status, 400);
    assert.equal((await setGentle(db, {}, 100, admin, work.id, { group_id: 99, enabled: true })).status, 404);
  });

  await t.test('право заведующей возвращается одной настройкой ролей', async () => {
    assert.equal(head.switchGentle, false);
    assert.equal(headSwitch.switchGentle, true);
    assert.equal((await getSheet(db, 104, headSwitch, work.id, 1)).body.gentle.can_change, true);
  });

  await t.test('перед включением: у скольких учеников изменится отметка, ничего не записано', async () => {
    const r = await setGentle(db, {}, 104, headSwitch, work.id, { group_id: 1, enabled: true });
    assert.deepEqual(r.body, { groups: 1, changed: 2, higher: 1, lower: 1 });
    assert.equal((await one('SELECT count(*)::int AS n FROM monitoring.gentle_groups')).n, 0);
  });

  await t.test('включение: отметка по щадящему проценту, итог и обычный процент прежние, история с ФИО', async () => {
    const r = await setGentle(db, { full_name: 'Другое имя' }, 104, headSwitch, work.id, { group_id: 1, enabled: true, confirm: true });
    assert.equal(r.body.done, true);
    const sheet = await getSheet(db, 101, teacher, work.id, 1);
    assert.equal(sheet.body.gentle.enabled, true);
    assert.deepEqual(results(sheet), {
      А: [24, 48, 57, '3'], Б: [33, 66, 73, '3'], В: [39, 78, 83, '4'], Г: [45, 90, 93, '5'], Д: [38, 76, 71, '3'],
    });
    // Учителю и заведующей история не видна, data_admin видна.
    assert.deepEqual(sheet.body.gentle.history, []);
    assert.deepEqual((await getSheet(db, 104, head, work.id, 1)).body.gentle.history, []);
    const h = (await getSheet(db, 100, admin, work.id, 1)).body.gentle.history;
    assert.deepEqual(h.map(x => [x.enabled, x.changed_by_name]), [[true, 'Заведующий 1']]);
    const raw = await one('SELECT changed_by FROM monitoring.gentle_history');
    assert.equal(raw.changed_by, 104);
    // Баллы не изменились.
    const sum = await one('SELECT sum(score)::int AS s FROM monitoring.task_scores WHERE work_id = $1', [work.id]);
    assert.equal(sum.s, 24 + 33 + 39 + 45 + 38);
    // Сохранение баллов пересчитывает отметку в том же режиме.
    const again = await saveSheet(db, 101, teacher, work.id, { group_id: 1, changes: [{ student_id: 5, task_id: tasks[0].id, score: 6 }] });
    assert.deepEqual([again.body.students[0].result.gentle_percent, again.body.students[0].result.mark], [71, '3']);
  });

  await t.test('повторное включение ничего не меняет и не пишет в историю', async () => {
    const r = await setGentle(db, {}, 100, admin, work.id, { group_id: 1, enabled: true, confirm: true });
    assert.deepEqual([r.body.groups, r.body.changed], [0, 0]);
    assert.equal((await one('SELECT count(*)::int AS n FROM monitoring.gentle_history')).n, 1);
  });

  await t.test('для всех групп параллели: включаются и выключаются все группы работы', async () => {
    const on = await setGentle(db, {}, 100, admin, work.id, { group_id: 1, scope: 'parallel', enabled: true, confirm: true });
    assert.equal(on.body.groups, 1);
    assert.equal((await getSheet(db, 100, admin, work.id, 2)).body.gentle.enabled, true);
    const preview = await setGentle(db, {}, 100, admin, work.id, { group_id: 2, scope: 'parallel', enabled: false });
    assert.deepEqual(preview.body, { groups: 2, changed: 2, higher: 1, lower: 1 });
    const off = await setGentle(db, {}, 100, admin, work.id, { group_id: 2, scope: 'parallel', enabled: false, confirm: true });
    assert.equal(off.body.groups, 2);
    const sheet = await getSheet(db, 100, admin, work.id, 1);
    assert.equal(sheet.body.gentle.enabled, false);
    assert.equal(results(sheet).Д[3], '4');
    const h = await db.query('SELECT group_id, enabled, changed_by_name FROM monitoring.gentle_history ORDER BY id');
    assert.deepEqual(h.rows, [
      { group_id: 1, enabled: true, changed_by_name: 'Заведующий 1' },
      { group_id: 2, enabled: true, changed_by_name: 'Администратор 1' },
      { group_id: 1, enabled: false, changed_by_name: 'Администратор 1' },
      { group_id: 2, enabled: false, changed_by_name: 'Администратор 1' },
    ]);
  });

  await t.test('ученик из двух групп: режим группы, где внесены его баллы', async () => {
    // Ученик А в составе обеих групп, его баллы внесены в группе А.
    await db.query('INSERT INTO pulse_read.group_memberships VALUES (9, 1, 2)');
    const pupil = (r, id) => r.body.students.find(x => x.id === id);
    const preview = await setGentle(db, {}, 100, admin, work.id, { group_id: 2, enabled: true });
    assert.deepEqual(preview.body, { groups: 1, changed: 0, higher: 0, lower: 0 });
    await setGentle(db, {}, 100, admin, work.id, { group_id: 2, enabled: true, confirm: true });
    let second = await getSheet(db, 100, admin, work.id, 2);
    assert.equal(second.body.gentle.enabled, true);
    assert.deepEqual([pupil(second, 1).gentle, pupil(second, 1).result.mark], [false, '2']);
    // Ученик без баллов получает режим группы, в таблице которой он сейчас.
    assert.equal(pupil(second, 6).gentle, true);
    const counted = await setGentle(db, {}, 100, admin, work.id, { group_id: 1, enabled: true });
    assert.deepEqual(counted.body, { groups: 1, changed: 2, higher: 1, lower: 1 });
    await setGentle(db, {}, 100, admin, work.id, { group_id: 1, enabled: true, confirm: true });
    await setGentle(db, {}, 100, admin, work.id, { group_id: 2, enabled: false, confirm: true });
    second = await getSheet(db, 100, admin, work.id, 2);
    assert.equal(second.body.gentle.enabled, false);
    assert.deepEqual([pupil(second, 1).gentle, pupil(second, 1).result.gentle_percent, pupil(second, 1).result.mark], [true, 57, '3']);
    assert.deepEqual([pupil(await getSheet(db, 100, admin, work.id, 1), 1).result.mark], ['3']);
    await setGentle(db, {}, 100, admin, work.id, { group_id: 1, scope: 'parallel', enabled: false, confirm: true });
  });

  await t.test('закрытая работа: можно с правом переключения, черновик только data_admin', async () => {
    await setStatus('closed');
    assert.equal((await setGentle(db, {}, 104, headSwitch, work.id, { group_id: 1, enabled: true })).status, 200);
    assert.equal((await setGentle(db, {}, 104, head, work.id, { group_id: 1, enabled: true })).status, 403);
    await setStatus('draft');
    assert.equal((await setGentle(db, {}, 104, headSwitch, work.id, { group_id: 1, enabled: true })).status, 403);
    assert.equal((await setGentle(db, {}, 100, admin, work.id, { group_id: 1, enabled: true })).status, 200);
    await setStatus('open');
  });
});
