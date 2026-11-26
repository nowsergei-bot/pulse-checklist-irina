'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { normalizePersonName } = require('./english-assessment-match');

const VISIT_CHECKLIST_TITLE = 'Чек-лист посещения урока';
const VISIT_FORMAT_SELF_ANALYSIS = 'Самоанализ';

/** 16–18 ноября включительно, по московскому времени; затем открывается автоматически. */
const ORDINARY_CHECKLIST_PAUSE_START = Date.parse('2026-11-16T00:00:00+03:00');
const ORDINARY_CHECKLIST_PAUSE_END = Date.parse('2026-11-19T00:00:00+03:00');

function ordinaryChecklistPause(now = Date.now()) {
  if (now < ORDINARY_CHECKLIST_PAUSE_START || now >= ORDINARY_CHECKLIST_PAUSE_END) return null;
  return {
    error: 'ChecklistTemporarilyPaused',
    message: 'На\u00a0период проведения феноменальных уроков действует отдельный чек-лист',
    form_url: '/view/lesson-visit/phenomenon-lesson-2026',
    resumes_at: new Date(ORDINARY_CHECKLIST_PAUSE_END).toISOString(),
  };
}

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
    retiredTeachers: Array.isArray(dir.retiredTeachers) ? dir.retiredTeachers : [],
    teacherAliases: Array.isArray(dir.teacherAliases) ? dir.teacherAliases : [],
  };
}

/** Ключ написания ФИО для teacherAliases: в открытом репозитории храним не имя, а его хеш. */
function teacherAliasKey(raw) {
  const name = normalizePersonName(raw);
  return name ? crypto.createHash('sha256').update(name).digest('hex').slice(0, 16) : '';
}

/**
 * Старые ответы после чистки справочника.
 * Код убранного учителя (retiredTeachers) заменяется его ФИО: так старые ответы хранили имя
 * в teacher_id, и все экраны это понимают. Прежнее написание ФИО (teacherAliases)
 * переводится на запись справочника, чтобы склеенные записи считались одним учителем.
 * Исходный код остаётся в legacy_teacher_id. Ответ в базе не меняется.
 */
