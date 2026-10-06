'use strict';

const { randomUUID } = require('crypto');

function problem(status, message) {
  const error = new Error(message);
  error.httpStatus = status;
  error.publicError = message;
  return error;
}

/** Data comes exclusively from the shared accepted-assessment reader, never from a request body. */
function createDeliveryService({ repository, readLesson, authorize, canonicalHash }) {
  async function context(db, actor, lessonId, action) {
    const lesson = await readLesson(db, actor, lessonId);
    if (!lesson) throw problem(404, 'Урок не найден');
    await authorize(db, actor, action, lesson);
    if (!lesson.teacher_user_id) throw problem(409, 'Учитель урока не связан с ID пользователя');
    if (!lesson.aggregation_version || !Array.isArray(lesson.assessment_ids)) {
      throw problem(503, 'Не сформирован единый контекст оценивания');
    }
    return lesson;
  }
  function content(lesson, comment) {
    // Explicit allowlist prevents a teacher report from including other teachers' rankings.
    const metadata = lesson.lesson;
    return JSON.parse(JSON.stringify({
      lesson: Object.fromEntries(['id','date','teacher_id','teacher_label','department','department_id','class_name','subject','topic','adjustment','adjustment_reason']
        .filter(key => metadata[key] !== undefined).map(key => [key,metadata[key]])),
      teacher_user_id: lesson.teacher_user_id,
      recipient_name: lesson.recipient_name,
      aggregation_version: lesson.aggregation_version,
      assessment_ids: lesson.assessment_ids,
      checklists: lesson.checklists.map(record => Object.fromEntries(['checklist','results','assessment_id','assessment_policy_version','author','format','created_at','result','comparison']
        .filter(key => record[key] !== undefined).map(key => [key,record[key]]))),
      result: lesson.result,
      attention: lesson.attention,
      manager_comment: comment,
    }));
  }
  return {
    async preview(db, actor, lessonId, comment = '') {
      if (typeof comment !== 'string') throw problem(400, 'Комментарий должен быть текстом');
      const lesson = await context(db, actor, lessonId, 'send');
      const snapshot = content(lesson, comment);
      const row = await repository.savePreview(db, {
        snapshot_id: randomUUID(), lesson_id: String(lessonId), sender_user_id: actor.id,
        recipient_user_id: lesson.teacher_user_id, content_hash: canonicalHash(snapshot),
        aggregation_version: lesson.aggregation_version, snapshot,
      });
      return row;
    },
    async send(db, actor, snapshotId, requestKey) {
      if (typeof requestKey !== 'string' || !requestKey.trim() || requestKey.length > 200) {
        throw problem(400, 'Требуется ключ отправки');
      }
      await repository.startAttempt?.(db,actor,snapshotId,requestKey);
      try { return await repository.transaction(db, async (tx) => {
        async function delivered(report) {await repository.finishAttempt?.(tx,actor,requestKey,'delivered');return report;}
        await repository.lockRequest?.(tx,actor.id,requestKey);
        const preview = await repository.getPreview(tx, snapshotId, actor.id);
        if (!preview) throw problem(404, 'Предпросмотр не найден');
        await repository.lockLesson(tx, preview.lesson_id);
        const lesson = await context(tx, actor, preview.lesson_id, 'send');
        const retry = await repository.findRequest(tx, actor.id, requestKey);
        if (retry) {
          if (retry.content_hash !== preview.content_hash || String(retry.lesson_id) !== String(preview.lesson_id)) {
            throw problem(409, 'Ключ отправки уже использован для другого отчёта');
          }
          return delivered(retry);
        }
        // Repeat of an already sent snapshot returns its exact immutable report, including after later edits.
        const sent = await repository.findContent(tx, preview.lesson_id, preview.recipient_user_id, preview.content_hash);
        if (sent) {
          await repository.saveRequest(tx, actor.id, requestKey, sent.snapshot_id);
          return delivered(sent);
        }
        if (canonicalHash(content(lesson, preview.snapshot.manager_comment)) !== preview.content_hash) {
          throw problem(409, 'Данные изменились. Требуется новый предпросмотр отчёта');
        }
        const delivery = await repository.publish(tx, preview, actor);
        await repository.saveRequest(tx, actor.id, requestKey, delivery.snapshot_id);
        // Notification and immutable snapshot commit together; no SMTP or AI side effects.
        await repository.notify(tx, delivery);
        return delivered(delivery);
      }); } catch(error) {
        await repository.finishAttempt?.(db,actor,requestKey,'failed',error.publicError || (error.httpStatus ? error.message : 'Не удалось отправить отчёт'));
        throw error;
      }
    },
    async mine(db, actor) {
      return repository.listMine(db, actor.id);
    },
    async open(db, actor, snapshotId) {
      return repository.transaction(db, async (tx) => {
        const report = await repository.getMine(tx, actor.id, snapshotId);
        if (!report) throw problem(404, 'Отчёт не найден');
        return repository.markOpened(tx, actor.id, snapshotId);
      });
    },
    async status(db, actor, lessonId) {
      const lesson = await context(db, actor, lessonId, 'view');
      const last = await repository.latest(db, lessonId, lesson.teacher_user_id);
      const attempt = await repository.latestAttempt?.(db,lessonId,lesson.teacher_user_id);
      if (attempt && !attempt.delivered && attempt.status==='sending' && Date.now()-new Date(attempt.started_at).getTime()<5*60*1000) {
        return {...(last || {}),status:'Отправляется'};
      }
      if (last && canonicalHash(content(lesson,last.snapshot.manager_comment))!==last.content_hash) {
        return {...last,status:'Есть обновление',error:attempt && !attempt.delivered ? attempt.error : undefined};
      }
      if (attempt && !attempt.delivered) return {...(last || {}),status:'Ошибка отправки',error:attempt.error || 'Попытка отправки не завершена'};
      if (!last) return { status: 'Не отправлено' };
      const current = content(lesson, last.snapshot.manager_comment);
      return { ...last, status: canonicalHash(current) !== last.content_hash
        ? 'Есть обновление' : last.opened_at ? 'Открыто учителем' : 'Отправлено' };
    },
  };
}

module.exports = { createDeliveryService, problem };
