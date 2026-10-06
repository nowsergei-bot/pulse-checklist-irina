import { filterKeyForRole } from '../excelAnalytics/engine';
import type { CellPrimitive } from '../excelAnalytics/parse';
import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import { rolesIncludeVisitChecklistSections } from '../lessonVisitChecklist/visitChecklistAnalyticsMapping';
import {
  buildVisitTeacherSectionScores,
  type VisitSectionScore,
} from '../lessonVisitChecklist/visitChecklistScoring';
import {
  buildLessonCompetencyScaleAggregates,
  LESSON_COMPETENCY_MATRIX_DEFS,
} from './lessonCompetencyScale';
import { rowMatchesTeacher, teacherDataColumnIndex } from './lessonAnalyticsRubricHeatmap';
import {
  findMatchingTeacherLabel,
  normalizeTeacherLabel,
  teacherLabelsMatch,
} from './normalizeTeacherLabel';

export type LessonAnalyticsSchemaKind = 'visit_checklist' | 'competency_scale' | 'unknown';

export type SectionScoreDelta = {
  code: string;
  title: string;
  currentPct: number;
  baselinePct: number;
  deltaPct: number;
  currentEarned: number;
  baselineEarned: number;
  maxPoints: number;
};

export type CompetencyDimensionDelta = {
  title: string;
  currentPeak: number | null;
  baselinePeak: number | null;
  deltaPeak: number | null;
};

export type TeacherPeriodComparison = {
  teacherLabel: string;
  baselineTeacherLabel: string | null;
  matched: boolean;
  currentObservations: number;
  baselineObservations: number;
  deltaObservations: number;
  schemaKind: LessonAnalyticsSchemaKind;
  sectionDeltas: SectionScoreDelta[];
  competencyDeltas: CompetencyDimensionDelta[];
  newWeakIndicators: string[];
  resolvedWeakIndicators: string[];
};

export type ProjectPeriodComparisonMeta = {
  compatible: boolean;
  schemaKind: LessonAnalyticsSchemaKind;
  baselineSchemaKind: LessonAnalyticsSchemaKind;
  mismatchReason?: string;
  baselineProjectTitle?: string;
  baselineProjectId?: number;
  currentPeriodLabel?: string;
};

export type LessonPeriodComparisonGrid = {
  headers: string[];
  matrixRows: CellPrimitive[][];
  roles: ColumnRole[];
  customLabels: CustomFilterLabels;
};

const WEAK_FILL_RATIO = 0.55;
const WEAK_COMP_PEAK = 2;

export function detectLessonAnalyticsSchema(roles: ColumnRole[]): LessonAnalyticsSchemaKind {
  if (rolesIncludeVisitChecklistSections(roles)) return 'visit_checklist';
  if (roles.some((r) => r.startsWith('lesson_comp_scale_'))) return 'competency_scale';
  return 'unknown';
}

export function resolveTeacherFilterKey(
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
): string | null {
  if (!roles.includes('filter_teacher_code')) return null;
  return filterKeyForRole('filter_teacher_code', customLabels);
}

export function listTeacherLabelsFromGrid(
  grid: LessonPeriodComparisonGrid,
): string[] {
  const teacherFilterKey = resolveTeacherFilterKey(grid.roles, grid.customLabels);
  if (!teacherFilterKey) return [];
  const ti = teacherDataColumnIndex(grid.roles, grid.customLabels, teacherFilterKey);
  if (ti < 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of grid.matrixRows) {
    if (!line?.length || ti >= line.length) continue;
    const raw = String(line[ti] ?? '').trim();
    if (!raw) continue;
    const norm = normalizeTeacherLabel(raw);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(raw);
  }
  return out.sort((a, b) => a.localeCompare(b, 'ru'));
}

export function countTeacherObservations(
  grid: LessonPeriodComparisonGrid,
  teacherLabel: string,
): number {
  const teacherFilterKey = resolveTeacherFilterKey(grid.roles, grid.customLabels);
  if (!teacherFilterKey) return 0;
  const ti = teacherDataColumnIndex(grid.roles, grid.customLabels, teacherFilterKey);
  if (ti < 0) return 0;
  let n = 0;
  for (const line of grid.matrixRows) {
    if (!line?.length) continue;
    const cell = ti < line.length ? line[ti] : '';
    if (rowMatchesTeacher(cell, teacherLabel)) n += 1;
  }
  return n;
}

function weakVisitIndicators(scores: VisitSectionScore[]): Set<string> {
  const weak = new Set<string>();
  for (const sec of scores) {
    for (const it of sec.items) {
      if (it.maxPoints <= 0) continue;
      const ratio = it.earnedPoints / it.maxPoints;
      if (ratio < WEAK_FILL_RATIO) weak.add(it.indicator.trim());
    }
  }
  return weak;
}

