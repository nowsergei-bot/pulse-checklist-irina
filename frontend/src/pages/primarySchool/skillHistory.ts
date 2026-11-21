import {analyze,mean,type Bootstrap,type Filters} from './model.ts';
type Limits={redBelow:number;greenFrom:number};
export const signal=(n:number,t:Limits)=>n<t.redBelow?'red':n<t.greenFrom?'yellow':'green';
export function skillDynamics(data:Bootstrap,filters:Filters,limits:Limits){
 const a=analyze(data,filters);
 const pairs=a.latest.filter(e=>e.delta!==null).map(e=>({current:e,previous:e.history[e.history.length-2],delta:e.delta!,from:signal(e.history[e.history.length-2].percent,limits),to:signal(e.percent,limits)}));
 const persistent=a.latest.filter(e=>e.history.length>=3&&e.history.slice(-3).every(x=>x.complete&&x.percent<limits.greenFrom));
 const repeat=pairs.filter(p=>p.current.work.kind==='repeat');
 const coverage=a.skills.map(s=>{const rows=a.latest.filter(e=>e.skill===s.id);return {...s,repeated:rows.filter(e=>e.history.filter(x=>x.complete).length>=2).length,first:rows.filter(e=>e.history.filter(x=>x.complete).length===1).length,partial:rows.filter(e=>!e.history.some(x=>x.complete)).length,unseen:s.expected-s.checked};});
 return {a,pairs,persistent,repeat,coverage};
}
export function skillTrajectory(a:ReturnType<typeof analyze>,skillId:string){
 const evidence=a.latest.filter(e=>e.skill===skillId).flatMap(e=>e.history).filter(e=>e.complete);
 const works=[...new Map(evidence.map(e=>[e.work.id,e.work])).values()].sort((a,b)=>a.held_on.localeCompare(b.held_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 const byWork=works.map(w=>({work:w,rows:evidence.filter(e=>e.work.id===w.id)}));
 const cohort=byWork.length?byWork[0].rows.map(e=>e.student.id).filter(id=>byWork.every(w=>w.rows.some(e=>e.student.id===id))):[];
 const points=byWork.map(w=>({work:w.work,percent:mean(w.rows.filter(e=>cohort.includes(e.student.id)).map(e=>e.percent)),count:cohort.length}));
 return {points,cohort,availableWorks:works.length};
}

/** One cohort per skill; different subjects/grades never become one line. */
export function allSkillTrajectories(a:ReturnType<typeof analyze>){
 const compare=(x:typeof a.works[number],y:typeof a.works[number])=>x.held_on.localeCompare(y.held_on)||x.created_at.localeCompare(y.created_at)||x.id.localeCompare(y.id);
 const works=a.works.slice().sort(compare);
 const groups=new Map<string,{skillId:string;subject:string;grade:number}>();
 for(const e of a.latest){const key=JSON.stringify([e.work.subject,e.work.grade,e.skill]);
  if(!groups.has(key))groups.set(key,{skillId:e.skill,subject:e.work.subject,grade:e.work.grade});
 }
 const series=[...groups.entries()].map(([key,g])=>{
  const scoped={...a,latest:a.latest.filter(e=>e.skill===g.skillId&&e.work.subject===g.subject&&e.work.grade===g.grade)};
  const trajectory=skillTrajectory(scoped,g.skillId),byWork=new Map(trajectory.points.map(p=>[p.work.id,p]));
  return {key,skillId:g.skillId,subject:g.subject,grade:g.grade,cohort:trajectory.cohort,availableWorks:trajectory.availableWorks,
   points:works.map(w=>({work:w,percent:byWork.get(w.id)?.percent??null,count:byWork.get(w.id)?.count??0}))};
 }).sort((x,y)=>x.subject.localeCompare(y.subject,'ru')||x.grade-y.grade||x.skillId.localeCompare(y.skillId));
 return {works,series};
}
