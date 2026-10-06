'use strict';

const crypto = require('crypto');
const { extractAutoPiiEntities } = require('./pii-auto-extract');
const { buildRedactedPack } = require('./pii-tokenize');
const { displayTeacherLabel, looksLikeTeacherCode } = require('./visit-checklist-score');
const { isSelfAnalysisFormat } = require('./visit-checklist-format');

/** Менять вместе с SYSTEM в visit-checklist-cloud-ai.js */
const TEACHER_PROMPT_VERSION = 'methodical-brief-v1';
const SCHOOL_PROMPT_VERSION = 'school-analytics-v1';

const MIN_DEPARTMENT_N = 3;
const OBSERVER_OVERLAP_MIN = 2;

/**
 * Методические области A–K → разделы чек-листа 4.0 (1–10).
 * В payload попадают только области, у которых есть хотя бы одна отметка.
 */
const AREA_BY_SECTION = {
  '1': ['A', 'I'],
  '2': ['B'],
  '3': ['B', 'C', 'E', 'G'],
  '4': ['B'],
  '5': ['F', 'H'],
  '6': ['E'],
  '7': ['C'],
  '8': ['D'],
  '9': ['C'],
  '10': [],
};

const AREA_TITLES = {
  A: 'Организационно-технические условия',
  B: 'Методическая грамотность построения урока',
  C: 'Общекультурные и коммуникативные компетенции',
  D: 'Информационные компетенции',
  E: 'Взаимодействие на уроке',
  F: 'Оценивание',
  G: 'Дифференциация и поддержка',
  H: 'Рефлексия',
  I: 'Временной регламент',
  J: 'Домашнее задание',
  K: 'Здоровьесбережение',
};

const POSITIVE_PICK = /готов|совместно|обучающ|высокий|всегда|системно|удовлетворительн|сформирован|понятн|да\b|полно|устойчив/i;
const ATTENTION_PICK = /не готов|не сформулир|слабо|низк|нет\b|неудовлетворительн|отсутств|не проведен/i;

function pct(ratio) {
  const n = Number(ratio);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function clipText(raw, max) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function teacherDisplayName(raw) {
  const label = displayTeacherLabel(raw);
  if (!label || looksLikeTeacherCode(label)) return 'Педагог без ФИО';
  return label;
}

/** «Фамилия Имя Отчество» → «Имя Отчество» для обращения на Вы. */
function greetingName(fullName) {
  const raw = String(fullName || '').trim();
  if (!raw || /педагог без фио/i.test(raw)) return 'коллега';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) return `${parts[1]} ${parts[2]}`;
  if (parts.length === 2 && /(вна|вич|ична|ич|оглы|кызы|гызы)$/i.test(parts[1])) {
    return `${parts[0]} ${parts[1]}`;
  }
  if (parts.length === 2) return parts[1];
  return parts[0];
}

function stripCommentPii(raw, max) {
  const text = clipText(raw, max);
  if (!text) return '';
  const entities = extractAutoPiiEntities(text).filter((ent) => {
    const type = String(ent.type || '');
    return type === 'child' || type === 'phone' || type === 'address' || type === 'other';
  });
  if (!entities.length) return text;
  return buildRedactedPack(text, entities).redactedText;
}

function sectionAreas(code) {
  const key = String(code || '').split('.')[0];
  return AREA_BY_SECTION[key] || [];
}

function areasForIndicator(code, title) {
  const fromSec = sectionAreas(code);
  const text = `${code} ${title || ''}`;
  const extra = [];
  if (/домашн/i.test(text)) extra.push('J');
  if (/санитарн|здоров|осанк|физкульт|динамическ/i.test(text)) extra.push('K');
  if (/рефлекс|итог урока|соотнес/i.test(text)) extra.push('H');
  if (/время|тайминг|регламент/i.test(text)) extra.push('I');
  return [...new Set([...fromSec, ...extra])];
}

