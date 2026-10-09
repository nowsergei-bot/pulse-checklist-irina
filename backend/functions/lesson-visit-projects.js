const { randomUUID } = require('crypto');
const { json } = require('./lib/http');
const { parseAllowedBody } = require('./lib/validation');
const {
  VISIT_CHECKLIST_TITLE,
  displayVisitChecklistTitle,
  normalizeSavedChecklist,
  resolvePublicLessonVisitDirectory,
  pickLatestSharedVisitChecklist,
  buildTeacherUnitMap,
  sanitizeNewTeacherIds,
} = require('./lib/lesson-visit-checklist');
const { buildProjectGetPayload } = require('./lib/project-get-payload');
const { resolveProjectOwner } = require('./lib/resolve-project-owner');
const {
  canViewSharedVisitChecklistAnalytics,
  canUseDirectorSummary,
  visitChecklistAnalyticsActor,
} = require('./lib/visit-checklist-analytics-access');
const { maybeNotifyKhoroshilovVisitChecklist } = require('./lib/khoroshilov-activity-notify');
const { applyResponseToSnapshot, rebuildProjectSnapshot } = require('./lib/visit-checklist-cloud-snapshot');

function emptyDraft(title) {
  return {
    v: 1,
    title: title || VISIT_CHECKLIST_TITLE,
    updatedAt: new Date().toISOString(),
    checklist: null,
    directory: { departments: [], teachers: [] },
    allowMultipleResponses: true,
    lessonAnalyticsProjectId: null,
  };
}

function requireAccess(user, viaAdminKey, sessionUser) {
  const scope = resolveProjectOwner(user, viaAdminKey, sessionUser);
  if (!scope.ok) {
    return json(403, {
      error: 'Forbidden',
      message: 'Нужна сессия или X-Api-Key.',
    });
  }
  return null;
}

/** PostgreSQL: 42P01 — нет таблицы, 42703 — нет колонки (миграции 030 / 025). */
function schemaErrorResponse(err) {
  if (!err || !err.code) return null;
  const detail = String(err.message || '');
  if (err.code === '42P01') {
    if (/lesson_visit/i.test(detail)) {
      return json(503, {
        error: 'База данных не обновлена',
        message:
          'Нет таблиц чек-листа посещения урока. В Neon SQL Editor выполните backend/db/migrations/030_lesson_visit_projects.sql.',
      });
    }
    if (/lesson_analytics_projects/i.test(detail)) {
      return json(503, {
        error: 'База данных не обновлена',
        message:
          'Нет таблицы lesson_analytics_projects. Выполните backend/db/migrations/021_lesson_analytics_projects.sql.',
      });
    }
    return json(503, {
      error: 'База данных не обновлена',
      message: 'Отсутствует таблица в БД. Примените миграции из backend/db/migrations/, начиная с 030_lesson_visit_projects.sql.',
    });
  }
  if (err.code === '42703') {
    if (/director_share_token/i.test(detail) && /lesson_analytics/i.test(detail)) {
      return json(503, {
        error: 'База данных не обновлена',
        message:
          'В lesson_analytics_projects нет director_share_token. Выполните backend/db/migrations/025_director_share_analytics_projects.sql.',
      });
    }
    return json(503, {
      error: 'База данных не обновлена',
      message:
        'В таблице проектов не хватает колонок. Проверьте миграции 025 и 030 в backend/db/migrations/.',
    });
  }
  return null;
}

/** Экран «Сводка для директора» и список новых учителей: только по почте серверной сессии, ключ API не подходит. */
function isDirectorSummaryUser(viaAdminKey, user, sessionUser) {
  return !viaAdminKey && canUseDirectorSummary(visitChecklistAnalyticsActor(user, sessionUser));
}

function isSharedVisitViewer(user, sessionUser) {
  return canViewSharedVisitChecklistAnalytics(visitChecklistAnalyticsActor(user, sessionUser));
}

