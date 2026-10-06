import {
  buildQuickSummaryRu,
  countUniqueImportRows,
  dedupeRowsByLessonIdx,
  ordinalDistribution,
  type AnalyticRow,
} from '../excelAnalytics/engine';
import type { CellPrimitive } from '../excelAnalytics/parse';
import type { ColumnRole } from '../excelAnalytics/types';
import { splitRubricPhrasesFromCell } from '../lessonAnalytics/lessonCompetencyScale';
import {
  LESSON_VISIT_SECTION_DEFS,
  rolesIncludeVisitChecklistSections,
} from './visitChecklistAnalyticsMapping';
import {
  buildVisitScoreHeatmap,
  buildVisitChecklistLabelHintsForLlm,
  buildVisitScoringLlmContextRu,
  formatVisitSectionPhraseDisplay,
  scoreVisitFromSectionCells,
  visitChecklistRubricComments,
  type VisitScoreHeatmapSection,
} from './visitChecklistScoring';

export type VisitDashboardKpis = {
  uniqueVisits: number;
  uniqueTeachers: number;
  uniqueDepartments: number;
};

export type VisitSectionPhraseRow = {
  sectionTitle: string;
  phrase: string;
  count: number;
};

export function isVisitChecklistAnalytics(roles: ColumnRole[]): boolean {
  return rolesIncludeVisitChecklistSections(roles);
}

export function buildVisitDashboardKpis(
  filteredRows: AnalyticRow[],
  teacherFilterKey: string | null,
  departmentFilterKey: string | null,
): VisitDashboardKpis {
  const onePer = dedupeRowsByLessonIdx(filteredRows);
  const teachers = new Set<string>();
  const departments = new Set<string>();
  for (const r of onePer) {
    if (teacherFilterKey) {
      const t = String(r.filterValues[teacherFilterKey] ?? '').trim();
      if (t && t !== '(не указано)') teachers.add(t);
    }
    if (departmentFilterKey) {
      const d = String(r.filterValues[departmentFilterKey] ?? '').trim();
      if (d && d !== '(не указано)') departments.add(d);
    }
  }
  return {
    uniqueVisits: countUniqueImportRows(onePer),
    uniqueTeachers: teachers.size,
    uniqueDepartments: departments.size,
  };
}

export function buildVisitOrdinalDistribution(
  filteredRows: AnalyticRow[],
  ordinalLevels: string[],
): { level: string; count: number; rank: number }[] {
  if (!ordinalLevels.length) return [];
  const onePer = dedupeRowsByLessonIdx(filteredRows);
  return ordinalDistribution(onePer, ordinalLevels).map((d) => ({
    level: d.level,
    count: d.count,
    rank: d.rank,
  }));
}

