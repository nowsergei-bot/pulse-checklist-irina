const crypto = require('crypto');

function getHeader(event, name) {
  const target = name.toLowerCase();
  const h = event.headers || {};
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === target) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  const mh = event.multiValueHeaders || {};
  for (const [k, arr] of Object.entries(mh)) {
    if (k.toLowerCase() === target && arr && arr.length) {
      return arr[0];
    }
  }
  return '';
}

function safeEqualSecret(actual, expected) {
  const a = Buffer.from(String(actual || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (!a.length || !b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const ADMIN_AUTH_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_AUTH_MAX_FAILURES = 8;
const adminAuthFailures = new Map();

function clientIp(event) {
  const fwd = String(getHeader(event, 'x-forwarded-for') || '')
    .split(',')[0]
    .trim();
  if (fwd) return fwd;
  const real = String(getHeader(event, 'x-real-ip') || '').trim();
  if (real) return real;
  return 'unknown';
}

function isAdminAuthRateLimited(event) {
  const ip = clientIp(event);
  const rec = adminAuthFailures.get(ip);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) {
    adminAuthFailures.delete(ip);
    return false;
  }
  return rec.count >= ADMIN_AUTH_MAX_FAILURES;
}

function recordAdminAuthFailure(event) {
  if (event && event._adminKeyFailRecorded) return;
  if (event) event._adminKeyFailRecorded = true;
  const ip = clientIp(event);
  const now = Date.now();
  const rec = adminAuthFailures.get(ip);
  if (!rec || now > rec.resetAt) {
    adminAuthFailures.set(ip, { count: 1, resetAt: now + ADMIN_AUTH_WINDOW_MS });
    return;
  }
  rec.count += 1;
}

function clearAdminAuthFailures(event) {
  adminAuthFailures.delete(clientIp(event));
}

function resetAdminAuthRateLimitForTests() {
  adminAuthFailures.clear();
}

function isAdminApiKey(event) {
  const expected = String(process.env.ADMIN_API_KEY || '');
  const actual = String(getHeader(event, 'X-Api-Key') || getHeader(event, 'x-api-key') || '').trim();
  if (!expected || !actual) return false;
  if (isAdminAuthRateLimited(event)) return false;
  const ok = safeEqualSecret(actual, expected);
  if (!ok) recordAdminAuthFailure(event);
  else clearAdminAuthFailures(event);
  return ok;
}

function parseBearerToken(event) {
  const raw = String(getHeader(event, 'Authorization') || getHeader(event, 'authorization') || '').trim();
  if (!raw) return '';
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? String(m[1]).trim() : '';
}

module.exports = {
  isAdminApiKey,
  parseBearerToken,
  getHeader,
  safeEqualSecret,
  isAdminAuthRateLimited,
  resetAdminAuthRateLimitForTests,
  ADMIN_AUTH_MAX_FAILURES,
};
