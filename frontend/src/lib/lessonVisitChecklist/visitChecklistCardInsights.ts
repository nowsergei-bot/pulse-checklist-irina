import { aggregateObserveVsSelf } from './visitChecklistCompare.ts';
import {
  itemTrafficTone,
  scorePct,
  type ItemTrafficTone,
} from './visitChecklistCloudUi.ts';
import {
  HIGHLIGHT_LIMIT,
  TREND_VISIT_LIMIT,
  liveVisitsFromCard,
  observeSelfSectionGaps,
  pendingVisitTeachers,
  rankRubricItems,
  scoreLiveVisitRow,
  summarizeWatchers,
  visitTrendPoints,
  type LiveDashboardCharts,
  type LiveTeacherBundle,
  type LiveVisitItem,
  type LiveVisitScore,
} from './visitChecklistLiveCharts.ts';
import type { LessonVisitChecklistConfig, LessonVisitDirectory, LessonVisitResponseRow } from './types.ts';
import { responseMatchesTeacher } from './visitChecklistCardAnswers.ts';

export const SECTION_GAP_PP = 20;
export const TREND_DELTA_PP = 5;
export const STREAK_MIN = 2;
export const OUTLIER_PP = 20;

export type TrendDirection = 'rising' | 'flat' | 'falling';

export type SliceRow = {
  name: string;
  visits: number;
  score_pct: number;
};

export type CoverageMix = {
  scored: number;
  explicitZero: number;
  unanswered: number;
  total: number;
  scoredPct: number;
  zeroPct: number;
  unansweredPct: number;
};

export type StableItem = {
  code: string;
  title: string;
  streak: number;
  traffic: 'green' | 'red';
};

export type VisitHighlightItem = {
  code: string;
  title: string;
  score_pct: number;
  earned: number;
  max: number;
};

export type VisitHighlights = {
  best: VisitHighlightItem[];
  worst: VisitHighlightItem[];
};

export type MethodistDraft = {
  keep: string | null;
  strengthen: string | null;
  check: string | null;
};

export type TeacherCardInsights = {
  visits: LiveVisitScore[];
  sectionGaps: Array<{
    code: string;
    title: string;
    observe: number;
    self: number;
    gap: number;
    flagged: boolean;
  }>;
  trend: {
    points: Array<{ date: string; score_pct: number; format: string; label: string }>;
    direction: TrendDirection;
  };
  strengths: StableItem[];
  weaknesses: StableItem[];
  coverage: CoverageMix;
  bySubject: SliceRow[];
  byClass: SliceRow[];
  draft: MethodistDraft;
  badges: { gap: boolean; repeat: boolean };
  highlightsByVisit: VisitHighlights[];
};

export type DeptOutlier = {
  teacher_key: string;
  teacher_label: string;
  department: string;
  score_pct: number;
  dept_pct: number;
  delta: number;
};

export type QueueTeacher = {
  teacher_key: string;
  teacher_label: string;
  department: string;
  observe: number;
  self: number;
};

export type RecurringWeakItem = {
  code: string;
  title: string;
  score_pct: number;
  teacher_count: number;
  n: number;
};

export type MethodistInsights = {
  outliers: DeptOutlier[];
  visitors: Array<{ name: string; count: number; score_pct: number }>;
  pending: QueueTeacher[];
  selfOnly: QueueTeacher[];
  observeOnly: QueueTeacher[];
  recurringWeak: RecurringWeakItem | null;
};

function shortTitle(raw: string, fallback = 'пункт'): string {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > 72 ? `${text.slice(0, 69).trim()}…` : text;
}

export function trendDirectionOf(points: Array<{ score_pct: number }>, deltaPp = TREND_DELTA_PP): TrendDirection {
  if (points.length < 2) return 'flat';
  const delta = points[points.length - 1].score_pct - points[0].score_pct;
  if (delta >= deltaPp) return 'rising';
  if (delta <= -deltaPp) return 'falling';
  return 'flat';
}

export function trendDirectionLabel(direction: TrendDirection): string {
  if (direction === 'rising') return 'растёт';
  if (direction === 'falling') return 'снижается';
  return 'ровно';
}

function flattenItems(visit: { sections?: LiveVisitScore['sections'] } | null | undefined): LiveVisitItem[] {
  return (visit?.sections || []).flatMap((sec) => sec.items);
}

