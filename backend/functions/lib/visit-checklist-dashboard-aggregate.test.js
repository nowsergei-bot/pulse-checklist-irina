'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const controls=require('./fixtures/pulse-v3/controls.json');
const expected=require('./fixtures/pulse-v3/expected.json');
const {aggregateDashboard}=require('./visit-checklist-dashboard-aggregate');
const score=require('./pulse-v3-score');
function dataset(){const roster=Object.entries(controls.roster).flatMap(([department,ids])=>ids.map(id=>({id,label:`Учитель ${id}`,departments:[department]})));return {project:{id:1,title:'Тест'},records:structuredClone(controls.records),lessons:structuredClone(controls.lessons).map(l=>({...l,id:l.lesson_id,teacher_label:`Учитель ${l.teacher_id}`,department_id:l.department})),roster,adjustments:[]};}
const all={period:'all_time',selection:'all'};
test('A01/A03/A04/A05/A06/A46/A51/A52: controls preserve counts and hierarchical exact averages',()=>{
 const d=aggregateDashboard(dataset(),all);
 assert.equal(d.counts.lessons,expected.counts.lessons);assert.equal(d.counts.observations,expected.counts.observations);assert.equal(d.counts.self_analyses,expected.counts.self_analyses);assert.equal(d.counts.teachers,expected.counts.visited_teachers);
 for(const [id,groups] of Object.entries(expected.teachers)){for(const [key,t] of Object.entries(groups.groups)){if(!t.mean)continue;const row=d.teachers.find(r=>r.id===id&&r.result.maximum===t.maximum);assert.deepEqual(row.result.value,t.mean);}}
 const lesson=aggregateDashboard(dataset(),{...all,lesson:'У-101',view:'lesson'}).lesson;
 assert.deepEqual(lesson.result.value,{numerator:64,denominator:1});
 assert.equal(lesson.checklists.filter(c=>c.source==='self_analysis')[0].result.value.numerator,78);
 assert.equal(lesson.criteria.find(c=>c.code==='5.3').attention,false);
 assert.equal(lesson.criteria.find(c=>c.code==='3.8').display,'1,5');
});
test('A14/A16: risk includes every low lesson even when teacher average is high, unique lesson counts',()=>{
 const d=aggregateDashboard(dataset(),{...all,selection:'risk',view:'teachers'});
 assert.equal(new Set(d.teachers.map(t=>t.id)).size,expected.counts.risk_teachers);
 const criterion=aggregateDashboard(dataset(),all).criteria.find(c=>c.code==='5.3'&&c.group_maximum===100);
 const expectedLessons=expected.lessons.filter(l=>l.result.maximum===100&&l.result.final&&l.result.criteria['5.3']&&score.attention(l.result.criteria['5.3'],9));
 assert.equal(criterion.below_count,expectedLessons.length);
});
test('A09/A12/A13: incomplete lessons remain in coverage without a zero or invented maximum',()=>{
 const d=aggregateDashboard(dataset(),all);
 assert.equal(d.counts.incomplete,1);assert.equal(d.teachers.find(t=>t.id==='Г').result.value,null);
 assert.ok(d.groups.some(g=>g.maximum===97));assert.ok(d.groups.some(g=>g.maximum===100));
});
test('A20: observer comparison uses their own result, never the lesson average',()=>{
 const d=aggregateDashboard(dataset(),{...all,view:'observers'});
 for(const o of d.observers)assert.equal(o.match+o.mismatch+o.incomplete+o.no_selected,o.observation_count);
 const details=d.observer_details.filter(o=>o.lesson_id==='У-101');assert.equal(details.length,2);
 assert.deepEqual(details.map(o=>o.result.value.numerator),[62,66]);
});
test('A21/A22: calculated-level/risk filters preserve every complete lesson in each teacher mean',()=>{
 const base=aggregateDashboard(dataset(),all);
 const filtered=aggregateDashboard(dataset(),{...all,level:'Высокий',selection:'risk',view:'teachers'});
 for(const row of filtered.teachers)assert.deepEqual(row.result.value,base.teachers.find(t=>t.id===row.id&&t.result.maximum===row.result.maximum).result.value);
});
test('A01/A02: three current observers are one lesson; an old revision never multiplies observations',()=>{
 const pack=dataset();const first=pack.records.find(r=>r.checklist.source==='observation');
 pack.records.push({...structuredClone(first),assessment_id:'third',checklist:{...structuredClone(first.checklist),checklist_id:'third',author_id:'third'}});
 pack.records.push({...structuredClone(first),assessment_id:'old',checklist:{...structuredClone(first.checklist),revision:0}});
 const detail=aggregateDashboard(pack,{...all,lesson:'У-101',view:'lesson'}).lesson;
 assert.equal(detail.observation_count,3);assert.equal(detail.checklists.filter(c=>c.source==='observation').length,3);
});
test('A06: gymnasium average equals reference teacher-weighted exact fraction, each department matches reference',()=>{
 const d=aggregateDashboard(dataset(),all);
 for(const [maximum,group] of Object.entries(expected.department_groups['Гимназия']))assert.deepEqual(d.groups.find(g=>g.maximum===Number(maximum)).value,group.mean);
 for(const dept of d.departments)for(const group of dept.groups)assert.deepEqual(group.value,expected.department_groups[dept.label][group.maximum].mean);
});
test('A14: teacher В keeps high mean and remains in risk for lesson У-104',()=>{
 const d=aggregateDashboard(dataset(),{...all,view:'teachers',selection:'risk'});const teacher=d.teachers.find(t=>t.id==='В');
 assert.equal(teacher.result.level,'Высокий');assert.equal(teacher.risk,true);assert.deepEqual(teacher.risk_lessons.map(l=>l.id),['У-104']);
});
test('criterion count opens exactly low lessons, while mean drill-down selects teacher criterion means',()=>{
 const base=aggregateDashboard(dataset(),all);const cell=base.criteria.find(c=>c.code==='5.3'&&c.group_maximum===100);
 const details=aggregateDashboard(dataset(),{...all,view:'lessons',criterion:'5.3',criterion_mode:'lessons',maximum:'100'});
 assert.equal(details.lessons.length,cell.below_count);assert.ok(details.lessons.every(l=>score.attention(expected.lessons.find(e=>e.lesson_id===l.id).result.criteria['5.3'],9)));
});
test('A30: pagination does not alter selection context and internal export returns all rows',()=>{
 const page=aggregateDashboard(dataset(),{...all,view:'teachers',size:'1'});const full=aggregateDashboard(dataset(),{...all,view:'teachers',size:'1'},undefined,{paginate:false});
 assert.equal(page.teachers.length,1);assert.equal(full.teachers.length,page.page.total);assert.equal(page.aggregation_version,full.aggregation_version);assert.deepEqual(page.assessment_ids,full.assessment_ids);
});
