import { type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import { roughNormFilterValue } from '../excelAnalytics/filterValueNormalize';

export type AiBatchQueueMode = 'missing' | 'all' | 'selected';

export type AiNarrativeStore = {
  byNorm: Record<string, string>;
  byBlockId: Record<string, string>;
};

function resolveBlockAiNarrative(block: LessonAnalyticsTeacherBlock, store: AiNarrativeStore): string {
  const onBlock = String(block.aiNarrative ?? '').trim();
  if (onBlock) return onBlock;
  const byId = String(store.byBlockId[block.id] ?? '').trim();
  if (byId) return byId;
  return String(store.byNorm[roughNormFilterValue(block.teacherLabel)] ?? '').trim();
}

type AiQueueOpts = {
  getContentHash?: (block: LessonAnalyticsTeacherBlock) => string | null;
};

function blockNeedsAiNarrative(
  block: LessonAnalyticsTeacherBlock,
  store: AiNarrativeStore,
  getContentHash?: (block: LessonAnalyticsTeacherBlock) => string | null,
): boolean {
  if (block.aiNarrativeManualEdit) return false;
  const text = resolveBlockAiNarrative(block, store);
  if (!text) return true;
  const hash = getContentHash?.(block);
  if (!hash) return false;
  const stored = String(block.aiNarrativeContentHash ?? '').trim();
  /** Текст из черновика без хеша — не перегенерировать (хеш допишем при сохранении). */
  if (!stored) return false;
  return stored !== hash;
}

export { blockNeedsAiNarrative };

/** Карточки для фоновой очереди ИИ. */
export function listBlocksForAiQueue(
  blocks: LessonAnalyticsTeacherBlock[],
  store: AiNarrativeStore,
  giveUpIds: ReadonlySet<string>,
  mode: AiBatchQueueMode,
  selectedIds: ReadonlySet<string>,
  _opts?: AiQueueOpts,
): LessonAnalyticsTeacherBlock[] {
  const base = blocks.filter((b) => !giveUpIds.has(b.id) && String(b.teacherLabel ?? '').trim());
  if (mode === 'selected') {
    return base.filter((b) => selectedIds.has(b.id));
  }
  if (mode === 'all') {
    return base.filter((b) => !b.aiNarrativeManualEdit);
  }
  /** «missing» — только пустой текст; несовпадение contentHash не перезапускает ИИ на другом устройстве. */
  return base.filter((b) => {
    if (b.aiNarrativeManualEdit) return false;
    return !resolveBlockAiNarrative(b, store);
  });
}

/** Порядок id для FIFO-очереди при старте батча. */
export function buildAiBatchOrderFromBlocks(blocks: LessonAnalyticsTeacherBlock[]): string[] {
  return blocks.map((b) => b.id);
}

/** Следующая карточка в очереди (ещё не обработана в этом прогоне). */
export function peekNextAiBatchBlockId(
  order: readonly string[],
  giveUpIds: ReadonlySet<string>,
): string | null {
  for (const id of order) {
    if (!giveUpIds.has(id)) return id;
  }
  return null;
}

export function computeAiBatchProgress(order: readonly string[], giveUpIds: ReadonlySet<string>) {
  const total = order.length;
  const done = order.filter((id) => giveUpIds.has(id)).length;
  return { total, done, left: Math.max(0, total - done) };
}

/** Добавить карточки в хвост очереди; снять giveUp для повторного прогона. */
export function appendToAiBatchOrder(
  order: readonly string[],
  giveUpIds: Set<string>,
  blockIds: string[],
): { order: string[]; added: number } {
  const seen = new Set(order);
  const next = [...order];
  let added = 0;
  for (const id of blockIds) {
    if (!id?.trim()) continue;
    if (seen.has(id)) {
      if (giveUpIds.delete(id)) added += 1;
      continue;
    }
    seen.add(id);
    next.push(id);
    giveUpIds.delete(id);
    added += 1;
  }
  return { order: next, added };
}

/** Вернуть карточку в хвост FIFO-очереди (повтор после сбоя ИИ). */
export function requeueBlockInAiBatch(order: readonly string[], blockId: string): string[] {
  const id = String(blockId ?? '').trim();
  if (!id) return [...order];
  const next = order.filter((x) => x !== id);
  next.push(id);
  return next;
}

/** Убрать из очереди ещё не начатые карточки (обработанные и текущая остаются). */
export function removeFromAiBatchOrder(
  order: readonly string[],
  giveUpIds: ReadonlySet<string>,
  blockIds: string[],
  processingId: string | null,
): string[] {
  const remove = new Set(blockIds);
  return order.filter((id) => {
    if (!remove.has(id)) return true;
    if (giveUpIds.has(id)) return true;
    if (processingId && id === processingId) return true;
    return false;
  });
}
