import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { type LessonAnalyticsTeacherBlock } from '../api/lessonAnalytics';

const PAGE_SIZE = 8;
const ESTIMATED_ROW_PX = 132;
const OVERSCAN = 2;

type Props = {
  teachers: LessonAnalyticsTeacherBlock[];
  renderTeacherCard: (block: LessonAnalyticsTeacherBlock, index: number) => ReactNode;
  scrollToBlockId?: string | null;
  onScrollToBlockHandled?: () => void;
};

/**
 * Окно карточек: в DOM только видимый срез + небольшой overscan.
 * Дополнительно — постраничная подгрузка «Показать ещё».
 */
function VirtualizedTeacherCardsList({
  teachers,
  renderTeacherCard,
  scrollToBlockId,
  onScrollToBlockHandled,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [windowRange, setWindowRange] = useState({ start: 0, end: Math.min(PAGE_SIZE, teachers.length) });

  const pagedTeachers = useMemo(
    () => teachers.slice(0, Math.min(teachers.length, pageCount * PAGE_SIZE)),
    [teachers, pageCount],
  );

  const recomputeWindow = useCallback(() => {
    const root = listRef.current;
    if (!root || pagedTeachers.length === 0) {
      setWindowRange({ start: 0, end: 0 });
      return;
    }
    const rect = root.getBoundingClientRect();
    const viewTop = window.scrollY + Math.max(0, -rect.top);
    const viewBottom = viewTop + window.innerHeight;
    const listTop = window.scrollY + rect.top;
    const rawStart = Math.floor((viewTop - listTop) / ESTIMATED_ROW_PX) - OVERSCAN;
    const rawEnd = Math.ceil((viewBottom - listTop) / ESTIMATED_ROW_PX) + OVERSCAN;
    const start = Math.max(0, Math.min(pagedTeachers.length, rawStart));
    const end = Math.max(start, Math.min(pagedTeachers.length, rawEnd));
    const cappedEnd = Math.min(pagedTeachers.length, Math.max(end, start + PAGE_SIZE));
    setWindowRange({ start, end: cappedEnd });
  }, [pagedTeachers.length]);

  useEffect(() => {
    setPageCount(1);
  }, [teachers]);

  useEffect(() => {
    recomputeWindow();
    const onScroll = () => recomputeWindow();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [recomputeWindow, pagedTeachers]);

  useEffect(() => {
    if (!scrollToBlockId) return;
    const idx = teachers.findIndex((b) => b.id === scrollToBlockId);
    if (idx < 0) {
      onScrollToBlockHandled?.();
      return;
    }
    const needPage = Math.floor(idx / PAGE_SIZE) + 1;
    if (needPage > pageCount) setPageCount(needPage);
    const pagedLen = Math.min(teachers.length, needPage * PAGE_SIZE);
    const pagedIdx = teachers.slice(0, pagedLen).findIndex((b) => b.id === scrollToBlockId);
    if (pagedIdx < 0) return;
    setWindowRange({
      start: Math.max(0, pagedIdx - OVERSCAN),
      end: Math.min(pagedLen, pagedIdx + PAGE_SIZE),
    });
    const t = window.setTimeout(() => {
      document.getElementById(`lesson-analytics-teacher-${scrollToBlockId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      onScrollToBlockHandled?.();
    }, 80);
    return () => window.clearTimeout(t);
  }, [scrollToBlockId, teachers, pageCount, onScrollToBlockHandled]);

  const topPad = windowRange.start * ESTIMATED_ROW_PX;
  const bottomPad = Math.max(0, (pagedTeachers.length - windowRange.end) * ESTIMATED_ROW_PX);
  const visible = pagedTeachers.slice(windowRange.start, windowRange.end);
  const hasMore = pagedTeachers.length < teachers.length;

  return (
    <div ref={listRef} className="visit-checklist-teacher-cards-list">
      <div style={{ height: topPad }} aria-hidden />
      <div>
        {visible.map((block, i) => renderTeacherCard(block, windowRange.start + i))}
      </div>
      <div style={{ height: bottomPad }} aria-hidden />
      {hasMore ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-sm primary"
            onClick={() => setPageCount((p) => p + 1)}
          >
            Показать ещё {Math.min(PAGE_SIZE, teachers.length - pagedTeachers.length)} из{' '}
            {teachers.length - pagedTeachers.length}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default memo(VirtualizedTeacherCardsList);
