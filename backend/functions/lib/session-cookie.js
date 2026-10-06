const crypto = require('crypto');
const { getHeader, parseBearerToken } = require('./auth');

const SESSION_COOKIE = 'pulse_session';
const CSRF_COOKIE = 'pulse_csrf';
const CSRF_HEADER = 'x-csrf-token';

function parseCookieHeader(raw) {
  const out = {};
  for (const part of String(raw || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function cookiesFromEvent(event) {
  return parseCookieHeader(getHeader(event, 'cookie'));
}

function parseSessionCookie(event) {
  const cookies = cookiesFromEvent(event);
  return String(cookies[SESSION_COOKIE] || '').trim();
}

function parseCsrfCookie(event) {
  const cookies = cookiesFromEvent(event);
  return String(cookies[CSRF_COOKIE] || '').trim();
}

function requestIsHttps(event) {
  const proto = String(getHeader(event, 'x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (proto === 'https') return true;
  if (proto === 'http') return false;
  const host = String(getHeader(event, 'host') || '').toLowerCase();
  return !host.startsWith('localhost') && !host.startsWith('127.0.0.1');
}

function cookieSameSite(event) {
  const forced = String(process.env.SESSION_COOKIE_SAMESITE || '').trim();
  if (forced) return forced;
  return requestIsHttps(event) ? 'None' : 'Lax';
}

function cookieSecure(event) {
  if (String(process.env.SESSION_COOKIE_SECURE || '').trim() === '0') return false;
  return requestIsHttps(event) || cookieSameSite(event) === 'None';
}

function formatCookie(name, value, { maxAgeSec, httpOnly, event }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/'];
  if (httpOnly) parts.push('HttpOnly');
  if (cookieSecure(event)) parts.push('Secure');
  parts.push(`SameSite=${cookieSameSite(event)}`);
  if (maxAgeSec != null) {
    parts.push(`Max-Age=${Math.max(0, Number(maxAgeSec) || 0)}`);
    if (!maxAgeSec) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  }
  return parts.join('; ');
}

function newCsrfToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function sessionTtlSeconds() {
  const ttlDays = Number(process.env.SESSION_TTL_DAYS || 3650);
  return Math.max(1, ttlDays) * 24 * 60 * 60;
}

function sessionCookieHeaders(event, token, csrf) {
  const maxAgeSec = sessionTtlSeconds();
  return [
    formatCookie(SESSION_COOKIE, token, { maxAgeSec, httpOnly: true, event }),
    formatCookie(CSRF_COOKIE, csrf, { maxAgeSec, httpOnly: false, event }),
  ];
}

function clearSessionCookieHeaders(event) {
  return [
    formatCookie(SESSION_COOKIE, '', { maxAgeSec: 0, httpOnly: true, event }),
    formatCookie(CSRF_COOKIE, '', { maxAgeSec: 0, httpOnly: false, event }),
  ];
}

function csrfHeaderFromEvent(event) {
  return String(getHeader(event, CSRF_HEADER) || getHeader(event, 'X-CSRF-Token') || '').trim();
}

function mutatingMethod(method) {
  const m = String(method || '').toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

/**
 * Cookie sessions need CSRF on mutating requests.
 * Bearer / admin-key scripts skip CSRF so CI and local tools keep working.
 */
function assertCookieCsrf(event, method) {
  if (!mutatingMethod(method)) return { ok: true };
  if (parseBearerToken(event)) return { ok: true };
  const cookieToken = parseSessionCookie(event);
  if (!cookieToken) return { ok: true };
  const cookieCsrf = parseCsrfCookie(event);
  const headerCsrf = csrfHeaderFromEvent(event);
  if (!cookieCsrf || !headerCsrf || cookieCsrf !== headerCsrf) {
    return { ok: false, code: 403, error: 'csrf_failed' };
  }
  return { ok: true };
}

function attachSetCookies(res, cookies) {
  if (!res || !cookies || !cookies.length) return res;
  const headers = { ...(res.headers || {}) };
  delete headers['Set-Cookie'];
  return {
    ...res,
    headers,
    multiValueHeaders: {
      ...(res.multiValueHeaders || {}),
      'Set-Cookie': cookies,
    },
  };
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  CSRF_HEADER,
  parseCookieHeader,
  cookiesFromEvent,
  parseSessionCookie,
  parseCsrfCookie,
  newCsrfToken,
  sessionCookieHeaders,
  clearSessionCookieHeaders,
  assertCookieCsrf,
  attachSetCookies,
  sessionTtlSeconds,
};