function sectionScoreDeltas(
  current: VisitSectionScore[],
  baseline: VisitSectionScore[],
): SectionScoreDelta[] {
  const baselineByCode = new Map(baseline.map((s) => [s.code, s]));
  return current.map((cur) => {
    const base = baselineByCode.get(cur.code);
    const currentPct = cur.maxPoints > 0 ? Math.round(cur.fillRatio * 100) : 0;
    const baselinePct = base && base.maxPoints > 0 ? Math.round(base.fillRatio * 100) : 0;
    return {
      code: cur.code,
      title: cur.title,
      currentPct,
      baselinePct,
      deltaPct: currentPct - baselinePct,
      currentEarned: cur.earnedPoints,
      baselineEarned: base?.earnedPoints ?? 0,
      maxPoints: cur.maxPoints,
    };
  });
}

function computeVisitTeacherComparison(
  currentGrid: LessonPeriodComparisonGrid,
  baselineGrid: LessonPeriodComparisonGrid,
  teacherLabel: string,
  baselineTeacherLabel: string,
): Omit<TeacherPeriodComparison, 'teacherLabel' | 'baselineTeacherLabel' | 'matched'> {
  const currentKey = resolveTeacherFilterKey(currentGrid.roles, currentGrid.customLabels);
  const baselineKey = resolveTeacherFilterKey(baselineGrid.roles, baselineGrid.customLabels);
  const currentRowIdxs = currentGrid.matrixRows.map((_, i) => i);
  const baselineRowIdxs = baselineGrid.matrixRows.map((_, i) => i);

  const currentScores =
    currentKey != null
      ? buildVisitTeacherSectionScores(
          currentGrid.matrixRows,
          currentGrid.roles,
          currentGrid.customLabels,
          currentKey,
          teacherLabel,
          currentRowIdxs,
        )
      : [];
  const baselineScores =
    baselineKey != null
      ? buildVisitTeacherSectionScores(
          baselineGrid.matrixRows,
          baselineGrid.roles,
          baselineGrid.customLabels,
          baselineKey,
          baselineTeacherLabel,
          baselineRowIdxs,
        )
      : [];

  const currentWeak = weakVisitIndicators(currentScores);
  const baselineWeak = weakVisitIndicators(baselineScores);

  return {
    currentObservations: countTeacherObservations(currentGrid, teacherLabel),
    baselineObservations: countTeacherObservations(baselineGrid, baselineTeacherLabel),
    deltaObservations:
      countTeacherObservations(currentGrid, teacherLabel) -
      countTeacherObservations(baselineGrid, baselineTeacherLabel),
    schemaKind: 'visit_checklist',
    sectionDeltas: sectionScoreDeltas(currentScores, baselineScores),
    competencyDeltas: [],
    newWeakIndicators: [...currentWeak].filter((w) => !baselineWeak.has(w)).sort((a, b) => a.localeCompare(b, 'ru')),
    resolvedWeakIndicators: [...baselineWeak]
      .filter((w) => !currentWeak.has(w))
      .sort((a, b) => a.localeCompare(b, 'ru')),
  };
}

function computeCompetencyTeacherComparison(
  currentGrid: LessonPeriodComparisonGrid,
  baselineGrid: LessonPeriodComparisonGrid,
  teacherLabel: string,
  baselineTeacherLabel: string,
): Omit<TeacherPeriodComparison, 'teacherLabel' | 'baselineTeacherLabel' | 'matched'> {
  const currentKey = resolveTeacherFilterKey(currentGrid.roles, currentGrid.customLabels);
  const baselineKey = resolveTeacherFilterKey(baselineGrid.roles, baselineGrid.customLabels);

  const currentAgg =
    currentKey != null
      ? buildLessonCompetencyScaleAggregates(
          currentGrid.matrixRows,
          currentGrid.roles,
          currentGrid.customLabels,
          currentKey,
          teacherLabel,
        )
      : null;
  const baselineAgg =
    baselineKey != null
      ? buildLessonCompetencyScaleAggregates(
          baselineGrid.matrixRows,
          baselineGrid.roles,
          baselineGrid.customLabels,
          baselineKey,
          baselineTeacherLabel,
        )
      : null;

  const currentByTitle = new Map((currentAgg?.rows ?? []).map((r) => [r.title, r]));
  const baselineByTitle = new Map((baselineAgg?.rows ?? []).map((r) => [r.title, r]));

  const competencyDeltas: CompetencyDimensionDelta[] = LESSON_COMPETENCY_MATRIX_DEFS.map((def) => {
    const cur = currentByTitle.get(def.title);
    const base = baselineByTitle.get(def.title);
    const currentPeak = cur?.peakLevel ?? null;
    const baselinePeak = base?.peakLevel ?? null;
    const deltaPeak =
      currentPeak != null && baselinePeak != null ? currentPeak - baselinePeak : null;
    return { title: def.title, currentPeak, baselinePeak, deltaPeak };
  });

  const newWeak: string[] = [];
  const resolvedWeak: string[] = [];
  for (const d of competencyDeltas) {
    const short = d.title.split('//')[0]?.trim() || d.title;
    const curWeak = d.currentPeak != null && d.currentPeak < WEAK_COMP_PEAK;
    const baseWeak = d.baselinePeak != null && d.baselinePeak < WEAK_COMP_PEAK;
    if (curWeak && !baseWeak) newWeak.push(short);
    if (baseWeak && !curWeak) resolvedWeak.push(short);
  }

  return {
    currentObservations: countTeacherObservations(currentGrid, teacherLabel),
    baselineObservations: countTeacherObservations(baselineGrid, baselineTeacherLabel),
    deltaObservations:
      countTeacherObservations(currentGrid, teacherLabel) -
      countTeacherObservations(baselineGrid, baselineTeacherLabel),
    schemaKind: 'competency_scale',
    sectionDeltas: [],
    competencyDeltas,
    newWeakIndicators: newWeak,
    resolvedWeakIndicators: resolvedWeak,
  };
}

