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
  return { status: 200, body: { views: [...byView.values()], user_fields: userFields, multi_group_students: await multiGroupStudents(db) } };
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