function sampleRuleForCount(n) {
  if (n <= 0) return 'none';
  if (n === 1) return 'one_observation';
  if (n === 2) return 'preliminary';
  if (n <= 4) return 'patterns';
  return 'dynamics';
}

function periodFromDates(dates) {
  const clean = dates.filter(Boolean).sort();
  if (!clean.length) return { from: '', to: '' };
  return { from: clean[0], to: clean[clean.length - 1] };
}

function formatPeriodLabel(period) {
  if (!period || (!period.from && !period.to)) return 'период не указан';
  if (period.from && period.to && period.from !== period.to) return `${period.from} — ${period.to}`;
  return period.from || period.to;
}

function basisLine(count, period) {
  return `Основание анализа: ${count} посещений за период ${formatPeriodLabel(period)}`;
}

function visitInstrumentKey(visit) {
  const bits = [];
  for (const sec of visit.sections || []) {
    if (sec.code) bits.push(`s:${sec.code}`);
    for (const mark of sec.marks || []) {
      if (mark.code) bits.push(`m:${mark.code}`);
    }
    for (const code of sec.unanswered_codes || []) bits.push(`u:${code}`);
  }
  return bits.sort().join('|') || 'empty';
}

function toneForPick(pick) {
  const t = String(pick || '');
  if (!t) return null;
  if (ATTENTION_PICK.test(t)) return 'attention';
  if (POSITIVE_PICK.test(t)) return 'positive';
  return 'neutral';
}

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round(((a[mid - 1] + a[mid]) / 2) * 10) / 10;
}

