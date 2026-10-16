// Роли модуля читаются из monitoring.user_roles в каждом запросе; права складываются.

const ROLES = ['teacher', 'department_head', 'deputy', 'data_admin'];

// Кто включает и выключает щадящий режим и видит историю переключений.
// Чтобы вернуть это право заведующей кафедрой, добавьте сюда 'department_head'.
const GENTLE_SWITCH_ROLES = ['data_admin'];

async function loadRoles(db, user) {
  const userId = Number(user && user.id);
  if (!Number.isInteger(userId)) return { userId: null, roles: new Set() };
  const result = await db.query('SELECT role FROM monitoring.user_roles WHERE user_id = $1', [userId]);
  return { userId, roles: new Set(result.rows.map(r => r.role)) };
}

function capabilities(roles, gentleSwitchRoles = GENTLE_SWITCH_ROLES) {
  const has = (r) => roles.has(r);
  return {
    seeAll: has('department_head') || has('deputy') || has('data_admin'),
    editAnyGroup: has('department_head') || has('data_admin'),
    editClosed: has('department_head') || has('data_admin'),
    editOwnGroups: has('teacher'),
    seeHistory: has('department_head') || has('data_admin'),
    manage: has('data_admin'),
    switchGentle: gentleSwitchRoles.some(has),
  };
}

// Роль data_admin видна только самим data_admin.
function visibleRoles(roles, viewerIsAdmin) {
  return [...roles].filter(r => r !== 'data_admin' || viewerIsAdmin).sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b));
}

module.exports = { ROLES, GENTLE_SWITCH_ROLES, loadRoles, capabilities, visibleRoles };
