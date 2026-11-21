export const PRIMARY_PDF_MAX_BYTES = 50 * 1024 * 1024;

export async function loadPrimaryPdf() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  // Earlier responses were cached as application/octet-stream for one year.
  // Use a fresh URL after the server MIME fix, including in already-used browsers.
  const url = new URL(worker.default, window.location.href);
  url.searchParams.set('primary-pdf', 'legacy-v3');
  pdfjs.GlobalWorkerOptions.workerSrc = url.href;
  return pdfjs;
}

export function primaryPdfError(error: unknown): string {
  const text = error instanceof Error ? error.message : 'Не удалось прочитать PDF.';
  return /fake worker|Failed to fetch dynamically imported module|workerSrc/i.test(text)
    ? 'Не удалось загрузить модуль чтения PDF. Обновите страницу Пульса и\u00a0выберите файл ещё раз.'
    : text;
}