function monthKey(date) {
  const s = String(date || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}

function normalizeTeacherRow(row) {
  if (!row || typeof row !== 'object') return { stats: {} };
  const stats =
    row.stats && typeof row.stats === 'object'
      ? row.stats
      : row.stats_json && typeof row.stats_json === 'object'
        ? row.stats_json
        : {};
  return { ...row, stats };
}

function flattenTeacherVisits(teachers) {
  const visits = [];
  for (const row of teachers || []) {
    const teacher = normalizeTeacherRow(row);
    for (const visit of teacher.stats.visits || []) {
      visits.push({
        ...visit,
        _department: String(teacher.department || teacher.stats.department || ''),
        _teacher_key: String(teacher.teacher_key || teacher.stats.teacher_key || ''),
      });
    }
  }
  return visits;
}

function collectVisitCriteria(visit) {
  const criteria = [];
  const missing = [];
  const presentAreas = new Set();
  for (const sec of visit.sections || []) {
    for (const mark of sec.marks || []) {
      if (!String(mark.pick || '').trim()) continue;
      const id = String(mark.code || mark.indicator || '').trim();
      if (!id) continue;
      const name = String(mark.indicator || id);
      const areas = areasForIndicator(id, name);
      areas.forEach((a) => presentAreas.add(a));
      criteria.push({
        id,
        name: clipText(name, 140),
        category: String(sec.title || sec.code || ''),
        areas,
        value: mark.pts == null ? null : Number(mark.pts),
        max: mark.max == null ? null : Number(mark.max),
        label: String(mark.pick || ''),
        comment: '',
      });
    }
    for (const code of sec.unanswered_codes || []) {
      missing.push({ id: String(code), category: String(sec.title || sec.code || '') });
    }
  }
  return { criteria, missing, presentAreas: [...presentAreas] };
}

function mostFrequent(values) {
  const acc = new Map();
  for (const raw of values) {
    const v = String(raw || '').trim();
    if (!v) continue;
    acc.set(v, (acc.get(v) || 0) + 1);
  }
  let best = '';
  let n = 0;
  for (const [k, c] of acc) {
    if (c > n) {
      best = k;
      n = c;
    }
  }
  return best;
}

function criterionStatsFromVisits(visits) {
  const acc = new Map();
  for (const visit of visits || []) {
    const { criteria, missing } = collectVisitCriteria(visit);
    for (const row of criteria) {
      const cur = acc.get(row.id) || {
        id: row.id,
        name: row.name,
        category: row.category,
        areas: row.areas,
        n: 0,
        filled: 0,
        labels: {},
        values: [],
        tones: { positive: 0, neutral: 0, attention: 0 },
      };
      cur.n += 1;
      cur.filled += 1;
      cur.name = row.name || cur.name;
      cur.labels[row.label] = (cur.labels[row.label] || 0) + 1;
      if (Number.isFinite(row.value)) cur.values.push(row.value);
      const tone = toneForPick(row.label);
      if (tone) cur.tones[tone] += 1;
      acc.set(row.id, cur);
    }
    for (const miss of missing) {
      const cur = acc.get(miss.id) || {
        id: miss.id,
        name: miss.id,
        category: miss.category,
        areas: areasForIndicator(miss.id, ''),
        n: 0,
        filled: 0,
        labels: {},
        values: [],
        tones: { positive: 0, neutral: 0, attention: 0 },
      };
      cur.n += 1;
      acc.set(miss.id, cur);
    }
  }
  return [...acc.values()]
    .map((row) => {
      const missingRate = row.n > 0 ? Math.round((1 - row.filled / row.n) * 100) : 0;
      const toneTotal = row.tones.positive + row.tones.neutral + row.tones.attention;
      return {
        id: row.id,
        name: clipText(row.name, 80),
        category: row.category,
        areas: row.areas,
        observations: row.n,
        filled: row.filled,
        missing_rate_pct: missingRate,
        distribution: row.labels,
        median: median(row.values),
        tones:
          toneTotal >= 2
            ? {
                positive: pct(row.tones.positive / toneTotal),
                neutral: pct(row.tones.neutral / toneTotal),
                attention: pct(row.tones.attention / toneTotal),
              }
            : null,
      };
    })
    .filter((row) => row.filled > 0 || row.observations > 0)
    .sort((a, b) => b.filled - a.filled || a.id.localeCompare(b.id, 'ru'));
}

function observeVsSelfFromVisits(visits) {
  const observe = [];
  const self = [];
  for (const visit of visits || []) {
    if (isSelfAnalysisFormat(visit.format)) self.push(visit);
    else observe.push(visit);
  }
  const pack = (rows) => {
    let earned = 0;
    let max = 0;
    const secs = new Map();
    for (const visit of rows) {
      earned += Number(visit.earned) || 0;
      max += Number(visit.max) || 0;
      for (const sec of visit.sections || []) {
        const code = String(sec.code || '');
        if (!code) continue;
        const cur = secs.get(code) || { title: String(sec.title || code), earned: 0, max: 0 };
        if (sec.title) cur.title = String(sec.title);
        cur.earned += Number(sec.earned) || 0;
        cur.max += Number(sec.max) || 0;
        secs.set(code, cur);
      }
    }
    return {
      count: rows.length,
      pct: max > 0 ? pct(earned / max) : 0,
      sections: [...secs.entries()].map(([code, sec]) => ({
        code,
        title: sec.title,
        pct: sec.max > 0 ? pct(sec.earned / sec.max) : 0,
      })),
    };
  };
  const observeAgg = pack(observe);
  const selfAgg = pack(self);
  if (!observeAgg.count && !selfAgg.count) return null;
  const codes = new Set([
    ...observeAgg.sections.map((sec) => sec.code),
    ...selfAgg.sections.map((sec) => sec.code),
  ]);
  return {
    observe_pct: observeAgg.pct,
    self_pct: selfAgg.pct,
    gap: selfAgg.pct - observeAgg.pct,
    comparable: observeAgg.count > 0 && selfAgg.count > 0,
    sections: [...codes].map((code) => {
      const obs = observeAgg.sections.find((sec) => sec.code === code);
      const slf = selfAgg.sections.find((sec) => sec.code === code);
      return {
        title: (obs && obs.title) || (slf && slf.title) || code,
        observe: obs ? obs.pct : 0,
        self: slf ? slf.pct : 0,
        gap: (slf ? slf.pct : 0) - (obs ? obs.pct : 0),
      };
    }),
  };
}

function rubricHighlightsFromVisits(visits) {
  const ranked = criterionStatsFromVisits(visits)
    .filter((row) => row.filled >= 1 && row.median != null)
    .map((row) => ({
      title: row.name,
      id: row.id,
      n: row.filled,
      median: row.median,
      distribution: row.distribution,
    }));
  const byMedian = ranked.slice().sort((a, b) => (a.median || 0) - (b.median || 0));
  return {
    weak: byMedian.slice(0, 5),
    strong: byMedian.slice(-5).reverse(),
  };
}

function presentAreasFromVisits(visits) {
  const set = new Set();
  for (const visit of visits || []) {
    collectVisitCriteria(visit).presentAreas.forEach((a) => set.add(a));
  }
  return [...set]
    .filter((code) => AREA_TITLES[code])
    .sort()
    .map((code) => ({ code, title: AREA_TITLES[code] }));
}

function countBy(values) {
  const acc = new Map();
  for (const raw of values) {
    const v = String(raw || '').trim();
    if (!v) continue;
    acc.set(v, (acc.get(v) || 0) + 1);
  }
  return [...acc.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'));
}

function hashPayload(payload, promptVersion) {
  const raw = `${promptVersion || ''}|${stableStringify(payload)}`;
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 24);
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function buildVisitChecklistAiPayload(card) {
  const stats = card && card.stats && typeof card.stats === 'object' ? card.stats : {};
  const label = teacherDisplayName(card && card.teacher_label);
  const visits = Array.isArray(stats.visits) ? stats.visits : [];
  const dates = visits.map((v) => String(v.date || '').slice(0, 10)).filter(Boolean);
  const period = periodFromDates(dates);
  const observationCount = Math.max(
    Number(card && card.visit_count) || 0,
    Number(stats.visit_count) || 0,
    visits.length,
  );
  const instruments = [...new Set(visits.map(visitInstrumentKey))];
  const presentAreas = presentAreasFromVisits(visits);
  const observations = visits.map((visit) => {
    const packed = collectVisitCriteria(visit);
    return {
      date: String(visit.date || '').slice(0, 10),
      class: visit.class_name || '',
      subject: visit.subject || '',
      observer: isSelfAnalysisFormat(visit.format) ? '' : String(visit.visitor || ''),
      format: visit.format || '',
      ordinal: visit.ordinal || '',
      criteria: packed.criteria,
      missingCriteria: packed.missing,
      generalComment: stripCommentPii(visit.summary, 400),
      recommendations: stripCommentPii(visit.recommendations, 280),
    };
  });
  const sections = (stats.sections || [])
    .filter((sec) => sec && sec.fillRatio != null && Number(sec.max) > 0)
    .map((sec) => ({ title: sec.title, pct: pct(sec.fillRatio) }))
    .filter((sec) => sec.title);
  const compactVisits = observations.map((row) => {
    const out = {
      date: row.date,
      subject: row.subject,
      class_name: row.class,
      format: row.format,
      level: row.ordinal,
      conclusions: row.generalComment,
      takeaways: row.recommendations,
    };
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== '' && v != null));
  });
  const highlights = rubricHighlightsFromVisits(visits);
  return {
    teacher: {
      name: label,
      greeting: greetingName(label),
      subject: mostFrequent(visits.map((v) => v.subject)) || mostFrequent(stats.subjects || []),
      department: card && card.department ? String(card.department) : String(stats.department || ''),
    },
    period,
    observationCount,
    sampleRule: sampleRuleForCount(observationCount),
    basis: basisLine(observationCount, period),
    checklistVersions: instruments,
    checklistChanged: instruments.length > 1,
    presentAreas,
    observations,
    precomputed: {
      criterionFrequencies: criterionStatsFromVisits(visits).slice(0, 40),
      observe_vs_self: observeVsSelfFromVisits(visits),
      strong_items: highlights.strong,
      weak_items: highlights.weak,
      unanswered_never_negative: true,
      checklist_fill_pct: pct(stats.score_ratio),
      checklist_fill_is_not_rating: true,
    },
    rules: {
      neverInvent: true,
      missingIsNotNegative: true,
      noOverallTeacherRating: true,
      preferDistributionOverAverage: true,
      distinguishFactPatternAssumption: true,
    },
    department: card && card.department ? String(card.department) : '',
    visit_count: observationCount,
    sections,
    visits: compactVisits,
    observe_vs_self: observeVsSelfFromVisits(visits),
    weak_items: highlights.weak,
    strong_items: highlights.strong,
  };
}

