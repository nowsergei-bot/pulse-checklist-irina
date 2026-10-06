import {
  captureElementToPdfA4Blob,
  PDF_CARD_KEEP_TOGETHER_CLASS,
} from '../pdf/captureElementToPdfA4';
import { humanizeHtml2CanvasPdfError } from '../pdf/html2canvasPdfErrors';
import { downloadPdfBlobAsFile } from '../pdf/surveyAnalyticsPdf';
import { yieldToMain } from '../yieldToMain';
import { VCD_PDF_CAPTURE_CLASS, VCD_PDF_HIDE_CLASS, VCD_PDF_KEEP_SELECTORS } from './visitChecklistCloudPdfMeta';
import { boostVisitChecklistPdfChartInk } from './visitChecklistCloudPdfInk';

export { VCD_PDF_CAPTURE_CLASS, VCD_PDF_HIDE_CLASS, VCD_PDF_KEEP_SELECTORS } from './visitChecklistCloudPdfMeta';
export { boostVisitChecklistPdfChartInk } from './visitChecklistCloudPdfInk';

const EXPAND_OVERFLOW_SELECTORS = [
  '.vcd-card',
  '.vcd-chart',
  '.vcd-chart__body',
  '.vcd-insights',
  '.vcd-draft',
  '.vcd-visit',
  '.vcd-answers',
  '.vcd-teacher-charts',
  '.vcd-charts',
  '.vcd-methodist',
  '.vcd-ai-report',
  '.vcd-school-ai',
  '.recharts-wrapper',
  '.recharts-responsive-container',
  '.recharts-surface',
];

type SavedStyle = { el: HTMLElement; cssText: string };
type SavedAttr = { el: HTMLElement; name: string; value: string | null };

function saveStyle(el: HTMLElement): SavedStyle {
  return { el, cssText: el.style.cssText };
}

function restoreAll(saved: SavedStyle[]): void {
  for (let i = saved.length - 1; i >= 0; i--) {
    saved[i]!.el.style.cssText = saved[i]!.cssText;
  }
}

export async function waitForPdfImages(root: HTMLElement, timeoutMs = 2500): Promise<void> {
  const imgs = [...root.querySelectorAll('img')];
  if (!imgs.length) return;
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          window.setTimeout(done, timeoutMs);
        }),
    ),
  );
}

async function waitForPdfPaint(root: HTMLElement): Promise<void> {
  await waitForPdfImages(root);
  await yieldToMain();
  await yieldToMain();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('resize'));
  }
  await yieldToMain(160);
}

export function stampVisitChecklistPdfKeepTogether(root: HTMLElement): () => void {
  const added: HTMLElement[] = [];
  for (const selector of VCD_PDF_KEEP_SELECTORS) {
    for (const node of root.querySelectorAll(selector)) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.classList.contains(PDF_CARD_KEEP_TOGETHER_CLASS)) continue;
      node.classList.add(PDF_CARD_KEEP_TOGETHER_CLASS);
      added.push(node);
    }
  }
  return () => {
    for (const node of added) node.classList.remove(PDF_CARD_KEEP_TOGETHER_CLASS);
  };
}

export function prepareVisitChecklistPdfRoot(root: HTMLElement): () => void {
  const saved: SavedStyle[] = [];
  const attrs: SavedAttr[] = [];
  const hadCaptureClass = root.classList.contains(VCD_PDF_CAPTURE_CLASS);
  root.classList.add(VCD_PDF_CAPTURE_CLASS);

  saved.push(saveStyle(root));
  root.style.height = 'auto';
  root.style.maxHeight = 'none';
  root.style.overflow = 'visible';

  for (const node of root.querySelectorAll(`.${VCD_PDF_HIDE_CLASS}`)) {
    if (!(node instanceof HTMLElement)) continue;
    saved.push(saveStyle(node));
    node.style.display = 'none';
  }

  for (const node of root.querySelectorAll('details')) {
    if (!(node instanceof HTMLElement)) continue;
    attrs.push({ el: node, name: 'open', value: node.getAttribute('open') });
    node.setAttribute('open', '');
  }

  for (const selector of EXPAND_OVERFLOW_SELECTORS) {
    for (const node of root.querySelectorAll(selector)) {
      if (!(node instanceof HTMLElement)) continue;
      saved.push(saveStyle(node));
      const recharts =
        node.classList.contains('recharts-wrapper') ||
        node.classList.contains('recharts-responsive-container') ||
        node.classList.contains('recharts-surface');
      node.style.maxHeight = 'none';
      node.style.overflow = 'visible';
      if (!recharts) node.style.height = 'auto';
    }
  }

  for (const node of root.querySelectorAll('textarea')) {
    if (!(node instanceof HTMLElement)) continue;
    saved.push(saveStyle(node));
    const ta = node as HTMLTextAreaElement;
    node.style.height = `${Math.max(ta.offsetHeight, ta.scrollHeight)}px`;
    node.style.overflow = 'visible';
    node.style.resize = 'none';
  }

  const unstamp = stampVisitChecklistPdfKeepTogether(root);

  return () => {
    unstamp();
    for (const { el, name, value } of attrs) {
      if (value == null) el.removeAttribute(name);
      else el.setAttribute(name, value);
    }
    restoreAll(saved);
    if (!hadCaptureClass) root.classList.remove(VCD_PDF_CAPTURE_CLASS);
  };
}

