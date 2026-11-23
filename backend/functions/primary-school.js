'use strict';
const {json,parseBody,parseQuery}=require('./lib/http');
const {requireUser}=require('./lib/session-auth');
const {catalog,capabilities,isPrimaryTeacher,validateSpec,validateRows}=require('./lib/primary-school');
const {suggestWithGiga,studentEvidence,generateStudentInsight}=require('./lib/primary-school-ai');
const {hasGigaChatCreds}=require('./lib/llm-chat');
const {readSkillCatalog,changeSkillLink,validateManualSkill}=require('./lib/primary-skill-links');
const {randomUUID}=require('node:crypto');
const {groupEvidence,generateGroupInsight}=require('./lib/primary-group-insight');
const {editPrimaryRoster,archivePrimaryStudent}=require('./lib/primary-roster');
const {materialList,materialFile}=require('./lib/primary-materials');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied=()=>json(403,{error:'forbidden',message:'Раздел доступен администрации и учителям начальной школы.'});
async function accessFor(pool,auth) {
  const user=auth.sessionUser||auth.user;
  if(auth.viaAdminKey&&!auth.sessionUser)return {user,staff:[],caps:{access:true,viewAll:true,canManage:true,canWrite:true,mode:process.env.PRIMARY_ANALYTICS_SCOPE==='own'?'own':'all',classIds:[],staffIds:[],teacherStaffId:null}};
  const staff=(await pool.query(`SELECT id,full_name,email,department,position_actual,position_staff FROM job_description_staff WHERE lower(trim(email))=$1 AND COALESCE(archived,false)=false`,[String(user?.email||'').trim().toLowerCase()])).rows;
  const ids=staff.map(s=>s.id);
  const classes=ids.length?(await pool.query('SELECT class_id FROM primary_teacher_classes WHERE staff_id=ANY($1::int[])',[ids])).rows.map(s=>Number(s.class_id)):[];
  return {user,staff,caps:capabilities(user,staff,process.env.PRIMARY_ANALYTICS_SCOPE==='own'?'own':'all',classes)};
}
async function directory(pool,caps,yearId) {
  const years=(await pool.query('SELECT id,label,is_current FROM ea_academic_years ORDER BY is_current DESC,starts_on DESC')).rows;
  const year=yearId ? years.find(y=>Number(y.id)===Number(yearId)):years[0];
  if(!year)return {years,year:null,classes:[],students:[],teachers:[]};
  const classes=(await pool.query(`SELECT c.id,c.code_display AS title,g.parallel,c.academic_year_id FROM ea_classes c JOIN ea_grades g ON g.id=c.grade_id WHERE c.academic_year_id=$1 AND c.archived_at IS NULL AND g.parallel BETWEEN 1 AND 4 AND ($2::boolean OR c.id=ANY($3::int[])) ORDER BY g.parallel,c.code_display`,[year.id,caps.viewAll,caps.classIds])).rows;
  const students=(await pool.query(`SELECT s.id,s.public_id,s.full_name,s.class_id,c.code_display AS class_title,g.parallel FROM ea_students s JOIN ea_classes c ON c.id=s.class_id JOIN ea_grades g ON g.id=c.grade_id WHERE s.archived_at IS NULL AND s.class_id=ANY($1::int[]) ORDER BY c.code_display,s.full_name`,[classes.map(c=>c.id)])).rows;
  const allStaff=(await pool.query(`SELECT id,full_name,department,position_actual,position_staff FROM job_description_staff WHERE COALESCE(archived,false)=false AND (department ILIKE '%начальн%' OR position_actual ILIKE '%начальн%') ORDER BY full_name`)).rows;
  const teachers=allStaff.filter(isPrimaryTeacher);
  const teacherClasses=(await pool.query('SELECT staff_id,class_id FROM primary_teacher_classes WHERE class_id=ANY($1::int[])',[classes.map(c=>c.id)])).rows;
  return {years,year,classes,students,teachers,teacher_classes:teacherClasses};
}
async function hideArchivedStudents(pool,works){
 const ids=[...new Set(works.flatMap(w=>w.roster_json.map(s=>Number(s.id))))];
 if(!ids.length)return works;
 const archived=new Set((await pool.query('SELECT id FROM ea_students WHERE id=ANY($1::int[]) AND archived_at IS NOT NULL',[ids])).rows.map(s=>Number(s.id)));
 return works.map(w=>({...w,roster_json:w.roster_json.filter(s=>!archived.has(Number(s.id)))}));
}
async function handlePrimarySchoolRequest(pool,event,method,segs) {
  const auth=await requireUser(pool,event);if(!auth.ok)return json(auth.code||401,{error:auth.error||'Unauthorized'});
  // A preview must never silently inherit the signed-in operator's full roster.
  if(Object.entries(event.headers||{}).some(([k,v])=>/^x-(jd|ea)-preview/i.test(k)&&v))return json(403,{error:'preview_unavailable',message:'Откройте раздел из своего кабинета: просмотр от лица другого сотрудника здесь отключён.'});
  try {
    const {user,staff,caps}=await accessFor(pool,auth);
    const action=segs[2]||'',id=segs[3],extra=segs[4],query=parseQuery(event)||{};
    if(action==='me'&&method==='GET')return json(200,{capabilities:caps,staff});
    if(!caps.access)return denied();
    if(action==='materials'&&['GET','HEAD'].includes(method)) {
      if(!id&&method==='GET')return json(200,{materials:materialList()});
      if(id&&extra==='file'&&segs.length===5)return await materialFile(event,method,id);
      return json(404,{message:'Материал не найден.'});
    }
    if(method==='POST'&&action==='students'&&/^\d+$/.test(id||'')&&extra==='archive'&&segs.length===5){
      const b=parseBody(event),dir=await directory(pool,caps,b.year_id);
      return await archivePrimaryStudent(pool,{caps,user,dir,id,body:b});
    }
    if(action==='students'&&(method==='POST'&&!id||method==='PUT'&&/^\d+$/.test(id||'')&&extra==='class')){
      const b=parseBody(event),dir=await directory(pool,caps,b.year_id);
      return await editPrimaryRoster(pool,{caps,user,dir,id,body:b});
    }
    if(method==='GET'&&action==='bootstrap') {
      const dir=await directory(pool,caps,query.year_id);
      const savedWorks=dir.year?(await pool.query(`SELECT w.*,s.full_name AS teacher_name FROM primary_works w JOIN job_description_staff s ON s.id=w.teacher_staff_id WHERE w.academic_year_id=$1 AND ($2::boolean OR w.class_ids <@ $3::int[]) ORDER BY held_on DESC,created_at DESC`,[dir.year.id,caps.viewAll,caps.classIds])).rows:[];
      const works=await hideArchivedStudents(pool,savedWorks);
      const settings=(await pool.query('SELECT red_below,green_from,skill_links,skill_links_revision FROM primary_settings WHERE id=1')).rows[0]||{red_below:50,green_from:75};
      const skillCatalog=await readSkillCatalog(pool);
      const ownTemplates=(await pool.query('SELECT * FROM primary_templates WHERE created_by=$1 OR $2::boolean ORDER BY updated_at DESC',[user.id,caps.canManage])).rows.map(t=>({id:t.id,title:t.title,subject:t.subject,grade:t.grade,kind:'control',variant:'',tasks:t.spec_json.tasks,skills:t.spec_json.skills,source:{file:t.spec_json.source_files?.[0]?.file||'Своя спецификация',pdf_pages:t.spec_json.source_files?.map(s=>s?.pdf_page).filter(Boolean)||[]},notice:'Авторская спецификация. Перед новой работой сверьте задания и критерии.',origin:'teacher',revision:t.revision,can_edit:caps.canManage||Number(t.created_by)===Number(user.id)}));
      const observations=works.length?(await pool.query('SELECT work_id,student_id,task_id,skill_id,status,completion_percent,note FROM primary_observations WHERE work_id=ANY($1::uuid[])',[works.map(w=>w.id)])).rows:[];
      const activeRoster=new Set(works.flatMap(w=>w.roster_json.map(s=>Number(s.id))));
      return json(200,{...dir,capabilities:caps,catalog:{...catalog,skills:skillCatalog,templates:[...ownTemplates,...catalog.templates]},skill_links:settings.skill_links||{},skill_links_revision:settings.skill_links_revision||1,works,observations:observations.filter(o=>activeRoster.has(Number(o.student_id))).map(o=>({...o,completion_percent:o.completion_percent==null?null:Number(o.completion_percent)})),ai:{provider:'gigachat',configured:hasGigaChatCreds()},traffic_thresholds:{redBelow:Number(settings.red_below),greenFrom:Number(settings.green_from)},roster_source:'english-assessment',scope_notice:caps.viewAll?'Полный обзор начальной школы':'Только назначенные классы'});
    }
    if(method==='POST'&&action==='skills'){
      if(!caps.canWrite)return denied();
      const s=validateManualSkill(parseBody(event)),id='custom_'+randomUUID();
      const saved=(await pool.query('INSERT INTO primary_skills(id,title,topic,criterion,grade,subject,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,title,topic,criterion,grade,subject',[id,s.title,s.topic,s.criterion,s.grade,s.subject,user.id])).rows[0];
      return json(201,{skill:saved});
    }
    if(action==='templates'&&(method==='POST'&&!id||method==='PUT'&&UUID.test(id||''))){
      if(!caps.canWrite)return denied();
      const b=parseBody(event),spec=validateSpec(b.spec),grade=Number(b.grade),subject=String(b.subject||'').trim(),title=String(b.title||'').trim();
      if(!title||title.length>250||!subject||subject.length>100||![1,2,3,4].includes(grade))return json(400,{message:'Заполните название, предмет и параллель спецификации.'});
      if(spec.skills.some(s=>s.grade&&s.grade!==grade||s.subject&&s.subject!==subject))return json(400,{message:'Навыки относятся к другому предмету или параллели.'});
      const client=await pool.connect();
      try{
        await client.query('BEGIN');let saved;
        if(method==='PUT'){
          const old=(await client.query('SELECT * FROM primary_templates WHERE id=$1 FOR UPDATE',[id])).rows[0];
          if(!old||!caps.canManage&&Number(old.created_by)!==Number(user.id)){await client.query('ROLLBACK');return json(404,{message:'Спецификация не найдена.'});}
          if(Number(b.revision)!==Number(old.revision)){await client.query('ROLLBACK');return json(409,{message:'Спецификация уже изменена. Обновите список и откройте её снова.'});}
          saved=(await client.query('UPDATE primary_templates SET title=$2,subject=$3,grade=$4,spec_json=$5::jsonb,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[id,title,subject,grade,JSON.stringify(spec)])).rows[0];
          await client.query("INSERT INTO primary_audit(actor_id,action,payload) VALUES($1,'template_update',$2::jsonb)",[user.id,JSON.stringify({template_id:id,previous:old.spec_json,revision:saved.revision})]);
        }else saved=(await client.query('INSERT INTO primary_templates(title,subject,grade,spec_json,created_by) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *',[title,subject,grade,JSON.stringify(spec),user.id])).rows[0];
        await client.query('COMMIT');return json(method==='POST'?201:200,{template:{id:saved.id,title,subject,grade,kind:'control',variant:'',tasks:spec.tasks,skills:spec.skills,source:{file:spec.source_files?.[0]?.file||'Своя спецификация',pdf_pages:spec.source_files.map(s=>s?.pdf_page).filter(Boolean)},origin:'teacher',revision:saved.revision,can_edit:true}});
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }
    if(method==='PUT'&&action==='skill-links') {
      if(!caps.canManage)return denied();
      const b=parseBody(event),client=await pool.connect();
      try{
        await client.query('BEGIN');
        const state=(await client.query('SELECT skill_links,skill_links_revision FROM primary_settings WHERE id=1 FOR UPDATE')).rows[0];
        if(Number(b.revision)!==Number(state.skill_links_revision)){await client.query('ROLLBACK');return json(409,{message:'Связи уже изменены другим сотрудником. Обновите страницу и повторите выбор.'});}
        const links=changeSkillLink(state.skill_links,b,await readSkillCatalog(client));
        const revision=Number(state.skill_links_revision)+1;
        await client.query('UPDATE primary_settings SET skill_links=$1::jsonb,skill_links_revision=$2,updated_by=$3,updated_at=now() WHERE id=1',[JSON.stringify(links),revision,user.id]);
        await client.query("INSERT INTO primary_audit(actor_id,action,payload) VALUES($1,'skill_link',$2::jsonb)",[user.id,JSON.stringify({source_id:b.source_id,before:state.skill_links[b.source_id]||null,after:links[b.source_id]||null,revision})]);
        await client.query('COMMIT');return json(200,{skill_links:links,revision});
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }
    if(method==='PUT'&&action==='settings') {
      if(!caps.canManage)return denied();const b=parseBody(event),red=b.redBelow,green=b.greenFrom;
      if(typeof red!=='number'||typeof green!=='number'||!Number.isFinite(red)||!Number.isFinite(green)||red<=0||red>=green||green>100)return json(400,{message:'Проверьте границы светофора: 0 < красный < зелёный ≤ 100.'});
      await pool.query('UPDATE primary_settings SET red_below=$1,green_from=$2,updated_by=$3,updated_at=now() WHERE id=1',[red,green,user.id]);
      return json(200,{ok:true});
    }
    if(method==='POST'&&action==='suggest') {
      const b=parseBody(event);
      const links=(await pool.query('SELECT skill_links FROM primary_settings WHERE id=1')).rows[0]?.skill_links||{};
      const result=await suggestWithGiga({...b,userId:user.id,knownSkills:await readSkillCatalog(pool),skillLinks:links});
      return json(200,result);
    }
    if(method==='POST'&&action==='students'&&/^\d+$/.test(id||'')&&extra==='insight') {
      const b=parseBody(event),dir=await directory(pool,caps,b.year_id);
      if(!dir.students.some(s=>Number(s.id)===Number(id)))return json(404,{message:'Ребёнок не найден в доступных классах.'});
      const works=(await pool.query(`SELECT * FROM primary_works WHERE academic_year_id=$1 AND ($2::boolean OR class_ids <@ $3::int[]) ORDER BY held_on,created_at,id`,[dir.year.id,caps.viewAll,caps.classIds])).rows.filter(w=>(!b.subject||w.subject===b.subject)&&(!b.from||(w.held_on instanceof Date?w.held_on.toISOString():String(w.held_on)).slice(0,10)>=b.from)&&(!b.to||(w.held_on instanceof Date?w.held_on.toISOString():String(w.held_on)).slice(0,10)<=b.to)&&(!b.teacher_id||Number(w.teacher_staff_id)===Number(b.teacher_id))&&(!b.class_id||w.class_ids.map(Number).includes(Number(b.class_id))));
      const rows=works.length?(await pool.query('SELECT * FROM primary_observations WHERE student_id=$1 AND work_id=ANY($2::uuid[])',[id,works.map(w=>w.id)])).rows:[];
      const links=(await pool.query('SELECT skill_links FROM primary_settings WHERE id=1')).rows[0]?.skill_links||{};
      const packet=studentEvidence(works,rows,Number(id),links,await readSkillCatalog(pool));
      if(!packet.evidence.length)return json(200,await generateStudentInsight(packet,user.id));
      const cached=(await pool.query('SELECT response_json,generated_at FROM primary_ai_insights WHERE student_id=$1 AND evidence_hash=$2',[id,packet.hash])).rows[0];
      if(cached)return json(200,{...cached.response_json,generated_at:cached.generated_at,cached:true});
      const result=await generateStudentInsight(packet,user.id);
      const saved=(await pool.query(`INSERT INTO primary_ai_insights(student_id,evidence_hash,response_json) VALUES($1,$2,$3::jsonb) ON CONFLICT(student_id,evidence_hash) DO UPDATE SET response_json=EXCLUDED.response_json,generated_at=now() RETURNING generated_at`,[id,packet.hash,JSON.stringify(result)])).rows[0];
      return json(200,{...result,generated_at:saved.generated_at,cached:false});
    }
    if(method==='POST'&&action==='insights'){
      const b=parseBody(event),dir=await directory(pool,caps,b.year_id);
      if(!['overview','class','grade','teacher','work','skill'].includes(b.entity))return json(400,{message:'Выберите вид аналитического вывода.'});
      const classIds=Array.isArray(b.class_ids)?[...new Set(b.class_ids.map(Number))]:dir.classes.map(c=>Number(c.id));
      if(classIds.some(id=>!dir.classes.some(c=>Number(c.id)===id)))return denied();
      if(b.grade&&![1,2,3,4].includes(Number(b.grade))||b.work_id&&!UUID.test(b.work_id))return json(400,{message:'Проверьте выбранную параллель или работу.'});
      const raw=dir.year&&classIds.length?(await pool.query(`SELECT * FROM primary_works WHERE academic_year_id=$1 AND ($2::boolean OR class_ids <@ $3::int[]) AND class_ids && $4::int[] ORDER BY held_on,created_at,id`,[dir.year.id,caps.viewAll,caps.classIds,classIds])).rows:[];
      const works=(await hideArchivedStudents(pool,raw)).filter(w=>(!b.grade||Number(w.grade)===Number(b.grade))&&(!b.subject||w.subject===b.subject)&&(!b.teacher_id||Number(w.teacher_staff_id)===Number(b.teacher_id))&&(!b.work_id||w.id===b.work_id)&&(!b.from||String(w.held_on instanceof Date?w.held_on.toISOString():w.held_on).slice(0,10)>=b.from)&&(!b.to||String(w.held_on instanceof Date?w.held_on.toISOString():w.held_on).slice(0,10)<=b.to)).map(w=>({...w,roster_json:w.roster_json.filter(s=>classIds.includes(Number(s.class_id)))}));
      const observations=works.length?(await pool.query('SELECT * FROM primary_observations WHERE work_id=ANY($1::uuid[])',[works.map(w=>w.id)])).rows:[];
      const links=(await pool.query('SELECT skill_links FROM primary_settings WHERE id=1')).rows[0]?.skill_links||{};
      const packet=groupEvidence(works,observations,links,await readSkillCatalog(pool),{entity:b.entity,skill_id:b.skill_id||null});
      if(!packet.evidence.length)return json(200,await generateGroupInsight(packet,user.id,b.entity));
      const cached=(await pool.query('SELECT response_json,generated_at FROM primary_group_insights WHERE evidence_hash=$1',[packet.hash])).rows[0];
      if(cached)return json(200,{...cached.response_json,generated_at:cached.generated_at,cached:true});
      const result=await generateGroupInsight(packet,user.id,b.entity);
      const saved=(await pool.query('INSERT INTO primary_group_insights(evidence_hash,response_json) VALUES($1,$2::jsonb) ON CONFLICT(evidence_hash) DO UPDATE SET response_json=EXCLUDED.response_json,generated_at=now() RETURNING generated_at',[packet.hash,JSON.stringify(result)])).rows[0];
      return json(200,{...result,generated_at:saved.generated_at,cached:false});
    }
    if(method==='POST'&&action==='works'&&!id) {
      const b=parseBody(event),spec=validateSpec(b.spec);
      const grade=Number(b.grade),teacher=Number(b.teacher_staff_id),classIds=[...new Set((Array.isArray(b.class_ids)?b.class_ids:[]).map(Number))];
      if(!String(b.title||'').trim()||String(b.title).length>250||!String(b.subject||'').trim()||String(b.subject).length>100)return json(400,{message:'Заполните название и предмет.'});
      if(![1,2,3,4].includes(grade)||!['control','practice','repeat'].includes(b.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(b.held_on||'')||(Number.isNaN(Date.parse(b.held_on))||new Date(b.held_on).toISOString().slice(0,10)!==b.held_on))return json(400,{message:'Проверьте класс, тип и дату работы.'});
      const dir=await directory(pool,caps,b.academic_year_id);
      if(!dir.year||!dir.teachers.some(t=>Number(t.id)===teacher)||!classIds.length||classIds.some(id=>!dir.classes.some(c=>Number(c.id)===id&&Number(c.parallel)===grade)))return json(400,{message:'Выберите учителя и доступные классы одной параллели.'});
      if(!caps.canManage&&!caps.staffIds.includes(teacher))return denied();
      if(spec.skills.some(s=>s.grade&&s.grade!==grade))return json(400,{message:'Навыки шаблона относятся к другой параллели.'});
      if(spec.skills.some(s=>s.subject&&s.subject!==b.subject))return json(400,{message:'Навыки шаблона относятся к другому предмету.'});
      const roster=dir.students.filter(s=>classIds.includes(Number(s.class_id)));
      if(!roster.length)return json(400,{message:'В выбранных классах нет учеников. Проверьте общий справочник.'});
      const result=await pool.query(`INSERT INTO primary_works(title,subject,grade,held_on,kind,teacher_staff_id,academic_year_id,class_ids,spec_json,roster_json,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11) RETURNING *`,[String(b.title).trim(),b.subject,grade,b.held_on,b.kind,teacher,dir.year.id,classIds,JSON.stringify(spec),JSON.stringify(roster),user.id]);
      return json(201,{work:result.rows[0]});
    }
    if(method==='PUT'&&action==='works'&&UUID.test(id||'')&&extra==='observations') {
      const b=parseBody(event),client=await pool.connect();
      try {
        await client.query('BEGIN');
        const w=(await client.query('SELECT * FROM primary_works WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!w||(!caps.viewAll&&!w.class_ids.every(c=>caps.classIds.includes(Number(c))))){await client.query('ROLLBACK');return json(404,{message:'Работа не найдена.'});}
        if(!caps.canManage&&!caps.staffIds.includes(Number(w.teacher_staff_id))){await client.query('ROLLBACK');return denied();}
        if(Number(b.revision)!==Number(w.revision)){await client.query('ROLLBACK');return json(409,{message:'Коллега уже изменил результаты. Обновите работу перед сохранением.'});}
        const rows=validateRows(w,b.rows);
        if(b.comment!==undefined&&(typeof b.comment!=='string'||b.comment.length>8000)){await client.query('ROLLBACK');return json(400,{message:'Комментарий к работе должен быть не длиннее 8000 символов.'});}
        const before=(await client.query('SELECT student_id,task_id,skill_id,status,completion_percent,note FROM primary_observations WHERE work_id=$1',[id])).rows;
        for(const r of rows)await client.query(`INSERT INTO primary_observations(work_id,student_id,task_id,skill_id,status,completion_percent,note,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(work_id,student_id,task_id) DO UPDATE SET status=EXCLUDED.status,completion_percent=EXCLUDED.completion_percent,note=EXCLUDED.note,updated_by=EXCLUDED.updated_by,updated_at=now()`,[id,r.student_id,r.task_id,r.skill_id,r.status,r.completion_percent,r.note,user.id]);
        await client.query(`INSERT INTO primary_audit(work_id,actor_id,action,payload) VALUES($1,$2,'observations_saved',$3::jsonb)`,[id,user.id,JSON.stringify({before,changes:rows,...(b.comment!==undefined?{comment_before:w.comment,comment_after:b.comment.trim()}:{})})]);
        await client.query('UPDATE primary_works SET revision=revision+1,comment=COALESCE($2,comment) WHERE id=$1',[id,b.comment===undefined?null:b.comment.trim()]);
        await client.query('COMMIT');return json(200,{ok:true,revision:Number(w.revision)+1});
      } catch(e) {await client.query('ROLLBACK');throw e;} finally{client.release();}
    }
    return json(404,{error:'not_found'});
  }catch(e){if([400,429,502,503].includes(e.status))return json(e.status,{message:e.message});throw e;}
}
module.exports={handlePrimarySchoolRequest,accessFor,directory};
