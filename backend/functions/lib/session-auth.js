const { json, getMethod } = require('./http');
const { isAdminApiKey, isAdminAuthRateLimited, parseBearerToken } = require('./auth');
const { parseSessionCookie, assertCookieCsrf } = require('./session-cookie');
const { tokenHash, sessionExpiresAt } = require('./passwords');
const { applyCatalogPhoto } = require('./staff-photo-catalog');
const {
  isSiteAdmin,
  loadPermissionsForRoleId,
  ensureDefaultOAuthAccess,
  promoteAllowlistedSiteAdmin,
} = require('./rbac');
const { loadUserPermissions, mergePermissions, isPlatformOwner } = require('./platform-owner');
const { canPreviewAsStaff } = require('./preview-as-staff');

const SESSION_USER_SQL = `
  SELECT u.id, u.email, u.role::text AS role,
         u.display_name, u.oauth_subject_id, u.rbac_role_id,
         u.account_status, u.first_login_at,
         u.photo_url, u.photo_thumb_url, u.cabinet_theme, u.onboarding_completed_at,
         u.telegram_nick, u.max_nick,
         r.slug AS rbac_role_slug, r.name AS rbac_role_name,
         u.protocol_cabinet_id,
         pc.name AS protocol_cabinet_name,
         pc.email AS protocol_cabinet_email,
         s.mfa_verified_at, s.expires_at AS session_expires_at
  FROM user_sessions s
  INNER JOIN users u ON u.id = s.user_id
  LEFT JOIN roles r ON r.id = u.rbac_role_id
  LEFT JOIN protocol_cabinets pc ON pc.id = u.protocol_cabinet_id
  WHERE s.token_hash = $1 AND s.expires_at > NOW()
  LIMIT 1`;

const SESSION_USER_SQL_LEGACY = `
  SELECT u.id, u.email, u.role::text AS role
  FROM user_sessions s
  INNER JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = $1 AND s.expires_at > NOW()
  LIMIT 1`;

function mapSessionRow(row, permissions) {
  const effectiveRole = row.rbac_role_slug || row.role;
  const user = {
    id: row.id,
    email: row.email,
    role: effectiveRole,
    legacy_role: row.role,
    display_name: row.display_name || null,
    oauth_subject_id: row.oauth_subject_id || null,
    rbac_role_id: row.rbac_role_id != null ? Number(row.rbac_role_id) : null,
    rbac_role: row.rbac_role_slug
      ? { id: Number(row.rbac_role_id), slug: row.rbac_role_slug, name: row.rbac_role_name }
      : null,
    account_status: row.account_status || 'active',
    first_login_at: row.first_login_at || null,
    photo_url: row.photo_url || null,
    photo_thumb_url: row.photo_thumb_url || null,
    cabinet_theme: (() => {
      const t = String(row.cabinet_theme || '').trim().toLowerCase();
      if (t === 'dark') return 'blue';
      return t === 'blue' || t === 'green' ? t : 'corporate';
    })(),
    onboarding_completed_at: row.onboarding_completed_at || null,
    telegram_nick: row.telegram_nick || null,
    max_nick: row.max_nick || null,
    permissions,
    protocol_cabinet_id: row.protocol_cabinet_id != null ? Number(row.protocol_cabinet_id) : null,
    protocol_cabinet:
      row.protocol_cabinet_id != null
        ? {
            id: Number(row.protocol_cabinet_id),
            name: row.protocol_cabinet_name || '',
            email: row.protocol_cabinet_email || '',
          }
        : null,
  };
  user.mfa_verified = Boolean(row.mfa_verified_at);
  const withPhoto = applyCatalogPhoto(user, user.display_name);
  withPhoto.platform_owner = isPlatformOwner(withPhoto);
  withPhoto.can_preview_as_staff = canPreviewAsStaff(withPhoto);
  return withPhoto;
}

function sessionTokenFromEvent(event) {
  return parseBearerToken(event) || parseSessionCookie(event);
}