/** Топ формулировок по разделам 1–10 по всему срезу (не по одному педагогу). */
export function buildVisitSectionPhraseAggregate(
  rawRows: CellPrimitive[][],
  roles: ColumnRole[],
  filteredRows: AnalyticRow[],
  topPerSection = 8,
): VisitSectionPhraseRow[] {
  const visitRoles = roles.filter((r) => r.startsWith('lesson_visit_sec_'));
  if (!visitRoles.length) return [];
  const rowIdxs = new Set(filteredRows.map((r) => r.idx));
  const defByRole = new Map(LESSON_VISIT_SECTION_DEFS.map((d) => [d.role, d]));
  const displayByKey = new Map<string, string>();
  const out: VisitSectionPhraseRow[] = [];

  for (const role of visitRoles) {
    const col = roles.indexOf(role);
    if (col < 0) continue;
    const sectionDef = defByRole.get(role as (typeof LESSON_VISIT_SECTION_DEFS)[number]['role']);
    const sectionCode = sectionDef?.code ?? String(role).replace(/^lesson_visit_sec_/, '');
    const acc = new Map<string, number>();
    for (let ri = 0; ri < rawRows.length; ri++) {
      if (!rowIdxs.has(ri)) continue;
      const line = rawRows[ri];
      const cell = col < line.length ? line[col] : '';
      for (const ph of splitRubricPhrasesFromCell(cell)) {
        const display = formatVisitSectionPhraseDisplay(ph, sectionCode);
        const key = display.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!key) continue;
        if (!displayByKey.has(key)) displayByKey.set(key, display);
        acc.set(key, (acc.get(key) ?? 0) + 1);
      }
    }
    const sectionTitle = sectionDef?.title ?? role;
    const phrases = [...acc.entries()]
      .map(([key, count]) => ({ phrase: displayByKey.get(key) ?? key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topPerSection);
    for (const p of phrases) {
      out.push({ sectionTitle, phrase: p.phrase, count: p.count });
    }
  }
  return out;
}

export function buildVisitDashboardScoreHeatmap(
  rawRows: CellPrimitive[][],
  roles: ColumnRole[],
  filteredRows: AnalyticRow[],
): VisitScoreHeatmapSection[] {
  return buildVisitScoreHeatmap(rawRows, roles, filteredRows);
}

/** Агрегированные баллы по всему срезу (объединение ответов всех посещений). */
export function buildVisitDashboardAggregateScores(
  rawRows: CellPrimitive[][],
  roles: ColumnRole[],
  filteredRows: AnalyticRow[],
) {
  const rowIdxs = new Set(filteredRows.map((r) => r.idx));
  const visitRoles = roles.filter((r) => r.startsWith('lesson_visit_sec_'));
  const merged = new Map<string, string[]>();
  for (let ri = 0; ri < rawRows.length; ri++) {
    if (!rowIdxs.has(ri)) continue;
    for (const role of visitRoles) {
      const col = roles.indexOf(role);
      if (col < 0) continue;
      const def = LESSON_VISIT_SECTION_DEFS.find((d) => d.role === role);
      if (!def) continue;
      const cell = col < rawRows[ri].length ? rawRows[ri][col] : '';
      const phrases = splitRubricPhrasesFromCell(cell);
      const cur = merged.get(def.code) ?? [];
      cur.push(...phrases);
      merged.set(def.code, cur);
    }
  }
  return scoreVisitFromSectionCells(merged);
}

export function buildVisitDashboardLlmContext(params: {
  filteredRows: AnalyticRow[];
  dashboardRows: AnalyticRow[];
  teacherFilterKey: string | null;
  metricNumericCols: number[];
  headers: string[];
  roles: ColumnRole[];
  rawRows: CellPrimitive[][];
  ordinalLevels: string[];
  dateLabel: string;
  filterSummary?: string;
  sectionPhrases?: VisitSectionPhraseRow[];
  scoreHeatmap?: VisitScoreHeatmapSection[];
}): string {
  const {
    filteredRows,
    dashboardRows,
    teacherFilterKey,
    metricNumericCols,
    headers,
    roles,
    rawRows,
    ordinalLevels,
    dateLabel,
    filterSummary,
    sectionPhrases = [],
    scoreHeatmap = [],
  } = params;

  const kpis = buildVisitDashboardKpis(
    filteredRows,
    teacherFilterKey,
    roles.includes('filter_custom_2') ? 'filter_custom_2' : null,
  );
  const ord = buildVisitOrdinalDistribution(filteredRows, ordinalLevels);
  const quick = teacherFilterKey
    ? buildQuickSummaryRu(dashboardRows, filteredRows, {
        hasTeacherFilter: false,
        mentorFilterKey: teacherFilterKey,
        dateLabel,
        hasOrdinal: roles.includes('metric_ordinal_text'),
        numericMetrics: metricNumericCols.map((i) => ({
          colIndex: i,
          label: headers[i] || `Колонка ${i + 1}`,
        })),
        omitMethodicalSections: false,
        omitTechnicalMeta: true,
      })
    : '';

  const lines: string[] = [
    'Чек-лист посещения урока — сводка по текущему срезу фильтров.',
    `Посещений (уникальных): ${kpis.uniqueVisits}; педагогов: ${kpis.uniqueTeachers}; кафедр: ${kpis.uniqueDepartments}.`,
  ];
  if (filterSummary?.trim()) lines.push(`Фильтры: ${filterSummary.trim()}`);
  if (ord.length) {
    lines.push(
      'Распределение уровня представленного урока (10.1): ' +
        ord.map((o) => `${o.level} — ${o.count}`).join('; '),
    );
  }

  const rubricComments = visitChecklistRubricComments();
  if (rubricComments.length) {
    lines.push('Методические комментарии к показателям (из Excel):');
    for (const c of rubricComments) {
      lines.push(`  • «${c.indicator}»: ${c.comment}`);
    }
  }

  const heatmap =
    scoreHeatmap.length > 0
      ? scoreHeatmap
      : buildVisitDashboardScoreHeatmap(rawRows, roles, filteredRows);
  if (heatmap.length) {
    const aggFromHeatmap = heatmap.map((sec) => ({
      code: sec.code,
      title: sec.title,
      items: sec.items.map((it) => ({
        indicator: it.indicator,
        itemCode: it.itemCode,
        earnedPoints: it.avgEarned,
        maxPoints: it.maxPoints,
        selectedLabels: [] as string[],
        scoringMode: 'single' as const,
      })),
      earnedPoints: sec.avgEarned,
      maxPoints: sec.maxSectionPoints,
      hasPoints: sec.avgEarned > 0,
      fillRatio: sec.fillRatio,
    }));
    lines.push(
      buildVisitScoringLlmContextRu(aggFromHeatmap, {
        audience: 'methodist',
        visitCount: kpis.uniqueVisits,
      }),
    );
  } else {
    const aggScores = buildVisitDashboardAggregateScores(rawRows, roles, filteredRows);
    const scoringCtx = buildVisitScoringLlmContextRu(aggScores, {
      audience: 'methodist',
      visitCount: kpis.uniqueVisits,
    });
    if (scoringCtx.trim()) lines.push(scoringCtx.trim());
  }

  if (sectionPhrases.length) {
    lines.push('Частые отмеченные пункты по разделам чек-листа:');
    const bySec = new Map<string, VisitSectionPhraseRow[]>();
    for (const row of sectionPhrases) {
      const cur = bySec.get(row.sectionTitle) ?? [];
      cur.push(row);
      bySec.set(row.sectionTitle, cur);
    }
    for (const [sec, rows] of bySec) {
      lines.push(
        `${sec}: ${rows
          .slice(0, 6)
          .map((r) => `${r.phrase} (${r.count})`)
          .join('; ')}`,
      );
    }
  }
  if (quick.trim()) lines.push('', quick.trim());

  const labelHints = buildVisitChecklistLabelHintsForLlm();
  if (labelHints.trim()) lines.push('', labelHints.trim());

  return lines.join('\n');
}
