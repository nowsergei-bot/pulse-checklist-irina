/**
 * Повтор transient-ошибок Postgres (Neon, pooler, обрыв SSL).
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function errorText(err) {
  if (!err) return '';
  const parts = [err.message, err.code, err.detail, err.hint].filter(Boolean).map(String);
  if (err.cause instanceof Error) parts.push(err.cause.message);
  return parts.join(' ').toLowerCase();
}

/** Ошибки, при которых имеет смысл повторить запрос на свежем соединении из пула. */
function isTransientPgError(err) {
  const t = errorText(err);
  if (!t) return false;
  if (
    /connection terminated unexpectedly|connection terminated|server closed the connection unexpectedly|server closed the connection|connection reset|econnreset|econnrefused|etimedout|timeout expired|query read timeout|client_idle_timeout|ssl syscall|broken pipe|can't reach database|too many connections|remaining connection slots|terminating connection|admin_shutdown|57p01|57p03|08003|08006|08001|08004|53300|xx000/i.test(
      t,
    )
  ) {
    return true;
  }
  const code = String(err?.code || '').toUpperCase();
  return code === '57P01' || code === '57P03' || code === '08003' || code === '08006' || code === '08001';
}

/**
 * @param {() => Promise<import('pg').QueryResult>} run
 * @param {{ retries?: number; baseDelayMs?: number }} [opts]
 */
async function poolQueryWithRetry(run, opts = {}) {
  const retries = Number.isFinite(opts.retries) ? opts.retries : 2;
  const baseDelayMs = Number.isFinite(opts.baseDelayMs) ? opts.baseDelayMs : 250;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await run();
    } catch (e) {
      lastErr = e;
      if (attempt >= retries || !isTransientPgError(e)) throw e;
      await sleep(baseDelayMs * (attempt + 1));
    }
  }
  throw lastErr;
}

/** Ответ для POST ai-insights вместо сырого Internal error. */
function mapAiInsightsDbError(err) {
  const msg = String(err?.message || err || '').trim();
  if (isTransientPgError(err)) {
    return {
      status: 503,
      body: {
        error: 'database_unavailable',
        message:
          'Временная ошибка базы данных. Подождите 10–20 секунд и нажмите «Обновить аналитику» ещё раз. Если опрос очень большой — сузьте срез фильтром.',
        detail: msg,
      },
    };
  }
  if (/timeout|timed out|etimedout|deadline exceeded/i.test(msg)) {
    return {
      status: 504,
      body: {
        error: 'timeout',
        message:
          'Запрос занял слишком много времени. Попробуйте сузить срез фильтром или повторите позже.',
        detail: msg,
      },
    };
  }
  return null;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} text
 * @param {unknown[]} [values]
 * @param {{ attempts?: number; retries?: number; baseDelayMs?: number }} [opts]
 */
async function queryWithRetry(pool, text, values = [], opts = {}) {
  const attempts = Number(opts.attempts);
  const retries = Number.isFinite(attempts) && attempts >= 1 ? attempts - 1 : opts.retries ?? 2;
  const baseDelayMs = Number.isFinite(opts.baseDelayMs) ? opts.baseDelayMs : 250;
  return poolQueryWithRetry(() => pool.query(text, values), { retries, baseDelayMs });
}

module.exports = {
  isTransientPgError,
  poolQueryWithRetry,
  queryWithRetry,
  mapAiInsightsDbError,
  sleep,
};
