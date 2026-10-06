import { canRunBackgroundWork, subscribeBackgroundWorkGate } from './backgroundWorkGate';

/** Очередь монтирования тяжёлых блоков — пакетами, с запасным таймером если idle не срабатывает. */
const BATCH_PER_IDLE = 8;
const IDLE_TIMEOUT_MS = 120;

type MountJob = {
  run: () => void;
  cancelled: () => boolean;
};

const queue: MountJob[] = [];
let scheduled = false;
let idleHandle: number | null = null;
let timeoutHandle: number | null = null;
let gateUnsub: (() => void) | null = null;

function clearScheduled(): void {
  if (idleHandle != null && typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(idleHandle);
    idleHandle = null;
  }
  if (timeoutHandle != null) {
    window.clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  scheduled = false;
}

function clearGateWait(): void {
  if (gateUnsub) {
    gateUnsub();
    gateUnsub = null;
  }
}

function flushNext(): void {
  clearScheduled();
  if (!canRunBackgroundWork()) {
    if (!gateUnsub) {
      gateUnsub = subscribeBackgroundWorkGate(() => {
        if (canRunBackgroundWork()) {
          clearGateWait();
          scheduleMountQueueFlush();
        }
      });
    }
    return;
  }
  clearGateWait();
  for (let i = 0; i < BATCH_PER_IDLE && queue.length > 0; i += 1) {
    const job = queue.shift();
    if (!job || job.cancelled()) continue;
    job.run();
  }
  if (queue.length > 0) scheduleMountQueueFlush();
}

function scheduleMountQueueFlush(): void {
  if (scheduled) return;
  scheduled = true;
  if (typeof requestIdleCallback === 'function') {
    idleHandle = requestIdleCallback(flushNext, { timeout: IDLE_TIMEOUT_MS });
  }
  timeoutHandle = window.setTimeout(flushNext, IDLE_TIMEOUT_MS);
}

export function enqueueMount(fn: () => void, isCancelled?: () => boolean): void {
  queue.push({ run: fn, cancelled: isCancelled ?? (() => false) });
  scheduleMountQueueFlush();
}

export function clearMountQueue(): void {
  queue.length = 0;
  clearScheduled();
  clearGateWait();
}
