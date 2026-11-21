const test=require('node:test');
const assert=require('node:assert/strict');
const {catalog,capabilities,validateSpec,validateRows,suggestSpecification}=require('./primary-school');
const teacher={id:1,full_name:'Учитель Тестовый Первый',department:'Кафедра начального образования',position_actual:'Учитель начального образования'};
test('primary teachers see all initially, only assigned classes after switch; unrelated admins are denied',()=>{
 assert.equal(capabilities({email:'test@school'},[teacher]).viewAll,true);
 const restricted=capabilities({},[teacher],'own',[42]);assert.equal(restricted.access,true);assert.equal(restricted.viewAll,false);assert.deepEqual(restricted.classIds,[42]);
 assert.equal(capabilities({role:'admin',permissions:['*']},[]).access,false);
 assert.equal(capabilities({display_name:'Томонова Анна Викторовна'},[]).access,false);
 assert.equal(capabilities({},[{...teacher,full_name:'Томонова Анна Викторовна'}],'own').viewAll,true);
 assert.equal(capabilities({},[{...teacher,full_name:'Шилина Ольга Николаевна'}],'own').viewAll,true);
 assert.equal(capabilities({},[{...teacher,position_actual:'Ассистент',position_staff:'Ассистент'}]).access,false);
});
test('all source templates require deliberate teacher confirmation and contain valid skill links',()=>{
 for(const template of catalog.templates){
  assert.throws(()=>validateSpec({tasks:template.tasks}),/подтвердите/);
  assert.throws(()=>validateSpec({tasks:template.tasks,confirmed:true}),/Сверьте/);
  const spec=validateSpec({tasks:template.tasks.map(t=>({...t,reviewed:true})),confirmed:true});
  assert.ok(spec.skills.length);assert.equal(spec.tasks.length,template.tasks.length);
 }
});
test('foreign students/tasks and invented mastery states cannot be recorded',()=>{
 const work={roster_json:[{id:4}],spec_json:{tasks:[{id:'t1',skill_id:'math1_patterns'}]}};
 assert.throws(()=>validateRows(work,[{student_id:5,task_id:'t1',status:'independent'}]),/не относится/);
 assert.throws(()=>validateRows(work,[{student_id:4,task_id:'t2',status:'independent'}]),/не относится/);
 assert.throws(()=>validateRows(work,[{student_id:4,task_id:'t1',status:'5'}]),/состояние/);
 const rows=validateRows(work,[{student_id:4,task_id:'t1',skill_id:'forged',status:'absent'}]);assert.equal(rows[0].skill_id,'math1_patterns');
});
test('scan or unsupported grade does not invent an extracted specification',()=>{
 assert.deepEqual(suggestSpecification([{page:1,text:''}],1).suggestions,[]);
 assert.deepEqual(suggestSpecification([{page:1,text:'Реши уравнения. Сравни числа.'}],3).suggestions,[]);
 const x=suggestSpecification([{page:7,file:'work.pdf',text:'Реши уравнения. Сравни числа.'}],1);
 assert.equal(x.suggestions.length,2);assert.equal(x.suggestions[0].source.pdf_page,7);assert.equal(x.suggestions[0].reviewed,false);
});
test('percent entry preserves exact custom values, rejects out-of-range and false missing values',()=>{
 const w={roster_json:[{id:1}],spec_json:{tasks:[{id:'a',skill_id:'s'}]}};
 for(const n of [0,25,50,75,100,62.5])assert.equal(validateRows(w,[{student_id:1,task_id:'a',status:'measured',completion_percent:n}])[0].completion_percent,n);
 for(const n of [-1,101,NaN,Infinity,null,'50'])assert.throws(()=>validateRows(w,[{student_id:1,task_id:'a',status:'measured',completion_percent:n}]),/процент/);
 assert.throws(()=>validateRows(w,[{student_id:1,task_id:'a',status:'absent',completion_percent:0}]),/процент/);
});


test('Russian source tables preserve task counts, grades and separately assessed advanced tasks',()=>{
 const skills=new Map(catalog.skills.map(s=>[s.id,s]));
 assert.equal(skills.size,catalog.skills.length);
 for(const [grade,count,advanced] of [[1,13,[5,8,11]],[2,20,[4,5,8,11,16]],[3,26,[3,7,13,18,24]],[4,28,[3,6,7,10,16,21]]]){
  const t=catalog.templates.find(t=>t.id===`ru${grade}_annual_2`);
  assert.equal(t.tasks.length,count);
  assert.deepEqual(t.tasks.filter(x=>x.optional).map(x=>Number(x.number)),advanced);
  for(const x of t.tasks){assert.equal(skills.get(x.skill_id).grade,grade);assert.equal(skills.get(x.skill_id).subject,'Русский язык');assert.equal(x.source.file,'РЯ_Программа.pdf');}
 }
 const partial=catalog.templates.find(t=>t.id==='ru1_literacy_1_v2');
 assert.equal(partial.tasks.length,2);assert.match(partial.notice,/неполная/);
});
