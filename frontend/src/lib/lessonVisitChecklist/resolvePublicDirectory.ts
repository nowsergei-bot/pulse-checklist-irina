import type { LessonVisitDirectory } from './types';

function directoryHasRoster(dir: LessonVisitDirectory | null | undefined): boolean {
  if (!dir || typeof dir !== 'object') return false;
  return (
    (Array.isArray(dir.departments) && dir.departments.length > 0) ||
    (Array.isArray(dir.teachers) && dir.teachers.length > 0)
  );
}

/** Публичная форма: актуальный seed важнее снимка проекта в БД. */
export function resolvePublicLessonVisitDirectory(
  saved?: LessonVisitDirectory | null,
  seed?: LessonVisitDirectory | null,
): LessonVisitDirectory {
  if (directoryHasRoster(seed) && seed) {
    return {
      departments: Array.isArray(seed.departments) ? seed.departments : [],
      teachers: Array.isArray(seed.teachers) ? seed.teachers : [],
    };
  }
  if (directoryHasRoster(saved) && saved) {
    return {
      departments: Array.isArray(saved.departments) ? saved.departments : [],
      teachers: Array.isArray(saved.teachers) ? saved.teachers : [],
    };
  }
  return { departments: [], teachers: [] };
}
