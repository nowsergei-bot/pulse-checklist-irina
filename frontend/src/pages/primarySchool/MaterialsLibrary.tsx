import {useEffect,useMemo,useState} from 'react';
import {primaryMaterials} from '../../api/primarySchool';
import {MaterialReader,type MaterialBytes} from './MaterialReader';
import {MATERIAL_KINDS,MATERIAL_SUBJECTS,filterMaterials,materialGrades,materialSize,type PrimaryMaterial} from './materialsModel';
import './materialsLibrary.css';

export function MaterialsLibrary({initialSubject='',initialGrade='',previewItems,read}:{initialSubject?:string;initialGrade?:string;previewItems?:PrimaryMaterial[];read?:MaterialBytes}) {
 const [items,setItems]=useState<PrimaryMaterial[]>(previewItems||[]),[loading,setLoading]=useState(!previewItems),[error,setError]=useState('');
 const [subject,setSubject]=useState(initialSubject),[grade,setGrade]=useState(initialGrade),[kind,setKind]=useState(''),[query,setQuery]=useState(''),[selected,setSelected]=useState<PrimaryMaterial|null>(null),[attempt,setAttempt]=useState(0),[page,setPage]=useState(0);
 useEffect(()=>{if(previewItems)return;let active=true;setLoading(true);void primaryMaterials().then(r=>{if(active){setItems(r.materials);setError('');}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить материалы.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[previewItems,attempt]);
 const available=useMemo(()=>filterMaterials(items,subject,grade,'',query),[items,subject,grade,query]);
 const visible=useMemo(()=>filterMaterials(items,subject,grade,kind,query),[items,subject,grade,kind,query]);
 useEffect(()=>setPage(0),[subject,grade,kind,query]);
 const start=Math.min(page*6,Math.max(0,Math.floor((visible.length-1)/6)*6));
 const grouped=MATERIAL_SUBJECTS.map(name=>({name,items:visible.slice(start,start+6).filter(x=>x.subject===name)})).filter(group=>group.items.length);
 return <section className="ps-materials" aria-label="Библиотека учебных материалов">
  <header className="ps-materials-header"><div><span className="ps-eyebrow">БИБЛИОТЕКА / 1–4 КЛАССЫ</span><h2>Учебные материалы</h2><p>Учебники, контрольные и пособия. Открывайте страницы прямо в Пульсе или скачивайте PDF.</p></div><div className="ps-materials-total"><b>{items.length}</b><span>полных PDF</span></div></header>
  <div className="ps-material-subjects" aria-label="Предмет материалов">{['',...MATERIAL_SUBJECTS].map(name=><button key={name} aria-pressed={subject===name} onClick={()=>setSubject(name)}>{name||'Все предметы'}<span>{items.filter(x=>!name||x.subject===name).length}</span></button>)}</div>
  <div className="ps-material-filters"><div className="ps-material-grades" aria-label="Класс материалов">{['','1','2','3','4'].map(g=><button key={g} aria-pressed={grade===g} onClick={()=>setGrade(g)}>{g?`${g} класс`:'Все классы'}</button>)}</div><label>Поиск по названию или автору<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Например, Петерсон или букварь"/></label></div>
  <div className="ps-material-layout"><aside className="ps-material-kinds" aria-label="Вид издания"><span>ВИД ИЗДАНИЯ</span>{[{id:'',label:'Все материалы'},...MATERIAL_KINDS].map(type=><button key={type.id} aria-pressed={kind===type.id} onClick={()=>setKind(type.id)}>{type.label}<small>{available.filter(x=>!type.id||x.kind===type.id).length}</small></button>)}<p>Пособия для нескольких классов показаны в каждом подходящем классе.</p></aside>
   <div className="ps-material-groups">
    {loading?<p role="status">Загружаю библиотеку…</p>:error?<div role="alert"><p>{error}</p><button className="ps-button" onClick={()=>setAttempt(n=>n+1)}>Повторить</button></div>:!visible.length?<div className="ps-material-empty"><h3>{kind==='workbook'?'Полные рабочие тетради пока не добавлены':'Материалы не найдены'}</h3><p>{kind==='workbook'?'В найденной подборке нет полных PDF рабочих тетрадей.':'Попробуйте другой предмет, класс или поисковый запрос.'}</p><button onClick={()=>{setSubject('');setGrade('');setKind('');setQuery('');}}>Показать все материалы</button></div>:grouped.map(group=><section key={group.name} className="ps-material-group"><header><h3>{group.name}</h3><span>{group.items.length} PDF</span></header><div className="ps-material-cards">{group.items.map(item=><article key={item.id} className={`ps-material-card kind-${item.kind}`}>
     <button className="ps-material-cover" onClick={()=>setSelected(item)} aria-label={`Открыть ${item.title}`}><span>{materialGrades(item)}</span><b>{item.kind==='control'?'КР':item.kind==='textbook'?'123':item.kind==='letter'?'↗':'М'}</b><small>PDF · {item.pages} стр.</small></button>
     <div className="ps-material-card-body"><span className="ps-material-type">{MATERIAL_KINDS.find(t=>t.id===item.kind)?.label}</span><h4>{item.title}</h4><p>{item.author}</p><div className="ps-material-card-meta">{materialGrades(item)} · {materialSize(item.bytes)}</div><button className="ps-material-open" onClick={()=>setSelected(item)}>Открыть в Пульсе <span>→</span></button><details><summary>Об издании и источнике</summary><p>{item.note}</p>{item.sourceUrl?<a href={item.sourceUrl} target="_blank" rel="noreferrer">Источник на сайте автора или издателя ↗</a>:<span>{item.sourceLabel}</span>}</details></div>
    </article>)}</div></section>)}
    {!loading&&!error&&visible.length>6&&<nav className="ps-material-pagination" aria-label="Страницы библиотеки"><button disabled={start===0} onClick={()=>setPage(n=>Math.max(0,n-1))}>← Назад</button><span>{start+1}–{Math.min(start+6,visible.length)} из {visible.length}</span><button disabled={start+6>=visible.length} onClick={()=>setPage(n=>n+1)}>Далее →</button></nav>}
   </div>
  </div>
  <footer>Учебники и пособия — полные файлы. Контрольные — отдельные работы целиком, выделенные из предоставленного сборника.</footer>
  {selected&&<MaterialReader key={selected.id} material={selected} onClose={()=>setSelected(null)} read={read}/>}
 </section>;
}
