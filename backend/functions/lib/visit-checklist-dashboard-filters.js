'use strict';
const DAY = 86400000;
function bad(message) { const e=new Error(message);e.httpStatus=400;e.publicError=message;return e; }
function isoDate(value) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw bad('Дата должна иметь формат ГГГГ-ММ-ДД');
 const d=new Date(`${value}T00:00:00Z`);if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value)throw bad('Недопустимая дата');return value;
}
function dateBounds(period,from,to,now=new Date(),calendar={}) {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const d=new Date(`${today}T00:00:00Z`);const y=d.getUTCFullYear(),m=d.getUTCMonth();const iso=v=>new Date(v).toISOString().slice(0,10);
 if(period==='all_time')return {from:'',to:'',end_exclusive:''};
 if(period==='week'){from=iso(+d-((d.getUTCDay()+6)%7)*DAY);to=iso(new Date(`${from}T00:00:00Z`).getTime()+6*DAY);}
 else if(period==='month'){from=iso(Date.UTC(y,m,1));to=iso(Date.UTC(y,m+1,0));}
 else if(period==='school_year'){const start=m>=8?y:y-1;from=`${start}-09-01`;to=`${start+1}-08-31`;}
 else if(period==='quarter' && (!from||!to)) { const quarter=(calendar.quarters||[]).find(q=>q.from<=today&&q.to>=today);if(!quarter)throw bad('Для четверти нужны даты из учебного календаря. Укажите начало и конец периода.');from=quarter.from;to=quarter.to; }
 else if(!['custom','quarter'].includes(period))throw bad('Неизвестный период');
 isoDate(from);isoDate(to);if(from>to)throw bad('Начало периода позже окончания');
 return {from,to,end_exclusive:iso(new Date(`${to}T00:00:00Z`).getTime()+DAY)};
}
function normalizeFilters(query={},now,calendar) {
 const filters={};for(const key of ['department','teacher_filter','class','subject','format','level','selected_level','selection','calculation','observer','search','sort','policy','maximum','criterion','criterion_mode','teacher','lesson','view'])filters[key]=String(query[key]||'').trim().slice(0,200);
 filters.period=String(query.period||'week');const reference=filters.period==='week'&&query.week_start?new Date(`${isoDate(String(query.week_start))}T09:00:00Z`):now;Object.assign(filters,dateBounds(filters.period,query.from,query.to,reference,calendar));
 filters.page=Math.max(1,Math.min(100000,Number.parseInt(query.page,10)||1));filters.size=Math.max(1,Math.min(100,Number.parseInt(query.size,10)||30));
 if(filters.maximum&&!['100','98','97','95'].includes(filters.maximum))throw bad('Недопустимый доступный максимум');
 if(filters.format&&!['offline','online'].includes(filters.format))throw bad('Неизвестный формат посещения');
 return filters;
}
function inDate(date,filters) { return !filters.from || Boolean(date && date>=filters.from&&date<filters.end_exclusive); }
function matchingObservation(record,filters) {
 return record.checklist.source==='observation' && (!filters.observer||String(record.checklist.author_id)===filters.observer) && (!filters.format||record.format===filters.format);
}
function selectLesson(lesson,filters) {
 if(!inDate(lesson.date,filters))return false;
 if(filters.department&&String(lesson.department_id)!==filters.department)return false;
 if(filters.teacher_filter&&String(lesson.teacher_id)!==filters.teacher_filter)return false;
 if(filters.class&&lesson.class_name!==filters.class)return false;
 if(filters.subject&&lesson.subject!==filters.subject)return false;
 if(filters.selected_level&&!lesson.records.some(r=>r.checklist.source==='observation'&&(r.checklist.answers['10.1']?.selected_options||[]).some(o=>o.label.toLocaleLowerCase('ru-RU')===filters.selected_level.toLocaleLowerCase('ru-RU'))))return false;
 // Select a lesson, retaining every permitted current observation in its result.
 if((filters.observer||filters.format)&&!lesson.records.some(r=>matchingObservation(r,filters)))return false;
 return true;
}
module.exports={bad,isoDate,dateBounds,normalizeFilters,inDate,matchingObservation,selectLesson};
