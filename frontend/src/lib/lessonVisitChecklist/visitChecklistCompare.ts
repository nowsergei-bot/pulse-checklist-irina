import { personKey } from './visitChecklistCardAnswers.ts';
import { isSelfAnalysisFormat, scorePct } from './visitChecklistCloudUi.ts';

export type CompareMode = 'none' | 'school' | 'department';

export type SectionFill = {
  code?: string;
  title?: string;
  fillRatio?: number | null;
  earned?: number | null;
  max?: number | null;
};

type TeacherListLike = {
  teacher_key: string;
  department?: string | null;
  score_ratio: number;
  sections?: SectionFill[] | null;
};

export type CompareSectionRow = {
  code: string;
  title: string;
  teacher: number;
  cohort: number;
  delta: number;
};

export type CompareResult = {
  mode: CompareMode;
  cohortSize: number;
  cohortLabel: string;
  overall: { teacher: number; cohort: number; delta: number };
  sections: CompareSectionRow[];
};

export type VisitKindLike = {
  format?: string | null;
  earned?: number | null;
  max?: number | null;
  sections?: SectionFill[] | null;
};

export type KindAggregate = {
  count: number;
  fillRatio: number;
  sections: Array<{ code: string; title: string; fillRatio: number }>;
};

export type ObserveSelfAggregate = {
  observe: KindAggregate;
  self: KindAggregate;
  gap: number;
  comparable: boolean;
  selfHigher: boolean | null;
};

export function meanRatio(values: Array<number | null | undefined>): number {
  const nums = values.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (!nums.length) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

export function sectionFillRatio(sec: SectionFill | null | undefined): number {
  const max = Number(sec?.max);
  const earned = Number(sec?.earned);
  if (Number.isFinite(max) && max > 0 && Number.isFinite(earned)) return earned / max;
  const ratio = Number(sec?.fillRatio);
  return Number.isFinite(ratio) ? ratio : 0;
}

export function selectCompareCohort(
  teachers: TeacherListLike[],
  mode: CompareMode,
  current: { teacher_key: string; department?: string | null },
): TeacherListLike[] {
  if (mode === 'none') return [];
  const others = teachers.filter((row) => row.teacher_key !== current.teacher_key);
  if (mode !== 'department') return others;
  const dep = personKey(current.department);
  if (!dep) return [];
  return others.filter((row) => personKey(row.department) === dep);
}

export function cohortSectionMeans(cohort: Array<{ sections?: SectionFill[] | null }>, codes: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const code of codes) {
    const fills = cohort.map((row) => {
      const hit = (row.sections || []).find((sec) => sec.code === code);
      return hit ? sectionFillRatio(hit) : null;
    });
    const present = fills.filter((n): n is number => n != null && Number.isFinite(n));
    if (present.length) out.set(code, meanRatio(present));
  }
  return out;
}

export function buildCompareResult(opts: {
  mode: CompareMode;
  teacherRatio: number | null | undefined;
  teacherSections: SectionFill[];
  teachers: TeacherListLike[];
  current: { teacher_key: string; department?: string | null };
  schoolSections?: SectionFill[] | null;
  schoolRatio?: number | null;
}): CompareResult {
  const mode = opts.mode;
  const teacherPct = scorePct(opts.teacherRatio);
  const teacherSecs = opts.teacherSections || [];
  if (mode === 'none') {
    return {
      mode,
      cohortSize: 0,
      cohortLabel: '',
      overall: { teacher: teacherPct, cohort: 0, delta: 0 },
      sections: teacherSecs.map((sec) => ({
        code: String(sec.code || ''),
        title: String(sec.title || sec.code || ''),
        teacher: scorePct(sectionFillRatio(sec)),
        cohort: 0,
        delta: 0,
      })),
    };
  }

  const cohort = selectCompareCohort(opts.teachers, mode, opts.current);
  const codes = teacherSecs.map((sec) => String(sec.code || '')).filter(Boolean);
  const fromTeachers = cohortSectionMeans(cohort, codes);
  const schoolByCode = new Map(
    (opts.schoolSections || []).map((sec) => [String(sec.code || ''), sectionFillRatio(sec)]),
  );
  const cohortRatio =
    cohort.length > 0
      ? meanRatio(cohort.map((row) => row.score_ratio))
      : mode === 'school'
        ? Number(opts.schoolRatio) || 0
        : 0;
  const sections: CompareSectionRow[] = teacherSecs.map((sec) => {
    const code = String(sec.code || '');
    const teacher = scorePct(sectionFillRatio(sec));
    const fromList = fromTeachers.get(code);
    const fallback = mode === 'school' ? schoolByCode.get(code) : undefined;
    const cohortFill = fromList != null ? fromList : fallback != null ? fallback : 0;
    const cohortPct = scorePct(cohortFill);
    return {
      code,
      title: String(sec.title || code),
      teacher,
      cohort: cohortPct,
      delta: teacher - cohortPct,
    };
  });
  const cohortPct = scorePct(cohortRatio);
  return {
    mode,
    cohortSize: cohort.length,
    cohortLabel: mode === 'department' ? 'кафедрой' : 'школой',
    overall: { teacher: teacherPct, cohort: cohortPct, delta: teacherPct - cohortPct },
    sections,
  };
}

