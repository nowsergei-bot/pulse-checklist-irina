'use strict';
const {catalog}=require('./primary-school');
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
function resolveSkillId(id,links={}) {
 const original=id,seen=new Set();
 while(Object.hasOwn(links,id)&&typeof links[id]==='string'){
  if(seen.has(id))return original;
  seen.add(id);id=links[id];
 }
 return id;
}
function collectSkills(records=[]) {
 const skills=new Map(catalog.skills.map(s=>[s.id,s]));
 for(const w of records)for(const s of (w.skills||w.spec_json?.skills||[])){
  if(!/^custom_[a-z0-9_-]{3,80}$/.test(s.id||'')||!s.title||skills.has(s.id))continue;
  skills.set(s.id,{id:s.id,title:String(s.title).slice(0,250),topic:String(s.topic||'').slice(0,150),criterion:String(s.criterion||'').slice(0,1500),grade:Number(s.grade||w.grade),subject:String(s.subject||w.subject||'').slice(0,100)});
 }
 return [...skills.values()];
}
async function readSkillCatalog(pool){
 const manual=(await pool.query('SELECT id,title,topic,criterion,grade,subject FROM primary_skills ORDER BY created_at,id')).rows;
 const templates=(await pool.query("SELECT spec_json->'skills' AS skills,grade,subject FROM primary_templates ORDER BY created_at,id")).rows;
 const works=(await pool.query("SELECT spec_json->'skills' AS skills,grade,subject FROM primary_works ORDER BY created_at,id")).rows;
 return collectSkills([{skills:manual},...templates,...works]);
}
function validateManualSkill(b){
 const clean=(v,n)=>typeof v==='string'&&v.trim()&&v.trim().length<=n?v.trim():'';
 const title=clean(b.title,250),topic=clean(b.topic,150),criterion=clean(b.criterion,1500),subject=clean(b.subject,100),grade=Number(b.grade);
 if(!title||!topic||!criterion||!subject||![1,2,3,4].includes(grade))fail('Заполните название, тему, критерий, предмет и параллель навыка.');
 return {title,topic,criterion,subject,grade};
}
function changeSkillLink(links,input,skills){
 if(input.confirmed!==true)fail('Подтвердите одинаковый смысл и уровень сложности навыков.');
 const source=skills.find(s=>s.id===input.source_id),target=skills.find(s=>s.id===input.target_id);
 if(!source)fail('Исходный навык не найден в общем справочнике.');
 const next={...links};
 if(input.target_id===null){delete next[source.id];return next;}
 if(!target||target.id===source.id)fail('Выберите другой существующий навык.');
 if(!source.grade||source.grade!==target.grade||!source.subject||source.subject!==target.subject)fail('Объединять можно только навыки одного предмета и одной параллели. Разную сложность оставьте отдельно.');
 next[source.id]=target.id;
 if(Object.keys(next).length>2000)fail('Достигнут предел связей справочника.');
 for(const start of Object.keys(next)){
  const seen=new Set();let id=start;
  while(Object.hasOwn(next,id)){if(seen.has(id))fail('Эта связь создаст круг. Выберите основной навык без обратной связи.');seen.add(id);id=next[id];}
 }
 return next;
}
module.exports={resolveSkillId,collectSkills,readSkillCatalog,changeSkillLink,validateManualSkill};