async function assertScope(pool, projectId, scope, opts) {
  const r = await pool.query(`SELECT id, user_id FROM lesson_visit_projects WHERE id = $1`, [projectId]);
  if (!r.rows.length) return { ok: false, code: 404 };
  const row = r.rows[0];
  if (scope.apiKey === true) {
    if (row.user_id == null) return { ok: true, row };
    return { ok: false, code: 404 };
  }
  if (row.user_id != null && Number(row.user_id) === Number(scope.userId)) return { ok: true, row };
  if (opts?.readShared && row.user_id == null) return { ok: true, row };
  return { ok: false, code: 404 };
}

async function loadProjectByFormToken(pool, tokenRaw) {
  const token = String(tokenRaw || '').trim();
  if (!token || token.length > 80) return null;
  const r = await pool.query(
    `SELECT id, title, state_json, updated_at, form_token, director_share_token
     FROM lesson_visit_projects
     WHERE form_token = $1
     LIMIT 1`,
    [token],
  );
  if (!r.rows.length) return null;
  const row = r.rows[0];
  if (String(row.form_token || '') !== token) return null;
  return row;
}

async function loadProjectByDirectorToken(pool, tokenRaw) {
  const token = String(tokenRaw || '').trim();
  if (!token || token.length > 80) return null;
  const r = await pool.query(
    `SELECT id, title, state_json, updated_at, form_token, director_share_token
     FROM lesson_visit_projects
     WHERE director_share_token = $1
     LIMIT 1`,
    [token],
  );
  if (!r.rows.length) return null;
  const row = r.rows[0];
  if (String(row.director_share_token || '') !== token) return null;
  return row;
}

function normalizeDraft(row) {
  const state = row.state_json && typeof row.state_json === 'object' ? row.state_json : {};
  const base = state.draft && typeof state.draft === 'object' ? state.draft : emptyDraft(row.title);
  const merged = {
    ...emptyDraft(row.title),
    ...base,
    title: displayVisitChecklistTitle(base.title || row.title),
    allowMultipleResponses: base.allowMultipleResponses !== false,
    directory: resolvePublicLessonVisitDirectory(
      base.directory && typeof base.directory === 'object'
        ? {
            departments: Array.isArray(base.directory.departments) ? base.directory.departments : [],
            teachers: Array.isArray(base.directory.teachers) ? base.directory.teachers : [],
          }
        : { departments: [], teachers: [] },
    ),
  };
  if (merged.checklist) merged.checklist = normalizeSavedChecklist(merged.checklist);
  return merged;
}

async function countResponses(pool, projectId) {
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM lesson_visit_responses WHERE project_id = $1`, [projectId]);
  return r.rows[0]?.c ?? 0;
}

async function listResponseRows(pool, projectId, limit = 5000) {
  const r = await pool.query(
    `SELECT id, answers_json, created_at
     FROM lesson_visit_responses
     WHERE project_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [projectId, limit],
  );
  return r.rows.map((row) => {
    const aj = row.answers_json && typeof row.answers_json === 'object' ? row.answers_json : {};
    return {
      id: row.id,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      general: aj.general && typeof aj.general === 'object' ? aj.general : {},
      answers: aj.answers && typeof aj.answers === 'object' ? aj.answers : {},
    };
  });
}

