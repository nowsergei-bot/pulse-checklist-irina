import {useId,useState,type ReactNode,type KeyboardEvent} from 'react';
import type {Template} from './model';
import {curriculumScope,curriculumPage,safeCurriculumUrl,type LibrarySkill,type LibraryTemplate} from './curriculumLibraryModel';
import './curriculumLibrary.css';

type Tab='skills'|'criteria'|'templates';
const tabs:{id:Tab;label:string}[]=[{id:'skills',label:'Навыки'},{id:'criteria',label:'Критерии'},{id:'templates',label:'Спецификации'}];
function Source({skill}:{skill:LibrarySkill}){
 const url=safeCurriculumUrl(skill.source?.url,skill.source?.pdf_page);
 return <div className="ps-library-source">{skill.author&&<strong>{skill.author}</strong>}{skill.source?.file&&<span>{skill.source.file}{skill.source.pdf_page?` · PDF, с. ${skill.source.pdf_page}`:''}</span>}{skill.source?.note&&<small>{skill.source.note}</small>}{url&&<a href={url} target="_blank" rel="noreferrer">Открыть источник ↗</a>}</div>;
}
export function CurriculumLibrary({skills,templates,onUseTemplate,initialTab='skills',tools}:{skills:LibrarySkill[];templates:LibraryTemplate[];onUseTemplate:(template:Template)=>void;initialTab?:Tab;tools?:ReactNode}){
 const id=useId();
 const subjects=[...new Set([...skills.map(s=>s.subject||''),...templates.map(t=>t.subject)])].filter(Boolean);
 const [subject,setSubject]=useState(subjects[0]||''),[grade,setGrade]=useState(''),[topic,setTopic]=useState(''),[query,setQuery]=useState(''),[tab,setTab]=useState<Tab>(initialTab),[selectedId,setSelectedId]=useState(''),[page,setPage]=useState(1);
 const actualSubject=subjects.includes(subject)?subject:subjects[0]||'';
 const availableGrades=[...new Set([...skills.filter(s=>s.subject===actualSubject).map(s=>s.grade),...templates.filter(t=>t.subject===actualSubject).map(t=>t.grade)])].filter((g):g is number=>!!g).sort();
 const actualGrade=availableGrades.includes(Number(grade))?grade:'';
 const availableTopics=new Set(skills.filter(s=>s.subject===actualSubject&&(!actualGrade||s.grade===Number(actualGrade))).map(s=>s.topic));
 const actualTopic=availableTopics.has(topic)?topic:'';
 const scope=curriculumScope(skills,templates,{subject:actualSubject,grade:actualGrade,topic:actualTopic,query});
 const skillPage=curriculumPage(scope.skills,page),templatePage=curriculumPage(scope.templates,page);
 const selected=skillPage.items.find(s=>s.id===selectedId)||skillPage.items[0];
 const pagination=tab==='templates'?templatePage:skillPage;
 function reset(){setPage(1);setSelectedId('');}
 function switchTab(next:Tab){setTab(next);setPage(1);}
 function keyboardTab(event:KeyboardEvent<HTMLButtonElement>,index:number){
  const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
  if(next===null)return;event.preventDefault();switchTab(tabs[next].id);document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
 }
 return <section className="ps-library" aria-label="Библиотека навыков и спецификаций">
  <header className="ps-library-header"><div><span className="ps-eyebrow">МАТЕРИАЛЫ ДЛЯ ПРОВЕРКИ</span><h2>Библиотека навыков</h2><p>Выберите предмет и тему. Откройте критерии или возьмите спецификацию за основу.</p></div><span className="ps-library-total">{skills.length}<small>навыков в срезе</small></span></header>
  <div className="ps-library-subjects" aria-label="Предмет библиотеки">{subjects.map(s=><button key={s} aria-pressed={actualSubject===s} className={actualSubject===s?'active':''} onClick={()=>{setSubject(s);setGrade('');setTopic('');reset();}}>{s}<span>{skills.filter(k=>k.subject===s).length}</span></button>)}</div>
  <div className="ps-library-toolbar"><label className="ps-library-search">Найти навык или материал<input aria-label="Найти навык или материал" type="search" value={query} placeholder="Навык, критерий, автор…" onChange={e=>{setQuery(e.target.value);reset();}}/></label><label>Класс<select aria-label="Класс" value={actualGrade} onChange={e=>{setGrade(e.target.value);setTopic('');reset();}}><option value="">Все доступные</option>{availableGrades.map(g=><option key={g} value={g}>{g} класс</option>)}</select></label></div>
  <div className="ps-library-layout"><aside className="ps-library-topics" aria-label="Темы навыков"><div className="ps-library-aside-title">ТЕМЫ <span>{scope.topics.length}</span></div><button aria-pressed={!actualTopic} className={!actualTopic?'active':''} onClick={()=>{setTopic('');reset();}}>Все темы<span>{scope.total}</span></button>{scope.topics.map(({topic:t,count})=><button key={t} aria-pressed={actualTopic===t} className={actualTopic===t?'active':''} onClick={()=>{setTopic(t);reset();}}><span>{t}</span><small>{count}</small></button>)}</aside>
   <div className="ps-library-main"><div className="ps-library-tablist" role="tablist" aria-label="Содержимое темы">{tabs.map((t,i)=><button key={t.id} id={`${id}-tab-${t.id}`} role="tab" tabIndex={tab===t.id?0:-1} aria-selected={tab===t.id} aria-controls={`${id}-panel`} onKeyDown={e=>keyboardTab(e,i)} onClick={()=>switchTab(t.id)}>{t.label}<span>{t.id==='templates'?scope.templates.length:scope.skills.length}</span></button>)}</div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className="ps-library-panel">
     {tab!=='templates'&&(!scope.skills.length?<div className="ps-library-empty"><h3>Навыки не найдены</h3><p>Измените тему или поисковую строку.</p></div>:<div className={'ps-library-skills '+(tab==='criteria'?'with-detail':'')}>
      <div className="ps-library-rows">{skillPage.items.map(s=>tab==='skills'?<details key={s.id} className="ps-library-skill"><summary><span><strong>{s.title}</strong><small>{s.grade} класс · {s.topic}</small></span><span className="ps-library-expand" aria-hidden="true">＋</span></summary><div className="ps-library-skill-body"><p>{s.criterion}</p><Source skill={s}/><button className="ps-library-link" onClick={()=>{setSelectedId(s.id);setTab('criteria');}}>Критерии и спецификации →</button></div></details>:<button key={s.id} aria-pressed={selected?.id===s.id} className={'ps-library-select '+(selected?.id===s.id?'active':'')} onClick={()=>setSelectedId(s.id)}><strong>{s.title}</strong><small>{s.grade} класс · {s.topic}</small></button>)}</div>
      {tab==='criteria'&&selected&&<article className="ps-library-detail"><span className="ps-eyebrow">НАБЛЮДАЕМЫЙ РЕЗУЛЬТАТ</span><h3>{selected.title}</h3><span className="ps-library-tag">{selected.grade} класс</span><h4>Критерий полного выполнения</h4>{selected.checks?.length?<ul>{selected.checks.map((c,i)=><li key={i}>{c}</li>)}</ul>:<p>{selected.criterion}</p>}{selected.evidence&&<><h4>Как проверить</h4><p>{selected.evidence}</p></>}<Source skill={selected}/>{selected.adaptation&&<p className="ps-library-note">Критерии адаптированы для аналитики. Учитель уточняет их под конкретное задание.</p>}<h4>В спецификациях</h4>{templates.filter(t=>t.tasks.some(task=>task.skill_id===selected.id)).map(t=><button key={t.id} className="ps-library-related" onClick={()=>onUseTemplate(t)}>{t.title}<span>Открыть →</span></button>)}{!templates.some(t=>t.tasks.some(task=>task.skill_id===selected.id))&&<p className="ps-library-note">Готового шаблона пока нет. Навык доступен при создании своей работы.</p>}</article>}
     </div>)}
     {tab==='templates'&&(!scope.templates.length?<div className="ps-library-empty"><h3>Спецификаций пока нет</h3><p>Выберите другую тему или сохраните собственную спецификацию.</p></div>:<div className="ps-library-template-list">{templatePage.items.map(t=><details key={t.id} className="ps-library-template"><summary><span><strong>{t.title}</strong><small>{t.grade} класс · {t.tasks.length} критериев · {new Set(t.tasks.map(k=>k.skill_id)).size} навыков</small></span><span className="ps-library-tag">{t.origin==='teacher'?'Своя':t.origin==='adaptation'?'Адаптация':'По работе'}</span></summary><div className="ps-library-template-body">{t.notice&&<p className="ps-library-note">{t.notice}</p>}<ol>{t.tasks.map(task=><li key={task.id}><strong>{skills.find(s=>s.id===task.skill_id)?.title||task.topic}</strong><p>{task.criterion}</p>{task.optional&&<small>Дополнительное задание</small>}</li>)}</ol><p className="ps-library-note">{t.source.file}{t.source.pdf_pages.length?` · PDF, с. ${t.source.pdf_pages.join(', ')}`:''}</p><button className="ps-button primary" onClick={()=>onUseTemplate(t)}>Использовать спецификацию →</button></div></details>)}</div>)}
    </div>
    {pagination.pages>1&&<nav className="ps-library-pagination" aria-label="Страницы библиотеки"><button disabled={pagination.page===1} onClick={()=>setPage(pagination.page-1)}>← Назад</button><span>{pagination.page} / {pagination.pages}</span><button disabled={pagination.page===pagination.pages} onClick={()=>setPage(pagination.page+1)}>Далее →</button></nav>}
   </div>
  </div>
  {tools&&<details className="ps-library-tools"><summary>Свои навыки и настройка связей</summary><div>{tools}</div></details>}
  <p className="ps-library-disclaimer">Источники и страницы указаны в карточках. Класс и сложность навыка сохраняются: общая тема сама по себе не объединяет результаты разных проверок.</p>
 </section>;
}