async function resolveSessionUser(pool, event) {
  /** Валидная сессия по Bearer или HttpOnly cookie. */
  let sessionUser = null;
  const token = sessionTokenFromEvent(event);
  if (token) {
    const th = tokenHash(token);
    let row = null;
    try {
      const r = await pool.query(SESSION_USER_SQL, [th]);
      row = r.rows[0] || null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        !/protocol_cabinet|rbac_role|account_status|oauth_subject|display_name|roles|photo_url|photo_thumb|cabinet_theme|onboarding_completed|telegram_nick|max_nick|mfa_verified/i.test(
          msg,
        )
      ) {
        throw e;
      }
      const r = await pool.query(SESSION_USER_SQL_LEGACY, [th]);
      row = r.rows[0] || null;
    }
    if (row) {
      if (row.rbac_role_id == null || row.account_status === 'pending_role') {
        try {
          const { changed, row: updated } = await ensureDefaultOAuthAccess(pool, row.id);
          if (changed && updated) {
            row.rbac_role_id = updated.rbac_role_id;
            row.account_status = updated.account_status;
            row.role = updated.role;
            if (updated.rbac_role_id) {
              const roleRow = await pool.query(
                `SELECT slug, name FROM roles WHERE id = $1 LIMIT 1`,
                [updated.rbac_role_id],
              );
              if (roleRow.rows[0]) {
                row.rbac_role_slug = roleRow.rows[0].slug;
                row.rbac_role_name = roleRow.rows[0].name;
              }
            }
          }
        } catch {
          /* RBAC tables may be absent on legacy DB */
        }
      }
      try {
        const promoted = await promoteAllowlistedSiteAdmin(pool, row.id);
        if (promoted.changed && promoted.row) {
          row.rbac_role_id = promoted.row.rbac_role_id;
          row.account_status = promoted.row.account_status;
          row.role = promoted.row.role;
          const roleRow = await pool.query(`SELECT slug, name FROM roles WHERE id = $1 LIMIT 1`, [
            promoted.row.rbac_role_id,
          ]);
          if (roleRow.rows[0]) {
            row.rbac_role_slug = roleRow.rows[0].slug;
            row.rbac_role_name = roleRow.rows[0].name;
          }
        }
      } catch {
        /* allowlist promotion is best-effort */
      }
      let permissions = [];
      if (row.rbac_role_id) {
        try {
          permissions = await loadPermissionsForRoleId(pool, row.rbac_role_id);
        } catch {
          permissions = [];
        }
      } else if (isSiteAdmin({ id: row.id, role: row.role })) {
        permissions = ['*'];
      }
      try {
        permissions = mergePermissions(permissions, await loadUserPermissions(pool, row.id));
      } catch {
        /* user_permissions may be absent */
      }
      const sessionIdentity = {
        id: row.id,
        role: row.rbac_role_slug || row.role,
      };
      if (isSiteAdmin(sessionIdentity) && !permissions.includes('*')) {
        permissions = ['*', ...permissions];
      }
      const status = String(row.account_status || 'active');
      if (status !== 'active' && status !== 'pending_role') {
        sessionUser = null;
      } else {
        sessionUser = await require('./pulse-access-v4').effectiveAccess(pool,mapSessionRow(row, permissions));
        try {
          const exp = row.session_expires_at ? new Date(row.session_expires_at).getTime() : 0;
          if (exp && exp - Date.now() < 7 * 24 * 60 * 60 * 1000) {
            await pool.query(`UPDATE user_sessions SET expires_at = $2 WHERE token_hash = $1`, [
              th,
              sessionExpiresAt().toISOString(),
            ]);
          }
        } catch {
          /* sliding expiry is best-effort */
        }
      }
    }
  }

  return sessionUser;
}

async function wipeUserSessions(pool, userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return;
  await pool.query(`DELETE FROM user_sessions WHERE user_id = $1`, [id]);
}

function requireAdminApiKey(event) {
  if (isAdminAuthRateLimited(event)) {
    return { ok: false, code: 429, error: 'Forbidden' };
  }
  if (!isAdminApiKey(event)) {
    return { ok: false, code: 403, error: 'Forbidden' };
  }
  return {
    ok: true,
    user: { id: null, email: 'admin_api_key', role: 'admin' },
    viaAdminKey: true,
    sessionUser: null,
  };
}

async function requireStaffSession(pool, event) {
  const sessionUser = await resolveSessionUser(pool, event);
  if (!sessionUser) return { ok: false, code: 401, error: 'Unauthorized' };
  const csrf = assertCookieCsrf(event, getMethod(event));
  if (!csrf.ok) return csrf;
  return { ok: true, user: sessionUser, viaAdminKey: false, sessionUser };
}

async function requireStaffOrAdmin(pool, event) {
  if (isAdminApiKey(event)) {
    const admin = requireAdminApiKey(event);
    if (!admin.ok) return admin;
    const sessionUser = await resolveSessionUser(pool, event);
    return { ...admin, sessionUser };
  }
  return requireStaffSession(pool, event);
}

async function requireUser(pool, event) {
  return requireStaffOrAdmin(pool, event);
}

function requireRole(user, role) {
  if (!user) return { ok: false, code: 401, error: 'Unauthorized' };
  if (isSiteAdmin(user)) return { ok: true };
  if (user.role === role) return { ok: true };
  return { ok: false, code: 403, error: 'Forbidden' };
}

module.exports = {
  requireUser,
  requireRole,
  requireStaffSession,
  requireAdminApiKey,
  requireStaffOrAdmin,
  resolveSessionUser,
  sessionTokenFromEvent,
  wipeUserSessions,
  json,
};

