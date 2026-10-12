// Add routes here; the trusted gateway authenticates the user first.
module.exports = async function route({ path, method, user, db, release, editorRelease }) {
  if (method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };
  if (path === '/access') return { status: 200, body: { ok: true } };
  if (path === '/version') return { status: 200, body: { sha: editorRelease || release, private_sha: release } };
  if (path === '/' || path === '/ping') {
    const result = await db.query('SELECT count(DISTINCT id)::integer AS count FROM pulse_read.students');
    return { status: 200, body: { user, students: result.rows[0].count } };
  }
  return { status: 404, body: { error: 'not_found' } };
};