function teacherAiPayloadHash(cardOrPayload) {
  const payload =
    cardOrPayload && cardOrPayload.observations
      ? cardOrPayload
      : buildVisitChecklistAiPayload(cardOrPayload);
  return hashPayload(payload, TEACHER_PROMPT_VERSION);
}

function coverageFromTeachers(teachers, kpis) {
  const rows = (teachers || []).map(normalizeTeacherRow);
  const visitCounts = rows.map(
    (row) => Number(row.visit_count) || Number(row.stats.visit_count) || (row.stats.visits || []).length,
  );
  const visits = flattenTeacherVisits(rows);
  const byVisits = { 0: 0, 1: 0, 2: 0, '3plus': 0 };
  for (const n of visitCounts) {
    if (n <= 0) byVisits[0] += 1;
    else if (n === 1) byVisits[1] += 1;
    else if (n === 2) byVisits[2] += 1;
    else byVisits['3plus'] += 1;
  }
  const teacherCount = Number(kpis && kpis.teacher_count) || rows.length;
  const withVisits = visitCounts.filter((n) => n > 0).length;
  return {
    visit_count: Number(kpis && kpis.response_count) || visits.length,
    teacher_count: teacherCount,
    teachers_with_visits: withVisits,
    coverage_pct: teacherCount > 0 ? pct(withVisits / teacherCount) : 0,
    teachers_by_visits: byVisits,
    observe_count: Number(kpis && kpis.observe_count) || visits.filter((v) => !isSelfAnalysisFormat(v.format)).length,
    self_count: Number(kpis && kpis.self_count) || visits.filter((v) => isSelfAnalysisFormat(v.format)).length,
    by_month: countBy(visits.map((v) => monthKey(v.date))),
    by_department: countBy(visits.map((v) => v._department)),
    by_subject: countBy(visits.map((v) => v.subject)),
    by_observer: countBy(visits.filter((v) => !isSelfAnalysisFormat(v.format)).map((v) => v.visitor)),
  };
}

