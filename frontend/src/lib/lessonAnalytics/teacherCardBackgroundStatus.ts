import {
  AI_CARD_MAX_QUEUE_RETRIES,
  formatAiRetryStatusLine,
} from './aiNarrativeBatchRetry';
import { AI_BATCH_GAP_MS } from './visitChecklistAnalyticsHelpers';
import { estimateAiBatchRemainingSec, formatEtaRu } from './cardTemplate';
import type { TeacherCardArchiveStatus } from './teacherCardArchiveQueue';

export const TEACHER_CARD_BACKGROUND_HINT =
  'Можно зайти позже — результат сохранится автоматически';

export type TeacherCardBackgroundStatus = {
  title: string;
  etaLine: string | null;
  hintLine: string;
  compactLine: string;
};

/** Сколько карточек впереди в FIFO-очереди (0 — обрабатывается сейчас). */
export function countCardsAheadInAiBatch(
  blockId: string,
  order: readonly string[],
  giveUpIds: ReadonlySet<string>,
  processingId: string | null,
): number | null {
  if (!order.includes(blockId) || giveUpIds.has(blockId)) return null;
  if (processingId === blockId) return 0;
  let ahead = 0;
  for (const id of order) {
    if (giveUpIds.has(id)) continue;
    if (id === blockId) return ahead;
    ahead += 1;
  }
  return null;
}

export function buildTeacherCardBackgroundStatus(opts: {
  archiveStatus: TeacherCardArchiveStatus;
  narrativeBusy: boolean;
  aiPending: boolean;
  aiBatchRunning: boolean;
  queueAhead: number | null;
  backgroundWorkPaused: boolean;
  gapMs?: number;
  aiRetryAttempt?: number;
  aiMaxRetries?: number;
}): TeacherCardBackgroundStatus | null {
  const {
    archiveStatus,
    narrativeBusy,
    aiPending,
    aiBatchRunning,
    queueAhead,
    backgroundWorkPaused,
    gapMs = AI_BATCH_GAP_MS,
    aiRetryAttempt = 0,
    aiMaxRetries = AI_CARD_MAX_QUEUE_RETRIES,
  } = opts;

  const retryLine = formatAiRetryStatusLine(aiRetryAttempt, aiMaxRetries);

  const inFlight =
    narrativeBusy ||
    aiPending ||
    archiveStatus === 'processing' ||
    archiveStatus === 'loading' ||
    (aiBatchRunning && queueAhead != null);

  if (!inFlight) return null;

  const hintLine = TEACHER_CARD_BACKGROUND_HINT;

  if (backgroundWorkPaused) {
    return {
      title: 'Карточка в работе',
      etaLine: 'Фоновая обработка на паузе — продолжим, когда вы отойдёте от страницы',
      hintLine,
      compactLine: 'Карточка в работе · пауза',
    };
  }

  if (archiveStatus === 'loading') {
    return {
      title: 'Карточка в работе',
      etaLine: 'Ориентировочно готово через ~20 сек',
      hintLine,
      compactLine: 'Карточка в работе · загрузка из архива',
    };
  }

  if (narrativeBusy || archiveStatus === 'processing' || queueAhead === 0) {
    const etaSec = estimateAiBatchRemainingSec(1, gapMs);
    const etaLine = retryLine || `Ориентировочно готово через ${formatEtaRu(etaSec)}`;
    return {
      title: 'Карточка в работе',
      etaLine,
      hintLine,
      compactLine: retryLine ? `Карточка в работе · ${retryLine}` : `Карточка в работе · ${formatEtaRu(etaSec)}`,
    };
  }

  if (aiPending || (aiBatchRunning && queueAhead != null && queueAhead > 0)) {
    const ahead = queueAhead ?? 1;
    const etaSec = estimateAiBatchRemainingSec(ahead + 1, gapMs);
    const etaLine =
      retryLine ||
      (aiRetryAttempt >= aiMaxRetries
        ? 'ИИ не ответил — повторим в фоне, можно зайти позже'
        : `Ориентировочно готово через ${formatEtaRu(etaSec)}`);
    return {
      title: 'Карточка в работе',
      etaLine,
      hintLine,
      compactLine: retryLine
        ? `Карточка в работе · ${retryLine}`
        : `Карточка в работе · ${formatEtaRu(etaSec)}`,
    };
  }

  if (archiveStatus === 'stale') {
    return {
      title: 'Карточка в работе',
      etaLine: 'Данные обновились — пересборка в фоне',
      hintLine,
      compactLine: 'Карточка в работе · пересборка',
    };
  }

  if (archiveStatus === 'missing') {
    return {
      title: 'Ожидание ИИ-аналитики',
      etaLine: null,
      hintLine,
      compactLine: 'Ожидание ИИ-аналитики…',
    };
  }

  return null;
}
