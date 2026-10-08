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

function normalizeSavedChecklist(checklist) {
  if (!checklist) return checklist;
  return ensureSubjectSelectFromSeed(ensureVisitFormatSelfAnalysis(checklist));
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

module.exports = {
  VISIT_CHECKLIST_TITLE,
  VISIT_FORMAT_SELF_ANALYSIS,
  displayVisitChecklistTitle,
  ensureVisitFormatSelfAnalysis,
  ensureSubjectSelectFromSeed,
  normalizeSavedChecklist,
  loadSeedDirectory,
  resolvePublicLessonVisitDirectory,
  buildTeacherUnitMap,
  visitChecklistDraftFromState,
  visitChecklistLatestScore,
  pickLatestSharedVisitChecklist,
};
