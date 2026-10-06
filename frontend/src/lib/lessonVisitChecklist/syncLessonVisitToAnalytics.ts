import { getLessonAnalyticsProject, putLessonAnalyticsProject } from '../../api/lessonAnalytics';
import { type LessonAnalyticsDraft } from '../../api/lessonAnalytics';
import { listLessonVisitResponses } from '../../api/visitChecklist';
import {
  deriveVisitChecklistTeacherBlocks,
  resolveVisitChecklistTeacherLabels,
} from '../lessonAnalytics/deriveVisitChecklistTeacherBlocks';
import { hydrateAiNarrativeStore } from '../lessonAnalytics/visitChecklistAnalyticsHelpers';
import { remapTeacherBlocksToStableIds } from '../lessonAnalytics/teacherBlockId';
import type { SavedExcelSession } from '../excelAnalytics/excelSessionStorage';
import { serializeImportedRows } from '../excelAnalytics/importedGridSerialize';
import type { LessonVisitDraft } from './types';
import { lessonVisitGridFingerprint, lessonVisitResponsesToLessonGrid } from './responsesToLessonGrid';

/** Синхронизирует ответы чек-листа в связанный проект «Аналитика уроков». */
export async function syncLessonVisitToAnalytics(
  visitProjectId: number,
  draft: LessonVisitDraft,
): Promise<{ responseCount: number; lessonAnalyticsProjectId: number }> {
  const laId = draft.lessonAnalyticsProjectId;
  if (!laId || !Number.isFinite(laId)) {
    throw new Error('У проекта нет связанной аналитики. Создайте проект заново.');
  }

  const responses = await listLessonVisitResponses(visitProjectId);
  const grid = lessonVisitResponsesToLessonGrid(draft.checklist, draft.directory, responses);

  const { draft: laDraft } = await getLessonAnalyticsProject(laId);

  const teacherLabels = resolveVisitChecklistTeacherLabels({
    dashboardRows: [],
    teacherFilterKey: null,
    rawRows: grid.rows,
    roles: grid.roles,
  });
  const persisted = remapTeacherBlocksToStableIds(laId, laDraft.teacherBlocks ?? []);
  const narrativeStore = hydrateAiNarrativeStore(persisted);
  const teacherBlocks = deriveVisitChecklistTeacherBlocks(
    teacherLabels,
    persisted,
    narrativeStore,
    laId,
  );

  const nextDraft: LessonAnalyticsDraft = {
    ...laDraft,
    title: draft.title,
    updatedAt: new Date().toISOString(),
    /** Состав карточек пересобирается из ФИО в таблице — не тащим устаревший state_json. */
    teacherBlocks,
    importedGrid: {
      v: 1,
      headers: grid.headers,
      rows: serializeImportedRows(grid.rows),
      sheet: grid.sheet,
      headerRow1Based: grid.headerRow1Based,
      fileName: grid.fileName,
      sourceFiles: [grid.fileName],
    },
    excelSession: {
      v: 1,
      fingerprint: lessonVisitGridFingerprint(visitProjectId),
      fileName: grid.fileName,
      sheet: grid.sheet,
      headerRow1Based: grid.headerRow1Based,
      headers: grid.headers,
      roles: grid.roles,
      customLabels: grid.customLabels,
      ordinalLevels: grid.ordinalLevels,
      filterSelection: laDraft.excelSession?.filterSelection ?? {},
      filterPanelHiddenKeys: laDraft.excelSession?.filterPanelHiddenKeys ?? [],
    } satisfies SavedExcelSession,
  };

  await putLessonAnalyticsProject(laId, { title: draft.title, draft: nextDraft });
  return { responseCount: responses.length, lessonAnalyticsProjectId: laId };
}
