/**
 * Вызов чат-модели: GigaChat (OAuth + OpenAI-совместимый /chat/completions), OpenAI/OpenRouter.
 * Чат YandexGPT выключен; ключи YANDEX_* только для SpeechKit STT.
 * Сообщения в формате OpenAI: { role: 'system'|'user'|'assistant', content: string }
 */

const {
  defaultChatModel,
  isCloudRuFoundationModelsUrl,
  normalizeCloudRuFmModel,
} = require('./default-chat-model');
const { sanitizeForExternalAi } = require('./sanitize-for-external-ai');
const { assertAiUsageAllowed, logAiUsage } = require('./ai-usage');
const crypto = require('crypto');
const dns = require('dns');

/** Снижает «fetch failed» в облаке, когда IPv6 маршрутизируется некорректно (undici/Node). */
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* ignore */
}

function collectFetchErrorText(e) {
  const chunks = [];
  const seen = new Set();
  let cur = e;
  let depth = 0;
  while (cur != null && depth < 8) {
    if (typeof cur === 'string') {
      const s = cur.trim();
      if (s && !chunks.includes(s)) chunks.push(s);
      break;
    }
    if (typeof cur !== 'object') {
      const s = String(cur);
      if (s && s !== '[object Object]' && !chunks.includes(s)) chunks.push(s);
      break;
    }
    if (seen.has(cur)) break;
    seen.add(cur);
    if (typeof cur.message === 'string') {
      const msg = cur.message.trim();
      if (msg && !chunks.includes(msg)) chunks.push(msg);
    }
    cur = 'cause' in cur ? cur.cause : null;
    depth += 1;
  }
  if (!chunks.length) return '';
  if (chunks.length === 1) return chunks[0];
  return `${chunks[0]} (${chunks.slice(1).join('; ')})`;
}

function normalizeFetchError(e) {
  const s = collectFetchErrorText(e).trim();
  return s || 'Сетевая ошибка при запросе к API';
}

function isTlsCertChainOrVerifyErrorMessage(msg) {
  const s = String(msg || '').toLowerCase();
  return (
    s.includes('self-signed certificate in certificate chain') ||
    s.includes('self signed certificate in certificate chain') ||
    s.includes('self-signed certificate') ||
    s.includes('certificate chain') ||
    s.includes('unable to verify the first certificate') ||
    s.includes('unable to verify') ||
    s.includes('unable_to_verify') ||
    s.includes('certificates verify failed') ||
    s.includes('certificate verify failed') ||
    s.includes('ssl routines') ||
    s.includes('tlsv1 alert')
  );
}

function isLikelyGigaChatOutboundUrl(url) {
  try {
    const h = new URL(String(url)).hostname.toLowerCase();
    return h.includes('sberbank.ru') || h.includes('sber.ru') || h.includes('gigachat') || h === 'api.giga.chat';
  } catch {
    return false;
  }
}

function shouldRelaxGigaTlsRetry(url, msg, env) {
  const e = env && typeof env === 'object' ? env : {};
  if (isProdEnv(e)) return false;
  if (String(e.GIGACHAT_TLS_INSECURE || '') === '1') return false;
  if (!isLikelyGigaChatOutboundUrl(url)) return false;
  const text = String(msg || '');
  const tls = isTlsCertChainOrVerifyErrorMessage(text);
  const bareFetchFailed = /^fetch failed$/i.test(text.trim());
  if (!tls && !bareFetchFailed) return false;
  if (String(e.GIGACHAT_TLS_NO_AUTO_RELAX || '') === '1') {
    return String(e.GIGACHAT_TLS_INSECURE_ON_CERT_ERROR || '') === '1';
  }
  return true;
}

/**
 * Первый запрос к хостам Сбера: ослабить TLS сразу.
 * GIGACHAT_TLS_INSECURE=1 — явный always-on.
 * По умолчанию для Sber — тоже skip verify (Yandex Cloud Function не принимает цепочку Сбера).
 * GIGACHAT_TLS_NO_AUTO_RELAX=1 — не ослаблять на первом запросе.
 */
function isProdEnv(env) {
  const e = env && typeof env === 'object' ? env : process.env;
  return String(e.NODE_ENV || '') === 'production';
}

