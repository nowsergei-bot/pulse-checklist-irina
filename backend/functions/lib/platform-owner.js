'use strict';

const PLATFORM_OWNER_PERMISSION = 'platform.owner';

function parsePositiveUserId(raw) {
  const id = Number(String(raw || '').trim());
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function configuredPlatformOwnerUserId(env = process.env) {
  return parsePositiveUserId(env.PULSE_PLATFORM_OWNER_USER_ID);
}

function hasPlatformOwnerPermission(user) {
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  return perms.includes(PLATFORM_OWNER_PERMISSION);
}

/** Полный контур платформы: только users.id из env или user_permissions. Не ФИО и не email. */
function isPlatformOwner(user, env = process.env) {
  if (!user) return false;
  const uid = parsePositiveUserId(user.id);
  if (!uid) return false;
  const configured = configuredPlatformOwnerUserId(env);
  if (configured && uid === configured) return true;
  return hasPlatformOwnerPermission(user);
}

let extrasReady = false;

async function ensurePlatformOwnerSchema(pool) {
  if (extrasReady || !pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL,
      permission TEXT NOT NULL,
      PRIMARY KEY (user_id, permission)
    )
  `);
  extrasReady = true;
}

async function loadUserPermissions(pool, userId) {
  const uid = parsePositiveUserId(userId);
  if (!pool || !uid) return [];
  try {
    await ensurePlatformOwnerSchema(pool);
    const r = await pool.query(`SELECT permission FROM user_permissions WHERE user_id = $1`, [uid]);
    return r.rows.map((row) => String(row.permission || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function mergePermissions(rolePerms, extraPerms) {
  const out = [];
  const seen = new Set();
  for (const raw of [...(rolePerms || []), ...(extraPerms || [])]) {
    const slug = String(raw || '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

module.exports = {
  PLATFORM_OWNER_PERMISSION,
  configuredPlatformOwnerUserId,
  isPlatformOwner,
  hasPlatformOwnerPermission,
  ensurePlatformOwnerSchema,
  loadUserPermissions,
  mergePermissions,
  parsePositiveUserId,
};
