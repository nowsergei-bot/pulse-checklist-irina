import { type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import { roughNormFilterValue } from '../excelAnalytics/filterValueNormalize';
import type { AnalyticRow } from '../excelAnalytics/engine';
import type { CellPrimitive } from '../excelAnalytics/parse';
import type { ColumnRole } from '../excelAnalytics/types';
import {
  listTeacherLabelsFromGridCells,
  listTeacherLabelsFromRows,
  syncTeacherBlocksFromLabels,
  teacherBlockListMatchesLabels,
} from './filterTeacherBlocksForSlice';
import { stableTeacherBlockId } from './teacherBlockId';

export type TeacherBlockNarrativeStore = {
  byNorm: Record<string, string>;
  byBlockId: Record<string, string>;
};

function resolveBlockNarrativeFromStore(
  block: LessonAnalyticsTeacherBlock | undefined,
  label: string,
  store: TeacherBlockNarrativeStore,
): string {
  if (block) {
    const onBlock = String(block.aiNarrative ?? '').trim();
    if (onBlock) return onBlock;
    const byId = String(store.byBlockId[block.id] ?? '').trim();
    if (byId) return byId;
  }
  return String(store.byNorm[roughNormFilterValue(label)] ?? '').trim();
}

/**
 * Уникальные ФИО педагогов: приоритет сырой сетки (как syncLessonVisitToAnalytics),
 * иначе — аналитические строки dashboardRows.
 */
export function resolveVisitChecklistTeacherLabels(opts: {
  dashboardRows: AnalyticRow[];
  teacherFilterKey: string | null;
  rawRows?: CellPrimitive[][];
  roles?: ColumnRole[];
}): string[] {
  const { dashboardRows, teacherFilterKey, rawRows, roles } = opts;
  const fromGrid =
    roles?.includes('filter_teacher_code') && rawRows?.length && roles
      ? listTeacherLabelsFromGridCells(rawRows, roles)
      : [];
  const fromRows = listTeacherLabelsFromRows(dashboardRows, teacherFilterKey);
  if (fromGrid.length >= fromRows.length) return fromGrid;
  return fromRows;
}

/** Карточки строго по меткам ФИО; persistedBlocks — только для id, статуса и ИИ-текста. */
export function deriveVisitChecklistTeacherBlocks(
  labels: string[],
  persistedBlocks: LessonAnalyticsTeacherBlock[],
  narrativeStore?: TeacherBlockNarrativeStore,
  projectId?: number,
): LessonAnalyticsTeacherBlock[] {
  if (!labels.length) return [];
  const narrativeForLabel = narrativeStore
    ? (label: string, block?: LessonAnalyticsTeacherBlock) =>
        resolveBlockNarrativeFromStore(block, label, narrativeStore)
    : undefined;
  const idForLabel =
    projectId != null && Number.isFinite(projectId)
      ? (label: string) => stableTeacherBlockId(projectId, label)
      : undefined;
  return syncTeacherBlocksFromLabels(labels, persistedBlocks, narrativeForLabel, idForLabel);
}

export function visitChecklistTeacherLabelsKey(labels: string[]): string {
  return labels.length ? labels.join('\u0001') : '';
}

export function visitChecklistBlocksNeedRebuild(
  persistedBlocks: LessonAnalyticsTeacherBlock[],
  labels: string[],
): boolean {
  if (!labels.length) return false;
  return !teacherBlockListMatchesLabels(persistedBlocks, labels);
}
