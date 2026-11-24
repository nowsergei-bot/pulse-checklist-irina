import test from 'node:test';import assert from 'node:assert/strict';
import {analyze,EMPTY_FILTERS,resolveSkillId,type Work,type Bootstrap,type Observation} from './model.ts';
import {skillDynamics,skillTrajectory,allSkillTrajectories} from './skillHistory.ts';
import {teacherScope} from './teacherScope.ts';
import {skillMatches} from './skillMatches.ts';
const skill=(id:string)=>({id,title:'Сложение в пределах 10',topic:'Счёт',criterion:'Верно складывает',grade:1,subject:'Математика'});
const work=(id:string,skillId='a'):Work=>({id,title:id,held_on:`2026-${id==='one'?'09':id==='two'?'10':'11'}-01`,created_at:id,subject:'Математика',grade:1,kind:id==='three'?'repeat':'control',teacher_staff_id:7,teacher_name:'Учитель',class_ids:[1,2],academic_year_id:1,revision:1,spec_json:{confirmed:true,skills:[skill(skillId)],tasks:[{id:'t',number:'1',skill_id:skillId,topic:'Счёт',criterion:'Верно',optional:false,reviewed:true}]},roster_json:[{id:1,full_name:'Пример 1',class_id:1,class_title:'1А',parallel:1},{id:2,full_name:'Пример 2',class_id:2,class_title:'1В',parallel:1}]});
const obs=(w:string,student:number,value:number):Observation=>({work_id:w,student_id:student,task_id:'t',skill_id:'original',status:'measured',completion_percent:value,note:''});
function data(works:Work[],observations:Observation[]):Bootstrap{return {year:{id:1,label:'2026'},years:[],classes:[{id:1,title:'1А',parallel:1},{id:2,title:'1В',parallel:1}],students:work('one').roster_json,teachers:[],catalog:{skills:[skill('a'),skill('b')],templates:[],notice:''},works,observations,capabilities:{access:true,viewAll:true,canManage:false,canWrite:true,teacherStaffId:7,staffIds:[7],mode:'all'},teacher_classes:[{staff_id:7,class_id:1}],scope_notice:''};}
test('confirmed aliases join different works, never duplicate a skill and are reversible',()=>{
 const d=data([work('one'),work('two','b')],[obs('one',1,25),obs('two',1,100)]);
 assert.equal(analyze(d).comparable,0);d.skill_links={b:'a'};const a=analyze(d);
 assert.equal(a.comparable,1);assert.equal(a.delta,75);assert.equal(a.latest.length,1);assert.equal(a.expected,2);assert.equal(a.skills[0].expected,2);
 d.skill_links={};assert.equal(analyze(d).comparable,0);assert.equal(resolveSkillId('a',{a:'b',b:'a'}),'a');
});
test('different subjects or grades cannot create a matched change even with a reused id',()=>{
 for(const patch of [{grade:2},{subject:'Русский язык'}]){const d=data([work('one'),{...work('two'),...patch}],[obs('one',1,0),obs('two',1,100)]);assert.equal(analyze(d).comparable,0);}
});
test('trajectories keep the same cohort and exclude an unmeasured replacement student',()=>{
 const d=data([work('one'),work('two')],[obs('one',1,20),obs('one',2,100),obs('two',1,60)]);
 const t=skillTrajectory(analyze(d),'a');assert.deepEqual(t.cohort,[1]);assert.deepEqual(t.points.map(p=>p.percent),[20,60]);
 d.observations=[obs('one',2,100),obs('two',1,60)];assert.equal(skillTrajectory(analyze(d),'a').cohort.length,0);
});
test('repeat outcomes and persistent difficulties require complete consecutive checks',()=>{
 const d=data([work('one'),work('two'),work('three')],[obs('one',1,25),obs('two',1,50),obs('three',1,60)]);
 let a=skillDynamics(d,EMPTY_FILTERS,{redBelow:50,greenFrom:75});assert.equal(a.persistent.length,1);assert.equal(a.repeat.length,1);assert.equal(a.repeat[0].delta,10);assert.equal(a.pairs[0].from,'yellow');
 d.works[2].spec_json.tasks.push({...d.works[2].spec_json.tasks[0],id:'unfilled'});a=skillDynamics(d,EMPTY_FILTERS,{redBelow:50,greenFrom:75});assert.equal(a.persistent.length,0);assert.equal(a.repeat.length,0);assert.equal(a.coverage[0].repeated,1);
});
test('own-class view trims mixed-class work snapshots and observations without mutating source',()=>{
 const d=data([work('one')],[obs('one',1,25),obs('one',2,100)]),scoped=teacherScope(d,false);
 assert.deepEqual(scoped.students.map(s=>s.id),[1]);assert.deepEqual(scoped.works[0].class_ids,[1]);assert.equal(scoped.works[0].roster_json.length,1);assert.equal(scoped.observations.length,1);assert.equal(d.works[0].roster_json.length,2);assert.equal(teacherScope(d,true),d);
 d.capabilities.viewAll=false;assert.equal(teacherScope(d,true).students.length,1);
 d.teacher_classes=[];assert.equal(teacherScope(d,false).students.length,0);
});
test('suggested matches never silently bridge numeric difficulty or subjects',()=>{
 const same=skill('b'),harder={...skill('c'),title:'Сложение в пределах 100'},other={...skill('d'),subject:'Русский язык'};
 assert.deepEqual(skillMatches(skill('a'),[same,harder,other]).map(s=>s.id),['b']);
 assert.deepEqual(skillMatches(undefined,[same]),[]);
});

test('all skill lines share the work axis, preserve missing checks and resolved aliases',()=>{
 const d=data([work('one'),work('two','b'),work('three','c')],[obs('one',1,0),obs('two',1,75),obs('three',1,50)]);d.skill_links={b:'a'};
 const chart=allSkillTrajectories(analyze(d));assert.deepEqual(chart.works.map(w=>w.id),['one','two','three']);
 assert.equal(chart.series.length,2);assert.deepEqual(chart.series[0].points.map(p=>p.percent),[0,75,null]);assert.deepEqual(chart.series[1].points.map(p=>p.percent),[null,null,50]);
 d.works[1].subject='Русский язык';assert.equal(allSkillTrajectories(analyze(d)).series.length,3);
});

test('every child keeps every measured skill point, including a lone last-work result and zero',()=>{
 const works=Array.from({length:9},(_,i)=>({...work(String(i),`skill-${i}`),held_on:`2026-11-${String(i+1).padStart(2,'0')}`}));
 const observations=works.flatMap((w,i)=>[obs(w.id,1,i%2?0:100),obs(w.id,2,i%2?100:0)]);
 const d=data(works,observations);
 for(const studentId of ['1','2']){
  const chart=allSkillTrajectories(analyze(d,{...EMPTY_FILTERS,studentId}));
  assert.equal(chart.series.length,9);
  for(const series of chart.series){
   const measured=series.points.filter(p=>p.percent!==null);assert.equal(measured.length,1);
   const source=observations.find(o=>o.work_id===measured[0].work.id&&o.student_id===Number(studentId))!;
   assert.equal(measured[0].percent,source.completion_percent);assert.equal(measured[0].count,1);
   assert.equal(series.points.filter(p=>p.percent===null).length,8);
  }
 }
});
