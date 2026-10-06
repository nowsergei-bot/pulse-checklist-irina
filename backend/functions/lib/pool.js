const { Pool } = require('pg');
const { poolQueryWithRetry } = require('./pg-query');

let pool;

/** Если в URI нет sslmode=, добавляем require (Neon, многие облачные Postgres). */
function ensureSslModeRequire(connectionString) {
  if (!connectionString || /sslmode=/i.test(connectionString)) {
    return connectionString;
  }
  const hostNeedsDefaultSsl =
    /neon\.tech|supabase\.co|pooler\.supabase|yandexcloud\.net|amazonaws\.com/i.test(connectionString);
  if (!hostNeedsDefaultSsl) {
    return connectionString;
  }
  return connectionString.includes('?')
    ? `${connectionString}&sslmode=require`
    : `${connectionString}?sslmode=require`;
}

function logTarget(connectionString) {
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, 'http:'));
    const db = (u.pathname || '').replace(/^\//, '') || '(no db in path)';
    console.log(`[pg] target host=${u.hostname} database=${db}`);
  } catch {
    console.log('[pg] could not parse PG_CONNECTION_STRING (check format)');
  }
}

function getPool() {
  if (!pool) {
    let connectionString = process.env.PG_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('PG_CONNECTION_STRING is not set');
    }
    connectionString = ensureSslModeRequire(connectionString.trim());
    logTarget(connectionString);

    const production = String(process.env.NODE_ENV || '') === 'production';
    const tlsInsecureRequested = process.env.PG_SSL_REJECT_UNAUTHORIZED === 'false';
    if (tlsInsecureRequested && production) {
      console.warn('PG_SSL_REJECT_UNAUTHORIZED=false ignored when NODE_ENV=production');
    } else if (tlsInsecureRequested) {
      console.warn('PG_SSL_REJECT_UNAUTHORIZED=false — TLS certificate is not verified');
    }
    const useSsl =
      process.env.PG_SSL === 'false'
        ? false
        : { rejectUnauthorized: !(tlsInsecureRequested && !production) };

    const maxConn = parseInt(String(process.env.PG_POOL_MAX || '4').trim(), 10);
    const connectTimeoutRaw = parseInt(String(process.env.PG_CONNECTION_TIMEOUT_MS || '20000').trim(), 10);
    const connectionTimeoutMillis =
      Number.isFinite(connectTimeoutRaw) && connectTimeoutRaw >= 1000 && connectTimeoutRaw <= 120000
        ? connectTimeoutRaw
        : 20000;
    pool = new Pool({
      connectionString,
      max: Number.isFinite(maxConn) && maxConn >= 1 && maxConn <= 20 ? maxConn : 4,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis,
      keepAlive: true,
      ssl: useSsl,
    });
    pool.on('error', (err) => {
      console.error('[pg] idle client error', err?.message || err);
    });
    const origQuery = pool.query.bind(pool);
    const poolRetries = parseInt(String(process.env.PG_QUERY_RETRIES || '2').trim(), 10);
    pool.query = (...args) =>
      poolQueryWithRetry(() => origQuery(...args), {
        retries: Number.isFinite(poolRetries) && poolRetries >= 0 ? poolRetries : 2,
      });
  }
  return pool;
}

module.exports = { getPool };
