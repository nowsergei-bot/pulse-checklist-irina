'use strict';

const { json, parseBody, parseQuery } = require('./lib/http');
const { pickAllowedFields } = require('./lib/validation');
const { resolveProjectOwner } = require('./lib/resolve-project-owner');
const {
  canViewSharedVisitChecklistAnalytics,
  visitChecklistAnalyticsActor,
} = require('./lib/visit-checklist-analytics-access');
const {
  applyResponseToSnapshot,
  fillSchoolAiIfNeeded,
  patchTeacherCard,
  readDashboard,
  readMyPublishedCards,
  readTeacherCard,
  rebuildProjectSnapshot,
  resolveDefaultSharedProject,
} = require('./lib/visit-checklist-cloud-snapshot');
const {
  generateVisitChecklistTeacherAi,
  narrativeSourceForPersist,
  shouldPreserveManualNarrative,
  teacherAiCacheHit,
} = require('./lib/visit-checklist-cloud-ai');
const { prepareVisitChecklistDashboard } = require('./lib/visit-checklist-prepare');

function schemaErrorResponse(err) {
  if (!err || !err.code) return null;
  if (err.code === '42P01' || err.code === '42703') {
    return json(503, {
      error: 'База данных не обновлена',
      message:
        'Нет таблиц облачного дашборда чек-листа. Выполните backend/db/migrations/084_lesson_visit_cloud_dashboard.sql.',
    });
  }
  return null;
}

function requireSession(user, viaAdminKey, sessionUser) {
  const scope = resolveProjectOwner(user, viaAdminKey, sessionUser);
  if (!scope.ok) {
    return json(401, { error: 'unauthorized', message: 'Нужен вход в Пульс.' });
  }
  return null;
}

function isAnalyst(user, viaAdminKey, sessionUser) {
  if (viaAdminKey) return true;
  return canViewSharedVisitChecklistAnalytics(visitChecklistAnalyticsActor(user, sessionUser));
}

