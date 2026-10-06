import type { SurveyAnalyticsPdfKind } from './surveyAnalyticsPdfNames';

export type { SurveyAnalyticsPdfKind } from './surveyAnalyticsPdfNames';
export {
  formatSurveyPdfDate,
  sanitizeSurveyPdfPrefix,
  surveyAnalyticsPdfFileName,
  surveyAnalyticsPdfPrefixFromAccessLink,
} from './surveyAnalyticsPdfNames';

/** Скрывается в снимке PDF (кнопки экспорта). */
export const SURVEY_PDF_CONTROLS_ATTR = 'data-survey-pdf-controls';
/** Раскрывается на полную высоту/ширину перед html2canvas (скролл теплокарты). */
export const SURVEY_PDF_EXPAND_ATTR = 'data-survey-pdf-expand';

const EXPAND_CLASS_SELECTORS = [
  '.g5-heat-wrap',
  '.mo-eng-dash-heatmap-scroll',
  '.arabic-pulse-dash-heatmap-scroll',
  '.magadan-feedback-heat-wrap',
].join(',');

const STYLE_KEYS = [
  'overflow',
  'maxHeight',
  'maxWidth',
  'height',
  'width',
  'position',
  'top',
  'left',
  'zIndex',
  'display',
] as const;

type SavedStyle = { el: HTMLElement; props: Record<(typeof STYLE_KEYS)[number], string> };

export function downloadPdfBlobAsFile(blob: Blob, fileName: string): void {
  const name = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function saveStyle(el: HTMLElement): SavedStyle {
  const props = {} as SavedStyle['props'];
  for (const key of STYLE_KEYS) props[key] = el.style[key];
  return { el, props };
}

function restoreStyle(saved: SavedStyle): void {
  for (const key of STYLE_KEYS) saved.el.style[key] = saved.props[key];
}

function applyExpand(el: HTMLElement): void {
  el.style.overflow = 'visible';
  el.style.maxHeight = 'none';
  el.style.maxWidth = 'none';
  el.style.height = 'auto';
  el.style.width = `${Math.max(el.scrollWidth, el.offsetWidth, 1)}px`;
}

function collectExpandTargets(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const add = (el: HTMLElement) => {
    if (seen.has(el)) return;
    seen.add(el);
    out.push(el);
  };
  if (root.hasAttribute(SURVEY_PDF_EXPAND_ATTR)) add(root);
  root.querySelectorAll(`[${SURVEY_PDF_EXPAND_ATTR}]`).forEach((n) => {
    if (n instanceof HTMLElement) add(n);
  });
  root.querySelectorAll(EXPAND_CLASS_SELECTORS).forEach((n) => {
    if (n instanceof HTMLElement) add(n);
  });
  return out;
}

function unstickWithin(root: HTMLElement, saved: SavedStyle[]): void {
  const nodes = [root, ...root.querySelectorAll('*')];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    const pos = getComputedStyle(node).position;
    if (pos !== 'sticky' && pos !== 'fixed') continue;
    saved.push(saveStyle(node));
    node.style.position = 'static';
    node.style.top = 'auto';
    node.style.left = 'auto';
    node.style.zIndex = 'auto';
  }
}

/** Прячет кнопки экспорта и раскрывает скролл-области в клоне html2canvas. */
export function prepareSurveyAnalyticsPdfClone(clonedRoot: HTMLElement): void {
  clonedRoot.querySelectorAll(`[${SURVEY_PDF_CONTROLS_ATTR}]`).forEach((n) => {
    if (n instanceof HTMLElement) n.style.display = 'none';
  });
  for (const el of collectExpandTargets(clonedRoot)) applyExpand(el);
  const unstickSaved: SavedStyle[] = [];
  unstickWithin(clonedRoot, unstickSaved);
  void unstickSaved;
}

/**
 * На живом DOM: скрыть кнопки PDF, раскрыть теплокарту, снять sticky.
 * Иначе html2canvas снимет только видимый viewport таблицы.
 */
export async function runWithSurveyPdfCaptureLayout<T>(
  root: HTMLElement,
  fn: () => Promise<T>,
): Promise<T> {
  const saved: SavedStyle[] = [];
  root.querySelectorAll(`[${SURVEY_PDF_CONTROLS_ATTR}]`).forEach((n) => {
    if (!(n instanceof HTMLElement)) return;
    saved.push(saveStyle(n));
    n.style.display = 'none';
  });
  for (const el of collectExpandTargets(root)) {
    saved.push(saveStyle(el));
    applyExpand(el);
  }
  unstickWithin(root, saved);
  try {
    return await fn();
  } finally {
    for (let i = saved.length - 1; i >= 0; i--) restoreStyle(saved[i]!);
  }
}

export async function captureSurveyAnalyticsElementToPdf(
  el: HTMLElement,
  opts: { kind: SurveyAnalyticsPdfKind },
): Promise<Blob> {
  const { captureElementToPdfA4Blob } = await import('./captureElementToPdfA4');
  const heatmap = opts.kind === 'heatmap';
  return runWithSurveyPdfCaptureLayout(el, () =>
    captureElementToPdfA4Blob(el, {
      orientation: heatmap ? 'l' : 'p',
      scale: heatmap ? 2 : 1.35,
      jpegQuality: heatmap ? 0.88 : 0.82,
      html2canvas: {
        onclone: (_doc, clonedRoot) => {
          if (clonedRoot instanceof HTMLElement) prepareSurveyAnalyticsPdfClone(clonedRoot);
        },
      },
    }),
  );
}
