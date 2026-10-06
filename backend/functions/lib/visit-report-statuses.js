'use strict';

const metadataKeys = ['id','date','teacher_id','teacher_label','department','department_id','class_name','subject','topic','adjustment','adjustment_reason'];
const clean = value => JSON.parse(JSON.stringify(value));

/** Two batched SQL queries for all visible lessons; use already authorized dashboard records. */
async function decorateVisitReportStatuses(db,lessons,records) {
  if (!lessons.length) return lessons;
  const score = require('./pulse-v3-score');
  const rows = (await db.query(`SELECT DISTINCT ON(d.lesson_id) d.*,u.display_name AS sender_name
    FROM pulse_visit_report_deliveries d JOIN users u ON u.id=d.sender_user_id
    JOIN pulse_visit_report_lesson_bindings b ON b.lesson_id=d.lesson_id AND b.teacher_user_id=d.recipient_user_id
    WHERE d.lesson_id=ANY($1::text[]) ORDER BY d.lesson_id,d.version DESC`,[lessons.map(lesson=>String(lesson.id))])).rows;
  const latest = new Map(rows.map(row=>[row.lesson_id,row]));
  const attempts=(await db.query(`SELECT DISTINCT ON(p.lesson_id) a.*,p.lesson_id,
    EXISTS(SELECT 1 FROM pulse_visit_report_deliveries d WHERE d.lesson_id=p.lesson_id AND d.recipient_user_id=p.recipient_user_id AND d.content_hash=p.content_hash) AS delivered
    FROM pulse_visit_report_attempts a JOIN pulse_visit_report_previews p USING(snapshot_id)
    JOIN pulse_visit_report_lesson_bindings b ON b.lesson_id=p.lesson_id AND b.teacher_user_id=p.recipient_user_id
    WHERE p.lesson_id=ANY($1::text[]) ORDER BY p.lesson_id,a.started_at DESC`,[lessons.map(lesson=>String(lesson.id))])).rows;
  const lastAttempt=new Map(attempts.map(row=>[row.lesson_id,row]));
  return lessons.map(lesson=>{
    const last = latest.get(String(lesson.id));
    const attempt=lastAttempt.get(String(lesson.id));
    const sending=attempt && !attempt.delivered && attempt.status==='sending' && Date.now()-new Date(attempt.started_at).getTime()<5*60*1000;
    const error=attempt && !attempt.delivered ? attempt.error || 'Попытка отправки не завершена' : undefined;
    if (!last) return {...lesson,report_status:sending?'Отправляется':error?'Ошибка отправки':'Не отправлено',report_error:error};
    const related = records.filter(record=>String(record.checklist.lesson_id)===String(lesson.id));
    const metadata = Object.fromEntries(metadataKeys.filter(key=>Object.hasOwn(last.snapshot.lesson,key) && lesson[key]!==undefined).map(key=>[key,lesson[key]]));
    const stale = score.aggregationVersion(related)!==last.aggregation_version
      || score.canonicalHash(clean(metadata))!==score.canonicalHash(last.snapshot.lesson)
      || score.canonicalHash(clean(lesson.result.value ?? null))!==score.canonicalHash(last.snapshot.result.final ?? null);
    return {...lesson,report_status:sending?'Отправляется':stale?'Есть обновление':error?'Ошибка отправки':last.opened_at?'Открыто учителем':'Отправлено',report_error:error,
      report_sent_at:last.sent_at,report_sender_name:last.sender_name,report_version:last.version,
      report_action:stale?'Отправить обновление':'Предпросмотр отчёта'};
  });
}

async function readVisitReportStatuses(db,actor,query) {
  const shared = require('./visit-checklist-v3-analytics');
  return shared.consistentRead(db,async tx=>{
    let projectId = Number(query.project);
    if (!projectId) projectId=(await require('./visit-checklist-cloud-snapshot').resolveDefaultSharedProject(tx))?.id;
    if (!projectId) return [];
    const dataset=await shared.readDataset(tx,actor,projectId,query,'view');
    if (!dataset) return [];
    const dashboard=require('./visit-checklist-dashboard-aggregate').aggregateDashboard(dataset,query,undefined,{paginate:false});
    return decorateVisitReportStatuses(tx,dashboard.lessons,dataset.records);
  });
}
module.exports = {decorateVisitReportStatuses,readVisitReportStatuses};
