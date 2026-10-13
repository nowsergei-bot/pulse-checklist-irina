// Add routes here; the trusted gateway authenticates the user first.

async function hasModuleRole(db, user, role) {
  const userId = Number(user && user.id);
  if (!Number.isInteger(userId)) return false;
  const result = await db.query(
    'SELECT 1 FROM monitoring.user_roles WHERE user_id = $1 AND role = $2 LIMIT 1',
    [userId, role],
  );
  return result.rows.length > 0;
}

function describeShape(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

// Service page for data_admin: names of pulse_read views and their columns, no rows.
async function schema(db, user) {
  if (!(await hasModuleRole(db, user, 'data_admin'))) return { status: 403, body: { error: 'forbidden' } };
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
  return { status: 200, body: { views: [...byView.values()], user_fields: userFields, memberships: await membershipCounts(db) } };
}

// Сверка group_memberships и students.group_id по неархивным группам текущего года: только числа.
async function membershipCounts(db) {
  const result = await db.query(
    `WITH cur AS (
       SELECT g.id FROM pulse_read.groups g
       JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
       WHERE y.is_current AND g.archived_at IS NULL
     ),
     m AS (SELECT DISTINCT student_id, group_id FROM pulse_read.group_memberships WHERE group_id IN (SELECT id FROM cur)),
     s AS (SELECT id AS student_id, group_id FROM pulse_read.students WHERE group_id IN (SELECT id FROM cur)),
     per_student AS (SELECT student_id, count(*) AS n FROM m GROUP BY student_id)
     SELECT
       (SELECT count(*) FROM cur)::int AS groups_current,
       (SELECT count(*) FROM m)::int AS membership_rows,
       (SELECT count(*) FROM per_student)::int AS membership_students,
       (SELECT count(*) FROM s)::int AS students_with_group,
       (SELECT count(*) FROM s JOIN m USING (student_id, group_id))::int AS both_same_group,
       (SELECT count(*) FROM s WHERE NOT EXISTS (SELECT 1 FROM m WHERE m.student_id = s.student_id))::int AS only_students_group_id,
       (SELECT count(*) FROM per_student p WHERE NOT EXISTS (SELECT 1 FROM s WHERE s.student_id = p.student_id))::int AS only_memberships,
       (SELECT count(*) FROM s WHERE EXISTS (SELECT 1 FROM m WHERE m.student_id = s.student_id)
          AND NOT EXISTS (SELECT 1 FROM m WHERE m.student_id = s.student_id AND m.group_id = s.group_id))::int AS different_group,
       (SELECT count(*) FROM per_student WHERE n > 1)::int AS students_in_several_groups,
       (SELECT coalesce(max(n), 0) FROM per_student)::int AS max_groups_per_student`,
  );
  return result.rows[0];
}

module.exports = async function route({ path, method, user, db, release, editorRelease }) {
  if (method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };
  if (path === '/access') return { status: 200, body: { ok: true } };
  if (path === '/version') return { status: 200, body: { sha: editorRelease || release, private_sha: release } };
  if (path === '/schema') return schema(db, user);
  if (path === '/' || path === '/ping') {
    const result = await db.query('SELECT count(DISTINCT id)::integer AS count FROM pulse_read.students');
    return { status: 200, body: { user, students: result.rows[0].count } };
  }
  return { status: 404, body: { error: 'not_found' } };
};