async function handleListLessonVisitProjects(pool, user, viaAdminKey, sessionUser) {
  const denied = requireAccess(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  const scope = resolveProjectOwner(user, viaAdminKey, sessionUser);
  const sharedViewer = isSharedVisitViewer(user, sessionUser);
  try {
    const r =
      scope.apiKey === true
        ? await pool.query(
            `SELECT p.id, p.title, p.created_at, p.updated_at, p.form_token, p.director_share_token,
                    COALESCE((SELECT COUNT(*)::int FROM lesson_visit_responses r WHERE r.project_id = p.id), 0) AS response_count,
                    COALESCE(p.state_json->'draft'->>'lessonAnalyticsDirectorToken', '') AS la_director_token
             FROM lesson_visit_projects p
             WHERE p.user_id IS NULL
             ORDER BY p.updated_at DESC
             LIMIT 100`,
          )
        : sharedViewer
          ? await pool.query(
              `SELECT p.id, p.title, p.created_at, p.updated_at, p.form_token, p.director_share_token,
                      COALESCE((SELECT COUNT(*)::int FROM lesson_visit_responses r WHERE r.project_id = p.id), 0) AS response_count,
                      COALESCE(p.state_json->'draft'->>'lessonAnalyticsDirectorToken', '') AS la_director_token
               FROM lesson_visit_projects p
               WHERE p.user_id = $1 OR p.user_id IS NULL
               ORDER BY p.updated_at DESC
               LIMIT 100`,
              [scope.userId],
            )
          : await pool.query(
            `SELECT p.id, p.title, p.created_at, p.updated_at, p.form_token, p.director_share_token,
                    COALESCE((SELECT COUNT(*)::int FROM lesson_visit_responses r WHERE r.project_id = p.id), 0) AS response_count,
                    COALESCE(p.state_json->'draft'->>'lessonAnalyticsDirectorToken', '') AS la_director_token
             FROM lesson_visit_projects p
             WHERE p.user_id = $1
             ORDER BY p.updated_at DESC
             LIMIT 100`,
            [scope.userId],
          );
    return json(200, {
      projects: r.rows.map((p) => ({ ...p, title: displayVisitChecklistTitle(p.title) })),
    });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handlePostLessonVisitProject(pool, user, viaAdminKey, sessionUser, event) {
  const denied = requireAccess(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  const scope = resolveProjectOwner(user, viaAdminKey, sessionUser);
  const body = parseAllowedBody(event, ['title', 'draft']);
  const draftFromBody = body.draft && typeof body.draft === 'object' ? body.draft : null;
  const title = displayVisitChecklistTitle(
    String(body.title || (draftFromBody && draftFromBody.title) || VISIT_CHECKLIST_TITLE),
  ).slice(0, 500);
  const directorSummary = isDirectorSummaryUser(viaAdminKey, user, sessionUser);
  const draft = draftFromBody
    ? {
        ...emptyDraft(title),
        ...draftFromBody,
        v: 1,
        title: displayVisitChecklistTitle(String(draftFromBody.title || title)).slice(0, 500),
        updatedAt: new Date().toISOString(),
        checklist: draftFromBody.checklist
          ? normalizeSavedChecklist(draftFromBody.checklist)
          : draftFromBody.checklist,
      }
    : emptyDraft(title);
  if (!directorSummary) delete draft.newTeacherIds;

  const uidParam = scope.apiKey === true ? null : scope.userId;
  const formToken = randomUUID().replace(/-/g, '');
  const shareToken = randomUUID().replace(/-/g, '');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO lesson_visit_projects (user_id, title, state_json, form_token, director_share_token)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       RETURNING id, title, created_at, updated_at, form_token, director_share_token`,
      [uidParam, title, JSON.stringify({ draft }), formToken, shareToken],
    );
    const project = ins.rows[0];

    const laIns = await client.query(
      `INSERT INTO lesson_analytics_projects (user_id, title, state_json, director_share_token)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id, director_share_token`,
      [
        uidParam,
        title,
        JSON.stringify({
          draft: {
            title,
            updatedAt: new Date().toISOString(),
            excelSession: null,
            teacherBlocks: [],
          },
        }),
        randomUUID().replace(/-/g, ''),
      ],
    );
    const laId = laIns.rows[0].id;
    const laDirectorToken = laIns.rows[0].director_share_token;
    draft.lessonAnalyticsProjectId = laId;
    draft.lessonAnalyticsDirectorToken = laDirectorToken;
    await client.query(`UPDATE lesson_visit_projects SET state_json = $2::jsonb WHERE id = $1`, [
      project.id,
      JSON.stringify({ draft }),
    ]);
    await client.query('COMMIT');
    return json(201, { project: { ...project, response_count: 0 }, draft });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* transaction may not have started */
    }
    const mapped = schemaErrorResponse(e);
    if (mapped) return mapped;
    throw e;
  } finally {
    client.release();
  }
}

const STAFF_UNITS_TIMEOUT_MS = 3000;

/** Один запрос к справочнику; на стороне БД ограничен по времени, чтобы не занимать соединение. */
async function readStaffRows(pool) {
  const sql = `SELECT full_name, department FROM job_description_staff WHERE COALESCE(archived, FALSE) = FALSE`;
  if (typeof pool.connect !== 'function') return (await pool.query(sql)).rows;
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${STAFF_UNITS_TIMEOUT_MS}`);
    const r = await client.query(sql);
    await client.query('COMMIT');
    return r.rows;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* соединение уже недоступно */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Подразделения из справочника сотрудников (только чтение, без архивных, один запрос).
 * Только для аналитики. Сбой или задержка дольше 3 с не ломают ответ проекта: подразделений просто нет.
 */
async function loadTeacherUnits(pool, draft) {
  const teachers = draft && draft.directory && Array.isArray(draft.directory.teachers) ? draft.directory.teachers : [];
  if (!teachers.length) return {};
  let timer;
  try {
    const work = readStaffRows(pool);
    work.catch(() => {});
    const limit = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), STAFF_UNITS_TIMEOUT_MS + 500);
    });
    return buildTeacherUnitMap(await Promise.race([work, limit]), teachers);
  } catch (err) {
    console.error('[lesson-visit-projects] teacher units unavailable', (err && err.code) || 'error');
    return {};
  } finally {
    clearTimeout(timer);
  }
}

