'use strict';

const { hasVaultSecret, replaceIdentities, vaultTokenFor } = require('./external-ai-token-vault');

/** Cyrillic-safe edges. Do not use \\b — it does not treat Cyrillic as word chars. */
const L = '(?<![А-Яа-яЁёA-Za-z0-9])';
const R = '(?![А-Яа-яЁёA-Za-z0-9])';

const FINANCE_RE = new RegExp(
  `${L}(?:оплат[а-яё]*|задолженност[а-яё]*|платеж[а-яё]*|платёж[а-яё]*|квитанц[а-яё]*|банковск[а-яё]*|iban|расчетн[а-яё]*\\s+счет[а-яё]*)${R}`,
  'i',
);
const DOCUMENT_RE = new RegExp(
  `${L}(?:паспорт[а-яё]*|снилс|инн)${R}|\\bmesh[\\s_-]?id\\b|${L}мэш${R}`,
  'i',
);
const PARENT_RE = new RegExp(
  `${L}(?:родител[а-яё]*|законн[а-яё]*\\s+представител[а-яё]*|мать|отец|мама|папа)${R}`,
  'i',
);
const CHILD_HINT_RE = new RegExp(
  `${L}(?:ученик[а-яё]*|учащ(?:ийся|егося|емуся|имся|иеся|ихся|имися|ийся)|реб[её]н(?:ок|ка|ке|ком|ку|ки|ок)|воспитанник[а-яё]*)${R}|${L}класс\\s+\\d{1,2}`,
  'i',
);
const CLASS_ID_RE = new RegExp(`${L}класс\\s+\\d{1,2}[А-Яа-яA-Za-z]?${R}`, 'i');
const FIO_RE = /[А-ЯЁ][а-яё]{2,}(?:\s+[А-ЯЁ][а-яё]{2,}){1,2}/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+7|8)[\s()-]*\d{3}[\s()-]*\d{3}[\s()-]*\d{2}[\s()-]*\d{2}/g;
const PASSPORT_RE = /(?<!\d)\d{4}[\s-]?\d{6}(?!\d)/g;
const SNILS_RE = /(?<!\d)\d{3}-\d{3}-\d{3}\s*\d{2}(?!\d)/g;
const ATTACH_NAME_RE = /(?:вложен\w*|файл\w*|attachment)[^\n]{0,80}\.(?:pdf|docx?|xlsx?|png|jpe?g|zip)/gi;

const MESSAGES = {
  pii_blocked: 'Внешний ИИ не принимает финансовые, платёжные и идентификационные данные.',
  child_blocked: 'ФИО детей и прямые идентификаторы нельзя отправлять во внешний ИИ.',
  parent_blocked: 'Данные родителей нельзя отправлять во внешний ИИ.',
  provider_unknown: 'Провайдер или регион обработки ИИ не определён — запрос закрыт.',
  vault_unsafe: 'Псевдонимизация недоступна: запрос с идентификаторами детей закрыт.',
};

function resolveExternalAiProvider(env = process.env) {
  const base = String(env.OPENAI_BASE_URL || '').trim().toLowerCase();
  const llm = String(env.LLM_PROVIDER || '').trim().toLowerCase();

  if (base.includes('primakov.school')) {
    return { ok: true, provider: 'pulse_closed', region: 'internal', external: false };
  }
  if (llm === 'yandex' || llm === 'yc' || llm === 'yandexgpt') {
    return { ok: true, provider: 'yandex', region: 'ru', external: false };
  }
  if (llm === 'gigachat' || llm === 'sber') {
    return { ok: true, provider: 'gigachat', region: 'ru', external: false };
  }
  if (base.includes('openai.com')) {
    return { ok: true, provider: 'openai', region: 'external', external: true };
  }
  if (base.includes('openrouter.ai')) {
    return { ok: true, provider: 'openrouter', region: 'external', external: true };
  }
  const cheapBase = String(env.CHEAP_LLM_BASE_URL || '').trim().toLowerCase();
  if (cheapBase.includes('deepseek.com') || base.includes('deepseek.com') || String(env.DEEPSEEK_API_KEY || '').trim()) {
    return { ok: true, provider: 'deepseek', region: 'external', external: true };
  }
  if (cheapBase.includes('groq.com') || base.includes('groq.com') || String(env.GROQ_API_KEY || '').trim()) {
    return { ok: true, provider: 'groq', region: 'external', external: true };
  }
  return {
    ok: false,
    provider: base || llm || 'unknown',
    region: 'unknown',
    external: true,
    reason: 'provider_unknown',
  };
}

