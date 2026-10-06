'use strict';

const fs = require('fs');
const path = require('path');
const { normalizePersonName } = require('./english-assessment-match');
const {
  isUnknownTeacherLabel,
  resolveTeacherLabelFromSchedule,
} = require('./visit-checklist-schedule-match');
const { isSelfAnalysisFormat, pickVisitFormat } = require('./visit-checklist-format');

const UNKNOWN_TEACHER_LABEL = 'Педагог без ФИО';

let rubricCache = null;
let seedDirectoryCache = null;

function loadRubric() {
  if (rubricCache) return rubricCache;
  const candidates = [
    path.join(__dirname, '../data/visit-checklist-rubric.json'),
    path.join(__dirname, '../../../frontend/src/lib/lessonVisitChecklist/visitChecklistRubric.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      rubricCache = JSON.parse(fs.readFileSync(file, 'utf8'));
      return rubricCache;
    }
  }
  throw new Error('visit-checklist-rubric.json not found');
}

function loadSeedDirectory() {
  if (seedDirectoryCache) return seedDirectoryCache;
  const candidates = [
    path.join(__dirname, '../../../frontend/src/lib/lessonVisitChecklist/defaultSeed.json'),
    path.join(__dirname, '../data/visit-checklist-default-seed.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      seedDirectoryCache = raw && raw.directory && typeof raw.directory === 'object' ? raw.directory : { teachers: [], departments: [] };
      return seedDirectoryCache;
    }
  }
  seedDirectoryCache = { teachers: [], departments: [] };
  return seedDirectoryCache;
}

function looksLikeTeacherCode(raw) {
  return /^(?:teacher[_-]?[a-z0-9]+|t\d+)$/i.test(String(raw || '').trim());
}

function displayTeacherLabel(raw, directory, seedDirectory) {
  const label = collapseSpaces(raw);
  if (!label) return UNKNOWN_TEACHER_LABEL;
  if (looksLikeTeacherCode(label)) {
    return resolveTeacherName({ teacher_id: label }, directory, seedDirectory);
  }
  const hit = findTeacherByLooseName(directoryTeachers(directory, seedDirectory), label);
  return hit ? collapseSpaces(hit.name) : label;
}

function findDirectoryRow(list, id) {
  if (!id || !Array.isArray(list)) return null;
  return list.find((row) => row && String(row.id) === id) || null;
}

function directoryTeachers(directory, seedDirectory) {
  const seed = seedDirectory && typeof seedDirectory === 'object' ? seedDirectory : loadSeedDirectory();
  const out = [];
  for (const list of [directory && directory.teachers, seed.teachers]) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (row && collapseSpaces(row.name) && !looksLikeTeacherCode(row.name)) out.push(row);
    }
  }
  return out;
}

/** Фамилия / «Фамилия И.» из журнала → полное ФИО из справочника кафедр. */
function findTeacherByLooseName(teachers, raw) {
  const key = teacherKey(raw);
  if (!key || !Array.isArray(teachers) || !teachers.length) return null;
  const exact = teachers.find((row) => teacherKey(row.name) === key);
  if (exact) return exact;
  const tokens = key.split(' ').filter(Boolean);
  const last = tokens[0];
  if (!last) return null;
  const byLast = teachers.filter((row) => teacherKey(row.name).split(' ')[0] === last);
  if (byLast.length === 1) return byLast[0];
  if (tokens.length >= 2) {
    const first = tokens[1];
    const byFirst = byLast.filter((row) => {
      const second = teacherKey(row.name).split(' ')[1] || '';
      return first.length === 1 ? second.startsWith(first) : second === first;
    });
    if (byFirst.length === 1) return byFirst[0];
  }
  return null;
}

function collapseSpaces(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function teacherKey(raw) {
  return normalizePersonName(raw);
}

function normLabel(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[«»""]/g, '"')
    .trim();
}

function parseVisitPhrase(phrase) {
  const t = String(phrase ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*[—–-]\s*(.+)$/);
  if (m) return { code: m[1].trim(), answer: m[2].trim() };
  const colon = t.match(/^(.{8,80}?):\s*(.+)$/);
  if (colon) return { code: '', answer: colon[2].trim() };
  return { code: '', answer: t };
}

