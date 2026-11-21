import {useEffect,useRef,useState} from 'react';
import {primaryGroupInsight,type PrimaryGroupInsight} from '../../api/primarySchool';
import {analyze,type Bootstrap,type Filters} from './model';
export function EntityInsight({data,filters,entity:requestedEntity,workId,preview=false,onWork}:{data:Bootstrap;filters:Filters;entity?:'overview'|'class'|'grade'|'teacher'|'work'|'skill';workId?:string;preview?:boolean;onWork:(id:string)=>void}){
 const [result,setResult]=useState<PrimaryGroupInsight|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[skillId,setSkillId]=useState('');
 const entity=workId?'work':requestedEntity|| (filters.teacherId?'teacher':filters.classId?'class':filters.grade?'grade':'overview');
 const labels={overview:'По выбранному срезу',teacher:'По результатам учителя',class:'По классу',grade:'По параллели',work:'По работе',skill:'По навыку'};
 const a=analyze(data,{...filters,workId:workId||filters.workId});
 const selected=entity==='skill'?(a.skills.some(s=>s.id===skillId)?skillId:a.skills[0]?.id||''):'';
 const classIds=data.classes.filter(c=>(!filters.grade||c.parallel===Number(filters.grade))&&(!filters.classId||c.id===Number(filters.classId))).map(c=>c.id);
 const key=JSON.stringify([entity,selected,filters,workId,classIds,data.year?.id,data.skill_links_revision,data.works.map(w=>[w.id,w.revision])]);
 const current=useRef(key);current.current=key;
 useEffect(()=>{setResult(null);setError('');setBusy(false);},[key]);
 async function generate(){const requestKey=key;if(!data.year)return;setBusy(true);setError('');try{
  if(preview)throw new Error('В локальном примере показаны вымышленные результаты. Общий вывод GigaChat доступен в Пульсе по сохранённым работам.');
  const answer=await primaryGroupInsight({entity,year_id:data.year.id,class_ids:classIds,grade:filters.grade,subject:filters.subject,teacher_id:filters.teacherId,from:filters.from,to:filters.to,work_id:workId||filters.workId,skill_id:selected});
  if(current.current===requestKey)setResult(answer);
 }catch(e){if(current.current===requestKey)setError(e instanceof Error?e.message:'Не удалось подготовить вывод.');}finally{if(current.current===requestKey)setBusy(false);}}
 const refs=(ids:string[])=>ids.map(ref=>{const e=result?.evidence?.find(e=>e.ref===ref);return e?<span key={ref} className="ps-ai-reference"><strong>{e.skill}</strong>{e.work_ids?.slice(0,3).map(id=><button key={id} className="ps-link" onClick={()=>onWork(id)}>{data.works.find(w=>w.id===id)?.title||'Открыть работу'} ↗</button>)}</span>:null;});
 return <section className="ps-ai ps-entity-insight"><div className="ps-card-heading"><div><span className="ps-eyebrow">GIGACHAT · ТЕКСТОВАЯ АНАЛИТИКА</span><h2>{labels[entity]}</h2></div><button className="ps-button primary" disabled={busy||!a.checked} onClick={generate}>{busy?'Готовлю вывод…':'✦ Подготовить вывод'}</button></div>
  {entity==='skill'&&<label>Навык для вывода<select value={selected} onChange={e=>setSkillId(e.target.value)}>{a.skills.map(s=><option key={s.id} value={s.id}>{data.catalog.skills.find(k=>k.id===s.id)?.title||s.id}</option>)}</select></label>}
  <p className="ps-footnote">Связный вывод, динамика, зоны внимания и следующие шаги по выбранным фильтрам. В GigaChat передаются агрегированные результаты без имён детей и учителей. Вывод проверяет педагог.</p>
  {!a.checked&&<p>Для вывода пока нет сохранённых результатов.</p>}{error&&<p className="ps-error" role="alert">{error}</p>}
  {result&&<>{result.message&&<p className="ps-notice">{result.message}</p>}{result.conclusion&&<div className="ps-analytic-conclusion"><h3>Аналитический вывод</h3><p>{result.conclusion.text}</p><div>{refs(result.conclusion.evidence_refs)}</div></div>}
   <div className="ps-ai-grid">{([['strengths','Что получается'],['attention','Зоны внимания'],['dynamics','Динамика'],['next_steps','Следующие шаги']] as const).map(([id,title])=><div key={id}><h4>{title}</h4>{result[id]?.length?result[id]!.map((x,i)=><div key={i} className="ps-ai-item"><p>{x.text}</p><div>{refs(x.evidence_refs)}</div></div>):<p className="ps-footnote">Недостаточно наблюдений.</p>}</div>)}</div>
   {result.limitations&&<p className="ps-notice">{result.limitations}</p>}{!!result.summary?.omitted_skills&&<p className="ps-notice">В вывод вошли {result.summary.skills_in_report} из {result.summary.skills_with_results} навыков. Сузьте фильтры для остальных.</p>}<p className="ps-footnote">Черновик GigaChat{result.generated_at?` · ${new Date(result.generated_at).toLocaleString('ru-RU')}`:''}{result.cached?' · по неизменившимся данным':''}</p>
  </>}
 </section>;
}