export function coverageFromVisits(visits: LiveVisitScore[] | null | undefined): CoverageMix {
  let scored = 0;
  let explicitZero = 0;
  let unanswered = 0;
  for (const visit of visits || []) {
    for (const item of flattenItems(visit)) {
      if (item.max <= 0) continue;
      if (item.unanswered) {
        unanswered += 1;
        continue;
      }
      if (item.earned <= 0) explicitZero += 1;
      else scored += 1;
    }
  }
  const total = scored + explicitZero + unanswered;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return {
    scored,
    explicitZero,
    unanswered,
    total,
    scoredPct: pct(scored),
    zeroPct: pct(explicitZero),
    unansweredPct: pct(unanswered),
  };
}

function sliceRows(visits: LiveVisitScore[], pick: (visit: LiveVisitScore) => string): SliceRow[] {
  const map = new Map<string, { name: string; earned: number; max: number; visits: number }>();
  for (const visit of visits) {
    const name = String(pick(visit) || '').trim();
    if (!name) continue;
    const cur = map.get(name) || { name, earned: 0, max: 0, visits: 0 };
    cur.earned += visit.earned;
    cur.max += visit.max;
    cur.visits += 1;
    map.set(name, cur);
  }
  return [...map.values()]
    .map((row) => ({
      name: row.name,
      visits: row.visits,
      score_pct: row.max > 0 ? scorePct(row.earned / row.max) : 0,
    }))
    .sort((a, b) => a.score_pct - b.score_pct || a.name.localeCompare(b.name, 'ru'));
}

export function stableItemStreaks(visits: LiveVisitScore[] | null | undefined, min = STREAK_MIN): {
  strengths: StableItem[];
  weaknesses: StableItem[];
} {
  const chrono = [...(visits || [])].sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || a.subject.localeCompare(b.subject, 'ru'),
  );
  const byCode = new Map<string, { title: string; tones: ItemTrafficTone[] }>();
  for (const visit of chrono) {
    for (const item of flattenItems(visit)) {
      if (!item.code && !item.name) continue;
      const code = item.code || item.name;
      const cur = byCode.get(code) || { title: item.name || code, tones: [] };
      if (item.name) cur.title = item.name;
      cur.tones.push(itemTrafficTone(item.max > 0 ? item.earned / item.max : null, item.unanswered || item.max <= 0));
      byCode.set(code, cur);
    }
  }
  const strengths: StableItem[] = [];
  const weaknesses: StableItem[] = [];
  for (const [code, row] of byCode) {
    if (row.tones.length < min) continue;
    const last = row.tones[row.tones.length - 1];
    if (last !== 'green' && last !== 'red') continue;
    let streak = 0;
    for (let i = row.tones.length - 1; i >= 0; i -= 1) {
      if (row.tones[i] !== last) break;
      streak += 1;
    }
    if (streak < min) continue;
    const item = { code, title: shortTitle(row.title, code), streak, traffic: last };
    if (last === 'green') strengths.push(item);
    else weaknesses.push(item);
  }
  strengths.sort((a, b) => b.streak - a.streak || a.title.localeCompare(b.title, 'ru'));
  weaknesses.sort((a, b) => b.streak - a.streak || a.title.localeCompare(b.title, 'ru'));
  return { strengths: strengths.slice(0, 5), weaknesses: weaknesses.slice(0, 5) };
}

export function highlightsForVisit(visit: LiveVisitScore | null | undefined, limit = HIGHLIGHT_LIMIT): VisitHighlights {
  const answered = flattenItems(visit).filter(
    (item) => !item.unanswered && item.max > 0,
  );
  const toHi = (item: LiveVisitItem): VisitHighlightItem => ({
    code: item.code,
    title: shortTitle(item.name, item.code),
    score_pct: item.score_pct,
    earned: item.earned,
    max: item.max,
  });
  const best = [...answered].sort((a, b) => b.score_pct - a.score_pct || a.name.localeCompare(b.name, 'ru')).slice(0, limit);
  const worst = [...answered].sort((a, b) => a.score_pct - b.score_pct || a.name.localeCompare(b.name, 'ru')).slice(0, limit);
  return { best: best.map(toHi), worst: worst.map(toHi) };
}

