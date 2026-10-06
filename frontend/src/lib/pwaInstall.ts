export const INSTALL_APP_PATH = '/install-app';

export type InstallAppPlatformTab = 'ios' | 'android';

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  /** iPadOS 13+ в «настольном» Safari часто маскируется под Mac. */
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 760px)').matches;
}

/** Телефон / планшет с грубым указателем (не только установленное PWA). */
export function isCoarsePointerDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/** Мобильный браузер или PWA: viewport, touch, standalone. */
export function isTouchMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandalone() || isMobileViewport()) return true;
  if (isCoarsePointerDevice()) return true;
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) {
    return window.matchMedia('(max-width: 1024px)').matches;
  }
  return false;
}

/** Полноэкранный оверлей записи на телефоне и iOS (диктовка в отдельном поле). */
export function prefersDictationRecordingOverlay(): boolean {
  return isIos() || isMobileViewport();
}

/** Голосовое заполнение формы: только компактный dock, без полноэкранного оверлея. */
export function prefersVoiceFormFillCompactUi(): boolean {
  return isTouchMobileDevice() || isMobileViewport() || isCoarsePointerDevice();
}

export function defaultInstallPlatformTab(): InstallAppPlatformTab {
  return isIos() ? 'ios' : 'android';
}
