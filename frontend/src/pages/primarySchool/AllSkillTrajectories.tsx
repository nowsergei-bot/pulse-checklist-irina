import {useEffect,useMemo,useRef,useState} from 'react';
import {allSkillTrajectories} from './skillHistory';
import {type analyze,type Skill} from './model';
import {trajectoryLayout} from './trajectoryLayout';

const palette=['#2563a6','#b74f73','#27867a','#a76a19','#7754aa','#b65035','#25869e','#686c26','#7c3f68','#34714c','#4a59a2','#9a5430','#366b78','#83489b','#637928','#9e4060'];
const date=(s:string)=>new Date(s.slice(0,10)+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
export function AllSkillTrajectories({analysis,skills,onWork}:{analysis:ReturnType<typeof analyze>;skills:Map<string,Skill>;onWork:(id:string)=>void}){
 const card=useRef<HTMLElement>(null),[availableWidth,setAvailableWidth]=useState(640);
 useEffect(()=>{const el=card.current;if(!el)return;const measure=()=>{const css=getComputedStyle(el);setAvailableWidth(el.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight));};const observer=new ResizeObserver(measure);observer.observe(el);measure();return()=>observer.disconnect();},[]);
 const chart=useMemo(()=>allSkillTrajectories(analysis),[analysis]);
 const [mode,setMode]=useState<'rows'|'combined'>('rows'),[hidden,setHidden]=useState<string[]>([]),[query,setQuery]=useState('');
 const all=chart.series.map((s,index)=>({...s,index,color:palette[index]||`hsl(${Math.round(index*137.5)%360} 55% 38%)`,title:skills.get(s.skillId)?.title||s.skillId}));
 const matching=all.filter(s=>`${s.title} ${s.subject} ${skills.get(s.skillId)?.topic||''}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
 const visible=matching.filter(s=>!hidden.includes(s.key));

 function graph(rows:typeof all,compact=false){
  const h=compact?150:300,{width,x,y,tickStride,showDates,showEveryValue}=trajectoryLayout(availableWidth,chart.works.length,h);
  return <svg viewBox={`0 0 ${width} ${h}`} width="100%" height={h} aria-label={compact?rows[0].title:'Все выбранные навыки по работам'} role="group">
   {[0,25,50,75,100].map(n=><g key={n}><line x1="45" x2={width-20} y1={y(n)} y2={y(n)} stroke="#e2e9ef"/><text x="2" y={y(n)+4} fontSize="11" fill="#64798b">{n}%</text></g>)}
   {rows.map(s=>{const points=s.points.map((p,i)=>({...p,i})).filter((p):p is typeof p & {percent:number}=>p.percent!==null);return <g key={s.key}>
    {/* Only observed checks are joined; a gap never becomes a zero or a new observation. */}
    <polyline points={points.map(p=>`${x(p.i)},${y(p.percent)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.index>=palette.length?'7 4':undefined}/>
    {points.map(p=><g key={p.work.id} role="button" tabIndex={0} className="ps-skill-point" aria-label={`${s.title}, ${p.work.title}, ${date(p.work.held_on)}: ${p.percent}%, детей: ${p.count}. Открыть работу`} onClick={()=>onWork(p.work.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onWork(p.work.id);}}}>
     <title>{s.title}{'\n'}{p.work.title} · {date(p.work.held_on)}{'\n'}{p.percent}% · {p.count} детей в постоянном составе</title>
     <circle cx={x(p.i)} cy={y(p.percent)} r="11" fill="transparent"/><circle cx={x(p.i)} cy={y(p.percent)} r="4.5" fill={s.color} stroke="white" strokeWidth="1.5"/>
     {compact&&(showEveryValue||points.length===1||p===points.at(-1))&&<text x={x(p.i)} y={y(p.percent)-10} textAnchor="middle" fontSize="12" fill={s.color}>{p.percent}%</text>}
    </g>)}
   </g>;})}
   {chart.works.map((w,i)=>(i%tickStride===0||i===chart.works.length-1)&&<text key={w.id} x={x(i)} y={h-5} textAnchor="middle" fontSize="10" fill="#64798b">{i+1}{showDates?` · ${date(w.held_on)}`:''}</text>)}
  </svg>;
 }
 return <article ref={card} className="ps-card ps-all-trajectories"><div className="ps-card-heading"><div><span className="ps-eyebrow">ВСЕ НАВЫКИ · ЕДИНАЯ ШКАЛА РАБОТ</span><h2>Навыки сквозь работы</h2></div><div className="ps-segments" aria-label="Вид графика навыков"><button className={mode==='rows'?'selected':''} aria-pressed={mode==='rows'} onClick={()=>setMode('rows')}>Друг под другом</button><button className={mode==='combined'?'selected':''} aria-pressed={mode==='combined'} onClick={()=>setMode('combined')}>На одной схеме</button></div></div>
  <p className="ps-footnote">Вся шкала работ помещается на экране. Каждая точка — сохранённый результат полной проверки навыка. Внутри каждой линии сравнивается один состав детей с полными проверками. Состав разных навыков может отличаться. Между точками — интервал до следующей проверки; отсутствие точки не равно нулю.</p>
  <div className="ps-trajectory-tools"><label>Найти навык<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название или тема"/></label><button className="ps-button" onClick={()=>{setHidden([]);setQuery('');}}>Показать все ({all.length})</button><span>{visible.length} из {all.length} навыков · {chart.works.length} работ</span></div>
  {!all.length?<p className="ps-dynamics-empty">Графики появятся после внесения результатов. Непроверенные задания не отображаются как 0%.</p>:<>
   {mode==='combined'&&<div className="ps-skill-legend" aria-label="Навыки на графике">{matching.map(s=><button key={s.key} aria-pressed={!hidden.includes(s.key)} onClick={()=>setHidden(h=>h.includes(s.key)?h.filter(k=>k!==s.key):[...h,s.key])}><i style={{background:s.color}}/><span>{s.index+1}. {s.title}<small>{s.subject} · {s.grade} класс · {s.cohort.length} детей{s.availableWorks<2?' · одна проверка':''}</small></span></button>)}</div>}
   {!visible.length?<p className="ps-dynamics-empty">Нет выбранных навыков. Измените поиск или нажмите «Показать все».</p>:<div className="ps-trajectory-charts" role="region" aria-label="Графики навыков">
    {mode==='combined'?graph(visible):visible.map(s=><section key={s.key} className="ps-trajectory-row"><div className="ps-trajectory-row-heading"><strong><i style={{background:s.color}}/>{s.index+1}. {s.title}</strong><small>{s.subject} · {s.grade} класс · {s.cohort.length} детей · полных проверок: {s.availableWorks}</small></div>{s.cohort.length?graph([s],true):<p>Нет общего состава с полными проверками. Сузьте период или выберите ученика.</p>}</section>)}
    <div className="ps-all-works-key">{chart.works.map((w,i)=><button key={w.id} onClick={()=>onWork(w.id)}><b>{i+1} · {date(w.held_on)}</b><span>{w.title}</span></button>)}</div>
   </div>}
  </>}
 </article>;
}
