import {
  AI_BATCH_RATE_LIMIT_COOLDOWN_MS,
  AI_BATCH_RETRY_DELAY_MS,
  isFatalNarrativeHint,
  isRateLimitNarrativeHint,
} from './visitChecklistAnalyticsHelpers';

/** Сколько раз карточку можно вернуть в хвост очереди до «зайдите позже». */
export const AI_CARD_MAX_QUEUE_RETRIES = 3;

export function isTimeoutNarrativeHint(hint?: string): boolean {
  return /не ответил за|timeout|timed out|aborted|abort/i.test(String(hint ?? ''));
}

export function shouldRequeueAiNarrative(opts: { fromLlm: boolean; hint?: string }): boolean {
  if (opts.fromLlm) return false;
  if (isFatalNarrativeHint(opts.hint)) return false;
  return true;
}

/** Локальную автосводку показываем только при фатальной ошибке конфигурации. */
export function shouldCommitAiNarrativeFallback(opts: {
  fromLlm: boolean;
  hint?: string;
}): boolean {
  if (opts.fromLlm) return false;
  return isFatalNarrativeHint(opts.hint);
}

export function resolveAiNarrativeRetryDelayMs(attempt: number, hint?: string): number {
  const n = Math.max(1, attempt);
  if (isRateLimitNarrativeHint(hint)) {
    return AI_BATCH_RATE_LIMIT_COOLDOWN_MS * n;
  }
  return AI_BATCH_RETRY_DELAY_MS * n;
}

export function formatAiRetryStatusLine(retryAttempt: number, maxRetries = AI_CARD_MAX_QUEUE_RETRIES): string {
  if (retryAttempt <= 0) return '';
  if (retryAttempt >= maxRetries) {
    return `Повтор ИИ · попытка ${retryAttempt} — можно зайти позже`;
  }
  return `Повтор ИИ · попытка ${retryAttempt} из ${maxRetries}`;
}
