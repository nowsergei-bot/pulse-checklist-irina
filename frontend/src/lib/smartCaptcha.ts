let scriptPromise: Promise<void> | null = null;

function siteKey(): string {
  return String(import.meta.env.VITE_SMARTCAPTCHA_CLIENT_KEY || '').trim();
}

function loadScript(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pulse-smartcaptcha="1"]');
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://smartcaptcha.yandexcloud.net/captcha.js?render=onload';
    script.async = true;
    script.defer = true;
    script.dataset.pulseSmartcaptcha = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('smartcaptcha_load_failed'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Invisible Yandex SmartCaptcha token for anonymous POSTs.
 * Empty when the public client key is not set (local / not configured).
 */
export async function getSmartCaptchaToken(): Promise<string> {
  const key = siteKey();
  if (!key || typeof window === 'undefined') return '';
  await loadScript();
  const api = (window as unknown as { smartCaptcha?: { execute?: (sitekey: string) => Promise<string> } })
    .smartCaptcha;
  if (!api?.execute) return '';
  try {
    return String((await api.execute(key)) || '').trim();
  } catch {
    return '';
  }
}

export function smartCaptchaEnabled(): boolean {
  return Boolean(siteKey());
}
