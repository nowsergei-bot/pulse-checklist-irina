import { roughNormFilterValue } from '../excelAnalytics/filterValueNormalize';

/** FNV-1a 32-bit — детерминированный хеш для стабильных id. */
function fnv1a32(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Стабильный id карточки педагога: одинаковый на всех устройствах при том же projectId и ФИО.
 * Нужен для S3-архива и contentHash — случайные UUID ломали синхронизацию между браузерами.
 */
export function stableTeacherBlockId(projectId: number, teacherLabel: string): string {
  const label = String(teacherLabel ?? '').trim();
  const norm = roughNormFilterValue(label);
  if (!label || !norm || !Number.isFinite(projectId)) {
    return globalThis.crypto?.randomUUID?.() ?? `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return `tb-${projectId}-${fnv1a32(`${projectId}\u0001${norm}`)}`;
}

/** Подменяет случайные id на стабильные (миграция черновика с другого устройства). */
export function remapTeacherBlocksToStableIds(
  projectId: number,
  blocks: import('../../api/lessonAnalytics').LessonAnalyticsTeacherBlock[],
): import('../../api/lessonAnalytics').LessonAnalyticsTeacherBlock[] {
  if (!Number.isFinite(projectId) || !blocks.length) return blocks;
  let changed = false;
  const out = blocks.map((b) => {
    const label = String(b.teacherLabel ?? '').trim();
    if (!label) return b;
    const nextId = stableTeacherBlockId(projectId, label);
    if (b.id === nextId) return b;
    changed = true;
    return { ...b, id: nextId };
  });
  return changed ? out : blocks;
}
