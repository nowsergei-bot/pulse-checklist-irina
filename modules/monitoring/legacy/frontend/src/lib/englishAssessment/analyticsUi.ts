/** Presentation helpers for English analytics. No score formulas. */

import type { EaTrafficZone } from './types';

export const ATTENTION_MEAN_LT = 50;

/** Светофор: ≥85 зелёный, 75–85 жёлтый, 60–75 красный, &lt;60 бордо. */
export const TRAFFIC_GREEN_MIN = 85;
export const TRAFFIC_YELLOW_MIN = 75;
export const TRAFFIC_RED_MIN = 60;

export function scoreZone(percent: number | null | undefined): EaTrafficZone | null {
  if (percent == null || !Number.isFinite(Number(percent))) return null;
  const n = Number(percent);
  if (n >= TRAFFIC_GREEN_MIN) return 'green';
  if (n >= TRAFFIC_YELLOW_MIN) return 'yellow';
  if (n >= TRAFFIC_RED_MIN) return 'red';
  return 'risk';
}

export function zoneBadgeClass(zone: EaTrafficZone | null | undefined, percent?: number | null): string {
  const z = zone ?? scoreZone(percent);
  if (!z) return 'ea-badge ea-badge--empty';
  return `ea-badge ea-badge--zone-${z}`;
}

export function zoneLabel(zone: EaTrafficZone | null | undefined): string {
  switch (zone) {
    case 'green':
      return 'Высокий';
    case 'yellow':
      return 'Средний';
    case 'red':
      return 'Ниже среднего';
    case 'risk':
      return 'Зона риска';
    default:
      return 'Нет данных';
  }
}


export type TrendPoint = { held_on?: string | null; mean?: number | null; counted?: number };

export type AttentionGroup = {
  id: number;
  title: string;
  parallel?: number | null;
  class_label?: string | null;
  mean: number | null;
  counted: number;
  student_count?: number;
  reason: 'low' | 'empty';
};

/** Calendar date for <input type="date"> and Postgres DATE. */
export function normalizeHeldOn(raw: string | Date | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /[a-z]{3}/i.test(s) && /\d{4}/.test(s)) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

export function formatHeldOn(iso: string | null | undefined): string {
  const raw = normalizeHeldOn(iso);
  if (!raw) return iso ? String(iso) : '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
}

export function formatHeldOnDmy(iso: string | null | undefined): string {
  const raw = normalizeHeldOn(iso);
  if (!raw) return iso ? String(iso) : '—';
  return `${raw.slice(8, 10)}.${raw.slice(5, 7)}.${raw.slice(0, 4)}`;
}

export function formatHeldOnChip(iso: string | null | undefined): string {
  const raw = normalizeHeldOn(iso);
  if (!raw) return '—';
  return `${raw.slice(8, 10)}.${raw.slice(5, 7)}`;
}

export function formatHeldOnLong(iso: string | null | undefined): string {
  const raw = normalizeHeldOn(iso);
  if (!raw) return iso ? String(iso) : '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatTeachersLabel(
  teachers?: { full_name?: string | null }[] | null,
  fallbackLabel?: string | null,
): string {
  if (fallbackLabel && String(fallbackLabel).trim()) return String(fallbackLabel).trim();
  const names = (teachers || []).map((t) => t?.full_name).filter((n): n is string => Boolean(n && String(n).trim()));
  return names.length ? names.join(', ') : 'Учитель не указан';
}

export function latestHeldOn(trends: TrendPoint[] | null | undefined): string | null {
  if (!trends?.length) return null;
  let best: string | null = null;
  for (const t of trends) {
    const iso = normalizeHeldOn(t.held_on) || '';
    if (iso && (!best || iso > best)) best = iso;
  }
  return best;
}

/** Last minus previous existing trend mean, in percentage points. */
export function trendDeltaPp(trends: TrendPoint[] | null | undefined): number | null {
  const points = (trends || []).filter((t) => t.mean != null);
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  if (last.mean == null || prev.mean == null) return null;
  return Math.round((Number(last.mean) - Number(prev.mean)) * 10) / 10;
}

