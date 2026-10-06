import { useEffect, useMemo, useRef } from 'react';
import { type LessonAnalyticsTeacherBlock } from '../api/lessonAnalytics';
import type { AnalyticRow } from '../lib/excelAnalytics/engine';
import type { CellPrimitive } from '../lib/excelAnalytics/parse';
import type { ColumnRole } from '../lib/excelAnalytics/types';
import {
  deriveVisitChecklistTeacherBlocks,
  resolveVisitChecklistTeacherLabels,
  visitChecklistBlocksNeedRebuild,
  visitChecklistTeacherLabelsKey,
} from '../lib/lessonAnalytics/deriveVisitChecklistTeacherBlocks';
import type { AiNarrativeStore } from '../lib/lessonAnalytics/visitChecklistAnalyticsHelpers';

export type UseVisitChecklistTeacherBlocksArgs = {
  enabled: boolean;
  projectId?: number;
  teacherFilterKey: string | null;
  dashboardRows: AnalyticRow[];
  rawRows: CellPrimitive[][];
  roles: ColumnRole[];
  /** Сохранённые на сервере карточки — только метаданные и ИИ, не состав списка. */
  persistedBlocks: LessonAnalyticsTeacherBlock[];
  narrativeStore?: AiNarrativeStore;
  onStructuralSync?: (blocks: LessonAnalyticsTeacherBlock[]) => void;
};

export type UseVisitChecklistTeacherBlocksResult = {
  teacherLabels: string[];
  teacherLabelsKey: string;
  labelsKey: string;
  resolvedBlocks: LessonAnalyticsTeacherBlock[];
  blocks: LessonAnalyticsTeacherBlock[];
  structuralMismatch: boolean;
  needsRebuild: boolean;
  ready: boolean;
};

/**
 * Карточки чек-листа: состав всегда из ФИО в таблице (grid/dashboard),
 * persistedBlocks — только для слияния id, статуса и aiNarrative.
 */
export function useVisitChecklistTeacherBlocks({
  enabled,
  projectId,
  teacherFilterKey,
  dashboardRows,
  rawRows,
  roles,
  persistedBlocks,
  narrativeStore,
  onStructuralSync,
}: UseVisitChecklistTeacherBlocksArgs): UseVisitChecklistTeacherBlocksResult {
  const teacherLabels = useMemo(() => {
    if (!enabled || !teacherFilterKey) return [];
    return resolveVisitChecklistTeacherLabels({
      dashboardRows,
      teacherFilterKey,
      rawRows,
      roles,
    });
  }, [enabled, teacherFilterKey, dashboardRows, rawRows, roles]);

  const teacherLabelsKey = useMemo(() => visitChecklistTeacherLabelsKey(teacherLabels), [teacherLabels]);

  const persistedStructuralKey = useMemo(
    () =>
      persistedBlocks
        .map(
          (b) =>
            `${b.id}|${String(b.teacherLabel ?? '').trim()}|${b.status}|${b.agreedAt ?? ''}|${b.emailedAt ?? ''}`,
        )
        .join(';'),
    [persistedBlocks],
  );

  const persistedRef = useRef(persistedBlocks);
  persistedRef.current = persistedBlocks;

  const narrativeStoreRef = useRef(narrativeStore);
  narrativeStoreRef.current = narrativeStore;

  const narrativeStoreKey = useMemo(() => {
    if (!narrativeStore) return '';
    const norms = Object.keys(narrativeStore.byNorm).sort().join('\u0001');
    const ids = Object.keys(narrativeStore.byBlockId).sort().join('\u0001');
    return `${norms}|${ids}`;
  }, [narrativeStore]);

  const resolvedBlocks = useMemo(() => {
    if (!enabled || !teacherFilterKey || !teacherLabels.length) return [];
    return deriveVisitChecklistTeacherBlocks(
      teacherLabels,
      persistedRef.current,
      narrativeStoreRef.current,
      projectId,
    );
  }, [enabled, teacherFilterKey, teacherLabelsKey, persistedStructuralKey, narrativeStoreKey, projectId]);

  const structuralMismatch = useMemo(
    () => visitChecklistBlocksNeedRebuild(persistedBlocks, teacherLabels),
    [persistedBlocks, teacherLabelsKey],
  );

  const lastSyncedKeyRef = useRef('');
  useEffect(() => {
    if (!enabled || !onStructuralSync || !teacherLabelsKey) return;
    if (!structuralMismatch) {
      lastSyncedKeyRef.current = teacherLabelsKey;
      return;
    }
    if (lastSyncedKeyRef.current === teacherLabelsKey && resolvedBlocks.length === teacherLabels.length) return;
    lastSyncedKeyRef.current = teacherLabelsKey;
    onStructuralSync(resolvedBlocks);
  }, [
    enabled,
    structuralMismatch,
    teacherLabelsKey,
    teacherLabels.length,
    resolvedBlocks,
    onStructuralSync,
  ]);

  const ready = enabled && teacherLabels.length > 0 && resolvedBlocks.length === teacherLabels.length;

  return {
    teacherLabels,
    teacherLabelsKey,
    labelsKey: teacherLabelsKey,
    resolvedBlocks,
    blocks: resolvedBlocks,
    structuralMismatch,
    needsRebuild: structuralMismatch,
    ready,
  };
}
