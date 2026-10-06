const nodemailer = require('nodemailer');

/**
 * @returns {null | {
 *   host: string,
 *   port: number,
 *   secure: boolean,
 *   auth?: { user: string, pass: string },
 *   from: string,
 *   requireTLS: boolean,
 *   tls?: { rejectUnauthorized: boolean },
 *   connectionTimeout: number,
 * }}
 */
function smtpConfigFromEnv() {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || '587');
  const user = (process.env.SMTP_USER || '').trim();
  const pass = process.env.SMTP_PASS || '';
  const from = (process.env.SMTP_FROM || user || '').trim();
  const secureRaw = String(process.env.SMTP_SECURE || '').trim().toLowerCase();
  let secure = secureRaw === '1' || secureRaw === 'true' || secureRaw === 'yes';
  if (secureRaw === '' && port === 465) {
    secure = true;
  }

  if (!host || !Number.isFinite(port) || !from) return null;
  const auth = user ? { user, pass } : undefined;

  const requireTlsRaw = String(process.env.SMTP_REQUIRE_TLS || '').trim().toLowerCase();
  const requireTLS =
    !secure &&
    port === 587 &&
    requireTlsRaw !== '0' &&
    requireTlsRaw !== 'false' &&
    requireTlsRaw !== 'no';

  const tlsRejectRaw = String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED ?? '1').trim().toLowerCase();
  const tlsInsecureRequested =
    tlsRejectRaw === '0' || tlsRejectRaw === 'false' || tlsRejectRaw === 'no';
  const production = String(process.env.NODE_ENV || '') === 'production';
  if (tlsInsecureRequested && production) {
    console.warn('SMTP_TLS_REJECT_UNAUTHORIZED insecure flag ignored when NODE_ENV=production');
  } else if (tlsInsecureRequested) {
    console.warn('SMTP_TLS_REJECT_UNAUTHORIZED is off — SMTP certificate is not verified');
  }
  const tls =
    tlsInsecureRequested && !production ? { rejectUnauthorized: false } : undefined;

  const connectionTimeout = Math.min(
    Math.max(Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 20000) || 20000, 5000),
    120000,
  );

  return { host, port, secure, auth, from, requireTLS, tls, connectionTimeout };
}

function sanitizeMailHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function makeTransport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    requireTLS: cfg.requireTLS,
    tls: cfg.tls,
    connectionTimeout: cfg.connectionTimeout,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

function isSmtpConfigured() {
  return smtpConfigFromEnv() != null;
}

function smtpNotConfiguredError() {
  const err = new Error('SMTP is not configured');
  err.code = 'SMTP_NOT_CONFIGURED';
  return err;
}

/** @param {{ to: string, subject: string, html: string, text?: string, attachments?: Array<{ filename: string, content: Buffer, contentType?: string }> }} opts */
async function sendHtmlEmail({ to, subject, html, text, attachments }) {
  const [info] = await sendHtmlEmailBatch([{ to, subject, html, text, attachments }]);
  return info;
}

/**
 * One SMTP connection for several letters — important in Cloud Functions.
 * @param {Array<{ to: string, subject: string, html: string, text?: string, attachments?: Array<{ filename: string, content: Buffer, contentType?: string }> }>} messages
 */
async function sendHtmlEmailBatch(messages) {
  const cfg = smtpConfigFromEnv();
  if (!cfg) throw smtpNotConfiguredError();
  const transport = makeTransport(cfg);
  try {
    const out = [];
    for (const msg of messages) {
      const subject = sanitizeMailHeader(msg.subject);
      const attachments = Array.isArray(msg.attachments)
        ? msg.attachments.map((a) => ({
            ...a,
            filename: sanitizeMailHeader(a && a.filename),
          }))
        : undefined;
      const info = await transport.sendMail({
        from: sanitizeMailHeader(cfg.from),
        to: sanitizeMailHeader(msg.to),
        subject,
        html: msg.html,
        text: msg.text || undefined,
        attachments: attachments && attachments.length ? attachments : undefined,
      });
      console.log('smtp sent', { subject, messageId: info?.messageId, response: info?.response });
      out.push(info);
    }
    return out;
  } finally {
    transport.close();
  }
}

async function sendInviteEmail({ to, subject, html }) {
  return sendHtmlEmail({ to, subject, html });
}

module.exports = {
  smtpConfigFromEnv,
  isSmtpConfigured,
  sendHtmlEmail,
  sendHtmlEmailBatch,
  sendInviteEmail,
  sanitizeMailHeader,
};