function requireAnalyst(user, viaAdminKey, sessionUser) {
  const denied = requireSession(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  if (!isAnalyst(user, viaAdminKey, sessionUser)) {
    return json(403, { error: 'Forbidden', message: 'Нет доступа к аналитике чек-листа.' });
  }
  return null;
}

async function resolveProjectId(pool, raw) {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  const row = await resolveDefaultSharedProject(pool);
  return row ? Number(row.id) : null;
}

async function handleGetDashboardV3(pool, user, viaAdminKey, sessionUser, event, teacherKey) {
  const denied = requireSession(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  const actor = visitChecklistAnalyticsActor(user, sessionUser);
  try {
    const query = parseQuery(event);
    if (teacherKey === '__department_assignments__') {
      const projectId = await resolveProjectId(pool, query.project);
      if (!projectId) return json(404, {error:'Нет общего проекта чек-листа.'});
      return json(200, await require('./lib/visit-checklist-department-assignments').readAssignments(pool, actor, projectId, viaAdminKey));
    }
  if (!actor?.id) return json(401, { error: 'Нужна сессия пользователя для проверки доступа к кафедрам.' });
    if (teacherKey) { query.teacher = decodeURIComponent(String(teacherKey)); query.view = 'teacher'; }
    const projectId = await resolveProjectId(pool, query.project);
    if (!projectId) return json(404, { error: 'Нет общего проекта чек-листа.' });
    const { readDashboardV3 } = require('./lib/visit-checklist-v3-analytics');
    const data = await readDashboardV3(pool, actor, projectId, query);
    if (!data) return json(404, { error: 'Проект не найден.' });
    if (query.teacher && !data.teacher) return json(404, { error: 'Учитель недоступен в выбранном отборе.' });
    if (query.lesson && !data.lesson) return json(404, { error: 'Урок недоступен в выбранном отборе.' });
    return json(200, data);
  } catch (err) {
    if (err.httpStatus) return json(err.httpStatus, { error: err.publicError || err.message });
    if (err.code === '42P01' || err.code === '42703') return json(503, { error: 'Хранение оценок и прав v3 ещё не настроено. Нужны миграции оценивания и доставки.' });
    throw err;
  }
}

async function handleGetVisitChecklistDashboard(pool, user, viaAdminKey, sessionUser, event) {
  if (parseQuery(event).version === 'pulse-v3') return handleGetDashboardV3(pool, user, viaAdminKey, sessionUser, event);
  const denied = requireAnalyst(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  try {
    const q = parseQuery(event);
    const projectId = await resolveProjectId(pool, q.project);
    if (!projectId) {
      return json(200, {
        project: null,
        kpis: {
          response_count: 0,
          teacher_count: 0,
          agreed_count: 0,
          published_count: 0,
          department_count: 0,
          avg_score_ratio: 0,
          sections: [],
        },
        teachers: [],
        message: 'Нет общего проекта чек-листа.',
      });
    }
    const data = await readDashboard(pool, projectId);
    if (data && data.schemaMissing) {
      return json(503, {
        error: 'База данных не обновлена',
        message:
          'Нет таблиц облачного дашборда чек-листа. Выполните backend/db/migrations/084_lesson_visit_cloud_dashboard.sql.',
      });
    }
    if (!data) return json(404, { error: 'Not found' });
    return json(200, data);
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handleGetVisitChecklistDashboardTeacher(pool, user, viaAdminKey, sessionUser, event, teacherKeyRaw) {
  if (parseQuery(event).version === 'pulse-v3') return handleGetDashboardV3(pool, user, viaAdminKey, sessionUser, event, teacherKeyRaw);
  const denied = requireAnalyst(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  try {
    const q = parseQuery(event);
    const projectId = await resolveProjectId(pool, q.project);
    if (!projectId) return json(404, { error: 'Not found' });
    const card = await readTeacherCard(pool, projectId, decodeURIComponent(String(teacherKeyRaw || '')));
    if (!card) return json(404, { error: 'Not found' });
    return json(200, { project_id: projectId, card });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handlePatchVisitChecklistDashboardTeacher(pool, user, viaAdminKey, sessionUser, event, teacherKeyRaw) {
  if (parseQuery(event).version === 'pulse-v3' && teacherKeyRaw === '__department_assignments__') {
    const denied = requireSession(user, viaAdminKey, sessionUser); if (denied) return denied;
    try {const pid = await resolveProjectId(pool, parseQuery(event).project); if (!pid) return json(404, {error:'Нет проекта'});
      return json(200, await require('./lib/visit-checklist-department-assignments').changeAssignment(pool, visitChecklistAnalyticsActor(user,sessionUser), pid, parseBody(event), viaAdminKey));
    } catch(err) {if(err.httpStatus)return json(err.httpStatus,{error:err.publicError||err.message});const mapped=schemaErrorResponse(err);if(mapped)return mapped;throw err;}
  }
  const denied = requireAnalyst(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  try {
    const q = parseQuery(event);
    const projectId = await resolveProjectId(pool, q.project);
    if (!projectId) return json(404, { error: 'Not found' });
    const body = pickAllowedFields(parseBody(event), [
      'publish',
      'ai_conclusions',
      'ai_report',
      'ai_payload_hash',
      'ai_prompt_version',
      'narrative',
      'narrative_source',
      'ai',
    ]);
    const actor = visitChecklistAnalyticsActor(user, sessionUser);
    const result = await patchTeacherCard(
      pool,
      projectId,
      decodeURIComponent(String(teacherKeyRaw || '')),
      body,
      actor,
    );
    if (!result.ok) return json(result.code || 400, { error: result.error || 'Bad request' });
    return json(200, { project_id: projectId, card: result.card });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handleGetVisitChecklistDashboardMe(pool, user, viaAdminKey, sessionUser) {
  const denied = requireSession(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  try {
    const actor = visitChecklistAnalyticsActor(user, sessionUser);
    const cards = await readMyPublishedCards(pool, actor);
    return json(200, { cards });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handlePostVisitChecklistDashboardTeacherAi(pool, user, viaAdminKey, sessionUser, event, teacherKeyRaw) {
  const denied = requireAnalyst(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  try {
    const q = parseQuery(event);
    const projectId = await resolveProjectId(pool, q.project);
    if (!projectId) return json(404, { error: 'Not found' });
    const card = await readTeacherCard(pool, projectId, decodeURIComponent(String(teacherKeyRaw || '')));
    if (!card) return json(404, { error: 'Not found' });
    const body = pickAllowedFields(parseBody(event), ['force']);
    const force = q.force === '1' || body.force === true;
    const cachedNarrative = String(card.narrative || '').trim();
    if (shouldPreserveManualNarrative(card)) {
      return json(200, {
        project_id: projectId,
        card,
        narrative: card.narrative,
        conclusions: card.ai_conclusions || null,
        report: card.ai_report || null,
        source: 'manual',
        locked: true,
        error: null,
        insufficient: false,
        message: 'Текст методиста не перезаписан.',
      });
    }
    if (!force && teacherAiCacheHit(card) && cachedNarrative) {
      return json(200, {
        project_id: projectId,
        card,
        narrative: card.narrative,
        conclusions: card.ai_conclusions || null,
        report: card.ai_report || null,
        source: 'cache',
        error: null,
        insufficient: false,
      });
    }
    const generated = await generateVisitChecklistTeacherAi(card);
    if (generated.insufficient) {
      return json(200, {
        project_id: projectId,
        card,
        narrative: '',
        conclusions: generated.conclusions,
        report: null,
        source: 'insufficient',
        error: generated.error || null,
        insufficient: true,
      });
    }
    if (generated.error || generated.source === 'fallback') {
      return json(200, {
        project_id: projectId,
        card,
        narrative: generated.narrative || card.narrative,
        conclusions: generated.conclusions,
        report: generated.report || null,
        source: generated.source || 'fallback',
        error: generated.error || 'Справка ещё готовится. Нажмите «Обновить».',
        insufficient: false,
      });
    }
    const persist = await patchTeacherCard(
      pool,
      projectId,
      card.teacher_key,
      {
        narrative: generated.narrative || card.narrative,
        narrative_source: narrativeSourceForPersist(generated),
        ai_conclusions: generated.conclusions,
        ai_report: generated.report || null,
        ai_payload_hash: generated.payload_hash || null,
        ai_prompt_version: generated.prompt_version || null,
        ai: true,
      },
      visitChecklistAnalyticsActor(user, sessionUser),
    );
    const next = persist.ok
      ? persist.card
      : {
          ...card,
          narrative: generated.narrative,
          ai_conclusions: generated.conclusions,
          ai_report: generated.report || null,
        };
    try {
      await fillSchoolAiIfNeeded(pool, projectId, { force: true });
    } catch (err) {
      console.warn('visit checklist school ai after teacher-ai failed', err instanceof Error ? err.message : err);
    }
    return json(200, {
      project_id: projectId,
      card: next,
      narrative: generated.narrative,
      conclusions: generated.conclusions,
      report: generated.report || next.ai_report || null,
      source: generated.source,
      error: generated.error || null,
      insufficient: Boolean(generated.insufficient),
    });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handlePostVisitChecklistDashboardSchoolAi(pool, user, viaAdminKey, sessionUser, event) {
  const denied = requireAnalyst(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  try {
    const q = parseQuery(event);
    const projectId = await resolveProjectId(pool, q.project);
    if (!projectId) return json(404, { error: 'Not found' });
    const body = pickAllowedFields(parseBody(event), ['force', 'filters']);
    const force = q.force === '1' || body.force === true;
    const filters = body.filters && typeof body.filters === 'object' ? { status: body.filters.status || 'all' } : {};
    const filled = await fillSchoolAiIfNeeded(pool, projectId, { force, filters });
    if (filled.skipped === 'empty') {
      return json(200, {
        project_id: projectId,
        school_ai: filled.school_ai || null,
        source: 'insufficient',
        error: 'Недостаточно данных: в текущем срезе нет посещений.',
        insufficient: true,
      });
    }
    const record = filled.school_ai || null;
    const generated = filled.generated || null;
    return json(200, {
      project_id: projectId,
      school_ai: record,
      source: filled.skipped === 'fresh' || filled.skipped === 'manual' ? 'cache' : (generated && generated.source) || (record && record.source) || 'llm',
      error: (generated && generated.error) || (record && record.error) || null,
      insufficient: Boolean(generated && generated.insufficient),
    });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handlePostVisitChecklistDashboardPrepare(pool, user, viaAdminKey, sessionUser, event) {
  const denied = requireAnalyst(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  try {
    const q = parseQuery(event);
    const projectId = await resolveProjectId(pool, q.project);
    if (!projectId) return json(404, { error: 'Not found' });
    const prepared = await prepareVisitChecklistDashboard(
      pool,
      projectId,
      visitChecklistAnalyticsActor(user, sessionUser),
    );
    return json(200, prepared);
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handlePostVisitChecklistDashboardRebuild(pool, user, viaAdminKey, sessionUser, event) {
  const denied = requireAnalyst(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  try {
    const q = parseQuery(event);
    const projectId = await resolveProjectId(pool, q.project);
    if (!projectId) return json(404, { error: 'Not found' });
    const rebuilt = await rebuildProjectSnapshot(pool, projectId, { pruneMissing: true });
    const data = await readDashboard(pool, projectId);
    return json(200, { rebuilt, ...data });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

module.exports = {
  handleGetDashboardV3,
  handleGetVisitChecklistDashboard,
  handleGetVisitChecklistDashboardTeacher,
  handlePatchVisitChecklistDashboardTeacher,
  handleGetVisitChecklistDashboardMe,
  handlePostVisitChecklistDashboardTeacherAi,
  handlePostVisitChecklistDashboardSchoolAi,
  handlePostVisitChecklistDashboardPrepare,
  handlePostVisitChecklistDashboardRebuild,
  applyResponseToSnapshot,
};
