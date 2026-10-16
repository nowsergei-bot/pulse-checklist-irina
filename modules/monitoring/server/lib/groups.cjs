// Группы и ученики из pulse_read. Почты из представлений не читаются.

async function currentYear(db) {
  const r = await db.query('SELECT id, label FROM pulse_read.academic_years WHERE is_current ORDER BY starts_on DESC NULLS LAST LIMIT 1');
  return r.rows[0] || null;
}

// group_teachers.teacher_id -> english_teachers.id -> english_teachers.user_id = users.id.
async function teacherGroupIds(db, userId) {
  const r = await db.query(
    `SELECT DISTINCT g.id
     FROM pulse_read.english_teachers t
     JOIN pulse_read.group_teachers gt ON gt.teacher_id = t.id
     JOIN pulse_read.groups g ON g.id = gt.group_id
     JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
     WHERE t.user_id = $1 AND t.archived_at IS NULL AND g.archived_at IS NULL AND y.is_current`,
    [userId],
  );
  return r.rows.map(row => Number(row.id));
}

async function parallelGroups(db, academicYearId, parallel) {
  const r = await db.query(
    `SELECT id, title, code, campus, parallel
     FROM pulse_read.groups
     WHERE academic_year_id = $1 AND parallel = $2 AND archived_at IS NULL
     ORDER BY campus, code, title`,
    [academicYearId, parallel],
  );
  return r.rows;
}

// Основной состав группы $n: из действующей загрузки файла, если группа в ней есть, иначе из Пульса.
// Возвращает подзапрос со столбцом student_id.
function baseRosterSql(param) {
  const fromFile = `SELECT 1 FROM monitoring.roster_import_groups ig JOIN monitoring.roster_imports i ON i.id = ig.import_id AND i.active WHERE ig.group_id = ${param}`;
  return `(SELECT im.student_id FROM monitoring.roster_import_members im JOIN monitoring.roster_imports i ON i.id = im.import_id AND i.active
           WHERE im.group_id = ${param}
           UNION
           SELECT gm.student_id FROM pulse_read.group_memberships gm
           WHERE gm.group_id = ${param} AND NOT EXISTS (${fromFile}))`;
}

// Группа $n входит в действующую загрузку файла.
function fromFileSql(param) {
  return `EXISTS (SELECT 1 FROM monitoring.roster_import_groups ig JOIN monitoring.roster_imports i ON i.id = ig.import_id AND i.active WHERE ig.group_id = ${param})`;
}

// Состав группы для работы: основной состав (файл или Пульс) с поправками модуля (monitoring.roster_overrides).
// «Исправить состав» (fix) действует на все работы. «Перевод с даты» (transfer) действует, если дата
// не позже даты работы (первая дата проведения частей); без работы или без дат берётся сегодняшний день.
async function groupStudents(db, groupId, workId = null) {
  const r = await db.query(
    `WITH d AS (
       SELECT coalesce((SELECT min(held_on) FROM monitoring.work_parts WHERE work_id = $2), current_date) AS on_date
     ), o AS (
       SELECT o.student_id, o.action FROM monitoring.roster_overrides o, d
       WHERE o.group_id = $1 AND o.cancelled_at IS NULL AND (o.kind = 'fix' OR o.from_date <= d.on_date)
     ), ids AS (
       (SELECT student_id FROM ${baseRosterSql('$1')} b
        EXCEPT SELECT student_id FROM o WHERE action = 'remove')
       UNION SELECT student_id FROM o WHERE action = 'add'
     )
     SELECT DISTINCT s.id, s.full_name
     FROM ids JOIN pulse_read.students s ON s.id = ids.student_id
     ORDER BY s.full_name`,
    [groupId, workId],
  );
  return r.rows;
}

module.exports = { currentYear, teacherGroupIds, parallelGroups, groupStudents, baseRosterSql, fromFileSql };
