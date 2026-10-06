import { VISIT_FORMAT_SELF_ANALYSIS } from './normalizeChecklist.ts';

/** Старый 9-блочный проект 2026 — не использовать в кабинете. */
const LEGACY_2026_FORM_TOKEN = 'be57bd59186a4b30b467c9d2eb6b4b49';

function viteFormToken(): string {
  try {
    const env = (import.meta as ImportMeta & { env?: { VITE_LESSON_VISIT_FORM_TOKEN?: string } }).env;
    const token = String(env?.VITE_LESSON_VISIT_FORM_TOKEN || '').trim();
    if (!token || token === LEGACY_2026_FORM_TOKEN) return '';
    return token;
  } catch {
    return '';
  }
}

/** Env-only public form token. Cabinet loads the live token from GET /api/public/lesson-visit-form/latest. */
export const LESSON_VISIT_PUBLIC_FORM_TOKEN = viteFormToken();

export const VISIT_FORMAT_QUERY = 'format';

/** In-cabinet fill — PulseCabinetShell stays. Public share links keep `lessonVisitPublicFormPath`. */
export const VISIT_CHECKLIST_FORM_PATH = '/cabinet/feedback/form';

export type LessonVisitPublicFormPathOpts = {
  token?: string;
  format?: string | null;
};

export function lessonVisitPublicFormPath(opts?: LessonVisitPublicFormPathOpts): string {
  const token = String(opts?.token || LESSON_VISIT_PUBLIC_FORM_TOKEN).trim();
  const format = String(opts?.format || '').trim();
  if (!token) {
    if (!format) return VISIT_CHECKLIST_FORM_PATH;
    const q = new URLSearchParams({ [VISIT_FORMAT_QUERY]: format });
    return `${VISIT_CHECKLIST_FORM_PATH}?${q.toString()}`;
  }
  const base = `/view/lesson-visit/${encodeURIComponent(token)}`;
  if (!format) return base;
  const q = new URLSearchParams({ [VISIT_FORMAT_QUERY]: format });
  return `${base}?${q.toString()}`;
}

export function lessonVisitSelfAnalysisFormPath(token?: string): string {
  return lessonVisitPublicFormPath({ token, format: VISIT_FORMAT_SELF_ANALYSIS });
}

export function lessonVisitCabinetFormPath(opts?: LessonVisitPublicFormPathOpts & { base?: string }): string {
  const raw = String(opts?.base || VISIT_CHECKLIST_FORM_PATH).trim() || VISIT_CHECKLIST_FORM_PATH;
  const hashAt = raw.indexOf('#');
  const href = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const hash = hashAt >= 0 ? raw.slice(hashAt) : '';
  const qAt = href.indexOf('?');
  const path = qAt >= 0 ? href.slice(0, qAt) : href;
  const q = new URLSearchParams(qAt >= 0 ? href.slice(qAt + 1) : '');
  const format = String(opts?.format || '').trim();
  const token = String(opts?.token || '').trim();
  if (format) q.set(VISIT_FORMAT_QUERY, format);
  if (token) q.set('token', token);
  const qs = q.toString();
  return `${path}${qs ? `?${qs}` : ''}${hash}`;
}

export function lessonVisitCabinetSelfAnalysisFormPath(opts?: { token?: string; base?: string }): string {
  return lessonVisitCabinetFormPath({
    token: opts?.token,
    format: VISIT_FORMAT_SELF_ANALYSIS,
    base: opts?.base,
  });
}

export function isVisitChecklistCabinetFormPath(pathname: string): boolean {
  const norm = pathname.replace(/^\/cabinet\/as/, '/cabinet').replace(/\/+$/, '') || '/';
  return norm === VISIT_CHECKLIST_FORM_PATH || norm.startsWith(`${VISIT_CHECKLIST_FORM_PATH}/`);
}

const SELF_ANALYSIS_ALIASES = new Set(['самоанализ', 'self', 'self-analysis', 'samoanaliz']);

export function preferredVisitFormatFromQuery(raw?: string | null, options?: string[] | null): string | null {
  const q = String(raw || '').trim();
  if (!q) return null;
  const opts = Array.isArray(options) ? options.filter((o) => String(o || '').trim()) : [];
  const lower = q.toLowerCase();
  const fromOptions = opts.find((o) => o.toLowerCase() === lower);
  if (fromOptions) return fromOptions;
  if (SELF_ANALYSIS_ALIASES.has(lower)) {
    const self = opts.find((o) => o === VISIT_FORMAT_SELF_ANALYSIS || o.toLowerCase() === VISIT_FORMAT_SELF_ANALYSIS.toLowerCase());
    return self || VISIT_FORMAT_SELF_ANALYSIS;
  }
  return null;
}
