'use strict';

const { normalizeClassCode, normalizePersonName } = require('./english-assessment-match');
const { nameMatches } = require('./cabinet-lesson-visit-schedule-access');

const UNKNOWN_TEACHER_LABEL = 'Педагог без ФИО';

function collapseSpaces(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeTeacherCode(raw) {
  return /^(?:teacher[_-]?[a-z0-9]+|t\d+)$/i.test(collapseSpaces(raw));
}

function isUnknownTeacherLabel(raw) {
  const label = collapseSpaces(raw);
  return !label || label === UNKNOWN_TEACHER_LABEL || looksLikeTeacherCode(label);
}

function normalizeVisitClass(raw) {
  return normalizeClassCode(raw);
}

function visitorsMatch(left, right) {
  const a = collapseSpaces(left);
  const b = collapseSpaces(right);
  if (!a || !b) return false;
  if (normalizePersonName(a) === normalizePersonName(b)) return true;
  return nameMatches(a, b);
}

function visitHint(raw) {
  const row = raw && typeof raw === 'object' ? raw : {};
  return {
    class_name: collapseSpaces(row.class_name || row.class || row.className),
    visitor: collapseSpaces(row.visitor || row.visitor_name || row.observer),
  };
}

function usableTeacherName(raw) {
  const name = collapseSpaces(raw);
  if (isUnknownTeacherLabel(name)) return '';
  return name;
}

/**
 * Один класс + один посещающий → ФИО учителя из графика.
 * Несколько разных учителей на ту же пару → null (не угадываем).
 */
function matchTeacherFromVisitSchedule(scheduleRows, hint) {
  const { class_name, visitor } = visitHint(hint);
  const klass = normalizeVisitClass(class_name);
  if (!klass || !visitor) return null;
  const names = new Map();
  for (const row of scheduleRows || []) {
    const teacher = usableTeacherName(row && row.teacher);
    if (!teacher) continue;
    if (normalizeVisitClass(row.class_name || row.class) !== klass) continue;
    if (!visitorsMatch(row.visitor || row.visitor_name, visitor)) continue;
    const key = normalizePersonName(teacher);
    if (!key) continue;
    if (!names.has(key)) names.set(key, teacher);
  }
  if (names.size !== 1) return null;
  return [...names.values()][0];
}

function resolveTeacherLabelFromSchedule(scheduleRows, visits) {
  const names = new Map();
  for (const visit of visits || []) {
    const name = matchTeacherFromVisitSchedule(scheduleRows, visit);
    if (!name) continue;
    const key = normalizePersonName(name);
    if (!names.has(key)) names.set(key, name);
  }
  if (names.size !== 1) return null;
  return [...names.values()][0];
}

module.exports = {
  UNKNOWN_TEACHER_LABEL,
  collapseSpaces,
  looksLikeTeacherCode,
  isUnknownTeacherLabel,
  normalizeVisitClass,
  visitorsMatch,
  matchTeacherFromVisitSchedule,
  resolveTeacherLabelFromSchedule,
};
