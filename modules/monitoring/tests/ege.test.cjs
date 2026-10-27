// Пробный ЕГЭ (письменная часть): структура 62 балла, процент, нет отметки ни в одном ответе, ввод.
// Запуск: MONITORING_TEST_DATABASE_URL=postgres://... node --test tests/
// База должна быть пустой: тест создаёт схемы monitoring и pulse_read с вымышленными данными.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capabilities } = require('../server/lib/access.cjs');
const { percentOf, studentResult } = require('../server/lib/calc.cjs');

// Таблица из задания: блок, раздел, уровень, подпись, максимум.
const BLOCKS = [
  [1, 'Listening', 'basic', 'Задание 1', 2],
  [2, 'Listening', 'basic', 'Задание 2', 3],
  [3, 'Listening', 'high', 'Задания 3-9', 7],
  [4, 'Reading', 'basic', 'Задание 10', 3],
  [5, 'Reading', 'basic', 'Задание 11', 2],
  [6, 'Reading', 'high', 'Задания 12-18', 7],
  [7, 'Grammar', 'basic', 'Задания 19-24', 6],
  [8, 'Vocabulary', 'basic', 'Задания 25-29', 5],
  [9, 'Vocabulary', 'high', 'Задания 30-36', 7],
  [10, 'Writing', 'basic', 'Задание 37', 6],
  [11, 'Writing', 'high', 'Задание 38', 14],
];

test('процент из 62: округление до целого, половина вверх', () => {
  assert.equal(percentOf(62, 62), 100);
  assert.equal(percentOf(31, 62), 50);
  assert.equal(percentOf(47, 62), 76, '75,8 → 76');
  assert.equal(percentOf(46, 62), 74, '74,19 → 74');
  assert.equal(percentOf(1, 62), 2, '1,61 → 2');
  assert.equal(percentOf(40, 62), 65, '64,52 → 65');
  assert.equal(percentOf(0, 62), 0);
  // Половина вверх при другом максимуме: 1 из 8 = 12,5 → 13.
  assert.equal(percentOf(1, 8), 13);
});

