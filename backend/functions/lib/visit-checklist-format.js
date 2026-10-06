'use strict';

const VISIT_FORMAT_SELF_ANALYSIS = 'Самоанализ';

const VISIT_FORMAT_FIELD_KEYS = ['visit_format', 'format', 'visitFormat', 'lesson_format'];

const SELF_ANALYSIS_ALIASES = new Set([
  'самоанализ',
  'self',
  'self-analysis',
  'self analysis',
  'samoanaliz',
  'само-анализ',
  'само оценка',
  'самооценка',
]);

function collapseSpaces(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVisitFormat(raw) {
  return collapseSpaces(raw);
}

function isSelfAnalysisFormat(raw) {
  const s = normalizeVisitFormat(raw).toLowerCase();
  if (!s) return false;
  if (SELF_ANALYSIS_ALIASES.has(s)) return true;
  if (s === VISIT_FORMAT_SELF_ANALYSIS.toLowerCase()) return true;
  if (/само[\s-]?анализ/.test(s)) return true;
  if (/^self(?:\s|$|-)/.test(s)) return true;
  if (s.includes('самоанализ')) return true;
  return false;
}

function pickVisitFormat(general) {
  const g = general && typeof general === 'object' ? general : {};
  for (const key of VISIT_FORMAT_FIELD_KEYS) {
    const value = collapseSpaces(g[key]);
    if (value) return value;
  }
  return '';
}

module.exports = {
  VISIT_FORMAT_SELF_ANALYSIS,
  VISIT_FORMAT_FIELD_KEYS,
  normalizeVisitFormat,
  isSelfAnalysisFormat,
  pickVisitFormat,
};
