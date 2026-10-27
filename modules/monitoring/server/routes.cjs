// Add routes here; the trusted gateway authenticates the user first.
// Права проверяются здесь в каждом запросе по monitoring.user_roles.

const { loadRoles, capabilities, visibleRoles } = require('./lib/access.cjs');
const { schema, placementSchema } = require('./schema.cjs');
const roles = require('./roles.cjs');
const specs = require('./specs.cjs');
const works = require('./works.cjs');
const sheet = require('./sheet.cjs');
const rosters = require('./rosters.cjs');
const rosterImport = require('./roster-import.cjs');
const groupTeachers = require('./group-teachers.cjs');
const { analytics, riskList } = require('./analytics.cjs');

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

  if (path === '/directory/cabinets') return require('./cabinet-directory.cjs').directory({ db, user, method, query });

  if (path === '/me' && method === 'GET') {
    return { status: 200, body: { full_name: user && user.full_name, roles: visibleRoles(own, caps.manage), capabilities: caps } };
  }
  if (path === '/' || path === '/ping') {
    if (method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };
    const result = await db.query('SELECT count(DISTINCT id)::integer AS count FROM pulse_read.students');
    return { status: 200, body: { students: result.rows[0].count } };
  }

  if (path === '/works' && method === 'GET') return works.listWorks(db, userId, caps);

  // Ввод результатов: права по группе и статусу работы проверяет sheet.cjs.
  const sheetMatch = path.match(/^\/works\/(\d+)\/sheet$/);
  if (sheetMatch) {
    const workId = Number(sheetMatch[1]);
    if (method === 'GET') return sheet.getSheet(db, userId, caps, workId, Number(query && query.group));
    if (method === 'POST') {
      const data = parseBody(body);
      if (!data) return { status: 400, body: { error: 'bad_request' } };
      return sheet.saveSheet(db, userId, caps, workId, data);
    }
    return { status: 405, body: { error: 'method_not_allowed' } };
  }

  // Щадящий режим: права (заведующая кафедрой, data_admin) проверяет sheet.cjs.
  const gentleMatch = path.match(/^\/works\/(\d+)\/gentle$/);
  if (gentleMatch) {
    if (method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };
    const data = parseBody(body);
    if (!data) return { status: 400, body: { error: 'bad_request' } };
    return sheet.setGentle(db, user, userId, caps, Number(gentleMatch[1]), data);
  }

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
    m = path.match(/^\/specs\/tasks\/(\d+)\/half$/);
    if (m && method === 'POST') return specs.setHalf(db, userId, Number(m[1]), data);
    if (path === '/works/options' && method === 'GET') return works.options(db, query);
    if (path === '/works' && method === 'POST') return works.createWorks(db, userId, data);
    m = path.match(/^\/works\/(\d+)$/);
    if (m && method === 'GET') return works.getWork(db, Number(m[1]));
    if (m && method === 'POST') return works.updateWork(db, Number(m[1]), data);
    return { status: 405, body: { error: 'method_not_allowed' } };
  }
  // Поправки к составам групп и учителя групп: только data_admin, и чтение, и запись.
  if (path === '/rosters' || path.startsWith('/rosters/')) {
    if (!caps.manage) return forbidden;
    if (method === 'GET') {
      if (path === '/rosters') return rosters.listGroups(db);
      if (path === '/rosters/import') return rosterImport.status(db);
      if (path === '/rosters/teachers') return groupTeachers.list(db);
      if (path === '/rosters/search') return rosters.search(db, query && query.q);
      const g = path.match(/^\/rosters\/(\d+)$/);
      if (g) return rosters.getRoster(db, Number(g[1]));
      return { status: 404, body: { error: 'not_found' } };
    }
    if (method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };
    const data = parseBody(body);
    if (!data) return { status: 400, body: { error: 'bad_request' } };
    // Составы групп из файла: пробный прогон без записи, применение, возврат к Пульсу.
    if (path === '/rosters/import/preview') return rosterImport.preview(db, data);
    if (path === '/rosters/import/apply') return rosterImport.apply(db, user, userId, data);
    if (path === '/rosters/import/cancel') return rosterImport.cancel(db, user, userId);
    // Учителя групп: из файла (пробный прогон, применение) и вручную.
    if (path === '/rosters/teachers/preview') return groupTeachers.preview(db, data);
    if (path === '/rosters/teachers/apply') return groupTeachers.apply(db, user, userId, data);
    const tg = path.match(/^\/rosters\/teachers\/(\d+)$/);
    if (tg) return groupTeachers.change(db, user, userId, Number(tg[1]), data);
    const tr = path.match(/^\/rosters\/teachers\/(\d+)\/reset$/);
    if (tr) return groupTeachers.reset(db, user, userId, Number(tr[1]));
    const g = path.match(/^\/rosters\/(\d+)$/);
    if (g) return rosters.addOverride(db, user, userId, Number(g[1]), data);
    const c = path.match(/^\/rosters\/overrides\/(\d+)\/cancel$/);
    if (c) return rosters.cancelOverride(db, user, userId, Number(c[1]));
    return { status: 404, body: { error: 'not_found' } };
  }
  // Аналитика и зона риска: заведующая кафедрой и data_admin, только чтение.
  // /analytics: коды групп и числа (входное тестирование и сравнение правил только data_admin);
  // /analytics/risk: ученики в зоне риска с ФИО.
  if (path === '/analytics' || path === '/analytics/risk') {
    if (!caps.seeAnalytics) return forbidden;
    if (method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };
    return path === '/analytics' ? analytics(db, query, caps) : riskList(db, query);
  }
  if (path === '/schema' || path === '/schema/placement' || path.startsWith('/roles')) {
    if (!caps.manage) return forbidden;
    if (path === '/schema' && method === 'GET') return schema(db, user);
    if (path === '/schema/placement' && method === 'GET') return placementSchema(db);
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
