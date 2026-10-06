import { useCallback, useEffect, useMemo, useRef } from 'react';
import { extractLeaderTokenFromUrl } from '../lib/lessonVisitChecklist/leaderProjectCache';
import { prefetchLeaderPage } from '../lib/lessonVisitChecklist/prefetchLeaderPage';

/** Обработчики для ссылки на страницу руководителя: prefetch при hover/focus и при появлении в viewport. */
export function usePrefetchLeaderPage(url: string | null | undefined) {
  const token = useMemo(() => (url ? extractLeaderTokenFromUrl(url) : null), [url]);
  const prefetchedRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const prefetch = useCallback(() => {
    if (prefetchedRef.current || !token) return;
    prefetchedRef.current = true;
    prefetchLeaderPage(token);
  }, [token]);

  const ref = useCallback(
    (el: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!el || !token || prefetchedRef.current) return;
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
    [token, prefetch],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return {
    ref,
    onMouseEnter: prefetch,
    onFocus: prefetch,
    onTouchStart: prefetch,
  };
}
