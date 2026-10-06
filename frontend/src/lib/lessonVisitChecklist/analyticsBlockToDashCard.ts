import type { VisitChecklistDashCard } from '../../api/visitChecklist.ts';
import type { LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics.ts';
import type { CellPrimitive } from '../excelAnalytics/parse.ts';
import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types.ts';
import { dedupeRowsByLessonIdx } from '../excelAnalytics/engine.ts';
import type { TeacherCardViewModel } from '../lessonAnalytics/buildLessonAnalyticsTeacherCardView.ts';
import { resolveTeacherCardRows } from '../lessonAnalytics/teacherCardRowMembership.ts';
import { personKey } from './visitChecklistCardAnswers.ts';
import { buildVisitTeacherSectionScores } from './visitChecklistScoring.ts';

export type AnalyticsBlockDashCardInput = {
  block: LessonAnalyticsTeacherBlock;
  view: TeacherCardViewModel;
  teacherFilterKey: string;
  headers: string[];
  rawRows: CellPrimitive[][];
  rolesForLessonMatrix: ColumnRole[];
  customLabels: CustomFilterLabels;
  department?: string | null;
};

function pickFilter(fv: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const v = String(fv[key] ?? '').trim();
    if (v && v !== '(не указано)') return v;
  }
  return '';
}

function pickText(
  texts: TeacherCardViewModel['teacherRows'][number]['texts'],
  kinds: string[],
): string {
  for (const kind of kinds) {
    const hit = texts.find((t) => t.kind === kind || t.header.toLowerCase().includes(kind));
    if (hit?.text?.trim()) return hit.text.trim();
  }
  return '';
}

/** Минимальная карточка дашборда из строк Excel (fallback, если API недоступен). */
export function buildAnalyticsBlockDashCard(input: AnalyticsBlockDashCardInput): VisitChecklistDashCard {
  const { block, view, teacherFilterKey, rawRows, rolesForLessonMatrix, customLabels } = input;
  const teacherLabel = block.teacherLabel;
  const teacherKey = personKey(teacherLabel) || block.id;
  const cardRows = resolveTeacherCardRows({
    block,
    teacherFilterKey,
    poolRows: view.teacherRows,
    sliceRows: view.teacherRows,
  });
  const rowIdxs = cardRows.map((r) => r.idx);
  const aggregateScores = buildVisitTeacherSectionScores(
    rawRows,
    rolesForLessonMatrix,
    customLabels,
    teacherFilterKey,
    teacherLabel,
    rowIdxs,
  );
  const sections = aggregateScores.map((sec) => ({
    code: sec.code,
    title: sec.title,
    earned: sec.earnedPoints,
    max: sec.maxPoints,
    fillRatio: sec.fillRatio,
  }));
  const totalEarned = aggregateScores.reduce((sum, sec) => sum + sec.earnedPoints, 0);
  const totalMax = aggregateScores.reduce((sum, sec) => sum + sec.maxPoints, 0);
  const scoreRatio = totalMax > 0 ? totalEarned / totalMax : 0;
  const onePer = dedupeRowsByLessonIdx(view.teacherRows);
  const visits = onePer.map((row, i) => {
    const visitScores = buildVisitTeacherSectionScores(
      rawRows,
      rolesForLessonMatrix,
      customLabels,
      teacherFilterKey,
      teacherLabel,
      [row.idx],
    );
    const earned = visitScores.reduce((sum, sec) => sum + sec.earnedPoints, 0);
    const max = visitScores.reduce((sum, sec) => sum + sec.maxPoints, 0);
    const fv = row.filterValues || {};
    return {
      id: row.idx || i + 1,
      date: String(row.date || pickFilter(fv, ['filter_date', 'visit_date']) || '').trim(),
      visitor: pickFilter(fv, ['filter_visitor', 'visitor_name', 'visitor']),
      class_name: pickFilter(fv, ['filter_class', 'class_name', '__pulse_parallel_auto']),
      subject: pickFilter(fv, ['filter_subject', 'subject']),
      format: pickFilter(fv, ['filter_format', 'visit_format']),
      earned,
      max,
      summary: pickText(row.texts, ['text_ai_summary', 'вывод']),
      recommendations: pickText(row.texts, ['text_ai_recommendations', 'рекомен']),
      sections: visitScores.map((sec) => ({
        code: sec.code,
        title: sec.title,
        earned: sec.earnedPoints,
        max: sec.maxPoints,
        fillRatio: sec.fillRatio,
        marks: sec.items.map((it) => ({
          code: it.itemCode || '',
          pick: it.selectedLabels.join(', '),
          pts: it.earnedPoints,
          max: it.maxPoints,
          indicator: it.indicator,
        })),
      })),
    };
  });
  const dates = visits.map((v) => v.date).filter(Boolean).sort();
  return {
    teacher_key: teacherKey,
    teacher_label: teacherLabel,
    department: input.department || null,
    visit_count: visits.length,
    stats: {
      visit_count: visits.length,
      score_ratio: scoreRatio,
      last_visit: dates.length ? { date: dates[dates.length - 1]! } : undefined,
      sections,
      visits,
      sparkline: visits
        .filter((v) => v.date && v.max > 0)
        .map((v) => ({ date: v.date, score: v.earned / v.max })),
    },
    narrative: String(block.aiNarrative ?? '').trim(),
    narrative_source: block.aiNarrative?.trim() ? 'analytics' : null,
    status: block.status,
    agreed_at: block.agreedAt ?? null,
    published_at: null,
    published: false,
  };
}