function applyTeacherAliases(general, directory) {
  const g = general && typeof general === 'object' ? general : {};
  const dir = directory && typeof directory === 'object' ? directory : loadSeedDirectory();
  const teachers = Array.isArray(dir.teachers) ? dir.teachers : [];
  const retired = Array.isArray(dir.retiredTeachers) ? dir.retiredTeachers : [];
  const aliases = Array.isArray(dir.teacherAliases) ? dir.teacherAliases : [];
  if (!retired.length && !aliases.length) return g;
  const tid = String(g.teacher_id || '').trim();
  if (tid && teachers.some((t) => t && String(t.id) === tid)) return g;
  const gone = tid ? retired.find((t) => t && String(t.id) === tid) : null;
  if (gone && gone.name) {
    const out = { ...g, teacher_id: gone.name, teacher_name: gone.name, legacy_teacher_id: tid };
    if (g.teacher) out.teacher = gone.name;
    if (!String(g.department_id || '').trim() && gone.departmentId) out.department_id = gone.departmentId;
    return out;
  }
  if (!aliases.length) return g;
  for (const field of ['teacher_id', 'teacher_name', 'teacher']) {
    const key = teacherAliasKey(g[field]);
    if (!key) continue;
    const alias = aliases.find((a) => a && a.key === key);
    const target = alias && teachers.find((t) => t && String(t.id) === String(alias.teacherId));
    if (!target) continue;
    const out = { ...g, teacher_id: String(target.id), teacher_name: target.name };
    if (g.teacher) out.teacher = target.name;
    if (tid) out.legacy_teacher_id = tid;
    return out;
  }
  return g;
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
const PHENOMENON_OPEN_FOR_ALL = true;

/**
 * Пробный доступ до открытия для всех: ключи записей из списка аналитики чек-листа
 * (VISIT_CHECKLIST_ANALYTICS_PEOPLE в visit-checklist-analytics-access.js), как в «Сводке директора».
 * Новых имён, почт и номеров здесь нет: сверка идёт по уже существующим записям на сервере.
 */
const PHENOMENON_PILOT_PERSON_KEYS = ['kostyukovich', 'khoroshilov'];

/**
 * Аналитика феноменальных уроков (вкладка «Результаты» и все ответы проекта).
 * Пока видят только люди с этими ключами записей из списка аналитики чек-листа
 * (VISIT_CHECKLIST_ANALYTICS_PEOPLE): без имён, почт и номеров в коде.
 * Администраторы с полным доступом без такой записи аналитику не видят.
 */
const PHENOMENON_ANALYTICS_PERSON_KEYS = ['kostyukovich', 'khoroshilov', 'novozhilov'];

/**
 * ПЕРЕКЛЮЧАТЕЛЬ аналитики. false: только ключи выше. true: вся группа аналитики основного
 * чек-листа (canViewSharedVisitChecklistAnalytics). Учителя аналитику не видят в любом случае.
 */
const PHENOMENON_ANALYTICS_OPEN_TO_GROUP = false;

/** Изменяемые настройки (тесты подменяют их, рабочий код читает отсюда). */
const phenomenonAccess = {
  openForAll: PHENOMENON_OPEN_FOR_ALL,
  pilotKeys: PHENOMENON_PILOT_PERSON_KEYS,
  analyticsKeys: PHENOMENON_ANALYTICS_PERSON_KEYS,
  analyticsOpenToGroup: PHENOMENON_ANALYTICS_OPEN_TO_GROUP,
};

/** Можно ли видеть ответы и аналитику феноменальных уроков. */
function canViewPhenomenonAnalytics(user) {
  if (!user) return false;
  const access = require('./visit-checklist-analytics-access');
  if (phenomenonAccess.analyticsOpenToGroup) return access.canViewSharedVisitChecklistAnalytics(user);
  const person = access.findVisitChecklistAnalyticsPerson(user);
  return Boolean(person && phenomenonAccess.analyticsKeys.includes(person.key));
}

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

/**
 * Педагоги только для феноменальной формы (решение Иры 17.11.2026): ФИО хранятся в базе,
 * в черновике проекта феноменального урока (draft.extraTeachers), а не в коде и не в справочнике.
 * В основную форму, справочник и охват основной аналитики они не попадают.
 */
const PHENOMENON_EXTRA_DEPARTMENT = { id: 'dept_ph_other', name: 'Другие сотрудники' };
const PHENOMENON_EXTRA_LIMIT = 50;

function sanitizePhenomenonExtraTeachers(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seenNames = new Set();
  const seenIds = new Set();
  for (const item of list) {
    const raw = item && typeof item === 'object' ? item : { name: item };
    const name = String(raw.name == null ? '' : raw.name).replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!name) continue;
    const key = name.toLowerCase().replace(/ё/g, 'е');
    if (seenNames.has(key)) continue;
    let id = typeof raw.id === 'string' && /^ph_extra_[a-z0-9]{1,24}$/.test(raw.id) ? raw.id : '';
    if (!id || seenIds.has(id)) id = `ph_extra_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    seenNames.add(key);
    seenIds.add(id);
    out.push({ id, name });
    if (out.length >= PHENOMENON_EXTRA_LIMIT) break;
  }
  return out;
}

/** Справочник для публичной феноменальной формы: только «Другие сотрудники» из базы. */
function phenomenonExtraDirectory(draft) {
  const list = sanitizePhenomenonExtraTeachers(draft && draft.extraTeachers) || [];
  if (!list.length) return { departments: [], teachers: [] };
  return {
    departments: [{ ...PHENOMENON_EXTRA_DEPARTMENT }],
    teachers: list.map((t) => ({ ...t, departmentId: PHENOMENON_EXTRA_DEPARTMENT.id, coverage: false })),
  };
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

/**
 * Правка отправленных чек-листов (ТЗ 26.11.2026).
 * Править может только запись с этим ключом из списка аналитики чек-листа (VISIT_CHECKLIST_ANALYTICS_PEOPLE),
 * как пробный доступ к феноменальному чек-листу: без имён, почт и номеров в коде.
 * Полный доступ администратора, ключ API и остальные записи списка правку не открывают.
 *
 * Хранение без миграций, в том же answers_json ответа:
 *   general, answers  текущая (исправленная) версия, её читают аналитика, снимок, выгрузка и PDF;
 *   original          исходные general и answers наблюдателя, записываются один раз при первой правке и больше не меняются;
 *   edit              { count, edited_at } пометка «изменено»;
 *   edit_history      [{ at, by, reason, changes: [{ id, before, after }] }] история правок.
 * Дату, класс, учителя, наблюдателя и версию (general) правка не меняет.
 */
const RESPONSE_EDITOR_PERSON_KEYS = ['kostyukovich'];
const responseEditAccess = { editorKeys: RESPONSE_EDITOR_PERSON_KEYS };
const RESPONSE_EDIT_REASON_MAX = 1000;
const RESPONSE_EDIT_TEXT_MAX = 5000;
const RESPONSE_EDIT_HISTORY_LIMIT = 100;
const RESPONSE_EDIT_FORBIDDEN_MESSAGE = 'Править отправленные чек-листы может только ответственный за аналитику чек-листа.';
const RESPONSE_EDIT_GENERAL_MESSAGE =
  'Дату, класс, учителя, наблюдателя и версию чек-листа изменить нельзя. Если ошибка в них, удалите чек-лист и заполните заново.';

/** Ключ записи того, кто может править; null, если править нельзя. Ключ API сюда не доходит. */
function responseEditorKey(user) {
  if (!user) return null;
  const { findVisitChecklistAnalyticsPerson } = require('./visit-checklist-analytics-access');
  const person = findVisitChecklistAnalyticsPerson(user);
  return person && responseEditAccess.editorKeys.includes(person.key) ? person.key : null;
}

function canEditResponses(user) {
  return Boolean(responseEditorKey(user));
}

let rubricOptionCache;
/** Варианты ответов из правил до 09.11 и 4.1 по коду пункта (старые чек-листы хранят прежние формулировки). */
function rubricOptionsByCode() {
  if (rubricOptionCache) return rubricOptionCache;
  const out = new Map();
  const dir = path.join(__dirname, '../../../frontend/src/lib/lessonVisitChecklist');
  for (const file of ['pulseV6Rubric.json', 'pulseV41Rubric.json']) {
    try {
      const rubric = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const c of rubric.criteria || []) {
        const labels = (c.options || []).map((o) => String(o.label || '')).filter(Boolean);
        if (!labels.length) continue;
        for (const code of [c.code, c.analytics_code].filter(Boolean)) {
          out.set(code, [...new Set([...(out.get(code) || []), ...labels])]);
        }
      }
    } catch {
      // Без файлов правил остаются варианты формы и исходный ответ.
    }
  }
  rubricOptionCache = out;
  return out;
}

const editNorm = (v) => String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const isOtherLabel = (label) => editNorm(label).startsWith('другое');

/** Вопросы основного чек-листа, которые можно править: id → { type, allowed (Set нормализованных), other }. */
function mainEditableQuestions(checklist, original) {
  const out = new Map();
  if (!checklist || !Array.isArray(checklist.sections)) return out;
  const byCode = rubricOptionsByCode();
  const questions = [
    ...checklist.sections.flatMap((s) => (Array.isArray(s.questions) ? s.questions : [])),
    ...(Array.isArray(checklist.legacyQuestions) ? checklist.legacyQuestions : []),
  ];
  for (const q of questions) {
    if (!q || !q.id) continue;
    const was = original && original[q.id];
    // Старые чек-листы: пункт мог быть с несколькими вариантами (9.1 до 09.11), форма ответа сохраняется.
    const type =
      q.type === 'text' ? 'text' : q.type === 'checkbox' || q.allowMultiple || Array.isArray(was) ? 'multiple' : 'single';
    const labels = [
      ...(Array.isArray(q.options) ? q.options : []),
      ...(byCode.get(q.code) || []),
      ...(q.legacyCode ? byCode.get(q.legacyCode) || [] : []),
    ];
    // Исходный ответ наблюдателя всегда можно вернуть.
    for (const v of Array.isArray(was) ? was : was == null ? [] : [was]) labels.push(String(v));
    out.set(q.id, {
      type,
      allowed: new Set(labels.map(editNorm).filter(Boolean)),
      other: labels.filter(isOtherLabel).map(editNorm),
    });
  }
  return out;
}

function choiceAllowed(rule, value) {
  const n = editNorm(value);
  if (!n) return false;
  if (rule.allowed.has(n)) return true;
  return rule.other.some((o) => n.startsWith(`${o}:`));
}

/** Проверка одного значения основного чек-листа: { ok, value } или { ok:false }. */
function cleanMainValue(rule, raw) {
  if (rule.type === 'text') {
    if (raw != null && typeof raw !== 'string') return { ok: false };
    return { ok: true, value: String(raw || '').trim().slice(0, RESPONSE_EDIT_TEXT_MAX) };
  }
  if (rule.type === 'single') {
    if (typeof raw !== 'string' || !choiceAllowed(rule, raw)) return { ok: false };
    return { ok: true, value: raw.trim() };
  }
  const list = Array.isArray(raw) ? raw : null;
  if (!list || !list.length || list.some((v) => typeof v !== 'string' || !choiceAllowed(rule, v))) return { ok: false };
  return { ok: true, value: [...new Set(list.map((v) => v.trim()))] };
}

/** Проверка одного значения феноменального чек-листа. */
function cleanPhenomenonValue(id, raw) {
  if (id === PHENOMENON_COMMENTS_ID) {
    if (raw != null && typeof raw !== 'string') return { ok: false };
    return { ok: true, value: String(raw || '').trim().slice(0, RESPONSE_EDIT_TEXT_MAX) };
  }
  if (PHENOMENON_MASTERY_IDS.includes(id)) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 10 || String(raw).trim() === '') return { ok: false };
    return { ok: true, value: String(n) };
  }
  const options = PHENOMENON_CHOICES[id];
  if (!options || typeof raw !== 'string' || !options.includes(raw)) return { ok: false };
  return { ok: true, value: raw };
}

const sameAnswer = (a, b) => {
  const list = (v) => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);
  const x = list(a);
  const y = list(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/**
 * Применяет правку к answers_json. patch = { answers, reason, expected_count }.
 * Возвращает { ok, answersJson, changes } или { ok:false, status, message }.
 */
function applyResponseEdit(answersJsonRaw, patch, { checklist, phenomenon = false, editorKey, now = new Date() } = {}) {
  const aj = answersJsonRaw && typeof answersJsonRaw === 'object' ? answersJsonRaw : {};
  const p = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const allowedKeys = new Set(['response_id', 'answers', 'reason', 'expected_count']);
  if ('general' in p || Object.keys(p).some((k) => !allowedKeys.has(k))) {
    return { ok: false, status: 400, message: RESPONSE_EDIT_GENERAL_MESSAGE };
  }
  const reason = typeof p.reason === 'string' ? p.reason.replace(/\s+/g, ' ').trim().slice(0, RESPONSE_EDIT_REASON_MAX) : '';
  if (!reason) return { ok: false, status: 400, message: 'Укажите причину правки.' };
  const answersIn = p.answers && typeof p.answers === 'object' && !Array.isArray(p.answers) ? p.answers : null;
  if (!answersIn) return { ok: false, status: 400, message: 'Нет ответов для правки.' };
  const edit = aj.edit && typeof aj.edit === 'object' ? aj.edit : {};
  const count = Number(edit.count) || 0;
  if (p.expected_count != null && Number(p.expected_count) !== count) {
    return { ok: false, status: 409, message: 'Чек-лист уже изменили. Обновите страницу и повторите правку.' };
  }
  const current = aj.answers && typeof aj.answers === 'object' ? aj.answers : {};
  const original = aj.original && typeof aj.original === 'object' ? aj.original : null;
  const originalAnswers = original && original.answers && typeof original.answers === 'object' ? original.answers : current;
  const rules = phenomenon ? null : mainEditableQuestions(checklist, originalAnswers);
  const next = { ...current };
  const changes = [];
  const bad = [];
  for (const [id, raw] of Object.entries(answersIn)) {
    let cleaned;
    if (phenomenon) cleaned = cleanPhenomenonValue(id, raw);
    else cleaned = rules.has(id) ? cleanMainValue(rules.get(id), raw) : { ok: false };
    if (!cleaned.ok) {
      bad.push(id);
      continue;
    }
    if (sameAnswer(current[id], cleaned.value)) continue;
    changes.push({ id, before: current[id] === undefined ? null : current[id], after: cleaned.value });
    if (cleaned.value === '' || (Array.isArray(cleaned.value) && !cleaned.value.length)) delete next[id];
    else next[id] = cleaned.value;
  }
  if (bad.length) {
    return { ok: false, status: 400, message: 'Можно выбрать только вариант, который есть в этом пункте.', fields: bad };
  }
  if (!changes.length) return { ok: false, status: 400, message: 'Нет изменений.' };
  const at = now.toISOString();
  const history = Array.isArray(aj.edit_history) ? aj.edit_history : [];
  return {
    ok: true,
    changes,
    answersJson: {
      ...aj,
      answers: next,
      // Исходная версия наблюдателя: только при первой правке, дальше не трогаем.
      original: original || { general: aj.general || {}, answers: current },
      edit: { count: count + 1, edited_at: at },
      edit_history: [...history, { at, by: editorKey || null, reason, changes }].slice(-RESPONSE_EDIT_HISTORY_LIMIT),
    },
  };
}

/** Пометка «изменено» (всем) и история с исходной версией (только тому, кто может править). */
function responseEditView(answersJson, withHistory) {
  const aj = answersJson && typeof answersJson === 'object' ? answersJson : {};
  const edit = aj.edit && typeof aj.edit === 'object' && Number(aj.edit.count) > 0 ? aj.edit : null;
  if (!edit) return {};
  const out = { edit: { count: Number(edit.count), edited_at: String(edit.edited_at || '') } };
  if (withHistory) {
    out.edit_history = (Array.isArray(aj.edit_history) ? aj.edit_history : []).map((h) => ({
      at: h.at,
      reason: h.reason,
      changes: Array.isArray(h.changes) ? h.changes : [],
    }));
    out.original = {
      answers: aj.original && aj.original.answers && typeof aj.original.answers === 'object' ? aj.original.answers : {},
    };
  }
  return out;
}

const responseEditLib = {
  RESPONSE_EDITOR_PERSON_KEYS,
  responseEditAccess,
  RESPONSE_EDIT_FORBIDDEN_MESSAGE,
  RESPONSE_EDIT_GENERAL_MESSAGE,
  responseEditorKey,
  canEditResponses,
  applyResponseEdit,
  responseEditView,
};

const phenomenonLib = {
  PHENOMENON_KIND,
  PHENOMENON_OPEN_FOR_ALL,
  PHENOMENON_PILOT_PERSON_KEYS,
  phenomenonAccess,
  isPhenomenonPilot,
  canUsePhenomenon,
  PHENOMENON_ANALYTICS_PERSON_KEYS,
  PHENOMENON_ANALYTICS_OPEN_TO_GROUP,
  canViewPhenomenonAnalytics,
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
  PHENOMENON_EXTRA_DEPARTMENT,
  sanitizePhenomenonExtraTeachers,
  phenomenonExtraDirectory,
};

module.exports = {
  ordinaryChecklistPause,
  VISIT_CHECKLIST_TITLE,
  VISIT_FORMAT_SELF_ANALYSIS,
  displayVisitChecklistTitle,
  ensureVisitFormatSelfAnalysis,
  ensureSubjectSelectFromSeed,
  normalizeSavedChecklist,
  ensureChecklistFormV41,
  VISIT_CHECKLIST_FORM_VERSION,
  loadSeedDirectory,
  applyTeacherAliases,
  teacherAliasKey,
  resolvePublicLessonVisitDirectory,
  buildTeacherUnitMap,
  sanitizeNewTeacherIds,
  visitChecklistDraftFromState,
  visitChecklistLatestScore,
  pickLatestSharedVisitChecklist,
  /** Чек-лист феноменального урока (объект, чтобы тесты могли подменять его члены). */
  phenomenon: phenomenonLib,
  /** Правка отправленных чек-листов (объект, чтобы тесты могли подменять доступ). */
  responseEdit: responseEditLib,
};