function shouldUseInsecureGigaTls(url, env) {
  const e = env && typeof env === 'object' ? env : {};
  if (!isLikelyGigaChatOutboundUrl(url)) return false;
  if (isProdEnv(e)) {
    if (String(e.GIGACHAT_TLS_INSECURE || '') === '1') {
      console.warn('GIGACHAT_TLS_INSECURE ignored when NODE_ENV=production');
    }
    return false;
  }
  if (String(e.GIGACHAT_TLS_INSECURE || '') === '1') return true;
  if (String(e.GIGACHAT_TLS_NO_AUTO_RELAX || '') === '1') return false;
  return true;
}

function loadUndici() {
  try {
    return require('node:undici');
  } catch {
    try {
      return require('undici');
    } catch {
      return null;
    }
  }
}

async function fetchWithTlsEnvRelaxed(url, init) {
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    return await fetch(url, init);
  } finally {
    if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
  }
}

/**
 * GigaChat (Сбер): OAuth и chat API.
 * - GIGACHAT_TLS_INSECURE=1 — всегда без проверки сертификата (как раньше).
 * - По умолчанию для хостов Сбера — insecure TLS уже на первом запросе (Yandex Cloud Function).
 * - GIGACHAT_TLS_NO_AUTO_RELAX=1 — не ослаблять сразу; повтор только при cert error + INSECURE_ON_CERT_ERROR=1.
 * - GIGACHAT_TLS_INSECURE_ON_CERT_ERROR=1 — явно разрешить повтор, если авто отключили.
 */
let gigaInsecureDispatcher = null;
function getInsecureGigaDispatcher(undici) {
  if (!gigaInsecureDispatcher) {
    gigaInsecureDispatcher = new undici.Agent({ connect: { rejectUnauthorized: false } });
  }
  return gigaInsecureDispatcher;
}

async function fetchWithGigaTrustedCa(url, init) {
  const https = require('node:https');
  const tls = require('node:tls');
  const fs = require('node:fs');
  const ca = fs.readFileSync(require('node:path').join(__dirname, '../certs/russian-trusted-root-ca.crt'), 'utf8');
  const request = new Request(url, init);
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {method:request.method, headers:Object.fromEntries(request.headers), ca:[...tls.rootCertificates,ca], rejectUnauthorized:true}, res => {
      const chunks=[];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve(new Response([204,205,304].includes(res.statusCode) ? null : Buffer.concat(chunks), {status:res.statusCode, headers:res.headers})));
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('GigaChat request timed out')));
    if (body) req.write(body);
    req.end();
  });
}

async function gigaFetch(url, init) {
  if (isLikelyGigaChatOutboundUrl(url) && String(url).startsWith('https://')) return fetchWithGigaTrustedCa(url, init);
  const insecureFirst = shouldUseInsecureGigaTls(url, process.env);
  const undici = loadUndici();

  if (undici) {
    const run = (dispatcher) =>
      dispatcher ? undici.fetch(url, { ...init, dispatcher }) : undici.fetch(url, init);

    const dispatcher = insecureFirst ? getInsecureGigaDispatcher(undici) : null;
    try {
      return await run(dispatcher);
    } catch (e) {
      const msg = normalizeFetchError(e);
      if (dispatcher == null && shouldRelaxGigaTlsRetry(url, msg, process.env)) {
        return run(getInsecureGigaDispatcher(undici));
      }
      throw e;
    }
  }

  if (insecureFirst) {
    return fetchWithTlsEnvRelaxed(url, init);
  }

  try {
    return await fetch(url, init);
  } catch (e) {
    const msg = normalizeFetchError(e);
    if (shouldRelaxGigaTlsRetry(url, msg, process.env)) {
      return fetchWithTlsEnvRelaxed(url, init);
    }
    throw e;
  }
}

function isOpenAiUnsupportedRegion(status, detail) {
  if (Number(status) !== 403) return false;
  const d = String(detail || '').toLowerCase();
  return (
    d.includes('country') ||
    d.includes('region') ||
    d.includes('territory') ||
    d.includes('not supported') ||
    d.includes('unsupported_country')
  );
}

/** Ответ провайдера по лимиту частоты / квоте (для fallback на другой API). */
function isRateLimitFailure(res) {
  if (!res || res.ok) return false;
  const st = Number(res.status);
  if (st === 429) return true;
  const d = String(res.detail || '');
  return /(^|\s)429(\s|:|$)|rate limit|too many requests|resource_exhausted|quota|лимит/i.test(d);
}

