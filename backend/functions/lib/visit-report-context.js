'use strict';

const { problem } = require('./visit-report-delivery');

/** Shared permission predicate for analytics, export, report preparation and direct URLs. */
async function authorizeVisitReport(db, actor, action, lesson) {
  if (!actor?.id) throw problem(403,'Нужна сессия пользователя');
  const binding = lesson.lesson || lesson;
  const lessonId = binding.id ?? binding.lesson_id;
  const departmentId = binding.department_id ?? binding.department;
  const granted = await db.query(`SELECT 1 FROM pulse_visit_report_grants WHERE user_id=$1 AND action=$2
    AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())
    AND (lesson_id IS NULL OR lesson_id=$3) AND (department_id IS NULL OR department_id=$4) LIMIT 1`,
  [actor.id,action,String(lessonId),departmentId == null ? null : String(departmentId)]);
  if (!granted.rows.length) throw problem(403,'Нет доступа к данным урока');
}

/** Inject the same server context used by dashboard; never read untrusted client results. */
function createVisitReportContext(shared) {
  if (typeof shared?.readLesson !== 'function' || typeof shared?.readExportContext !== 'function') {
    throw problem(503,'Единый серверный контекст аналитики не подключён');
  }
  return {
    authorize: shared.authorize || authorizeVisitReport,
    async readLesson(db,actor,id) {
      // pg Pool and Client both expose connect; hide Client.connect from nested consistentRead.
      const reader = typeof db.release === 'function' ? {query:db.query.bind(db)} : db;
      const context = await shared.readLesson(reader,actor,id);
      if (!context) return null;
      const lesson = context.lesson;
      const lessonId = lesson.id ?? lesson.lesson_id;
      if (String(lessonId) !== String(id)) throw problem(500,'Контекст относится к другому уроку');
      if (context.checklists.some(r => String(r.checklist.lesson_id) !== String(id))) throw problem(500,'В отчёте обнаружен чужой чек-лист');
      const bound = (await db.query(`SELECT b.teacher_user_id,u.display_name,u.email
        FROM pulse_visit_report_lesson_bindings b JOIN users u ON u.id=b.teacher_user_id WHERE b.lesson_id=$1`,[String(id)])).rows[0];
      if (!bound) throw problem(409,'Урок не связан с ID учителя. Требуется сверка данных');
      return { ...context,checklists:context.checklists.map(record => {
        const individual = lesson.checklists?.find(item => item.id === record.checklist.checklist_id);
        return {...record,...(individual ? {result:individual.result} : {})};
      }),teacher_user_id:bound.teacher_user_id,recipient_name:bound.display_name || bound.email };
    },
    async readExportContext(db,actor,filters) {
      async function read(readDb) {
      // Remove pagination in the provider, retaining filters and sorting.
      const selection = {...filters}; delete selection.page; delete selection.page_size;
      const context = await shared.readExportContext(readDb,actor,selection);
      for (const lesson of context.lessons || []) {
        await (shared.authorize || authorizeVisitReport)(readDb,actor,'view',{lesson});
        await (shared.authorize || authorizeVisitReport)(readDb,actor,'export',{lesson});
      }
      const currentRecords=context.checklists || [];
      const lessonIds = (context.lessons || []).map(lesson => String(lesson.id ?? lesson.lesson_id));
      const projectId = Number(selection.project || context.checklists?.find(record => record.project_id)?.project_id);
      if (lessonIds.length && projectId) {
        const history = await readDb.query(`SELECT a.assessment_id,a.assessment_policy_version,v.checklist_json AS checklist,
          r.results_json AS results,v.created_at,v.editor_id,v.revision<>c.current_revision AS old_revision,
          r.assessment_policy_version<>$3 AS archived
          FROM pulse_v3_checklists c JOIN pulse_v3_revisions v ON v.project_id=c.project_id AND v.checklist_id=c.checklist_id
          JOIN pulse_v3_assessments a ON a.project_id=v.project_id AND a.checklist_id=v.checklist_id AND a.revision=v.revision
          JOIN pulse_v3_runs r ON r.run_id=a.run_id
          WHERE c.project_id=$1 AND c.lesson_id=ANY($2::text[]) AND NOT(a.assessment_id=ANY($4::uuid[]))
          ORDER BY v.checklist_id,v.revision,a.accepted_at`,
        [projectId,lessonIds,context.checklists?.find(record => record.assessment_policy_version)?.assessment_policy_version || '',context.assessment_ids]);
        // History supplements the workbook without affecting the current aggregation version or counters.
        context.checklists = [...context.checklists,...history.rows.map(row => ({...row,
          historical:!row.archived || row.old_revision,archived:row.archived,author:row.checklist.author_id}))];
        const attempts=await readDb.query(`SELECT a.snapshot_id,p.lesson_id,a.sender_user_id,p.recipient_user_id,a.started_at,a.finished_at,a.status,a.error
          FROM pulse_visit_report_attempts a JOIN pulse_visit_report_previews p USING(snapshot_id)
          WHERE p.lesson_id=ANY($1::text[]) AND a.status<>'delivered' ORDER BY a.started_at`,[lessonIds]);
        context.deliveries=[...(context.deliveries || []).map(row=>{
          const {snapshot,...metadata}=row;
          return {...metadata,assessment_ids:snapshot?.assessment_ids || [],Статус:row.opened_at?'Открыто учителем':'Отправлено'};
        }),
          ...attempts.rows.map(row=>({...row,'Вид записи':'Попытка отправки',Статус:row.status==='sending'?'Отправляется':'Ошибка отправки'}))];
      }
      context.lessons=await require('./visit-report-statuses').decorateVisitReportStatuses(readDb,context.lessons || [],currentRecords);
      return context;
      }
      if (typeof db.connect !== 'function' || typeof db.release === 'function') return read({query:db.query.bind(db)});
      const tx=await db.connect();
      try {
        await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const context=await read({query:tx.query.bind(tx)});
        await tx.query('COMMIT'); return context;
      } catch (error) { await tx.query('ROLLBACK'); throw error; }
      finally { tx.release(); }
    },
  };
}

module.exports = { authorizeVisitReport,createVisitReportContext };
