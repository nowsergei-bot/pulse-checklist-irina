import {useState} from 'react';
import {primaryAddStudent,primaryMoveStudent} from '../../api/primarySchool';
import type {Bootstrap,Student} from './model';
export function StudentRosterEditor({data,allClasses,action,preview,onClose,onChanged}:{data:Bootstrap;allClasses:Bootstrap['classes'];action:'new'|number;preview:boolean;onClose:()=>void;onChanged:(student:Student)=>void}){
 const student=action==='new'?null:data.students.find(s=>s.id===action);
 const allowed=allClasses.filter(c=>action!=='new'||data.capabilities.canManage||(data.teacher_classes||[]).some(x=>data.capabilities.staffIds.includes(Number(x.staff_id))&&Number(x.class_id)===c.id));
 const [name,setName]=useState(''),[classId,setClassId]=useState(action==='new'&&allowed.length===1?String(allowed[0].id):''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){if(!data.year)return;setBusy(true);setError('');try{const target=allClasses.find(c=>c.id===Number(classId));if(!target)throw new Error('Выберите класс.');
  const body={year_id:data.year.id,class_id:target.id,confirmed};
  const result=preview?{student:{...(student||{id:-Date.now(),full_name:name.trim()}),class_id:target.id,class_title:target.title,parallel:target.parallel}}:student?await primaryMoveStudent(student.id,{...body,from_class_id:student.class_id}):await primaryAddStudent({...body,full_name:name});
  onChanged(result.student);onClose();
 }catch(e){setError(e instanceof Error?e.message:'Не удалось изменить список.');}finally{setBusy(false);}}
 return <div className="ps-roster-backdrop"><section className="ps-roster-modal" role="dialog" aria-modal="true" aria-labelledby="primary-roster-title"><div className="ps-card-heading"><h2 id="primary-roster-title">{student?'Перенести ученика':'Добавить ученика'}</h2><button className="ps-button" aria-label="Закрыть изменение списка" onClick={onClose} disabled={busy}>×</button></div>
  {student?<p><strong>{student.full_name}</strong><br/>Текущий класс: {student.class_title}</p>:<label>Фамилия, имя и отчество<input autoFocus value={name} maxLength={250} onChange={e=>setName(e.target.value)} placeholder="Полное имя ученика"/></label>}
  <label>{student?'Новый класс':'Класс'}<select value={classId} onChange={e=>{setClassId(e.target.value);setConfirmed(false);}}><option value="">Выберите класс</option>{allowed.filter(c=>c.id!==student?.class_id).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
  <p className="ps-notice">Это общий список с английской аналитикой. Уже проведённые работы сохранят прежний состав. Английские группы назначаются отдельно.</p>
  {student&&classId&&<p><strong>{student.class_title} → {allClasses.find(c=>c.id===Number(classId))?.title}</strong></p>}
  <label className="ps-link-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Подтверждаю {student?'перенос':'добавление'} ученика в выбранный класс.</label>
  {error&&<p role="alert" className="ps-error">{error}</p>}<div className="ps-inline-actions"><button className="ps-button" disabled={busy} onClick={onClose}>Отмена</button><button className="ps-button primary" disabled={busy||!classId||!confirmed||(!student&&!name.trim())} onClick={save}>{busy?'Сохраняю…':student?'Перенести ученика':'Добавить ученика'}</button></div>
 </section></div>;
}
