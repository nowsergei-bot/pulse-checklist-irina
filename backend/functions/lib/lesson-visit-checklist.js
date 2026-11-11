'use strict';

const fs = require('fs');
const path = require('path');
const { normalizePersonName } = require('./english-assessment-match');

const VISIT_CHECKLIST_TITLE = 'Чек-лист посещения урока';
const VISIT_FORMAT_SELF_ANALYSIS = 'Самоанализ';

/** Убирает «4.0» из пользовательских названий. */
function displayVisitChecklistTitle(raw) {
  const cleaned = String(raw || '')
    .replace(/\s*4\.0\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!cleaned || /^чек-лист$/i.test(cleaned)) return VISIT_CHECKLIST_TITLE;
  return cleaned;
}

/** В «Формат посещения урока» всегда есть «Самоанализ». */
function ensureVisitFormatSelfAnalysis(checklist) {
  if (!checklist || !Array.isArray(checklist.generalFields)) return checklist;
  return {
    ...checklist,
    generalFields: checklist.generalFields.map((field) => {
      if (field.id !== 'visit_format') return field;
      const options = Array.isArray(field.options) ? [...field.options] : [];
      if (!options.includes(VISIT_FORMAT_SELF_ANALYSIS)) options.push(VISIT_FORMAT_SELF_ANALYSIS);
      return { ...field, options };
    }),
  };
}

let seedBundleCache;

function seedBundlePaths() {
  return [
    path.join(__dirname, '../data/visit-checklist-default-seed.json'),
    path.join(__dirname, '../../../frontend/src/lib/lessonVisitChecklist/defaultSeed.json'),
  ];
}

function loadSeedBundle() {
  if (seedBundleCache !== undefined) return seedBundleCache;
  for (const file of seedBundlePaths()) {
    if (!fs.existsSync(file)) continue;
    seedBundleCache = JSON.parse(fs.readFileSync(file, 'utf8'));
    return seedBundleCache;
  }
  seedBundleCache = null;
  return null;
}

function loadSeedSubjectField() {
  const raw = loadSeedBundle();
  const fields = raw && Array.isArray(raw.generalFields) ? raw.generalFields : [];
  return fields.find((f) => f && f.id === 'subject') || null;
}

function directoryHasRoster(dir) {
  if (!dir || typeof dir !== 'object') return false;
  return (
    (Array.isArray(dir.departments) && dir.departments.length > 0) ||
    (Array.isArray(dir.teachers) && dir.teachers.length > 0)
  );
}

function loadSeedDirectory() {
  const raw = loadSeedBundle();
  const dir = raw && raw.directory && typeof raw.directory === 'object' ? raw.directory : null;
  if (!directoryHasRoster(dir)) return { departments: [], teachers: [] };
  return {
    departments: Array.isArray(dir.departments) ? dir.departments : [],
    teachers: Array.isArray(dir.teachers) ? dir.teachers : [],
  };
}

/** Публичная форма: актуальный seed важнее снимка проекта в БД. */
function resolvePublicLessonVisitDirectory(saved, seed) {
  const seedDir = seed && directoryHasRoster(seed) ? seed : loadSeedDirectory();
  if (directoryHasRoster(seedDir)) return seedDir;
  if (directoryHasRoster(saved)) {
    return {
      departments: Array.isArray(saved.departments) ? saved.departments : [],
      teachers: Array.isArray(saved.teachers) ? saved.teachers : [],
    };
  }
  return { departments: [], teachers: [] };
}

/** Старые черновики в БД хранят «Предмет» как text; актуальный seed — select с опциями из Excel. */
function ensureSubjectSelectFromSeed(checklist) {
  if (!checklist || !Array.isArray(checklist.generalFields)) return checklist;
  const seedSubject = loadSeedSubjectField();
  if (
    !seedSubject ||
    seedSubject.type !== 'select' ||
    !Array.isArray(seedSubject.options) ||
    !seedSubject.options.length
  ) {
    return checklist;
  }
  return {
    ...checklist,
    generalFields: checklist.generalFields.map((field) => {
      if (field.id !== 'subject') return field;
      return {
        ...field,
        type: 'select',
        label: seedSubject.label || field.label,
        required: seedSubject.required != null ? seedSubject.required : field.required,
        options: [...seedSubject.options],
      };
    }),
  };
}

const VISIT_CHECKLIST_FORM_VERSION = '4.1';

/**
 * Форма 4.1 из seed поверх сохранённой формы проекта (без миграции).
 * id вопросов сохраняются по старому коду, старые ответы остаются привязаны к своим вопросам.
 * Убранные вопросы уходят в legacyQuestions, поля регистрации, которых нет в seed, остаются.
 * Та же логика во frontend: normalizeChecklist.ts.
 */
