import { requestBodyHeaders } from './requestBodyHeaders';
import { surveyResultsAccessHeaders } from '../lib/resultsAccess';
import { eaPreviewHeaders } from '../lib/englishAssessment/preview';
import { coalesceGet } from './coalesceGet';
import { getStaffCsrf, hasStaffSessionHint, rememberStaffCsrf, resolveStaffBearer } from '../lib/staffSession';

export function normalizeApiBase(raw: string): string {
  let s = (raw || '').trim().replace(/\/+$/, '');
  if (s.endsWith('/api')) s = s.slice(0, -4).replace(/\/+$/, '');
  return s;
}

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE || '');

/** Базовый URL API (без /api) — для OAuth-редиректов. */

export function apiBaseUrl(): string {
  return API_BASE;
}

function assertApiBaseConfigured(): void {
  if (!API_BASE) return;
  if (/YOUR-API-GATEWAY|example\.com|ваш-шлюз/i.test(API_BASE)) {
    throw new Error(
      'Фронт собран с шаблонным VITE_API_BASE. Пересоберите: ./scripts/deploy-static-site.sh build (apiBase в deploy.config.json) и залейте ZIP в бакет.',
    );
  }
}

/** Без этого catch браузер даёт только «Failed to fetch» при CORS/сети. */

function apiPath(input: string): string {
  return input.replace(/^https?:\/\/[^/]+/i, '');
}

/** Публичные маршруты опросов, дашбордов и kiosk Speech Timer — без cookie/Bearer/CSRF. */
export function isPublicApiPath(input: string): boolean {
  const path = apiPath(input);
  return /\/api\/public\//.test(path) || /\/api\/speech-timer(?:\/|$)/.test(path);
}

function withPublicInit(init?: RequestInit): RequestInit {
  const headers = requestBodyHeaders(init);
  headers.delete('Authorization');
  headers.delete('X-CSRF-Token');
  headers.delete('X-Api-Key');
  return { ...init, credentials: 'omit', headers };
}

function publicNetworkError(): Error {
  if (!API_BASE) {
    return new Error(
      'Не удалось выполнить запрос: для сайта не задан адрес API (при сборке нужен VITE_API_BASE — URL шлюза Yandex без /api в конце).',
    );
  }
  return new Error(
    'Не удалось связаться с сервером. Проверьте интернет и VPN, обновите страницу и попробуйте снова. Если ошибка повторяется — откройте вкладку «Сеть» (F12) и сообщите администратору.',
  );
}

/** Анонимные GET/POST к /api/public/* — без сессии сотрудника. */
export async function publicApiFetch(input: string, init?: RequestInit): Promise<Response> {
  assertApiBaseConfigured();
  const next = withPublicInit(init);
  try {
    return await coalesceGet(input, next, () => fetch(input, next));
  } catch (e) {
    console.warn('[api/public]', input, e);
    throw publicNetworkError();
  }
}