function departmentStatistics(teachers) {
  const acc = new Map();
  for (const row of (teachers || []).map(normalizeTeacherRow)) {
    const name = String(row.department || row.stats.department || '').trim();
    if (!name) continue;
    const visits = row.stats.visits || [];
    const cur = acc.get(name) || { name, teachers: 0, visits: 0, medians: [] };
    cur.teachers += 1;
    cur.visits += Number(row.visit_count) || visits.length;
    const fill = Number(row.stats.score_ratio);
    if (Number.isFinite(fill) && fill > 0) cur.medians.push(fill);
    acc.set(name, cur);
  }
  return [...acc.values()]
    .filter((row) => row.visits >= MIN_DEPARTMENT_N)
    .map((row) => ({
      name: row.name,
      teachers: row.teachers,
      visits: row.visits,
      fill_median_pct: median(row.medians.map((n) => pct(n))),
      sample_sufficient: true,
    }))
    .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, 'ru'));
}

function observerStatistics(visits) {
  const byObs = new Map();
  const teacherObs = new Map();
  for (const visit of visits || []) {
    if (isSelfAnalysisFormat(visit.format)) continue;
    const name = String(visit.visitor || '').trim();
    if (!name) continue;
    const fill = visit.max > 0 ? visit.earned / visit.max : null;
    const cur = byObs.get(name) || { name, visits: 0, fills: [], teachers: new Set() };
    cur.visits += 1;
    if (fill != null && Number.isFinite(fill)) cur.fills.push(fill);
    if (visit._teacher_key) cur.teachers.add(visit._teacher_key);
    byObs.set(name, cur);
    if (visit._teacher_key) {
      const set = teacherObs.get(visit._teacher_key) || new Set();
      set.add(name);
      teacherObs.set(visit._teacher_key, set);
    }
  }
  const overlappingTeachers = [...teacherObs.values()].filter((set) => set.size >= 2).length;
  const comparable = overlappingTeachers >= OBSERVER_OVERLAP_MIN;
  const rows = [...byObs.values()].map((row) => ({
    name: row.name,
    visits: row.visits,
    fill_median_pct: median(row.fills.map((n) => pct(n))),
    teachers: row.teachers.size,
  }));
  let warning = false;
  if (comparable && rows.length >= 2) {
    const meds = rows.map((r) => r.fill_median_pct).filter((n) => n != null);
    if (meds.length >= 2) {
      warning = Math.max(...meds) - Math.min(...meds) >= 20;
    }
  }
  return {
    observers: rows.sort((a, b) => b.visits - a.visits),
    overlapping_teachers: overlappingTeachers,
    comparable,
    observer_effect_warning: warning || (!comparable && rows.length >= 2),
    warning_text:
      rows.length >= 2
        ? comparable
          ? warning
            ? 'На результаты может влиять состав наблюдателей: при пересекающихся посещениях медианы отметок заметно расходятся.'
            : 'Есть пересекающиеся наблюдения; устойчивого сдвига строгости не видно.'
          : 'На результаты может влиять состав наблюдателей. Сравнивать строгость корректно нельзя: пересекающихся посещений недостаточно.'
        : '',
  };
}

