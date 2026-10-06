/** Short human wait for the first cabinet assemble. Not a precise clock. */
export const CABINET_WAIT_BUDGET_MS = 7000;

export type CabinetWaitKind =
  | 'menu'
  | 'home'
  | 'route'
  | 'notifications'
  | 'spreadsheets'
  | 'spreadsheet'
  | 'checklist'
  | 'english'
  | 'events'
  | 'directory'
  | 'ei'
  | 'settings'
  | 'surveys'
  | 'analytics'
  | 'opsMeetings'
  | 'booking'
  | 'default';

export const CABINET_WAIT_KIND_BUDGET_MS: Record<CabinetWaitKind, number> = {
  menu: 2800,
  home: 4500,
  route: 2200,
  notifications: 3500,
  spreadsheets: 4000,
  spreadsheet: 4500,
  checklist: 5000,
  english: 3500,
  events: 3000,
  directory: 3000,
  ei: 2800,
  settings: 2200,
  surveys: 4000,
  analytics: 3500,
  opsMeetings: 4000,
  booking: 3500,
  default: CABINET_WAIT_BUDGET_MS,
};

export const CABINET_WAIT_KIND_LABEL: Record<CabinetWaitKind, string> = {
  menu: 'Открываю меню',
  home: 'Открываю кабинет',
  route: 'Открываю раздел',
  notifications: 'Открываю уведомления',
  spreadsheets: 'Открываю таблицы',
  spreadsheet: 'Открываю таблицу',
  checklist: 'Открываю чек-лист',
  english: 'Открываю раздел по английскому',
  events: 'Открываю календарь',
  directory: 'Открываю справочник',
  ei: 'Открываю карту настроения',
  settings: 'Открываю настройки',
  surveys: 'Открываю опросы',
  analytics: 'Открываю сводку',
  opsMeetings: 'Открываю оперативку',
  booking: 'Открываю запись',
  default: 'Открываю кабинет',
};

export function isCabinetWaitKind(value: string): value is CabinetWaitKind {
  return Object.prototype.hasOwnProperty.call(CABINET_WAIT_KIND_LABEL, value);
}

const WAIT_MEMORY_KEY = 'pulse_cab_wait_ms';

export function cabinetWaitLabel(kind: CabinetWaitKind = 'default'): string {
  return CABINET_WAIT_KIND_LABEL[kind] || CABINET_WAIT_KIND_LABEL.default;
}

export function resolveCabinetWaitKind(pathname: string): CabinetWaitKind {
  const p = (pathname.replace(/^\/cabinet\/as(?=\/|$)/, '/cabinet').replace(/\/+$/, '') || '/').replace(
    /^\/kabinet(?=\/|$)/,
    '/cabinet',
  );
  if (p === '/cabinet' || p === '/dev/cabinet-home-layout') return 'home';
  if (p.startsWith('/cabinet/notifications')) return 'notifications';
  if (/^\/cabinet\/spreadsheets\/[^/]+/.test(p)) return 'spreadsheet';
  if (p.startsWith('/cabinet/spreadsheets')) return 'spreadsheets';
  if (
    p.startsWith('/cabinet/feedback') ||
    p.startsWith('/cabinet/visit-checklist') ||
    p.startsWith('/cabinet/lesson-visits') ||
    p.startsWith('/analytics/lesson-visit')
  ) {
    return 'checklist';
  }
  if (p.startsWith('/cabinet/english')) return 'english';
  if (p.startsWith('/cabinet/events')) return 'events';
  if (p.startsWith('/cabinet/directory')) return 'directory';
  if (p.startsWith('/cabinet/ei')) return 'ei';
  if (p.startsWith('/cabinet/settings')) return 'settings';
  if (p.startsWith('/cabinet/surveys')) return 'surveys';
  if (p === '/dev/ops-meetings-layout' || p === '/analytics/ops-meetings' || p.startsWith('/analytics/ops-meetings/')) {
    return 'opsMeetings';
  }
  if (p.startsWith('/analytics/teacher-booking') || p.startsWith('/cabinet/teacher-booking')) {
    return 'booking';
  }
  if (
    p === '/dev/analytics-layout' ||
    p === '/analytics' ||
    p.startsWith('/analytics/') ||
    p.startsWith('/cabinet/teambuilding') ||
    p.startsWith('/cabinet/forum-sessions')
  ) {
    return 'analytics';
  }
  return 'route';
}