function draftFromData(opts: {
  strengths: StableItem[];
  weaknesses: StableItem[];
  gaps: TeacherCardInsights['sectionGaps'];
  coverage: CoverageMix;
  byClass: SliceRow[];
  bySubject: SliceRow[];
}): MethodistDraft {
  const keep = opts.strengths[0]?.title || null;
  const weakClass = opts.byClass.find((row) => row.score_pct < 45);
  const weakSubject = opts.bySubject.find((row) => row.score_pct < 45);
  const strengthen =
    opts.weaknesses[0]?.title || weakClass?.name || weakSubject?.name || null;
  const gap = opts.gaps.find((row) => row.flagged);
  let check: string | null = null;
  if (gap) {
    check = `${gap.title}: разрыв ${Math.abs(gap.gap)} п.п.`;
  } else if (opts.weaknesses[0]) {
    check = `${opts.weaknesses[0].title} снова в красной зоне`;
  } else if (opts.coverage.unanswered > 0 && opts.coverage.unansweredPct >= 25) {
    check = `незаполненные пункты (${opts.coverage.unansweredPct}%)`;
  } else if (weakClass) {
    check = `класс ${weakClass.name}`;
  } else if (weakSubject) {
    check = `предмет ${weakSubject.name}`;
  }
  return {
    keep: keep ? `Удержать: ${keep}` : null,
    strengthen: strengthen ? `Подтянуть: ${strengthen}` : null,
    check: check ? `На следующем визите: ${check}` : null,
  };
}

export function preferLiveVisits(
  live: LiveVisitScore[] | null | undefined,
  card: Parameters<typeof liveVisitsFromCard>[0],
): LiveVisitScore[] {
  if (live && live.length) return live;
  return liveVisitsFromCard(card);
}

export function liveVisitsForTeacher(
  card: { teacher_key: string; teacher_label: string } | null | undefined,
  responses: LessonVisitResponseRow[] | null | undefined,
  checklist: LessonVisitChecklistConfig | null | undefined,
  directory?: LessonVisitDirectory | null,
): LiveVisitScore[] {
  if (!card) return [];
  return (responses || [])
    .filter((row) => responseMatchesTeacher(row, card.teacher_key, card.teacher_label, directory))
    .map((row) => scoreLiveVisitRow(checklist, row));
}

export function buildTeacherCardInsights(opts: {
  card?: Parameters<typeof liveVisitsFromCard>[0];
  liveVisits?: LiveVisitScore[] | null;
}): TeacherCardInsights {
  const visits = preferLiveVisits(opts.liveVisits, opts.card);
  const observeSelf = aggregateObserveVsSelf(visits);
  const sectionGaps = observeSelfSectionGaps(observeSelf).map((row) => ({
    code: row.code,
    title: row.title,
    observe: row.observe,
    self: row.self,
    gap: row.gap,
    flagged: Math.abs(row.gap) > SECTION_GAP_PP,
  }));
  const points = visitTrendPoints(visits, TREND_VISIT_LIMIT);
  const { strengths, weaknesses } = stableItemStreaks(visits);
  const coverage = coverageFromVisits(visits);
  const bySubject = sliceRows(visits, (visit) => visit.subject);
  const byClass = sliceRows(visits, (visit) => visit.class_name);
  return {
    visits,
    sectionGaps,
    trend: { points, direction: trendDirectionOf(points) },
    strengths,
    weaknesses,
    coverage,
    bySubject,
    byClass,
    draft: draftFromData({ strengths, weaknesses, gaps: sectionGaps, coverage, byClass, bySubject }),
    badges: {
      gap: sectionGaps.some((row) => row.flagged),
      repeat: weaknesses.some((row) => row.streak >= STREAK_MIN),
    },
    highlightsByVisit: visits.map((visit) => highlightsForVisit(visit)),
  };
}

export function departmentOutliers(bundles: LiveTeacherBundle[] | null | undefined, minDelta = OUTLIER_PP): DeptOutlier[] {
  const byDept = new Map<string, LiveTeacherBundle[]>();
  for (const row of bundles || []) {
    if (!row.visits.length) continue;
    const name = row.department || 'Без кафедры';
    const list = byDept.get(name) || [];
    list.push(row);
    byDept.set(name, list);
  }
  const out: DeptOutlier[] = [];
  for (const [department, rows] of byDept) {
    if (rows.length < 2) continue;
    const codes = new Set(rows.flatMap((row) => row.sections.map((sec) => sec.code)));
    for (const row of rows) {
      let best: { score_pct: number; dept_pct: number; delta: number } | null = null;
      for (const code of codes) {
        const fills = rows
          .map((peer) => peer.sections.find((sec) => sec.code === code))
          .filter((sec): sec is NonNullable<typeof sec> => Boolean(sec && sec.max > 0));
        if (fills.length < 2) continue;
        const mean = fills.reduce((sum, sec) => sum + scorePct(sec.fillRatio), 0) / fills.length;
        const hit = row.sections.find((sec) => sec.code === code);
        if (!hit || hit.max <= 0) continue;
        const score_pct = scorePct(hit.fillRatio);
        const delta = score_pct - mean;
        if (!best || Math.abs(delta) > Math.abs(best.delta)) {
          best = { score_pct, dept_pct: Math.round(mean), delta: Math.round(delta) };
        }
      }
      if (!best || Math.abs(best.delta) <= minDelta) continue;
      out.push({
        teacher_key: row.teacher_key,
        teacher_label: row.teacher_label,
        department,
        score_pct: best.score_pct,
        dept_pct: best.dept_pct,
        delta: best.delta,
      });
    }
  }
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.teacher_label.localeCompare(b.teacher_label, 'ru'));
  return out.slice(0, 8);
}

