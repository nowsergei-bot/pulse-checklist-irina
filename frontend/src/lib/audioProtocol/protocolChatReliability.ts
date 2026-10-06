import { getAudioProtocolEvent } from '../../api/audioProtocol';
import { type AudioProtocolEvent } from '../../api/audioProtocol';

/** Пауза между опросами сервера после обрыва долгого запроса (шлюз 504, функция ещё пишет в БД). */
const RECOVERY_POLL_MS = 15_000;
const RECOVERY_MAX_POLLS = 6;
const RETRY_DELAYS_MS = [4_000, 10_000];

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Сетевые/временные сбои, при которых имеет смысл подождать сервер или повторить запрос. */
export function isTransientProtocolChatFailure(err: unknown, httpStatus?: number): boolean {
  if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504 || httpStatus === 429) {
    return true;
  }
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  return /связаться с сервером|некорректные данные|неожиданный формат|too long|таймаут|504|502|503|gateway/i.test(
    err.message,
  );
}

export type RecoveredProtocolPayload = {
  reply: string;
  event: AudioProtocolEvent;
  downloads?: Record<string, string>;
  recovered_from_server: true;
};

/**
 * После 504/обрыва клиента функция может ещё ~минуту дописывать протокол в БД.
 * Опрашиваем событие: новый protocol_text и updated_at после старта генерации.
 */
export async function pollForProtocolOnServer(
  eventGroupId: string,
  startedAtIso: string,
  minChars = 200,
): Promise<RecoveredProtocolPayload | null> {
  const startedMs = Date.parse(startedAtIso);
  if (!eventGroupId || Number.isNaN(startedMs)) return null;

  for (let i = 0; i < RECOVERY_MAX_POLLS; i++) {
    await sleep(RECOVERY_POLL_MS);
    try {
      const res = await getAudioProtocolEvent(eventGroupId);
      const text = String(res.event.protocol_text || '').trim();
      const updatedMs = res.event.updated_at ? Date.parse(res.event.updated_at) : 0;
      const freshEnough = !updatedMs || updatedMs >= startedMs - 8_000;
      if (text.length >= minChars && freshEnough) {
        return {
          reply: text,
          event: res.event,
          downloads: res.downloads,
          recovered_from_server: true,
        };
      }
    } catch {
      /* следующий опрос */
    }
  }
  return null;
}

export type ProtocolChatRetryOptions = {
  eventGroupId?: string;
  startedAtIso: string;
  onRetry?: (attempt: number) => void;
  onRecovering?: () => void;
};

/**
 * Оборачивает один POST /chat: при transient-ошибке — опрос БД, затем до 2 повторов с backoff.
 */
export async function withProtocolChatReliability<T extends { reply: string }>(
  callOnce: () => Promise<T>,
  opts: ProtocolChatRetryOptions,
): Promise<T & { recovered_from_server?: boolean }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await callOnce();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const status = (e as { httpStatus?: number })?.httpStatus;
      if (!isTransientProtocolChatFailure(e, status)) throw lastError;

      if (opts.eventGroupId) {
        opts.onRecovering?.();
        const recovered = await pollForProtocolOnServer(opts.eventGroupId, opts.startedAtIso);
        if (recovered) {
          const payload: T & { recovered_from_server?: boolean } = {
            reply: recovered.reply,
            event: recovered.event,
            downloads: recovered.downloads,
            protocol_saved: true,
            recovered_from_server: true,
          } as unknown as T & { recovered_from_server?: boolean };
          return payload;
        }
      }

      if (attempt < RETRY_DELAYS_MS.length) {
        opts.onRetry?.(attempt + 1);
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
    }
  }

  throw lastError ?? new Error('Не удалось составить протокол.');
}

export { RETRY_DELAYS_MS, RECOVERY_POLL_MS, RECOVERY_MAX_POLLS };
