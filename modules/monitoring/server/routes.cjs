// Add routes here; the trusted gateway authenticates the user first.
// Права проверяются здесь в каждом запросе по monitoring.user_roles.

const { loadRoles, capabilities, visibleRoles } = require('./lib/access.cjs');
const { schema } = require('./schema.cjs');
const roles = require('./roles.cjs');

function parseBody(body) {
  if (body === null || body === undefined || body === '') return {};
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return null; }
  }
  return typeof body === 'object' ? body : null;
}

const forbidden = { status: 403, body: { error: 'forbidden' } };

module.exports = async function route({ path, method, query, body, user, db, release, editorRelease }) {
  if (path === '/access' && method === 'GET') return { status: 200, body: { ok: true } };
  if (path === '/version' && method === 'GET') return { status: 200, body: { sha: editorRelease || release, private_sha: release } };

  const { userId, roles: own } = await loadRoles(db, user);
  const caps = capabilities(own);

  if (path === '/me' && method === 'GET') {
    return { status: 200, body: { full_name: user && user.full_name, roles: visibleRoles(own, caps.manage), capabilities: caps } };
  }
  if (path === '/' || path === '/ping') {
    if (method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };
    const result = await db.query('SELECT count(DISTINCT id)::integer AS count FROM pulse_read.students');
    return { status: 200, body: { students: result.rows[0].count } };
  }

  // Всё ниже только для data_admin.
  if (path === '/schema' || path.startsWith('/roles')) {
    if (!caps.manage) return forbidden;
    if (path === '/schema' && method === 'GET') return schema(db, user);
    if (path === '/roles' && method === 'GET') return { status: 200, body: { users: await roles.listUsers(db, query && query.q), names: roles.ROLE_NAMES } };
    if (path === '/roles' && method === 'POST') {
      const data = parseBody(body);
      if (!data) return { status: 400, body: { error: 'bad_request' } };
      return roles.setRole(db, userId, data);
    }
    if (path === '/roles/teachers-all' && method === 'GET') return roles.teachersAllPreview(db);
    if (path === '/roles/teachers-all' && method === 'POST') return roles.teachersAll(db);
    return { status: 405, body: { error: 'method_not_allowed' } };
  }
  return { status: 404, body: { error: 'not_found' } };
};
