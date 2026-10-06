'use strict';
const assert=require('node:assert/strict');const {test}=require('node:test');
const controls=require('./fixtures/pulse-v3/controls.json');const score=require('./pulse-v3-score');
const {readDashboardV3,readLesson,readExportContext,consistentRead}=require('./visit-checklist-v3-analytics');
const {canManage}=require('./visit-checklist-department-assignments');
function database(departments=null,{send=false}={}){
 const queries=[];const grants=departments?departments.map(department_id=>({department_id,lesson_id:null})):[{department_id:null,lesson_id:null}];
 const records=structuredClone(controls.records),roster=Object.entries(controls.roster).flatMap(([department,ids])=>ids.map(id=>({id,label:`Учитель ${id}`,departments:[{id:department,label:department,valid_from:'2020-09-01',valid_until:null}]})));
 const db={queries,async query(sql,values){queries.push(sql);
  if(sql.includes('FROM lesson_visit_projects'))return {rows:[{id:1,title:'Тест',state_json:{pulse_v3:{active_policy:records[0].assessment_policy_version,roster,leaders:(departments||[]).map(department_id=>({user_id:'9',department_id,label:'Руководитель',valid_from:'2020-09-01',valid_until:null}))}}}]};
  if(sql.includes('FROM pulse_v3_checklists c')&&sql.includes('LEFT JOIN pulse_v3_active_assessments'))return {rows:records.map(r=>({...r,results_json:r.results,checklist:r.checklist}))};
  if(sql.includes('SELECT b.lesson_id AS id')){assert.match(sql,/EXISTS\(SELECT 1 FROM pulse_visit_report_grants/);return {rows:controls.lessons.filter(l=>!departments||departments.includes(l.department)).map(l=>({id:l.lesson_id,teacher_id:l.teacher_id,teacher_label:`Учитель ${l.teacher_id}`,department_id:l.department,metadata:{...l,department:l.department}}))};}
  if(sql.includes('SELECT c.checklist_id,c.response_id'))return {rows:records.map(r=>({checklist_id:r.checklist.checklist_id,original_json:{general:{visit_format:'очно'}}}))};
  if(sql.includes('FROM pulse_visit_report_grants'))return {rows:grants};
  if(sql.includes('FROM users WHERE id::text'))return {rows:[{id:'Н-1',display_name:'Наблюдатель 1'},{id:'Н-2',display_name:'Наблюдатель 2'}]};
  if(sql.includes('FROM pulse_v3_room_adjustments'))return {rows:[]};
  if(sql.includes('FROM pulse_visit_report_deliveries d'))return {rows:send?[{lesson_id:'У-101',aggregation_version:score.aggregationVersion(records.filter(r=>r.checklist.lesson_id==='У-101')),sent_at:'2026-09-28T12:00:00Z',opened_at:null,sender_name:'Руководитель'}]:[]};
  if(sql.includes('SELECT DISTINCT project_id'))return {rows:[{project_id:1}]};
  if(sql.includes('FROM pulse_visit_report_deliveries'))return {rows:[]};
  if(sql.includes('FROM pulse_v3_revisions'))return {rows:[]};
  throw new Error(`Unexpected test SQL: ${sql}`);
 }};return db;
}
test('A24/A25/A32: two assigned departments, another observer retained, direct foreign lesson denied',async()=>{
 const db=database(['Английский язык','Математика']);const data=await readDashboardV3(db,{id:9},1,{period:'all_time',selection:'all'});
 assert.equal(data.assigned_departments.length,2);assert.equal(data.counts.lessons,8);assert.ok(data.lessons.some(l=>l.id==='У-101'));
 assert.equal(data.departments.some(d=>d.label==='История'),false);assert.equal(await readLesson(db,{id:9},'У-109'),null);
 assert.ok(db.queries.every(q=>!/^\s*(INSERT|UPDATE|DELETE)/i.test(q)));
});
test('A33/A47/A54: screen/export/report reuse accepted IDs and exact lesson result',async()=>{
 const db=database();const screen=await readDashboardV3(db,{id:9},1,{period:'all_time',selection:'all',view:'lesson',lesson:'У-101'});
 const report=await readLesson(db,{id:9},'У-101');assert.deepEqual(report.result.final,screen.lesson.result.value);
 assert.deepEqual(report.assessment_ids,screen.lesson.checklists.map(c=>c.assessment_id));
 const exported=await readExportContext(db,{id:9},{project:'1',period:'all_time',selection:'all',view:'teachers',size:'1',page:'2'});
 const table=await readDashboardV3(db,{id:9},1,{period:'all_time',selection:'all',view:'teachers',size:'1',page:'2'});
 assert.equal(exported.teachers.length,table.page.total);assert.equal(exported.aggregation_version,table.aggregation_version);assert.deepEqual(exported.assessment_ids,table.assessment_ids);
});
test('actual delivery status replaces unsent fallback and keeps sender/date',async()=>{
 const db=database(null,{send:true});const data=await readDashboardV3(db,{id:9},1,{period:'all_time',selection:'all'});const lesson=data.lessons.find(l=>l.id==='У-101');
 assert.equal(lesson.report_status,'Отправлено');assert.equal(lesson.report_sender,'Руководитель');assert.ok(lesson.report_sent_at);assert.equal(data.queue.some(l=>l.id==='У-101'),false);
});
test('consistent reads never start a nested transaction on a borrowed client',async()=>{
 const client={release(){},async connect(){throw new Error('Must not connect twice');},async query(){return {rows:[]};}};
 assert.equal(await consistentRead(client,async()=>42),42);
});
test('department assignment administration follows existing permission checks, never department title alone',()=>{
 assert.equal(canManage({id:9,role:'teacher',permissions:[]}),false);assert.equal(canManage({id:9,permissions:['users.manage']}),true);assert.equal(canManage({id:9,role:'admin'}),true);
});
