'use strict';
const ACTIONS = new Set(['view','export','send']);
function activeLeaderGrants(config, actorId, action, today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())) {
 if (!ACTIONS.has(action)) return [];
 return (config?.leaders || []).filter(l => String(l.user_id) === String(actorId) && l.department_id && /^\d{4}-\d{2}-\d{2}$/.test(l.valid_from || '') && l.valid_from <= today && (!l.valid_until || l.valid_until > today))
  .map(l => ({department_id:String(l.department_id),lesson_id:null}));
}
async function effectiveGrants(db, actorId, action, projectId, config) {
 const explicit=(await db.query(`SELECT lesson_id,department_id FROM pulse_visit_report_grants WHERE user_id=$1 AND action=$2 AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())`,[actorId,action])).rows;
 if (!config) {
  const project=(await db.query('SELECT id,state_json FROM lesson_visit_projects WHERE id=$1',[projectId])).rows[0];
  config=project?.state_json?.pulse_v3 || {};
 }
 return [...explicit,...activeLeaderGrants(config,actorId,action)];
}
function permits(grants,lessonId,departmentId) {
 return grants.some(g => (g.lesson_id == null || String(g.lesson_id) === String(lessonId)) && (g.department_id == null || String(g.department_id) === String(departmentId)));
}
module.exports={activeLeaderGrants,effectiveGrants,permits};
