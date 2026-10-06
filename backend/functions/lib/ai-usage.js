'use strict';

const DEFAULT_HOURLY = 40;

function hourlyLimit(env = process.env) {
  const n = Number(String(env.AI_USAGE_HOURLY_LIMIT || DEFAULT_HOURLY).trim());
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : DEFAULT_HOURLY;
}

function usageSubject(opts) {
  const uid = Number(opts && (opts.usageUserId || opts.userId));
  if (Number.isInteger(uid) && uid > 0) return { userId: uid, key: `user:${uid}` };
  return { userId: null, key: 'anon' };
}

function tokensFromResult(res) {
  const usage = res && res.usage;
  if (!usage || typeof usage !== 'object') return 0;
  const total = Number(usage.total_tokens || usage.totalTokens || 0);
  if (Number.isFinite(total) && total > 0) return Math.round(total);
  const prompt = Number(usage.prompt_tokens || 0);
  const completion = Number(usage.completion_tokens || 0);
  const sum = (Number.isFinite(prompt) ? prompt : 0) + (Number.isFinite(completion) ? completion : 0);
  return sum > 0 ? Math.round(sum) : 0;
}

async function ensureAiUsageTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER,
      kind TEXT NOT NULL DEFAULT 'chat',
      tokens INTEGER NOT NULL DEFAULT 0,
      cost_est NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage (created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON ai_usage (user_id, created_at DESC)`);
}

async function assertAiUsageAllowed(opts = {}, env = process.env, deps = {}) {
  if (!String(env.PG_CONNECTION_STRING || '').trim()) return { ok: true, skipped: true };
  const getPool = deps.getPool || (() => require('./pool').getPool());
  let pool;
  try {
    pool = getPool();
  } catch {
    return { ok: true, skipped: true };
  }
  const { userId } = usageSubject(opts);
  const limit = hourlyLimit(env);
  try {
    await ensureAiUsageTable(pool);
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM ai_usage
       WHERE created_at > NOW() - INTERVAL '1 hour'
         AND (
           ($1::int IS NOT NULL AND user_id = $1)
           OR ($1::int IS NULL AND user_id IS NULL)
         )`,
      [userId],
    );
    const n = Number(r.rows[0] && r.rows[0].n) || 0;
    if (n >= limit) {
      return {
        ok: false,
        kind: 'rate_limit',
        status: 429,
        detail: 'Слишком много запросов к модели. Подождите час.',
      };
    }
    return { ok: true, used: n, limit };
  } catch (err) {
    console.warn('ai_usage gate skipped', err && err.message ? err.message : err);
    return { ok: true, skipped: true };
  }
}

async function logAiUsage(opts = {}, res = {}, env = process.env, deps = {}) {
  if (!res || !res.ok) return;
  if (!String(env.PG_CONNECTION_STRING || '').trim()) return;
  const getPool = deps.getPool || (() => require('./pool').getPool());
  let pool;
  try {
    pool = getPool();
  } catch {
    return;
  }
  const { userId } = usageSubject(opts);
  const kind = String((opts && opts.usageKind) || res.provider || 'chat').slice(0, 40);
  const tokens = tokensFromResult(res);
  try {
    await ensureAiUsageTable(pool);
    await pool.query(
      `INSERT INTO ai_usage (user_id, kind, tokens, cost_est) VALUES ($1, $2, $3, NULL)`,
      [userId, kind, tokens],
    );
  } catch (err) {
    console.warn('ai_usage log skipped', err && err.message ? err.message : err);
  }
}

module.exports = {
  hourlyLimit,
  usageSubject,
  tokensFromResult,
  assertAiUsageAllowed,
  logAiUsage,
};