function withSessionInit(init?: RequestInit): RequestInit {
  const headers = requestBodyHeaders(init);
  const token = resolveStaffBearer();
  // Always attach tab Bearer when present (empty Authorization must not block the bridge).
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const method = String(init?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = getStaffCsrf();
    if (csrf && !headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', csrf);
  }
  // Bearer is enough. credentials:include + Authorization forces a CORS preflight;
  // Yandex API Gateway OPTIONS often returns ACAO:* which browsers reject with cookies.
  const credentials = token ? 'omit' : (init?.credentials ?? 'include');
  return { ...init, credentials, headers };
}

function rememberCsrfFromPayload(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const csrf = (data as { csrf?: unknown }).csrf;
  if (typeof csrf === 'string' && csrf.trim()) rememberStaffCsrf(csrf);
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (typeof input === 'string' && isPublicApiPath(input)) {
    return publicApiFetch(input, init);
  }
  assertApiBaseConfigured();
  const next = withSessionInit(init);
  try {
    return await coalesceGet(input, next, () => fetch(input, next));
  } catch (e) {
    const hasBearer = Boolean(resolveStaffBearer());
    const hasSession = hasStaffSessionHint() || hasBearer;
    const path = typeof input === 'string' ? apiPath(input) : '';
    const heavyStudents = /english-assessment\/leader/i.test(path) && /[?&]students=1\b/.test(path);
    const dev =
      API_BASE ?
        'Администратору: CORS в API Gateway (survey-api-gw.yaml), CORS_ORIGIN на функции, VITE_API_BASE без /api в конце.'
      : 'Администратору: соберите фронт с VITE_API_BASE (URL шлюза или функции).';
    console.warn('[api]', dev, input, e, { hasBearer, hasSession });
    if (!API_BASE) {
      throw new Error(
        'Не удалось выполнить запрос: для сайта не задан адрес API (при сборке нужен VITE_API_BASE — URL шлюза Yandex без /api в конце).',
      );
    }
    if (!hasSession) {
      throw new Error(
        'Нет сессии сотрудника (cookie/Bearer). Войдите в кабинет снова и обновите страницу — без сессии API недоступен.',
      );
    }
    if (heavyStudents) {
      throw new Error(
        'Не удалось загрузить список учащихся среза. Часто шлюз обрывает слишком большой или долгий ответ (не CORS). Сузьте параллель или группу и повторите; при повторе — обновите страницу.',
      );
    }
    throw new Error(
      'Не удалось связаться с сервером. Частые причины: блокировка CORS (в консоли F12 — красные ошибки), неверный адрес API при сборке, VPN или обрыв сети. Откройте вкладку «Сеть» и проверьте запрос к API.',
    );
  }
}

export function sessionHeaders(): HeadersInit {
  const token = resolveStaffBearer();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

/** Cabinet and staff APIs: cookie/Bearer session only. Master key stays off these calls. */
export function adminHeaders(): HeadersInit {
  return sessionHeaders();
}

/** `/admin` and CI only — attaches `ADMIN_API_KEY` from storage. */
export function adminKeyHeaders(): HeadersInit {
  const key = typeof localStorage !== 'undefined' ? localStorage.getItem('admin_api_key') || '' : '';
  const h = { ...(sessionHeaders() as Record<string, string>) };
  if (key.trim()) h['X-Api-Key'] = key.trim();
  return h;
}

export function eaHeaders(): HeadersInit {
  return {
    ...(adminHeaders() as Record<string, string>),
    ...eaPreviewHeaders(),
  };
}

export function adminResultsHeaders(surveyId: number, accessLink?: string | null): HeadersInit {
  return {
    ...(adminHeaders() as Record<string, string>),
    ...(surveyResultsAccessHeaders(surveyId, accessLink) as Record<string, string>),
  };
}

export function throwIfResultsPasswordRequired(
  res: Response,
  data: { error?: string; password_required?: boolean },
): void {
  const err = (data.error || '').trim().toLowerCase();
  if (res.status === 401 && (err === 'results_password_required' || data.password_required)) {
    throw new Error('results_password_required');
  }
}

/** Аудио в текст: Bearer и X-Api-Key опциональны — API принимает анонимные запросы. */

export function audioProtocolHeaders(): HeadersInit {
  return adminHeaders();
}

export async function parseJson<T>(res: Response): Promise<T> {
  let text = await res.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const t = text.trim();
  /** Пустое тело: не вызывать JSON.parse('') — иначе SyntaxError «Unexpected end of JSON input». Часто при 502/504 от шлюза. */
  if (!t) {
    return {} as T;
  }
  const lead = t.trimStart().slice(0, 1);
  if (lead === '<') {
    console.warn('[api] HTML/XML вместо JSON', res.status, API_BASE || '(нет VITE_API_BASE)', t.slice(0, 400));
    throw new Error(
      'Сервер вернул неожиданный формат ответа. Попробуйте позже или обратитесь к администратору.',
    );
  }
  try {
    const parsed = JSON.parse(t) as T;
    rememberCsrfFromPayload(parsed);
    return parsed;
  } catch (e) {
    const preview = t.replace(/\s+/g, ' ').slice(0, 220);
    console.warn('[api] parseJson', res.status, e, preview);
    throw new Error(
      `Сервер вернул некорректные данные (код ${res.status}). Подождите минуту и попробуйте снова.`,
    );
  }
}

/** Для 500 бэкенд часто отдаёт error: «Internal error», а суть — в message. */

export function apiErrText(data: { error?: string; message?: string }, fallback: string): string {
  const msg = (data.message || '').trim();
  const err = (data.error || '').trim();
  if (msg && err && msg !== err) return `${msg} (${err})`;
  return msg || err || fallback;
}

export function throwVerifyResultsPasswordError(
  res: Response,
  data: { error?: string; message?: string },
  opts?: { publicRoute?: boolean },
): never {
  const err = (data.error || '').trim();
  const errLower = err.toLowerCase();
  if (errLower === 'password_not_configured') {
    throw new Error(
      'Пароль результатов на сервере не настроен: примените миграцию backend/db/migrations/042_survey_results_password.sql и задайте пароль в настройках опроса.',
    );
  }
  if (err === 'Неверный пароль' || errLower === 'invalid_password' || errLower === 'wrong_password') {
    throw new Error('Неверный пароль');
  }
  if (res.status === 404 || errLower === 'not found') {
    throw new Error(
      opts?.publicRoute
        ? 'Опрос не найден или не опубликован. Проверьте ссылку (опрос должен быть published или closed).'
        : 'Опрос не найден',
    );
  }
  if (res.status === 401 && (errLower === 'unauthorized' || err === 'Unauthorized')) {
    throw new Error(
      opts?.publicRoute
        ? 'Сервер отклонил запрос (401). Разверните свежую Cloud Function с маршрутом POST /api/public/surveys/…/verify-results-password (см. deploy_stamp в GET /api/ping).'
        : 'Нужна авторизация: войдите в админку или откройте результаты по публичной ссылке /s/…',
    );
  }
  if (res.status === 403 && errLower === 'forbidden') {
    throw new Error('Нет доступа к этому опросу');
  }
  throw new Error(apiErrText(data, res.statusText || 'Не удалось проверить пароль'));
}

/** Понятная ошибка для UI (Network → какой маршрут и код). */

export function throwApiResponseError(
  res: Response,
  data: { error?: string; message?: string },
  endpoint: string,
): never {
  const base = apiErrText(data, res.statusText);
  const errLower = (data.error || '').toLowerCase();
  if (res.status === 400 && errLower.includes('not a text')) {
    throw new Error(
      'Вопрос в опросе уже не текстовый (или страница устарела). Обновите страницу (F5) и откройте сводку снова.',
    );
  }
  if (res.status === 400 && errLower.includes('question_id')) {
    throw new Error('Не указан вопрос для сводки. Закройте окно и откройте «Сводка и вывод» ещё раз.');
  }
  if (res.status === 400 && errLower.includes('invalid id')) {
    throw new Error('Некорректный номер опроса в адресе страницы.');
  }
  if (
    res.status === 400 &&
    (errLower.includes('sections') ||
      errLower.includes('json') ||
      errLower.includes('тело запроса') ||
      errLower.includes('перевод') ||
      errLower.includes('text'))
  ) {
    throw new Error(
      moEngagementClientErrorMessage(
        data,
        'Некорректные данные для ИИ-выводов дашборда. Обновите страницу (F5).',
      ),
    );
  }
  if (
    res.status === 503 ||
    res.status === 504 ||
    errLower.includes('database_unavailable') ||
    errLower.includes('timeout') ||
    /connection terminated unexpectedly/i.test(base)
  ) {
    throw new Error(
      (data.message || '').trim() ||
        'Сервер временно потерял связь с базой данных при расчёте аналитики. Обновите страницу (F5) и нажмите «Обновить» в блоке умной аналитики. На очень больших опросах помогает сузить срез фильтрами.',
    );
  }
  throw new Error(`[${res.status}] ${endpoint}: ${base}`);
}

export function clientAppBase(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const path = base === '/' ? '' : base.replace(/\/$/, '');
  return `${window.location.origin}${path}`;
}

export function moEngagementClientErrorMessage(
  data: { error?: string; message?: string; code?: string },
  fallback: string,
): string {
  const msg = (data.message || '').trim();
  if (msg) return msg;
  const err = (data.error || '').trim();
  if (err) return err;
  return fallback;
}
