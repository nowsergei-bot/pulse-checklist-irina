import { useEffect, useRef, useState, type ReactNode } from 'react';
import { enqueueMount } from '../lib/mountQueue';

const IN_VIEW_MOUNT_TIMEOUT_MS = 280;

/** Рендерит children только когда блок попадает в viewport. */
export default function LazyMount({
  children,
  minHeight = 120,
  rootMargin = '200px 0px',
  placeholder,
  stagger = false,
  eager = false,
  onMounted,
}: {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
  placeholder?: ReactNode;
  /** Монтировать через очередь idle — не все блоки сразу. */
  stagger?: boolean;
  /** Сразу считать блок видимым (первые карточки списка). */
  eager?: boolean;
  onMounted?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(eager);
  const [mounted, setMounted] = useState(eager && !stagger);
  const onMountedRef = useRef(onMounted);
  onMountedRef.current = onMounted;

  useEffect(() => {
    if (eager) return;
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [eager, inView, rootMargin]);

  useEffect(() => {
    if (!inView || mounted) return;
    if (!stagger) {
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;
    enqueueMount(() => {
      if (!cancelled) setMounted(true);
    }, () => cancelled);
    const fallback = window.setTimeout(() => {
      if (!cancelled) setMounted(true);
    }, IN_VIEW_MOUNT_TIMEOUT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [stagger, inView, mounted]);

  useEffect(() => {
    if (!inView || !mounted) return;
    onMountedRef.current?.();
  }, [inView, mounted]);

  const showContent = inView && mounted;

  return (
    <div ref={ref} style={{ minHeight: showContent ? undefined : minHeight }}>
      {showContent ? children : placeholder ?? null}
    </div>
  );
}
