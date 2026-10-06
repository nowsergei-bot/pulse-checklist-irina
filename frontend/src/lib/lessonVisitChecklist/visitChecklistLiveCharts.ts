import type { LessonVisitChecklistConfig, LessonVisitDirectory, LessonVisitResponseRow } from './types.ts';
import {
  buildVisitQaSections,
  formatAnswerPick,
  personKey,
  responseMatchesTeacher,
  scoreVisitFromChecklistAnswers,
} from './visitChecklistCardAnswers.ts';
import { formatVisitChecklistDate, scorePct, trafficTone, visitFormatKind } from './visitChecklistCloudUi.ts';
import { pickVisitFormat } from './visitChecklistFormat.ts';
import { aggregateObserveVsSelf, type ObserveSelfAggregate } from './visitChecklistCompare.ts';
import {
  displayVisitDepartmentName,
  isKnownVisitTeacher,
  isKnownVisitTeacherResponse,
  resolveFullTeacherName,
  visitChecklistObservedTeachers,
} from './visitChecklistPeople.ts';
import { VISIT_CHECKLIST_TOTAL_MAX, getVisitRubricSections } from './visitChecklistRubricScore.ts';

export type LiveChartRow = {
  name: string;
  visits: number;
  score_ratio: number;
  score_pct: number;
  traffic: string;
  code?: string;
};

export type LiveVisitItem = {
  name: string;
  code: string;
  earned: number;
  max: number;
  score_pct: number;
  unanswered: boolean;
};

export type LiveVisitScore = {
  class_name: string;
  subject: string;
  visitor: string;
  format: string;
  ordinal: string;
  date: string;
  earned: number;
  max: number;
  fillRatio: number;
  sections: Array<{
    code: string;
    title: string;
    earned: number;
    max: number;
    fillRatio: number;
    items: LiveVisitItem[];
  }>;
};

export type RubricHighlight = {
  code: string;
  title: string;
  earned: number;
  max: number;
  fillRatio: number;
  score_pct: number;
  n: number;
};

export type WatcherSummary = {
  offline: number;
  online: number;
  self: number;
  visitors: Array<{ name: string; count: number }>;
};

export type CoverageKind = 'none' | 'self_only' | 'observe_only' | 'few_observe';

export type CoverageRow = {
  teacher_key: string;
  teacher_label: string;
  department: string;
  kind: CoverageKind;
  observe: number;
  self: number;
  dates?: string[];
};

export type CoverageGroups = {
  none: CoverageRow[];
  selfOnly: CoverageRow[];
  observeOnly: CoverageRow[];
  fewObserve: CoverageRow[];
};

export type DeptHeatmap = {
  departments: string[];
  sections: Array<{ code: string; title: string }>;
  cells: Array<{ department: string; code: string; fillRatio: number; visits: number }>;
};

export type LiveTeacherBundle = {
  teacher_key: string;
  teacher_label: string;
  department: string;
  visits: LiveVisitScore[];
  observe: number;
  self: number;
  offline: number;
  online: number;
  score_ratio: number;
  sections: Array<{ code: string; title: string; earned: number; max: number; fillRatio: number }>;
};

export type LiveDashboardCharts = {
  by_department: LiveChartRow[];
  by_subject: LiveChartRow[];
  by_class: LiveChartRow[];
  by_visitor: LiveChartRow[];
  by_format: LiveChartRow[];
  by_ordinal: LiveChartRow[];
  trend: LiveChartRow[];
  sections: LiveChartRow[];
  itemDiagrams: Array<{
    code: string;
    title: string;
    items: LiveChartRow[];
  }>;
  observeSelf: ObserveSelfAggregate;
  heatmap: DeptHeatmap;
  weakestItems: RubricHighlight[];
  coverage: CoverageGroups;
};

export const FEW_OBSERVE_MAX = 1;
export const TREND_VISIT_LIMIT = 5;
export const HIGHLIGHT_LIMIT = 3;
export const SCHOOL_WEAKEST_LIMIT = 10;

