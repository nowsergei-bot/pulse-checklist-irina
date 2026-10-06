import { type LessonAnalyticsDraft, type LessonAnalyticsProjectRow } from '../../api/lessonAnalytics';
import { getLessonAnalyticsProject } from '../../api/lessonAnalytics';

export type AnalyticsProjectCacheEntry = {
  project: LessonAnalyticsProjectRow;
  draft: LessonAnalyticsDraft;
  fetchedAt: number;
};

const memoryCache = new Map<number, AnalyticsProjectCacheEntry>();
const inflight = new Map<number, Promise<AnalyticsProjectCacheEntry>>();

export function peekCachedAnalyticsProject(projectId: number): AnalyticsProjectCacheEntry | null {
  if (!Number.isFinite(projectId)) return null;
  return memoryCache.get(projectId) ?? null;
}

export function invalidateAnalyticsProjectCache(projectId: number): void {
  if (!Number.isFinite(projectId)) return;
  memoryCache.delete(projectId);
  inflight.delete(projectId);
}

export async function fetchAnalyticsProject(
  projectId: number,
  opts?: { force?: boolean },
): Promise<AnalyticsProjectCacheEntry> {
  if (!Number.isFinite(projectId)) throw new Error('Некорректный проект аналитики.');

  if (!opts?.force) {
    const cached = memoryCache.get(projectId);
    if (cached) return cached;
    const pending = inflight.get(projectId);
    if (pending) return pending;
  } else {
    memoryCache.delete(projectId);
    inflight.delete(projectId);
  }

  const promise = getLessonAnalyticsProject(projectId)
    .then(({ project, draft }) => {
      const entry: AnalyticsProjectCacheEntry = { project, draft, fetchedAt: Date.now() };
      memoryCache.set(projectId, entry);
      return entry;
    })
    .finally(() => {
      inflight.delete(projectId);
    });

  inflight.set(projectId, promise);
  return promise;
}

/** Фоновая подгрузка: не бросает ошибку наружу. */
export function prefetchAnalyticsProject(projectId: number | null | undefined): void {
  if (!Number.isFinite(projectId ?? NaN)) return;
  const id = projectId as number;
  if (memoryCache.has(id) || inflight.has(id)) return;
  void fetchAnalyticsProject(id).catch(() => {});
}