async function handleGetLessonVisitProject(pool, user, viaAdminKey, sessionUser, projectId) {
  const pid = Number(projectId);
  if (!Number.isFinite(pid)) return json(400, { error: 'Invalid id' });
  const denied = requireAccess(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  const scope = resolveProjectOwner(user, viaAdminKey, sessionUser);
  try {
    const check = await assertScope(pool, pid, scope, {
      readShared: isSharedVisitViewer(user, sessionUser),
    });
    if (!check.ok) return json(check.code, { error: 'Not found' });

    const r = await pool.query(
      `SELECT id, title, state_json, created_at, updated_at, form_token, director_share_token
       FROM lesson_visit_projects WHERE id = $1`,
      [pid],
    );
    const row = r.rows[0];
    const draft = normalizeDraft(row);
    const response_count = await countResponses(pool, pid);
    const presented = { ...row, title: draft.title };
    // Подразделения отдаём только аналитике (сессия с правом на сводку или ключ API), не владельцу личного проекта.
    const staff_units =
      viaAdminKey || isSharedVisitViewer(user, sessionUser) ? await loadTeacherUnits(pool, draft) : {};
    // Признак считает сервер по сессии; список новых учителей получает только тот, кому открыт экран директора.
    const directorSummary = isDirectorSummaryUser(viaAdminKey, user, sessionUser);
    const { newTeacherIds: _hidden, ...draftWithoutList } = draft;
    const visibleDraft = directorSummary ? draft : draftWithoutList;
    const payload = buildProjectGetPayload(presented, visibleDraft);
    return json(200, {
      ...payload,
      project: { ...payload.project, form_token: row.form_token, response_count },
      staff_units,
      directorSummary,
    });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

/**
 * Узкий режим PUT: `{ patch: { newTeacherIds: [...] } }` меняет только draft.newTeacherIds.
 * Допуск: только тот, кому открыт экран директора (по почте серверной сессии), и только к своему
 * или общему проекту (как чтение). Ключ API, владелец без этого права и аналитики получают 403.
 * Другие поля, название, updated_at и остальной черновик не затрагиваются.
 */
async function patchNewTeacherIds(pool, user, viaAdminKey, sessionUser, scope, pid, body) {
  const patch = body.patch;
  const keys = patch && typeof patch === 'object' && !Array.isArray(patch) ? Object.keys(patch) : [];
  if (body.draft !== undefined || body.title !== undefined || keys.length !== 1 || keys[0] !== 'newTeacherIds') {
    return json(400, { error: 'Bad request', message: 'Разрешено менять только newTeacherIds.' });
  }
  if (!isDirectorSummaryUser(viaAdminKey, user, sessionUser)) {
    return json(403, { error: 'Forbidden', message: 'Список новых учителей может менять только директор.' });
  }
  const check = await assertScope(pool, pid, scope, { readShared: isSharedVisitViewer(user, sessionUser) });
  if (!check.ok) return json(check.code, { error: 'Not found' });
  const r = await pool.query(`SELECT id, title, state_json FROM lesson_visit_projects WHERE id = $1`, [pid]);
  if (!r.rows.length) return json(404, { error: 'Not found' });
  const ids = sanitizeNewTeacherIds(patch.newTeacherIds, normalizeDraft(r.rows[0]).directory.teachers);
  if (!ids) return json(400, { error: 'Bad request', message: 'newTeacherIds: нужен список ID учителей.' });
  await pool.query(
    `UPDATE lesson_visit_projects
     SET state_json = jsonb_set(state_json, '{draft}', COALESCE(state_json->'draft', '{}'::jsonb) || jsonb_build_object('newTeacherIds', $2::jsonb), true)
     WHERE id = $1`,
    [pid, JSON.stringify(ids)],
  );
  return json(200, { ok: true, newTeacherIds: ids });
}

/** Возвращает в записываемый черновик уже сохранённый newTeacherIds (если он там есть). */
const KEEP_STORED_NEW_TEACHER_IDS = ` || CASE WHEN jsonb_typeof(state_json->'draft'->'newTeacherIds') = 'array'
         THEN jsonb_build_object('newTeacherIds', state_json->'draft'->'newTeacherIds') ELSE '{}'::jsonb END`;

async function handlePutLessonVisitProject(pool, user, viaAdminKey, sessionUser, projectId, event) {
  const pid = Number(projectId);
  if (!Number.isFinite(pid)) return json(400, { error: 'Invalid id' });
  const denied = requireAccess(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  const scope = resolveProjectOwner(user, viaAdminKey, sessionUser);
  try {
    const body = parseAllowedBody(event, ['title', 'draft', 'patch']);
    if (body.patch !== undefined) {
      return await patchNewTeacherIds(pool, user, viaAdminKey, sessionUser, scope, pid, body);
    }
    const check = await assertScope(pool, pid, scope);
    if (!check.ok) return json(check.code, { error: 'Not found' });

    const draft = body.draft && typeof body.draft === 'object' ? body.draft : null;
    if (!draft) return json(400, { error: 'draft required' });

    const title = displayVisitChecklistTitle(
      body.title != null ? String(body.title).trim() : String(draft.title || ''),
    ).slice(0, 500);

    // Сохранённый список новых учителей меняет только директор; при обычной записи он остаётся как был.
    const keepStoredList = !isDirectorSummaryUser(viaAdminKey, user, sessionUser);
    const { newTeacherIds: _incoming, ...draftWithoutList } = draft;
    const nextDraft = {
      ...(keepStoredList ? draftWithoutList : draft),
      v: 1,
      title: displayVisitChecklistTitle(String(draft.title || title)).slice(0, 500),
      updatedAt: new Date().toISOString(),
      checklist: draft.checklist ? normalizeSavedChecklist(draft.checklist) : draft.checklist,
    };

    const updScope = scope.apiKey === true ? 'AND user_id IS NULL' : 'AND user_id = $4';
    const params =
      scope.apiKey === true
        ? [pid, title, JSON.stringify({ draft: nextDraft })]
        : [pid, title, JSON.stringify({ draft: nextDraft }), scope.userId];

    const u = await pool.query(
      `UPDATE lesson_visit_projects
       SET title = $2, state_json = jsonb_set(state_json, '{draft}', (($3::jsonb)->'draft'${keepStoredList ? KEEP_STORED_NEW_TEACHER_IDS : ''}), true), updated_at = NOW()
       WHERE id = $1 ${updScope}
       RETURNING id, form_token, director_share_token`,
      params,
    );
    if (!u.rows.length) return json(404, { error: 'Not found' });

    const response_count = await countResponses(pool, pid);
    return json(200, {
      project: {
        id: pid,
        title,
        updated_at: new Date().toISOString(),
        form_token: u.rows[0].form_token,
        director_share_token: u.rows[0].director_share_token,
        response_count,
      },
      draft: nextDraft,
    });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handleDeleteLessonVisitProject(pool, user, viaAdminKey, sessionUser, projectId) {
  const pid = Number(projectId);
  if (!Number.isFinite(pid)) return json(400, { error: 'Invalid id' });
  const denied = requireAccess(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  const scope = resolveProjectOwner(user, viaAdminKey, sessionUser);
  try {
    const check = await assertScope(pool, pid, scope);
    if (!check.ok) return json(check.code, { error: 'Not found' });

    const delScope = scope.apiKey === true ? 'AND user_id IS NULL' : 'AND user_id = $2';
    const delParams = scope.apiKey === true ? [pid] : [pid, scope.userId];
    const d = await pool.query(
      `DELETE FROM lesson_visit_projects WHERE id = $1 ${delScope} RETURNING id`,
      delParams,
    );
    if (!d.rows.length) return json(404, { error: 'Not found' });
    return json(200, { ok: true });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handleGetPublicLatestLessonVisitForm(pool) {
  try {
    const r = await pool.query(
      `SELECT id, title, created_at, form_token, state_json
       FROM lesson_visit_projects
       WHERE user_id IS NULL
         AND COALESCE(form_token, '') <> ''
       ORDER BY created_at DESC NULLS LAST, id DESC
       LIMIT 80`,
    );
    const picked = pickLatestSharedVisitChecklist(r.rows);
    if (!picked) return json(404, { error: 'Not found' });
    const draft = normalizeDraft(picked);
    return json(200, {
      form_token: picked.form_token,
      title: displayVisitChecklistTitle(draft.title || picked.title),
      id: picked.id,
    });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handleGetPublicLessonVisitForm(pool, tokenRaw) {
  try {
    const row = await loadProjectByFormToken(pool, tokenRaw);
    if (!row) return json(404, { error: 'Not found' });
    const draft = normalizeDraft(row);
    if (!draft.checklist) return json(500, { error: 'Checklist not configured' });
    const photos =
      draft.media && Array.isArray(draft.media.photos)
        ? draft.media.photos.filter((p) => p && typeof p.src === 'string' && p.src.trim())
        : [];
    return json(200, {
      project: { id: row.id, title: draft.title, updated_at: row.updated_at },
      checklist: draft.checklist,
      directory: draft.directory,
      media: photos.length ? { photos } : undefined,
      allow_multiple_responses: draft.allowMultipleResponses !== false,
    });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handlePostPublicLessonVisitResponse(pool, tokenRaw, event) {
  try {
    const row = await loadProjectByFormToken(pool, tokenRaw);
    if (!row) return json(404, { error: 'Not found' });

    const body = parseAllowedBody(event, ['general', 'answers']);
    const general = body.general && typeof body.general === 'object' ? body.general : {};
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};

    const ins = await pool.query(
      `INSERT INTO lesson_visit_responses (project_id, answers_json)
       VALUES ($1, $2::jsonb)
       RETURNING id, created_at`,
      [row.id, JSON.stringify({ general, answers })],
    );

    await pool.query(`UPDATE lesson_visit_projects SET updated_at = NOW() WHERE id = $1`, [row.id]);

    const draft = normalizeDraft(row);
    let pulseV3;
    try {
      pulseV3 = await require('./lib/pulse-v3-integration').captureResponse(pool, row.id, draft.checklist, { ...ins.rows[0], answers_json: { general, answers } });
    } catch (err) {
      pulseV3 = { status: err.code === '42P01' ? 'migration_required' : 'mapping_error' };
      console.warn('pulse v3 source capture failed', err instanceof Error ? err.message : err);
    }
    try {
      await applyResponseToSnapshot(pool, row.id, ins.rows[0], row);
    } catch (err) {
      console.warn('visit checklist snapshot failed', err instanceof Error ? err.message : err);
    }
    void maybeNotifyKhoroshilovVisitChecklist(pool, {
      general,
      directory: draft.directory,
      responseId: ins.rows[0].id,
    });

    return json(201, {
      ok: true,
      response: {
        id: ins.rows[0].id,
        created_at: ins.rows[0].created_at,
        pulse_v3: pulseV3,
      },
    });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handleDeleteLessonVisitResponse(pool, user, viaAdminKey, sessionUser, projectId, responseId) {
  const pid = Number(projectId);
  const rid = Number(responseId);
  if (!Number.isFinite(pid) || !Number.isFinite(rid)) return json(400, { error: 'Invalid id' });
  const denied = requireAccess(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  const scope = resolveProjectOwner(user, viaAdminKey, sessionUser);
  try {
    const check = await assertScope(pool, pid, scope);
    if (!check.ok) return json(check.code, { error: 'Not found' });

    let r;
    try {
      r = await require('./lib/pulse-v3-store').deleteResponse(pool, pid, rid);
    } catch (err) {
      if (err.code !== '42P01') throw err;
      r = await pool.query('DELETE FROM lesson_visit_responses WHERE id=$1 AND project_id=$2 RETURNING id', [rid, pid]);
    }
    if (!r.rows.length) return json(404, { error: 'Not found' });
    void rebuildProjectSnapshot(pool, pid, { pruneMissing: true }).catch((err) => {
      console.warn('visit checklist snapshot rebuild failed', err instanceof Error ? err.message : err);
    });
    return json(200, { ok: true, id: r.rows[0].id });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handleListLessonVisitResponses(pool, user, viaAdminKey, sessionUser, projectId) {
  const pid = Number(projectId);
  if (!Number.isFinite(pid)) return json(400, { error: 'Invalid id' });
  const denied = requireAccess(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  const scope = resolveProjectOwner(user, viaAdminKey, sessionUser);
  try {
    const check = await assertScope(pool, pid, scope, {
      readShared: isSharedVisitViewer(user, sessionUser),
    });
    if (!check.ok) return json(check.code, { error: 'Not found' });

    const rows = await listResponseRows(pool, pid);
    return json(200, { responses: rows });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function handleGetPublicLessonVisitDirector(pool, tokenRaw) {
  try {
    const row = await loadProjectByDirectorToken(pool, tokenRaw);
    if (!row) return json(404, { error: 'Not found' });
    // Список новых учителей нужен только внутренней аналитике, по публичной ссылке его не отдаём.
    const { newTeacherIds: _hidden, ...draft } = normalizeDraft(row);
    const responses = await listResponseRows(pool, row.id);
    return json(200, {
      project: { id: row.id, title: draft.title, updated_at: row.updated_at },
      draft,
      responses,
      lessonAnalyticsProjectId: draft.lessonAnalyticsProjectId ?? null,
    });
  } catch (err) {
    const mapped = schemaErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

module.exports = {
  handleListLessonVisitProjects,
  handlePostLessonVisitProject,
  handleGetLessonVisitProject,
  handlePutLessonVisitProject,
  handleDeleteLessonVisitProject,
  handleGetPublicLessonVisitForm,
  handleGetPublicLatestLessonVisitForm,
  handlePostPublicLessonVisitResponse,
  handleListLessonVisitResponses,
  handleDeleteLessonVisitResponse,
  handleGetPublicLessonVisitDirector,
  emptyDraft,
  normalizeDraft,
  listResponseRows,
};
