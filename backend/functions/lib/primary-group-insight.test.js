const test=require('node:test');const assert=require('node:assert/strict');
const {groupEvidence,generateGroupInsight}=require('./primary-group-insight');
const skills=[{id:'a',title:'Сложение до 10'},{id:'b',title:'Другая формулировка'}];
const works=['one','two'].map((id,i)=>({id,title:'Закрытое название работы',held_on:`2026-${i+10}-01`,created_at:id,grade:1,subject:'Математика',roster_json:[{id:1,full_name:'Секретное имя'},{id:2,full_name:'Ещё одно имя'}],spec_json:{skills,tasks:[{id:'task',skill_id:i?'b':'a'}]}}));
const rows=works.flatMap((w,i)=>[1,2].map(id=>({work_id:w.id,task_id:'task',student_id:id,status:'measured',completion_percent:i?100:50})));
test('aggregate evidence joins aliases, compares matched children and contains no names',()=>{
 const packet=groupEvidence(works,rows,{b:'a'},skills,{entity:'class'});
 assert.equal(packet.evidence.length,1);assert.equal(packet.evidence[0].assessed_students,2);assert.equal(packet.evidence[0].matched_rechecks,2);assert.equal(packet.evidence[0].mean_change_pp,50);assert.equal(packet.evidence[0].mean_percent,100);
 const serialized=JSON.stringify(packet);for(const text of ['Секретное имя','Ещё одно имя','Закрытое название','student_id','full_name'])assert.ok(!serialized.includes(text));
 assert.equal(groupEvidence(works,rows,{},skills).evidence[0].matched_rechecks,0);
});
test('group results respect scoped rosters and never treat missing checks as zero',()=>{
 const scoped=works.map(w=>({...w,roster_json:[w.roster_json[0]]}));const packet=groupEvidence(scoped,rows,{b:'a'},skills);
 assert.equal(packet.summary.students,1);assert.equal(packet.evidence[0].assessed_students,1);
 const empty=groupEvidence(scoped,[],{b:'a'},skills);assert.equal(empty.evidence.length,0);
 const partial=structuredClone(scoped);partial[1].spec_json.tasks.push({id:'missing',skill_id:'b'});
 const p=groupEvidence(partial,rows,{b:'a'},skills).evidence[0];assert.equal(p.partial_students,1);assert.equal(p.matched_rechecks,0);assert.equal(p.mean_change_pp,null);
});
test('GigaChat produces a cited narrative and unsupported references are rejected',async()=>{
 const packet=groupEvidence(works,rows,{b:'a'},skills),raw={conclusion:[{text:'Есть положительная динамика.',evidence_refs:['g1']}],strengths:[],attention:[],dynamics:[],next_steps:[],limitations:'Две проверки.'};
 let payload;
 const result=await generateGroupInsight(packet,null,'teacher',{chat:async(messages)=>{payload=JSON.parse(messages[1].content);return {ok:true,text:JSON.stringify(raw)};}});
 assert.equal(result.conclusion.text,raw.conclusion[0].text);assert.equal(payload.entity,'teacher');assert.equal(payload.evidence[0].mean_change_pp,50);assert.ok(!JSON.stringify(payload).includes('full_name'));
 raw.conclusion[0].evidence_refs=['invented'];await assert.rejects(()=>generateGroupInsight(packet,null,'class',{chat:async()=>({ok:true,text:JSON.stringify(raw)})}),/не связан/);
 assert.equal((await generateGroupInsight({evidence:[]},null)).status,'no_data');
});
