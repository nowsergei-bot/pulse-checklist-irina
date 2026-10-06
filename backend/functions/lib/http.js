const { createHash } = require('crypto');

const DEFAULT_CORS_ORIGINS = ['https://statisticsprimakov2.website.yandexcloud.net'];

function corsAllowList() {
  const raw = String(process.env.CORS_ORIGIN || '').trim();
  if (!raw || raw === '*') {
    const defaults = [...DEFAULT_CORS_ORIGINS];
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'development') {
      defaults.push('http://localhost:5173', 'http://127.0.0.1:5173');
    }
    return defaults;
  }
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .filter((s) => s !== '*');
}

/**
 * CORS для ответа: совпадает с Origin браузера, если он в CORS_ORIGIN (или *).
 * Иначе — первый origin из списка / * (иначе шлюз 403 без ACAO ломает fetch в браузере).
 */
function corsHeadersForEvent(event) {
  const reqOrigin = String(event?.headers?.origin || event?.headers?.Origin || '')
    .trim()
    .replace(/\/$/, '');
  const list = corsAllowList();
  let allowOrigin = list[0] || DEFAULT_CORS_ORIGINS[0];
  if (reqOrigin && list.includes(reqOrigin)) {
    allowOrigin = reqOrigin;
  }
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, X-Api-Key, Authorization, X-CSRF-Token, X-Smart-Captcha, X-Jd-Preview-As, X-Jd-Preview-As-Staff, X-Jd-Access-Token, X-Ea-Preview-As, X-Ea-Preview-As-Teacher, X-Results-Access-Token, X-External-Submit-Key, X-Photo-Wall-Display-Settings-Secret',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const CORS_HEADERS = corsHeadersForEvent(null);

/** Ниже лимита ответа API Gateway (иначе часто 502 без JSON). */
const MAX_JSON_BODY_UTF16_UNITS = Math.floor(3.5 * 1024 * 1024);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function requestHeader(event, name) {
  const headers = event?.headers || {};
  const lower = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === lower) return String(value || '');
  }
  return '';
}

function publicCacheHeaders(etag) {
  return {
    'Cache-Control': 'public, max-age=60',
    ETag: etag,
  };
}

/** Public GET JSON: short cache + ETag / 304. Private handlers keep json() + no-store. */
function publicJson(statusCode, body, event, extraHeaders = {}) {
  const preview = json(statusCode, body, extraHeaders, event);
  if (statusCode !== 200) return preview;
  const etag = `"${createHash('sha1').update(preview.body).digest('hex')}"`;
  const headers = { ...publicCacheHeaders(etag), ...extraHeaders };
  const inm = requestHeader(event, 'if-none-match');
  if (inm && inm === etag) {
    return json(304, {}, headers, event);
  }
  return json(statusCode, body, headers, event);
}

function json(statusCode, body, extraHeaders = {}, event) {
  const cors = { ...corsHeadersForEvent(event), ...SECURITY_HEADERS };
  let raw;
  try {
    raw = JSON.stringify(body);
  } catch (err) {
    console.error('[json] stringify failed', err);
    raw = JSON.stringify({
      error: 'serialization_failed',
      message: 'Не удалось сформировать JSON-ответ (слишком большие данные).',
    });
    return {
      statusCode: 500,
      headers: { ...cors, ...extraHeaders },
      body: raw,
      isBase64Encoded: false,
    };
  }
  if (raw.length > MAX_JSON_BODY_UTF16_UNITS) {
    raw = JSON.stringify({
      error: 'response_too_large',
      message:
        'Ответ превышает лимит шлюза (~3,5 МБ). Частая причина — очень большой проект (Excel/таблица на сервере) или тяжёлая фотостена. Уменьшите объём данных или для Excel заново загрузите файл: маппинг сохранится в сессии.',
    });
    return {
      statusCode: 413,
      headers: { ...cors, ...extraHeaders },
      body: raw,
      isBase64Encoded: false,
    };
  }
  return {
    statusCode,
    headers: { ...cors, ...extraHeaders },
    body: raw,
    isBase64Encoded: false,
  };
}

