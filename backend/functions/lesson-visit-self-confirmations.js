'use strict';
const {json}=require('./lib/http');
const {parseAllowedBody}=require('./lib/validation');
const {visitChecklistAnalyticsActor}=require('./lib/visit-checklist-analytics-access');
const {effectiveGrants}=require('./lib/visit-checklist-department-access');
function storedConfirmations(project) {
 const value=project?.state_json?.pulse_self_confirmations;
 return Object.values(value && typeof value==='object' && !Array.isArray(value) ? value : {}).filter(v=>Number.isSafeInteger(v?.selfId)&&Number.isSafeInteger(v?.lessonId));
}
async function scope(pool,user,sessionUser,projectId) {
 const actor=visitChecklistAnalyticsActor(user,sessionUser);
 if(!actor?.id)return {error:json(403,{error:'Нужна сессия сотрудника'})};
 if(!Number.isSafeInteger(projectId)||projectId<=0)return {error:json(400,{error:'Некорректный проект'})};
 const project=(await pool.query('SELECT id,state_json FROM lesson_visit_projects WHERE id=$1',[projectId])).rows[0];
 if(!project)return {error:json(404,{error:'Проект не найден'})};
 // Reuse current grants. No new role, permission or named front-end allowlist is introduced.
 const grants=await effectiveGrants(pool,actor.id,'view',projectId,project.state_json?.pulse_v3||{});
 const platformOwner=String(process.env.PULSE_PLATFORM_OWNER_USER_ID||'').trim();
 const canConfirm=grants.some(g=>g.lesson_id==null&&g.department_id==null)||(platformOwner!==''&&String(actor.id)===platformOwner);
 if(!canConfirm)return {error:json(403,{error:'Нужен доступ к общей сводке всех кафедр'})};
 return {actor,project,canConfirm};
}
async function getSelfConfirmations(pool,user,sessionUser,projectId) {
 const access=await scope(pool,user,sessionUser,projectId);if(access.error)return access.error;
 return json(200,{confirmations:storedConfirmations(access.project),canConfirm:access.canConfirm});
}
const normal=s=>String(s||'').trim().toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').replace(/[.,]/g,'');
const isSelf=g=>/само[\s-]?анализ|самооценка|^self(?:$|[ -])|^samoanaliz$/i.test(String(g.visit_format||g.format||g.visitFormat||g.lesson_format||''));
function validatePair(records,selfId,lessonId,directory) {
 const self=records.find(r=>Number(r.id)===selfId),lesson=records.find(r=>Number(r.id)===lessonId);
 if(!self||!lesson)return 'Ответы не найдены в этом проекте';
 const a=self.answers_json?.general||{},b=lesson.answers_json?.general||{};
 if(!isSelf(a)||isSelf(b))return 'Нужны самоанализ и наблюдение урока';
 const {sourceMeta}=require('./lib/pulse-self-analysis-links');
 const aa=sourceMeta(self,directory).teacher,bb=sourceMeta(lesson,directory).teacher;
 if(!aa||aa!==bb)return 'Самоанализ и урок относятся к разным учителям';
 return null;
}
async function putSelfConfirmation(pool,user,sessionUser,projectId,event) {
 const access=await scope(pool,user,sessionUser,projectId);if(access.error)return access.error;
 const {selfId,lessonId}=parseAllowedBody(event,['selfId','lessonId']);
 if(!Number.isSafeInteger(selfId)||selfId<=0||!Number.isSafeInteger(lessonId)||lessonId<=0||selfId===lessonId)return json(400,{error:'Некорректная пара ответов'});
 const records=(await pool.query('SELECT id,answers_json FROM lesson_visit_responses WHERE project_id=$1 AND id=ANY($2::int[])',[projectId,[selfId,lessonId]])).rows;
 const message=validatePair(records,selfId,lessonId,access.project.state_json?.directory);
 if(message)return json(400,{error:message});
 const confirmation={selfId,lessonId,actorId:Number(access.actor.id),confirmedAt:new Date().toISOString()};
 // Patch one metadata key atomically; source answers, rubric, roles and existing confirmations remain untouched.
 const updated=await pool.query(`UPDATE lesson_visit_projects SET state_json=jsonb_set(state_json::jsonb,'{pulse_self_confirmations}',
   COALESCE(state_json::jsonb->'pulse_self_confirmations','{}'::jsonb)||jsonb_build_object($2::text,$3::jsonb),true)
   WHERE id=$1 RETURNING state_json`,[projectId,String(selfId),JSON.stringify(confirmation)]);
 return json(200,{confirmations:storedConfirmations(updated.rows[0]),canConfirm:true});
}
module.exports={getSelfConfirmations,putSelfConfirmation,storedConfirmations,validatePair};
