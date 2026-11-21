export type Status = 'measured'|'not_assessed'|'absent';
export type Source = {file:string;pdf_page?:number|null;excerpt?:string};
export type Skill = {id:string;title:string;topic:string;criterion:string;grade?:number;subject?:string;source?:Source};
export type Task = {id:string;number:string;skill_id:string;topic:string;criterion:string;optional:boolean;source?:Source|null;reviewed:boolean};
export type Spec = {tasks:Task[];skills:Skill[];confirmed:boolean;template_id?:string;source_files?:Source[]};
export type Student = {id:number;public_id?:string;full_name:string;class_id:number;class_title:string;parallel:number};
export type Work = {comment?:string;id:string;title:string;subject:string;grade:number;held_on:string;kind:string;teacher_staff_id:number;teacher_name:string;class_ids:number[];academic_year_id:number;spec_json:Spec;roster_json:Student[];revision:number;created_at:string};
export type Observation = {work_id:string;student_id:number;task_id:string;skill_id:string;status:Status;completion_percent?:number|null;note:string};
export type Template = {skills?:Skill[];origin?:string;revision?:number;can_edit?:boolean;id:string;title:string;subject:string;grade:number;kind:string;variant:string;notice?:string;tasks:Task[];source:{file:string;pdf_pages:number[]}};
export type Bootstrap = {year:{id:number;label:string}|null;years:{id:number;label:string}[];classes:{id:number;title:string;parallel:number}[];students:Student[];teachers:{id:number;full_name:string}[];catalog:{skills:Skill[];templates:Template[];notice:string};works:Work[];observations:Observation[];capabilities:{access:boolean;viewAll:boolean;canManage:boolean;canWrite:boolean;teacherStaffId:number|null;staffIds:number[];mode:string};scope_notice:string;teacher_classes?:{staff_id:number;class_id:number}[];traffic_thresholds?:{redBelow:number;greenFrom:number};skill_links?:Record<string,string>;skill_links_revision?:number;roster_source?:string;retrieved_at?:string;ai?:{provider:string;configured:boolean}};
export type Filters = {grade:string;classId:string;teacherId:string;studentId:string;subject:string;from:string;to:string;workId:string};
export const EMPTY_FILTERS:Filters={grade:'',classId:'',teacherId:'',studentId:'',subject:'',from:'',to:'',workId:''};
export const STATUS_LABEL={measured:'Процент выполнения',not_assessed:'Не проверялось',absent:'Отсутствовал',independent:'100%',supported:'Частично',not_yet:'0%'};
export const mean=(values:number[])=>{if(!values.length)return null;const raw=values.reduce((a,b)=>a+b,0)/values.length;const rounded=Math.round(raw*100)/100;return raw>0&&raw<100?Math.max(0.01,Math.min(99.99,rounded)):rounded;};
export function observationPercent(o:Observation|undefined):number|null {return o?.status==='measured'&&typeof o.completion_percent==='number'&&Number.isFinite(o.completion_percent)&&o.completion_percent>=0&&o.completion_percent<=100?o.completion_percent:null;}
export function filteredWorks(works:Work[],f:Filters) {return works.filter(w=>(!f.grade||Number(w.grade)===Number(f.grade))&&(!f.teacherId||Number(w.teacher_staff_id)===Number(f.teacherId))&&(!f.subject||w.subject===f.subject)&&(!f.from||w.held_on.slice(0,10)>=f.from)&&(!f.to||w.held_on.slice(0,10)<=f.to)&&(!f.workId||w.id===f.workId)&&(!f.classId||w.class_ids.map(Number).includes(Number(f.classId)))&&(!f.studentId||w.roster_json.some(s=>Number(s.id)===Number(f.studentId))));}
export function resolveSkillId(id:string,links:Record<string,string>={}) {const original=id,seen=new Set<string>();while(Object.hasOwn(links,id)){if(seen.has(id))return original;seen.add(id);id=links[id];}return id;}
export function analyze(data:Pick<Bootstrap,'works'|'observations'|'skill_links'>,f:Filters=EMPTY_FILTERS){return summarize(data.works,data.observations,f,data.skill_links);}
export function summarize(works:Work[],observations:Observation[],f:Filters=EMPTY_FILTERS,links:Record<string,string>={}) {
 const selected=filteredWorks(works,f), expected=new Map<string,string>();
 const rows=new Map(observations.map(o=>[`${o.work_id}|${o.student_id}|${o.task_id}`,o]));
 let plannedTasks=0,checkedTasks=0,absentTasks=0;
 const evidence:{work:Work;student:Student;skill:string;percent:number;complete:boolean;checkedTasks:number;plannedTasks:number;status:'independent'|'supported'|'not_yet'}[]=[];
 for(const w of selected)for(const s of w.roster_json){
  if(f.classId&&Number(s.class_id)!==Number(f.classId)||f.studentId&&Number(s.id)!==Number(f.studentId))continue;
  const core=w.spec_json.tasks.filter(t=>!t.optional);
  for(const skill of new Set(core.map(t=>resolveSkillId(t.skill_id,links)))){
   expected.set(`${s.id}|${w.subject}|${w.grade}|${skill}`,skill);
   const tasks=core.filter(t=>resolveSkillId(t.skill_id,links)===skill),values:number[]=[];
   for(const t of tasks){plannedTasks++;const o=rows.get(`${w.id}|${s.id}|${t.id}`),v=observationPercent(o);if(o?.status==='absent')absentTasks++;if(v!==null){values.push(v);checkedTasks++;}}
   const percent=mean(values);if(percent===null)continue;
   evidence.push({work:w,student:s,skill,percent,complete:values.length===tasks.length,checkedTasks:values.length,plannedTasks:tasks.length,status:percent===100?'independent':percent===0?'not_yet':'supported'});
  }
 }
 evidence.sort((a,b)=>a.work.held_on.localeCompare(b.work.held_on)||a.work.created_at.localeCompare(b.work.created_at)||a.work.id.localeCompare(b.work.id));
 const history=new Map<string,typeof evidence>();
 for(const e of evidence){const key=`${e.student.id}|${e.work.subject}|${e.work.grade}|${e.skill}`;history.set(key,[...(history.get(key)||[]),e]);}
 const latest=[...history.values()].map(h=>{
  const last=h[h.length-1],prev=h[h.length-2],comparable=!!prev&&prev.complete&&last.complete;
  const delta=comparable?Math.round((last.percent-prev.percent)*100)/100:null;
  return {...last,stable:comparable&&last.percent===100&&prev.percent===100,previous:prev?.status||null,delta,improved:delta!==null&&delta>0,declined:delta!==null&&delta<0,history:h};
 });
 const count=(status:string)=>latest.filter(e=>e.status===status).length;
 const skills=[...new Set(expected.values())].map(id=>{const ls=latest.filter(e=>e.skill===id);return {id,checked:ls.length,percent:mean(ls.map(e=>e.percent)),independent:ls.filter(e=>e.percent===100).length,supported:ls.filter(e=>e.percent>0&&e.percent<100).length,notYet:ls.filter(e=>e.percent===0).length,expected:[...expected.values()].filter(k=>k===id).length};});
 const timeline=selected.slice().sort((a,b)=>a.held_on.localeCompare(b.held_on)).map(w=>{const e=evidence.filter(e=>e.work.id===w.id);return {id:w.id,title:w.title,date:w.held_on,checked:e.length,percent:mean(e.map(x=>x.percent))};});
 const comparable=latest.filter(e=>e.delta!==null);
 return {works:selected,latest,skills,timeline,expected:expected.size,checked:latest.length,plannedTasks,checkedTasks,absentTasks,unfilledTasks:plannedTasks-checkedTasks-absentTasks,independent:count('independent'),supported:count('supported'),notYet:count('not_yet'),stable:latest.filter(e=>e.stable).length,improved:latest.filter(e=>e.improved).length,declined:latest.filter(e=>e.declined).length,percent:mean(latest.map(e=>e.percent)),coverage:plannedTasks?Math.round(100*checkedTasks/plannedTasks):null,comparable:comparable.length,delta:mean(comparable.map(e=>e.delta!)),assessedStudents:new Set(latest.map(e=>e.student.id)).size,attentionStudents:new Set(latest.filter(e=>e.percent<100).map(e=>e.student.id)).size};
}
