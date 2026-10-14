'use strict';
// Protected technical lookup. Account emails explicitly authorized by owner.
const { loadRoles, capabilities } = require('./lib/access.cjs');

const ROUTES = [
  { key: 'staff', path: '/cabinet', identity: 'user_id' },
  { key: 'checklist_form', path: '/cabinet/feedback/form', identity: 'user_id' },
  { key: 'checklist_self', path: '/cabinet/feedback/me', identity: 'user_id' },
  { key: 'checklist_teacher', path: '/cabinet/feedback/teachers/:id', identity: 'route_specific_id_verify_in_handler' },
  { key: 'checklist_leader', path: '/cabinet/feedback/leader', identity: 'user_id' },
  { key: 'checklist_school', path: '/cabinet/feedback/school', identity: 'user_id' },
  { key: 'checklist_director', path: '/cabinet/visit-checklist', identity: 'user_id' },
  { key: 'english_self', path: '/cabinet/english', identity: 'user_id' },
  { key: 'english_analytics', path: '/cabinet/english/analytics', identity: 'user_id' },
  { key: 'english_group', path: '/cabinet/english/groups/:id', identity: 'group_id' },
  { key: 'english_teacher', path: '/cabinet/english/teachers/:id', identity: 'teacher_id' },
  { key: 'monitoring', path: '/cabinet/monitoring/*', identity: 'user_id' },
];
const RULE_SOURCES = [
  'frontend/src/app/routes.tsx',
  'backend/functions/lib/pulse-access-v4.js',
  'backend/functions/lib/visit-checklist-visibility.js',
  'backend/functions/lib/english-assessment-access.js',
  'modules/monitoring/server/lib/access.cjs',
];
function integer(value, fallback, min, max) {
  if (value === undefined || value === '') return fallback;
  if (!/^[0-9]+$/.test(String(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
async function directory({ db, user, method, query = {} }) {
  if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0)
    return { status: 403, body: { error: 'forbidden' } };
  // Re-read trusted user's module roles; no role supplied by query/body is used.
  const { userId, roles } = await loadRoles(db, user);
  if (!userId || !capabilities(roles).manage)
    return { status: 403, body: { error: 'forbidden' } };
  if (method !== 'GET')
    return { status: 405, body: { error: 'method_not_allowed' } };
  const after = integer(query.after, 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = integer(query.limit, 50, 1, 100);
  const selected = integer(query.user_id, null, 1, Number.MAX_SAFE_INTEGER);
  if (after === null || limit === null ||
      (query.user_id !== undefined && selected === null))
    return { status: 400, body: { error: 'bad_request' } };
  // Keyset pagination. No SELECT *, personal fields, result tables or writes.
  const result = await db.query(
    `SELECT u.id AS user_id, u.email AS account_email, u.role AS platform_role, u.legacy_role,
       coalesce((SELECT jsonb_agg(r.role ORDER BY r.role)
         FROM monitoring.user_roles r WHERE r.user_id = u.id), '[]'::jsonb) AS monitoring_roles,
       coalesce((SELECT jsonb_agg(jsonb_build_object(
         'teacher_id', t.id, 'teacher_email', t.email, 'group_id', g.id, 'class_id', g.class_id,
         'academic_year_id', g.academic_year_id) ORDER BY t.id, g.id)
         FROM pulse_read.english_teachers t
         LEFT JOIN pulse_read.group_teachers gt ON gt.teacher_id = t.id
         LEFT JOIN pulse_read.groups g ON g.id = gt.group_id AND g.archived_at IS NULL
         WHERE t.user_id = u.id AND t.archived_at IS NULL), '[]'::jsonb) AS english_links
     FROM pulse_read.users u
     WHERE u.id > $1 AND ($2::bigint IS NULL OR u.id = $2)
     ORDER BY u.id LIMIT $3`,
    [after, selected, limit + 1],
  );
  const more = result.rows.length > limit;
  const accounts = result.rows.slice(0, limit).map(r => ({
    user_id: r.user_id,
    account_email: r.account_email,
    platform_role: r.platform_role,
    legacy_role: r.legacy_role,
    monitoring_roles: r.monitoring_roles,
    english_links: (r.english_links || []).map(l => ({
      teacher_id: l.teacher_id, teacher_email: l.teacher_email, group_id: l.group_id,
      class_id: l.class_id, academic_year_id: l.academic_year_id,
    })),
  }));
  return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: {
    accounts, next_after: more ? accounts[accounts.length - 1].user_id : null,
    routes: ROUTES, rule_sources: RULE_SOURCES,
    effective_access: 'not_evaluated',
    notes: [
      'Routes are code metadata, not proof of access or an independent cabinet ID.',
      'user_id, teacher_id and group_id are different identifiers; never substitute one for another.',
      'Role assignments and explicit teacher links are not effective permissions. Core handlers remain authoritative.',
      'Name/email fallback matching, checklist grants and department scopes are not available through these views.',
      'Account and teacher emails are authorized only inside this protected API; never publish them in code or logs.',
      'No student identities, names, phones, responses, scores, files or sessions are returned.',
    ],
  } };
}
module.exports = { directory };

