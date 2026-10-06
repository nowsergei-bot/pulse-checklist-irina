/** Совпадает с backend/functions/lib/validation.js, если у вопроса нет maxLength. */
export const DEFAULT_SURVEY_TEXT_MAX_LENGTH = 10000;

const QUESTION_PREFIX_RE = /^Question\s+(\d+)\s*:\s*(.*)$/i;
const TECHNICAL_RE =
  /Question\s+\d+|too[_\s-]?long|invalid_answers|invalid option|expects (string|array|object)|out of range|text required|empty text|Internal error|statusText|Failed to fetch|\/api\/|ECONN|stack:|at\s+\S+\s+\(/i;

export type PublicFormErrorLocale = 'ru' | 'en';

export type PublicFormErrorQuestion = {
  id: number;
  type?: string;
  options?: unknown;
};

export type HumanizePublicFormErrorOptions = {
  questions?: readonly PublicFormErrorQuestion[];
  locale?: PublicFormErrorLocale;
  fallback?: string;
};

function asRecord(err: unknown): Record<string, unknown> | null {
  if (err && typeof err === 'object') return err as Record<string, unknown>;
  return null;
}

function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function surveyTextMaxLength(options: unknown): number {
  if (options && typeof options === 'object' && !Array.isArray(options)) {
    const n = Number((options as { maxLength?: unknown }).maxLength);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return DEFAULT_SURVEY_TEXT_MAX_LENGTH;
}

export function tooLongAnswerMessage(maxLength?: number | null, locale: PublicFormErrorLocale = 'ru'): string {
  const n = Number(maxLength);
  const hasMax = Number.isFinite(n) && n > 0;
  if (locale === 'en') {
    return hasMax
      ? `This answer is too long (more than ${Math.floor(n)} characters). Shorten it and submit again.`
      : 'This answer is too long. Shorten the text and submit again.';
  }
  return hasMax
    ? `Ответ слишком длинный (больше ${Math.floor(n)} символов). Сократите текст и отправьте снова.`
    : 'Ответ слишком длинный. Сократите текст и отправьте снова.';
}

function parseQuestionPrefix(raw: string): { questionId: number | null; detail: string } {
  const s = String(raw || '').trim();
  const m = s.match(QUESTION_PREFIX_RE);
  if (m) return { questionId: Number(m[1]), detail: String(m[2] || '').trim() };
  return { questionId: null, detail: s };
}

function stripTrailingCode(s: string): string {
  return s.replace(/\s*\(([a-z][a-z0-9_.-]+)\)\s*$/i, '').trim();
}

function looksSafeRespondentText(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (TECHNICAL_RE.test(t)) return false;
  if (/^[a-z][a-z0-9_.-]*$/i.test(t)) return false;
  return /[а-яё]/i.test(t) || /^[A-ZА-ЯЁ]/.test(t);
}

function inferCode(detail: string, explicit?: string): string {
  const code = String(explicit || '').trim();
  if (code) return code;
  const d = detail.toLowerCase().replace(/_/g, ' ').trim();
  if (d === 'too long' || d === 'too_long') return 'too_long';
  return '';
}

function maxLengthFromQuestions(
  questionId: number | null,
  questions: readonly PublicFormErrorQuestion[] | undefined,
): number | null {
  if (!questionId || !questions?.length) return null;
  const q = questions.find((item) => Number(item.id) === questionId);
  if (!q) return null;
  const n = surveyTextMaxLength(q.options);
  return n > 0 ? n : null;
}

function genericSubmitMessage(locale: PublicFormErrorLocale): string {
  return locale === 'en'
    ? 'Could not save your answers. Check the fields and try again.'
    : 'Не удалось сохранить ответы. Проверьте поля и отправьте снова.';
}

function mapKnownPublicSaveError(raw: string, locale: PublicFormErrorLocale): string | null {
  const lower = raw.toLowerCase();
  if (lower === 'you have already submitted this survey' || lower === 'already_submitted') {
    return locale === 'en' ? 'You have already submitted this survey.' : 'Вы уже отправили эту анкету.';
  }
  if (lower === 'survey is not accepting responses' || lower === 'not_accepting') {
    return locale === 'en'
      ? 'This survey is not accepting new responses right now.'
      : 'Приём ответов временно приостановлен.';
  }
  if (lower === 'not found' || lower === 'survey not found or not published') {
    const base =
      locale === 'en'
        ? 'Survey not found or not published. Check the link.'
        : 'Анкета не найдена или не опубликована. Проверьте ссылку.';
    const dev =
      typeof import.meta !== 'undefined' && import.meta.env?.DEV
        ? locale === 'en'
          ? ' For local DB: scripts/seed-prima-quizpliz-registration-survey.js --publish.'
          : ' Для локальной БД: scripts/seed-prima-quizpliz-registration-survey.js --publish.'
        : '';
    return base + dev;
  }
  if (lower.startsWith('respondent_id is required')) {
    return locale === 'en'
      ? 'Could not submit the form. Refresh the page and try again.'
      : 'Не удалось отправить анкету. Обновите страницу и попробуйте снова.';
  }
  if (/^missing answer for question/i.test(raw)) {
    return locale === 'en'
      ? 'Please fill in all required questions and submit again.'
      : 'Заполните все обязательные вопросы и отправьте снова.';
  }
  if (/^unknown question_id/i.test(raw) || /^duplicate answer/i.test(raw) || /hidden question/i.test(raw)) {
    return locale === 'en'
      ? 'The form is out of date. Refresh the page and submit again.'
      : 'Форма устарела. Обновите страницу и отправьте ответы снова.';
  }
  if (lower === 'answers must be an array' || lower === 'invalid_answers') {
    return genericSubmitMessage(locale);
  }
  return null;
}

function localDevApiHint(locale: PublicFormErrorLocale): string {
  if (locale === 'en') {
    return ' Start the API (cd backend/functions && node local-server.js) or set VITE_API_BASE in frontend/.env.local — see frontend/README-DEV.md.';
  }
  return ' Запустите API (cd backend/functions && node local-server.js) или задайте VITE_API_BASE в frontend/.env.local — см. frontend/README-DEV.md.';
}

function mapVoiceOrNetwork(raw: string, locale: PublicFormErrorLocale): string | null {
  const lower = raw.toLowerCase();
  if (
    /internal server error|bad gateway|service unavailable|gateway timeout|502|503|504|econnrefused|proxy error/i.test(
      raw,
    )
  ) {
    const base =
      locale === 'en'
        ? 'The API is not responding (local proxy or server error).'
        : 'API не отвечает (локальный прокси или ошибка сервера).';
    const dev =
      typeof import.meta !== 'undefined' && import.meta.env?.DEV ? localDevApiHint(locale) : '';
    return base + dev;
  }
  if (/failed to fetch|networkerror|load failed|не удалось связаться/i.test(raw)) {
    const base =
      locale === 'en'
        ? 'Could not reach the server. Check your internet connection and try again.'
        : 'Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.';
    const dev =
      typeof import.meta !== 'undefined' && import.meta.env?.DEV ? localDevApiHint(locale) : '';
    return base + dev;
  }
  if (
    /transcribe_failed|transcribe_not_configured|s3_read_failed|dictation_clip_too_large|speech_not_recognized/i.test(
      lower,
    )
  ) {
    return locale === 'en'
      ? 'Could not transcribe the recording. Try again, speaking a little louder and closer to the microphone.'
      : 'Не удалось распознать речь. Попробуйте ещё раз, говорите чуть громче и ближе к микрофону.';
  }
  if (/notallowed|not-allowed|permission denied|denied by user|audio-capture/i.test(raw)) {
    return locale === 'en'
      ? 'Allow microphone access in the browser settings and try again.'
      : 'Разрешите доступ к микрофону в настройках браузера и нажмите кнопку снова.';
  }
  return null;
}

/**
 * Ошибки публичной анкеты (отправка и голос): русский текст, без Question id и без сырого err.message.
 */
export function humanizePublicFormError(err: unknown, opts: HumanizePublicFormErrorOptions = {}): string {
  const locale = opts.locale === 'en' ? 'en' : 'ru';
  const rec = asRecord(err);
  const raw = stripTrailingCode(
    firstString(
      rec && typeof rec.message === 'string' ? rec.message : '',
      err instanceof Error ? err.message : '',
      rec && typeof rec.error === 'string' ? rec.error : '',
      typeof err === 'string' ? err : '',
    ),
  );
  const parsed = parseQuestionPrefix(raw);
  const extraCode = firstString(rec?.code, rec?.error);
  const code = inferCode(parsed.detail || raw, extraCode === raw ? '' : extraCode);
  const questionId =
    Number(rec?.question_id ?? rec?.questionId) || parsed.questionId || null;
  const maxFromErr = Number(rec?.maxLength ?? rec?.max_length);
  const maxLength =
    (Number.isFinite(maxFromErr) && maxFromErr > 0 ? Math.floor(maxFromErr) : null) ||
    maxLengthFromQuestions(questionId, opts.questions);

  if (code === 'too_long' || /^too[_\s-]?long$/i.test(parsed.detail) || /^too[_\s-]?long$/i.test(raw)) {
    return tooLongAnswerMessage(maxLength, locale);
  }

  const known = mapKnownPublicSaveError(raw, locale) || mapKnownPublicSaveError(parsed.detail, locale);
  if (known) return known;

  const voice = mapVoiceOrNetwork(raw, locale);
  if (voice) return voice;

  if (parsed.detail && /[а-яё]/i.test(parsed.detail) && !QUESTION_PREFIX_RE.test(parsed.detail)) {
    return parsed.detail;
  }

  if (looksSafeRespondentText(raw) && !parsed.questionId) {
    return raw;
  }

  return opts.fallback || genericSubmitMessage(locale);
}

export function collectTooLongSurveyAnswers(
  questions: readonly PublicFormErrorQuestion[],
  answers: Record<number, unknown>,
): Array<{ id: string; questionId: number; maxLength: number }> {
  const out: Array<{ id: string; questionId: number; maxLength: number }> = [];
  for (const q of questions) {
    if (q.type && q.type !== 'text') continue;
    const maxLength = surveyTextMaxLength(q.options);
    const value = answers[q.id];
    if (typeof value !== 'string') continue;
    if (value.trim().length > maxLength) {
      out.push({ id: `question-${q.id}`, questionId: q.id, maxLength });
    }
  }
  return out;
}
