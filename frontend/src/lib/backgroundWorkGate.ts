/**
 * Фоновые задачи (ИИ, архив, монтирование карточек) — только когда пользователь
 * не взаимодействует со страницей или вкладка скрыта.
 */

/** Пауза без ввода перед возобновлением фоновой работы (мс). */
export const BACKGROUND_WORK_IDLE_MS = 2500;

const IDLE_CALLBACK_TIMEOUT_MS = 120;

type Listener = () => void;

let lastActivityAt = 0;
let userActive = true;
let tabVisible = typeof document !== 'undefined' ? !document.hidden : true;
let idleTimer: number | null = null;
let initialized = false;
const listeners = new Set<Listener>();

type Waiter = { resolve: () => void; onGate: Listener };
const waiters = new Set<Waiter>();

function isBackgroundWorkAllowed(): boolean {
  return !tabVisible || !userActive;
}

function notifyListeners(): void {
  for (const fn of listeners) fn();
  if (!isBackgroundWorkAllowed()) return;
  for (const waiter of waiters) {
    waiters.delete(waiter);
    listeners.delete(waiter.onGate);
    waiter.resolve();
  }
}

function scheduleIdleCheck(): void {
  if (idleTimer != null) window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    idleTimer = null;
    if (Date.now() - lastActivityAt >= BACKGROUND_WORK_IDLE_MS) {
      const wasAllowed = isBackgroundWorkAllowed();
      userActive = false;
      if (!wasAllowed) notifyListeners();
      return;
    }
    scheduleIdleCheck();
  }, BACKGROUND_WORK_IDLE_MS);
}

function markUserActivity(): void {
  lastActivityAt = Date.now();
  const wasAllowed = isBackgroundWorkAllowed();
  userActive = true;
  if (wasAllowed) notifyListeners();
  scheduleIdleCheck();
}

function initGate(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  lastActivityAt = Date.now();

  const onActivity = () => markUserActivity();
  const events = ['mousedown', 'keydown', 'touchstart', 'wheel', 'scroll', 'pointerdown'] as const;
  for (const ev of events) {
    window.addEventListener(ev, onActivity, { passive: true, capture: true });
  }

  let mousemoveTimer: number | null = null;
  window.addEventListener(
    'mousemove',
    () => {
      if (mousemoveTimer != null) return;
      mousemoveTimer = window.setTimeout(() => {
        mousemoveTimer = null;
        markUserActivity();
      }, 200);
    },
    { passive: true, capture: true },
  );

  document.addEventListener('visibilitychange', () => {
    tabVisible = !document.hidden;
    notifyListeners();
  });

  window.addEventListener('focus', onActivity, true);
  document.addEventListener('focusin', onActivity, true);

  scheduleIdleCheck();
}

export function subscribeBackgroundWorkGate(listener: Listener): () => void {
  initGate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canRunBackgroundWork(): boolean {
  initGate();
  return isBackgroundWorkAllowed();
}

export function waitForBackgroundWork(isCancelled?: () => boolean): Promise<void> {
  initGate();
  if (isCancelled?.()) return Promise.resolve();
  if (isBackgroundWorkAllowed()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const onGate: Listener = () => {
      if (isCancelled?.()) {
        waiters.delete(waiter);
        listeners.delete(onGate);
        resolve();
        return;
      }
      if (!isBackgroundWorkAllowed()) return;
      waiters.delete(waiter);
      listeners.delete(onGate);
      resolve();
    };
    const waiter: Waiter = { resolve, onGate };
    waiters.add(waiter);
    listeners.add(onGate);
  });
}

/** Ждёт «окно простоя» и отдаёт кадр через requestIdleCallback. */
export async function yieldForBackgroundWork(isCancelled?: () => boolean): Promise<void> {
  await waitForBackgroundWork(isCancelled);
  if (isCancelled?.()) return;
  await new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: IDLE_CALLBACK_TIMEOUT_MS });
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

export function scheduleBackgroundWork(fn: () => void, isCancelled?: () => boolean): void {
  initGate();
  const run = () => {
    if (isCancelled?.()) return;
    if (!canRunBackgroundWork()) {
      const unsub = subscribeBackgroundWorkGate(() => {
        if (canRunBackgroundWork()) {
          unsub();
          run();
        }
      });
      return;
    }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(
        () => {
          if (!isCancelled?.()) fn();
        },
        { timeout: IDLE_CALLBACK_TIMEOUT_MS },
      );
      return;
    }
    window.setTimeout(() => {
      if (!isCancelled?.()) fn();
    }, 0);
  };
  run();
}