function logExternalAiEvent(event) {
  const payload = {
    purpose: event.purpose || 'external_ai',
    user_id: event.userId == null ? null : event.userId,
    provider: event.provider || null,
    region: event.region || null,
    classification: event.classification || null,
    denied: Boolean(event.deniedReason),
    denied_reason: event.deniedReason || null,
  };
  if (!event.silent && !process.env.NODE_TEST_CONTEXT) {
    console.info('[external-ai]', JSON.stringify(payload));
  }
  return payload;
}

function deny(error, message, extra) {
  return {
    ok: false,
    error,
    message,
    classification: extra?.classification || null,
    deniedReason: extra?.deniedReason || error,
  };
}

function hasFio(text) {
  return FIO_RE.test(String(text || ''));
}

function hasContact(text) {
  const raw = String(text || '');
  EMAIL_RE.lastIndex = 0;
  PHONE_RE.lastIndex = 0;
  PASSPORT_RE.lastIndex = 0;
  SNILS_RE.lastIndex = 0;
  return EMAIL_RE.test(raw) || PHONE_RE.test(raw) || PASSPORT_RE.test(raw) || SNILS_RE.test(raw);
}

function classify(text) {
  const raw = String(text || '');
  if (FINANCE_RE.test(raw)) return { classification: 'C4', reason: 'finance' };
  if (DOCUMENT_RE.test(raw)) return { classification: 'C4', reason: 'document_or_mesh' };
  if (PARENT_RE.test(raw) && (hasFio(raw) || hasContact(raw))) {
    return { classification: 'C2', reason: 'parent_identified' };
  }
  if (PARENT_RE.test(raw) && FINANCE_RE.test(raw)) {
    return { classification: 'C4', reason: 'parent_or_payment' };
  }
  const child = CHILD_HINT_RE.test(raw);
  if (child && (hasFio(raw) || hasContact(raw))) {
    return { classification: 'C3', reason: 'child_identified' };
  }
  if (child) return { classification: 'C3_hint', reason: 'child_context' };
  if (hasContact(raw)) return { classification: 'C1', reason: 'staff_contacts' };
  return { classification: 'C1', reason: 'staff' };
}

function redactStructured(text) {
  let out = String(text || '');
  out = out.replace(EMAIL_RE, '[email]');
  out = out.replace(PHONE_RE, '[phone]');
  out = out.replace(SNILS_RE, '[id]');
  out = out.replace(PASSPORT_RE, '[id]');
  out = out.replace(ATTACH_NAME_RE, '[file]');
  return out;
}

function minimizePayload(text, maxChars) {
  const cap = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : 80_000;
  return String(text || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, cap);
}

function redactAttachmentNames(names) {
  const list = Array.isArray(names) ? names : [];
  const joined = list.map((n) => String(n || '')).join('\n');
  if (!joined.trim()) return { ok: true, text: '' };
  return sanitizeForExternalAi(joined, { enforceProvider: false, purpose: 'attachment_names' });
}

/**
 * DLP + optional structured vault. Mapping is never returned.
 * @param {string} text
 * @param {{
 *   purpose?: string,
 *   userId?: string|number|null,
 *   identities?: Array<{ kind?: string, value: string }>,
 *   attachmentNames?: string[],
 *   enforceProvider?: boolean,
 *   provider?: { ok: boolean, provider?: string, region?: string, external?: boolean, reason?: string },
 *   maxChars?: number,
 * }} [opts]
 */