/**
 * Следующая модель в цепочке OPENAI/OpenRouter: 429, лимиты free-tier, часто 403 Forbidden у OpenRouter.
 */
function shouldTryNextOpenAiModel(res) {
  if (!res || res.ok) return false;
  const st = Number(res.status);
  if (st === 429 || st === 402) return true;
  const d = String(res.detail || '').toLowerCase();
  if (/rate limit|too many|quota|free-models|free model|credits|exhausted|resource_exhausted|лимит/i.test(d)) {
    return true;
  }
  if (st === 400 || st === 404 || st === 408) return true;
  if (st === 403) {
    if (/forbidden|free-model|credit|429|quota|limit|add\s+\d+\s+credits/i.test(d)) return true;
    return true;
  }
  if (st >= 500 && st < 600) return true;
  if (st === 0 && /etimedout|econnreset|timeout|fetch failed/i.test(d)) return true;
  return false;
}

/**
 * Цепочка имён моделей: явная из вызова → OPENAI_MODEL → OPENAI_MODEL_FALLBACKS (через запятую).
 */
function buildOpenAiModelChain(explicitModel) {
  const seen = new Set();
  const out = [];
  const add = (m) => {
    const s = String(m ?? '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  add(explicitModel);
  add(process.env.OPENAI_MODEL);
  const raw = String(process.env.OPENAI_MODEL_FALLBACKS || process.env.LLM_MODEL_FALLBACKS || '').trim();
  for (const part of raw.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) add(part);
  if (out.length === 0) add(defaultChatModel());
  return out;
}

function normalizeApiKey(raw) {
  let s = String(raw ?? '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r/g, '').trim();
}

/** Снимает кавычки/переводы строк с вставленного секрета. Значение не логировать. */
function unwrapQuotedSecret(raw) {
  let s = normalizeApiKey(raw).replace(/\n/g, '').trim();
  s = s.replace(/^authorization\s*:\s*/i, '').trim();
  for (let i = 0; i < 3; i += 1) {
    if (
      s.length >= 2 &&
      ((s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'")) ||
        (s.startsWith('`') && s.endsWith('`')))
    ) {
      s = s.slice(1, -1).replace(/\n/g, '').trim();
      continue;
    }
    break;
  }
  return s;
}

/** Стандартный или URL-safe Base64 (в т.ч. без padding). Иначе null — не логировать s. */
function normalizeBase64Token(s) {
  if (!s || s.length < 4) return null;
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = t.length % 4;
  if (pad === 1) return null;
  const padded = pad ? t + '='.repeat(4 - pad) : t;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(padded)) return null;
  try {
    const buf = Buffer.from(padded, 'base64');
    if (!buf.length) return null;
    if (buf.toString('base64').replace(/=+$/, '') !== padded.replace(/=+$/, '')) return null;
    return padded;
  } catch {
    return null;
  }
}

function basicHeaderFromIdSecret(idSecret) {
  return `Basic ${Buffer.from(idSecret, 'utf8').toString('base64')}`;
}

function decodedUtf8FromBase64(b64) {
  try {
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

/** Сбер OAuth ждёт Basic → Base64(client_id:client_secret). */
function looksLikeClientIdSecret(s) {
  const i = String(s || '').indexOf(':');
  return i > 0 && i < String(s).length - 1;
}

/**
 * GIGACHAT_CREDENTIALS: Base64(id:secret), сырой id:secret, или уже `Basic …`.
 * Если после нормализации нет id:secret — null, чтобы взять CLIENT_ID+SECRET.
 */
function headerFromGigaChatCredentialsValue(raw) {
  let s = unwrapQuotedSecret(raw);
  if (!s) return null;
  for (let i = 0; i < 3 && /^(basic|bearer)\s+/i.test(s); i += 1) {
    s = unwrapQuotedSecret(s.replace(/^(basic|bearer)\s+/i, ''));
  }
  if (!s) return null;
  const b64 = normalizeBase64Token(s);
  if (b64) {
    return looksLikeClientIdSecret(decodedUtf8FromBase64(b64)) ? `Basic ${b64}` : null;
  }
  return looksLikeClientIdSecret(s) ? basicHeaderFromIdSecret(s) : null;
}

function headerFromGigaChatIdSecret(id, secret) {
  if (!id || !secret) return null;
  const secretB64 = normalizeBase64Token(secret);
  if (secretB64) {
    const decoded = decodedUtf8FromBase64(secretB64);
    if (decoded.startsWith(`${id}:`) && looksLikeClientIdSecret(decoded)) {
      return `Basic ${secretB64}`;
    }
  }
  return basicHeaderFromIdSecret(`${id}:${secret}`);
}

/** Ключ авторизации из кабинета GigaChat (Base64 от client_id:client_secret) или пара id+secret. */
function gigaChatAuthorizationHeader(env = process.env) {
  const fromCreds = headerFromGigaChatCredentialsValue(
    env.GIGACHAT_CREDENTIALS || env.GIGACHAT_AUTHORIZATION_KEY,
  );
  if (fromCreds) return fromCreds;
  return headerFromGigaChatIdSecret(
    unwrapQuotedSecret(env.GIGACHAT_CLIENT_ID),
    unwrapQuotedSecret(env.GIGACHAT_CLIENT_SECRET),
  );
}

function hasGigaChatCreds() {
  return Boolean(gigaChatAuthorizationHeader());
}

function gigaChatOAuthUrl() {
  return String(process.env.GIGACHAT_OAUTH_URL || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth').replace(
    /\/$/,
    '',
  );
}

function gigaChatChatBaseUrl() {
  return String(
    process.env.GIGACHAT_CHAT_BASE_URL || 'https://gigachat.devices.sberbank.ru/api/v1',
  ).replace(/\/$/, '');
}

let gigaChatTokenCache = { token: null, expiresAtMs: 0 };

/** Сбер выдаёт access_token на 30 минут — обновляем за минуту до истечения. */
const GIGA_TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const GIGA_TOKEN_REFRESH_SKEW_MS = 60 * 1000;

function gigaChatTokenExpiresAtMs(data, nowMs = Date.now()) {
  const skew = GIGA_TOKEN_REFRESH_SKEW_MS;
  if (data && typeof data.expires_at === 'number') {
    return data.expires_at * 1000 - skew;
  }
  if (data && typeof data.expires_in === 'number') {
    return nowMs + data.expires_in * 1000 - skew;
  }
  return nowMs + GIGA_TOKEN_LIFETIME_MS - skew;
}

async function getGigaChatAccessToken() {
  const now = Date.now();
  if (gigaChatTokenCache.token && now < gigaChatTokenCache.expiresAtMs) {
    return { ok: true, token: gigaChatTokenCache.token };
  }
  const authHeader = gigaChatAuthorizationHeader();
  if (!authHeader) {
    return {
      ok: false,
      kind: 'no_gigachat_key',
      status: 0,
      detail: 'Нет GIGACHAT_CREDENTIALS или GIGACHAT_CLIENT_ID+GIGACHAT_CLIENT_SECRET',
    };
  }
  const rqUid = crypto.randomUUID();
  const scope = String(process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS').trim();
  let r;
  try {
    r = await gigaFetch(gigaChatOAuthUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        RqUID: rqUid,
        Authorization: authHeader,
      },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
    });
  } catch (e) {
    return { ok: false, kind: 'gigachat_oauth_error', status: 0, detail: normalizeFetchError(e) };
  }

  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try {
      const errBody = await r.json();
      if (typeof errBody?.message === 'string') detail = `${detail}: ${errBody.message}`;
      else if (errBody?.error) detail = `${detail}: ${JSON.stringify(errBody.error)}`;
    } catch {
      /* keep */
    }
    return { ok: false, kind: 'gigachat_oauth_error', status: r.status, detail };
  }

  let data;
  try {
    data = await r.json();
  } catch (e) {
    return { ok: false, kind: 'gigachat_oauth_error', status: 200, detail: normalizeFetchError(e) };
  }
  const token = data.access_token;
  if (!token || typeof token !== 'string') {
    return {
      ok: false,
      kind: 'gigachat_oauth_error',
      status: 200,
      detail: 'Пустой access_token в ответе GigaChat OAuth',
    };
  }

  gigaChatTokenCache = { token, expiresAtMs: gigaChatTokenExpiresAtMs(data, Date.now()) };
  return { ok: true, token };
}

/**
 * GigaChat — OAuth, затем тот же контракт, что OpenAI /chat/completions.
 * @see https://developers.sber.ru/docs/ru/gigachat/api/overview
 */
async function fetchGigaChatChat(messages, { maxTokens, temperature, jsonObject, model }) {
  const tRes = await getGigaChatAccessToken();
  if (!tRes.ok) return tRes;

  let m = String(model || process.env.GIGACHAT_MODEL || 'GigaChat').trim();
  const dm = defaultChatModel();
  if (!m || m === dm || m === 'gpt-4o-mini' || m.startsWith('gpt-') || m.startsWith('@') || m.includes('/')) {
    m = process.env.GIGACHAT_MODEL || 'GigaChat';
  }

  const msgs = messages.map((x) => ({ ...x, content: String(x.content ?? '') }));
  if (jsonObject) {
    const sysJsonHint =
      '\n\nОтветь строго одним JSON-объектом в тексте сообщения, без markdown и без пояснений вокруг.';
    const sysIdx = msgs.findIndex((x) => x.role === 'system');
    if (sysIdx >= 0) {
      msgs[sysIdx] = { ...msgs[sysIdx], content: msgs[sysIdx].content + sysJsonHint };
    } else {
      msgs.unshift({ role: 'system', content: 'Ты отвечаешь только валидным JSON.' + sysJsonHint });
    }
  }

  const body = {
    model: m,
    messages: msgs,
    max_tokens: Math.min(maxTokens ?? 8192, 8192),
    temperature: temperature ?? 0.25,
  };

  let r;
  try {
    r = await gigaFetch(`${gigaChatChatBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tRes.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, kind: 'gigachat_error', status: 0, detail: normalizeFetchError(e) };
  }

  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try {
      const errBody = await r.json();
      if (errBody?.error?.message) detail = `${detail}: ${errBody.error.message}`;
      else if (typeof errBody?.message === 'string') detail = `${detail}: ${errBody.message}`;
    } catch {
      /* keep */
    }
    return { ok: false, kind: 'gigachat_error', status: r.status, detail };
  }

  let data;
  try {
    data = await r.json();
  } catch (e) {
    return { ok: false, kind: 'gigachat_error', status: 200, detail: normalizeFetchError(e) };
  }
  const extracted = extractOpenAiStyleAssistantText(data.choices?.[0]?.message);
  if (extracted.refusal) {
    return {
      ok: false,
      kind: 'gigachat_error',
      status: 200,
      detail: `GigaChat отказался ответить: ${extracted.refusal.slice(0, 400)}`,
    };
  }
  if (!extracted.text) {
    return { ok: false, kind: 'gigachat_error', status: 200, detail: 'Пустой ответ GigaChat' };
  }
  return { ok: true, text: extracted.text };
}

function openAiBaseUrl() {
  const raw = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/$/, '');
  return raw.endsWith('/v1') ? raw : `${raw}/v1`;
}

/** Закрытый контур Пульса (ai.primakov.school): json_object в response_format → HTTP 400. */
function isPulsePrimakovBaseUrl() {
  const b = String(process.env.OPENAI_BASE_URL || '').toLowerCase();
  return b.includes('primakov.school');
}

function applyJsonObjectCompat(jsonObject, baseUrl) {
  if (!jsonObject) return false;
  const base = String(baseUrl || process.env.OPENAI_BASE_URL || '').toLowerCase();
  if (base.includes('primakov.school')) return false;
  if (base.includes('openrouter.ai')) return false;
  if (base.includes('foundation-models.api.cloud.ru')) return false;
  return true;
}

/** OpenRouter рекомендует HTTP-Referer и X-Title для статистики (необязательно). */
function openRouterExtraHeaders() {
  const base = String(process.env.OPENAI_BASE_URL || '').toLowerCase();
  if (!base.includes('openrouter.ai')) return {};
  const out = {};
  const referer = String(
    process.env.OPENROUTER_HTTP_REFERER ||
      process.env.PUBLIC_APP_BASE ||
      'https://statisticsprimakov2.website.yandexcloud.net',
  ).trim();
  if (referer) out['HTTP-Referer'] = referer;
  const title = String(process.env.OPENROUTER_TITLE || process.env.OPENROUTER_APP_NAME || 'Pulse').trim();
  if (title) out['X-Title'] = title;
  return out;
}

/**
 * Человекочитаемое пояснение при геоблоке OpenAI.
 */
function formatGeoBlockHint(status, detail) {
  return [
    'Ответ сервера ИИ недоступен (часто HTTP 403 из-за региона или политики endpoint).',
    '',
    'Проверьте OPENAI_BASE_URL, OPENAI_API_KEY и доступность шлюза с Cloud Function.',
    '',
    `Технически: HTTP ${status} — ${detail}`,
  ].join('\n');
}

/**
 * Текст ассистента из ответа в стиле OpenAI: content строка или массив { type, text };
 * refusal; иногда пустой content при tool_calls.
 */
function extractOpenAiStyleAssistantText(message) {
  if (!message || typeof message !== 'object') {
    return { text: '', refusal: null, hasToolCalls: false };
  }
  const ref = message.refusal;
  if (typeof ref === 'string' && ref.trim()) {
    return { text: '', refusal: ref.trim(), hasToolCalls: false };
  }
  const c = message.content;
  if (typeof c === 'string') {
    return { text: c.trim(), refusal: null, hasToolCalls: false };
  }
  if (Array.isArray(c)) {
    const parts = [];
    for (const p of c) {
      if (!p || typeof p !== 'object') continue;
      if (typeof p.text === 'string' && p.text) parts.push(p.text);
    }
    return { text: parts.join('').trim(), refusal: null, hasToolCalls: false };
  }
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  return { text: '', refusal: null, hasToolCalls };
}

function resolveOpenAiBaseUrl(opts = {}) {
  const raw = String(opts.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
    .trim()
    .replace(/\/$/, '');
  return raw.endsWith('/v1') ? raw : `${raw}/v1`;
}

function openRouterExtraHeadersForBase(baseUrl) {
  const base = String(baseUrl || process.env.OPENAI_BASE_URL || '').toLowerCase();
  if (!base.includes('openrouter.ai')) return {};
  const out = {};
  const referer = String(
    process.env.OPENROUTER_HTTP_REFERER ||
      process.env.PUBLIC_APP_BASE ||
      'https://statisticsprimakov2.website.yandexcloud.net',
  ).trim();
  if (referer) out['HTTP-Referer'] = referer;
  const title = String(process.env.OPENROUTER_TITLE || process.env.OPENROUTER_APP_NAME || 'Pulse').trim();
  if (title) out['X-Title'] = title;
  return out;
}

/**
 * OpenAI-совместимый Authorization.
 * Cloud.ru Foundation Models OpenAPI: Bearer (как клиент openai). Не слать Yandex-стиль Api-Key.
 */
function openAiAuthorizationHeader(apiKey, opts = {}) {
  const key = unwrapQuotedSecret(apiKey);
  const scheme = String(opts.authScheme || '').trim().toLowerCase();
  if (scheme === 'api-key') return `Api-Key ${key}`;
  return `Bearer ${key}`;
}

function resolveOpenAiChatModel(model, baseUrl) {
  const raw = String(model || '').trim();
  if (isCloudRuFoundationModelsUrl(baseUrl)) return normalizeCloudRuFmModel(raw);
  return raw || defaultChatModel();
}

async function fetchOpenAIChatOnce(messages, { model, maxTokens, temperature, jsonObject, baseUrl, apiKey, authScheme }) {
  const key = unwrapQuotedSecret(apiKey || process.env.OPENAI_API_KEY || '');
  if (!key) return { ok: false, kind: 'no_openai_key', status: 0, detail: 'Нет OPENAI_API_KEY' };

  const url = `${resolveOpenAiBaseUrl({ baseUrl })}/chat/completions`;
  const body = {
    model: resolveOpenAiChatModel(model, baseUrl),
    messages,
    max_tokens: maxTokens ?? 3500,
    temperature: temperature ?? 0.25,
  };
  if (applyJsonObjectCompat(jsonObject, baseUrl)) body.response_format = { type: 'json_object' };

  const isOpenRouter = resolveOpenAiBaseUrl({ baseUrl }).includes('openrouter.ai');
  const attempt = async () => {
    const init = {
      method: 'POST',
      headers: {
        Authorization: openAiAuthorizationHeader(key, { authScheme, baseUrl }),
        'Content-Type': 'application/json',
        ...openRouterExtraHeadersForBase(baseUrl),
      },
      body: JSON.stringify(body),
    };
    if (isOpenRouter && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      init.signal = AbortSignal.timeout(22_000);
    }
    return fetch(url, init);
  };

  let r;
  try {
    r = await attempt();
    if (isOpenRouter && r && (r.status === 502 || r.status === 503 || r.status === 504)) {
      r = await attempt();
    }
  } catch (e) {
    return { ok: false, kind: 'openai_error', status: 0, detail: normalizeFetchError(e) };
  }

  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try {
      const errBody = await r.json();
      if (errBody?.error?.message) detail = `${detail}: ${errBody.error.message}`;
    } catch {
      /* keep */
    }
    return { ok: false, kind: 'openai_error', status: r.status, detail };
  }

  let data;
  try {
    data = await r.json();
  } catch (e) {
    return { ok: false, kind: 'openai_error', status: 200, detail: normalizeFetchError(e) };
  }
  const choice = data.choices?.[0];
  const msg = choice?.message;
  const extracted = extractOpenAiStyleAssistantText(msg);
  if (extracted.refusal) {
    return {
      ok: false,
      kind: 'openai_error',
      status: 200,
      detail: `ИИ отказался ответить: ${extracted.refusal.slice(0, 400)}`,
    };
  }
  if (extracted.hasToolCalls) {
    return {
      ok: false,
      kind: 'openai_error',
      status: 200,
      detail:
        'ИИ вернул вызов инструментов вместо текста. Отключите function calling для контура или измените конфигурацию сервера ИИ.',
    };
  }
  const text = extracted.text;
  if (!text) {
    const fr = choice?.finish_reason;
    return {
      ok: false,
      kind: 'openai_error',
      status: 200,
      detail: fr ? `Пустой ответ ИИ (finish_reason: ${fr})` : 'Пустой ответ ИИ',
    };
  }
  return { ok: true, text };
}

/** Несколько моделей подряд при лимите/403 у OpenRouter и т.п. */
async function fetchOpenAIChat(messages, opts = {}) {
  const explicit = String(opts.model ?? '').trim();
  const listed = Array.isArray(opts.models) ? opts.models.map((m) => String(m || '').trim()).filter(Boolean) : [];
  const chain =
    listed.length > 0
      ? [...new Set(listed)]
      : opts.singleModel && explicit
        ? [explicit]
        : buildOpenAiModelChain(opts.model);
  let last = { ok: false, kind: 'openai_error', status: 0, detail: 'Нет имён для перебора в цепочке' };
  const errors = [];
  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    const res = await fetchOpenAIChatOnce(messages, { ...opts, model: m });
    if (res.ok) return res;
    last = res;
    errors.push(`${m}: ${res.detail || res.kind || 'ошибка'}`);
    const tryNext = i < chain.length - 1 && shouldTryNextOpenAiModel(res);
    if (!tryNext) break;
  }
  if (chain.length > 1 && errors.length > 1) {
    last = {
      ...last,
      detail: `Перепробованы варианты (${chain.join(' → ')}). Последняя ошибка: ${last.detail}\n---\n${errors.join('\n')}`,
    };
  }
  return last;
}

function sanitizeChatMessages(messages, opts = {}) {
  if (!Array.isArray(messages)) return { ok: true, messages };
  const out = [];
  for (const m of messages) {
    if (!m || typeof m.content !== 'string') {
      out.push(m);
      continue;
    }
    const check = sanitizeForExternalAi(m.content, {
      purpose: opts.purpose || 'llm_chat',
      userId: opts.userId,
      enforceProvider: false,
      silent: true,
    });
    if (!check.ok) {
      return {
        ok: false,
        kind: 'pii_blocked',
        status: 0,
        detail: check.message || check.error || 'pii_blocked',
      };
    }
    out.push({ ...m, content: check.text });
  }
  return { ok: true, messages: out };
}

async function chatCompletion(messages, opts = {}) {
  // PII-SAFE: every outbound chat payload is sanitized here.
  const safe = sanitizeChatMessages(messages, opts);
  if (!safe.ok) return safe;
  const gate = await assertAiUsageAllowed(opts);
  if (!gate.ok) return gate;
  try {
    const res = await runChatCompletion(safe.messages, opts);
    void logAiUsage(opts, res);
    return res;
  } catch (e) {
    return { ok: false, kind: 'network', status: 0, detail: normalizeFetchError(e) };
  }
}

/**
 * @param {Array<{role:string,content:string}>} messages
 * @param {{ model?: string, maxTokens?: number, temperature?: number, jsonObject?: boolean, providerPreference?: string | null }} opts
 * opts.providerPreference — явный выбор из UI: только этот провайдер (без fallback на другие API).
 */
async function runChatCompletion(messages, opts = {}) {
  const explicitPrefRaw = opts.providerPreference;
  const hasExplicitPref =
    explicitPrefRaw != null && String(explicitPrefRaw).trim() !== '';
  const prefExplicit = hasExplicitPref
    ? String(explicitPrefRaw).trim().toLowerCase()
    : null;

  if (hasExplicitPref && prefExplicit) {
    if (prefExplicit === 'yandex' || prefExplicit === 'yc' || prefExplicit === 'yandexgpt') {
      return {
        ok: false,
        kind: 'no_key',
        status: 0,
        detail:
          'ЯндексGPT выключен. Используйте закрытый контур Пульса (OPENAI_*) или OpenRouter (AUDIO_PROTOCOL_LLM_*).',
      };
    }
    if (prefExplicit === 'gigachat' || prefExplicit === 'sber') {
      if (!hasGigaChatCreds()) {
        return {
          ok: false,
          kind: 'no_key',
          status: 0,
          detail:
            'Выбран GigaChat, но не заданы GIGACHAT_CREDENTIALS (или GIGACHAT_CLIENT_ID + GIGACHAT_CLIENT_SECRET).',
        };
      }
      const g = await fetchGigaChatChat(messages, opts);
      return g.ok ? { ...g, provider: 'gigachat' } : g;
    }
    if (prefExplicit === 'openai' || prefExplicit === 'openrouter') {
      const openAiKey = String(opts.apiKey || process.env.OPENAI_API_KEY || '').trim();
      if (!openAiKey) {
      return {
        ok: false,
        kind: 'no_key',
        status: 0,
        detail:
          'Не задан API-ключ (OPENAI_API_KEY или AUDIO_PROTOCOL_LLM_API_KEY). См. BACKEND_AND_API.md.',
      };
      }
      const oa = await fetchOpenAIChat(messages, opts);
      return oa.ok ? { ...oa, provider: 'openai' } : { ...oa, provider: 'openai' };
    }
  }

  const provider = String(process.env.LLM_PROVIDER || 'auto').trim().toLowerCase();
  const tryGigaChatFirst = provider === 'gigachat' || provider === 'sber';

  if (tryGigaChatFirst) {
    if (!hasGigaChatCreds()) {
      return {
        ok: false,
        kind: 'no_key',
        detail:
          'Задано LLM_PROVIDER=gigachat, но нет GIGACHAT_CREDENTIALS (или GIGACHAT_CLIENT_ID + GIGACHAT_CLIENT_SECRET).',
      };
    }
    const g = await fetchGigaChatChat(messages, opts);
    if (g.ok) return { ...g, provider: 'gigachat' };
    if (isRateLimitFailure(g) && process.env.OPENAI_API_KEY) {
      const oa = await fetchOpenAIChat(messages, opts);
      if (oa.ok) return { ...oa, provider: 'openai' };
    }
    return g;
  }

  if (process.env.OPENAI_API_KEY) {
    const oa = await fetchOpenAIChat(messages, opts);
    if (oa.ok) return { ...oa, provider: 'openai' };
    if (provider === 'auto' && hasGigaChatCreds()) {
      const g = await fetchGigaChatChat(messages, opts);
      if (g.ok) return { ...g, provider: 'gigachat' };
    }
    return { ...oa, provider: 'openai' };
  }

  if (hasGigaChatCreds()) {
    const g = await fetchGigaChatChat(messages, opts);
    if (g.ok) return { ...g, provider: 'gigachat' };
    return g;
  }

  return {
    ok: false,
    kind: 'no_key',
      detail:
        'Не настроен доступ к ИИ: задайте контур Пульса (OPENAI_API_KEY и OPENAI_BASE_URL) или см. альтернативы в BACKEND_AND_API.md.',
  };
}

module.exports = {
  getGigaChatAccessToken,
  gigaFetch,
  gigaChatChatBaseUrl,
  fetchGigaChatChat,
  chatCompletion,
  isOpenAiUnsupportedRegion,
  formatGeoBlockHint,
  hasGigaChatCreds,
  gigaChatAuthorizationHeader,
  gigaChatTokenExpiresAtMs,
  isRateLimitFailure,
  isPulsePrimakovBaseUrl,
  applyJsonObjectCompat,
  openAiAuthorizationHeader,
  resolveOpenAiChatModel,
  collectFetchErrorText,
  isLikelyGigaChatOutboundUrl,
  isTlsCertChainOrVerifyErrorMessage,
  shouldRelaxGigaTlsRetry,
  shouldUseInsecureGigaTls,
};