function resolveTeacherName(general, directory, seedDirectory) {
  const g = general && typeof general === 'object' ? general : {};
  const teacherId = collapseSpaces(g.teacher_id);
  const named = collapseSpaces(g.teacher_name || g.teacher);
  const projectHit = findDirectoryRow(directory && directory.teachers, teacherId);
  const projectName = projectHit ? collapseSpaces(projectHit.name) : '';
  if (projectName && !looksLikeTeacherCode(projectName)) return projectName;
  const seed = seedDirectory && typeof seedDirectory === 'object' ? seedDirectory : loadSeedDirectory();
  const seedHit = findDirectoryRow(seed.teachers, teacherId);
  const seedName = seedHit ? collapseSpaces(seedHit.name) : '';
  if (seedName && !looksLikeTeacherCode(seedName)) return seedName;
  const loose = findTeacherByLooseName(directoryTeachers(directory, seed), named || teacherId);
  if (loose) return collapseSpaces(loose.name);
  if (named && !looksLikeTeacherCode(named)) return named;
  if (teacherId && !looksLikeTeacherCode(teacherId)) return teacherId;
  return UNKNOWN_TEACHER_LABEL;
}

function resolveTeacherIdentity(general, directory, seedDirectory) {
  const g = general && typeof general === 'object' ? general : {};
  const teacherId = collapseSpaces(g.teacher_id);
  const label = resolveTeacherName(g, directory, seedDirectory);
  const key = teacherKey(teacherId || label);
  return { key, label, teacherId };
}

function resolveDepartmentName(general, directory, seedDirectory) {
  const g = general && typeof general === 'object' ? general : {};
  const depId = collapseSpaces(g.department_id);
  const named = collapseSpaces(g.department);
  const projectHit = findDirectoryRow(directory && directory.departments, depId);
  if (projectHit && projectHit.name) return collapseSpaces(projectHit.name);
  const seed = seedDirectory && typeof seedDirectory === 'object' ? seedDirectory : loadSeedDirectory();
  const seedHit = findDirectoryRow(seed.departments, depId);
  if (seedHit && seedHit.name) return collapseSpaces(seedHit.name);
  return named;
}

function formatAnswerPhrase(question, raw) {
  if (raw == null || raw === '') return '';
  const answer = Array.isArray(raw) ? raw.map(String).join('; ') : String(raw).trim();
  if (!answer) return '';
  const code = String(question.code || '').trim();
  if (code) return `${code} — ${answer}`;
  const short = String(question.text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 72);
  return short ? `${short}: ${answer}` : answer;
}

function findRubricItem(rubric, sectionCode, code, answer) {
  const sec = (rubric.sections || []).find((s) => s.code === sectionCode);
  if (!sec) return null;
  if (code) {
    const byCode = sec.items.find((it) => String(it.itemCode || '').trim() === code);
    if (byCode) return byCode;
  }
  const ans = normLabel(answer);
  if (ans) {
    const byAnswer = sec.items.find((it) =>
      (it.options || []).some((o) => normLabel(o.label) === ans),
    );
    if (byAnswer) return byAnswer;
  }
  return null;
}

function scoreLabelsAgainstItem(item, labels) {
  const selected = [];
  let earned = 0;
  for (const raw of labels) {
    const label = normLabel(raw);
    if (!label) continue;
    const opt = (item.options || []).find((o) => normLabel(o.label) === label);
    if (!opt) continue;
    selected.push(opt.label);
    earned += Number(opt.points) || 0;
  }
  if (item.scoringMode === 'single' && selected.length > 1) {
    const best = (item.options || [])
      .filter((o) => selected.some((s) => normLabel(s) === normLabel(o.label)))
      .sort((a, b) => b.points - a.points)[0];
    earned = best?.points ?? earned;
    if (best) selected.splice(0, selected.length, best.label);
  }
  const answered = selected.length > 0;
  return {
    indicator: item.indicator,
    itemCode: item.itemCode,
    earnedPoints: Math.round(earned * 100) / 100,
    maxPoints: item.maxPoints,
    selectedLabels: selected,
    scoringMode: item.scoringMode,
    answered,
    explicit_zero: answered && earned === 0,
  };
}

