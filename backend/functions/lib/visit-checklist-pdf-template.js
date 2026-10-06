'use strict';

const DOCUMENT_TYPE = 'visit-checklist-teacher-card';
const MAX_BLOCKS = 40;
const MAX_JSON_BYTES = 64 * 1024;
const BLOCK_TYPES = new Set([
  'teacher',
  'kpis',
  'profile',
  'compare',
  'observeSelf',
  'trend',
  'watchers',
  'coverage',
  'strengths',
  'slices',
  'sections',
  'narrative',
  'visits',
]);
const FULL_ONLY = new Set(['narrative', 'visits', 'sections', 'strengths']);
const EMPTY_POLICIES = new Set(['hide', 'placeholder']);
const WIDTHS = new Set(['full', 'half']);
const DENSITIES = new Set(['normal', 'compact']);
const COMPARE_MODES = new Set(['none', 'department', 'school']);
const VISIT_DETAILS = new Set(['short', 'detailed']);
const PROFILE_CHARTS = new Set(['auto', 'radar', 'bars']);

function jsonSize(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asBool(value, fallback) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function sanitizeBlockOptions(type, raw) {
  const src = isPlainObject(raw) ? raw : {};
  const emptyPolicy = EMPTY_POLICIES.has(src.emptyPolicy) ? src.emptyPolicy : 'hide';
  const density = DENSITIES.has(src.density) ? src.density : 'normal';
  const out = { emptyPolicy, density };
  if (type === 'compare') {
    out.compareMode = COMPARE_MODES.has(src.compareMode) ? src.compareMode : 'department';
  }
  if (type === 'visits') {
    out.visitDetail = VISIT_DETAILS.has(src.visitDetail) ? src.visitDetail : 'short';
  }
  if (type === 'profile') {
    out.profileChart = PROFILE_CHARTS.has(src.profileChart) ? src.profileChart : 'auto';
  }
  return out;
}

function sanitizeBlock(raw, index) {
  if (!isPlainObject(raw)) return { error: 'invalid_block', message: 'Блок шаблона должен быть объектом.' };
  const type = String(raw.type || '').trim();
  if (!BLOCK_TYPES.has(type)) return { error: 'unknown_block_type', message: 'Неизвестный модуль шаблона.' };
  const widthRaw = raw.width === 'half' ? 'half' : 'full';
  const width = FULL_ONLY.has(type) ? 'full' : WIDTHS.has(widthRaw) ? widthRaw : 'full';
  const id = String(raw.id || '').trim() || `b${index + 1}-${type}`;
  if (id.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return { error: 'invalid_block_id', message: 'Некорректный идентификатор блока.' };
  }
  return {
    ok: true,
    block: {
      id,
      type,
      enabled: asBool(raw.enabled, true),
      width,
      breakBefore: asBool(raw.breakBefore, false),
      options: sanitizeBlockOptions(type, raw.options),
    },
  };
}

function sanitizeTemplate(raw) {
  if (!isPlainObject(raw)) return { ok: false, error: 'invalid_template', message: 'Шаблон должен быть объектом.' };
  const size = jsonSize(raw);
  if (size > MAX_JSON_BYTES) {
    return { ok: false, error: 'template_too_large', message: 'Шаблон больше 64 КБ.' };
  }
  const schemaVersion = Number(raw.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return { ok: false, error: 'invalid_schema', message: 'Некорректная версия шаблона.' };
  }
  if (schemaVersion !== 1) {
    return { ok: false, error: 'unsupported_schema', message: 'Эта версия шаблона не поддерживается.' };
  }
  const documentType = String(raw.documentType || DOCUMENT_TYPE).trim();
  if (documentType !== DOCUMENT_TYPE) {
    return { ok: false, error: 'invalid_document_type', message: 'Некорректный тип документа.' };
  }
  const page = isPlainObject(raw.page) ? raw.page : {};
  const marginMm = Number(page.marginMm);
  const safeMargin = Number.isFinite(marginMm) ? Math.min(28, Math.max(8, Math.round(marginMm))) : 14;
  if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) {
    return { ok: false, error: 'empty_blocks', message: 'В шаблоне нет модулей.' };
  }
  if (raw.blocks.length > MAX_BLOCKS) {
    return { ok: false, error: 'too_many_blocks', message: 'Слишком много модулей.' };
  }
  const blocks = [];
  const seen = new Set();
  for (let i = 0; i < raw.blocks.length; i += 1) {
    const next = sanitizeBlock(raw.blocks[i], i);
    if (next.error) return { ok: false, error: next.error, message: next.message };
    if (seen.has(next.block.id)) {
      return { ok: false, error: 'duplicate_block', message: 'Повторяющийся идентификатор блока.' };
    }
    seen.add(next.block.id);
    blocks.push(next.block);
  }
  return {
    ok: true,
    template: {
      schemaVersion: 1,
      documentType: DOCUMENT_TYPE,
      page: { format: 'A4', orientation: 'portrait', marginMm: safeMargin },
      blocks,
    },
  };
}

function isIncompatibleStoredTemplate(raw) {
  if (!isPlainObject(raw)) return true;
  const version = Number(raw.schemaVersion);
  return !Number.isInteger(version) || version !== 1;
}

module.exports = {
  DOCUMENT_TYPE,
  MAX_BLOCKS,
  MAX_JSON_BYTES,
  BLOCK_TYPES,
  sanitizeTemplate,
  isIncompatibleStoredTemplate,
};
