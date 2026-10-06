'use strict';
const {randomUUID}=require('node:crypto');
const {isSiteAdmin,hasPermission}=require('./rbac');
const {isoDate}=require('./visit-checklist-dashboard-filters');
function problem(status,message){const e=new Error(message);e.httpStatus=status;e.publicError=message;throw e;}
function canManage(actor,viaAdminKey=false){return viaAdminKey||isSiteAdmin(actor)||hasPermission(actor,'users.manage');}
async function readAssignments(db,actor,projectId,viaAdminKey=false){
 if(!canManage(actor,viaAdminKey))problem(403,'Назначение кафедр доступно администратору пользователей.');
 const project=(await db.query('SELECT id,title,state_json,form_token FROM lesson_visit_projects WHERE id=$1',[projectId])).rows[0];if(!project)problem(404,'Проект не найден');
 const users=(await db.query('SELECT id,display_name,email FROM users ORDER BY display_name,id')).rows;
 const directory=project.state_json?.draft?.directory||{};
 const configured=directory.departments||[];
 const bindings=(await db.query(`SELECT DISTINCT b.department_id,b.metadata->>'department' AS label FROM pulse_visit_report_lesson_bindings b WHERE EXISTS(SELECT 1 FROM pulse_v3_checklists c WHERE c.project_id=$1 AND c.lesson_id=b.lesson_id)`,[projectId])).rows;
 const departments=[...new Map([...configured.map(d=>({id:String(d.id),label:d.name||d.label||String(d.id)})),...bindings.filter(d=>d.department_id).map(d=>({id:String(d.department_id),label:d.label||String(d.department_id)}))].map(d=>[d.id,d])).values()];
 const config=project.state_json?.pulse_v3||{};
 const interfaceSettings=require('./pulse-interface-settings').settings(config);
 const grants=(await db.query('SELECT g.*,u.display_name AS label FROM pulse_visit_report_grants g JOIN users u ON u.id=g.user_id ORDER BY g.valid_from DESC,g.id DESC')).rows;
 return {access:await require('./pulse-access-v4').listAccess(db,actor,viaAdminKey),interface:interfaceSettings,project_id:Number(projectId),form_token:project.form_token,users:users.map(u=>({id:String(u.id),label:u.display_name||u.email})),departments,leaders:config.leaders||[],roster:config.roster||[],history:config.assignment_history||[],calendar:config.calendar||{quarters:[]},active_policy:config.active_policy||'',policies:(await db.query('SELECT DISTINCT assessment_policy_version AS id FROM pulse_v3_active_assessments WHERE project_id=$1 ORDER BY assessment_policy_version',[projectId])).rows,lessons:(await db.query('SELECT lesson_id,teacher_user_id,department_id,metadata FROM pulse_visit_report_lesson_bindings ORDER BY lesson_id')).rows,grants};
}
async function changeAssignment(pool,actor,projectId,body,viaAdminKey=false){
 if(!canManage(actor,viaAdminKey))problem(403,'Назначение кафедр доступно администратору пользователей.');
 if(['save_interface','restore_interface'].includes(body.action))return require('./pulse-interface-settings').saveSettings(pool,actor,projectId,body,viaAdminKey);
 if(body.action==='assign'&&body.target==='leader')return assignLeader(pool,actor,projectId,{...body,department_ids:[body.department_id]},viaAdminKey);
 if(body.action==='assign_leader')return assignLeader(pool,actor,projectId,body,viaAdminKey);
 if(body.action==='revoke_access')return require('./pulse-access-v4').revokeAccess(pool,actor,Number(body.assignment_id),viaAdminKey);
 if(body.action==='activate_policy')return require('./pulse-v3-store').activatePolicy(pool,projectId,String(body.policy||''),{actor_id:actor?.id||'api-key',reason:body.reason});
 if(!['assign','end','save_calendar','bind_lesson'].includes(body.action)||!['leader','teacher','grant','calendar','lesson'].includes(body.target))problem(400,'Неизвестное действие назначения');
 const tx=await pool.connect();try{await tx.query('BEGIN');
 const project=(await tx.query('SELECT id,state_json FROM lesson_visit_projects WHERE id=$1 FOR UPDATE',[projectId])).rows[0];if(!project)problem(404,'Проект не найден');
 const config=structuredClone(project.state_json?.pulse_v3||{});config.leaders||=[];config.roster||=[];config.assignment_history||=[];
 const at=body.action==='assign'?isoDate(String(body.valid_from||'')):body.action==='end'?isoDate(String(body.valid_until||'')):'';
 let entry;
 if(body.action==='save_calendar'){
  const quarters=body.quarters;if(!Array.isArray(quarters)||!quarters.length)problem(400,'Укажите даты четвертей');
  const validated=quarters.map(q=>({from:isoDate(String(q.from||'')),to:isoDate(String(q.to||''))})).sort((a,b)=>a.from.localeCompare(b.from));
  for(let i=0;i<validated.length;i++)if(validated[i].from>validated[i].to||(i&&validated[i-1].to>=validated[i].from))problem(400,'Даты четвертей пересекаются или задан неверный порядок');
  config.calendar={quarters:validated};entry=config.calendar;
 }else if(body.action==='bind_lesson'){
  const userId=Number(body.user_id);const user=(await tx.query('SELECT id,display_name FROM users WHERE id=$1',[userId])).rows[0];if(!user)problem(404,'Учитель не найден');
  const allowed=await readAssignments(tx,actor,projectId,viaAdminKey);const department=allowed.departments.find(d=>d.id===String(body.department_id));if(!department)problem(400,'Выберите существующую кафедру');
  const metadata={date:isoDate(String(body.date||'')),class_name:String(body.class_name||'').trim(),subject:String(body.subject||'').trim(),topic:String(body.topic||'').trim(),department:department.label};
  if(!metadata.class_name||!metadata.subject)problem(400,'Нужны класс и предмет');
  const lessonId=body.lesson_id?String(body.lesson_id).trim():`lesson:${randomUUID()}`;if(lessonId.length>200)problem(400,'Слишком длинный ID урока');
  const exists=(await tx.query('SELECT lesson_id FROM pulse_visit_report_lesson_bindings WHERE lesson_id=$1',[lessonId])).rows[0];if(exists)problem(409,'Этот ID урока уже связан. Существующая связь не перезаписана');
  await tx.query('INSERT INTO pulse_visit_report_lesson_bindings(lesson_id,teacher_user_id,department_id,metadata) VALUES($1,$2,$3,$4::jsonb)',[lessonId,userId,department.id,JSON.stringify(metadata)]);entry={lesson_id:lessonId,user_id:userId,department_id:department.id,metadata};
 }else if(body.action==='assign'){
  const userId=Number(body.user_id);if(!Number.isSafeInteger(userId)||userId<=0)problem(400,'Нужен ID пользователя');
  const user=(await tx.query('SELECT id,display_name,email FROM users WHERE id=$1',[userId])).rows[0];if(!user)problem(404,'Пользователь не найден');
  const departmentId=String(body.department_id||'');const allowed=await readAssignments(tx,actor,projectId,viaAdminKey);const department=allowed.departments.find(d=>d.id===departmentId);if(!department)problem(400,'Выберите существующую кафедру');
  entry={assignment_id:randomUUID(),user_id:String(userId),department_id:departmentId,label:user.display_name||user.email,valid_from:at,valid_until:null};
  if(body.target==='leader'){
   if(config.leaders.some(l=>l.user_id===entry.user_id&&l.department_id===entry.department_id&&!l.valid_until))problem(409,'Эта связь уже действует');config.leaders.push(entry);
  }else if(body.target==='teacher'){
   let teacher=config.roster.find(t=>String(t.id)===String(userId));if(!teacher){teacher={id:String(userId),label:entry.label,departments:[]};config.roster.push(teacher);}
   if(teacher.departments.some(d=>d.id===departmentId&&!d.valid_until))problem(409,'Учитель уже связан с этой кафедрой');teacher.departments.push({id:departmentId,label:department.label,assignment_id:entry.assignment_id,valid_from:at,valid_until:null});
  }else{
   if(!['view','export','send'].includes(body.permission))problem(400,'Неизвестное право');
   const row=(await tx.query('INSERT INTO pulse_visit_report_grants(user_id,action,department_id,valid_from) VALUES($1,$2,$3,$4::date::timestamp AT TIME ZONE \'Europe/Moscow\') RETURNING id',[userId,body.permission,departmentId,at])).rows[0];entry={...entry,grant_id:row.id,permission:body.permission};
  }
 }else{
  if(body.target==='grant'){
   const row=(await tx.query("UPDATE pulse_visit_report_grants SET valid_until=$2::date::timestamp AT TIME ZONE 'Europe/Moscow' WHERE id=$1 AND (valid_until IS NULL OR valid_until>$2::date::timestamp AT TIME ZONE 'Europe/Moscow') AND valid_from<$2::date::timestamp AT TIME ZONE 'Europe/Moscow' RETURNING *",[Number(body.assignment_id),at])).rows[0];if(!row)problem(409,'Право не найдено или дата окончания недопустима');entry=row;
  }else{
   entry=body.target==='leader'?config.leaders.find(l=>l.assignment_id===body.assignment_id):config.roster.flatMap(t=>t.departments||[]).find(d=>d.assignment_id===body.assignment_id);
   if(!entry)problem(404,'Связь не найдена');if(entry.valid_until)problem(409,'Связь уже завершена');if(at<=entry.valid_from)problem(400,'Окончание должно быть позже начала');entry.valid_until=at;
   if(body.target==='leader')await tx.query("UPDATE pulse_visit_report_grants SET valid_until=$2::date::timestamp AT TIME ZONE 'Europe/Moscow' WHERE assignment_id=$1 AND valid_until IS NULL",[entry.assignment_id,at]);
  }
 }
 config.assignment_history.push({action:body.action,target:body.target,entry:structuredClone(entry),actor_id:actor?.id==null?'api-key':String(actor.id),changed_at:new Date().toISOString()});
 await tx.query("UPDATE lesson_visit_projects SET state_json=jsonb_set(state_json,'{pulse_v3}',$2::jsonb,true),updated_at=now() WHERE id=$1",[projectId,JSON.stringify(config)]);await tx.query('COMMIT');return {ok:true};
 }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}