function scoreVisitFromPhrases(sectionPhrasesByCode) {
  const rubric = loadRubric();
  const answersByIndicator = new Map();
  for (const [sectionCode, phrases] of sectionPhrasesByCode) {
    for (const ph of phrases) {
      const parsed = parseVisitPhrase(ph);
      if (!parsed) continue;
      const item = findRubricItem(rubric, sectionCode, parsed.code, parsed.answer);
      if (!item) continue;
      const key = `${sectionCode}::${item.indicator}`;
      const cur = answersByIndicator.get(key) || [];
      cur.push(parsed.answer);
      answersByIndicator.set(key, cur);
    }
  }
  return (rubric.sections || []).map((sec) => {
    const items = (sec.items || []).map((rubricItem) => {
      const key = `${sec.code}::${rubricItem.indicator}`;
      return scoreLabelsAgainstItem(rubricItem, answersByIndicator.get(key) || []);
    });
    const earnedPoints = items.reduce((s, it) => s + it.earnedPoints, 0);
    return {
      code: sec.code,
      title: sec.title,
      items,
      earnedPoints: Math.round(earnedPoints * 100) / 100,
      maxPoints: sec.maxSectionPoints,
      hasPoints: earnedPoints > 0,
      fillRatio: sec.maxSectionPoints > 0 ? earnedPoints / sec.maxSectionPoints : 0,
    };
  });
}

function collectPhrasesFromResponse(checklist, answers) {
  const bySec = new Map();
  const texts = { summary: [], recommendations: [], ordinal: '' };
  const ans = answers && typeof answers === 'object' ? answers : {};
  const sections = checklist && Array.isArray(checklist.sections) ? checklist.sections : [];
  for (const sec of sections) {
    const code = String(sec.code || '').trim();
    if (!code) continue;
    const phrases = [];
    for (const q of sec.questions || []) {
      const raw = ans[q.id];
      if (q.type === 'text') {
        const t = Array.isArray(raw) ? raw.map(String).join('\n') : String(raw || '').trim();
        if (!t) continue;
        if (/возьму с собой/i.test(q.text) || q.code === '10.3') texts.recommendations.push(t);
        else texts.summary.push(t);
        continue;
      }
      if (
        q.code === '10.1' ||
        q.code === '7.9' ||
        /уровень представленного урока/i.test(q.text || '')
      ) {
        const ord = Array.isArray(raw) ? String(raw[0] || '') : String(raw || '');
        if (ord.trim()) texts.ordinal = ord.trim();
        continue;
      }
      const phrase = formatAnswerPhrase(q, raw);
      if (phrase) phrases.push(phrase);
    }
    if (phrases.length) bySec.set(code, phrases);
  }
  return { bySec, texts };
}

function scoreResponse(checklist, answers) {
  const { bySec, texts } = collectPhrasesFromResponse(checklist, answers);
  const sections = scoreVisitFromPhrases(bySec);
  const earned = sections.reduce((s, sec) => s + sec.earnedPoints, 0);
  const max = sections.reduce((s, sec) => s + sec.maxPoints, 0);
  return {
    sections,
    earned: Math.round(earned * 100) / 100,
    max,
    ratio: max > 0 ? earned / max : 0,
    texts,
  };
}

function parseResponseRow(row) {
  const raw = row && row.answers_json && typeof row.answers_json === 'object' ? row.answers_json : {};
  return {
    id: Number(row.id),
    created_at: row.created_at,
    general: raw.general && typeof raw.general === 'object' ? raw.general : {},
    answers: raw.answers && typeof raw.answers === 'object' ? raw.answers : {},
  };
}

function pickGeneralField(general, keys) {
  const g = general && typeof general === 'object' ? general : {};
  for (const key of keys) {
    const value = collapseSpaces(g[key]);
    if (value) return value;
  }
  return '';
}

