import DepartmentAssignments from './DepartmentAssignments';
import {useCabinetProfile} from '../../lib/cabinet/profile';
import VisitReportSend from '../../components/visitReportDelivery/VisitReportSend';
import { downloadVisitReportExcel } from '../../api/visitReportDelivery';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getVisitChecklistV3 } from '../../api/visitChecklistV3';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import defaultNames from './names.json';
const NamesContext=createContext(defaultNames);
const HiddenContext=createContext<string[]>([]);
import { dashboardQuery, exactText, navigateContext, shiftedWeek } from './context';
import type { Checklist, Criterion, Dashboard, Lesson, Result, Teacher } from './types';
import './dashboard.css';

type Go = (updates: Record<string, string | null>) => void;

const count = (value: number | undefined) => value == null ? '—' : value;
function ResultCell({ result, go }: { result: Result; go?: Go }) {
 return <span title={`Точное значение: ${exactText(result.value)}; версия: ${result.policy}`}>
  {result.value == null ? result.status : <><strong>{result.display}</strong> из {result.maximum}</>}
  {result.level && <small>{go ? <button className="pv3-link" onClick={() => go({ view: 'teachers', level: result.level, maximum: String(result.maximum), policy: result.policy, teacher: null, lesson: null })}>{result.level}</button> : result.level}</small>}
 </span>;
}
function Table({ headers, children, caption }: { headers: string[]; children: ReactNode; caption?: string }) {
 return <div className="pv3-tablewrap" tabIndex={0} aria-label={caption || headers[0]}><table>{caption && <caption>{caption}</caption>}<thead><tr>{headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
function Empty({ children = 'В выбранном отборе данных нет.' }: { children?: ReactNode }) { return <p className="pv3-empty">{children}</p>; }
function CriterionCell({ row }: { row: Criterion }) {
 return <span className={row.attention ? 'pv3-attention' : ['Высокий','Очень высокий'].includes(row.relative_level||'')?'pv3-good':''} title={`Точное среднее: ${exactText(row.value)}. Оценённых уроков: ${row.lesson_count}. Неоценённых записей: ${row.unassessed_count}`}>
 {row.value == null ? row.status==='not_applicable'?'Не применимо':'Не оценено' : `${row.display} из ${row.maximum}`}{row.attention && <small>Требует внимания</small>}</span>;
}
function CriteriaTable({ rows, go, title }: { rows: Criterion[]; go: Go; title: string }) {
 if (!rows.length) return <Empty />;
 const departments = rows[0]?.departments || [];
 return <Table caption={title} headers={['Код и название', 'Максимум', 'Среднее', ...departments.map(d => d.label), 'Оценённых уроков', 'Уроков ниже порога', 'Неоценённых записей']}>
 {rows.map((row,i) => <tr key={`${row.code}:${row.policy}:${row.group_maximum}:${i}`}><th scope="row"><button className="pv3-link" onClick={() => go({view:'teachers', criterion:row.code, criterion_mode:'mean', maximum:row.group_maximum?String(row.group_maximum):null,policy:row.policy||null, teacher:null, lesson:null})}>{row.code.includes('.') ? `${row.code} ` : ''}{row.title}</button>{row.group_maximum && <small>Максимум {row.group_maximum} · {row.policy}</small>}</th><td>{row.maximum ?? 'Без балла'}</td><td><CriterionCell row={row}/></td>
 {departments.map(d => { const cell = row.departments?.find(v => v.id === d.id); return <td key={d.id}><button className="pv3-link" onClick={() => go({view:'teachers',department:d.id,criterion:row.code,criterion_mode:'mean',maximum:row.group_maximum?String(row.group_maximum):null,policy:row.policy||null,teacher:null,lesson:null})}>{cell?.display ?? '—'}</button></td>; })}
 <td>{row.lesson_count}</td><td><button className="pv3-link" onClick={() => go({view:'lessons',criterion:row.code,criterion_mode:'lessons',maximum:row.group_maximum?String(row.group_maximum):null,policy:row.policy||null,teacher:null,lesson:null})}>{row.below_count}</button></td><td>{row.unassessed_count}</td></tr>)}
 </Table>;
}
function LessonsTable({ rows, go }: { rows: Lesson[]; go: Go }) {
 if (!rows.length) return <Empty />;
 return <Table headers={['Урок', 'Учитель', 'Кафедра', 'Класс · предмет · тема', 'Наблюдений', 'Итог урока', 'Общая оценка 10.1', 'Самоанализ', 'Статус отчёта']}>
 {rows.map(row => <tr key={row.id}><td><button className="pv3-link" onClick={() => go({view:'lesson',lesson:row.id,teacher:row.teacher_id})}>{row.date || 'Дата не указана'} · {row.id}</button>{row.unlinked && <small>Неподвязанный старый урок</small>}</td><td><button className="pv3-link" onClick={() => go({view:'teacher',teacher:row.teacher_id,lesson:null})}>{row.teacher_label}</button></td><td>{row.department}</td><td>{row.class_name} · {row.subject}<small>{row.topic}</small></td><td>{row.observation_count}</td><td><ResultCell result={row.result}/></td><td>{row.selected_levels.join('; ') || 'Общая оценка не выбрана'}</td><td>{row.self_count || 'Нет самоанализа'}</td><td>{row.report_status || 'Статус недоступен'}<small>{row.report_sent_at} {row.report_sender}</small></td></tr>)}
 </Table>;
}
function TeacherRowsTable({ rows, go }: { rows: Teacher[]; go: Go }) {
 const names=useContext(NamesContext);
 if (!rows.length) return <Empty />;
 return <Table headers={['Место', 'Учитель', 'Кафедра', 'Средний итог', 'Нужна методическая поддержка', 'Уроков', 'Наблюдений', 'Самоанализов', ...Object.values(names.blocks).slice(0,9)]}>
 {rows.map((row,i) => <tr key={`${row.id}:${row.result.policy}:${row.result.maximum}:${i}`}><td>{row.rank ?? '—'}</td><th scope="row"><button className="pv3-link" onClick={() => go({view:'teacher',teacher:row.id,lesson:null})}>{row.label}</button></th><td>{row.departments.join(', ')}</td><td><ResultCell result={row.result} go={go}/></td><td>{row.risk ? <button className="pv3-link" onClick={() => go({view:'teacher',teacher:row.id,teacher_tab:'lessons',lesson:null})}>Нужна методическая поддержка</button> : '—'}</td><td>{row.lesson_count}</td><td>{row.observation_count}</td><td>{row.self_count}</td>{Object.keys(names.blocks).slice(0,9).map(code => <td key={code}>{row.blocks.find(b => b.code === code) ? <CriterionCell row={row.blocks.find(b => b.code === code)!}/> : '—'}</td>)}</tr>)}
 </Table>;
}
function TeachersTable({ rows, go }: { rows: Teacher[]; go: Go }) {
 if (!rows.length) return <Empty />;
 const keys=[...new Set(rows.map(row=>row.result.value==null?row.result.status:`${row.result.policy}:${row.result.maximum}`))];
 return <>{keys.map(key=>{const group=rows.filter(row=>(row.result.value==null?row.result.status:`${row.result.policy}:${row.result.maximum}`)===key);const result=group[0].result;return <section key={key}><h2>{result.value==null?result.status:`Максимум ${result.maximum}`}</h2>{result.value!=null && <p>Версия оценивания: {result.policy}</p>}<TeacherRowsTable rows={group} go={go}/></section>;})}</>;
}
function ChecklistValue({ checklist, code }: { checklist: Checklist; code: string }) {
 const item = checklist.items.find(i => i.code === code); const answer = checklist.answers[code];
 const raw = [...(answer?.selected_options || []).map(o => o.label), answer?.text].filter(Boolean).join('\n');
 return <details><summary>{item?.status === 'descriptive' ? raw || 'Нет ответа' : item?.score != null ? `${item.score} из ${item.maximum}` : item?.status === 'not_applicable' ? 'Не применимо' : 'Не оценено'}</summary><p className="pv3-fulltext">{raw || 'Нет исходного ответа'}</p><p>{item?.status}</p>{item?.reason && <p>{item.reason}</p>}{item?.evidence?.map((e,i) => <blockquote key={i}>{e.quote}</blockquote>)}</details>;
}
function LessonView({ data, go }: { data: Dashboard; go: Go }) {
 const names=useContext(NamesContext);
 const lesson = data.lesson; if (!lesson) return <Empty>Урок недоступен в выбранном отборе.</Empty>;
 const observers = lesson.checklists.filter(c => c.source === 'observation');
 const self = lesson.checklists.filter(c => c.source === 'self_analysis');
 const items = {...names.scored_criteria, ...names.descriptive_criteria};
 return <><VisitReportSend lessonId={lesson.id} aggregationVersion={data.aggregation_version}/><h2>{lesson.date} · {lesson.teacher_label} · {lesson.class_name}</h2><p>{lesson.department} · {lesson.subject} · {lesson.topic} · ID {lesson.id}</p><button className="pv3-link" onClick={() => go({view:'teacher',teacher:lesson.teacher_id,lesson:null})}>Карточка учителя</button><p><ResultCell result={lesson.result}/></p>
 <Table caption={names.sections.all_items} headers={['Пункт', 'Максимум', ...observers.map(c => `${c.author} · ${c.id} · редакция ${c.revision}`), 'Среднее', ...self.map(c => `Самоанализ · ${c.id}`), 'Разница']}>
 {Object.entries(names.blocks).map(([block,title]) => <BlockRows key={block} block={block} title={title} items={items} lesson={lesson} observers={observers} self={self}/>)}
 <tr><th scope="row">Корректировка за кабинет</th><td colSpan={observers.length + self.length + 4}>{lesson.adjustment} · {lesson.adjustment_reason || 'Нет подтверждённой корректировки'}</td></tr>
 <tr><th scope="row">Итог</th><td>—</td>{observers.map(c => <td key={c.id}><ResultCell result={c.result}/></td>)}<td><ResultCell result={lesson.result}/></td>{self.map(c => <td key={c.id}><ResultCell result={c.result}/></td>)}<td>Только сопоставимые результаты</td></tr></Table>
 <h2>{names.sections.full_comments}</h2>{lesson.checklists.map(c => <article key={c.id}><h3>{c.author} · {c.id} · редакция {c.revision}</h3><p>Версия формы: {c.form_version}; оценка: {c.assessment_id || 'Не принята'}; политика: {c.result.policy}</p>{['10.2','10.3'].map(code => <div key={code}><h4>{code} {items[code as keyof typeof items]}</h4><p className="pv3-fulltext">{c.answers[code]?.text || 'Текст не заполнен'}</p></div>)}</article>)}</>;
}
function BlockRows({block,title,items,lesson,observers,self}: {block:string;title:string;items:Record<string,string>;lesson:NonNullable<Dashboard['lesson']>;observers:Checklist[];self:Checklist[]}) {
 return <><tr className="pv3-block"><th colSpan={observers.length+self.length+4}>{title}</th></tr>{Object.entries(items).filter(([code]) => code.split('.')[0] === block).sort(([a],[b]) => Number(a.split('.')[1])-Number(b.split('.')[1])).map(([code,label]) => {
 const criterion = lesson.criteria.find(c => c.code === code); const difference = lesson.differences.find(d => d.code === code)?.difference;
 return <tr key={code}><th scope="row">{code} {label}</th><td>{criterion?.maximum ?? 'Без балла'}</td>{observers.map(c => <td key={c.id}><ChecklistValue checklist={c} code={code}/></td>)}<td>{criterion?.maximum != null ? <CriterionCell row={criterion}/> : 'Без балла'}</td>{self.map(c => <td key={c.id}><ChecklistValue checklist={c} code={code}/></td>)}<td>{exactText(difference)}</td></tr>;
 })}</>;
}
function TeacherView({data,go,tab}: {data:Dashboard;go:Go;tab:string}) {
 const names=useContext(NamesContext);
 const teacher=data.teacher; if (!teacher) return <Empty>Учитель недоступен в выбранном отборе.</Empty>;
 return <><h2>{teacher.label} · {teacher.departments.join(', ')}</h2><div className="pv3-metrics">{teacher.groups.map((r,i) => <div key={i}><ResultCell result={r}/><small>{r.lesson_count} уроков</small></div>)}</div>
 <nav aria-label="Карточка учителя">{Object.entries(names.teacher_tabs).map(([key,label]) => <button key={key} className={tab===key?'active':''} onClick={() => go({teacher_tab:key})}>{label}</button>)}</nav>
 {tab==='criteria' ? <><CriteriaTable title={names.teacher_tabs.criteria} rows={teacher.criteria} go={go}/>{Boolean(teacher.partial_criteria?.length) && <><h3>Частичные данные · вне рейтинга полных итогов</h3><CriteriaTable title="Известные баллы неполных уроков" rows={teacher.partial_criteria!} go={go}/></>}<h3>{names.sections.teacher_attention}</h3><CriteriaTable title={names.sections.teacher_attention} rows={teacher.criteria.filter(c=>c.attention)} go={go}/><LessonsTable rows={teacher.lessons.filter(l=>l.attention.length)} go={go}/></> : tab==='dynamics' ? <Table headers={['Период','Итог','Уроков','Изменение в баллах']}>{teacher.dynamics.map((d,i)=><tr key={i}><th scope="row">{d.period}</th><td><ResultCell result={d.result}/></td><td>{d.result.lesson_count}</td><td>{exactText(d.change)}</td></tr>)}</Table> : <LessonsTable rows={teacher.lessons} go={go}/>}</>;
}
function Summary({data,go}: {data:Dashboard;go:Go}) {
 const hidden=useContext(HiddenContext);const visible=(id:string)=>!hidden.includes(id);
 const names=useContext(NamesContext);
 return <><div className="pv3-metrics">{[['lessons',names.metrics.lessons],['observations',names.metrics.observations],['self_analyses',names.metrics.self_analyses],['teachers',names.metrics.teachers],['complete','Сформировано итогов'],['incomplete','Итог не сформирован'],['self_only','Только самоанализы']].map(([key,label]) => <div key={key}><strong>{count(data.counts[key as keyof Dashboard['counts']])}</strong><span>{label}</span></div>)}</div>
 <p>Охват: {data.counts.teachers} из {data.counts.roster_teachers} учителей. Неподвязанных записей: {data.counts.unlinked}.</p><h2>{names.metrics.school_average}</h2><div className="pv3-metrics">{data.groups.map((r,i)=><div key={i}><ResultCell result={r} go={go}/><small>{r.teacher_count} учителей · {r.lesson_count} уроков</small></div>)}</div>{!data.groups.length && <Empty>Нет сформированных итогов. Посещения сохраняются в счётчиках.</Empty>}
 {visible('weekly_comparison') && data.weekly_comparison && <><h2>Еженедельная сводка</h2><p>Предыдущая неделя: {data.previous_week?.from} — {data.previous_week?.to}</p><Table headers={['Максимум · версия','Текущая неделя','Предыдущая неделя','Изменение в баллах']}>{data.weekly_comparison.map((row,i)=><tr key={i}><td>{row.current.maximum} · {row.current.policy}</td><td><ResultCell result={row.current}/><small>{row.current.lesson_count} уроков</small></td><td>{row.previous?<><ResultCell result={row.previous}/><small>{row.previous.lesson_count} уроков</small></>:'Нет сопоставимых данных'}</td><td>{exactText(row.change)}</td></tr>)}</Table></>}<h2>Результаты по кафедрам</h2><Departments data={data} go={go}/>{visible('report_queue')&&<><h2>Очередь отчётов к отправке</h2><LessonsTable rows={data.queue} go={go}/></>}{visible('block_results')&&<CriteriaTable title={names.sections.block_results} rows={data.blocks} go={go}/>}<p>10. Общая оценка — описательный блок, в сумму не входит. Средние рассчитаны из точных данных; сумма округлённых ячеек может отличаться от округлённого итога.</p>
 {visible('priorities')&&<><h2>{names.sections.priorities}</h2><CriteriaTable title={names.sections.priorities} rows={data.criteria.filter(c=>c.attention)} go={go}/></>}
 {visible('risk')&&<><h2><button className="pv3-link" onClick={()=>go({view:'teachers',selection:'risk',teacher:null,lesson:null})}>{names.sections.risk} · {data.counts.risk_teachers}</button></h2>
 {!data.risk.length ? <Empty>За выбранный период уроков ниже порога не обнаружено. Несформированных итогов: {data.counts.incomplete}.</Empty> : data.risk.map((t,i)=><article key={`${t.id}:${i}`}><h3><button className="pv3-link" onClick={()=>go({view:'teacher',teacher:t.id,lesson:null})}>{t.label}</button> · {t.departments.join(', ')}</h3><ResultCell result={t.result}/><p>{t.lesson_count} уроков</p><LessonsTable rows={t.risk_lessons} go={go}/>{t.risk_lessons.map(l=><p key={l.id}>{l.id}: {l.attention.map(c=>`${c.code} ${c.title}: ${c.display} из ${c.maximum}`).join('; ') || 'Низкие критерии не выявлены'}</p>)}</article>)}</>}
 </>;
}
function Departments({data,go}: {data:Dashboard;go:Go}) {
 return <Table headers={['Кафедра','Руководитель кафедры','Посещено учителей','Уроков','Наблюдений','Самоанализов','Средние по группам','Нужна методическая поддержка','Итог не сформирован']}>
 {data.departments.map(d=><tr key={d.id}><th scope="row"><button className="pv3-link" onClick={()=>go({view:'teachers',department:d.id,teacher:null,lesson:null})}>{d.label}</button></th><td>{d.leaders.join(', ') || 'Не назначен'}</td><td>{d.visited_teachers} из {d.total_teachers}</td><td>{d.lesson_count}</td><td>{d.observation_count}</td><td>{d.self_count}</td><td>{d.groups.map((r,i)=><p key={i}><ResultCell result={r}/></p>)}</td><td><button className="pv3-link" onClick={()=>go({view:'teachers',department:d.id,selection:'risk',teacher:null,lesson:null})}>{d.risk_count}</button></td><td>{d.incomplete_count}</td></tr>)}
 </Table>;
}
function Observers({data,go}: {data:Dashboard;go:Go}) {
 const names=useContext(NamesContext);
 return <><h2>{names.sections.observer_comparison}</h2><Table headers={['Наблюдатель','Наблюдений','Совпадает','Отличается','Итог не сформирован','Общая оценка не выбрана']}>{data.observers.map(o=><tr key={o.id}><th scope="row"><button className="pv3-link" onClick={()=>go({observer:o.id})}>{o.label}</button></th><td>{o.observation_count}</td><td>{o.match}</td><td>{o.mismatch}</td><td>{o.incomplete}</td><td>{o.no_selected}</td></tr>)}</Table>
 <h2>{names.sections.mismatches}</h2><Table headers={['Наблюдатель','Урок','Чек-лист · редакция','Итог чек-листа','Ответ 10.1','Сопоставленный уровень','Статус']}>{data.observer_details.map(o=><tr key={`${o.id}:${o.revision}`}><td>{o.author}</td><td><button className="pv3-link" onClick={()=>go({view:'lesson',lesson:o.lesson_id,teacher:o.teacher_id})}>{o.teacher_label} · {o.date} · {o.lesson_id}</button></td><td>{o.id} · {o.revision}<small>{o.assessment_id}</small></td><td><ResultCell result={o.result}/></td><td>{o.selected_level || 'Не выбрана'}</td><td>{o.mapped_level || '—'}</td><td>{o.comparison}</td></tr>)}</Table><h2>{names.sections.same_lesson_observers}</h2><Table headers={['Урок','Итоги','Разница',names.sections.differing_criteria]}>{data.observer_comparisons.map(row=><tr key={row.lesson_id}><td><button className="pv3-link" onClick={()=>go({view:'lesson',lesson:row.lesson_id,teacher:row.teacher_id})}>{row.teacher_label} · {row.date} · {row.lesson_id}</button></td><td>{row.totals.map((t,i)=><p key={i}>{t.author}: <ResultCell result={t.result}/></p>)}</td><td>{exactText(row.difference)}</td><td>{row.criteria.map(c=><p key={c.code}>{c.code} {c.title}: {c.scores.map(s=>s??'Не оценено').join('; ')} из {c.maximum}</p>)}</td></tr>)}</Table><p>Ответ 10.1 сравнивается с итогом собственного чек-листа наблюдателя. Расхождение не является автоматическим доказательством ошибки.</p></>;
}
export default function VisitChecklistV3Dashboard() {
 const {user}=useCabinetProfile(); const canManage=['admin','assistant_director'].includes(user?.role||'')||user?.permissions?.includes('users.manage')||user?.permissions?.includes('*');
 const [params,setParams]=useSearchParams(); const key=dashboardQuery(params).toString(); const view=params.get('view') || 'summary';
 const [response,setResponse]=useState<{key:string;data:Dashboard}|null>(null); const [error,setError]=useState<{key:string;message:string}|null>(null); const [retry,setRetry]=useState(0); const [exportBusy,setExportBusy]=useState(false); const [exportError,setExportError]=useState('');
 useEffect(()=> { let active=true; const abort=new AbortController(); setError(null);
  void getVisitChecklistV3(new URLSearchParams(key),abort.signal).then(data=>{if(active)setResponse({key,data});}).catch(e=>{if(active)setError({key,message:e instanceof Error?e.message:'Не удалось загрузить аналитику.'});});
  return ()=>{active=false;abort.abort();};
 },[key,retry]);
 const data=response?.key===key?response.data:null; const issue=error?.key===key?error.message:null;
 const names=data?.interface?.names||defaultNames;
 useDocumentTitle(names.screens[view as keyof typeof names.screens]||names.screens.summary); const tabs=Object.entries(names.navigation);
 const visible=(id:string)=>!data?.interface?.hidden.includes(id);
 const go:Go=updates=>setParams(navigateContext(params,updates));
 const filter=(name:string,value:string)=>go({[name]:value,view:view==='lesson'?'lessons':view==='teacher'?'teachers':view,teacher:null,lesson:null});
 const options=data?.options || {};
 const select=(name:string,label:string,values:{id:string;label:string}[]) => <label key={name}>{label}<select value={params.get(name)||''} onChange={e=>filter(name,e.target.value)}><option value="">Все</option>{values.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>;
 async function excel(kind:'full'|'branded'|'table') { setExportBusy(true);setExportError('');try{await downloadVisitReportExcel(dashboardQuery(params),kind);}catch(e){setExportError(e instanceof Error?e.message:'Ошибка выгрузки');}finally{setExportBusy(false);} }
 const title=view==='teachers' && params.get('department')?names.screens.department_teachers:view==='teacher'?names.screens.teacher:view==='lesson'?names.screens.lesson:names.screens[view as keyof typeof names.screens] || names.screens.summary;
 return <NamesContext.Provider value={names}><HiddenContext.Provider value={data?.interface?.hidden||[]}><section className="pv3" aria-busy={!data&&!issue}><header><p>ПУЛЬС · аналитика посещений уроков</p><h1>{title}</h1><details><summary>Скачать в Excel</summary><button disabled={!data||exportBusy} onClick={()=>void excel('table')}>Текущая таблица</button><button disabled={!data||exportBusy} onClick={()=>void excel('branded')}>{names.exports.branded}</button><button disabled={!data||exportBusy} onClick={()=>void excel('full')}>{names.exports.full}</button></details>{exportBusy && <p role="status">Готовим выгрузку…</p>}{exportError && <p role="alert">{exportError}</p>}</header>
 {canManage && <details><summary>Доступ к аналитике</summary><DepartmentAssignments projectId={data?.project?.id||Number(params.get('project'))||undefined} onChange={()=>setRetry(v=>v+1)}/></details>}<nav aria-label="Аналитика посещений">{tabs.map(([id,label])=><button key={id} className={view===id?'active':''} onClick={()=>go({view:id,teacher:null,lesson:null,criterion:null,criterion_mode:null})}>{label}</button>)}</nav>
 <div className="pv3-filters"><label>Период<select value={params.get('period')||'week'} onChange={e=>filter('period',e.target.value)}>{Object.entries({week:names.filters.week,month:names.filters.month,quarter:names.filters.quarter,school_year:names.filters.school_year,all_time:names.filters.all_time,custom:names.filters.custom}).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
 {['custom','quarter'].includes(params.get('period')||'') && <><label>С<input type="date" value={params.get('from')||''} onChange={e=>filter('from',e.target.value)}/></label><label>По<input type="date" value={params.get('to')||''} onChange={e=>filter('to',e.target.value)}/></label></>}
 {select('department',names.screens.departments,options.departments||[])}{select('teacher_filter','Учитель',options.teachers||[])}{select('class','Класс',options.classes||[])}{select('subject','Предмет',options.subjects||[])}{select('format','Формат посещения',[{id:'offline',label:'Очно'},{id:'online',label:'Онлайн'}])}{select('level',names.filters.calculated_level,names.levels.map(label=>({id:label,label})))}{select('selected_level',names.filters.selected_level,['низкий','ниже среднего','средний','высокий','очень высокий'].map(label=>({id:label,label})))}{select('selection','Отбор',[{id:'visited',label:names.filters.all_visited},{id:'risk',label:names.filters.risk},{id:'not_visited',label:names.filters.not_visited},{id:'no_final',label:names.filters.no_final},{id:'self_only',label:'Только самоанализы'}])}{select('calculation','Статус расчёта',[{id:'complete',label:'Сформирован'},{id:'incomplete',label:'Итог не сформирован'}])}
 {select('observer','Наблюдатель',options.observers||[])}{select('maximum','Доступный максимум',options.maximums||[])}{select('policy','Версия оценивания',options.policies||[])}<label>Поиск по имени<input type="search" value={params.get('search')||''} onChange={e=>filter('search',e.target.value)}/></label><label>Сортировка<select value={params.get('sort')||'name'} onChange={e=>filter('sort',e.target.value)}><option value="name">По имени</option><option value="score_desc">По итогу ↓</option><option value="score_asc">По итогу ↑</option></select></label></div>
 {data?.assigned_departments.length ? <p>Закреплённые кафедры: {data.assigned_departments.map(d=>d.label).join(', ')}</p>:null}{data?.filters.period==='week' && <div className="pv3-pagination"><button onClick={()=>go({week_start:shiftedWeek(data.filters.from,-1)})}>Предыдущая неделя</button><button onClick={()=>go({week_start:shiftedWeek(data.filters.from,1)})}>Следующая неделя</button><button onClick={()=>go({week_start:null})}>Текущая неделя</button></div>}<p className="pv3-context">{data ? `${data.filters.from || 'Все даты'}${data.filters.to ? ` — ${data.filters.to}` : ''} · ${view==='observers'?'Отбор наблюдений':'Отбор уроков; все действующие наблюдения выбранного урока'}` : 'Загружаем текущий отбор…'}</p>
 {issue?<div role="alert"><p>{issue}</p><button onClick={()=>setRetry(v=>v+1)}>Повторить загрузку</button></div>:!data?<p role="status" aria-live="polite">Загружаем сохранённые результаты…</p>:<>
 {data.message && <p role="status">{data.message}</p>}{view==='summary'?<Summary data={data} go={go}/>:view==='teachers'?<><TeachersTable rows={data.teachers} go={go}/>{params.get('department') && <CriteriaTable title={names.sections.department_attention} rows={data.criteria.filter(c=>c.attention)} go={go}/>}</>:view==='criteria'?<CriteriaTable title={names.screens.criteria} rows={data.criteria} go={go}/>:view==='departments'?<Departments data={data} go={go}/>:view==='observers'?<Observers data={data} go={go}/>:view==='teacher'?<TeacherView data={data} go={go} tab={params.get('teacher_tab')||'lessons'}/>:view==='lesson'?<LessonView data={data} go={go}/>:<LessonsTable rows={data.lessons} go={go}/>}
 {['teachers','observers','lessons'].includes(view) && <div className="pv3-pagination"><button disabled={data.page.number<=1} onClick={()=>go({page:String(data.page.number-1)})}>Назад</button><span>Страница {data.page.number} · {data.page.total} строк</span><button disabled={data.page.number*data.page.size>=data.page.total} onClick={()=>go({page:String(data.page.number+1)})}>Далее</button></div>}
 {visible('version_details') && <details><summary>Версия расчёта</summary><p className="pv3-fulltext">{data.aggregation_version}</p><p>{data.assessment_ids.join(', ') || 'Принятых оценок в отборе нет'}</p></details>}</>}
 </section></HiddenContext.Provider></NamesContext.Provider>;
}
