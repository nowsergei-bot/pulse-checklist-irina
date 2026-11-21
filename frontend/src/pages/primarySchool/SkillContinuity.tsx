import {useMemo,useState} from 'react';
import {primaryLinkSkill} from '../../api/primarySchool';
import {resolveSkillId,type Bootstrap,type Filters,type Skill} from './model';
import {skillMatches} from './skillMatches';
import './skillDynamics.css';

export function SkillContinuity({data,filters,preview,onLinked}:{data:Bootstrap;filters:Filters;preview:boolean;onLinked:(links:Record<string,string>,revision:number)=>void}){
 const links=data.skill_links||{};
 const skills=useMemo(()=>[...new Map([...data.catalog.skills,...data.works.flatMap(w=>w.spec_json.skills)].map(s=>[s.id,s])).values()],[data]);
 const [query,setQuery]=useState(''),[sourceId,setSourceId]=useState(''),[targetId,setTargetId]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const source=skills.find(s=>s.id===sourceId),target=skills.find(s=>s.id===targetId);
 const visible=skills.filter(s=>(!filters.grade||s.grade===Number(filters.grade))&&(!filters.subject||s.subject===filters.subject)&&`${s.title} ${s.topic}`.toLowerCase().includes(query.toLowerCase()));
 const targets=source?skills.filter(s=>s.id!==source.id&&s.grade===source.grade&&s.subject===source.subject&&resolveSkillId(s.id,links)===s.id):[];
 const matches=source?skillMatches(source,targets):[];
 const affected=data.works.filter(w=>w.spec_json.tasks.some(t=>resolveSkillId(t.skill_id,links)===sourceId||t.skill_id===sourceId));
 async function save(clear=false){
  if(!source||(!clear&&!target)||!confirmed)return;
  setBusy(true);setMessage('');
  try{
   const result=preview?{skill_links:{...links},revision:(data.skill_links_revision||1)+1}:await primaryLinkSkill({source_id:source.id,target_id:clear?null:targetId,revision:data.skill_links_revision||1,confirmed});
   if(preview){if(clear)delete result.skill_links[source.id];else result.skill_links[source.id]=targetId;}
   onLinked(result.skill_links,result.revision);setConfirmed(false);
   setMessage(preview?'Связь применена только в локальном примере.':clear?'Связь отменена. Исходные результаты сохранены.':'История объединена. Дашборды и выводы ИИ используют общий навык.');
  }catch(e){setMessage(e instanceof Error?e.message:'Не удалось сохранить связь.');}finally{setBusy(false);}
 }
 return <article className="ps-card ps-continuity"><div className="ps-card-heading"><div><span className="ps-eyebrow">ЕДИНЫЙ СПРАВОЧНИК</span><h2>Один навык в разных работах</h2></div><span className="ps-pill">{Object.keys(links).length} связей</span></div>
  <p>Свяжите разные формулировки одного умения. Контрольная, самостоятельная и повторная проверка попадут в общую историю ребёнка. Исходные задания, проценты и источники сохраняются.</p>
  <p className="ps-footnote">Объединяйте одинаковый смысл и уровень сложности. Сложение до 10 и до 100 остаются отдельными навыками; общую картину по ним смотрите в темах. Связь действует для всего раздела и может быть отменена.</p>
  {data.capabilities.canManage?<>
   <label>Найти навык<input placeholder="Название или тема" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <div className="ps-link-form"><label>Формулировка из работ<select value={sourceId} onChange={e=>{setSourceId(e.target.value);setTargetId('');setConfirmed(false);setMessage('');}}><option value="">Выберите навык</option>{[...new Map([...visible,...(source?[source]:[])].map(s=>[s.id,s])).values()].map(s=><option key={s.id} value={s.id}>{s.title} · {s.grade} кл. · {s.subject}</option>)}</select></label>
   <span aria-hidden="true">→</span><label>Основной навык для общей истории<select value={targetId} onChange={e=>{setTargetId(e.target.value);setConfirmed(false);}} disabled={!source}><option value="">Выберите соответствующий навык</option>{targets.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label></div>
   {source&&<><p className="ps-footnote">В доступном периоде затронуто работ: {affected.length}. {affected.slice(0,4).map(w=>w.title).join(' · ')}{links[source.id]&&<> Сейчас связано с «{skills.find(s=>s.id===resolveSkillId(source.id,links))?.title||resolveSkillId(source.id,links)}».</>}</p>
    {!!matches.length&&!target&&<div className="ps-match-options"><span>Похожие формулировки — проверьте смысл:</span>{matches.map(s=><button key={s.id} className="ps-link" onClick={()=>{setTargetId(s.id);setConfirmed(false);}}>{s.title} →</button>)}</div>}
    <div className="ps-link-comparison"><SkillDescription skill={source}/>{target&&<SkillDescription skill={target}/>}</div>
    <label className="ps-link-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Я сверил(а) смысл, сложность и критерии. Подтверждаю изменение связи в общем справочнике.</label>
    <div className="ps-inline-actions"><button className="ps-button primary" disabled={busy||!target||!confirmed} onClick={()=>save()}>{busy?'Сохраняю…':'Объединить историю'}</button>{links[source.id]&&<button className="ps-button" disabled={busy||!confirmed} onClick={()=>save(true)}>Отменить связь</button>}</div>
   </>}
  </>:<p className="ps-notice">Общие связи подтверждает методист. В спецификации новой работы выберите существующий навык — история продолжится автоматически.</p>}
  {message&&<p role="status" className="ps-notice">{message}</p>}
  {!!Object.keys(links).length&&<details><summary>Подтверждённые связи ({Object.keys(links).length})</summary><div className="ps-table-wrap"><table><thead><tr><th>Формулировка из работы</th><th>Общая история</th></tr></thead><tbody>{Object.keys(links).map(id=><tr key={id}><td>{skills.find(s=>s.id===id)?.title||id}</td><td>{skills.find(s=>s.id===resolveSkillId(id,links))?.title||resolveSkillId(id,links)}</td></tr>)}</tbody></table></div></details>}
 </article>;
}
function SkillDescription({skill}:{skill:Skill}){return <div><strong>{skill.title}</strong><small>{skill.subject} · {skill.grade} класс · {skill.topic}</small><p>{skill.criterion||'Проверьте критерий в исходной спецификации.'}</p></div>;}