function buildTeacherStats(teacherLabel, department, scoredVisits) {
  const visits = scoredVisits.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const last = visits[visits.length - 1] || null;
  const sectionAcc = new Map();
  let earned = 0;
  let max = 0;
  const subjects = new Set();
  const classes = new Set();
  const ordinal = {};
  const sparkline = [];

  for (const visit of visits) {
    earned += visit.earned;
    max += visit.max;
    if (visit.subject) subjects.add(visit.subject);
    if (visit.class_name) classes.add(visit.class_name);
    if (visit.ordinal) ordinal[visit.ordinal] = (ordinal[visit.ordinal] || 0) + 1;
    sparkline.push({
      date: visit.date || visit.created_at || '',
      score: visit.max > 0 ? Math.round((visit.earned / visit.max) * 1000) / 10 : 0,
    });
    for (const sec of visit.sections || []) {
      const cur = sectionAcc.get(sec.code) || { code: sec.code, title: sec.title, earned: 0, max: 0, count: 0 };
      cur.earned += sec.earnedPoints;
      cur.max += sec.maxPoints;
      cur.count += 1;
      sectionAcc.set(sec.code, cur);
    }
  }

  const sections = [...sectionAcc.values()].map((s) => ({
    code: s.code,
    title: s.title,
    earned: Math.round((s.count ? s.earned / s.count : 0) * 100) / 100,
    max: s.count ? Math.round((s.max / s.count) * 100) / 100 : 0,
    fillRatio: s.max > 0 ? s.earned / s.max : 0,
  }));

  return {
    teacher_label: teacherLabel,
    department: department || '',
    visit_count: visits.length,
    last_visit: last
      ? {
          date: last.date || '',
          class_name: last.class_name || '',
          subject: last.subject || '',
          visitor: last.visitor || '',
          format: last.format || '',
        }
      : null,
    subjects: [...subjects],
    classes: [...classes],
    total_earned: Math.round(earned * 100) / 100,
    total_max: Math.round(max * 100) / 100,
    score_ratio: max > 0 ? earned / max : 0,
    sections,
    sparkline: sparkline.slice(-12),
    ordinal,
    visits: visits.map((v) => ({
      id: v.id,
      date: v.date || '',
      created_at: v.created_at || '',
      visitor: v.visitor || '',
      class_name: v.class_name || '',
      subject: v.subject || '',
      format: v.format || '',
      earned: v.earned,
      max: v.max,
      summary: v.summary || '',
      recommendations: v.recommendations || '',
      ordinal: v.ordinal || '',
      coverage: coverageFromSections(v.sections),
      sections: compactVisitSections(v.sections),
    })),
  };
}

function coverageFromSections(sections) {
  let answered = 0;
  let total = 0;
  let explicitZero = 0;
  for (const sec of sections || []) {
    for (const item of sec.items || []) {
      total += 1;
      if (item.answered || (item.selectedLabels && item.selectedLabels.length)) {
        answered += 1;
        if (item.explicit_zero || (Number(item.earnedPoints) === 0 && item.selectedLabels && item.selectedLabels.length)) {
          explicitZero += 1;
        }
      }
    }
  }
  return {
    answered,
    unanswered: Math.max(0, total - answered),
    explicit_zero: explicitZero,
    items_total: total,
    coverage_ratio: total > 0 ? answered / total : 0,
  };
}

function compactVisitSections(sections) {
  return (sections || []).map((sec) => {
    const items = sec.items || [];
    const answered = items.filter((it) => it.answered || (it.selectedLabels && it.selectedLabels.length));
    return {
      code: sec.code,
      title: sec.title,
      earned: sec.earnedPoints,
      max: sec.maxPoints,
      fillRatio: sec.fillRatio,
      answered: answered.length,
      items_total: items.length,
      unanswered_codes: items
        .filter((it) => !(it.answered || (it.selectedLabels && it.selectedLabels.length)))
        .map((it) => it.itemCode)
        .filter(Boolean),
      zero_codes: items.filter((it) => it.explicit_zero).map((it) => it.itemCode).filter(Boolean),
      marks: answered.slice(0, 12).map((it) => ({
        code: it.itemCode,
        pick: (it.selectedLabels || []).join('; '),
        pts: it.earnedPoints,
        max: it.maxPoints,
        indicator: String(it.indicator || '').slice(0, 140),
      })),
    };
  });
}

