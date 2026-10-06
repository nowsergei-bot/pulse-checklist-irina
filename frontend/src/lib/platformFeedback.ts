/** Публичная ссылка системного опроса обратной связи (см. migration 039). */
export const PLATFORM_FEEDBACK_ACCESS_LINK = 'platform-feedback';

const SESSION_PREFIX = 'platform_feedback_resp_';

export function newPlatformFeedbackRespondentId(): string {
  return crypto.randomUUID();
}

/** Один раз за сессию браузера — не показывать модалку повторно после пропуска/отправки. */
export function platformFeedbackAlreadyHandledInSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_PREFIX + 'done') === '1';
  } catch {
    return false;
  }
}

export function markPlatformFeedbackHandledInSession(): void {
  try {
    sessionStorage.setItem(SESSION_PREFIX + 'done', '1');
  } catch {
    /* ignore */
  }
}
