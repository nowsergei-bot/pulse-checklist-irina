import { type LessonAnalyticsDraft } from '../../api/lessonAnalytics';
import { getPublicLessonAnalyticsProject } from '../../api/lessonAnalytics';
import {
  cacheKeyForLeaderToken,
  prefetchVisitDashboardNarrative,
} from './prefetchVisitDashboardNarrative';

export type LeaderProjectCacheEntry = {
  project: { id: number; title: string; updated_at: string };
  draft: LessonAnalyticsDraft;
  fetchedAt: number;
};

const memoryCache = new Map<string, LeaderProjectCacheEntry>();
const inflight = new Map<string, Promise<LeaderProjectCacheEntry>>();

/** Извлекает share-токен из публичной ссылки руководителя чек-листа. */
export function extractLeaderTokenFromUrl(url: string): string | null {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    const m = u.pathname.match(/\/view\/lesson-visit-checklist\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export function peekCachedLeaderProject(token: string): LeaderProjectCacheEntry | null {
  const key = token.trim();
  if (!key) return null;
  return memoryCache.get(key) ?? null;
}

export async function fetchPublicLeaderProject(
  token: string,
  opts?: { force?: boolean },
): Promise<LeaderProjectCacheEntry> {
  const key = token.trim();
  if (!key) throw new Error('Некорректная ссылка.');

  if (!opts?.force) {
    const cached = memoryCache.get(key);
    if (cached) return cached;
    const pending = inflight.get(key);
    if (pending) return pending;
  }

  const promise = getPublicLessonAnalyticsProject(key)
    .then(({ project, draft }) => {
      const entry: LeaderProjectCacheEntry = { project, draft, fetchedAt: Date.now() };
      memoryCache.set(key, entry);
      prefetchVisitDashboardNarrative(draft, cacheKeyForLeaderToken(key));
      return entry;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Фоновая подгрузка: не бросает ошибку наружу. */
export function prefetchLeaderProject(token: string | null | undefined): void {
  const key = token?.trim();
  if (!key || memoryCache.has(key) || inflight.has(key)) return;
  void fetchPublicLeaderProject(key).catch(() => {});
}