function scoreProjectResponses(draft, responseRows, opts = {}) {
  const checklist = draft && draft.checklist;
  const directory = draft && draft.directory;
  const seed = loadSeedDirectory();
  const scheduleRows = Array.isArray(opts.scheduleRows) ? opts.scheduleRows : [];
  const byTeacher = new Map();

  for (const row of responseRows || []) {
    const parsed = parseResponseRow(row);
    const { key, label } = resolveTeacherIdentity(parsed.general, directory, seed);
    if (!key) continue;
    const visitor = pickGeneralField(parsed.general, ['visitor_name', 'visitor', 'observer']);
    const className = pickGeneralField(parsed.general, ['class_name', 'class', 'className']);
    const department = resolveDepartmentName(parsed.general, directory, seed);
    const scored = scoreResponse(checklist, parsed.answers);
    const visit = {
      id: parsed.id,
      created_at: parsed.created_at,
      date: pickGeneralField(parsed.general, ['visit_date', 'date']),
      visitor,
      class_name: className,
      subject: pickGeneralField(parsed.general, ['subject', 'lesson_subject', 'discipline']),
      format: pickVisitFormat(parsed.general) || pickGeneralField(parsed.general, ['visit_format', 'format']),
      earned: scored.earned,
      max: scored.max,
      sections: scored.sections,
      summary: scored.texts.summary.join('\n\n'),
      recommendations: scored.texts.recommendations.join('\n\n'),
      ordinal: scored.texts.ordinal,
    };
    const cur = byTeacher.get(key) || { label, department, visits: [] };
    if (label && !isUnknownTeacherLabel(label)) cur.label = label;
    else if (!cur.label) cur.label = displayTeacherLabel(label);
    if (department) cur.department = department;
    cur.visits.push(visit);
    byTeacher.set(key, cur);
  }

  const teachers = [];
  for (const [key, group] of byTeacher) {
    let groupLabel = group.label;
    if (isUnknownTeacherLabel(groupLabel) && scheduleRows.length) {
      groupLabel = resolveTeacherLabelFromSchedule(scheduleRows, group.visits) || groupLabel;
    }
    teachers.push({
      teacher_key: key,
      stats: buildTeacherStats(groupLabel, group.department, group.visits),
    });
  }
  teachers.sort((a, b) => a.stats.teacher_label.localeCompare(b.stats.teacher_label, 'ru'));
  return teachers;
}

function trafficFromRatio(ratio) {
  const pct = Math.round((Number(ratio) || 0) * 100);
  if (pct >= 70) return 'green';
  if (pct >= 45) return 'yellow';
  return 'red';
}

function accBucket(map, name, earned, max, visits) {
  const key = collapseSpaces(name);
  if (!key) return;
  const cur = map.get(key) || { name: key, visits: 0, earned: 0, max: 0 };
  cur.visits += Number(visits) || 0;
  cur.earned += Number(earned) || 0;
  cur.max += Number(max) || 0;
  map.set(key, cur);
}

function finalizeBuckets(map) {
  return [...map.values()]
    .map((row) => {
      const score_ratio = row.max > 0 ? row.earned / row.max : 0;
      return {
        name: row.name,
        visits: row.visits,
        score_ratio,
        score_pct: Math.round(score_ratio * 100),
        traffic: trafficFromRatio(score_ratio),
      };
    })
    .sort((a, b) => b.score_ratio - a.score_ratio || a.name.localeCompare(b.name, 'ru'));
}

