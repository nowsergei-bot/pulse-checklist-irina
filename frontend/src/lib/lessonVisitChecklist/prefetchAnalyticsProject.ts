import { getLessonVisitProject } from '../../api/visitChecklist';
import { prefetchAnalyticsProject } from './analyticsProjectCache';

let routePrefetched = false;

/** Подгружает JS-чанки админской аналитики (один раз за сессию). */
export function prefetchAnalyticsPageModule(): void {
  if (routePrefetched) return;
  routePrefetched = true;
  void import('../../pages/cabinet/VisitChecklistDirectorDashboardPage');
}

export function prefetchAnalyticsProjectById(projectId: number | null | undefined): void {
  if (!Number.isFinite(projectId ?? NaN)) return;
  prefetchAnalyticsPageModule();
  prefetchAnalyticsProject(projectId);
}

/** По visit project id — чанк + JSON связанного LA-проекта. */
export function prefetchVisitAnalyticsFromVisitProjectId(visitProjectId: number): void {
  if (!Number.isFinite(visitProjectId)) return;
  prefetchAnalyticsPageModule();
  void getLessonVisitProject(visitProjectId)
    .then(({ draft }) => {
      const laId = draft.lessonAnalyticsProjectId;
      if (Number.isFinite(laId ?? NaN)) prefetchAnalyticsProject(laId);
    })
    .catch(() => {});
}
