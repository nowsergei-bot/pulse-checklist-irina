const { isPlatformOwner } = require('./platform-owner');

/** Роль по умолчанию для OAuth-пользователей без явного назначения администратором. */
const DEFAULT_OAUTH_ROLE_SLUG = 'methodist';

/** Владелец платформы только по users.id / permission — не ФИО и не email. */
function isAllowlistedSiteAdmin(user) {
  return isPlatformOwner(user);
}

/**
 * Если users.id совпадает с PULSE_PLATFORM_OWNER_USER_ID — назначает роль admin в БД.
 * Без env id или permission повышение не выполняется (fail-closed).
 */
async function promoteAllowlistedSiteAdmin(pool, userId) {
  const uid = Number(userId);
  if (!pool || !Number.isFinite(uid) || uid <= 0) return { changed: false, row: null };

  const r = await pool.query(
    `SELECT id, email, display_name, role::text AS role, rbac_role_id, account_status
     FROM users WHERE id = $1 LIMIT 1`,
    [uid],
  );
  const row = r.rows[0];
  if (!row || !isPlatformOwner(row)) return { changed: false, row: row || null };

  const adminRole = await loadRoleBySlug(pool, 'admin');
  if (!adminRole) return { changed: false, row };

  const alreadyAdmin =
    row.role === 'admin' &&
    row.account_status === 'active' &&
    Number(row.rbac_role_id) === Number(adminRole.id);
  if (alreadyAdmin) return { changed: false, row };

  const upd = await pool.query(
    `UPDATE users
     SET role = 'admin'::user_role, rbac_role_id = $2, account_status = 'active'
     WHERE id = $1
     RETURNING id, email, display_name, role::text AS role, rbac_role_id, account_status`,
    [uid, adminRole.id],
  );
  return { changed: true, row: upd.rows[0] || row };
}

/** Соответствие slug RBAC → legacy user_role (enum users.role). */
const LEGACY_ROLE_FROM_SLUG = {
  admin: 'admin',
  methodist: 'methodist',
  director: 'director',
  assistant_director: 'assistant_director',
  guest: 'methodist',
  teacher: 'methodist',
  department_head: 'methodist',
};

function legacyRoleFromSlug(slug) {
  const s = String(slug || '').trim();
  return LEGACY_ROLE_FROM_SLUG[s] || 'methodist';
}

async function loadPermissionsForRoleId(pool, roleId) {
  if (!roleId) return [];
  const r = await pool.query(
    `SELECT p.slug
     FROM role_permissions rp
     INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
     ORDER BY p.slug`,
    [roleId],
  );
  return r.rows.map((row) => row.slug);
}

async function loadRoleById(pool, roleId) {
  if (!roleId) return null;
  const r = await pool.query(
    `SELECT id, slug, name, description FROM roles WHERE id = $1 LIMIT 1`,
    [roleId],
  );
  return r.rows[0] || null;
}

async function loadRoleBySlug(pool, slug) {
  const s = String(slug || '').trim();
  if (!s) return null;
  const r = await pool.query(
    `SELECT id, slug, name, description FROM roles WHERE slug = $1 LIMIT 1`,
    [s],
  );
  return r.rows[0] || null;
}

/**
 * Активирует OAuth-пользователя и назначает роль по умолчанию, если админ ещё не назначил RBAC.
 * Явно назначенные роли (rbac_role_id + active) не трогаем.
 */
async function ensureDefaultOAuthAccess(pool, userId) {
  const r = await pool.query(
    `SELECT id, rbac_role_id, account_status, role::text AS role
     FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const row = r.rows[0];
  if (!row) return { changed: false, row: null };

  if (row.account_status === 'active' && row.rbac_role_id != null) {
    return { changed: false, row };
  }

  if (row.account_status === 'active' && row.rbac_role_id == null) {
    const role = await loadRoleBySlug(pool, DEFAULT_OAUTH_ROLE_SLUG);
    if (!role) return { changed: false, row };
    const legacyRole = legacyRoleFromSlug(role.slug);
    const upd = await pool.query(
      `UPDATE users SET rbac_role_id = $2, role = $3::user_role
       WHERE id = $1
       RETURNING id, rbac_role_id, account_status, role::text AS role`,
      [userId, role.id, legacyRole],
    );
    return { changed: true, row: upd.rows[0] };
  }

  if (row.rbac_role_id != null) {
    const upd = await pool.query(
      `UPDATE users SET account_status = 'active'
       WHERE id = $1
       RETURNING id, rbac_role_id, account_status, role::text AS role`,
      [userId],
    );
    return { changed: true, row: upd.rows[0] };
  }

  const role = await loadRoleBySlug(pool, DEFAULT_OAUTH_ROLE_SLUG);
  if (!role) return { changed: false, row };
  const legacyRole = legacyRoleFromSlug(role.slug);
  const upd = await pool.query(
    `UPDATE users SET rbac_role_id = $2, role = $3::user_role, account_status = 'active'
     WHERE id = $1
     RETURNING id, rbac_role_id, account_status, role::text AS role`,
    [userId, role.id, legacyRole],
  );
  return { changed: true, row: upd.rows[0] };
}

async function listAllRoles(pool) {
  const r = await pool.query(
    `SELECT id, slug, name, description FROM roles ORDER BY slug`,
  );
  return r.rows;
}

/** Администратор сайта: полный доступ (включая помощника директора). */
function isSiteAdmin(user) {
  if (!user) return false;
  if (isAllowlistedSiteAdmin(user)) return true;
  const role = String(user.role || '').trim();
  return role === 'admin' || role === 'assistant_director';
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (isSiteAdmin(user)) return true;
  const perms = user.permissions || [];
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

function requirePermission(user, permission) {
  if (hasPermission(user, permission)) return { ok: true };
  return { ok: false, code: 403, error: 'forbidden', message: 'Недостаточно прав' };
}

/** Маппинг legacy protocol-roles → permission slug (для постепенной миграции). */
const PROTOCOL_ROLE_PERMISSION_MAP = {
  canAccessProtocolTasksAdmin: 'protocol.tasks.admin',
  canApproveProtocolTasks: 'protocol.tasks.approve',
  canRemoveProtocolFromPanel: 'protocol.tasks.approve',
  canDeleteProtocolTasks: 'protocol.tasks.approve',
  canReviewStatusChanges: 'protocol.tasks.approve',
  canViewAllProtocolTasks: 'protocol.tasks.view',
};

function protocolCheckViaPermission(user, legacyFnName) {
  const perm = PROTOCOL_ROLE_PERMISSION_MAP[legacyFnName];
  if (!perm) return null;
  return hasPermission(user, perm);
}

module.exports = {
  DEFAULT_OAUTH_ROLE_SLUG,
  legacyRoleFromSlug,
  loadPermissionsForRoleId,
  loadRoleById,
  loadRoleBySlug,
  listAllRoles,
  ensureDefaultOAuthAccess,
  promoteAllowlistedSiteAdmin,
  isAllowlistedSiteAdmin,
  isSiteAdmin,
  hasPermission,
  requirePermission,
  protocolCheckViaPermission,
  LEGACY_ROLE_FROM_SLUG,
};
