// Экран «Роли»: только data_admin. Почты пользователей не читаются.

const { ROLES } = require('./lib/access.cjs');

const ROLE_NAMES = {
  teacher: 'Учитель',
  department_head: 'Заведующая кафедрой',
  deputy: 'Завуч',
  data_admin: 'Администратор данных',
};

async function rolesByUser(db, userIds) {
  if (!userIds.length) return new Map();
  const r = await db.query('SELECT user_id, role FROM monitoring.user_roles WHERE user_id = ANY($1::int[])', [userIds]);
  const map = new Map();
  for (const row of r.rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id).push(row.role);
  }
  return map;
}

// Текущие группы учителей: неархивные группы текущего года, тип группы из groups.campus.
async function groupsByUser(db, userIds) {
  if (!userIds.length) return new Map();
  const r = await db.query(
    `SELECT DISTINCT t.user_id, g.id, g.title, g.code, g.campus, g.parallel
     FROM pulse_read.english_teachers t
     JOIN pulse_read.group_teachers gt ON gt.teacher_id = t.id
     JOIN pulse_read.groups g ON g.id = gt.group_id
     JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
     WHERE t.user_id = ANY($1::int[]) AND t.archived_at IS NULL AND g.archived_at IS NULL AND y.is_current
     ORDER BY g.parallel NULLS LAST, g.title`,
    [userIds],
  );
  const map = new Map();
  for (const row of r.rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id).push({ id: row.id, title: row.title || row.code, digital: row.campus === 'digital' });
  }
  return map;
}

async function withRoles(db, rows) {
  const ids = rows.map(u => u.id);
  const roles = await rolesByUser(db, ids);
  const groups = await groupsByUser(db, ids);
  return rows.map(u => ({
    id: u.id,
    full_name: u.full_name,
    roles: (roles.get(u.id) || []).sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b)),
    groups: groups.get(u.id) || [],
  }));
}

// Без запроса: все, у кого есть роли модуля. С запросом: поиск по ФИО среди пользователей Пульса.
async function listUsers(db, q) {
  const text = String(q || '').trim();
  let users;
  if (text.length >= 2) {
    users = (await db.query(
      `SELECT DISTINCT id, full_name FROM pulse_read.users
       WHERE full_name ILIKE '%' || $1 || '%'
       ORDER BY full_name LIMIT 50`,
      [text],
    )).rows;
  } else {
    users = (await db.query(
      `SELECT DISTINCT u.id, u.full_name
       FROM monitoring.user_roles r JOIN pulse_read.users u ON u.id = r.user_id
       ORDER BY u.full_name`,
    )).rows;
  }
  return withRoles(db, users);
}

async function setRole(db, actorId, body) {
  const userId = Number(body.user_id);
  const role = String(body.role || '');
  const add = body.action === 'add';
  if (!Number.isInteger(userId) || !ROLES.includes(role) || !['add', 'remove'].includes(body.action)) {
    return { status: 400, body: { error: 'bad_request' } };
  }
  if (!add && role === 'data_admin' && userId === actorId) {
    return { status: 400, body: { error: 'self_admin', message: 'Нельзя снять роль администратора данных с самого себя' } };
  }
  const exists = await db.query('SELECT 1 FROM pulse_read.users WHERE id = $1 LIMIT 1', [userId]);
  if (!exists.rows.length) return { status: 404, body: { error: 'not_found' } };
  if (add) {
    await db.query('INSERT INTO monitoring.user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, role]);
  } else {
    await db.query('DELETE FROM monitoring.user_roles WHERE user_id = $1 AND role = $2', [userId, role]);
  }
  const map = await rolesByUser(db, [userId]);
  return { status: 200, body: { user_id: userId, roles: map.get(userId) || [] } };
}

// Учителя английского для массового назначения: все неархивные из english_teachers,
// включая учителей групп ЦГ. Без учётной записи Пульса назначить роль нельзя,
// их ФИО показываются data_admin в окне подтверждения.
async function teachersAllPreview(db) {
  const r = await db.query(
    `WITH t AS (
       SELECT DISTINCT t.user_id FROM pulse_read.english_teachers t
       WHERE t.archived_at IS NULL AND t.user_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM pulse_read.users u WHERE u.id = t.user_id)
     )
     SELECT
       (SELECT count(*) FROM t WHERE NOT EXISTS (SELECT 1 FROM monitoring.user_roles r WHERE r.user_id = t.user_id AND r.role = 'teacher'))::int AS to_add,
       (SELECT count(*) FROM t WHERE EXISTS (SELECT 1 FROM monitoring.user_roles r WHERE r.user_id = t.user_id AND r.role = 'teacher'))::int AS already`,
  );
  const missing = await db.query(
    `SELECT DISTINCT e.full_name FROM pulse_read.english_teachers e
     WHERE e.archived_at IS NULL
       AND (e.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM pulse_read.users u WHERE u.id = e.user_id))
     ORDER BY e.full_name`,
  );
  return { status: 200, body: { ...r.rows[0], without_account: missing.rows.map(x => x.full_name) } };
}

// Роль учителя всем неархивным учителям английского, у которых есть учётная запись.
async function teachersAll(db) {
  const r = await db.query(
    `INSERT INTO monitoring.user_roles (user_id, role)
     SELECT DISTINCT t.user_id, 'teacher'
     FROM pulse_read.english_teachers t
     JOIN pulse_read.users u ON u.id = t.user_id
     WHERE t.archived_at IS NULL AND t.user_id IS NOT NULL
     ON CONFLICT DO NOTHING
     RETURNING user_id`,
  );
  return { status: 200, body: { added: r.rows.length } };
}

module.exports = { ROLE_NAMES, listUsers, setRole, teachersAll, teachersAllPreview };
