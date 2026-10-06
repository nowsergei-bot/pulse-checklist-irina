'use strict';
const assert=require('node:assert/strict');const {test}=require('node:test');
const {dateBounds,normalizeFilters,selectLesson}=require('./visit-checklist-dashboard-filters');
test('Moscow week at a UTC Sunday boundary and exclusive end date',()=>{
 assert.deepEqual(dateBounds('week',null,null,new Date('2026-09-27T21:10:00Z')),{from:'2026-09-28',to:'2026-10-04',end_exclusive:'2026-10-05'});
 assert.equal(dateBounds('school_year',null,null,new Date('2026-10-01T09:00:00Z')).from,'2026-09-01');
});
test('custom dates validate calendar, quarter uses supplied school calendar, all-time retains non-date filters',()=>{
 assert.throws(()=>normalizeFilters({period:'custom',from:'2026-02-31',to:'2026-03-02'}),/Недопустимая дата/);
 assert.throws(()=>dateBounds('quarter','','',new Date('2026-10-01T00:00:00Z')),/учебного календаря/);
 assert.equal(normalizeFilters({period:'all_time',department:'math',level:'Средний'}).department,'math');
 const bounds=dateBounds('quarter','','',new Date('2026-10-01T00:00:00Z'),{quarters:[{from:'2026-09-01',to:'2026-10-25'}]});assert.equal(bounds.to,'2026-10-25');
});
test('A25: matching observer/format selects whole lesson without discarding another observation',()=>{
 const lesson={date:'2026-09-21',department_id:'math',teacher_id:'42',records:[{checklist:{source:'observation',author_id:'1',answers:{}},format:'online'},{checklist:{source:'observation',author_id:'2',answers:{}},format:'offline'}]};
 assert.equal(selectLesson(lesson,normalizeFilters({period:'all_time',observer:'1',format:'online'})),true);assert.equal(lesson.records.length,2);
});
