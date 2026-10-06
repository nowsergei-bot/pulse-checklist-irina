export type SurveyAnalyticsPdfKind = 'page' | 'heatmap';

export function formatSurveyPdfDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function sanitizeSurveyPdfPrefix(prefix: string): string {
  const x = String(prefix || 'opros')
    .toLowerCase()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 48);
  return x || 'opros';
}

/** Имя файла: `5klass-analitika-2026-09-10.pdf` / `5klass-teplokarta-2026-09-10.pdf`. */
export function surveyAnalyticsPdfFileName(
  prefix: string,
  kind: SurveyAnalyticsPdfKind,
  date: Date = new Date(),
): string {
  const stem = sanitizeSurveyPdfPrefix(prefix);
  const suffix = kind === 'heatmap' ? 'teplokarta' : 'analitika';
  return `${stem}-${suffix}-${formatSurveyPdfDate(date)}.pdf`;
}

export function surveyAnalyticsPdfPrefixFromAccessLink(
  accessLink: string | null | undefined,
  fallback = 'opros',
): string {
  const first = String(accessLink || '')
    .trim()
    .split(/[/?#]/)[0];
  return sanitizeSurveyPdfPrefix(first || fallback);
}