test('расчёт без отметки: в результате нет mark и щадящего режима', () => {
  const parts = [{ id: 1, name: 'Письменная часть' }];
  const tasks = BLOCKS.map(([id, , , , max]) => ({ id, part_id: 1, max_points: max }));
  const scale = [{ mark: '5', min_percent: 90 }, { mark: '2', min_percent: 0 }];
  const full = studentResult({ parts, tasks, maxPoints: 62, scale, absentPartIds: new Set(), scores: new Map(tasks.map(t => [t.id, t.max_points])), gentle: true, graded: false });
  assert.deepEqual(full, { total: 62, percent: 100, complete: true, missing: 0, state: 'полная работа' });
  const part = studentResult({ parts, tasks, maxPoints: 62, scale, absentPartIds: new Set(), scores: new Map([[1, 2]]), graded: false });
  assert.equal(part.complete, false, 'итог только когда внесены все блоки');
  assert.equal(part.missing, 10);
  const absent = studentResult({ parts, tasks, maxPoints: 62, scale, absentPartIds: new Set([1]), scores: new Map(), graded: false });
  assert.equal(absent.state, 'отсутствовал: письменная часть');
});

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('пробный ЕГЭ в базе и на экране ввода', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
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
    INSERT INTO pulse_read.academic_years VALUES (1, '2026/2027', true, '2026-09-01');
    INSERT INTO pulse_read.groups VALUES (1, '11 А', '11A', 'main', 11, 1, NULL), (2, '11 Ц', '11D', 'digital', 11, 1, NULL), (3, '10 А', '10A', 'main', 10, 1, NULL);
    INSERT INTO pulse_read.english_teachers VALUES (1, 101, 'Учитель 1', NULL), (2, 102, 'Учитель 2', NULL);
    INSERT INTO pulse_read.users VALUES (101, 'Учитель 1'), (102, 'Учитель 2');
    INSERT INTO pulse_read.group_teachers VALUES (1, 1), (2, 2), (1, 3);
    INSERT INTO pulse_read.students SELECT i, 'Ученик ' || i FROM generate_series(1, 6) i;
    INSERT INTO pulse_read.group_memberships VALUES (1, 1, 1), (2, 2, 1), (3, 3, 1), (4, 4, 2), (5, 5, 3), (6, 6, 3);
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  const { options, createWorks, listWorks } = require('../server/works.cjs');
  const { getSheet, saveSheet, setGentle } = require('../server/sheet.cjs');
  const route = require('../server/routes.cjs');
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const admin = capabilities(new Set(['data_admin']));
  const teacher = capabilities(new Set(['teacher']));
  await db.query("INSERT INTO monitoring.user_roles (user_id, role) VALUES (1, 'data_admin'), (101, 'teacher'), (102, 'teacher') ON CONFLICT DO NOTHING");

  const type = await one("SELECT id, name, graded FROM monitoring.assessment_types WHERE code = 'ege_mock'");
  const version = await one(
    `SELECT v.id, v.status, v.max_points, v.frame_id FROM monitoring.spec_versions v JOIN monitoring.specs s ON s.id = v.spec_id WHERE s.type_id = $1`,
    [type.id],
  );
  const tasks = (await db.query('SELECT id, sort, section, level, title, max_points FROM monitoring.spec_tasks WHERE version_id = $1 ORDER BY sort', [version.id])).rows;

  await t.test('вид работы, схема 62 и 11 блоков из таблицы', async () => {
    assert.equal(type.name, 'Пробный ЕГЭ (письменная часть)');
    assert.equal(type.graded, false);
    assert.equal(version.status, 'approved');
    assert.equal(version.max_points, 62);
    assert.deepEqual(tasks.map(x => [x.sort, x.section, x.level, x.title, x.max_points]), BLOCKS);
    assert.equal(tasks.reduce((a, x) => a + x.max_points, 0), 62);
    const frame = await one('SELECT name, (SELECT sum(points)::int FROM monitoring.frame_rows WHERE frame_id = f.id) AS total FROM monitoring.frames f WHERE id = $1', [version.frame_id]);
    assert.deepEqual(frame, { name: 'ЕГЭ, письменная часть, 62', total: 62 });
    const by = (key) => tasks.reduce((m, x) => ({ ...m, [x[key]]: (m[x[key]] || 0) + x.max_points }), {});
    assert.deepEqual(by('level'), { basic: 27, high: 35 });
    const sections = by('section');
    assert.deepEqual([sections.Listening, sections.Reading, sections.Grammar + sections.Vocabulary, sections.Writing], [12, 12, 18, 20]);
    assert.equal((await one("SELECT name FROM monitoring.levels WHERE code = 'high'")).name, 'Высокий');
  });

  await t.test('форма: вид без отметки, нумерация названий', async () => {
    const r = await options(db, {});
    assert.equal(r.body.types.find(x => x.code === 'ege_mock').graded, false);
    assert.equal(r.body.types.find(x => x.code === 'module').graded, true);
    assert.ok(r.body.versions.some(v => v.id === version.id));
    assert.deepEqual(r.body.titles_by_type, {});
  });

  let workId;
  await t.test('создание: любая параллель, шкала не сохраняется', async () => {
    const scale = await one('SELECT id FROM monitoring.grade_scales WHERE is_default');
    const r = await createWorks(db, 1, {
      type_id: type.id, title: 'Пробный ЕГЭ 1', academic_year_id: 1, parallels: [11, 10], spec_version_id: version.id,
      scale_id: scale.id, status: 'open', groups: [1, 2, 3], dates: { test: '2026-11-20' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.created.length, 2);
    workId = r.body.created[0];
    const works = (await db.query('SELECT parallel, scale_id FROM monitoring.works ORDER BY id')).rows;
    assert.deepEqual(works, [{ parallel: 11, scale_id: null }, { parallel: 10, scale_id: null }]);
    const held = await one('SELECT held_on::text AS d FROM monitoring.work_parts WHERE work_id = $1', [workId]);
    assert.equal(held.d, '2026-11-20');
    assert.deepEqual((await options(db, {})).body.titles_by_type, { [type.id]: 1 });
  });

  await t.test('база не даёт шкалу работе без отметки и не даёт работу с отметкой без шкалы', async () => {
    const scale = await one('SELECT id FROM monitoring.grade_scales WHERE is_default');
    await assert.rejects(db.query('UPDATE monitoring.works SET scale_id = $2 WHERE id = $1', [workId, scale.id]), /шкала не нужна/);
    const module = await one("SELECT id FROM monitoring.assessment_types WHERE code = 'module'");
    await assert.rejects(db.query('UPDATE monitoring.works SET type_id = $2 WHERE id = $1', [workId, module.id]), /шкалу отметок/);
  });

  const allScores = (studentId, values) => values.map((score, i) => ({ student_id: studentId, task_id: tasks[i].id, score }));
  await t.test('ввод: итог из 62 и процент, итог только при всех блоках, больше максимума отклоняется', async () => {
    const r = await saveSheet(db, 101, teacher, workId, {
      group_id: 1,
      changes: [
        ...allScores(1, [2, 3, 7, 3, 2, 7, 6, 5, 7, 6, 14]),
        ...allScores(2, [1, 2, 4, 2, 1, 5, 4, 3, 4, 4, 10]),
        ...allScores(3, [2, 3, 5]),
        { student_id: 3, task_id: tasks[10].id, score: 15 },
        { student_id: 3, task_id: tasks[0].id, score: 3 },
      ],
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.errors, ['Балл должен быть целым числом от 0 до 14', 'Балл должен быть целым числом от 0 до 2']);
    const res = (id) => r.body.students.find(s => s.id === id).result;
    assert.deepEqual(res(1), { total: 62, percent: 100, complete: true, missing: 0, state: 'полная работа' });
    assert.deepEqual(res(2), { total: 40, percent: 65, complete: true, missing: 0, state: 'полная работа' });
    assert.equal(res(3).complete, false);
    assert.equal(res(3).missing, 8);
    const kept = await one('SELECT score FROM monitoring.task_scores WHERE work_id = $1 AND student_id = 3 AND task_id = $2', [workId, tasks[0].id]);
    assert.equal(kept.score, 2);
    await assert.rejects(db.query('UPDATE monitoring.task_scores SET score = 15 WHERE work_id = $1 AND task_id = $2', [workId, tasks[10].id]), /больше максимума/);
  });

  await t.test('отсутствие отмечается как в модулях', async () => {
    const part = await one("SELECT id FROM monitoring.spec_parts WHERE version_id = $1 AND code = 'test'", [version.id]);
    const r = await saveSheet(db, 102, teacher, workId, { group_id: 2, changes: [{ student_id: 4, part_id: part.id, absent: true }] });
    assert.deepEqual(r.body.errors, []);
    assert.equal(r.body.students[0].result.state, 'отсутствовал: письменная часть');
  });

  await t.test('нет отметки ни в одном ответе сервера по этой работе', async () => {
    const answers = [
      await getSheet(db, 1, admin, workId, 1),
      await getSheet(db, 101, teacher, workId, 1),
      await saveSheet(db, 101, teacher, workId, { group_id: 1, changes: allScores(3, [2]) }),
      await listWorks(db, 1, admin),
      await listWorks(db, 101, teacher),
      await route({ path: `/works/${workId}/sheet`, method: 'GET', query: { group: '2' }, body: null, user: { id: 102 }, db }),
    ];
    for (const a of answers) {
      assert.equal(a.status, 200);
      const text = JSON.stringify(a.body);
      for (const word of ['"mark"', 'gentle', '"scale"', 'Отметка', 'отметк']) assert.ok(!text.includes(word), `в ответе есть ${word}: ${text.slice(0, 200)}`);
    }
    const sheet = answers[0].body;
    assert.equal(sheet.work.graded, false);
    assert.deepEqual([...new Set(sheet.tasks.map(x => x.section_label))], ['Аудирование', 'Чтение', 'Грамматика и лексика', 'Письменная речь']);
    assert.equal(sheet.tasks[2].level_name, 'Высокий');
    const g = await setGentle(db, {}, 1, admin, workId, { group_id: 1, enabled: true });
    assert.equal(g.status, 403, 'щадящий режим к пробному ЕГЭ не применяется');
  });

  await t.test('учитель видит только свою группу', async () => {
    const own = await getSheet(db, 102, teacher, workId, 2);
    assert.equal(own.status, 200);
    const other = await getSheet(db, 102, teacher, workId, 1);
    assert.equal(other.status, 403);
  });
});