function aggregateDashboardKpis(teacherRows, cardRows, lastResponseId) {
  const list = teacherRows || [];
  const cards = cardRows || [];
  const cardByKey = new Map(cards.map((c) => [c.teacher_key, c]));
  let agreed = 0;
  let published = 0;
  const deps = new Set();
  const sectionAcc = new Map();
  const byDepartment = new Map();
  const byTeacher = new Map();
  const bySubject = new Map();
  const byClass = new Map();
  const byFormat = new Map();
  const byVisitor = new Map();
  const byOrdinal = new Map();
  const byDate = new Map();
  let ratioSum = 0;
  let visitCount = 0;

  for (const row of list) {
    const stats = row.stats || {};
    const visits = Number(stats.visit_count) || 0;
    const earned = Number(stats.total_earned) || 0;
    const max = Number(stats.total_max) || 0;
    visitCount += visits;
    if (stats.department) deps.add(stats.department);
    ratioSum += Number(stats.score_ratio) || 0;
    const card = cardByKey.get(row.teacher_key);
    if (card && card.status === 'agreed') agreed += 1;
    if (card && card.published_at) published += 1;
    accBucket(byDepartment, stats.department, earned, max, visits);
    accBucket(byTeacher, displayTeacherLabel(stats.teacher_label), earned, max, visits);
    for (const sec of stats.sections || []) {
      const cur = sectionAcc.get(sec.code) || { code: sec.code, title: sec.title, earned: 0, max: 0, count: 0 };
      cur.earned += Number(sec.earned) || 0;
      cur.max += Number(sec.max) || 0;
      cur.count += 1;
      sectionAcc.set(sec.code, cur);
    }
    for (const visit of stats.visits || []) {
      const vEarned = Number(visit.earned) || 0;
      const vMax = Number(visit.max) || 0;
      accBucket(bySubject, visit.subject, vEarned, vMax, 1);
      accBucket(byClass, visit.class_name, vEarned, vMax, 1);
      accBucket(byFormat, visit.format, vEarned, vMax, 1);
      accBucket(byVisitor, visit.visitor, vEarned, vMax, 1);
      accBucket(byOrdinal, visit.ordinal, vEarned, vMax, 1);
      const date = collapseSpaces(visit.date || visit.created_at).slice(0, 10);
      if (date) accBucket(byDate, date, vEarned, vMax, 1);
    }
  }

  const sections = [...sectionAcc.values()].map((s) => ({
    code: s.code,
    title: s.title,
    avgEarned: s.count ? Math.round((s.earned / s.count) * 100) / 100 : 0,
    max: s.count ? Math.round((s.max / s.count) * 100) / 100 : 0,
    fillRatio: s.max > 0 ? s.earned / s.max : 0,
  }));

  let observeCount = 0;
  let selfCount = 0;
  for (const row of list) {
    for (const visit of (row.stats && row.stats.visits) || []) {
      if (isSelfAnalysisFormat(visit.format)) selfCount += 1;
      else observeCount += 1;
    }
  }

  return {
    response_count: visitCount,
    observe_count: observeCount,
    self_count: selfCount,
    teacher_count: list.length,
    agreed_count: agreed,
    published_count: published,
    department_count: deps.size,
    avg_score_ratio: list.length ? ratioSum / list.length : 0,
    sections,
    charts: {
      by_department: finalizeBuckets(byDepartment),
      by_teacher: finalizeBuckets(byTeacher),
      by_subject: finalizeBuckets(bySubject),
      by_class: finalizeBuckets(byClass),
      by_format: finalizeBuckets(byFormat),
      by_visitor: finalizeBuckets(byVisitor),
      by_ordinal: finalizeBuckets(byOrdinal),
      trend: finalizeBuckets(byDate).sort((a, b) => String(a.name).localeCompare(String(b.name))),
      sections: sections.map((s) => ({
        name: s.title,
        code: s.code,
        score_ratio: s.fillRatio,
        score_pct: Math.round((s.fillRatio || 0) * 100),
        traffic: trafficFromRatio(s.fillRatio),
      })),
    },
    last_response_id: lastResponseId || null,
  };
}

module.exports = {
  loadRubric,
  loadSeedDirectory,
  teacherKey,
  collapseSpaces,
  looksLikeTeacherCode,
  displayTeacherLabel,
  findTeacherByLooseName,
  UNKNOWN_TEACHER_LABEL,
  resolveTeacherName,
  resolveTeacherIdentity,
  resolveDepartmentName,
  formatAnswerPhrase,
  isSelfAnalysisFormat,
  coverageFromSections,
  compactVisitSections,
  scoreResponse,
  scoreProjectResponses,
  buildTeacherStats,
  aggregateDashboardKpis,
  trafficFromRatio,
  parseResponseRow,
  pickGeneralField,
  isUnknownTeacherLabel,
};
