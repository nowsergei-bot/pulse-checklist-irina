import type {Skill} from './model';
const normalize=(s:string)=>s.toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function skillMatches(source:Skill|undefined,skills:Skill[]){
 if(!source)return [];
 const text=normalize(source.title),tokens=new Set(text.split(' ').filter(x=>x.length>2)),numbers=text.match(/\d+/g)?.join('|')||'';
 return skills.filter(s=>s.id!==source.id&&s.grade===source.grade&&s.subject===source.subject).map(s=>{
  const value=normalize(s.title),nums=value.match(/\d+/g)?.join('|')||'';
  const words=new Set(value.split(' ').filter(x=>x.length>2));
  const overlap=[...tokens].filter(w=>words.has(w)).length;
  const score=numbers!==nums?0:text===value?1:overlap/Math.max(1,new Set([...tokens,...words]).size);
  return {skill:s,score};
 }).filter(x=>x.score>=0.3).sort((a,b)=>b.score-a.score).slice(0,4).map(x=>x.skill);
}
