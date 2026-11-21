import type {Skill,Template} from './model';

export type LibrarySkill=Skill & {author?:string;checks?:string[];evidence?:string;adaptation?:boolean;source?:Skill['source'] & {url?:string;note?:string}};
export type LibraryTemplate=Template & {source:Template['source'] & {url?:string}};
export type LibrarySelection={subject:string;grade:string;topic:string;query:string};
const normalized=(value:string)=>value.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
export function curriculumScope(skills:LibrarySkill[],templates:LibraryTemplate[],selection:LibrarySelection){
 const base=skills.filter(s=>(!selection.subject||s.subject===selection.subject)&&(!selection.grade||s.grade===Number(selection.grade)));
 const query=normalized(selection.query);
 const matches=(s:LibrarySkill)=>!query||normalized([s.title,s.topic,s.criterion,s.author,s.source?.file].join(' ')).includes(query);
 const topics=[...new Set(base.map(s=>s.topic))].sort((a,b)=>a.localeCompare(b,'ru')).map(topic=>({topic,count:base.filter(s=>s.topic===topic&&matches(s)).length}));
 const visible=base.filter(s=>(!selection.topic||s.topic===selection.topic)&&matches(s));
 const byId=new Map(skills.map(s=>[s.id,s]));
 const related=templates.filter(t=>{
  if(selection.subject&&t.subject!==selection.subject||selection.grade&&t.grade!==Number(selection.grade))return false;
  if(selection.topic&&!t.tasks.some(task=>byId.get(task.skill_id)?.topic===selection.topic))return false;
  return !query||normalized([t.title,t.notice,t.source.file].join(' ')).includes(query)||t.tasks.some(task=>{const skill=byId.get(task.skill_id);return !!skill&&matches(skill);});
 });
 return {skills:visible,templates:related,topics,total:base.length};
}
export function safeCurriculumUrl(value?:string,page?:number|null){
 if(!value)return undefined;
 try{const url=new URL(value);if(url.protocol!=='https:')return undefined;if(page&&/\.pdf$/i.test(url.pathname))url.hash=`page=${page}`;return url.href;}catch{return undefined;}
}
export function curriculumPage<T>(items:T[],requested:number,size=8){
 const pages=Math.max(1,Math.ceil(items.length/size));const page=Math.max(1,Math.min(pages,requested));
 return {page,pages,items:items.slice((page-1)*size,page*size)};
}