function sanitizeForExternalAi(text, opts = {}) {
  const purpose = opts.purpose || 'external_ai';
  const provider = opts.provider || resolveExternalAiProvider();
  const enforceProvider = opts.enforceProvider === true;
  const log = (extra) => logExternalAiEvent({
    purpose,
    userId: opts.userId,
    provider: provider.provider,
    region: provider.region,
    silent: opts.silent,
    ...extra,
  });

  if (enforceProvider && !provider.ok) {
    log({ classification: null, deniedReason: 'provider_unknown' });
    return deny('provider_unknown', MESSAGES.provider_unknown, { deniedReason: 'provider_unknown' });
  }

  let raw = minimizePayload(text, opts.maxChars);
  const namesCheck = redactAttachmentNames(opts.attachmentNames || []);
  if (!namesCheck.ok) {
    log({
      classification: namesCheck.classification,
      deniedReason: namesCheck.deniedReason || namesCheck.error,
    });
    return namesCheck;
  }

  const vault = replaceIdentities(raw, opts.identities || []);
  if (vault.unsafe && classify(raw).classification === 'C3') {
    log({ classification: 'C3', deniedReason: 'vault_unsafe' });
    return deny('pii_blocked', MESSAGES.vault_unsafe, {
      classification: 'C3',
      deniedReason: 'vault_unsafe',
    });
  }
  raw = vault.text;

  if (/STUDENT_[A-F0-9]{8}/.test(raw) && (CLASS_ID_RE.test(raw) || hasContact(raw) || hasFio(raw))) {
    log({ classification: 'C3', deniedReason: 'identifying_context' });
    return deny('pii_blocked', MESSAGES.child_blocked, {
      classification: 'C3',
      deniedReason: 'identifying_context',
    });
  }

  const first = classify(raw);
  if (first.classification === 'C4') {
    log({ classification: 'C4', deniedReason: first.reason });
    return deny('pii_blocked', MESSAGES.pii_blocked, {
      classification: 'C4',
      deniedReason: first.reason,
    });
  }
  if (first.reason === 'parent_identified') {
    log({ classification: 'C2', deniedReason: 'parent_identified' });
    return deny('pii_blocked', MESSAGES.parent_blocked, {
      classification: 'C2',
      deniedReason: 'parent_identified',
    });
  }

  if (first.classification === 'C3') {
    const canVault = vault.applied && hasVaultSecret();
    const leftover = classify(redactStructured(raw));
    const identifyingLeft = leftover.classification === 'C3' || leftover.classification === 'C2' || leftover.classification === 'C4';
    const externalC3 = provider.external === true;
    if (!canVault || identifyingLeft || externalC3) {
      log({
        classification: 'C3',
        deniedReason: !canVault ? 'child_identified' : identifyingLeft ? 'identifying_context' : 'external_provider',
      });
      return deny('pii_blocked', MESSAGES.child_blocked, {
        classification: 'C3',
        deniedReason: 'child_identified',
      });
    }
  }

  const redacted = redactStructured(raw);
  const after = classify(redacted);
  if (after.classification === 'C4' || after.reason === 'parent_identified' || after.classification === 'C3') {
    log({ classification: after.classification, deniedReason: after.reason });
    const msg = after.classification === 'C3' ? MESSAGES.child_blocked : MESSAGES.pii_blocked;
    return deny('pii_blocked', msg, { classification: after.classification, deniedReason: after.reason });
  }

  log({ classification: after.classification, deniedReason: null });
  return { ok: true, text: redacted, classification: after.classification };
}

function staffRefToken(stableId) {
  if (stableId == null || stableId === '') return 'STAFF';
  return vaultTokenFor('staff', `id:${stableId}`) || 'STAFF';
}

module.exports = {
  sanitizeForExternalAi,
  resolveExternalAiProvider,
  logExternalAiEvent,
  classifyForExternalAi: classify,
  staffRefToken,
};
