import {useEffect,useRef,useState} from 'react';
import {primaryExcludeTask} from '../../api/primarySchool';
import {type Work,type Observation,type Spec,type Task,STATUS_LABEL} from './model';
import {HorizontalTable} from './HorizontalTable';

export function WorkSpecification({work,observations,readOnly,blocked,onChanged}:{work:Work;observations:Observation[];readOnly:boolean;blocked:boolean;onChanged:(spec:Spec,revision:number)=>void}){
 const [selected,setSelected]=useState<Task|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(selected)dialog.current?.showModal();else dialog.current?.close();},[selected]);
 async function exclude(){
  if(!selected||busy||readOnly||blocked)return;
  setBusy(true);setError('');
  try{const result=await primaryExcludeTask(work.id,work.revision,selected.id);onChanged(result.spec,result.revision);setNotice(`Задание № ${selected.number} исключено. Аналитика пересчитана, введённые результаты сохранены в истории.`);setSelected(null);}
  catch(e){setError(e instanceof Error?e.message:'Не удалось исключить задание.');}
  finally{setBusy(false);}
 }
 const archive=work.spec_json.excluded_tasks||[];
 return <section>
  {notice&&<p className="ps-notice" role="status">{notice}</p>}
  {!readOnly&&<p className="ps-footnote">{blocked?'Сначала сохраните внесённые результаты и комментарий.':'Можно исключить лишнее задание для всех учеников этой работы. Введённые оценки сохранятся в истории и перестанут влиять на аналитику.'}{work.spec_json.tasks.length===1&&' В работе должно остаться хотя бы одно задание.'}</p>}
  <div className="ps-read-spec">{work.spec_json.tasks.map(t=><div key={t.id}>
   <b>№ {t.number}{t.optional?' ★':''}</b><strong>{work.spec_json.skills.find(s=>s.id===t.skill_id)?.title||t.skill_id}</strong><p>{t.criterion}</p>
   <span className="ps-source">{t.source?.file||'Источник указывает учитель'}{t.source?.pdf_page?` · PDF, с. ${t.source.pdf_page}`:''}</span>
   {!readOnly&&<button className="ps-button" disabled={blocked||busy||work.spec_json.tasks.length<=1} onClick={()=>{setError('');setSelected(t);}}>Исключить задание № {t.number}</button>}
  </div>)}</div>
  {archive.length>0&&<details className="ps-excluded-tasks"><summary>Исключённые задания ({archive.length})</summary><p>Эти результаты сохранены для истории и не участвуют в расчётах.</p>{archive.map(({task,excluded_at})=>{
   const rows=observations.filter(o=>o.work_id===work.id&&o.task_id===task.id);
   return <section key={task.id}><h3>Задание № {task.number} · исключено {new Date(excluded_at).toLocaleDateString('ru-RU')}</h3><p>{task.criterion}</p>
    {rows.length?<HorizontalTable label={`История задания ${task.number}`}><table><thead><tr><th>Ребёнок</th><th>Сохранённый результат</th><th>Комментарий</th></tr></thead><tbody>{rows.map(o=><tr key={o.student_id}><td>{work.roster_json.find(s=>Number(s.id)===Number(o.student_id))?.full_name||'Ученик из состава работы'}</td><td>{o.status==='measured'?`${o.completion_percent}%`:STATUS_LABEL[o.status]}</td><td>{o.note||'—'}</td></tr>)}</tbody></table></HorizontalTable>:<p>Результаты по этому заданию не вводились.</p>}
   </section>;
  })}</details>}
  <dialog ref={dialog} className="ps-exclude-dialog" aria-labelledby="ps-exclude-title" onCancel={e=>{e.preventDefault();if(!busy)setSelected(null);}}>
   <h2 id="ps-exclude-title">Исключить задание № {selected?.number}?</h2><p><strong>{work.title}</strong></p><p>{selected?.criterion}</p>
   <p>Задание перестанет учитываться у всех учеников этой работы. Проценты выполнения и аналитика пересчитаются. Введённые результаты останутся в разделе «Исключённые задания».</p>
   {error&&<p className="ps-error" role="alert">{error}</p>}
   <div className="ps-exclude-actions"><button className="ps-button" autoFocus disabled={busy} onClick={()=>setSelected(null)}>Отмена</button><button className="ps-button primary" disabled={busy||blocked||readOnly} onClick={exclude}>{busy?'Исключаю…':'Подтвердить исключение'}</button></div>
  </dialog>
 </section>;
}
