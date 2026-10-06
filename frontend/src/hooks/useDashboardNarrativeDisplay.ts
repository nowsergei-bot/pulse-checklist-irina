import { useEffect, useMemo, useState } from 'react';
import { type LessonAnalyticsDraft } from '../api/lessonAnalytics';

export type DashboardNarrativeDraftSource = Pick<
  LessonAnalyticsDraft,
  'dashboardNarrative' | 'dashboardNarrativeSource'
> &
  Partial<LessonAnalyticsDraft>;
import {
  peekPrefetchedDashboardNarrative,
  prefetchVisitDashboardNarrative,
  subscribeDashboardNarrativePrefetch,
} from '../lib/lessonVisitChecklist/prefetchVisitDashboardNarrative';

type Options = {
  draft: DashboardNarrativeDraftSource;
  cacheKey?: string | null;
  /** Запустить фоновую генерацию, если текста ещё нет. */
  prefetch?: boolean;
};

/** Единый текст ИИ-аналитики среза: из черновика или из фонового кэша. */
export function useDashboardNarrativeDisplay({ draft, cacheKey, prefetch = false }: Options) {
  const saved = String(draft.dashboardNarrative ?? '').trim();
  const savedSource = draft.dashboardNarrativeSource ?? null;
  const key = cacheKey?.trim() ?? '';

  const [prefetched, setPrefetched] = useState(() =>
    key ? peekPrefetchedDashboardNarrative(key) : null,
  );

  useEffect(() => {
    if (!key) return;
    setPrefetched(peekPrefetchedDashboardNarrative(key));
    return subscribeDashboardNarrativePrefetch((changed) => {
      if (changed === key) {
        setPrefetched(peekPrefetchedDashboardNarrative(key));
      }
    });
  }, [key]);

  useEffect(() => {
    if (!prefetch || !key || saved || savedSource === 'manual') return;
    const hasGrid = Boolean(
      draft.importedGrid?.headers?.length || draft.excelSession?.headers?.length,
    );
    if (!hasGrid) return;
    prefetchVisitDashboardNarrative(draft as LessonAnalyticsDraft, key);
  }, [prefetch, key, saved, savedSource, draft]);

  return useMemo(() => {
    if (saved) {
      return { text: saved, source: savedSource, loading: false };
    }
    const cached = prefetched?.narrative?.trim() ?? '';
    if (cached) {
      return { text: cached, source: prefetched?.source ?? 'llm', loading: false };
    }
    return { text: '', source: null as 'llm' | 'manual' | null, loading: Boolean(prefetch && key) };
  }, [saved, savedSource, prefetched, prefetch, key]);
}