export function formatDeltaPp(delta: number | null): string {
  if (delta == null) return 'Недостаточно срезов';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} п.п. к прошлому срезу`;
}

export function formatBirthDate(raw: string | null | undefined): string {
  const iso = normalizeHeldOn(raw);
  if (iso) return formatHeldOnDmy(iso);
  if (!raw) return '—';
  return String(raw);
}

/** Школьная оценка из % — отдельно от светофора 60/75/85. */
export const GRADE_FIVE_MIN = 90;
export const GRADE_FOUR_MIN = 75;
export const GRADE_THREE_MIN = 50;

export type SchoolGrade = '5' | '4' | '3' | '2';

export type ScoreTotals = {
  score: number | null;
  max: number | null;
  percent: number | null;
};

export type ScoreTotalRow = {
  score?: number | null;
  max_score?: number | null;
  percent?: number | null;
  status?: string;
};

export function schoolGradeFromPercent(percent: number | null | undefined): SchoolGrade | null {
  if (percent == null || !Number.isFinite(Number(percent))) return null;
  const n = Number(percent);
  if (n >= GRADE_FIVE_MIN) return '5';
  if (n >= GRADE_FOUR_MIN) return '4';
  if (n >= GRADE_THREE_MIN) return '3';
  return '2';
}

export function formatSchoolGrade(grade: SchoolGrade | null | undefined): string {
  return grade || '—';
}

function formatScorePart(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

/** Итог теста: набранные / максимум, например 38/65. */
export function formatScoreSlash(
  score: number | null | undefined,
  max: number | null | undefined,
): string {
  if (score == null || max == null) return '—';
  const s = Number(score);
  const m = Number(max);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return '—';
  return `${formatScorePart(s)}/${formatScorePart(m)}`;
}

export function overallTestTotals(rows: ScoreTotalRow[]): ScoreTotals {
  let sum = 0;
  let max = 0;
  for (const row of rows) {
    if (row.status && row.status !== 'complete') continue;
    if (row.score == null) continue;
    let cap = row.max_score != null ? Number(row.max_score) : null;
    if ((cap == null || !Number.isFinite(cap) || cap <= 0) && row.percent != null && Number(row.percent) > 0) {
      cap = Number(row.score) / (Number(row.percent) / 100);
    }
    if (cap == null || !Number.isFinite(cap) || cap <= 0) continue;
    sum += Number(row.score);
    max += cap;
  }
  if (max <= 0) return { score: null, max: null, percent: null };
  return {
    score: Math.round(sum * 10) / 10,
    max: Math.round(max * 10) / 10,
    percent: Math.round((sum / max) * 1000) / 10,
  };
}

/** Итог теста: сумма баллов / сумма максимумов. */
export function overallTestPercent(rows: ScoreTotalRow[]): number | null {
  return overallTestTotals(rows).percent;
}

export function studentScoreDisplay(student: {
  mean?: number | null;
  total_score?: number | null;
  total_max?: number | null;
  sections?: ScoreTotalRow[];
}): { slash: string; grade: string; percent: number | null } {
  const fromSections = overallTestTotals(student.sections || []);
  const score = student.total_score ?? fromSections.score;
  const max = student.total_max ?? fromSections.max;
  const percent = student.mean ?? fromSections.percent;
  return {
    slash: formatScoreSlash(score, max),
    grade: formatSchoolGrade(schoolGradeFromPercent(percent)),
    percent,
  };
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('ru-RU');
}

export function formatPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

export function classOptionKey(group: {
  class_id?: number | null;
  class_label?: string | null;
  parallel?: number | null;
}): string {
  if (group.class_id != null && Number.isFinite(Number(group.class_id))) return `c:${group.class_id}`;
  if (group.parallel != null && Number.isFinite(Number(group.parallel))) return `p:${group.parallel}`;
  return 'none';
}

export function classOptionLabel(group: {
  class_label?: string | null;
  parallel?: number | null;
}): string {
  if (group.class_label) return group.class_label;
  if (group.parallel != null) return `${group.parallel} параллель`;
  return 'Без класса';
}

export function collectClassOptions(
  groups: { class_id?: number | null; class_label?: string | null; parallel?: number | null }[],
): { key: string; label: string }[] {
  const map = new Map<string, string>();
  for (const g of groups) {
    const key = classOptionKey(g);
    if (!map.has(key)) map.set(key, classOptionLabel(g));
  }
  return [...map.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => {
      const na = classSortRank(a.key, a.label);
      const nb = classSortRank(b.key, b.label);
      if (na !== nb) return na - nb;
      return a.label.localeCompare(b.label, 'ru', { numeric: true });
    });
}

function classSortRank(key: string, label: string): number {
  const fromKey = /^p:(\d+)$/.exec(key);
  if (fromKey) return Number(fromKey[1]);
  const fromLabel = /^(\d+)/.exec(label.trim());
  if (fromLabel) return Number(fromLabel[1]);
  return 99;
}

/** Map YearClassGroupBar key to leader API filters so the gateway does not load the whole year. */
export function classKeyToLeaderFilters(classKey: string | null | undefined): {
  parallel?: string;
  class_id?: string;
} {
  const raw = String(classKey || '').trim();
  const parallel = /^p:(\d+)$/.exec(raw);
  if (parallel) return { parallel: parallel[1] };
  const classId = /^c:(\d+)$/.exec(raw);
  if (classId) return { class_id: classId[1] };
  return {};
}

export function groupMatchesClass(
  group: { class_id?: number | null; class_label?: string | null; parallel?: number | null },
  classKey: string,
): boolean {
  if (!classKey || classKey === 'all') return true;
  return classOptionKey(group) === classKey;
}

/** Existing heat rule: mean below 50 is low. Empty groups are listed separately. */
export function isAttentionGroup(group: { mean?: number | null; counted?: number }): boolean {
  const counted = Number(group.counted) || 0;
  if (counted <= 0) return false;
  return group.mean != null && Number(group.mean) < ATTENTION_MEAN_LT;
}

export function isEmptyGroup(group: { counted?: number }): boolean {
  return (Number(group.counted) || 0) <= 0;
}

export function attentionGroups<
  T extends {
    id: number;
    title: string;
    mean?: number | null;
    counted?: number;
    student_count?: number;
    parallel?: number | null;
    class_label?: string | null;
  },
>(groups: T[]): (T & { reason: 'low' | 'empty' })[] {
  const low = groups
    .filter(isAttentionGroup)
    .map((g) => ({ ...g, reason: 'low' as const }))
    .sort((a, b) => Number(a.mean) - Number(b.mean));
  return low;
}

export function scoredStudentsCount(group: {
  students_scored?: number;
  counted?: number;
  sections?: { counted?: number }[];
}): number {
  if (group.students_scored != null && Number.isFinite(Number(group.students_scored))) {
    return Number(group.students_scored);
  }
  const sectionMax = (group.sections || []).reduce((m, s) => Math.max(m, Number(s.counted) || 0), 0);
  if (sectionMax > 0) return sectionMax;
  return Number(group.counted) || 0;
}

export function groupCompletenessLabel(group: {
  counted?: number;
  students_scored?: number;
  student_count?: number;
  sections?: { counted?: number }[];
}): string {
  const scored = scoredStudentsCount(group);
  const students = group.student_count;
  if (students == null) return scored ? formatCount(scored) : '—';
  if (!scored) return `0 из ${formatCount(students)}`;
  return `${formatCount(scored)} из ${formatCount(students)}`;
}

export function sessionDeltaPp(
  sessions:
    | {
        group_id?: number | null;
        held_on?: string | null;
        mean?: number | null;
        section_code?: string | null;
      }[]
    | null
    | undefined,
  groupId: number,
): number | null {
  const own = (sessions || []).filter(
    (s) => Number(s.group_id) === Number(groupId) && s.mean != null && s.held_on,
  );
  const bySection = new Map<string, { date: string; mean: number }[]>();
  for (const s of own) {
    const date = normalizeHeldOn(s.held_on);
    if (!date) continue;
    const key = s.section_code || '_';
    const list = bySection.get(key) || [];
    list.push({ date, mean: Number(s.mean) });
    bySection.set(key, list);
  }
  let best: { lastDate: string; delta: number } | null = null;
  for (const points of bySection.values()) {
    const byDate = new Map<string, number>();
    for (const p of points) byDate.set(p.date, p.mean);
    const dates = [...byDate.keys()].sort();
    if (dates.length < 2) continue;
    const lastDate = dates[dates.length - 1];
    const prevDate = dates[dates.length - 2];
    const delta = Math.round((Number(byDate.get(lastDate)) - Number(byDate.get(prevDate))) * 10) / 10;
    if (!best || lastDate > best.lastDate) best = { lastDate, delta };
  }
  return best?.delta ?? null;
}

export function buildTakeaway(input: {
  mean?: number | null;
  counted?: number;
  completePct?: number | null;
  groupsWithScores?: number;
  groupsTotal?: number;
  attentionCount?: number;
  emptyCount?: number;
  yearLabel?: string | null;
  classLabel?: string | null;
  groupTitle?: string | null;
}): string {
  const scope = [input.yearLabel, input.classLabel, input.groupTitle].filter(Boolean).join(', ');
  const head = scope ? `${scope}: ` : '';
  if (input.mean == null && !input.counted) {
    return `${head}В выбранном срезе ещё нет выставленных результатов.`;
  }
  const bits = [`средний результат ${formatPct(input.mean ?? null)}`];
  if (input.counted != null) bits.push(`по ${formatCount(input.counted)} оценкам`);
  if (input.completePct != null && input.groupsWithScores != null && input.groupsTotal != null) {
    bits.push(
      `полнота ${formatPct(input.completePct)} (${formatCount(input.groupsWithScores)} из ${formatCount(input.groupsTotal)} групп)`,
    );
  }
  if (input.attentionCount) {
    bits.push(`внимания требуют ${formatCount(input.attentionCount)} групп ниже ${ATTENTION_MEAN_LT}%`);
  } else if (input.emptyCount) {
    bits.push(`без баллов ${formatCount(input.emptyCount)} групп`);
  }
  return `${head}${bits.join('; ')}.`;
}
