'use strict';
const score=require('./pulse-v3-score');
const {listAccepted}=require('./pulse-v3-store');
const {aggregateDashboard}=require('./visit-checklist-dashboard-aggregate');
const {authorizeVisitReport}=require('./visit-report-context');
const {effectiveGrants}=require('./visit-checklist-department-access');
const {bad}=require('./visit-checklist-dashboard-filters');

/** A repeatable-read transaction ties metadata, revisions and assessment pointers to one response. */
async function consistentRead(db,operation) {
 if(typeof db.connect!=='function'||typeof db.release==='function')return operation(db);
 const tx=await db.connect();try{await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const value=await operation(tx);await tx.query('COMMIT');return value;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
async function readDataset(db,actor,projectId,query={},action='view') {
 if(!actor?.id){const e=new Error('Нужна сессия пользователя');e.httpStatus=401;throw e;}
 const project=(await db.query('SELECT id,title,state_json FROM lesson_visit_projects WHERE id=$1',[projectId])).rows[0];
 if(!project)return null;
 const config=project.state_json?.pulse_v3||{};
 const activePolicy=config.active_policy||process.env.PULSE_V3_ACTIVE_ASSESSMENT_POLICY||'';
 const requestedPolicy=String(query.policy||activePolicy);
 if(query.policy&&!([activePolicy,...(config.archive_policies||[])]).includes(query.policy))throw bad('Версия оценивания не активирована для этого проекта');
 const allRecords=await listAccepted(db,projectId,requestedPolicy||'__not_configured__');
 const activeGrants=await effectiveGrants(db,actor.id,action,projectId,config);
 if(query.department&&!activeGrants.some(g=>g.lesson_id==null&&(g.department_id==null||String(g.department_id)===String(query.department)))){const e=new Error('Нет доступа к выбранной кафедре');e.httpStatus=403;throw e;}
 if(!activeGrants.length){const e=new Error('Доступ к аналитике кафедр не назначен.');e.httpStatus=403;throw e;}
 const departmentIds=activeGrants.filter(g=>g.lesson_id==null&&g.department_id!=null).map(g=>String(g.department_id));
 const globalAccess=activeGrants.some(g=>g.lesson_id==null&&g.department_id==null);
 const bindings=(await db.query(`SELECT b.lesson_id AS id,b.teacher_user_id AS teacher_id,b.department_id,b.metadata,
      u.display_name AS teacher_label FROM pulse_visit_report_lesson_bindings b JOIN users u ON u.id=b.teacher_user_id
      WHERE EXISTS(SELECT 1 FROM pulse_v3_checklists c WHERE c.project_id=$1 AND c.lesson_id=b.lesson_id AND c.status='submitted')
      AND ($4::boolean OR b.department_id=ANY($5::text[]) OR EXISTS(SELECT 1 FROM pulse_visit_report_grants g WHERE g.user_id=$2 AND g.action=$3
        AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
        AND (g.lesson_id IS NULL OR g.lesson_id=b.lesson_id) AND (g.department_id IS NULL OR g.department_id=b.department_id)))`,[projectId,actor.id,action,globalAccess,departmentIds])).rows;
 const sourceMetadata=(await db.query(`SELECT c.checklist_id,c.response_id,v.original_json,v.created_at,
      r.answers_json FROM pulse_v3_checklists c JOIN pulse_v3_revisions v
      ON v.project_id=c.project_id AND v.checklist_id=c.checklist_id AND v.revision=c.current_revision
      LEFT JOIN lesson_visit_responses r ON r.id=c.response_id WHERE c.project_id=$1 AND c.status='submitted'`,[projectId])).rows;
 const users=(await db.query('SELECT id,display_name FROM users WHERE id::text=ANY($1::text[])',[allRecords.map(r=>String(r.checklist.author_id||''))])).rows;
 const byId=new Map(sourceMetadata.map(r=>[r.checklist_id,r]));
 const lessons=bindings.map(row=>({...row.metadata,id:String(row.id),teacher_id:String(row.teacher_id),teacher_label:row.teacher_label,department_id:String(row.department_id||''),department:row.metadata?.department||String(row.department_id||'')}));
 const global=activeGrants.some(g=>g.lesson_id==null&&g.department_id==null);
 const records=allRecords.filter(r=>lessons.some(l=>l.id===String(r.checklist.lesson_id))||(global&&!r.checklist.lesson_id)).map(r=>{
  const meta=byId.get(r.checklist.checklist_id);const general=meta?.original_json?.general||meta?.answers_json?.general||{};
  const format=String(general.visit_format||general.format||meta?.original_json?.format||'').toLocaleLowerCase('ru-RU');
  return {...r,created_at:meta?.created_at,author:users.find(u=>String(u.id)===String(r.checklist.author_id))?.display_name||String(r.checklist.author_id||''),author_label:users.find(u=>String(u.id)===String(r.checklist.author_id))?.display_name||String(r.checklist.author_id||''),format:format==='онлайн'||format==='online'?'online':format==='очно'||format==='offline'?'offline':'',self_adjustment:r.checklist.source==='self_analysis'&&r.assessment_id&&r.results?score.roomAdjustment([{...r,checklist:{...r.checklist,source:'observation'}}]).amount:0};
 });
 const adjustments=(await db.query('SELECT * FROM pulse_v3_room_adjustments WHERE project_id=$1 AND lesson_id=ANY($2::text[])',[projectId,lessons.map(l=>l.id)])).rows;

 const grants=activeGrants;
 const permitted=(id,department)=>grants.some(g=>(g.department_id==null||String(g.department_id)===String(department))&&g.lesson_id==null);
 // Roster/history must be explicitly bound to stable user IDs and effective membership dates.
 const configured=Array.isArray(config.roster)?config.roster:[];
 const roster=configured.map(t=>({...t,id:String(t.id),departments:(t.departments||[]).filter(d=>permitted(t.id,typeof d==='string'?d:d.id))})).filter(t=>t.departments.length);
 for(const l of lessons)if(!roster.some(t=>t.id===l.teacher_id))roster.push({id:l.teacher_id,label:l.teacher_label,departments:[{id:l.department_id,label:l.department}]});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const assigned=(config.leaders||[]).filter(l=>String(l.user_id)===String(actor.id)&&l.valid_from<=today&&(!l.valid_until||l.valid_until>today)&&permitted(l.user_id,l.department_id));
 const defaultDepartments=!global&&!query.department?new Set(assigned.map(l=>String(l.department_id))):null;
 const scopedLessons=defaultDepartments?.size?lessons.filter(l=>defaultDepartments.has(l.department_id)):lessons;
 const scopedRecords=records.filter(r=>scopedLessons.some(l=>l.id===String(r.checklist.lesson_id))||(global&&!r.checklist.lesson_id));
 const leaders=(config.leaders||[]).filter(l=>permitted(l.user_id,l.department_id));
 return {interface:(()=>{const {history,...current}=require('./pulse-interface-settings').settings(config);return current;})(),project:{id:Number(project.id),title:project.title},records:scopedRecords,lessons:scopedLessons,roster:defaultDepartments?.size?roster.filter(t=>t.departments.some(d=>defaultDepartments.has(String(typeof d==='string'?d:d.id)))):roster,leaders,assigned_departments:assigned.map(l=>({id:String(l.department_id),label:lessons.find(x=>x.department_id===String(l.department_id))?.department||String(l.department_id)})),adjustments,calendar:config.calendar,
  message:[!activePolicy?'Активная политика оценивания не настроена: принятые результаты не используются.':null,!configured.length?'Полный исторический состав кафедр не настроен; охват показан по проверенным связям уроков.':null,records.some(r=>!r.checklist.lesson_id)?'Есть неподвязанные старые чек-листы. Они требуют сверки и не объединены по учителю и дате.':null].filter(Boolean).join(' ')};
}
async function aggregateWithReportStatuses(tx,dataset,query,settings={}) {
 const preliminary=aggregateDashboard(dataset,query,undefined,{paginate:false});
 const decorated=await require('./visit-report-statuses').decorateVisitReportStatuses(tx,preliminary.lessons,dataset.records);
 const statuses=new Map(decorated.map(l=>[l.id,Object.fromEntries(Object.entries(l).filter(([key])=>key.startsWith('report_')))]));
 for(const lesson of dataset.lessons){Object.assign(lesson,statuses.get(lesson.id)||{});lesson.report_sender=lesson.report_sender_name||null;}
 return aggregateDashboard(dataset,query,undefined,settings);
}
async function readDashboardV3(db,actor,projectId,query={}) {
 return consistentRead(db,async tx=>{const dataset=await readDataset(tx,actor,projectId,query);if(!dataset)return null;const dashboard=await aggregateWithReportStatuses(tx,dataset,query);
 if(dashboard.filters.period==='week'){const from=new Date(`${dashboard.filters.from}T00:00:00Z`);const previousStart=new Date(+from-7*86400000).toISOString().slice(0,10);const previous=aggregateDashboard(dataset,{...query,week_start:previousStart});dashboard.weekly_comparison=dashboard.groups.map(g=>{const prev=previous.groups.find(p=>p.policy===g.policy&&p.maximum===g.maximum);return {current:g,previous:prev||null,change:prev?score.mean([g.value,{numerator:-prev.value.numerator,denominator:prev.value.denominator}]).numerator: null};});for(const row of dashboard.weekly_comparison)if(row.previous){const v=score.mean([row.current.value,{numerator:-row.previous.value.numerator,denominator:row.previous.value.denominator}]);row.change={numerator:v.numerator*2,denominator:v.denominator};}dashboard.previous_week={from:previous.filters.from,to:previous.filters.to};}
 return require('./pulse-interface-settings').applyLabels(dashboard,dataset.interface.names);});
}
async function lessonProject(db,id) {return (await db.query("SELECT DISTINCT project_id FROM pulse_v3_checklists WHERE lesson_id=$1 AND status='submitted'",[String(id)])).rows;}
async function readLesson(db,actor,id) {
 return consistentRead(db,async tx=>{
  const projects=await lessonProject(tx,id);if(projects.length!==1){if(projects.length>1){const e=new Error('ID урока неоднозначен между проектами');e.httpStatus=409;throw e;}return null;}
  const dataset=await readDataset(tx,actor,projects[0].project_id,{period:'all_time'});if(!dataset)return null;
  const dashboard=aggregateDashboard(dataset,{period:'all_time',view:'lesson',lesson:String(id),selection:'all'});
  if(!dashboard.lesson)return null;
  const records=dataset.records.filter(r=>String(r.checklist.lesson_id)===String(id));
  const lesson=dashboard.lesson;
  return {lesson:{id:lesson.id,date:lesson.date,teacher_id:lesson.teacher_id,teacher_label:lesson.teacher_label,department_id:lesson.department_id,department:lesson.department,class_name:lesson.class_name,subject:lesson.subject,topic:lesson.topic},checklists:records.map(r=>({...r,result:lesson.checklists.find(c=>c.id===r.checklist.checklist_id)?.result,results:r.results||score.RUBRIC.criteria.map(c=>({code:c.code,max_score:c.max_score,score:null,status:c.kind==='descriptive'?'descriptive':'missing_assessment'}))})),
    result:{complete:lesson.result.value!=null,final:lesson.result.value,maximum:lesson.result.maximum,status:lesson.result.status,display:lesson.result.display},attention:lesson.attention,
    aggregation_version:score.aggregationVersion(records),assessment_ids:records.map(r=>r.assessment_id).filter(Boolean)};
 });
}
async function readExportContext(db,actor,query={}) {
 return consistentRead(db,async tx=>{
  let projectId=Number(query.project);
  if(!projectId){const {resolveDefaultSharedProject}=require('./visit-checklist-cloud-snapshot');projectId=(await resolveDefaultSharedProject(tx))?.id;}
  if(!projectId)throw bad('Нет общего проекта чек-листа');
  const dataset=await readDataset(tx,actor,projectId,query,'export');if(!dataset)throw bad('Проект не найден');
  // Aggregate once without pagination; this is the exact provider for screen, Excel and report snapshots.
  const filters={...query,page:'1',size:'100'};const dashboard=await aggregateWithReportStatuses(tx,dataset,filters,{paginate:false});
  // The export must contain all selected rows rather than only the first 100 rows.
  const all=require('./pulse-interface-settings').applyLabels(dashboard,dataset.interface.names);
  const selectedIds=new Set(all.lessons.map(l=>l.id));
  const records=dataset.records.filter(r=>selectedIds.has(String(r.checklist.lesson_id))).map(r=>({...r,results:r.results||score.RUBRIC.criteria.map(c=>({code:c.code,max_score:c.max_score,score:null,status:c.kind==='descriptive'?'descriptive':'missing_assessment'}))}));
  const deliveries=(await tx.query('SELECT * FROM pulse_visit_report_deliveries WHERE lesson_id=ANY($1::text[])',[all.lessons.map(l=>l.id)])).rows;
  const revisions=(await tx.query(`SELECT v.checklist_id,v.revision,v.editor_id,v.created_at,v.original_json,
      v.revision<>c.current_revision AS historical FROM pulse_v3_revisions v JOIN pulse_v3_checklists c
      ON c.project_id=v.project_id AND c.checklist_id=v.checklist_id WHERE v.project_id=$1 AND c.lesson_id=ANY($2::text[]) ORDER BY v.checklist_id,v.revision`,[projectId,all.lessons.map(l=>l.id)])).rows;
  return {interface:dataset.interface,filters:all.filters,selection_mode:query.view==='observers'?'observations':'lessons',generated_at:new Date().toISOString(),aggregation_version:all.aggregation_version,assessment_ids:all.assessment_ids,
    definitions:{teacher_weight:'Равный вес учителей',self_analysis:'Самоанализ отдельно от наблюдений',policy:'Полная версия оценивания',incomplete:'Пропуски не являются нулями'},summary:all.counts,groups:all.groups,lessons:all.lessons,checklists:records.map(r=>({...r,comparison:all.observer_details.find(o=>o.id===r.checklist.checklist_id)?{mapped_level:all.observer_details.find(o=>o.id===r.checklist.checklist_id).mapped_level,calculated_level:all.observer_details.find(o=>o.id===r.checklist.checklist_id).result.level,status:all.observer_details.find(o=>o.id===r.checklist.checklist_id).comparison}:null})),teachers:all.teachers.map(t=>({...t,average:t.result.value,maximum:t.result.maximum,assessment_policy_version:t.result.policy,level:t.result.level,...Object.fromEntries(t.blocks.map(b=>[b.code,b.value]))})),departments:all.departments.flatMap(d=>d.groups.map(g=>({...d,average:g.value,maximum:g.maximum,assessment_policy_version:g.policy}))),department_blocks:all.blocks,risk:all.risk,priorities:all.criteria.filter(c=>c.attention),observers:all.observers,deliveries,revisions,
    current_table:query.view==='observers'?all.observer_details:query.view==='departments'?all.departments:query.view==='criteria'?all.criteria:query.view==='lesson'?dashboard.lesson?.criteria||[]:all.teachers};
 });
}
const reportContext={readLesson,readExportContext,authorize:authorizeVisitReport};
module.exports={readDataset,readDashboardV3,readLesson,readExportContext,reportContext,consistentRead};
