// Add routes here; the trusted gateway authenticates the user first.
// Права проверяются здесь в каждом запросе по monitoring.user_roles.

const { loadRoles, capabilities, visibleRoles } = require('./lib/access.cjs');
const { schema } = require('./schema.cjs');
const roles = require('./roles.cjs');
const specs = require('./specs.cjs');
const works = require('./works.cjs');

function parseBody(body) {
  if (body === null || body === undefined || body === '') return {};
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return null; }
  }
  return typeof body === 'object' ? body : null;
}

const forbidden = { status: 403, body: { error: 'forbidden' } };

module.exports = async function route({ path, method, query, body, user, db, files, release, editorRelease }) {
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

  if (path === '/works' && method === 'GET') return works.listWorks(db, userId, caps);

  // Всё ниже только для data_admin.
  if (path.startsWith('/specs') || path.startsWith('/works')) {
    if (!caps.manage) return forbidden;
    const data = method === 'POST' ? parseBody(body) : {};
    if (!data) return { status: 400, body: { error: 'bad_request' } };
    if (path === '/specs' && method === 'GET') return specs.listSpecs(db);
    if (path === '/specs' && method === 'POST') return specs.saveSpec(db, files, user, userId, data);
    if (path === '/specs/preview' && method === 'POST') return specs.preview(db, data);
    if (path === '/specs/frames' && method === 'POST') return specs.createFrame(db, userId, data);
    let m = path.match(/^\/specs\/versions\/(\d+)(\/approve|\/delete)?$/);
    if (m) {
      const id = Number(m[1]);
      if (!m[2] && method === 'GET') return specs.versionTasks(db, id);
      if (m[2] === '/approve' && method === 'POST') return specs.approveVersion(db, userId, id);
      if (m[2] === '/delete' && method === 'POST') return specs.deleteDraft(db, id);
    }
    if (path === '/works/options' && method === 'GET') return works.options(db, query);
    if (path === '/works' && method === 'POST') return works.createWorks(db, userId, data);
    m = path.match(/^\/works\/(\d+)$/);
    if (m && method === 'GET') return works.getWork(db, Number(m[1]));
    if (m && method === 'POST') return works.updateWork(db, Number(m[1]), data);
    return { status: 405, body: { error: 'method_not_allowed' } };
  }
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
