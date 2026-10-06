'use strict';

const { pickLatestSharedVisitChecklist } = require('./lesson-visit-checklist');
const { notifyRecipient } = require('./protocol-task-notify');
const { catalogPhotoUrls } = require('./staff-photo-catalog');
const {
  teacherKey,
  displayTeacherLabel,
  resolveTeacherName,
  scoreProjectResponses,
  aggregateDashboardKpis,
} = require('./visit-checklist-score');
const { isUnknownTeacherLabel, resolveTeacherLabelFromSchedule } = require('./visit-checklist-schedule-match');
const {
  generateVisitChecklistTeacherAi,
  generateVisitChecklistSchoolAi,
  needsVisitChecklistAiNarrative,
  needsVisitChecklistSchoolAi,
  narrativeSourceForPersist,
  packSchoolAiRecord,
  schoolAiFingerprint,
  shouldPreserveManualNarrative,
  shouldPreserveManualSchoolNarrative,
} = require('./visit-checklist-cloud-ai');

function publicAppBase() {
  return String(process.env.PUBLIC_APP_BASE || '')
    .trim()
    .replace(/\/+$/, '');
}

function cabinetUrl(path) {
  const base = publicAppBase();
  const p = String(path || '').startsWith('/') ? path : `/${path || ''}`;
  return base ? `${base}${p}` : p;
}

function draftFromProjectRow(row) {
  const state = row && row.state_json && typeof row.state_json === 'object' ? row.state_json : {};
  const draft = state.draft && typeof state.draft === 'object' ? state.draft : state;
  return draft && typeof draft === 'object' ? draft : {};
}

async function lookupStaffForTeacher(pool, label) {
  const key = teacherKey(label);
  if (!key) return { staffId: null, email: null };
  const tables = [
    `SELECT id, email, full_name FROM job_description_staff WHERE COALESCE(archived, FALSE) = FALSE`,
    `SELECT id, email, full_name FROM corporate_staff_directory`,
  ];
  for (const sql of tables) {
    try {
      const r = await pool.query(sql);
      for (const row of r.rows || []) {
        if (teacherKey(row.full_name) === key) {
          return {
            staffId: row.id != null ? Number(row.id) : null,
            email: row.email ? String(row.email).trim().toLowerCase() : null,
          };
        }
      }
    } catch {
      /* table may be absent */
    }
  }
  return { staffId: null, email: null };
}

async function loadProjectRow(pool, projectId) {
  const r = await pool.query(
    `SELECT id, title, state_json, user_id, form_token, created_at, updated_at
     FROM lesson_visit_projects WHERE id = $1`,
    [projectId],
  );
  return r.rows[0] || null;
}

async function loadResponseRows(pool, projectId) {
  const r = await pool.query(
    `SELECT id, answers_json, created_at
     FROM lesson_visit_responses
     WHERE project_id = $1
     ORDER BY created_at ASC, id ASC`,
    [projectId],
  );
  return r.rows;
}

async function loadCardRows(pool, projectId) {
  const r = await pool.query(
    `SELECT teacher_key, narrative, narrative_source, status, agreed_at, published_at,
            published_payload, staff_email, staff_id
     FROM lesson_visit_teacher_cards
     WHERE project_id = $1`,
    [projectId],
  );
  return r.rows;
}

async function upsertTeacherStats(pool, projectId, teacher) {
  const stats = teacher.stats;
  const lastVisitAt =
    stats.last_visit && /^\d{4}-\d{2}-\d{2}/.test(String(stats.last_visit.date || ''))
      ? stats.last_visit.date
      : null;
  await pool.query(
    `INSERT INTO lesson_visit_teacher_stats
       (project_id, teacher_key, teacher_label, department, visit_count, last_visit_at, stats_json, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::jsonb, NOW())
     ON CONFLICT (project_id, teacher_key) DO UPDATE SET
       teacher_label = EXCLUDED.teacher_label,
       department = EXCLUDED.department,
       visit_count = EXCLUDED.visit_count,
       last_visit_at = EXCLUDED.last_visit_at,
       stats_json = EXCLUDED.stats_json,
       updated_at = NOW()`,
    [
      projectId,
      teacher.teacher_key,
      stats.teacher_label,
      stats.department || null,
      stats.visit_count,
      lastVisitAt,
      JSON.stringify(stats),
    ],
  );
}

