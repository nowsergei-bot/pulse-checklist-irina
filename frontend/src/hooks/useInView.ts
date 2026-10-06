import { useEffect, useRef, useState, type RefObject } from 'react';

type UseInViewOptions = {
  rootMargin?: string;
  threshold?: number;
  /** When true, stays visible after first intersection. */
  once?: boolean;
};

/** True when the element intersects the viewport (or root). */
export function useInView<T extends Element>({
  rootMargin = '240px 0px',
  threshold = 0.01,
  once = true,
}: UseInViewOptions = {}): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inView && once) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView, once, rootMargin, threshold]);

  return [ref, inView];
}
