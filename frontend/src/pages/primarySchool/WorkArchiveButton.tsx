import {useEffect,useRef,useState} from 'react';
import {primaryArchiveWork} from '../../api/primarySchool';
import type {Work,Observation} from './model';

export function WorkArchiveButton({work,observations,blocked=false,onArchived}:{work:Work;observations:Observation[];blocked?:boolean;onArchived:(id:string)=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 const scores=observations.filter(o=>o.work_id===work.id&&o.status==='measured');
 async function archive(){
  if(busy||blocked)return;setBusy(true);setError('');
  try{const result=await primaryArchiveWork(work.id,work.revision,work.title);setOpen(false);onArchived(result.work_id);}
  catch(e){setError(e instanceof Error?e.message:'Не удалось удалить работу.');}
  finally{setBusy(false);}
 }
 return <>
  <button className="ps-button ps-work-delete" disabled={blocked||busy} title={blocked?'Сначала сохраните результаты и комментарий':undefined} onClick={()=>{setError('');setOpen(true);}}>Удалить работу</button>
  <dialog ref={dialog} className="ps-exclude-dialog" aria-label={`Удалить работу «${work.title}»?`} onCancel={e=>{e.preventDefault();if(!busy)setOpen(false);}}>
   <h2>Удалить работу целиком?</h2><p><strong>{work.title}</strong></p>
   <dl className="ps-work-delete-details"><dt>Дата работы</dt><dd>{new Date(work.held_on.slice(0,10)+'T12:00:00').toLocaleDateString('ru-RU')}</dd><dt>Классы</dt><dd>{[...new Set(work.roster_json.map(s=>s.class_title))].join(', ')}</dd><dt>Учитель</dt><dd>{work.teacher_name}</dd><dt>Введено результатов</dt><dd>{scores.length} · учеников с оценками: {new Set(scores.map(o=>o.student_id)).size}</dd><dt>Создана</dt><dd>{new Date(work.created_at).toLocaleString('ru-RU')}</dd></dl>
   <p>Эта работа исчезнет из списка и всей аналитики. Её задания и результаты сохранятся в истории системы. Остальные работы останутся без изменений.</p>
   {error&&<p className="ps-error" role="alert">{error}</p>}
   <div className="ps-exclude-actions"><button className="ps-button" autoFocus disabled={busy} onClick={()=>setOpen(false)}>Отмена</button><button className="ps-button ps-work-delete" disabled={busy||blocked} onClick={archive}>{busy?'Удаляю…':'Да, удалить работу'}</button></div>
  </dialog>
 </>;
}
