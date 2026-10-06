import { useEffect, useState } from 'react';
import {
  getTeacherCardArchiveStatus,
  subscribeTeacherCardArchiveStatus,
  type TeacherCardArchiveStatus,
} from '../lib/lessonAnalytics/teacherCardArchiveQueue';

/** Статус архива одной карточки — подписка локальная, без перерисовки всей страницы. */
export function useTeacherCardArchiveStatus(blockId: string): TeacherCardArchiveStatus {
  const [status, setStatus] = useState(() => getTeacherCardArchiveStatus(blockId));

  useEffect(() => {
    setStatus(getTeacherCardArchiveStatus(blockId));
    let raf = 0;
    return subscribeTeacherCardArchiveStatus(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next = getTeacherCardArchiveStatus(blockId);
        setStatus((prev) => (prev === next ? prev : next));
      });
    });
  }, [blockId]);

  return status;
}