function packKind(rows: VisitKindLike[]): KindAggregate {
  let earned = 0;
  let max = 0;
  const secAcc = new Map<string, { code: string; title: string; earned: number; max: number }>();
  for (const visit of rows) {
    earned += Number(visit.earned) || 0;
    max += Number(visit.max) || 0;
    for (const sec of visit.sections || []) {
      const code = String(sec.code || '');
      if (!code) continue;
      const cur = secAcc.get(code) || { code, title: String(sec.title || code), earned: 0, max: 0 };
      if (sec.title) cur.title = String(sec.title);
      if (Number(sec.max) > 0) {
        cur.earned += Number(sec.earned) || 0;
        cur.max += Number(sec.max) || 0;
      } else {
        cur.earned += sectionFillRatio(sec);
        cur.max += 1;
      }
      secAcc.set(code, cur);
    }
  }
  return {
    count: rows.length,
    fillRatio: max > 0 ? earned / max : 0,
    sections: [...secAcc.values()].map((sec) => ({
      code: sec.code,
      title: sec.title,
      fillRatio: sec.max > 0 ? sec.earned / sec.max : 0,
    })),
  };
}

export function aggregateObserveVsSelf(visits: VisitKindLike[] | null | undefined): ObserveSelfAggregate {
  const observe: VisitKindLike[] = [];
  const self: VisitKindLike[] = [];
  for (const visit of visits || []) {
    if (isSelfAnalysisFormat(visit.format)) self.push(visit);
    else observe.push(visit);
  }
  const observeAgg = packKind(observe);
  const selfAgg = packKind(self);
  const comparable = observeAgg.count > 0 && selfAgg.count > 0;
  const gap = selfAgg.fillRatio - observeAgg.fillRatio;
  return {
    observe: observeAgg,
    self: selfAgg,
    gap,
    comparable,
    selfHigher: comparable ? gap > 0.0005 : null,
  };
}

export function buildSectionItemDiagrams(
  visits: Array<{
    sections?: Array<{
      code?: string;
      title?: string;
      marks?: Array<{ code?: string; pick?: string; pts?: number; max?: number; indicator?: string }>;
    }> | null;
  }> | null | undefined,
): Array<{
  code: string;
  title: string;
  items: Array<{ name: string; score_pct: number; earned: number; max: number }>;
}> {
  const acc = new Map<
    string,
    { code: string; title: string; items: Map<string, { name: string; earned: number; max: number; n: number }> }
  >();
  for (const visit of visits || []) {
    for (const sec of visit.sections || []) {
      const code = String(sec.code || '');
      if (!code) continue;
      const bucket =
        acc.get(code) ||
        { code, title: String(sec.title || code), items: new Map() };
      if (sec.title) bucket.title = String(sec.title);
      for (const mark of sec.marks || []) {
        const itemCode = String(mark.code || mark.indicator || '').trim();
        if (!itemCode) continue;
        const max = Number(mark.max) || 0;
        const earned = Number(mark.pts) || 0;
        const cur = bucket.items.get(itemCode) || {
          name: itemCode,
          earned: 0,
          max: 0,
          n: 0,
        };
        cur.earned += earned;
        cur.max += max;
        cur.n += 1;
        bucket.items.set(itemCode, cur);
      }
      acc.set(code, bucket);
    }
  }
  return [...acc.values()]
    .map((sec) => ({
      code: sec.code,
      title: sec.title,
      items: [...sec.items.values()].map((item) => ({
        name: item.name,
        earned: item.n ? item.earned / item.n : 0,
        max: item.n ? item.max / item.n : 0,
        score_pct: item.max > 0 ? scorePct(item.earned / item.max) : 0,
      })),
    }))
    .filter((sec) => sec.items.length);
}

export function formatScoreDelta(delta: number): string {
  const n = Math.round(delta);
  if (n === 0) return '0 п.п.';
  return `${n > 0 ? '+' : ''}${n} п.п.`;
}
