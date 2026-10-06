import { yieldForBackgroundWork } from './backgroundWorkGate';
import { yieldToMain } from './yieldToMain';

/** Недавно открытые карточки — без очереди и тайминга. */
const INSTANT_TTL_MS = 10 * 60 * 1000;
const IDLE_TIMEOUT_MS = 120;
const MAX_ETA_SAMPLES = 12;

type HeavyCardJob = {
  cardId: string;
  run: () => void;
  onActivate?: () => void;
  onDone?: () => void;
  isCancelled?: () => boolean;
  /** true (по умолчанию) — ждём простоя пользователя; false — явный клик по карточке/списку. */
  respectUserActivity?: boolean;
};

let activeCardId: string | null = null;
let draining = false;
const waitQueue: HeavyCardJob[] = [];
const openedAt = new Map<string, number>();
const durationSamples: number[] = [];

function idleFrame(isCancelled?: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (isCancelled?.()) {
      resolve();
      return;
    }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT_MS });
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

function recordDuration(ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  durationSamples.push(ms);
  if (durationSamples.length > MAX_ETA_SAMPLES) durationSamples.shift();
}

export function isHeavyCardCached(cardId: string): boolean {
  const t = openedAt.get(cardId);
  return t != null && Date.now() - t < INSTANT_TTL_MS;
}

export function markHeavyCardOpened(cardId: string): void {
  openedAt.set(cardId, Date.now());
}

export function getHeavyCardQueuePosition(cardId: string): number {
  if (activeCardId === cardId) return 0;
  const idx = waitQueue.findIndex((j) => j.cardId === cardId);
  if (idx < 0) return -1;
  return activeCardId ? idx + 1 : idx;
}

export function estimateHeavyCardEtaSec(queuePosition = 0): number | null {
  if (!durationSamples.length) return null;
  const avgMs = durationSamples.reduce((sum, v) => sum + v, 0) / durationSamples.length;
  const ahead = Math.max(0, queuePosition) + (activeCardId ? 1 : 0);
  if (ahead <= 0) return null;
  return Math.max(1, Math.ceil((ahead * avgMs) / 1000));
}

export function enqueueHeavyCardReveal(job: HeavyCardJob): () => void {
  let cancelled = false;
  const wrapped: HeavyCardJob = {
    ...job,
    isCancelled: () => cancelled || (job.isCancelled?.() ?? false),
  };

  const cancel = () => {
    cancelled = true;
    const idx = waitQueue.findIndex((j) => j === wrapped);
    if (idx >= 0) waitQueue.splice(idx, 1);
  };

  if (!wrapped.isCancelled?.() && isHeavyCardCached(job.cardId)) {
    wrapped.onActivate?.();
    wrapped.run();
    wrapped.onDone?.();
    markHeavyCardOpened(job.cardId);
    return cancel;
  }

  if (wrapped.respectUserActivity === false) {
    waitQueue.unshift(wrapped);
  } else {
    waitQueue.push(wrapped);
  }
  void drainHeavyCardQueue();
  return cancel;
}

async function drainHeavyCardQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (waitQueue.length > 0) {
      const job = waitQueue[0];
      if (job.isCancelled?.()) {
        waitQueue.shift();
        continue;
      }

      activeCardId = job.cardId;
      job.onActivate?.();
      const t0 = performance.now();

      if (job.respectUserActivity !== false) {
        await yieldForBackgroundWork(job.isCancelled);
        if (job.isCancelled?.()) {
          waitQueue.shift();
          activeCardId = null;
          continue;
        }
        await idleFrame(job.isCancelled);
        if (job.isCancelled?.()) {
          waitQueue.shift();
          activeCardId = null;
          continue;
        }
      } else {
        await yieldToMain();
        if (job.isCancelled?.()) {
          waitQueue.shift();
          activeCardId = null;
          continue;
        }
      }

      job.run();

      recordDuration(performance.now() - t0);
      markHeavyCardOpened(job.cardId);
      job.onDone?.();
      waitQueue.shift();
      activeCardId = null;

      if (waitQueue.length > 0) {
        await idleFrame();
      }
    }
  } finally {
    draining = false;
    if (waitQueue.length > 0) void drainHeavyCardQueue();
  }
}