export function assessProjectPeriodComparisonMeta(
  currentGrid: LessonPeriodComparisonGrid,
  baselineGrid: LessonPeriodComparisonGrid,
  opts?: {
    baselineProjectId?: number;
    baselineProjectTitle?: string;
    currentPeriodLabel?: string;
  },
): ProjectPeriodComparisonMeta {
  const schemaKind = detectLessonAnalyticsSchema(currentGrid.roles);
  const baselineSchemaKind = detectLessonAnalyticsSchema(baselineGrid.roles);
  const base: ProjectPeriodComparisonMeta = {
    compatible: false,
    schemaKind,
    baselineSchemaKind,
    baselineProjectId: opts?.baselineProjectId,
    baselineProjectTitle: opts?.baselineProjectTitle,
    currentPeriodLabel: opts?.currentPeriodLabel,
  };
  if (schemaKind === 'unknown' || baselineSchemaKind === 'unknown') {
    return {
      ...base,
      mismatchReason:
        'Не удалось определить тип рубрики (чек-лист посещения или шкала компетенций). Сравнение недоступно.',
    };
  }
  if (schemaKind !== baselineSchemaKind) {
    return {
      ...base,
      mismatchReason:
        schemaKind === 'visit_checklist'
          ? 'Текущий проект — чек-лист посещения, baseline — шкала компетенций. Выберите проект того же типа.'
          : 'Текущий проект — шкала компетенций, baseline — чек-лист. Выберите проект того же типа.',
    };
  }
  return { ...base, compatible: true };
}

export function computeTeacherPeriodComparison(
  currentGrid: LessonPeriodComparisonGrid,
  baselineGrid: LessonPeriodComparisonGrid,
  teacherLabel: string,
  baselineLabels: readonly string[],
  meta: ProjectPeriodComparisonMeta,
): TeacherPeriodComparison | null {
  if (!meta.compatible) return null;

  const baselineTeacherLabel = findMatchingTeacherLabel(teacherLabel, baselineLabels);
  const matched = baselineTeacherLabel != null;

  const empty: TeacherPeriodComparison = {
    teacherLabel,
    baselineTeacherLabel,
    matched,
    currentObservations: countTeacherObservations(currentGrid, teacherLabel),
    baselineObservations: 0,
    deltaObservations: countTeacherObservations(currentGrid, teacherLabel),
    schemaKind: meta.schemaKind,
    sectionDeltas: [],
    competencyDeltas: [],
    newWeakIndicators: [],
    resolvedWeakIndicators: [],
  };

  if (!matched || !baselineTeacherLabel) return empty;

  const body =
    meta.schemaKind === 'visit_checklist'
      ? computeVisitTeacherComparison(currentGrid, baselineGrid, teacherLabel, baselineTeacherLabel)
      : computeCompetencyTeacherComparison(
          currentGrid,
          baselineGrid,
          teacherLabel,
          baselineTeacherLabel,
        );

  return {
    teacherLabel,
    baselineTeacherLabel,
    matched: true,
    ...body,
  };
}

export function computeAllTeachersPeriodComparison(
  currentGrid: LessonPeriodComparisonGrid,
  baselineGrid: LessonPeriodComparisonGrid,
  teacherLabels: readonly string[],
  meta: ProjectPeriodComparisonMeta,
): Map<string, TeacherPeriodComparison> {
  const baselineLabels = listTeacherLabelsFromGrid(baselineGrid);
  const out = new Map<string, TeacherPeriodComparison>();
  if (!meta.compatible) return out;

  for (const label of teacherLabels) {
    const cmp = computeTeacherPeriodComparison(
      currentGrid,
      baselineGrid,
      label,
      baselineLabels,
      meta,
    );
    if (cmp) out.set(normalizeTeacherLabel(label), cmp);
  }
  return out;
}

/** Для тестов и backend-порта: совпадение меток без полного grid. */
export { teacherLabelsMatch };