/** Бинарный ответ (ZIP и т.п.) для API Gateway: тело в base64. */
function binary(statusCode, buffer, contentType, filename, extraHeaders = {}, event) {
  const cors = { ...corsHeadersForEvent(event), ...SECURITY_HEADERS };
  const headers = {
    ...cors,
    ...extraHeaders,
    'Content-Type': contentType || 'application/octet-stream',
  };
  if (!headers['Cache-Control']) headers['Cache-Control'] = 'no-store';
  if (filename) {
    const safe = String(filename).replace(/["\r\n]/g, '_');
    headers['Content-Disposition'] = `attachment; filename="${safe}"`;
  }
  return {
    statusCode,
    headers,
    body: Buffer.from(buffer).toString('base64'),
    isBase64Encoded: true,
  };
}

const MAX_JSON_BODY_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 20;

function jsonDepth(value, depth = 0) {
  if (depth > MAX_JSON_DEPTH) return depth;
  if (!value || typeof value !== 'object') return depth;
  let max = depth;
  const kids = Array.isArray(value) ? value : Object.values(value);
  for (const kid of kids) {
    max = Math.max(max, jsonDepth(kid, depth + 1));
    if (max > MAX_JSON_DEPTH) return max;
  }
  return max;
}

function throwBodyError(code, publicError) {
  const err = new Error(code);
  err.httpStatus = code === 'payload_too_large' ? 413 : 400;
  err.publicError = publicError;
  throw err;
}

function parseBody(event) {
  if (event?.body == null || event.body === '') return null;
  // API Gateway / Cloud Functions иногда передают уже разобранный JSON-объект, а не строку.
  if (typeof event.body === 'object' && !Buffer.isBuffer(event.body)) {
    if (jsonDepth(event.body) > MAX_JSON_DEPTH) throwBodyError('payload_too_deep', 'Слишком глубокий JSON');
    return event.body;
  }
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  if (typeof raw === 'object') {
    if (jsonDepth(raw) > MAX_JSON_DEPTH) throwBodyError('payload_too_deep', 'Слишком глубокий JSON');
    return raw;
  }
  const text = String(raw);
  if (Buffer.byteLength(text, 'utf8') > MAX_JSON_BODY_BYTES) {
    throwBodyError('payload_too_large', 'Тело запроса больше 1 МБ');
  }
  try {
    const parsed = JSON.parse(text);
    if (jsonDepth(parsed) > MAX_JSON_DEPTH) throwBodyError('payload_too_deep', 'Слишком глубокий JSON');
    return parsed;
  } catch (err) {
    if (err && err.httpStatus) throw err;
    return null;
  }
}

function parseQuery(event) {
  const out = {};
  const q = event.queryStringParameters || event.query || null;
  if (q && typeof q === 'object') {
    for (const [k, v] of Object.entries(q)) out[String(k)] = v == null ? '' : String(v);
    return out;
  }
  const raw =
    (event.rawQueryString ? String(event.rawQueryString) : '') ||
    (event.requestContext?.http?.queryString ? String(event.requestContext.http.queryString) : '');
  if (!raw) return out;
  const sp = new URLSearchParams(raw);
  for (const [k, v] of sp.entries()) out[k] = v;
  return out;
}

/** Шлюз иногда подставляет литерал шаблона OpenAPI вместо захваченного пути. */
function isBrokenPathParam(value) {
  const s = String(value ?? '').trim();
  if (!s) return true;
  if (s === '{proxy+}' || s === '{proxy}') return true;
  if (s.includes('{proxy')) return true;
  return false;
}

function pathFromProxyParam(raw) {
  const p = String(raw).replace(/^\/+/, '').replace(/\/$/, '');
  if (!p) return '/';
  const withApi = p.startsWith('api/') || p === 'api' ? p : `api/${p}`;
  return `/${withApi}`;
}

function normalizePath(event) {
  const params = event.pathParameters || {};
  if (params.proxy != null && String(params.proxy).length > 0 && !isBrokenPathParam(params.proxy)) {
    return pathFromProxyParam(params.proxy);
  }
  if (params.path != null && String(params.path).length > 0 && !isBrokenPathParam(params.path)) {
    return pathFromProxyParam(params.path);
  }

  let path =
    event.path ||
    event.requestContext?.http?.path ||
    event.requestContext?.path ||
    event.url ||
    '';
  if (path.includes('?')) path = path.split('?')[0];
  // Dedicated gateway routes provide a path template plus named parameters.
  path = path.replace(/\{([^}]+)\}/g, (placeholder, name) =>
    params[name] != null ? encodeURIComponent(String(params[name])) : placeholder,
  );
  if (path.includes('{proxy+}') || path === '/{proxy}') {
    path = '';
  }

  const h = event.headers || {};
  if (!path && h) {
    const pick = (name) => {
      const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? String(h[key]).split('?')[0] : '';
    };
    path = pick('X-Forwarded-Path') || pick('X-Envoy-Original-Path') || '';
  }

  // Иногда шлюз добавляет префикс этапа: /$default/api/... → оставляем с /api/
  const parts = path.split('/').filter(Boolean);
  const apiAt = parts.indexOf('api');
  if (apiAt >= 0) {
    path = '/' + parts.slice(apiAt).join('/');
  }

  path = path.replace(/\/$/, '') || '/';
  // Клиент: VITE_API_BASE уже …/api + URL `/api/surveys/…` → шлюз отдаёт /api/api/… — иначе ни один маршрут не совпадает
  while (path.includes('/api/api')) {
    path = path.replace(/\/api\/api/g, '/api');
  }
  return path;
}

function getMethod(event) {
  const m =
    event.httpMethod ||
    event.requestContext?.httpMethod ||
    event.requestContext?.http?.method ||
    event.requestContext?.requestContext?.httpMethod ||
    event.requestContext?.requestContext?.http?.method ||
    'GET';
  // Без trim «POST » / перенос строки от шлюза ломает сравнение method === 'POST'
  return String(m).trim().toUpperCase();
}

module.exports = {
  json,
  publicJson,
  binary,
  parseBody,
  parseQuery,
  normalizePath,
  getMethod,
  CORS_HEADERS,
  corsHeadersForEvent,
  corsAllowList,
  MAX_JSON_BODY_BYTES,
  MAX_JSON_DEPTH,
  jsonDepth,
};
