import {useState} from 'react';
import {primaryCreateSkill} from '../../api/primarySchool';
import {skillMatches} from './skillMatches';
import type {Skill} from './model';
export function ManualSkillForm({skills,initialGrade=1,initialSubject='Математика',fixed=false,preview,onCreated,onUse}:{skills:Skill[];initialGrade?:number;initialSubject?:string;fixed?:boolean;preview:boolean;onCreated:(skill:Skill)=>void;onUse?:(skill:Skill)=>void}){
 const [title,setTitle]=useState(''),[topic,setTopic]=useState(''),[criterion,setCriterion]=useState(''),[grade,setGrade]=useState(initialGrade),[subject,setSubject]=useState(initialSubject),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const g=fixed?initialGrade:grade,sub=fixed?initialSubject:subject;
 const matches=title.trim()?skillMatches({id:'new',title,topic,criterion,grade:g,subject:sub},skills):[];
 async function save(){setBusy(true);setMessage('');try{const value={title:title.trim(),topic:topic.trim(),criterion:criterion.trim(),grade:g,subject:sub};const result=preview?{skill:{...value,id:'custom_'+crypto.randomUUID()}}:await primaryCreateSkill(value);onCreated(result.skill);setTitle('');setTopic('');setCriterion('');setMessage(preview?'Навык добавлен только в локальный пример.':'Навык сохранён в общем справочнике. Он доступен для следующих работ.');}catch(e){setMessage(e instanceof Error?e.message:'Не удалось сохранить навык.');}finally{setBusy(false);}}
 return <details className="ps-manual-skill"><summary>＋ Добавить навык вручную</summary><p className="ps-footnote">Навык сохраняется отдельно от работы и спецификации. Для общей истории используйте его повторно.</p>
  {!fixed&&<div className="ps-link-comparison"><label>Параллель<select value={grade} onChange={e=>setGrade(Number(e.target.value))}>{[1,2,3,4].map(g=><option key={g} value={g}>{g} класс</option>)}</select></label><label>Предмет<input value={subject} maxLength={100} onChange={e=>setSubject(e.target.value)}/></label></div>}
  <label>Название навыка<input value={title} maxLength={250} placeholder="Например, решает задачи на нахождение остатка" onChange={e=>setTitle(e.target.value)}/></label><label>Тема<input value={topic} maxLength={150} placeholder="Текстовые задачи" onChange={e=>setTopic(e.target.value)}/></label><label>Критерий полного выполнения<textarea value={criterion} maxLength={1500} rows={2} placeholder="Что именно должен выполнить ребёнок" onChange={e=>setCriterion(e.target.value)}/></label>
  {!!matches.length&&<div className="ps-match-options"><span>В справочнике уже есть похожие навыки:</span>{matches.map(s=>onUse?<button key={s.id} className="ps-link" onClick={()=>onUse(s)}>Использовать «{s.title}»</button>:<span key={s.id}>{s.title}</span>)}</div>}
  <button className="ps-button" disabled={busy||!title.trim()||!topic.trim()||!criterion.trim()||!sub.trim()} onClick={save}>{busy?'Сохраняю…':'Сохранить навык'}</button>{message&&<p className="ps-notice" role="status">{message}</p>}
 </details>;
}