function ensureChecklistFormV41(checklist) {
  const seed = loadSeedBundle();
  if (!checklist || !Array.isArray(checklist.sections) || checklist.formVersion === VISIT_CHECKLIST_FORM_VERSION) {
    return checklist;
  }
  if (!seed || seed.formVersion !== VISIT_CHECKLIST_FORM_VERSION || !Array.isArray(seed.sections)) return checklist;
  const saved = checklist.sections.flatMap((sec) => (sec && Array.isArray(sec.questions) ? sec.questions : []));
  const savedByCode = new Map(saved.map((q) => [String(q.code || '').trim(), q]));
  const mapped = new Set();
  for (const q of seed.sections.flatMap((sec) => sec.questions)) {
    const prev = q.legacyCode ? savedByCode.get(q.legacyCode) : undefined;
    if (prev) mapped.add(prev.id);
  }
  const previousLegacy = Array.isArray(checklist.legacyQuestions) ? checklist.legacyQuestions : [];
  const taken = new Set([...saved.map((q) => q.id), ...previousLegacy.map((q) => q.id)]);
  const freshId = (id) => {
    let next = id;
    for (let n = 2; taken.has(next); n += 1) next = `${id}_v41_${n}`;
    taken.add(next);
    return next;
  };
  const sections = seed.sections.map((sec) => ({
    ...sec,
    questions: sec.questions.map((q) => {
      const prev = q.legacyCode ? savedByCode.get(q.legacyCode) : undefined;
      return { ...q, options: [...q.options], id: prev ? prev.id : freshId(q.id) };
    }),
  }));
  const legacyQuestions = [...previousLegacy];
  for (const q of saved) {
    if (mapped.has(q.id) || legacyQuestions.some((l) => l.id === q.id)) continue;
    legacyQuestions.push({ ...q, legacyCode: q.legacyCode || q.code });
  }
  const generalFields = Array.isArray(checklist.generalFields) ? [...checklist.generalFields] : [];
  for (const field of seed.generalFields || []) {
    if (!generalFields.some((f) => f && f.id === field.id)) generalFields.push({ ...field });
  }
  return { ...checklist, formVersion: VISIT_CHECKLIST_FORM_VERSION, generalFields, sections, legacyQuestions };
}

function normalizeSavedChecklist(checklist) {
  if (!checklist) return checklist;
  return ensureSubjectSelectFromSeed(ensureVisitFormatSelfAnalysis(ensureChecklistFormV41(checklist)));
}

function visitChecklistDraftFromState(stateJson) {
  const state = stateJson && typeof stateJson === 'object' ? stateJson : {};
  if (state.draft && typeof state.draft === 'object') return state.draft;
  return state;
}

function createdAtMs(value) {
  if (value instanceof Date) return value.getTime();
  const t = Date.parse(String(value || ''));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Балл «актуального» общего чек-листа: 10 блоков обязательно.
 * Самоанализ в опциях — плюс, но не замена 10 блоков.
 * updated_at не учитывается (его двигают ответы).
 */
function visitChecklistLatestScore(draft) {
  const checklist = draft && draft.checklist;
  if (!checklist || typeof checklist !== 'object') return 0;
  const sections = Array.isArray(checklist.sections) ? checklist.sections : [];
  if (sections.length < 10) return 0;
  const fields = Array.isArray(checklist.generalFields) ? checklist.generalFields : [];
  const vf = fields.find((f) => f && f.id === 'visit_format');
  const options = vf && Array.isArray(vf.options) ? vf.options : [];
  return options.includes(VISIT_FORMAT_SELF_ANALYSIS) ? 2 : 1;
}

function pickLatestSharedVisitChecklist(rows) {
  const scored = [];
  for (const row of rows || []) {
    if (!row || !String(row.form_token || '').trim()) continue;
    const score = visitChecklistLatestScore(visitChecklistDraftFromState(row.state_json));
    if (score <= 0) continue;
    scored.push({
      row,
      score,
      created: createdAtMs(row.created_at),
      id: Number(row.id) || 0,
    });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.created !== a.created) return b.created - a.created;
    return b.id - a.id;
  });
  return scored[0] ? scored[0].row : null;
}

/**
 * Подразделения педагогов анкеты по справочнику сотрудников.
 * Сопоставление по нормализованному ФИО; если записей несколько, собираются все подразделения.
 * Возвращает { [teacherId]: string[] }, пустой массив значит «подразделение не определено».
 */
function buildTeacherUnitMap(staffRows, teachers) {
  const byName = new Map();
  for (const row of Array.isArray(staffRows) ? staffRows : []) {
    const key = normalizePersonName(row && row.full_name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, new Set());
    const unit = String((row && row.department) || '').replace(/\s+/g, ' ').trim();
    if (unit) byName.get(key).add(unit);
  }
  const out = {};
  for (const teacher of Array.isArray(teachers) ? teachers : []) {
    if (!teacher || teacher.id == null) continue;
    const units = byName.get(normalizePersonName(teacher.name));
    out[String(teacher.id)] = units ? [...units].sort((a, b) => a.localeCompare(b, 'ru')) : [];
  }
  return out;
}

