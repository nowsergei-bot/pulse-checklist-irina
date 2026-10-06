import { type LessonAnalyticsDraft } from '../../api/lessonAnalytics';
import type { AnalyticRow } from '../excelAnalytics/engine';
import {
  augmentRowsWithDerivedParallel,
  buildAnalyticRows,
  expandRowsForMultiValueFilterColumns,
  expandRowsForPulseSurveyMultiSelect,
} from '../excelAnalytics/engine';
import { collapseSimilarFilterDimensionValues } from '../excelAnalytics/filterValueNormalize';
import { getLessonDraftGridForAnalysis } from './lessonDraftGrid';

/** Восстанавливает аналитические строки из черновика с таблицей на сервере (importedGrid + excelSession). */
export function buildAnalyticRowsFromLessonDraft(draft: LessonAnalyticsDraft): {
  ok: true;
  analyticRows: AnalyticRow[];
} | { ok: false; reason: string } {
  const ig0 = draft.importedGrid;
  if (!ig0 || ig0.headers.length === 0 || !ig0.rows?.length) {
    return {
      ok: false,
      reason:
        'В проекте нет сохранённой таблицы. Откройте проект под учётной записью и нажмите «Сохранить на сервер» после загрузки листа.',
    };
  }
  const grid = getLessonDraftGridForAnalysis(draft);
  if (!grid) {
    return { ok: false, reason: 'Не удалось восстановить маппинг колонок по сохранённой таблице.' };
  }
  const { headers: h, matrixRows, rolesForRun, customLabels, ordinalLevels: ordinalInput } = grid;

  let built = buildAnalyticRows(h, matrixRows, rolesForRun, customLabels, ordinalInput);
  built = expandRowsForMultiValueFilterColumns(built, rolesForRun, customLabels);
  built = augmentRowsWithDerivedParallel(built, rolesForRun, customLabels);
  built = expandRowsForPulseSurveyMultiSelect(built, rolesForRun);
  built = collapseSimilarFilterDimensionValues(built, rolesForRun, customLabels);
  return { ok: true, analyticRows: built };
}
