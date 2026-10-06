/** Счётчик смонтированных карточек педагогов (для прогресса «загружено N из M»). */
let total = 0;
const mountedIds = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export function subscribeCardMountProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetCardMountProgress(nextTotal: number): void {
  total = Math.max(0, nextTotal);
  mountedIds.clear();
  notify();
}

export function reportTeacherCardMounted(blockId: string): void {
  if (!blockId || mountedIds.has(blockId)) return;
  mountedIds.add(blockId);
  notify();
}

export function getCardMountProgress(): { mounted: number; total: number } {
  return { mounted: mountedIds.size, total };
}
