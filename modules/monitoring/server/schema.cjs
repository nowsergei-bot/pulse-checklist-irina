// Служебная страница schema для data_admin: поля pulse_read без строк с данными.

function describeShape(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

// Service page for data_admin: names of pulse_read views and their columns, no rows.
async function schema(db, user) {
  const views = await db.query(
    `SELECT table_name, table_type
     FROM information_schema.tables
     WHERE table_schema = 'pulse_read'
     ORDER BY table_name`,
  );
  const columns = await db.query(
    `SELECT table_name, column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'pulse_read'
     ORDER BY table_name, ordinal_position`,
  );
  const byView = new Map(views.rows.map(v => [v.table_name, { name: v.table_name, type: v.table_type, columns: [] }]));
  for (const c of columns.rows) {
    if (!byView.has(c.table_name)) byView.set(c.table_name, { name: c.table_name, type: '', columns: [] });
    byView.get(c.table_name).columns.push({ name: c.column_name, type: c.data_type, nullable: c.is_nullable === 'YES' });
  }
  // Field names of the gateway user object, without values.
  const userFields = Object.keys(user || {}).sort().map(key => ({ name: key, type: describeShape(user[key]) }));
  return { status: 200, body: { views: [...byView.values()], user_fields: userFields, multi_group_students: await multiGroupStudents(db), groups_without_account: await groupsWithoutAccount(db), current_groups: await currentGroups(db) } };
}

// Ученики, которые состоят в нескольких неархивных группах текущего года.
async function multiGroupStudents(db) {
  const result = await db.query(
    `WITH m AS (
       SELECT DISTINCT gm.student_id, g.id AS group_id, g.title, g.code, g.parallel, g.campus
       FROM pulse_read.group_memberships gm
       JOIN pulse_read.groups g ON g.id = gm.group_id
       JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
       WHERE y.is_current AND g.archived_at IS NULL
     )
     SELECT s.full_name,
            json_agg(json_build_object('title', coalesce(m.title, m.code), 'parallel', m.parallel, 'campus', m.campus) ORDER BY m.parallel, m.title) AS groups
     FROM m JOIN (SELECT DISTINCT id, full_name FROM pulse_read.students) s ON s.id = m.student_id
     WHERE m.student_id IN (SELECT student_id FROM m GROUP BY student_id HAVING count(*) > 1)
     GROUP BY m.student_id, s.full_name
     ORDER BY s.full_name`,
  );
  return result.rows;
}

// Текущие группы, у которых нет ни одного действующего учителя с учётной записью Пульса.
// В списке ФИО действующих учителей группы, если они есть.
async function groupsWithoutAccount(db) {
  const result = await db.query(
    `WITH g AS (
       SELECT g.id, coalesce(g.title, g.code) AS title, g.parallel, g.campus
       FROM pulse_read.groups g
       JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
       WHERE y.is_current AND g.archived_at IS NULL
     ), t AS (
       SELECT DISTINCT gt.group_id, e.full_name,
              (e.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM pulse_read.users u WHERE u.id = e.user_id)) AS has_account
       FROM pulse_read.group_teachers gt
       JOIN pulse_read.english_teachers e ON e.id = gt.teacher_id
       WHERE e.archived_at IS NULL
     )
     SELECT g.title, g.parallel, g.campus,
            coalesce(json_agg(t.full_name ORDER BY t.full_name) FILTER (WHERE t.full_name IS NOT NULL), '[]'::json) AS teachers
     FROM g LEFT JOIN t ON t.group_id = g.id
     GROUP BY g.id, g.title, g.parallel, g.campus
     HAVING NOT coalesce(bool_or(t.has_account), false)
     ORDER BY g.parallel NULLS LAST, g.title`,
  );
  return result.rows;
}

// Все текущие группы с уровнем и типом: по этому списку выбираются группы для щадящего расчёта.
async function currentGroups(db) {
  const result = await db.query(
    `SELECT coalesce(g.title, g.code) AS title, g.parallel, g.level_code, g.campus
     FROM pulse_read.groups g
     JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
     WHERE y.is_current AND g.archived_at IS NULL
     ORDER BY g.parallel NULLS LAST, g.campus = 'digital', coalesce(g.title, g.code)`,
  );
  return result.rows;
}

module.exports = { schema };
