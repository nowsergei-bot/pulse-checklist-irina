import { VISIT_FORMAT_SELF_ANALYSIS } from './normalizeChecklist.ts';

export { VISIT_FORMAT_SELF_ANALYSIS };

export const VISIT_FORMAT_FIELD_KEYS = ['visit_format', 'format', 'visitFormat', 'lesson_format'] as const;

const SELF_ANALYSIS_ALIASES = new Set([
  'самоанализ',
  'self',
  'self-analysis',
  'self analysis',
  'samoanaliz',
  'само-анализ',
  'само оценка',
  'самооценка',
]);

export function normalizeVisitFormat(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSelfAnalysisFormat(raw: string | null | undefined): boolean {
  const s = normalizeVisitFormat(raw).toLowerCase();
  if (!s) return false;
  if (SELF_ANALYSIS_ALIASES.has(s)) return true;
  if (s === VISIT_FORMAT_SELF_ANALYSIS.toLowerCase()) return true;
  if (/само[\s-]?анализ/.test(s)) return true;
  if (/^self(?:\s|$|-)/.test(s)) return true;
  if (s.includes('самоанализ')) return true;
  return false;
}

export function pickVisitFormat(general: Record<string, unknown> | null | undefined): string {
  const g = general && typeof general === 'object' ? general : {};
  for (const key of VISIT_FORMAT_FIELD_KEYS) {
    const value = normalizeVisitFormat(String(g[key] ?? ''));
    if (value) return value;
  }
  return '';
}

/** Подпись варианта «Формат посещения»: самоанализ — строчными серым, значение в данных — «Самоанализ». */
export function displayVisitFormatOptionLabel(option: string): string {
  if (isSelfAnalysisFormat(option)) return 'самоанализ';
  return option;
}

export function isVisitFormatSelfAnalysisOption(option: string): boolean {
  return isSelfAnalysisFormat(option);
}