type WaitMemory = Partial<Record<CabinetWaitKind, number>>;

function readWaitMemory(): WaitMemory {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(WAIT_MEMORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WaitMemory;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberCabinetWaitDuration(kind: CabinetWaitKind, elapsedMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 180) return;
  const base = CABINET_WAIT_KIND_BUDGET_MS[kind] || CABINET_WAIT_BUDGET_MS;
  const clamped = Math.max(Math.round(base * 0.4), Math.min(Math.round(base * 1.8), Math.round(elapsedMs * 1.08)));
  const prev = readWaitMemory();
  const blended = prev[kind] ? Math.round(Number(prev[kind]) * 0.4 + clamped * 0.6) : clamped;
  try {
    sessionStorage.setItem(WAIT_MEMORY_KEY, JSON.stringify({ ...prev, [kind]: blended }));
  } catch {
    /* ignore quota / private mode */
  }
}

export function cabinetWaitBudgetMs(kind: CabinetWaitKind = 'default'): number {
  const base = CABINET_WAIT_KIND_BUDGET_MS[kind] || CABINET_WAIT_BUDGET_MS;
  const learned = Number(readWaitMemory()[kind]);
  if (!Number.isFinite(learned) || learned <= 0) return base;
  return Math.max(Math.round(base * 0.4), Math.min(Math.round(base * 1.8), Math.round(learned)));
}

export function cabinetWaitProgress(elapsedMs: number, budgetMs = CABINET_WAIT_BUDGET_MS): number {
  const raw = elapsedMs / Math.max(1, budgetMs);
  return Math.max(1, Math.min(95, Math.round(raw * 95)));
}

export function cabinetWaitRemainingSec(elapsedMs: number, budgetMs = CABINET_WAIT_BUDGET_MS): number {
  return Math.max(1, Math.ceil((budgetMs - elapsedMs) / 1000));
}

export function formatCabinetWaitElapsed(elapsedMs: number): string {
  const sec = Math.max(0, Math.floor(elapsedMs / 1000));
  if (sec < 60) return `${sec} сек`;
  const minutes = Math.floor(sec / 60);
  const rest = sec % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

const CABINET_WAIT_ALMOST_READY = 'Осталось совсем чуть-чуть';

/** Join section line + suffix with `. ` unless the line already ends with `.` / `!` / `?`. */
export function joinCabinetWaitSentences(line: string, suffix: string): string {
  const head = line.trim();
  const tail = suffix.trim();
  if (!head) return tail;
  if (!tail) return head;
  if (/[.!?]$/.test(head)) return `${head} ${tail}`;
  return `${head}. ${tail}`;
}

export function formatCabinetWaitCopy(
  elapsedMs: number,
  budgetMs = CABINET_WAIT_BUDGET_MS,
  happening?: string,
): string {
  const line = `${happening?.trim() || CABINET_WAIT_KIND_LABEL.home}…`;
  if (elapsedMs >= budgetMs) {
    return joinCabinetWaitSentences(line, CABINET_WAIT_ALMOST_READY);
  }
  return line;
}

export function formatCabinetWaitRemainingLabel(elapsedMs: number, budgetMs = CABINET_WAIT_BUDGET_MS): string {
  if (elapsedMs >= budgetMs) return 'ещё мгновение';
  const left = cabinetWaitRemainingSec(elapsedMs, budgetMs);
  if (left < 60) return `осталось ~${left} сек`;
  const minutes = Math.floor(left / 60);
  const rest = left % 60;
  return rest > 0 ? `осталось ~${minutes}:${String(rest).padStart(2, '0')}` : `осталось ~${minutes} мин`;
}

export function formatCabinetWaitError(message?: string | null): string {
  const text = (message || '').trim();
  return text || 'Не открылось с первого раза. Обновите страницу — иногда помогает, как открытое окно.';
}

export function formatPrepareWaitCopy(etaSec: number, done: number, total: number): string {
  if (total > 0) {
    const left = Math.max(1, Math.round(etaSec));
    if (left < 20) return `${done} из ${total} · ещё около ${left} сек`;
    if (left < 90) return `${done} из ${total} · ещё около минуты`;
    return `${done} из ${total} · ещё около ${Math.round(left / 60)} мин`;
  }
  if (etaSec > 0 && etaSec < 20) return `Ещё около ${Math.round(etaSec)} сек`;
  return 'Считаем, сколько карточек нужно собрать';
}