export function prepareVisitChecklistPdfClone(clonedRoot: HTMLElement): void {
  clonedRoot.classList.add(VCD_PDF_CAPTURE_CLASS);
  clonedRoot.style.height = 'auto';
  clonedRoot.style.maxHeight = 'none';
  clonedRoot.style.overflow = 'visible';
  clonedRoot.style.color = '#1a1512';
  clonedRoot.style.background = '#ffffff';

  clonedRoot.querySelectorAll(`.${VCD_PDF_HIDE_CLASS}`).forEach((node) => {
    if (node instanceof HTMLElement) node.style.display = 'none';
  });
  clonedRoot.querySelectorAll('details').forEach((node) => {
    if (node instanceof HTMLElement) node.setAttribute('open', '');
  });

  const flatten = clonedRoot.querySelectorAll('.glass-surface, .card, .vcd-chart, .vcd-visit, .vcd-draft');
  for (const el of flatten) {
    if (!(el instanceof HTMLElement)) continue;
    el.style.background = el.style.background || '#ffffff';
    el.style.backdropFilter = 'none';
    (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'none';
    el.style.boxShadow = 'none';
    el.style.color = el.style.color || '#1a1512';
  }

  for (const svg of clonedRoot.querySelectorAll('svg')) {
    if (!(svg instanceof SVGElement)) continue;
    svg.setAttribute('overflow', 'visible');
    svg.setAttribute('shape-rendering', 'geometricPrecision');
    svg.style.overflow = 'visible';
  }

  boostVisitChecklistPdfChartInk(clonedRoot);

  // Cross-origin photos are stripped in captureElementToPdfA4 onclone (shared).
  // Here only ensure remaining same-origin imgs stay visible for the snapshot.
  clonedRoot.querySelectorAll('img').forEach((node) => {
    if (!(node instanceof HTMLImageElement)) return;
    node.style.display = 'block';
    node.style.visibility = 'visible';
    node.style.opacity = '1';
    node.removeAttribute('hidden');
  });

  stampVisitChecklistPdfKeepTogether(clonedRoot);
}

export async function downloadVisitChecklistPdf(el: HTMLElement, fileName: string): Promise<void> {
  if (!el || !(el instanceof HTMLElement)) {
    throw new Error('Не удалось найти область для PDF — обновите страницу и попробуйте снова.');
  }
  const restore = prepareVisitChecklistPdfRoot(el);
  try {
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
    await waitForPdfPaint(el);
    const dims = {
      w: Math.max(el.scrollWidth, el.offsetWidth, 1),
      h: Math.max(el.scrollHeight, el.offsetHeight, 1),
    };
    if (dims.w < 8 || dims.h < 8) {
      throw new Error('Не удалось собрать PDF: карточка ещё не отрисовалась. Подождите и повторите.');
    }
    const blob = await captureElementToPdfA4Blob(el, {
      scale: 2,
      keepTogetherClass: PDF_CARD_KEEP_TOGETHER_CLASS,
      imageFormat: 'PNG',
      html2canvas: {
        onclone: (_doc, clonedRoot) => {
          if (clonedRoot instanceof HTMLElement) prepareVisitChecklistPdfClone(clonedRoot);
        },
      },
    });
    downloadPdfBlobAsFile(blob, fileName);
  } catch (err) {
    throw humanizeHtml2CanvasPdfError(err);
  } finally {
    restore();
  }
}
