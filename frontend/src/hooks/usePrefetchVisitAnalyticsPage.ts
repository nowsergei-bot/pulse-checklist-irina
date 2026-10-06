import { useCallback, useEffect, useRef } from 'react';
import { prefetchVisitAnalyticsFromVisitProjectId } from '../lib/lessonVisitChecklist/prefetchAnalyticsProject';

/** Prefetch analytics JS + project JSON when user hovers/focuses a visit analytics link. */
export function usePrefetchVisitAnalyticsPage(visitProjectId: number | null | undefined) {
  const prefetchedRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const prefetch = useCallback(() => {
    if (prefetchedRef.current || visitProjectId == null || !Number.isFinite(visitProjectId)) return;
    prefetchedRef.current = true;
    prefetchVisitAnalyticsFromVisitProjectId(visitProjectId);
  }, [visitProjectId]);

  const ref = useCallback(
    (el: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!el || visitProjectId == null || !Number.isFinite(visitProjectId) || prefetchedRef.current) return;
      if (typeof IntersectionObserver === 'undefined') {
        prefetch();
        return;
      }
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            prefetch();
            obs.disconnect();
          }
        },
        { rootMargin: '120px 0px', threshold: 0.01 },
      );
      obs.observe(el);
      observerRef.current = obs;
    },
    [visitProjectId, prefetch],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return {
    ref,
    onMouseEnter: prefetch,
    onFocus: prefetch,
    onTouchStart: prefetch,
  };
}
