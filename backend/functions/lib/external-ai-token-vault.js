'use strict';

const crypto = require('crypto');

/** HMAC → token. Never stores raw FIO. Mapping is not exported to clients or LLM. */
const memory = new Map();
let schemaReady = false;

function vaultSecret() {
  const dedicated = String(process.env.TOKEN_VAULT_SECRET || '').trim();
  if (dedicated) return dedicated;
  const fallback = String(process.env.SESSION_SECRET || process.env.OAUTH2_STATE_SECRET || '').trim();
  return fallback;
}

function hasVaultSecret() {
  return Boolean(vaultSecret());
}

function normalizeIdentity(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hashIdentity(kind, raw) {
  const secret = vaultSecret();
  if (!secret) return null;
  const norm = normalizeIdentity(raw);
  if (!norm) return null;
  return crypto.createHmac('sha256', secret).update(`${kind}|${norm}`).digest('hex');
}

function tokenPrefix(kind) {
  if (kind === 'child') return 'STUDENT';
  if (kind === 'staff') return 'STAFF';
  return 'ID';
}

function tokenFromHash(kind, hex) {
  return `${tokenPrefix(kind)}_${hex.slice(0, 8).toUpperCase()}`;
}

/**
 * Stable token for an identity. Vendor cannot reverse without the server secret.
 * @returns {string|null}
 */
function vaultTokenFor(kind, raw) {
  const hex = hashIdentity(kind, raw);
  if (!hex) return null;
  const token = tokenFromHash(kind, hex);
  if (!memory.has(hex)) {
    memory.set(hex, { token, kind, createdAt: Date.now() });
  }
  return token;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace known identities (longest first). Does not return the mapping.
 * @param {string} text
 * @param {Array<{ kind?: string, value: string }>} identities
 */
function replaceIdentities(text, identities) {
  const raw = String(text || '');
  const list = Array.isArray(identities)
    ? identities
      .map((item) => ({
        kind: item && item.kind === 'staff' ? 'staff' : 'child',
        value: String(item?.value || item?.fio || item?.name || '').trim(),
      }))
      .filter((item) => item.value.length >= 3)
      .sort((a, b) => b.value.length - a.value.length)
    : [];
  if (!list.length) return { text: raw, replaced: 0, applied: false };
  if (!hasVaultSecret()) return { text: raw, replaced: 0, applied: false, unsafe: true };

  let out = raw;
  let replaced = 0;
  for (const item of list) {
    const token = vaultTokenFor(item.kind, item.value);
    if (!token) continue;
    const re = new RegExp(escapeRegExp(item.value), 'gi');
    const next = out.replace(re, token);
    if (next !== out) replaced += 1;
    out = next;
  }
  return { text: out, replaced, applied: replaced > 0 };
}

async function ensureVaultSchema(pool) {
  if (!pool || schemaReady) return schemaReady;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS external_ai_token_vault (
        hash_key TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    schemaReady = true;
  } catch {
    schemaReady = false;
  }
  return schemaReady;
}

/** Persist HMAC→token only. Never write raw names. Best-effort. */
async function persistVaultTokens(pool, kind, values) {
  if (!pool || !hasVaultSecret()) return 0;
  const list = Array.isArray(values) ? values : [];
  if (!list.length) return 0;
  const ready = await ensureVaultSchema(pool);
  if (!ready) return 0;
  let n = 0;
  for (const value of list) {
    const hex = hashIdentity(kind, value);
    const token = hex ? tokenFromHash(kind, hex) : null;
    if (!hex || !token) continue;
    try {
      await pool.query(
        `INSERT INTO external_ai_token_vault (hash_key, token, kind)
         VALUES ($1, $2, $3)
         ON CONFLICT (hash_key) DO NOTHING`,
        [hex, token, kind],
      );
      n += 1;
    } catch {
      /* table may be missing or read-only; in-process map still works */
    }
  }
  return n;
}

function _resetMemoryForTests() {
  memory.clear();
  schemaReady = false;
}

module.exports = {
  hasVaultSecret,
  vaultTokenFor,
  replaceIdentities,
  ensureVaultSchema,
  persistVaultTokens,
  _resetMemoryForTests,
};