async function ensureTeacherCard(pool, projectId, teacherKeyValue, teacherLabel) {
  const staff = await lookupStaffForTeacher(pool, teacherLabel);
  await pool.query(
    `INSERT INTO lesson_visit_teacher_cards
       (project_id, teacher_key, staff_email, staff_id, updated_at)
     VALUES ($1,$2,$3,$4, NOW())
     ON CONFLICT (project_id, teacher_key) DO UPDATE SET
       staff_email = COALESCE(lesson_visit_teacher_cards.staff_email, EXCLUDED.staff_email),
       staff_id = COALESCE(lesson_visit_teacher_cards.staff_id, EXCLUDED.staff_id)`,
    [projectId, teacherKeyValue, staff.email, staff.staffId],
  );
}

async function readStoredKpis(pool, projectId) {
  try {
    const r = await pool.query(`SELECT kpis_json FROM lesson_visit_dashboard WHERE project_id = $1`, [projectId]);
    const raw = r.rows[0] && r.rows[0].kpis_json;
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

function mergeKpisWithSchoolAi(kpis, schoolAi) {
  const next = { ...(kpis && typeof kpis === 'object' ? kpis : {}) };
  if (schoolAi) next.school_ai = schoolAi;
  else delete next.school_ai;
  return next;
}

async function persistDashboard(pool, projectId, kpis, lastResponseId, extra = {}) {
  const prev = extra.preserveSchoolAi === false ? null : await readStoredKpis(pool, projectId);
  const schoolAi = extra.school_ai !== undefined ? extra.school_ai : prev && prev.school_ai ? prev.school_ai : null;
  const payload = schoolAi ? mergeKpisWithSchoolAi(kpis, schoolAi) : { ...(kpis || {}) };
  await pool.query(
    `INSERT INTO lesson_visit_dashboard (project_id, kpis_json, last_response_id, updated_at)
     VALUES ($1,$2::jsonb,$3, NOW())
     ON CONFLICT (project_id) DO UPDATE SET
       kpis_json = EXCLUDED.kpis_json,
       last_response_id = EXCLUDED.last_response_id,
       updated_at = NOW()`,
    [projectId, JSON.stringify(payload), lastResponseId || null],
  );
  return payload;
}

async function persistSchoolAi(pool, projectId, schoolAi) {
  const prev = (await readStoredKpis(pool, projectId)) || {};
  const { school_ai: _ignored, ...rest } = prev;
  let lastId = rest.last_response_id != null ? rest.last_response_id : null;
  try {
    const col = await pool.query(
      `SELECT last_response_id FROM lesson_visit_dashboard WHERE project_id = $1`,
      [projectId],
    );
    if (col.rows[0] && col.rows[0].last_response_id != null) lastId = col.rows[0].last_response_id;
  } catch {
    /* keep kpis value */
  }
  return persistDashboard(pool, projectId, rest, lastId, {
    school_ai: schoolAi,
    preserveSchoolAi: false,
  });
}

function schoolFillContextFromDashboard(kpis, teachers, cards, lastResponseId, filters) {
  return {
    kpis: kpis || {},
    teachers: teachers || [],
    cards: cards || [],
    lastResponseId: lastResponseId != null ? lastResponseId : kpis && kpis.last_response_id,
    filters: filters && typeof filters === 'object' ? filters : {},
  };
}

function hasSchoolVisits(kpis, teachers) {
  const fromKpis = Number(kpis && kpis.response_count) || 0;
  if (fromKpis > 0) return true;
  return (teachers || []).some((row) => {
    const stats = row.stats || row.stats_json || {};
    return (Number(row.visit_count) || Number(stats.visit_count) || (stats.visits || []).length) > 0;
  });
}

async function loadSchoolFillContext(pool, projectId) {
  const kpis = (await readStoredKpis(pool, projectId)) || {};
  let teachers = [];
  try {
    const stats = await pool.query(
      `SELECT teacher_key, teacher_label, department, visit_count, stats_json
       FROM lesson_visit_teacher_stats
       WHERE project_id = $1`,
      [projectId],
    );
    teachers = (stats.rows || []).map((row) => ({
      teacher_key: row.teacher_key,
      teacher_label: row.teacher_label,
      department: row.department,
      visit_count: row.visit_count,
      stats: row.stats_json,
    }));
  } catch {
    teachers = [];
  }
  let cards = [];
  try {
    cards = await loadCardRows(pool, projectId);
  } catch {
    cards = [];
  }
  let lastResponseId = kpis.last_response_id;
  try {
    const last = await pool.query(
      `SELECT last_response_id FROM lesson_visit_dashboard WHERE project_id = $1`,
      [projectId],
    );
    if (last.rows[0] && last.rows[0].last_response_id != null) lastResponseId = last.rows[0].last_response_id;
  } catch {
    /* keep kpis value */
  }
  return { kpis, teachers, cards, lastResponseId };
}

async function fillSchoolAiIfNeeded(pool, projectId, opts = {}) {
  const loaded =
    opts.kpis && Array.isArray(opts.teachers) && Array.isArray(opts.cards)
      ? null
      : await loadSchoolFillContext(pool, projectId);
  const kpis = opts.kpis && typeof opts.kpis === 'object' ? opts.kpis : (loaded && loaded.kpis) || {};
  const teachers = Array.isArray(opts.teachers) ? opts.teachers : (loaded && loaded.teachers) || [];
  const cards = Array.isArray(opts.cards) ? opts.cards : (loaded && loaded.cards) || [];
  const lastResponseId =
    opts.lastResponseId != null
      ? opts.lastResponseId
      : loaded && loaded.lastResponseId != null
        ? loaded.lastResponseId
        : kpis.last_response_id;
  const current = kpis.school_ai && typeof kpis.school_ai === 'object' ? kpis.school_ai : null;
  if (shouldPreserveManualSchoolNarrative(current)) {
    return { ok: true, skipped: 'manual', school_ai: current };
  }
  if (!hasSchoolVisits(kpis, teachers)) {
    return { ok: true, skipped: 'empty', school_ai: current };
  }
  const ctx = schoolFillContextFromDashboard(kpis, teachers, cards, lastResponseId, opts.filters);
  const fingerprint = schoolAiFingerprint(ctx);
  if (!opts.force && !needsVisitChecklistSchoolAi(current, fingerprint)) {
    return { ok: true, skipped: 'fresh', school_ai: current };
  }
  const generate = opts.generate || generateVisitChecklistSchoolAi;
  const generated = await generate(ctx);
  if (!generated || !String(generated.narrative || '').trim()) {
    return { ok: false, skipped: 'empty', school_ai: current, generated };
  }
  if (generated.error || generated.source === 'fallback') {
    return { ok: false, skipped: 'llm_error', school_ai: current, generated };
  }
  const record = packSchoolAiRecord(generated, fingerprint);
  await persistSchoolAi(pool, projectId, record);
  if (opts.kpis && typeof opts.kpis === 'object') opts.kpis.school_ai = record;
  return { ok: true, skipped: null, school_ai: record, generated };
}

async function loadVisitScheduleRows(opts = {}) {
  if (Object.prototype.hasOwnProperty.call(opts, 'scheduleRows')) {
    return Array.isArray(opts.scheduleRows) ? opts.scheduleRows : [];
  }
  try {
    const { loadRows } = require('../cabinet-lesson-visit-schedule');
    return await loadRows();
  } catch {
    return [];
  }
}

async function scheduleRowsIfUnknown(labels, opts = {}) {
  if (!(labels || []).some((label) => isUnknownTeacherLabel(label))) return [];
  return loadVisitScheduleRows(opts);
}

async function rebuildProjectSnapshot(pool, projectId, opts = {}) {
  const row = opts.projectRow || (await loadProjectRow(pool, projectId));
  if (!row) return { ok: false, reason: 'missing_project' };
  const draft = draftFromProjectRow(row);
  const responses = opts.responses || (await loadResponseRows(pool, projectId));
  let teachers = scoreProjectResponses(draft, responses);
  if (teachers.some((teacher) => isUnknownTeacherLabel(teacher.stats && teacher.stats.teacher_label))) {
    const scheduleRows = await loadVisitScheduleRows(opts);
    if (scheduleRows.length) teachers = scoreProjectResponses(draft, responses, { scheduleRows });
  }
  const existingKeys = new Set();

  for (const teacher of teachers) {
    existingKeys.add(teacher.teacher_key);
    await upsertTeacherStats(pool, projectId, teacher);
    await ensureTeacherCard(pool, projectId, teacher.teacher_key, teacher.stats.teacher_label);
  }

  if (opts.pruneMissing) {
    const stale = await pool.query(
      `SELECT teacher_key FROM lesson_visit_teacher_stats WHERE project_id = $1`,
      [projectId],
    );
    for (const s of stale.rows) {
      if (existingKeys.has(s.teacher_key)) continue;
      await pool.query(
        `DELETE FROM lesson_visit_teacher_stats WHERE project_id = $1 AND teacher_key = $2`,
        [projectId, s.teacher_key],
      );
    }
  }

  const cards = await loadCardRows(pool, projectId);
  const lastId = responses.length ? Number(responses[responses.length - 1].id) : null;
  const kpis = aggregateDashboardKpis(teachers, cards, lastId);
  await persistDashboard(pool, projectId, kpis, lastId);
  return { ok: true, kpis, teacherCount: teachers.length, lastResponseId: lastId };
}

async function resolveTeacherKeyFromResponse(pool, projectId, responseRow, projectRow) {
  const project = projectRow || (await loadProjectRow(pool, projectId));
  if (!project) return null;
  let response = responseRow;
  if (!response || response.answers_json == null) {
    const id = response && response.id;
    if (id == null) return null;
    const r = await pool.query(
      `SELECT id, answers_json, created_at FROM lesson_visit_responses WHERE id = $1 AND project_id = $2`,
      [id, projectId],
    );
    response = r.rows[0];
  }
  if (!response) return null;
  const teachers = scoreProjectResponses(draftFromProjectRow(project), [response]);
  return teachers[0] ? teachers[0].teacher_key : null;
}

async function fillTeacherCardAiIfNeeded(pool, projectId, teacherKeyValue, opts = {}) {
  const card = await readTeacherCard(pool, projectId, teacherKeyValue);
  if (!card) return { ok: false, skipped: 'missing_card' };
  if (shouldPreserveManualNarrative(card)) return { ok: true, skipped: 'manual', card };
  if (!opts.force && !needsVisitChecklistAiNarrative(card)) {
    return { ok: true, skipped: 'has_gigachat', card };
  }
  const generate = opts.generate || generateVisitChecklistTeacherAi;
  const generated = await generate(card);
  if (!generated || !String(generated.narrative || '').trim()) {
    return { ok: false, skipped: 'empty', card, generated };
  }
  if (generated.error || generated.source === 'fallback') {
    return { ok: false, skipped: 'llm_error', card, generated };
  }
  const persist = await patchTeacherCard(
    pool,
    projectId,
    card.teacher_key,
    {
      narrative: generated.narrative,
      narrative_source: narrativeSourceForPersist(generated),
      ai_conclusions: generated.conclusions,
      ai_report: generated.report || null,
      ai_payload_hash: generated.payload_hash || null,
      ai_prompt_version: generated.prompt_version || null,
      ai: true,
    },
    opts.actor || {},
  );
  let school = null;
  if (opts.refreshSchool !== false) {
    try {
      school = await fillSchoolAiIfNeeded(pool, projectId, {
        force: true,
        generate: opts.generateSchool,
      });
    } catch (err) {
      console.warn('visit checklist school ai-on-fill failed', err instanceof Error ? err.message : err);
    }
  }
  return {
    ok: Boolean(persist && persist.ok),
    card: persist && persist.ok ? persist.card : { ...card, narrative: generated.narrative },
    generated,
    school,
    skipped: null,
  };
}

async function applyResponseToSnapshot(pool, projectId, responseRow, projectRow, opts = {}) {
  try {
    const rebuilt = await rebuildProjectSnapshot(pool, projectId, {
      projectRow,
      pruneMissing: false,
    });
    try {
      const key = await resolveTeacherKeyFromResponse(pool, projectId, responseRow, projectRow);
      if (key) {
        await fillTeacherCardAiIfNeeded(pool, projectId, key, {
          force: true,
          refreshSchool: false,
          generate: opts.generate,
          generateSchool: opts.generateSchool,
          actor: opts.actor,
        });
      }
      await fillSchoolAiIfNeeded(pool, projectId, { force: true, generate: opts.generateSchool });
    } catch (err) {
      console.warn('visit checklist ai-on-fill failed', err instanceof Error ? err.message : err);
    }
    return rebuilt;
  } catch (err) {
    const code = err && err.code;
    if (code === '42P01' || code === '42703') {
      return { ok: false, reason: 'schema' };
    }
    throw err;
  }
}

async function resolveDefaultSharedProject(pool) {
  const r = await pool.query(
    `SELECT p.id, p.title, p.state_json, p.user_id, p.form_token, p.created_at, p.updated_at,
            COALESCE((SELECT COUNT(*)::int FROM lesson_visit_responses r WHERE r.project_id = p.id), 0) AS response_count
     FROM lesson_visit_projects p
     WHERE p.user_id IS NULL
     ORDER BY p.id DESC`,
  );
  const latest = pickLatestSharedVisitChecklist(r.rows);
  if (latest) return latest;
  const withAnswers = r.rows
    .slice()
    .sort((a, b) => Number(b.response_count || 0) - Number(a.response_count || 0));
  return withAnswers[0] || null;
}

function teacherPhotos(label) {
  try {
    return catalogPhotoUrls(label) || null;
  } catch {
    return null;
  }
}

function cardTeacherLabel(raw, project, extra = {}) {
  const draft = draftFromProjectRow(project);
  const directory = draft && draft.directory;
  let label = displayTeacherLabel(raw, directory);
  if (!isUnknownTeacherLabel(label)) return label;
  const key = extra.teacher_key != null ? String(extra.teacher_key) : '';
  if (key && key !== String(raw || '').trim()) {
    label = displayTeacherLabel(key, directory);
    if (!isUnknownTeacherLabel(label)) return label;
  }
  const fromSchedule = resolveTeacherLabelFromSchedule(extra.scheduleRows, extra.visits);
  if (fromSchedule) return fromSchedule;
  return label;
}

function cardTeacherPhotos(label) {
  if (!label || label === 'Педагог без ФИО') return null;
  return teacherPhotos(label);
}

function compactTeacherListSections(sections) {
  return (Array.isArray(sections) ? sections : [])
    .filter((sec) => sec && (sec.code || sec.title))
    .map((sec) => ({
      code: String(sec.code || ''),
      title: String(sec.title || sec.code || ''),
      fillRatio: Number(sec.fillRatio) || 0,
    }));
}

function listItemFromStats(row, card, project, scheduleRows) {
  const stats = row.stats_json && typeof row.stats_json === 'object' ? row.stats_json : {};
  const label = cardTeacherLabel(row.teacher_label || stats.teacher_label, project, {
    teacher_key: row.teacher_key,
    visits: stats.visits,
    scheduleRows,
  });
  const photos = cardTeacherPhotos(label);
  const payload = card && card.published_payload && typeof card.published_payload === 'object' ? card.published_payload : {};
  return {
    teacher_key: row.teacher_key,
    teacher_label: label,
    department: row.department || stats.department || '',
    visit_count: Number(row.visit_count) || 0,
    score_ratio: Number(stats.score_ratio) || 0,
    last_visit: stats.last_visit || null,
    photo_url: photos && photos.photo_url ? photos.photo_url : null,
    photo_thumb_url: photos && photos.photo_thumb_url ? photos.photo_thumb_url : null,
    status: card ? card.status : 'draft',
    agreed_at: card ? card.agreed_at : null,
    published_at: card ? card.published_at : null,
    has_narrative: Boolean(card && String(card.narrative || '').trim()),
    has_ai_conclusions: Boolean(payload && payload.ai_conclusions),
    sections: compactTeacherListSections(stats.sections),
  };
}

async function readDashboard(pool, projectId) {
  const project = await loadProjectRow(pool, projectId);
  if (!project) return null;
  let dash = null;
  try {
    const d = await pool.query(
      `SELECT kpis_json, last_response_id, updated_at FROM lesson_visit_dashboard WHERE project_id = $1`,
      [projectId],
    );
    dash = d.rows[0] || null;
  } catch (err) {
    if (err.code === '42P01') return { schemaMissing: true, project };
    throw err;
  }

  const lastResp = await pool.query(
    `SELECT id FROM lesson_visit_responses WHERE project_id = $1 ORDER BY id DESC LIMIT 1`,
    [projectId],
  );
  const latestId = lastResp.rows[0] ? Number(lastResp.rows[0].id) : null;
  if (!dash || (latestId && Number(dash.last_response_id) !== latestId)) {
    await rebuildProjectSnapshot(pool, projectId, { projectRow: project, pruneMissing: true });
    const d2 = await pool.query(
      `SELECT kpis_json, last_response_id, updated_at FROM lesson_visit_dashboard WHERE project_id = $1`,
      [projectId],
    );
    dash = d2.rows[0] || null;
  }

  const stats = await pool.query(
    `SELECT teacher_key, teacher_label, department, visit_count, last_visit_at, stats_json
     FROM lesson_visit_teacher_stats
     WHERE project_id = $1
     ORDER BY teacher_label`,
    [projectId],
  );
  const cards = await loadCardRows(pool, projectId);
  const cardByKey = new Map(cards.map((c) => [c.teacher_key, c]));
  const kpis =
    dash && dash.kpis_json && typeof dash.kpis_json === 'object' ? dash.kpis_json : aggregateDashboardKpis([], []);
  const scheduleRows = await scheduleRowsIfUnknown(
    stats.rows.flatMap((row) => [row.teacher_label, row.teacher_key, row.stats_json && row.stats_json.teacher_label]),
  );
  return {
    project: {
      id: Number(project.id),
      title: draftFromProjectRow(project).title || project.title,
      updated_at: project.updated_at,
    },
    kpis,
    updated_at: dash ? dash.updated_at : null,
    teachers: stats.rows.map((row) => listItemFromStats(row, cardByKey.get(row.teacher_key), project, scheduleRows)),
  };
}

async function readTeacherCard(pool, projectId, key) {
  const teacherKeyValue = teacherKey(key) || String(key || '').trim();
  if (!teacherKeyValue) return null;
  const statsR = await pool.query(
    `SELECT teacher_key, teacher_label, department, visit_count, stats_json
     FROM lesson_visit_teacher_stats
     WHERE project_id = $1 AND teacher_key = $2`,
    [projectId, teacherKeyValue],
  );
  if (!statsR.rows[0]) return null;
  const cardR = await pool.query(
    `SELECT narrative, narrative_source, status, agreed_at, published_at, published_payload, staff_email, staff_id
     FROM lesson_visit_teacher_cards
     WHERE project_id = $1 AND teacher_key = $2`,
    [projectId, teacherKeyValue],
  );
  const statsRow = statsR.rows[0];
  const card = cardR.rows[0] || {
    narrative: '',
    narrative_source: null,
    status: 'draft',
    agreed_at: null,
    published_at: null,
    published_payload: null,
    staff_email: null,
    staff_id: null,
  };
  const stats = statsRow.stats_json && typeof statsRow.stats_json === 'object' ? statsRow.stats_json : {};
  const project = await loadProjectRow(pool, projectId);
  const scheduleRows = await scheduleRowsIfUnknown([
    statsRow.teacher_label,
    stats.teacher_label,
    statsRow.teacher_key,
  ]);
  const label = cardTeacherLabel(statsRow.teacher_label || stats.teacher_label, project, {
    teacher_key: statsRow.teacher_key,
    visits: stats.visits,
    scheduleRows,
  });
  const photos = cardTeacherPhotos(label);
  const payload = card.published_payload && typeof card.published_payload === 'object' ? card.published_payload : {};
  const base = {
    teacher_key: statsRow.teacher_key,
    teacher_label: label,
    department: statsRow.department,
    visit_count: Number(statsRow.visit_count) || 0,
    stats,
    photo_url: photos && photos.photo_url ? photos.photo_url : null,
    photo_thumb_url: photos && photos.photo_thumb_url ? photos.photo_thumb_url : null,
    narrative: String(card.narrative || ''),
    narrative_source: card.narrative_source || null,
    ai_conclusions: payload.ai_conclusions || null,
    ai_report: payload.ai_report || null,
    ai_payload_hash: payload.ai_payload_hash || null,
    ai_prompt_version: payload.ai_prompt_version || null,
    status: card.status || 'draft',
    agreed_at: card.agreed_at || null,
    published_at: card.published_at || null,
    published: Boolean(card.published_at),
    staff_email: card.staff_email || null,
    published_payload: payload,
  };
  return enrichCardStatsFromLiveResponses(pool, projectId, base);
}

async function enrichCardStatsFromLiveResponses(pool, projectId, card) {
  try {
    const project = await loadProjectRow(pool, projectId);
    if (!project) return card;
    const draft = draftFromProjectRow(project);
    const rows = await loadResponseRows(pool, projectId);
    const scheduleRows = await scheduleRowsIfUnknown([card.teacher_label, card.teacher_key]);
    const teachers = scoreProjectResponses(draft, rows, { scheduleRows });
    const hit = teachers.find((row) => row.teacher_key === card.teacher_key);
    if (!hit || !hit.stats) return card;
    const label = cardTeacherLabel(hit.stats.teacher_label || card.teacher_label, project, {
      teacher_key: card.teacher_key,
      visits: hit.stats.visits || (card.stats && card.stats.visits),
      scheduleRows,
    });
    const photos = cardTeacherPhotos(label);
    return {
      ...card,
      teacher_label: label,
      photo_url: (photos && photos.photo_url) || card.photo_url,
      photo_thumb_url: (photos && photos.photo_thumb_url) || card.photo_thumb_url,
      visit_count: Number(hit.stats.visit_count) || card.visit_count,
      stats: {
        ...card.stats,
        ...hit.stats,
        teacher_label: label,
        department: card.department || hit.stats.department,
      },
    };
  } catch {
    return card;
  }
}

function buildPublishedPayload(project, card) {
  const stats = card.stats || {};
  const label = cardTeacherLabel(card.teacher_label, project, {
    teacher_key: card.teacher_key,
    visits: stats.visits,
  });
  const photos = cardTeacherPhotos(label) || teacherPhotos(label);
  return {
    project_id: Number(project.id),
    project_title: project.title,
    teacher_key: card.teacher_key,
    teacher_label: label,
    department: card.department || stats.department || '',
    narrative: card.narrative || '',
    photo_url: card.photo_url || (photos && photos.photo_url) || null,
    photo_thumb_url: card.photo_thumb_url || (photos && photos.photo_thumb_url) || null,
    ai_conclusions: card.ai_conclusions || null,
    ai_report: card.ai_report || null,
    ai_payload_hash: card.ai_payload_hash || null,
    ai_prompt_version: card.ai_prompt_version || null,
    stats: {
      visit_count: stats.visit_count || card.visit_count || 0,
      score_ratio: stats.score_ratio || 0,
      last_visit: stats.last_visit || null,
      sections: stats.sections || [],
      sparkline: stats.sparkline || [],
      subjects: stats.subjects || [],
      classes: stats.classes || [],
      visits: stats.visits || [],
    },
    visits: stats.visits || [],
    published_at: new Date().toISOString(),
  };
}

async function patchTeacherCard(pool, projectId, key, patch, actor) {
  const current = await readTeacherCard(pool, projectId, key);
  if (!current) return { ok: false, code: 404, error: 'Not found' };

  let narrative = current.narrative;
  let narrativeSource = current.narrative_source;
  let status = current.status;
  let agreedAt = current.agreed_at;
  let publishedAt = current.published_at;
  let publishedPayload = null;
  const didPublish = patch.publish === true;
  const aiConclusions = patch.ai_conclusions != null ? patch.ai_conclusions : current.ai_conclusions || null;
  const aiReport = patch.ai_report !== undefined ? patch.ai_report : current.ai_report || null;
  const aiPayloadHash = patch.ai_payload_hash !== undefined ? patch.ai_payload_hash : current.ai_payload_hash || null;
  const aiPromptVersion =
    patch.ai_prompt_version !== undefined ? patch.ai_prompt_version : current.ai_prompt_version || null;

  if (patch.narrative != null) {
    narrative = String(patch.narrative);
    narrativeSource = patch.narrative_source || (patch.ai ? 'llm' : 'manual');
  }

  if (didPublish) {
    const project = await loadProjectRow(pool, projectId);
    const next = {
      ...current,
      narrative,
      status,
      ai_conclusions: aiConclusions,
      ai_report: aiReport,
      ai_payload_hash: aiPayloadHash,
      ai_prompt_version: aiPromptVersion,
    };
    publishedPayload = buildPublishedPayload(
      { id: projectId, title: draftFromProjectRow(project).title || project.title },
      next,
    );
    publishedAt = publishedPayload.published_at;
  } else if (
    patch.ai_conclusions != null ||
    patch.ai_report !== undefined ||
    patch.ai_payload_hash !== undefined ||
    patch.ai_prompt_version !== undefined
  ) {
    const prev = current.published_payload && typeof current.published_payload === 'object' ? current.published_payload : {};
    publishedPayload = {
      ...prev,
      ai_conclusions: aiConclusions,
      ai_report: aiReport,
      ai_payload_hash: aiPayloadHash,
      ai_prompt_version: aiPromptVersion,
    };
  }

  await pool.query(
    `INSERT INTO lesson_visit_teacher_cards
       (project_id, teacher_key, narrative, narrative_source, status, agreed_at, published_at, published_payload, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb, NOW())
     ON CONFLICT (project_id, teacher_key) DO UPDATE SET
       narrative = EXCLUDED.narrative,
       narrative_source = EXCLUDED.narrative_source,
       status = EXCLUDED.status,
       agreed_at = EXCLUDED.agreed_at,
       published_at = EXCLUDED.published_at,
       published_payload = CASE
         WHEN EXCLUDED.published_payload IS NULL THEN lesson_visit_teacher_cards.published_payload
         ELSE EXCLUDED.published_payload
       END,
       updated_at = NOW()`,
    [
      projectId,
      current.teacher_key,
      narrative,
      narrativeSource,
      status,
      agreedAt,
      publishedAt,
      publishedPayload ? JSON.stringify(publishedPayload) : null,
    ],
  );

  if (didPublish && publishedPayload) {
    try {
      await notifyTeacherPublished(pool, current, publishedPayload, actor);
    } catch (err) {
      console.warn('visit-checklist publish notify failed', err instanceof Error ? err.message : err);
    }
  }

  const nextCard = await readTeacherCard(pool, projectId, current.teacher_key);
  return { ok: true, card: nextCard };
}

async function notifyTeacherPublished(pool, card, payload, actor) {
  const email = card.staff_email;
  const staffId = null;
  if (!email && !card.staff_id) {
    const staff = await lookupStaffForTeacher(pool, card.teacher_label);
    if (!staff.email && staff.staffId == null) return null;
    return notifyRecipient(
      pool,
      { email: staff.email, staffId: staff.staffId },
      publishNotifyBody(payload, actor),
    );
  }
  return notifyRecipient(
    pool,
    { email, staffId: card.staff_id || staffId },
    publishNotifyBody(payload, actor),
  );
}

function publishNotifyBody(payload, actor) {
  const title = 'Обратная связь по посещению урока';
  const body = `Карточка «${payload.teacher_label}» отправлена в кабинет педагога.`;
  return {
    kind: 'visit_checklist_published',
    title,
    body,
    payload: {
      href: '/cabinet/feedback/me',
      teacher_key: payload.teacher_key,
      project_id: payload.project_id,
      actor: actor && actor.email ? actor.email : null,
    },
    link: cabinetUrl('/cabinet/feedback/me'),
    emailSubject: title,
    emailHtml: `<p>${body}</p><p>Откройте раздел «Чек-лист посещения урока» в кабинете Пульса.</p>`,
  };
}

function identityNames(user, extraName) {
  return [user && user.display_name, user && user.full_name, extraName]
    .map((n) => teacherKey(n))
    .filter(Boolean);
}

async function staffNameForUser(pool, user) {
  const email = String((user && user.email) || '')
    .trim()
    .toLowerCase();
  if (!email) return null;
  try {
    const r = await pool.query(
      `SELECT full_name FROM job_description_staff
       WHERE lower(trim(email)) = $1 AND COALESCE(archived, FALSE) = FALSE
       LIMIT 1`,
      [email],
    );
    return r.rows[0] && r.rows[0].full_name ? String(r.rows[0].full_name) : null;
  } catch {
    return null;
  }
}

async function readMyPublishedCards(pool, user) {
  const extra = await staffNameForUser(pool, user);
  const names = identityNames(user, extra);
  const email = String((user && user.email) || '')
    .trim()
    .toLowerCase();
  const r = await pool.query(
    `SELECT c.project_id, c.teacher_key, c.teacher_key AS key, c.published_payload, c.published_at,
            c.staff_email, p.title
     FROM lesson_visit_teacher_cards c
     JOIN lesson_visit_projects p ON p.id = c.project_id
     WHERE c.published_at IS NOT NULL`,
  );
  const cards = [];
  for (const row of r.rows) {
    const payload = row.published_payload && typeof row.published_payload === 'object' ? row.published_payload : null;
    if (!payload) continue;
    const key = teacherKey(row.teacher_key);
    const emailMatch = email && row.staff_email && String(row.staff_email).toLowerCase() === email;
    const nameMatch = names.includes(key) || names.includes(teacherKey(payload.teacher_label));
    if (!emailMatch && !nameMatch) continue;
    const photos = teacherPhotos(payload.teacher_label);
    cards.push({
      project_id: Number(row.project_id),
      project_title: payload.project_title || row.title,
      teacher_key: row.teacher_key,
      published_at: row.published_at,
      card: {
        ...payload,
        photo_url: payload.photo_url || (photos && photos.photo_url) || null,
        photo_thumb_url: payload.photo_thumb_url || (photos && photos.photo_thumb_url) || null,
      },
    });
  }
  cards.sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
  return cards;
}

module.exports = {
  draftFromProjectRow,
  lookupStaffForTeacher,
  rebuildProjectSnapshot,
  applyResponseToSnapshot,
  fillSchoolAiIfNeeded,
  fillTeacherCardAiIfNeeded,
  resolveTeacherKeyFromResponse,
  resolveDefaultSharedProject,
  readDashboard,
  readTeacherCard,
  patchTeacherCard,
  readMyPublishedCards,
  buildPublishedPayload,
  teacherKey,
  resolveTeacherName,
  compactTeacherListSections,
  listItemFromStats,
  cardTeacherLabel,
};
