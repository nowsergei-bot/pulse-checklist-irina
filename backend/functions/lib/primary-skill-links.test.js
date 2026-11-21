const test=require('node:test');const assert=require('node:assert/strict');
const {changeSkillLink,resolveSkillId,collectSkills,validateManualSkill}=require('./primary-skill-links');
const {studentEvidence}=require('./primary-school-ai');
const skills=[{id:'custom_first',title:'Первое название',topic:'Счёт',criterion:'До 10',grade:1,subject:'Математика'},{id:'custom_second',title:'Другое название',topic:'Счёт',criterion:'До 10',grade:1,subject:'Математика'},{id:'custom_third',title:'Основное название',topic:'Счёт',criterion:'До 10',grade:1,subject:'Математика'}];
const link=(source,target,links={},ss=skills)=>changeSkillLink(links,{source_id:source,target_id:target,confirmed:true},ss);
test('links are reversible, transitive and never change original skill records',()=>{
 const before=JSON.stringify(skills);const a=link('custom_first','custom_second'),b=link('custom_second','custom_third',a);
 assert.equal(resolveSkillId('custom_first',b),'custom_third');
 assert.equal(resolveSkillId('custom_first',link('custom_second',null,b)),'custom_second');
 assert.equal(JSON.stringify(skills),before);assert.deepEqual(a,{custom_first:'custom_second'});
});
test('cycles, unknown targets, different grades or subjects and unreviewed links are rejected',()=>{
 assert.throws(()=>link('custom_second','custom_first',{custom_first:'custom_second'}),/круг/);
 assert.throws(()=>link('custom_first','missing'),/существующий/);
 for(const patch of [{grade:2},{subject:'Русский язык'}])assert.throws(()=>link('custom_first','custom_second',{},[skills[0],{...skills[1],...patch}]),/предмета/);
 assert.throws(()=>changeSkillLink({},{source_id:'custom_first',target_id:'custom_second'},skills),/Подтвердите/);
 assert.equal(resolveSkillId('a',{a:'b',b:'a'}),'a');
});
test('manual skills require useful reusable metadata and registry includes unscheduled templates',()=>{
 assert.throws(()=>validateManualSkill({...skills[0],criterion:''}),/Заполните/);
 assert.equal(validateManualSkill(skills[0]).title,skills[0].title);
 const result=collectSkills([{skills:[skills[0]]},{spec_json:{skills:[skills[0],skills[1]]}}]);
 assert.equal(result.filter(s=>s.id==='custom_first').length,1);assert.ok(result.some(s=>s.id==='custom_second'));
});
test('AI uses linked evidence across works and averages linked tasks only once',()=>{
 const works=['a','b'].map((id,i)=>({id,held_on:`2026-${String(i+9).padStart(2,'0')}-01`,created_at:`2026-${String(i+9).padStart(2,'0')}-01`,subject:'Математика',grade:1,roster_json:[{id:1}],spec_json:{skills,tasks:[{id:'1',skill_id:i?'custom_second':'custom_first'},{id:'2',skill_id:'custom_first'}]}}));
 const rows=works.flatMap((w,i)=>[1,2].map(id=>({work_id:w.id,task_id:String(id),student_id:1,status:'measured',completion_percent:i?100:25})));
 const packet=studentEvidence(works,rows,1,{custom_first:'custom_second'},skills);
 assert.equal(packet.evidence.length,2);assert.equal(packet.summary.skills,1);assert.equal(packet.evidence[0].percent,25);assert.equal(packet.evidence[1].percent,100);assert.equal(packet.evidence[1].planned,2);assert.equal(packet.evidence[0].skill,'Другое название');
 assert.notEqual(packet.hash,studentEvidence(works,rows,1,{},skills).hash);
});
