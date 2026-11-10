'use strict';

/**
 * Чек-лист феноменального урока: отдельный общий проект чек-листа посещения.
 * Новых таблиц и маршрутов нет: используются lesson_visit_projects / lesson_visit_responses
 * и существующие адреса публичной формы. Проект с постоянным form_token создаётся при первом обращении.
 * Ответы этого проекта не попадают в аналитику основного чек-листа.
 */

const { randomUUID } = require('crypto');

const PHENOMENON_KIND = 'phenomenon';
const PHENOMENON_FORM_TOKEN = 'phenomenon-lesson-2026';
const PHENOMENON_FORM_VERSION = 'phenomenon-2026-11';
const PHENOMENON_TITLE = 'Чек-лист феноменального урока';

/** Допустимые варианты по вопросам. Совпадает с frontend/src/lib/phenomenonChecklist/form.ts (проверяется тестом). */
const PHENOMENON_CHOICES = {
  ph_org: ['none', 'partly', 'full'],
  ph_objectives: ['none', 'teachers', 'joint', 'students'],
  ph_method: ['none', 'frontal', 'varied'],
  ph_phenomenon: ['none', 'parallel', 'teachers_link', 'students_link'],
  ph_coteaching: ['turns', 'formal', 'complement', 'integrated'],
  ph_tools: ['high', 'medium', 'low', 'missing_hurt', 'not_needed'],
  ph_reflection: ['none', 'formal', 'meaningful'],
  ph_engagement: ['all', 'most', 'some', 'none'],
  ph_communication: ['poor', 'formal', 'good'],
  ph_overall: ['very_high', 'high', 'average', 'below_average', 'low'],
};
const PHENOMENON_MASTERY_IDS = ['ph_mastery_1', 'ph_mastery_2'];
const PHENOMENON_COMMENTS_ID = 'ph_comments';
const REQUIRED_GENERAL = ['date', 'observer_name', 'class_name', 'students_count', 'lesson_number', 'teacher1_name', 'teacher2_name'];
const GENERAL_KEYS = [...REQUIRED_GENERAL, 'teacher1_id', 'teacher2_id'];

function draftOf(stateJson) {
  const state = stateJson && typeof stateJson === 'object' ? stateJson : {};
  return state.draft && typeof state.draft === 'object' ? state.draft : state;
}

function isPhenomenonDraft(draft) {
  return Boolean(draft && typeof draft === 'object' && draft.kind === PHENOMENON_KIND);
}

function isPhenomenonRow(row) {
  if (!row) return false;
  if (String(row.form_token || '') === PHENOMENON_FORM_TOKEN) return true;
  return isPhenomenonDraft(draftOf(row.state_json));
}

function isPhenomenonToken(token) {
  return String(token || '').trim() === PHENOMENON_FORM_TOKEN;
}

function phenomenonDraft() {
  return {
    v: 1,
    kind: PHENOMENON_KIND,
    title: PHENOMENON_TITLE,
    updatedAt: new Date().toISOString(),
    checklist: { kind: PHENOMENON_KIND, formVersion: PHENOMENON_FORM_VERSION },
    directory: { departments: [], teachers: [] },
    allowMultipleResponses: true,
    lessonAnalyticsProjectId: null,
  };
}

/**
 * Находит общий проект феноменального урока; если его нет, создаёт (user_id NULL, один раз:
 * уникальный индекс по form_token не даёт создать второй).
 */
async function ensurePhenomenonProject(pool) {
  const select = `SELECT id, title, state_json, updated_at, form_token, director_share_token
                  FROM lesson_visit_projects WHERE form_token = $1 LIMIT 1`;
  const found = await pool.query(select, [PHENOMENON_FORM_TOKEN]);
  if (found.rows.length) return found.rows[0];
  await pool.query(
    `INSERT INTO lesson_visit_projects (user_id, title, state_json, form_token, director_share_token)
     VALUES (NULL, $1, $2::jsonb, $3, $4)
     ON CONFLICT (form_token) DO NOTHING`,
    [PHENOMENON_TITLE, JSON.stringify({ draft: phenomenonDraft() }), PHENOMENON_FORM_TOKEN, randomUUID().replace(/-/g, '')],
  );
  const again = await pool.query(select, [PHENOMENON_FORM_TOKEN]);
  return again.rows[0] || null;
}

function text(v, max = 300) {
  return typeof v === 'string' ? v.trim().slice(0, max) : v == null ? '' : String(v).trim().slice(0, max);
}

function samePerson(a, b) {
  const k = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  return Boolean(k(a)) && k(a) === k(b);
}

/**
 * Проверка и очистка ответа. Все поля обязательны, кроме «Общих выводов».
 * Возвращает { ok, general, answers } или { ok:false, message }.
 */
function validatePhenomenonSubmission(generalRaw, answersRaw) {
  const g = generalRaw && typeof generalRaw === 'object' ? generalRaw : {};
  const a = answersRaw && typeof answersRaw === 'object' ? answersRaw : {};
  const general = { kind: PHENOMENON_KIND, form_version: PHENOMENON_FORM_VERSION };
  for (const key of GENERAL_KEYS) general[key] = text(g[key]);
  const missing = REQUIRED_GENERAL.filter((key) => !general[key]);
  if (general.date && !/^\d{4}-\d{2}-\d{2}$/.test(general.date)) missing.push('date');
  const answers = {};
  for (const [id, options] of Object.entries(PHENOMENON_CHOICES)) {
    const v = text(a[id], 40);
    if (!options.includes(v)) missing.push(id);
    else answers[id] = v;
  }
  for (const id of PHENOMENON_MASTERY_IDS) {
    const n = Number(a[id]);
    if (!Number.isInteger(n) || n < 1 || n > 10) missing.push(id);
    else answers[id] = String(n);
  }
  const comments = text(a[PHENOMENON_COMMENTS_ID], 5000);
  if (comments) answers[PHENOMENON_COMMENTS_ID] = comments;
  if (missing.length) {
    return { ok: false, message: 'Заполните обязательные поля', missing: [...new Set(missing)] };
  }
  const sameId = general.teacher1_id && general.teacher1_id === general.teacher2_id;
  if (sameId || samePerson(general.teacher1_name, general.teacher2_name)) {
    return { ok: false, message: 'Первый и второй педагог должны быть разными', missing: ['teacher2_name'] };
  }
  return { ok: true, general, answers };
}

module.exports = {
  PHENOMENON_KIND,
  PHENOMENON_FORM_TOKEN,
  PHENOMENON_FORM_VERSION,
  PHENOMENON_TITLE,
  PHENOMENON_CHOICES,
  PHENOMENON_MASTERY_IDS,
  PHENOMENON_COMMENTS_ID,
  isPhenomenonDraft,
  isPhenomenonRow,
  isPhenomenonToken,
  phenomenonDraft,
  ensurePhenomenonProject,
  validatePhenomenonSubmission,
};
