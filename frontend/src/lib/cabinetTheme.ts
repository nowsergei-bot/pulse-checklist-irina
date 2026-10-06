/** corporate = красный акцент; blue = синий; green = зелёный. Фон всегда светлый. */
export type CabinetTheme = 'corporate' | 'blue' | 'green';

export const CABINET_THEMES: readonly CabinetTheme[] = ['corporate', 'blue', 'green'];

export const CABINET_THEME_STORAGE_KEY = 'pulse_cabinet_theme';
export const AFTER_ONBOARDING_STORAGE_KEY = 'pulse_after_onboarding';
/** Нажали «Сделать в следующий раз» или выбрали тему в окне — оформление больше не предлагаем. */
export const CABINET_APPEARANCE_LATER_KEY = 'pulse_cabinet_appearance_later';
/** Неполный черновик писал сюда. Не читаем как dismiss — иначе окно пропадает у тех, кто его не видел. */
const CABINET_APPEARANCE_LATER_STALE_KEY = 'pulse_cabinet_appearance_later_v2';

/** Окно не показываем на входе, настройках и онбординге. */
export function hideCabinetEntryPromptPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/auth' || path.startsWith('/auth/')) return true;
  if (path === '/cabinet/settings' || path === '/kabinet/settings') return true;
  if (path === '/cabinet/as/settings' || path === '/kabinet/as/settings') return true;
  if (path === '/cabinet/onboarding' || path === '/kabinet/onboarding') return true;
  return false;
}

export function normalizeCabinetTheme(raw: unknown): CabinetTheme {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'blue' || t === 'dark') return 'blue';
  if (t === 'green') return 'green';
  return 'corporate';
}

/** Тёмных шкур больше нет. Оставлено, чтобы старые вызовы не включали pulse-product. */
export function isDarkCabinetTheme(_theme?: CabinetTheme): boolean {
  return false;
}

/** @deprecated Use isDarkCabinetTheme. */
export function isSberCabinetTheme(theme: CabinetTheme): boolean {
  return isDarkCabinetTheme(theme);
}

export function readStoredCabinetTheme(): CabinetTheme {
  try {
    return normalizeCabinetTheme(localStorage.getItem(CABINET_THEME_STORAGE_KEY));
  } catch {
    return 'corporate';
  }
}

export function persistCabinetTheme(theme: CabinetTheme): void {
  try {
    localStorage.setItem(CABINET_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(new Event('pulse-cabinet-theme'));
}

export function cabinetThemeClassName(theme: CabinetTheme): string {
  if (theme === 'green') return ' app-public--cabinet-green';
  if (theme === 'blue') return ' app-public--cabinet-blue';
  return '';
}

export function cabinetUserHasPhoto(user?: {
  photo_url?: string | null;
  photo_thumb_url?: string | null;
} | null): boolean {
  return Boolean(String(user?.photo_url || '').trim() || String(user?.photo_thumb_url || '').trim());
}

export function readAppearancePromptDismissed(): boolean {
  try {
    return localStorage.getItem(CABINET_APPEARANCE_LATER_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistAppearancePromptDismissed(): void {
  try {
    localStorage.setItem(CABINET_APPEARANCE_LATER_KEY, '1');
    localStorage.removeItem(CABINET_APPEARANCE_LATER_STALE_KEY);
  } catch {
    /* ignore quota */
  }
}

/**
 * appearance — каждый заход, пока не нажали «Сделать в следующий раз» (или не выбрали тему).
 * photo — каждый заход, пока нет photo_url / photo_thumb_url.
 * Отложить оформление не закрывает просьбу про фото: closedThisVisit только для крестика / Escape.
 */
export function resolveCabinetEntryPrompt(opts: {
  appearanceDismissed: boolean;
  hasPhoto: boolean;
  closedThisVisit: boolean;
}): { appearance: boolean; photo: boolean } {
  if (opts.closedThisVisit) return { appearance: false, photo: false };
  return {
    appearance: !opts.appearanceDismissed,
    photo: !opts.hasPhoto,
  };
}

/**
 * Contacts/photo setup is optional. Never block `/cabinet` after login —
 * staff may visit `/cabinet/onboarding` or Settings later voluntarily.
 * Kept for call-site compatibility; always false.
 */
export function needsCabinetOnboarding(
  _user?: { id?: number | null; onboarding_completed_at?: string | null } | null,
): boolean {
  return false;
}

export function peekAfterOnboardingPath(): string {
  try {
    const raw = sessionStorage.getItem(AFTER_ONBOARDING_STORAGE_KEY) || '';
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  } catch {
    /* ignore */
  }
  return '/cabinet';
}

export function rememberAfterOnboardingPath(path: string): void {
  try {
    sessionStorage.setItem(AFTER_ONBOARDING_STORAGE_KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumeAfterOnboardingPath(): string {
  const path = peekAfterOnboardingPath();
  try {
    sessionStorage.removeItem(AFTER_ONBOARDING_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return path;
}