export function recurringWeakItem(bundles: LiveTeacherBundle[] | null | undefined): RecurringWeakItem | null {
  const acc = new Map<string, { code: string; title: string; earned: number; max: number; n: number; teachers: Set<string> }>();
  for (const row of bundles || []) {
    const weak = rankRubricItems(row.visits, { limit: 3, direction: 'weak' });
    for (const item of weak) {
      if (item.score_pct >= 45) continue;
      const cur = acc.get(item.code) || {
        code: item.code,
        title: item.title,
        earned: 0,
        max: 0,
        n: 0,
        teachers: new Set<string>(),
      };
      if (item.title) cur.title = item.title;
      cur.earned += item.earned;
      cur.max += item.max;
      cur.n += item.n;
      cur.teachers.add(row.teacher_key);
      acc.set(item.code, cur);
    }
  }
  const ranked = [...acc.values()]
    .filter((item) => item.teachers.size >= 2 && item.max > 0)
    .map((item) => ({
      code: item.code,
      title: shortTitle(item.title, item.code),
      score_pct: scorePct(item.earned / item.max),
      teacher_count: item.teachers.size,
      n: item.n,
    }))
    .sort((a, b) => b.teacher_count - a.teacher_count || a.score_pct - b.score_pct);
  return ranked[0] || null;
}

function visitorRows(liveCharts: LiveDashboardCharts | null | undefined, bundles: LiveTeacherBundle[]): Array<{
  name: string;
  count: number;
  score_pct: number;
}> {
  if (liveCharts?.by_visitor?.length) {
    return liveCharts.by_visitor.map((row) => ({
      name: row.name,
      count: row.visits,
      score_pct: row.score_pct,
    }));
  }
  const all = bundles.flatMap((row) => row.visits);
  return summarizeWatchers(all).visitors.map((row) => ({ name: row.name, count: row.count, score_pct: 0 }));
}

export function buildMethodistInsights(opts: {
  bundles?: LiveTeacherBundle[] | null;
  liveCharts?: LiveDashboardCharts | null;
}): MethodistInsights {
  const bundles = opts.bundles || [];
  const coverage = opts.liveCharts?.coverage;
  const selfOnly = (coverage?.selfOnly || bundles.filter((row) => row.self > 0 && row.observe === 0)).map((row) => ({
    teacher_key: row.teacher_key,
    teacher_label: row.teacher_label,
    department: row.department,
    observe: row.observe,
    self: row.self,
  }));
  const observeOnly = (
    coverage?.observeOnly || bundles.filter((row) => row.observe > 0 && row.self === 0)
  ).map((row) => ({
    teacher_key: row.teacher_key,
    teacher_label: row.teacher_label,
    department: row.department,
    observe: row.observe,
    self: row.self,
  }));
  const pendingSource = coverage
    ? pendingVisitTeachers(coverage)
    : bundles.filter((row) => row.observe === 0);
  const pending = pendingSource.map((row) => ({
    teacher_key: row.teacher_key,
    teacher_label: row.teacher_label,
    department: row.department,
    observe: row.observe,
    self: row.self,
  }));
  return {
    outliers: departmentOutliers(bundles),
    visitors: visitorRows(opts.liveCharts, bundles),
    pending,
    selfOnly,
    observeOnly,
    recurringWeak: recurringWeakItem(bundles) || fallbackRecurring(opts.liveCharts?.weakestItems),
  };
}

function fallbackRecurring(
  weakest?: Array<{ code: string; title: string; score_pct: number; n: number }> | null,
): RecurringWeakItem | null {
  const hit = weakest?.[0];
  if (!hit || hit.score_pct >= 45) return null;
  return {
    code: hit.code,
    title: shortTitle(hit.title, hit.code),
    score_pct: hit.score_pct,
    teacher_count: 0,
    n: hit.n,
  };
}