async function assignLeader(pool,actor,projectId,body,viaAdminKey=false){
 if(!canManage(actor,viaAdminKey))problem(403,'Назначение кафедр доступно администратору пользователей.');
 const userId=Number(body.user_id),ids=[...new Set((Array.isArray(body.department_ids)?body.department_ids:[]).map(String))];
 if(!Number.isSafeInteger(userId)||userId<=0||!ids.length)problem(400,'Выберите сотрудника и хотя бы одну кафедру');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const at=isoDate(String(body.valid_from||today));
 const tx=await pool.connect();try{
  await tx.query('BEGIN');
  const project=(await tx.query('SELECT state_json FROM lesson_visit_projects WHERE id=$1 FOR UPDATE',[projectId])).rows[0];if(!project)problem(404,'Проект не найден');
  const allowed=await readAssignments(tx,actor,projectId,viaAdminKey);
  const user=allowed.users.find(u=>u.id===String(userId));if(!user)problem(400,'Сотрудник не найден');
  if(ids.some(id=>!allowed.departments.some(d=>d.id===id)))problem(400,'Выберите существующие кафедры');
  const config=structuredClone(project.state_json?.pulse_v3||{});config.leaders||=[];config.assignment_history||=[];
  for(const department_id of ids){
   let entry=config.leaders.find(l=>String(l.user_id)===String(userId)&&l.department_id===department_id&&!l.valid_until);
   if(!entry){entry={assignment_id:randomUUID(),user_id:String(userId),department_id,label:user.label,valid_from:at,valid_until:null};config.leaders.push(entry);}
   for(const action of ['view','export','send'])await tx.query(`INSERT INTO pulse_visit_report_grants(user_id,action,department_id,valid_from,assignment_id)
    VALUES($1,$2,$3,$4::date::timestamp AT TIME ZONE 'Europe/Moscow',$5)
    ON CONFLICT(assignment_id,action) WHERE assignment_id IS NOT NULL DO NOTHING`,[userId,action,department_id,entry.valid_from,entry.assignment_id]);
   config.assignment_history.push({action:'assign',target:'leader',entry:structuredClone(entry),actor_id:String(actor?.id||'api-key'),changed_at:new Date().toISOString()});
  }
  await tx.query("UPDATE lesson_visit_projects SET state_json=jsonb_set(state_json,'{pulse_v3}',$2::jsonb,true),updated_at=now() WHERE id=$1",[projectId,JSON.stringify(config)]);
  await tx.query('COMMIT');return {ok:true};
 }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
module.exports={canManage,readAssignments,changeAssignment,assignLeader};
