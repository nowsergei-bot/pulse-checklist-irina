// Ввод баллов по группе: права, проверки, один балл на ученика, история, расчёт.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
// База должна быть пустой: тест создаёт схемы monitoring и pulse_read с вымышленными данными.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capabilities } = require('../server/lib/access.cjs');
const { getSheet, saveSheet } = require('../server/sheet.cjs');

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('ввод баллов по группе', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  t.after(() => db.end());
  // Тесты с базой идут по очереди: обе проверки пересоздают схему monitoring.
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
    INSERT INTO pulse_read.academic_years VALUES (1, '2026/2027', true, '2026-09-01');
    INSERT INTO pulse_read.groups VALUES (1, 'Группа А', 'A', 'main', 7, 1, NULL), (2, 'Группа Б', 'B', 'digital', 7, 1, NULL);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL), (2, 102, 'Учитель 2', NULL);
    INSERT INTO pulse_read.group_teachers VALUES (1, 1), (2, 2);
    INSERT INTO pulse_read.students SELECT i, 'Ученик ' || i FROM generate_series(1, 7) i;
    INSERT INTO pulse_read.group_memberships SELECT i, i, 1 FROM generate_series(1, 6) i;
    INSERT INTO pulse_read.group_memberships VALUES (7, 1, 2), (8, 7, 2);
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
  const writing = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'writing', 'Письмо', 1) RETURNING id", [v.id]);
  const testPart = await one("INSERT INTO monitoring.spec_parts (version_id, code, name, sort) VALUES ($1, 'test', 'Тест', 2) RETURNING id", [v.id]);
  const rows = [
    [writing.id, 'Writing', 'basic', 5], [writing.id, 'Writing', 'advanced', 5],
    [testPart.id, 'Listening', 'basic', 10], [testPart.id, 'Reading', 'basic', 10], [testPart.id, 'Grammar', 'advanced', 10], [testPart.id, 'Vocabulary', 'advanced', 10],
  ];
  const tasks = [];
  for (const [i, [part, section, level, max]] of rows.entries()) {
    tasks.push(await one(
      'INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, part_id, max_points',
      [v.id, part, i + 1, section, level, `${section}: ${level}`, max],
    ));
  }
  await db.query("UPDATE monitoring.spec_versions SET status = 'approved' WHERE id = $1", [v.id]);
  const work = await one(
    "INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status, created_by) VALUES ($1, 'Вымышленный модуль', 1, 7, $2, $3, 'open', 100) RETURNING id",
    [type.id, v.id, scale.id],
  );
  await db.query('INSERT INTO monitoring.work_parts (work_id, part_id) VALUES ($1, $2), ($1, $3)', [work.id, writing.id, testPart.id]);
  await db.query('INSERT INTO monitoring.work_groups (work_id, group_id) VALUES ($1, 1), ($1, 2)', [work.id]);

  const teacher = capabilities(new Set(['teacher']));
  const head = capabilities(new Set(['department_head']));
  const deputy = capabilities(new Set(['deputy']));
  const admin = capabilities(new Set(['data_admin']));
  const setStatus = (status) => db.query('UPDATE monitoring.works SET status = $2 WHERE id = $1', [work.id, status]);
  const scoresFor = (studentId, values) => values.map((score, i) => ({ student_id: studentId, task_id: tasks[i].id, score }));
  const student = (r, id) => r.body.students.find(s => s.id === id);

  await t.test('пример: 41, 46, 28, 27, отсутствие и пропуски', async () => {
    const r = await saveSheet(db, 101, teacher, work.id, {
      group_id: 1,
      changes: [
        ...scoresFor(2, [5, 4, 8, 8, 8, 8]),
        ...scoresFor(3, [5, 5, 9, 9, 9, 9]),
        ...scoresFor(4, [3, 3, 6, 6, 5, 5]),
        ...scoresFor(5, [3, 2, 6, 6, 5, 5]),
        { student_id: 6, part_id: writing.id, absent: true },
        ...scoresFor(6, [null, null, 7, 7, 7, 7]).slice(2),
        ...scoresFor(1, [4, 4]),
      ],
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.errors, []);
    const pick = (id) => { const x = student(r, id).result; return [x.total, x.percent, x.mark, x.state]; };
    assert.deepEqual(pick(2), [41, 82, '4', 'полная работа']);
    assert.deepEqual(pick(3), [46, 92, '5', 'полная работа']);
    assert.deepEqual(pick(4), [28, 56, '3', 'полная работа']);
    assert.deepEqual(pick(5), [27, 54, '3', 'полная работа']);
    assert.deepEqual(pick(6), [28, 56, null, 'отсутствовал: письмо']);
    assert.deepEqual(pick(1), [8, 16, null, 'не внесено баллов: 4']);
  });

  await t.test('балл только целое число от 0 до максимума задания, ученик только из группы', async () => {
    const r = await saveSheet(db, 101, teacher, work.id, {
      group_id: 1,
      changes: [
        { student_id: 2, task_id: tasks[2].id, score: 11 },
        { student_id: 2, task_id: tasks[2].id, score: 2.5 },
        { student_id: 2, task_id: tasks[2].id, score: -1 },
        { student_id: 7, task_id: tasks[2].id, score: 1 },
      ],
    });
    assert.deepEqual(r.body.errors, ['Балл должен быть целым числом от 0 до 10', 'Ученик не из этой группы']);
    const row = await one('SELECT score FROM monitoring.task_scores WHERE work_id = $1 AND student_id = 2 AND task_id = $2', [work.id, tasks[2].id]);
    assert.equal(row.score, 8);
  });

  await t.test('ученик в двух группах: второй группе виден балл первой, перезаписать нельзя', async () => {
    const view = await getSheet(db, 102, teacher, work.id, 2);
    assert.equal(view.status, 200);
    assert.equal(student(view, 1).foreign[`t${tasks[0].id}`], 'Группа А');
    const r = await saveSheet(db, 102, teacher, work.id, {
      group_id: 2,
      changes: [{ student_id: 1, task_id: tasks[0].id, score: 1 }, { student_id: 1, part_id: writing.id, absent: true }, ...scoresFor(1, [null, null, 6, 6, 6, 6]).slice(2)],
    });
    assert.deepEqual(r.body.conflicts.map(c => c.key), [`t${tasks[0].id}`, `p${writing.id}`]);
    assert.equal(r.body.conflicts[0].group, 'Группа А');
    assert.equal(student(r, 1).result.total, 32);
    const owner = await one('SELECT group_id, score FROM monitoring.task_scores WHERE work_id = $1 AND student_id = 1 AND task_id = $2', [work.id, tasks[0].id]);
    assert.deepEqual(owner, { group_id: 1, score: 4 });
    const back = await saveSheet(db, 101, teacher, work.id, { group_id: 1, changes: [{ student_id: 1, task_id: tasks[2].id, score: 1 }] });
    assert.equal(back.body.conflicts[0].group, 'Группа Б');
  });

  await t.test('история пишет настоящего автора и только настоящие изменения', async () => {
    await saveSheet(db, 100, admin, work.id, { group_id: 1, changes: [{ student_id: 2, task_id: tasks[0].id, score: 3 }, { student_id: 3, task_id: tasks[0].id, score: 5 }] });
    const h = await db.query('SELECT student_id, old_value, new_value, changed_by FROM monitoring.score_history WHERE work_id = $1 AND task_id = $2 AND student_id IN (2, 3) ORDER BY id', [work.id, tasks[0].id]);
    assert.deepEqual(h.rows, [
      { student_id: 2, old_value: null, new_value: '5', changed_by: 101 },
      { student_id: 3, old_value: null, new_value: '5', changed_by: 101 },
      { student_id: 2, old_value: '5', new_value: '3', changed_by: 100 },
    ]);
    const absent = await one('SELECT new_value, changed_by FROM monitoring.score_history WHERE work_id = $1 AND part_id = $2 AND student_id = 6', [work.id, writing.id]);
    assert.deepEqual(absent, { new_value: 'absent', changed_by: 101 });
  });

  await t.test('права: свои группы, просмотр, закрытая работа, черновик', async () => {
    assert.equal((await getSheet(db, 102, teacher, work.id, 1)).status, 403);
    assert.equal((await saveSheet(db, 102, teacher, work.id, { group_id: 1, changes: [] })).status, 403);
    const seen = await getSheet(db, 103, deputy, work.id, 1);
    assert.equal(seen.status, 200);
    assert.equal(seen.body.can_edit, false);
    assert.equal((await saveSheet(db, 103, deputy, work.id, { group_id: 1, changes: [] })).status, 403);
    assert.equal((await getSheet(db, 104, head, work.id, 2)).body.can_edit, true);
    assert.equal((await getSheet(db, 105, capabilities(new Set()), work.id, 1)).status, 403);

    await setStatus('closed');
    const closed = await getSheet(db, 101, teacher, work.id, 1);
    assert.equal(closed.body.can_edit, false);
    assert.equal(closed.body.reason, 'Работа закрыта, результаты только для просмотра');
    assert.equal((await saveSheet(db, 101, teacher, work.id, { group_id: 1, changes: [{ student_id: 2, task_id: tasks[0].id, score: 4 }] })).status, 403);
    const fixed = await saveSheet(db, 104, head, work.id, { group_id: 1, changes: [{ student_id: 2, task_id: tasks[0].id, score: 4 }] });
    assert.equal(fixed.status, 200);
    assert.equal(student(fixed, 2).scores[tasks[0].id], 4);
    const byAdmin = await saveSheet(db, 100, admin, work.id, { group_id: 1, changes: [{ student_id: 2, task_id: tasks[1].id, score: 5 }] });
    assert.equal(byAdmin.status, 200);
    assert.equal(student(byAdmin, 2).scores[tasks[1].id], 5);

    await setStatus('draft');
    assert.equal((await getSheet(db, 101, teacher, work.id, 1)).status, 403);
    assert.equal((await getSheet(db, 104, head, work.id, 1)).status, 403);
    assert.equal((await getSheet(db, 100, admin, work.id, 1)).status, 200);
    await setStatus('open');
    assert.equal((await getSheet(db, 100, admin, work.id, 99)).status, 404);
  });

  await t.test('выбывший ученик внизу таблицы: баллы видны и сохранены, вносить нельзя', async () => {
    await db.query('DELETE FROM pulse_read.group_memberships WHERE student_id = 2 AND group_id = 1');
    const r = await getSheet(db, 101, teacher, work.id, 1);
    assert.equal(r.body.students.some(s => s.id === 2), false);
    assert.deepEqual(r.body.left_students.map(s => [s.id, s.full_name, s.result.total]), [[2, 'Ученик 2', 41]]);
    assert.equal(r.body.left_students[0].scores[tasks[0].id], 4);
    const save = await saveSheet(db, 101, teacher, work.id, { group_id: 1, changes: [{ student_id: 2, task_id: tasks[0].id, score: 1 }] });
    assert.deepEqual(save.body.errors, ['Ученик не из этой группы']);
    const kept = await one('SELECT score FROM monitoring.task_scores WHERE work_id = $1 AND student_id = 2 AND task_id = $2', [work.id, tasks[0].id]);
    assert.equal(kept.score, 4);
    assert.deepEqual((await getSheet(db, 102, teacher, work.id, 2)).body.left_students, []);
  });
});
