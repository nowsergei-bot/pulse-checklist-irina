const crypto = require('crypto');

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const s = String(stored || '');
  const parts = s.split('$');
  if (parts.length !== 3) return false;
  const [alg, saltHex, keyHex] = parts;
  if (alg !== 'scrypt') return false;
  const salt = Buffer.from(saltHex, 'hex');
  const key = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(String(password), salt, key.length, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return crypto.timingSafeEqual(key, derived);
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'password1234',
  '123456789012',
  '1234567890',
  'qwertyuiopas',
  'qwerty123456',
  'adminadmin12',
  'letmein12345',
  'welcome12345',
  'primakov2024',
  'primakov2025',
  'primakov2026',
  'гимназия1234',
]);

function assertLocalPassword(password) {
  const p = String(password || '');
  if (p.length < 12) return { ok: false, error: 'Пароль: минимум 12 символов' };
  if (COMMON_PASSWORDS.has(p.toLowerCase())) return { ok: false, error: 'Пароль слишком простой' };
  return { ok: true };
}

function sessionTtlDays(env = process.env) {
  const n = Number(env.SESSION_TTL_DAYS || 3650);
  if (!Number.isFinite(n) || n < 1) return 3650;
  return Math.min(3650, Math.floor(n));
}

function sessionExpiresAt(now = Date.now(), env = process.env) {
  return new Date(now + sessionTtlDays(env) * 24 * 60 * 60 * 1000);
}

module.exports = {
  hashPassword,
  verifyPassword,
  newSessionToken,
  tokenHash,
  assertLocalPassword,
  sessionTtlDays,
  sessionExpiresAt,
};
