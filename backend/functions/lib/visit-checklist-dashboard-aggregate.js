'use strict';
const scoring=require('./pulse-v3-score');
const names=require('../data/pulse-v3/labels.json');
const {normalizeFilters,selectLesson,matchingObservation,inDate}=require('./visit-checklist-dashboard-filters');
const scored=scoring.RUBRIC.criteria.filter(c=>c.kind==='scored');
const unique=values=>[...new Set(values)];
function below(value,maximum,percent){if(value==null||!maximum)return false;const v=typeof value==='number'?{numerator:value,denominator:1}:value;return BigInt(v.numerator)*100n<BigInt(v.denominator)*BigInt(maximum)*BigInt(percent);}
const groupKey=result=>`${result.policy}:${result.maximum}`;
function groupBy(rows,key) {const groups=new Map();for(const row of rows){const k=key(row);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);}return groups;}
function result(value,maximum,policy='',lesson_count=0,status='Итог не сформирован',teacher_count) {
 return {value,maximum,policy,lesson_count,teacher_count,status:value==null?status:'Сформирован',display:value==null?'—':scoring.display(value,maximum),level:value==null?null:scoring.level(value,maximum)};
}
function partialItems(){return scoring.RUBRIC.criteria.map(c=>({code:c.code,max_score:c.max_score,score:null,status:c.kind==='descriptive'?'descriptive':'missing_assessment'}));}
function canonicalRecord(raw) {
 const results=Array.isArray(raw.results)?raw.results:partialItems();
 const total=scoring.checklistTotal(results,raw.self_adjustment||0);
 return {...raw,results,total,assessment_policy_version:raw.assessment_policy_version||'',assessment_id:raw.assessment_id||null};
}
function itemLabel(code){return names.scored_criteria[code]||names.descriptive_criteria[code]||names.blocks[code]||code;}
function criterion(code,value,maximum,lessons=[],unassessed_count=0) {
 const below=lessons.filter(l=>l.criteria[code]!=null&&scoring.attention(l.criteria[code],maximum));
 return {code,title:itemLabel(code),status:value==null&&lessons.length&&lessons.every(l=>l.records?.filter(r=>r.checklist.source==='observation').every(r=>r.results.find(i=>i.code===code)?.status==='not_applicable'))?'not_applicable':value==null?'unassessed':'scored',value,maximum,display:value==null?'—':scoring.toNumber(value).toLocaleString('ru-RU',{maximumFractionDigits:10}),relative_level:value!=null&&maximum?scoring.level(value,maximum):null,attention:scoring.attention(value,maximum),lesson_count:lessons.filter(l=>l.criteria[code]!=null).length,below_count:below.length,unassessed_count};
}
function addValues(values){const v=scoring.mean(values);return v==null?null:{numerator:v.numerator*values.length,denominator:v.denominator};}
function lessonFromMeta(meta,records,adjustment) {
 const observations=records.filter(r=>r.checklist.source==='observation');
 const self=records.filter(r=>r.checklist.source==='self_analysis');
 const calculated=scoring.lessonResult(records,adjustment?.amount||0);
 const policy=unique(observations.map(r=>r.assessment_policy_version)).join(',');
 const criteria={...calculated.criteria};
 // Known partial criteria remain available in the lesson card, never in the complete-result rating.
 if(!calculated.complete)for(const c of scored){const values=observations.map(r=>r.results.find(i=>i.code===c.code)).filter(i=>i?.status==='scored').map(i=>i.score);criteria[c.code]=scoring.mean(values);}
 const publicResult=result(calculated.final,calculated.maximum,policy,1,calculated.status);
 const attention=scored.map(c=>criterion(c.code,criteria[c.code]??null,c.max_score,[{criteria}])).filter(c=>c.attention);
 return {...meta,id:String(meta.id||meta.lesson_id),teacher_id:String(meta.teacher_id),teacher_label:meta.teacher_label||String(meta.teacher_id),department:meta.department||meta.department_id||'',department_id:String(meta.department_id||meta.department||''),date:meta.date||'',class_name:meta.class_name||meta.class||'',subject:meta.subject||'',topic:meta.topic||'',records,criteria,result:publicResult,observation_count:observations.length,self_count:self.length,selected_levels:observations.flatMap(r=>(r.checklist.answers['10.1']?.selected_options||[]).map(o=>o.label)),attention,adjustment:adjustment?.amount||0,adjustment_reason:adjustment?.problem_reference||'',unlinked:false};
}
function groupCriteria(lessons,codes=scored.map(c=>c.code)) {
 const teachers=groupBy(lessons,l=>l.teacher_id);
 return codes.map(code=>{
  const c=scoring.ITEMS[code];const values=[...teachers.values()].map(rows=>scoring.mean(rows.map(l=>l.criteria[code]).filter(v=>v!=null))).filter(v=>v!=null);
  const missing=lessons.reduce((n,l)=>n+l.records.filter(r=>r.checklist.source==='observation'&&!['scored','not_applicable'].includes(r.results.find(i=>i.code===code)?.status)).length,0);
  return criterion(code,scoring.mean(values),c.max_score,lessons,missing);
 });
}
function groupBlocks(lessons) {
 return Object.keys(names.blocks).filter(c=>c!=='10').map(code=>{
  const codes=scored.filter(c=>c.code.split('.')[0]===code).map(c=>c.code);
  const maximum=codes.reduce((n,c)=>n+scoring.ITEMS[c].max_score,0);
  // N/A changes available block maxima; all lessons here share the same available maximum.
  const applicableMaximum=lessons[0]?codes.reduce((n,c)=>n+(lessons[0].criteria[c]==null?0:scoring.ITEMS[c].max_score),0):maximum;
  const usable=lessons.map(l=>({...l,criteria:{...l.criteria,[code]:addValues(codes.map(c=>l.criteria[c]).filter(v=>v!=null))}}));
  const teacherMeans=[...groupBy(usable,l=>l.teacher_id).values()].map(rows=>scoring.mean(rows.map(l=>l.criteria[code]).filter(v=>v!=null)));
  return {...criterion(code,applicableMaximum?scoring.mean(teacherMeans):null,applicableMaximum,usable), ...(applicableMaximum===0?{status:'not_applicable'}:{})};
 });
}
function buildTeacherRows(lessons,roster) {
 const rows=[];
 for(const [id,all] of groupBy(lessons,l=>l.teacher_id)) {
  const full=all.filter(l=>l.result.value!=null&&l.observation_count);
  const groups=groupBy(full,l=>groupKey(l.result));
  const meta=roster.find(t=>String(t.id)===id)||all[0];
  const make=(selected,r)=>({id,label:meta.label||meta.teacher_label||id,departments:unique(all.map(l=>l.department)),result:r,rank:null,risk:all.some(l=>l.observation_count&&l.result.value!=null&&below(l.result.value,l.result.maximum,70)),lesson_count:selected.length,observation_count:selected.reduce((n,l)=>n+l.observation_count,0),self_count:selected.reduce((n,l)=>n+l.self_count,0),blocks:groupBlocks(selected.filter(l=>l.result.value!=null)),risk_lessons:all.filter(l=>l.result.value!=null&&l.observation_count&&below(l.result.value,l.result.maximum,70))});
  for(const selected of groups.values()){const first=selected[0].result;rows.push(make(selected,result(scoring.mean(selected.map(l=>l.result.value)),first.maximum,first.policy,selected.length,'',1)));}
  const incomplete=all.filter(l=>l.result.value==null&&l.observation_count);if(incomplete.length)rows.push(make(incomplete,result(null,null,'',incomplete.length)));
  const selfOnly=all.filter(l=>!l.observation_count);if(selfOnly.length)rows.push(make(selfOnly,result(null,null,'',selfOnly.length,'Только самоанализы')));
 }
 for(const teacher of roster)if(!lessons.some(l=>l.teacher_id===String(teacher.id)))rows.push({id:String(teacher.id),label:teacher.label,departments:(teacher.departments||[]).map(d=>typeof d==='string'?d:d.label||d.id),result:result(null,null,'',0,'Не посещены'),rank:null,risk:false,lesson_count:0,observation_count:0,self_count:0,blocks:[],risk_lessons:[]});
 for(const group of groupBy(rows.filter(r=>r.result.value!=null),r=>groupKey(r.result)).values())group.sort((a,b)=>scoring.toNumber(b.result.value)-scoring.toNumber(a.result.value)||a.label.localeCompare(b.label,'ru')).forEach((r,i)=>r.rank=i+1);
 return rows;
}
function teacherSelection(row,f,lessons) {
 if(f.search&&!row.label.toLocaleLowerCase('ru-RU').includes(f.search.toLocaleLowerCase('ru-RU')))return false;
 if(f.level&&row.result.level!==f.level)return false;
 if(f.maximum&&String(row.result.maximum)!==f.maximum)return false;
 if(f.policy&&row.result.policy!==f.policy)return false;
 if(f.selection==='risk'&&!row.risk)return false;
 if(f.selection==='not_visited'&&row.observation_count!==0)return false;
 if(f.selection==='self_only'&&row.result.status!=='Только самоанализы')return false;
 if(f.selection==='no_final'&&(row.result.value!=null||!row.observation_count))return false;
 if((f.selection==='visited'||(!f.selection&&f.view==='teachers'))&&!row.observation_count)return false;
 if(f.calculation==='complete'&&row.result.value==null)return false;
 if(f.calculation==='incomplete'&&row.result.value!=null)return false;
 if(f.criterion&&f.criterion_mode==='mean'){
  const c=scoring.ITEMS[f.criterion];if(!c||c.kind!=='scored')return false;
  const teacherLessons=lessons.filter(l=>l.teacher_id===row.id&&groupKey(l.result)===groupKey(row.result)&&l.result.value!=null);
  const v=groupCriteria(teacherLessons).find(c=>c.code===f.criterion);if(!v?.attention)return false;
 }
 return true;
}
const mapSelected=raw=>({'низкий':'Очень низкий','ниже среднего':'Низкий','средний':'Средний','высокий':'Высокий','очень высокий':'Очень высокий'}[String(raw||'').toLocaleLowerCase('ru-RU')]||null);
function observerRows(lessons,f) {
 const details=[];
 for(const l of lessons)for(const r of l.records.filter(r=>matchingObservation(r,f))){
  const raw=r.checklist.answers['10.1']?.selected_options?.[0]?.label||'';const mapped=mapSelected(raw);
  const t=scoring.checklistTotal(r.results,l.adjustment);
  const rr=result(t.final,t.maximum,r.assessment_policy_version,1,t.status);
  details.push({id:r.checklist.checklist_id,author:r.author_label||String(r.checklist.author_id||'Автор не указан'),author_id:String(r.checklist.author_id||''),lesson_id:l.id,teacher_id:l.teacher_id,teacher_label:l.teacher_label,date:l.date,revision:r.checklist.revision,assessment_id:r.assessment_id,result:rr,selected_level:raw,mapped_level:mapped,comparison:t.final==null?'Итог не сформирован':!raw?'Общая оценка не выбрана':mapped===rr.level?'Совпадает':'Отличается'});
 }
 const observers=[...groupBy(details,d=>d.author_id)].map(([id,rows])=>({id,label:rows[0].author,observation_count:rows.length,match:rows.filter(d=>d.comparison==='Совпадает').length,mismatch:rows.filter(d=>d.comparison==='Отличается').length,incomplete:rows.filter(d=>d.comparison==='Итог не сформирован').length,no_selected:rows.filter(d=>d.comparison==='Общая оценка не выбрана').length}));
 return {observers,details};
}
function publicLesson(l){const {records,criteria,...data}=l;return data;}
function detailLesson(l){
 const checklists=l.records.map(r=>({id:r.checklist.checklist_id,revision:r.checklist.revision,assessment_id:r.assessment_id,author:r.author_label||String(r.checklist.author_id||''),source:r.checklist.source,form_version:r.checklist.form_version,result:result(r.total.final,r.total.maximum,r.assessment_policy_version,1,r.total.status),answers:r.checklist.answers,items:r.results.map(i=>({...i,maximum:i.max_score})),adjustment:r.checklist.source==='self_analysis'?(r.self_adjustment||0):l.adjustment}));
 // Observer totals use the same validated lesson adjustment exactly once.
 for(const c of checklists.filter(c=>c.source==='observation')){const r=l.records.find(r=>r.checklist.checklist_id===c.id);const t=scoring.checklistTotal(r.results,l.adjustment);c.result=result(t.final,t.maximum,r.assessment_policy_version,1,t.status);}
 const criteria=scored.map(c=>criterion(c.code,l.criteria[c.code]??null,c.max_score,[l]));
 const selfs=l.records.filter(r=>r.checklist.source==='self_analysis');
 const comparable=selfs.length===1&&l.result.value!=null&&selfs[0].total.final!=null&&selfs[0].total.maximum===l.result.maximum&&selfs[0].assessment_policy_version===l.result.policy;
 const differences=criteria.map(c=>{const s=selfs[0]?.results.find(i=>i.code===c.code);const v=comparable&&s?.score!=null&&c.value!=null?addValues([s.score,{numerator:-c.value.numerator,denominator:c.value.denominator}]):null;return {code:c.code,difference:v};});
 return {...publicLesson(l),checklists,criteria,differences};
}
function dynamics(lessons){
 const rows=[...groupBy(lessons.filter(l=>l.result.value!=null),l=>`${l.date.slice(0,7)}:${groupKey(l.result)}`)].map(([key,ls])=>({period:key.split(':')[0],result:result(scoring.mean(ls.map(l=>l.result.value)),ls[0].result.maximum,ls[0].result.policy,ls.length),change:null}));
 rows.sort((a,b)=>a.period.localeCompare(b.period)||groupKey(a.result).localeCompare(groupKey(b.result)));
 for(let i=0;i<rows.length;i++){const row=rows[i];const previous=rows.slice(0,i).filter(p=>groupKey(p.result)===groupKey(row.result)).at(-1);if(previous){const [y,m]=row.period.split('-').map(Number),[py,pm]=previous.period.split('-').map(Number);if(y*12+m-(py*12+pm)===1)row.change=addValues([row.result.value,{numerator:-previous.result.value.numerator,denominator:previous.result.value.denominator}]);}}
 return rows;
}
function aggregateDashboard(dataset,query={},now,settings={}) {
 const filters=normalizeFilters(query,now,dataset.calendar);
 const current=new Map();for(const raw of dataset.records){const key=`${raw.checklist.checklist_id}:${raw.assessment_policy_version||''}`;const previous=current.get(key);if(!previous||raw.checklist.revision>previous.checklist.revision)current.set(key,raw);else if(raw.checklist.revision===previous.checklist.revision&&raw.assessment_id!==previous.assessment_id)throw new Error('Две активные оценки одной редакции');}
 const records=[...current.values()].map(canonicalRecord);
 const recordsByLesson=groupBy(records,r=>String(r.checklist.lesson_id));
 const lessons=dataset.lessons.map(meta=>{const id=String(meta.id||meta.lesson_id);const related=recordsByLesson.get(id)||[];return lessonFromMeta(meta,related,(dataset.adjustments||[]).find(a=>a.lesson_id===id&&a.aggregation_version===scoring.aggregationVersion(related)));}).filter(l=>l.records.length&&selectLesson(l,filters));
 const overlaps=d=>(!filters.from||((!d.valid_from||d.valid_from<=filters.to)&&(!d.valid_until||d.valid_until>filters.from)));
 const roster=(dataset.roster||[]).map(t=>({...t,departments:(t.departments||[]).filter(d=>typeof d==='string'||overlaps(d))})).filter(t=>(!filters.teacher_filter||String(t.id)===filters.teacher_filter)&&(!filters.department||(t.departments||[]).some(d=>String(typeof d==='string'?d:d.id)===filters.department)));
 let teachers=buildTeacherRows(lessons,roster).filter(r=>teacherSelection(r,filters,lessons));
 teachers.sort((a,b)=>filters.sort==='score_desc'?scoring.toNumber(b.result.value)-scoring.toNumber(a.result.value)||a.label.localeCompare(b.label,'ru'):filters.sort==='score_asc'?scoring.toNumber(a.result.value)-scoring.toNumber(b.result.value)||a.label.localeCompare(b.label,'ru'):a.label.localeCompare(b.label,'ru'));
 const ids=unique(teachers.map(t=>t.id));
 const selected=lessons.filter(l=>ids.includes(l.teacher_id));
 const selectedGroups=new Set(teachers.filter(t=>t.result.value!=null).map(t=>`${t.id}:${groupKey(t.result)}`));
 const full=selected.filter(l=>selectedGroups.has(`${l.teacher_id}:${groupKey(l.result)}`)&&l.result.value!=null&&(!filters.maximum||String(l.result.maximum)===filters.maximum)&&(!filters.policy||l.result.policy===filters.policy));
 const groups=[...groupBy(teachers.filter(t=>t.result.value!=null),t=>groupKey(t.result)).values()].map(rows=>{const first=rows[0].result;return result(scoring.mean(rows.map(t=>t.result.value)),first.maximum,first.policy,rows.reduce((n,t)=>n+t.lesson_count,0),'',rows.length);});
 const criteria=[],blocks=[];
 for(const group of groupBy(full,l=>groupKey(l.result)).values()){
  const departmentMeans=[...groupBy(group,l=>l.department_id)].map(([id,ls])=>({id,label:ls[0].department,cells:[...groupCriteria(ls),...groupBlocks(ls)]}));
  const decorate=row=>({...row,group_maximum:group[0].result.maximum,policy:group[0].result.policy,departments:departmentMeans.map(d=>{const c=d.cells.find(c=>c.code===row.code);return {id:d.id,label:d.label,value:c?.value??null,display:c?.display||'—',below_count:c?.below_count||0};})});
  criteria.push(...groupCriteria(group).map(decorate));blocks.push(...groupBlocks(group).map(decorate));
 }
 criteria.sort((a,b)=>(a.value==null?Infinity:scoring.toNumber(a.value)/a.maximum)-(b.value==null?Infinity:scoring.toNumber(b.value)/b.maximum)||b.below_count-a.below_count||a.code.localeCompare(b.code,'ru',{numeric:true}));
 const departments=[...groupBy(selected,l=>l.department_id)].map(([id,ls])=>{
  const rows=buildTeacherRows(ls,[]).filter(t=>t.result.value!=null);const dg=[...groupBy(rows,t=>groupKey(t.result)).values()].map(ts=>result(scoring.mean(ts.map(t=>t.result.value)),ts[0].result.maximum,ts[0].result.policy,ts.reduce((n,t)=>n+t.lesson_count,0),'',ts.length));
  return {id,label:ls[0].department,leaders:(dataset.leaders||[]).filter(t=>String(t.department_id)===id&&overlaps(t)).map(t=>t.label),visited_teachers:unique(ls.filter(l=>l.observation_count).map(l=>l.teacher_id)).length,total_teachers:roster.filter(t=>(t.departments||[]).some(d=>String(typeof d==='string'?d:d.id)===id)).length,lesson_count:ls.filter(l=>l.observation_count).length,observation_count:ls.reduce((n,l)=>n+l.observation_count,0),self_count:ls.reduce((n,l)=>n+l.self_count,0),risk_count:unique(ls.filter(l=>l.result.value!=null&&below(l.result.value,l.result.maximum,70)).map(l=>l.teacher_id)).length,incomplete_count:ls.filter(l=>l.observation_count&&l.result.value==null).length,groups:dg};
 });
 const observationData=observerRows(lessons,filters);
 const observer_comparisons=lessons.filter(l=>l.observation_count>1).map(l=>{const rs=l.records.filter(r=>r.checklist.source==='observation');const totals=rs.map(r=>scoring.checklistTotal(r.results,l.adjustment));const comparable=totals.every(t=>t.complete)&&unique(totals.map(t=>t.maximum)).length===1&&unique(rs.map(r=>r.assessment_policy_version)).length===1;const exacts=totals.map(t=>t.final).filter(v=>v!=null).sort((a,b)=>scoring.toNumber(a)-scoring.toNumber(b));return {lesson_id:l.id,teacher_id:l.teacher_id,teacher_label:l.teacher_label,date:l.date,totals:rs.map((r,i)=>({author:r.author_label||String(r.checklist.author_id),result:result(totals[i].final,totals[i].maximum,r.assessment_policy_version,1,totals[i].status)})),difference:comparable?addValues([exacts.at(-1),{numerator:-exacts[0].numerator,denominator:exacts[0].denominator}]):null,criteria:unique(rs.map(r=>r.assessment_policy_version)).length===1?scored.filter(c=>unique(rs.map(r=>r.results.find(i=>i.code===c.code)?.score).filter(v=>v!=null)).length>1).map(c=>({code:c.code,title:c.label,maximum:c.max_score,scores:rs.map(r=>r.results.find(i=>i.code===c.code)?.score??null)})):[]};});
 const risk=teachers.filter(t=>t.risk);
 const detail=filters.teacher?lessons.filter(l=>l.teacher_id===filters.teacher):[];
 const teacher=filters.teacher&&(detail.length||roster.some(t=>String(t.id)===filters.teacher))?{id:filters.teacher,label:roster.find(t=>String(t.id)===filters.teacher)?.label||detail[0]?.teacher_label||filters.teacher,departments:unique(detail.map(l=>l.department)),groups:buildTeacherRows(detail,[]).map(t=>t.result),lessons:detail.map(publicLesson),partial_criteria:groupCriteria(detail.filter(l=>l.result.value==null)),criteria:[...groupBy(detail.filter(l=>l.result.value!=null),l=>groupKey(l.result)).values()].flatMap(ls=>groupCriteria(ls).map(c=>({...c,group_maximum:ls[0].result.maximum,policy:ls[0].result.policy}))),dynamics:dynamics(detail)}:null;
 const lesson=filters.lesson?lessons.find(l=>l.id===filters.lesson):null;
 let listedLessons=selected;
 if(filters.view==='lessons'&&filters.criterion_mode==='lessons'&&filters.criterion){const c=scoring.ITEMS[filters.criterion];listedLessons=c?.kind==='scored'?selected.filter(l=>l.result.value!=null&&scoring.attention(l.criteria[c.code],c.max_score)&&(!filters.maximum||String(l.result.maximum)===filters.maximum)&&(!filters.policy||l.result.policy===filters.policy)):[];}
 const source=selected.flatMap(l=>l.records);
 const view=filters.view||'summary';const paginated=view==='observers'?observationData.details:view==='lessons'?listedLessons:teachers;
 const start=(filters.page-1)*filters.size;
 const options={departments:unique(dataset.lessons.map(l=>String(l.department_id||l.department||''))).filter(Boolean).map(id=>({id,label:dataset.lessons.find(l=>String(l.department_id||l.department||'')===id)?.department||id})),teachers:dataset.roster.map(t=>({id:String(t.id),label:t.label})),classes:unique(dataset.lessons.map(l=>l.class_name||l.class)).filter(Boolean).map(id=>({id,label:id})),subjects:unique(dataset.lessons.map(l=>l.subject)).filter(Boolean).map(id=>({id,label:id})),observers:unique(records.filter(r=>r.checklist.source==='observation').map(r=>String(r.checklist.author_id||''))).filter(Boolean).map(id=>({id,label:records.find(r=>String(r.checklist.author_id)===id)?.author_label||id})),maximums:unique(lessons.filter(l=>l.result.maximum!=null).map(l=>String(l.result.maximum))).map(id=>({id,label:id})),policies:unique(records.map(r=>r.assessment_policy_version)).filter(Boolean).map(id=>({id,label:id}))};
 return {assigned_departments:dataset.assigned_departments||[],queue:selected.filter(l=>['Не отправлено','Есть обновление','Ошибка отправки'].includes(l.report_status)).map(publicLesson),project:dataset.project,aggregation_version:scoring.aggregationVersion(source),assessment_ids:unique(source.map(r=>r.assessment_id).filter(Boolean)),filters,counts:{lessons:selected.filter(l=>l.observation_count).length,observations:selected.reduce((n,l)=>n+l.observation_count,0),self_analyses:selected.reduce((n,l)=>n+l.self_count,0),teachers:unique(selected.filter(l=>l.observation_count).map(l=>l.teacher_id)).length,roster_teachers:roster.length,complete:full.length,incomplete:selected.filter(l=>l.observation_count&&l.result.value==null).length,risk_teachers:unique(risk.map(t=>t.id)).length,self_only:lessons.filter(l=>!l.observation_count&&l.self_count).length,unlinked:records.filter(r=>!r.checklist.lesson_id).length},groups,teachers:view==='teachers'&&settings.paginate!==false?teachers.slice(start,start+filters.size):teachers,departments,criteria,blocks,risk,observer_comparisons,observers:observationData.observers,observer_details:settings.paginate===false?observationData.details:observationData.details.slice(start,start+filters.size),teacher,lesson:lesson?detailLesson(lesson):null,page:{number:filters.page,size:filters.size,total:paginated.length},options,lessons:(view==='lessons'&&settings.paginate!==false?listedLessons.slice(start,start+filters.size):listedLessons).map(publicLesson),message:dataset.message};
}
module.exports={aggregateDashboard,detailLesson,groupCriteria,buildTeacherRows,result,mapSelected};