function trendStatistics(visits) {
  const byMonth = new Map();
  for (const visit of visits || []) {
    const key = monthKey(visit.date);
    if (!key) continue;
    const cur = byMonth.get(key) || { month: key, visits: 0, fills: [] };
    cur.visits += 1;
    if (visit.max > 0) cur.fills.push(visit.earned / visit.max);
    byMonth.set(key, cur);
  }
  const months = [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((row) => ({
      month: row.month,
      visits: row.visits,
      fill_median_pct: median(row.fills.map((n) => pct(n))),
    }));
  if (months.length < 2) {
    return { comparable: false, months, note: 'Недостаточно сопоставимых периодов для динамики.' };
  }
  const first = months[0];
  const last = months[months.length - 1];
  return {
    comparable: true,
    months,
    first,
    last,
    visit_delta: last.visits - first.visits,
    fill_delta_pct:
      first.fill_median_pct != null && last.fill_median_pct != null
        ? last.fill_median_pct - first.fill_median_pct
        : null,
  };
}

function dataQualityFromVisits(visits, coverage, instruments) {
  const crit = criterionStatsFromVisits(visits);
  const rare = crit.filter((row) => row.filled > 0 && row.filled <= 2).slice(0, 8);
  const highMissing = crit.filter((row) => row.observations >= 3 && row.missing_rate_pct >= 40).slice(0, 8);
  const uneven = coverage.teachers_by_visits['3plus'] === 0 && coverage.visit_count > 0;
  return {
    missing_fields: highMissing.map((row) => ({ id: row.id, name: row.name, missing_rate_pct: row.missing_rate_pct })),
    rare_criteria: rare.map((row) => ({ id: row.id, name: row.name, filled: row.filled })),
    uneven_visits: uneven,
    checklist_versions: instruments.length,
    checklist_changed: instruments.length > 1,
    small_samples: coverage.teachers_by_visits[1] + coverage.teachers_by_visits[2],
    compare_with_caution: instruments.length > 1 || coverage.visit_count < 5,
  };
}

function applyTeacherFilters(teachers, filters) {
  const status = filters && filters.status ? String(filters.status) : 'all';
  if (status === 'all') return teachers || [];
  return (teachers || []).filter((row) => {
    const published = Boolean(row.published_at);
    if (status === 'published') return published;
    if (status === 'unpublished') return !published;
    return true;
  });
}

function buildVisitChecklistSchoolAiPayload(input) {
  const kpis = input && input.kpis && typeof input.kpis === 'object' ? input.kpis : {};
  const filters = (input && input.filters) || {};
  const teachers = applyTeacherFilters(
    (Array.isArray(input && input.teachers) ? input.teachers : []).map(normalizeTeacherRow),
    filters,
  );
  const visits = flattenTeacherVisits(teachers);
  const coverage = coverageFromTeachers(teachers, {
    ...kpis,
    teacher_count: teachers.length || kpis.teacher_count,
    response_count: visits.length || kpis.response_count,
  });
  const dates = visits.map((v) => String(v.date || '').slice(0, 10)).filter(Boolean);
  const period = periodFromDates(dates);
  const instruments = [...new Set(visits.map(visitInstrumentKey))];
  const highlights = rubricHighlightsFromVisits(visits);
  const observers = observerStatistics(visits);
  const sections = (kpis.sections || [])
    .filter((sec) => sec && (sec.fillRatio != null || Number(sec.max) > 0))
    .map((sec) => ({ title: sec.title || sec.code || '', pct: pct(sec.fillRatio) }))
    .filter((sec) => sec.title);
  return {
    school: 'агрегат текущего среза',
    scope: {
      period,
      filters: {
        status: filters.status || 'all',
      },
      basis: basisLine(coverage.visit_count, period),
    },
    coverage,
    criteriaStatistics: criterionStatsFromVisits(visits).slice(0, 50),
    trendStatistics: trendStatistics(visits),
    departmentStatistics: departmentStatistics(teachers),
    observerStatistics: observers,
    dataQuality: dataQualityFromVisits(visits, coverage, instruments),
    presentAreas: presentAreasFromVisits(visits),
    checklistChanged: instruments.length > 1,
    observe_vs_self: observeVsSelfFromVisits(visits),
    strong_items: highlights.strong,
    weak_items: highlights.weak,
    sections,
    teacher_count: coverage.teacher_count,
    visit_count: coverage.visit_count,
    observe_count: coverage.observe_count,
    self_count: coverage.self_count,
    rules: {
      noTeacherRanking: true,
      noWorstTeachers: true,
      noHrDecisions: true,
      observerStrictnessOnlyIfOverlap: true,
      neverInvent: true,
    },
  };
}

function schoolAiPayloadHash(input) {
  return hashPayload(buildVisitChecklistSchoolAiPayload(input), SCHOOL_PROMPT_VERSION);
}

function payloadIndicatorIds(payload) {
  const ids = new Set();
  for (const obs of (payload && payload.observations) || []) {
    for (const row of obs.criteria || []) {
      if (row.id) ids.add(String(row.id));
    }
  }
  for (const row of (payload && payload.criteriaStatistics) || []) {
    if (row.id && row.filled > 0) ids.add(String(row.id));
  }
  return ids;
}

module.exports = {
  AREA_TITLES,
  SCHOOL_PROMPT_VERSION,
  TEACHER_PROMPT_VERSION,
  applyTeacherFilters,
  basisLine,
  buildVisitChecklistAiPayload,
  buildVisitChecklistSchoolAiPayload,
  criterionStatsFromVisits,
  flattenTeacherVisits,
  greetingName,
  hashPayload,
  isSelfAnalysisFormat,
  normalizeTeacherRow,
  observeVsSelfFromVisits,
  payloadIndicatorIds,
  periodFromDates,
  presentAreasFromVisits,
  rubricHighlightsFromVisits,
  sampleRuleForCount,
  schoolAiPayloadHash,
  stripCommentPii,
  teacherAiPayloadHash,
  teacherDisplayName,
};
