import { extractLeaderTokenFromUrl, prefetchLeaderProject } from './leaderProjectCache';

let routePrefetched = false;

/** Подгружает JS-чанки страницы руководителя (один раз за сессию). */
export function prefetchLeaderPageModule(): void {
  if (routePrefetched) return;
  routePrefetched = true;
  void import('../../pages/LessonVisitChecklistLeaderPage');
  void import('../../components/LessonVisitChecklistDirectorView');
}

/** По URL или токену — чанк маршрута + JSON проекта в память. */
export function prefetchLeaderPageFromUrl(url: string | null | undefined): void {
  const token = url ? extractLeaderTokenFromUrl(url) : null;
  if (!token) return;
  prefetchLeaderPageModule();
  prefetchLeaderProject(token);
}

export function prefetchLeaderPage(token: string | null | undefined): void {
  if (!token?.trim()) return;
  prefetchLeaderPageModule();
  prefetchLeaderProject(token);
}