function pickGeneral(row: LessonVisitResponseRow, keys: string[]): string {
  const g = row.general || {};
  for (const key of keys) {
    const value = String(g[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function asChartRow(name: string, earned: number, max: number, visits: number): LiveChartRow {
  const score_ratio = max > 0 ? earned / max : 0;
  return {
    name,
    visits,
    score_ratio,
    score_pct: scorePct(score_ratio),
    traffic: trafficTone(score_ratio),
  };
}

function finalizeBuckets(map: Map<string, { name: string; earned: number; max: number; visits: number }>): LiveChartRow[] {
  return [...map.values()]
    .map((row) => asChartRow(row.name, row.earned, row.max, row.visits))
    .sort((a, b) => b.score_pct - a.score_pct || a.name.localeCompare(b.name, 'ru'));
}

export function externalVisitFormatLabel(raw: string | null | undefined): 'Очно' | 'Онлайн' | null {
  const kind = visitFormatKind(raw);
  if (kind === 'self') return null;
  if (!String(raw || '').trim() && kind === 'offline') {
    // Empty format is treated as offline by visitFormatKind; keep it only when a value exists.
    return String(raw || '').trim() ? 'Очно' : null;
  }
  return kind === 'online' ? 'Онлайн' : 'Очно';
}

export function visitFormatChartRows(rows: LiveChartRow[] | null | undefined): LiveChartRow[] {
  const acc = new Map<string, LiveChartRow>();
  for (const row of rows || []) {
    const name = externalVisitFormatLabel(row.name);
    if (!name) continue;
    const cur = acc.get(name);
    if (!cur) {
      acc.set(name, { ...row, name });
      continue;
    }
    const visits = (cur.visits || 0) + (row.visits || 0);
    const earned = (cur.score_ratio || 0) * (cur.visits || 0) + (row.score_ratio || 0) * (row.visits || 0);
    const score_ratio = visits > 0 ? earned / visits : 0;
    acc.set(name, {
      ...cur,
      name,
      visits,
      score_ratio,
      score_pct: scorePct(score_ratio),
      traffic: trafficTone(score_ratio),
    });
  }
  return [...acc.values()].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, 'ru'));
}

function addBucket(
  map: Map<string, { name: string; earned: number; max: number; visits: number }>,
  name: string,
  earned: number,
  max: number,
) {
  const key = String(name || '').trim();
  if (!key) return;
  const cur = map.get(key) || { name: key, earned: 0, max: 0, visits: 0 };
  cur.earned += earned;
  cur.max += max;
  cur.visits += 1;
  map.set(key, cur);
}

function officialSections() {
  return getVisitRubricSections().map((sec) => ({ code: sec.code, title: sec.title }));
}

export function scoreLiveVisitRow(
  checklist: LessonVisitChecklistConfig | null | undefined,
  row: LessonVisitResponseRow,
): LiveVisitScore {
  const official = scoreVisitFromChecklistAnswers(checklist, row.answers);
  const qa = buildVisitQaSections(checklist, row.answers);
  const q101 = qa.flatMap((sec) => sec.items).find((item) => item.code === '10.1');
  let earned = 0;
  let max = 0;
  const sections = official.map((sec) => {
    earned += sec.earnedPoints;
    max += sec.maxPoints;
    return {
      code: sec.code,
      title: sec.title,
      earned: sec.earnedPoints,
      max: sec.maxPoints,
      fillRatio: sec.fillRatio,
      items: sec.items
        .filter((item) => item.maxPoints > 0)
        .map((item) => ({
          name: item.indicator,
          code: String(item.itemCode || ''),
          earned: item.earnedPoints,
          max: item.maxPoints,
          score_pct: item.maxPoints > 0 ? scorePct(item.earnedPoints / item.maxPoints) : 0,
          unanswered: item.selectedLabels.length === 0,
        })),
    };
  });
  if (!sections.length) {
    max = VISIT_CHECKLIST_TOTAL_MAX;
  }
  return {
    class_name: pickGeneral(row, ['class_name', 'class', 'className']),
    subject: pickGeneral(row, ['subject', 'lesson_subject', 'discipline']),
    visitor: pickGeneral(row, ['visitor_name', 'visitor', 'observer']),
    format: pickVisitFormat(row.general) || pickGeneral(row, ['visit_format', 'format']),
    ordinal: formatAnswerPick(q101?.pick) || pickGeneral(row, ['ordinal', 'lesson_level']),
    date: pickGeneral(row, ['visit_date', 'date']).slice(0, 10) || String(row.created_at || '').slice(0, 10),
    earned,
    max,
    fillRatio: max > 0 ? earned / max : 0,
    sections,
  };
}

function minAnswersForRank(visitCount: number, schoolWide: boolean): number {
  if (schoolWide) {
    if (visitCount >= 8) return 3;
    if (visitCount >= 3) return 2;
    return 1;
  }
  return visitCount >= 3 ? 2 : 1;
}

export function rankRubricItems(
  visits: LiveVisitScore[] | null | undefined,
  opts?: { limit?: number; direction?: 'weak' | 'strong'; schoolWide?: boolean },
): RubricHighlight[] {
  const rows = visits || [];
  const acc = new Map<string, { code: string; title: string; earned: number; max: number; n: number }>();
  for (const visit of rows) {
    for (const sec of visit.sections) {
      for (const item of sec.items) {
        if (item.unanswered || item.max <= 0) continue;
        const code = item.code || item.name;
        const cur = acc.get(code) || { code, title: item.name, earned: 0, max: 0, n: 0 };
        if (item.name) cur.title = item.name;
        cur.earned += item.earned;
        cur.max += item.max;
        cur.n += 1;
        acc.set(code, cur);
      }
    }
  }
  const minN = minAnswersForRank(rows.length, Boolean(opts?.schoolWide));
  const ranked = [...acc.values()]
    .filter((item) => item.n >= minN && item.max > 0)
    .map((item) => {
      const fillRatio = item.earned / item.max;
      return {
        code: item.code,
        title: item.title,
        earned: Math.round((item.earned / item.n) * 100) / 100,
        max: Math.round((item.max / item.n) * 100) / 100,
        fillRatio,
        score_pct: scorePct(fillRatio),
        n: item.n,
      };
    });
  ranked.sort((a, b) =>
    opts?.direction === 'strong'
      ? b.fillRatio - a.fillRatio || b.n - a.n
      : a.fillRatio - b.fillRatio || b.n - a.n,
  );
  return ranked.slice(0, opts?.limit ?? HIGHLIGHT_LIMIT);
}

export function liveVisitsFromCard(card: {
  stats?: {
    visits?: Array<{
      date?: string | null;
      subject?: string | null;
      class_name?: string | null;
      visitor?: string | null;
      format?: string | null;
      earned?: number | null;
      max?: number | null;
      sections?: Array<{
        code?: string;
        title?: string;
        earned?: number;
        max?: number;
        fillRatio?: number;
        marks?: Array<{ code?: string; pick?: string; pts?: number; max?: number; indicator?: string }>;
      }>;
    }>;
  } | null;
} | null | undefined): LiveVisitScore[] {
  return (card?.stats?.visits || []).map((visit) => {
    const sections = (visit.sections || []).map((sec) => {
      const items = (sec.marks || []).map((mark) => {
        const max = Number(mark.max) || 0;
        const earned = Number(mark.pts) || 0;
        return {
          name: String(mark.indicator || mark.code || ''),
          code: String(mark.code || ''),
          earned,
          max,
          score_pct: max > 0 ? scorePct(earned / max) : 0,
          unanswered: !String(mark.pick || '').trim(),
        };
      });
      const earned = Number(sec.earned) || items.reduce((sum, item) => sum + item.earned, 0);
      const max = Number(sec.max) || items.reduce((sum, item) => sum + item.max, 0);
      return {
        code: String(sec.code || ''),
        title: String(sec.title || sec.code || ''),
        earned,
        max,
        fillRatio: sec.fillRatio != null ? Number(sec.fillRatio) : max > 0 ? earned / max : 0,
        items,
      };
    });
    const earned = Number(visit.earned) || sections.reduce((sum, sec) => sum + sec.earned, 0);
    const max = Number(visit.max) || sections.reduce((sum, sec) => sum + sec.max, 0);
    return {
      class_name: String(visit.class_name || ''),
      subject: String(visit.subject || ''),
      visitor: String(visit.visitor || ''),
      format: String(visit.format || ''),
      ordinal: '',
      date: String(visit.date || '').slice(0, 10),
      earned,
      max,
      fillRatio: max > 0 ? earned / max : 0,
      sections,
    };
  });
}

export function visitTrendPoints(
  visits: LiveVisitScore[] | null | undefined,
  limit = TREND_VISIT_LIMIT,
): Array<{ date: string; score_pct: number; format: string; label: string }> {
  return [...(visits || [])]
    .filter((visit) => visit.date || visit.max > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.subject.localeCompare(b.subject, 'ru'))
    .slice(-Math.max(3, Math.min(limit, TREND_VISIT_LIMIT)))
    .map((visit, idx) => ({
      date: visit.date || `запись ${idx + 1}`,
      score_pct: scorePct(visit.fillRatio),
      format: visit.format,
      label: [visit.date, visit.subject, visit.class_name].filter(Boolean).join(' · ') || visit.date,
    }));
}

export function summarizeWatchers(visits: LiveVisitScore[] | null | undefined): WatcherSummary {
  const visitors = new Map<string, number>();
  const counts = { offline: 0, online: 0, self: 0 };
  for (const visit of visits || []) {
    const kind = visitFormatKind(visit.format);
    counts[kind] += 1;
    const name = String(visit.visitor || '').trim();
    if (!name || kind === 'self') continue;
    visitors.set(name, (visitors.get(name) || 0) + 1);
  }
  return {
    ...counts,
    visitors: [...visitors.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru')),
  };
}

export function observeSelfSectionGaps(observeSelf: ObserveSelfAggregate | null | undefined): Array<{
  code: string;
  title: string;
  observe: number;
  self: number;
  gap: number;
  flagged: boolean;
  selfMuchHigher: boolean;
}> {
  if (!observeSelf?.comparable) return [];
  const byCode = new Map<string, { code: string; title: string; observe: number; self: number }>();
  for (const sec of observeSelf.observe.sections) {
    byCode.set(sec.code, { code: sec.code, title: sec.title, observe: scorePct(sec.fillRatio), self: 0 });
  }
  for (const sec of observeSelf.self.sections) {
    const cur = byCode.get(sec.code) || { code: sec.code, title: sec.title, observe: 0, self: 0 };
    cur.self = scorePct(sec.fillRatio);
    if (sec.title) cur.title = sec.title;
    byCode.set(sec.code, cur);
  }
  return [...byCode.values()].map((sec) => {
    const gap = sec.self - sec.observe;
    const flagged = Math.abs(gap) > 20;
    return { ...sec, gap, flagged, selfMuchHigher: gap > 20 };
  });
}

type TeacherListLike = {
  teacher_key: string;
  teacher_label: string;
  department?: string | null;
};

function usableCoverageTeachers(
  teachers: TeacherListLike[] | null | undefined,
  directory?: LessonVisitDirectory | null,
): TeacherListLike[] {
  return (teachers || []).filter((teacher) => {
    const label = resolveFullTeacherName(teacher.teacher_label, directory) || teacher.teacher_label;
    return isKnownVisitTeacher(label, directory) || isKnownVisitTeacher(teacher.teacher_key, directory);
  });
}

function visitDates(visits: LiveVisitScore[]): string[] {
  return [...new Set(visits.map((visit) => String(visit.date || '').trim()).filter(Boolean))].sort();
}

export function coverageRowHoverText(row: CoverageRow): string {
  const dates = (row.dates || [])
    .map((value) => formatVisitChecklistDate(value))
    .filter((value) => value && value !== 'дата не указана');
  return [row.department, ...dates].filter(Boolean).join(' · ');
}

export function coverageRowVisibleLabel(row: Pick<CoverageRow, 'teacher_label'>): string {
  return String(row.teacher_label || '').trim();
}

export function buildLiveTeacherBundles(
  teachers: TeacherListLike[] | null | undefined,
  responses: LessonVisitResponseRow[] | null | undefined,
  checklist: LessonVisitChecklistConfig | null | undefined,
  directory?: LessonVisitDirectory | null,
): LiveTeacherBundle[] {
  const rows = (responses || []).filter((row) => isKnownVisitTeacherResponse(row, directory));
  return usableCoverageTeachers(teachers, directory).map((teacher) => {
    const matched = rows.filter((row) =>
      responseMatchesTeacher(row, teacher.teacher_key, teacher.teacher_label, directory),
    );
    const visits = matched.map((row) => scoreLiveVisitRow(checklist, row));
    let earned = 0;
    let max = 0;
    let observe = 0;
    let self = 0;
    let offline = 0;
    let online = 0;
    const secAcc = new Map<string, { code: string; title: string; earned: number; max: number }>();
    for (const visit of visits) {
      earned += visit.earned;
      max += visit.max;
      const kind = visitFormatKind(visit.format);
      if (kind === 'self') self += 1;
      else observe += 1;
      if (kind === 'offline') offline += 1;
      if (kind === 'online') online += 1;
      for (const sec of visit.sections) {
        const cur = secAcc.get(sec.code) || { code: sec.code, title: sec.title, earned: 0, max: 0 };
        if (sec.title) cur.title = sec.title;
        cur.earned += sec.earned;
        cur.max += sec.max;
        secAcc.set(sec.code, cur);
      }
    }
    return {
      teacher_key: teacher.teacher_key,
      teacher_label: resolveFullTeacherName(teacher.teacher_label, directory) || teacher.teacher_label,
      department: teacher.department || 'Без кафедры',
      visits,
      observe,
      self,
      offline,
      online,
      score_ratio: max > 0 ? earned / max : 0,
      sections: officialSections().map((sec) => {
        const hit = secAcc.get(sec.code);
        return {
          code: sec.code,
          title: hit?.title || sec.title,
          earned: hit?.earned || 0,
          max: hit?.max || 0,
          fillRatio: hit && hit.max > 0 ? hit.earned / hit.max : 0,
        };
      }),
    };
  });
}

export function buildDepartmentSectionMeans(
  bundles: LiveTeacherBundle[],
  department: string | null | undefined,
  currentKey?: string | null,
): Array<{ code: string; title: string; fillRatio: number }> {
  const dep = personKey(department);
  const peers = bundles.filter(
    (row) => row.teacher_key !== currentKey && personKey(row.department) === dep && row.visits.length,
  );
  const pool = peers.length ? peers : bundles.filter((row) => personKey(row.department) === dep && row.visits.length);
  return officialSections().map((sec) => {
    let earned = 0;
    let max = 0;
    for (const row of pool) {
      const hit = row.sections.find((item) => item.code === sec.code);
      if (!hit || hit.max <= 0) continue;
      earned += hit.earned;
      max += hit.max;
    }
    return { code: sec.code, title: sec.title, fillRatio: max > 0 ? earned / max : 0 };
  });
}

export function buildDepartmentSectionHeatmap(bundles: LiveTeacherBundle[]): DeptHeatmap {
  const sections = officialSections();
  const byDept = new Map<string, { earned: Map<string, number>; max: Map<string, number>; visits: number }>();
  for (const row of bundles) {
    if (!row.visits.length) continue;
    const name = row.department || 'Без кафедры';
    const cur = byDept.get(name) || { earned: new Map(), max: new Map(), visits: 0 };
    cur.visits += row.visits.length;
    for (const sec of row.sections) {
      cur.earned.set(sec.code, (cur.earned.get(sec.code) || 0) + sec.earned);
      cur.max.set(sec.code, (cur.max.get(sec.code) || 0) + sec.max);
    }
    byDept.set(name, cur);
  }
  const departments = [...byDept.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
  const cells: DeptHeatmap['cells'] = [];
  for (const department of departments) {
    const cur = byDept.get(department);
    if (!cur) continue;
    for (const sec of sections) {
      const max = cur.max.get(sec.code) || 0;
      const earned = cur.earned.get(sec.code) || 0;
      cells.push({
        department,
        code: sec.code,
        fillRatio: max > 0 ? earned / max : 0,
        visits: cur.visits,
      });
    }
  }
  return { departments, sections, cells };
}

export function buildTeacherCoverage(bundles: LiveTeacherBundle[]): CoverageGroups {
  const none: CoverageRow[] = [];
  const selfOnly: CoverageRow[] = [];
  const observeOnly: CoverageRow[] = [];
  const fewObserve: CoverageRow[] = [];
  for (const row of bundles) {
    if (!isKnownVisitTeacher(row.teacher_label)) continue;
    const item: CoverageRow = {
      teacher_key: row.teacher_key,
      teacher_label: row.teacher_label,
      department: row.department,
      kind: 'none',
      observe: row.observe,
      self: row.self,
      dates: visitDates(row.visits),
    };
    if (row.observe === 0 && row.self === 0) {
      item.kind = 'none';
      none.push(item);
    } else if (row.observe === 0 && row.self > 0) {
      item.kind = 'self_only';
      selfOnly.push(item);
    } else {
      if (row.self === 0) {
        observeOnly.push({ ...item, kind: 'observe_only' });
      }
      if (row.observe <= FEW_OBSERVE_MAX) {
        fewObserve.push({ ...item, kind: 'few_observe' });
      }
    }
  }
  const byName = (a: CoverageRow, b: CoverageRow) => a.teacher_label.localeCompare(b.teacher_label, 'ru');
  none.sort(byName);
  selfOnly.sort(byName);
  observeOnly.sort(byName);
  fewObserve.sort(byName);
  return { none, selfOnly, observeOnly, fewObserve };
}

export function pendingVisitTeachers(coverage: CoverageGroups | null | undefined): CoverageRow[] {
  const rows = [...(coverage?.none || []), ...(coverage?.selfOnly || [])];
  return rows.sort((a, b) => a.teacher_label.localeCompare(b.teacher_label, 'ru'));
}

export function buildCoverageTeacherList(
  directory: LessonVisitDirectory | null | undefined,
  dashTeachers?: TeacherListLike[] | null,
): TeacherListLike[] {
  const observed = visitChecklistObservedTeachers(directory);
  const byNorm = new Map<string, TeacherListLike>();
  const remember = (row: TeacherListLike, preferExistingKey = false) => {
    const norm = personKey(row.teacher_label) || personKey(row.teacher_key);
    if (!norm) return;
    const prev = byNorm.get(norm);
    if (!prev) {
      byNorm.set(norm, row);
      return;
    }
    byNorm.set(norm, {
      teacher_key: preferExistingKey ? prev.teacher_key || row.teacher_key : row.teacher_key || prev.teacher_key,
      teacher_label: row.teacher_label || prev.teacher_label,
      department: row.department || prev.department,
    });
  };
  for (const teacher of observed) {
    if (!isKnownVisitTeacher(teacher.name, directory)) continue;
    const dept = directory?.departments.find((item) => item.id === teacher.departmentId);
    remember({
      teacher_key: teacher.id,
      teacher_label: teacher.name,
      department: displayVisitDepartmentName(dept?.name || '') || 'Без кафедры',
    });
  }
  for (const row of dashTeachers || []) {
    const label = resolveFullTeacherName(row.teacher_label, directory) || row.teacher_label;
    if (!isKnownVisitTeacher(label, directory) && !isKnownVisitTeacher(row.teacher_key, directory)) continue;
    remember(
      {
        teacher_key: row.teacher_key,
        teacher_label: row.teacher_label,
        department: row.department || 'Без кафедры',
      },
      false,
    );
  }
  return [...byNorm.values()];
}

export function buildLiveDashboardCharts(
  rows: LessonVisitResponseRow[] | null | undefined,
  checklist: LessonVisitChecklistConfig | null | undefined,
  teachers?: TeacherListLike[] | null,
  directory?: LessonVisitDirectory | null,
): LiveDashboardCharts {
  const usableRows = (rows || []).filter((row) => isKnownVisitTeacherResponse(row, directory));
  const scored = usableRows.map((row) => scoreLiveVisitRow(checklist, row));
  const bySubject = new Map<string, { name: string; earned: number; max: number; visits: number }>();
  const byClass = new Map<string, { name: string; earned: number; max: number; visits: number }>();
  const byVisitor = new Map<string, { name: string; earned: number; max: number; visits: number }>();
  const byFormat = new Map<string, { name: string; earned: number; max: number; visits: number }>();
  const byOrdinal = new Map<string, { name: string; earned: number; max: number; visits: number }>();
  const byDate = new Map<string, { name: string; earned: number; max: number; visits: number }>();
  const sectionAcc = new Map<string, { code: string; title: string; earned: number; max: number }>();
  const itemAcc = new Map<string, Map<string, { name: string; earned: number; max: number; n: number }>>();

  for (const visit of scored) {
    addBucket(bySubject, visit.subject, visit.earned, visit.max);
    addBucket(byClass, visit.class_name, visit.earned, visit.max);
    addBucket(byVisitor, visit.visitor, visit.earned, visit.max);
    const formatName = externalVisitFormatLabel(visit.format);
    if (formatName) addBucket(byFormat, formatName, visit.earned, visit.max);
    addBucket(byOrdinal, visit.ordinal, visit.earned, visit.max);
    addBucket(byDate, visit.date, visit.earned, visit.max);
    for (const sec of visit.sections) {
      const cur = sectionAcc.get(sec.code) || { code: sec.code, title: sec.title, earned: 0, max: 0 };
      cur.earned += sec.earned;
      cur.max += sec.max;
      if (sec.title) cur.title = sec.title;
      sectionAcc.set(sec.code, cur);
      const items = itemAcc.get(sec.code) || new Map();
      for (const item of sec.items) {
        if (item.unanswered) continue;
        const prev = items.get(item.code || item.name) || { name: item.name, earned: 0, max: 0, n: 0 };
        if (item.name) prev.name = item.name;
        prev.earned += item.earned;
        prev.max += item.max;
        prev.n += 1;
        items.set(item.code || item.name, prev);
      }
      itemAcc.set(sec.code, items);
    }
  }

  const sections = officialSections().map((sec) => {
    const hit = sectionAcc.get(sec.code);
    return {
      ...asChartRow(hit?.title || sec.title, hit?.earned || 0, hit?.max || 0, scored.length),
      code: sec.code,
    };
  });

  const itemDiagrams = officialSections()
    .map((sec) => {
      const items = [...(itemAcc.get(sec.code)?.values() || [])].map((item) =>
        asChartRow(item.name, item.earned, item.max, item.n),
      );
      return { code: sec.code, title: sectionAcc.get(sec.code)?.title || sec.title, items };
    })
    .filter((sec) => sec.items.length);

  const bundles = buildLiveTeacherBundles(teachers || [], usableRows, checklist, directory);
  const byDepartment = new Map<string, { name: string; earned: number; max: number; visits: number }>();
  for (const row of bundles) {
    for (const visit of row.visits) {
      addBucket(byDepartment, row.department || 'Без кафедры', visit.earned, visit.max);
    }
  }

  return {
    by_department: finalizeBuckets(byDepartment),
    by_subject: finalizeBuckets(bySubject),
    by_class: finalizeBuckets(byClass),
    by_visitor: finalizeBuckets(byVisitor),
    by_format: finalizeBuckets(byFormat),
    by_ordinal: finalizeBuckets(byOrdinal),
    trend: finalizeBuckets(byDate).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    sections,
    itemDiagrams,
    observeSelf: aggregateObserveVsSelf(
      scored.map((visit) => ({
        format: visit.format,
        earned: visit.earned,
        max: visit.max,
        sections: visit.sections,
      })),
    ),
    heatmap: buildDepartmentSectionHeatmap(bundles),
    weakestItems: rankRubricItems(scored, { limit: SCHOOL_WEAKEST_LIMIT, direction: 'weak', schoolWide: true }),
    coverage: buildTeacherCoverage(bundles),
  };
}

export function preferChartRows(
  primary: LiveChartRow[] | null | undefined,
  fallback: LiveChartRow[] | null | undefined,
): LiveChartRow[] {
  if (primary && primary.length) return primary;
  return fallback && fallback.length ? fallback : [];
}