const NEW_TEACHER_IDS_LIMIT = 500;

/**
 * Список «новых учителей» хранится как ID справочника анкеты (teacher_N), без ФИО.
 * Возвращает отсортированный список известных ID без повторов; null, если вход не массив строк
 * допустимой длины. Неизвестные ID отбрасываются.
 */
function sanitizeNewTeacherIds(value, teachers) {
  if (!Array.isArray(value) || value.length > NEW_TEACHER_IDS_LIMIT) return null;
  const known = new Set(
    (Array.isArray(teachers) ? teachers : [])
      .map((t) => (t && t.id != null ? String(t.id) : ''))
      .filter(Boolean),
  );
  const out = new Set();
  for (const raw of value) {
    if (typeof raw !== 'string') return null;
    const id = raw.trim();
    if (!id || id.length > 64) return null;
    if (known.has(id)) out.add(id);
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

// ---------------------------------------------------------------------------
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

/**
 * ПЕРЕКЛЮЧАТЕЛЬ. false: форма открыта только участникам пробного доступа (ниже), остальным
 * «Раздел пока недоступен». true: форма открыта всем. Значение должно совпадать с
 * PHENOMENON_OPEN_FOR_ALL во frontend/src/lib/lessonVisitChecklist/publicForm.ts (проверяется тестом).
 */
const PHENOMENON_OPEN_FOR_ALL = false;

/**
 * Пробный доступ до открытия для всех: ключи записей из списка аналитики чек-листа
 * (VISIT_CHECKLIST_ANALYTICS_PEOPLE в visit-checklist-analytics-access.js), как в «Сводке директора».
 * Новых имён, почт и номеров здесь нет: сверка идёт по уже существующим записям на сервере.
 */
const PHENOMENON_PILOT_PERSON_KEYS = ['kostyukovich', 'khoroshilov'];

/** Изменяемые настройки (тесты подменяют их, рабочий код читает отсюда). */
const phenomenonAccess = {
  openForAll: PHENOMENON_OPEN_FOR_ALL,
  pilotKeys: PHENOMENON_PILOT_PERSON_KEYS,
};

function isPhenomenonPilot(user) {
  if (!user) return false;
  const { findVisitChecklistAnalyticsPerson } = require('./visit-checklist-analytics-access');
  const person = findVisitChecklistAnalyticsPerson(user);
  return Boolean(person && phenomenonAccess.pilotKeys.includes(person.key));
}

/** Можно ли этому пользователю открыть, заполнить форму и видеть её результаты сейчас. */
function canUsePhenomenon(user) {
  return phenomenonAccess.openForAll || isPhenomenonPilot(user);
}

/** Пользователь сессии на публичном адресе формы (Bearer или cookie). Без сессии: null. */
async function resolvePhenomenonActor(pool, event) {
  try {
    const { resolveSessionUser } = require('./session-auth');
    return (await resolveSessionUser(pool, event)) || null;
  } catch (err) {
    console.warn('phenomenon session check failed', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Допустимые варианты по вопросам. Совпадает с frontend/src/lib/lessonVisitChecklist/publicForm.ts (проверяется тестом). */
const PHENOMENON_CHOICES = {
  ph_org: ['none', 'partly', 'full'],
  ph_objectives: ['none', 'teachers', 'joint', 'students'],
  ph_method: ['none', 'frontal', 'varied'],
  ph_phenomenon: ['none', 'parallel', 'teachers_link', 'students_link'],
  ph_coteaching: ['turns', 'complement'],
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

const phenomenonLib = {
  PHENOMENON_KIND,
  PHENOMENON_OPEN_FOR_ALL,
  PHENOMENON_PILOT_PERSON_KEYS,
  phenomenonAccess,
  isPhenomenonPilot,
  canUsePhenomenon,
  resolvePhenomenonActor,
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

module.exports = {
  VISIT_CHECKLIST_TITLE,
  VISIT_FORMAT_SELF_ANALYSIS,
  displayVisitChecklistTitle,
  ensureVisitFormatSelfAnalysis,
  ensureSubjectSelectFromSeed,
  normalizeSavedChecklist,
  ensureChecklistFormV41,
  VISIT_CHECKLIST_FORM_VERSION,
  loadSeedDirectory,
  resolvePublicLessonVisitDirectory,
  buildTeacherUnitMap,
  sanitizeNewTeacherIds,
  visitChecklistDraftFromState,
  visitChecklistLatestScore,
  pickLatestSharedVisitChecklist,
  /** Чек-лист феноменального урока (объект, чтобы тесты могли подменять его члены). */
  phenomenon: phenomenonLib,
};
