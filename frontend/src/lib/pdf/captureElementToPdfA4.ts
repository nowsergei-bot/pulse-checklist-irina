import html2canvas, { type Options as Html2CanvasOptions } from 'html2canvas';
import { jsPDF } from 'jspdf';
import { yieldToMain } from '../yieldToMain';
import {
  PDF_DEFAULT_SCALE,
  PDF_MARGIN_MM,
  SLICE_BOTTOM_SAFE_CSS_PX,
  computeSliceBottomPx,
  fitPdfImageWidthMm,
  mapKeepBlocksToCanvas,
  textareaPdfReplacementLayout,
} from './captureElementToPdfA4Layout';
import { flattenCssColorsForPdfCapture } from './html2canvasSafeColors';
import { humanizeHtml2CanvasPdfError } from './html2canvasPdfErrors';

export { humanizeHtml2CanvasPdfError } from './html2canvasPdfErrors';
export {
  computeSliceBottomPx,
  fitPdfImageWidthMm,
  mapKeepBlocksToCanvas,
  textareaPdfReplacementLayout,
} from './captureElementToPdfA4Layout';

/** Тот же класс, что у феноменальных уроков — не рвать блоки при нарезке страниц. */
export const PDF_CARD_KEEP_TOGETHER_CLASS = 'phenomenal-pdf-keep-together';

/**
 * Cross-origin photos loaded without CORS headers taint the canvas when
 * allowTaint=false. Drop them in the clone (do not re-fetch with crossOrigin —
 * CDN anonymous loads often fail and still abort capture).
 */
export function neutralizeCrossOriginImagesForPdfClone(clonedRoot: HTMLElement): void {
  if (typeof window === 'undefined') return;
  const origin = window.location.origin;
  clonedRoot.querySelectorAll('img').forEach((node) => {
    if (!(node instanceof HTMLImageElement)) return;
    const src = String(node.currentSrc || node.src || '');
    if (!/^https?:\/\//i.test(src) || src.startsWith(origin)) return;
    node.removeAttribute('src');
    node.removeAttribute('srcset');
    node.src = '';
    node.srcset = '';
    node.alt = node.alt || '';
  });
}

const DEFAULT_SCALE = PDF_DEFAULT_SCALE;
/** JPEG вместо PNG: типично в 5–15 раз меньше файл при приемлемом качестве для отчётов. */
const DEFAULT_IMAGE_FORMAT: 'JPEG' | 'PNG' = 'JPEG';
const DEFAULT_JPEG_QUALITY = 0.86;

/**
 * html2canvas часто рисует textarea как одну обрезанную строку. В клоне DOM подменяем на div с тем же текстом и стилями.
 */
function replaceTextareasInCloneForPdfCapture(sourceRoot: HTMLElement, clonedDoc: Document, clonedRoot: HTMLElement): void {
  const origList = [...sourceRoot.querySelectorAll('textarea')];
  const cloneList = [...clonedRoot.querySelectorAll('textarea')];
  const n = Math.min(origList.length, cloneList.length);
  const wrap = textareaPdfReplacementLayout();
  for (let i = 0; i < n; i++) {
    const orig = origList[i]!;
    const cl = cloneList[i]!;
    if (cl.ownerDocument !== clonedDoc) continue;
    const cs = window.getComputedStyle(orig);
    const div = clonedDoc.createElement('div');
    div.textContent = orig.value;
    div.style.display = 'block';
    div.style.boxSizing = cs.boxSizing;
    div.style.width = cs.width;
    div.style.maxWidth = cs.maxWidth;
    div.style.padding = cs.padding;
    div.style.border = cs.border;
    div.style.borderRadius = cs.borderRadius;
    div.style.margin = cs.margin;
    div.style.font = cs.font;
    div.style.fontSize = cs.fontSize;
    div.style.fontWeight = cs.fontWeight;
    div.style.fontFamily = cs.fontFamily;
    div.style.lineHeight = cs.lineHeight;
    div.style.letterSpacing = cs.letterSpacing;
    div.style.textAlign = cs.textAlign;
    div.style.background = cs.background;
    div.style.color = cs.color;
    div.style.whiteSpace = wrap.whiteSpace;
    div.style.wordBreak = wrap.wordBreak;
    div.style.overflowWrap = wrap.overflowWrap;
    div.style.setProperty('hyphens', wrap.hyphens);
    div.style.overflow = wrap.overflow;
    div.style.height = 'auto';
    div.style.minHeight = `${Math.max(orig.offsetHeight, orig.scrollHeight)}px`;
    cl.parentNode?.replaceChild(div, cl);
  }
}

/** Не рвать слова посередине и не сжимать clone по фиксированной высоте. */
export function preparePdfCaptureCloneLayout(clonedRoot: HTMLElement): void {
  clonedRoot.style.height = 'auto';
  clonedRoot.style.maxHeight = 'none';
  clonedRoot.style.overflow = 'visible';
  clonedRoot.style.setProperty('hyphens', 'none');
  clonedRoot.style.overflowWrap = 'break-word';
  clonedRoot.style.wordBreak = 'normal';
  for (const node of clonedRoot.querySelectorAll<HTMLElement>('*')) {
    const style = node.style;
    if (style.overflowWrap === 'anywhere') style.overflowWrap = 'break-word';
    if (style.wordBreak === 'break-all') style.wordBreak = 'normal';
    style.setProperty('hyphens', 'none');
  }
}

export function measurePdfKeepTogetherBlocks(
  container: HTMLElement,
  keepTogetherClass: string,
  scale: number = DEFAULT_SCALE,
): { top: number; bottom: number }[] {
  const cRect = container.getBoundingClientRect();
  const scrollY = container.scrollTop;
  const nodes = container.querySelectorAll(`.${keepTogetherClass}`);
  const out: { top: number; bottom: number }[] = [];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    const r = node.getBoundingClientRect();
    if (r.height < 1 && r.width < 1) continue;
    const top = (r.top - cRect.top + scrollY) * scale;
    const bottom = (r.bottom - cRect.top + scrollY) * scale;
    if (bottom - top >= 1) out.push({ top, bottom });
  }
  out.sort((a, b) => a.top - b.top);
  return out;
}

function clampJpegQuality(q: number): number {
  if (!Number.isFinite(q)) return DEFAULT_JPEG_QUALITY;
  return Math.min(0.95, Math.max(0.72, q));
}

/** Полная высота узла для html2canvas (не только видимая область экрана). */
function resolveHtml2CanvasDimensions(el: HTMLElement): { width: number; height: number } {
  const w = Math.max(el.scrollWidth, el.offsetWidth, el.getBoundingClientRect().width, 1);
  const h = Math.max(el.scrollHeight, el.offsetHeight, el.getBoundingClientRect().height, 1);
  return { width: Math.ceil(w), height: Math.ceil(h) };
}

async function canvasToPdfBlob(
  canvas: HTMLCanvasElement,
  keepBlocks: { top: number; bottom: number }[],
  imageFormat: 'JPEG' | 'PNG',
  jpegQuality: number,
  orientation: 'p' | 'l' = 'p',
  scale: number = DEFAULT_SCALE,
): Promise<Blob> {
  const margin = PDF_MARGIN_MM;
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgWidthMm = fitPdfImageWidthMm({
    pageWidthMm: pageW,
    pageHeightMm: pageH,
    marginMm: margin,
    canvasWidth: canvas.width,
    keepBlocks,
  });
  const pageAvailMm = pageH - 2 * margin;
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;
  const slicePxFullPage = (pageAvailMm / imgHeightMm) * canvas.height;
  const imgX = (pageW - imgWidthMm) / 2;
  const sliceOpts = { safeBottomPx: Math.round(SLICE_BOTTOM_SAFE_CSS_PX * scale) };

  let yPx = 0;
  let pageIndex = 0;

  while (yPx < canvas.height) {
    const remaining = canvas.height - yPx;
    const sliceBottom = computeSliceBottomPx(yPx, slicePxFullPage, canvas.height, keepBlocks, sliceOpts);
    const sliceH = Math.max(1, Math.min(sliceBottom - yPx, remaining));
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('Canvas2D недоступен');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, yPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    const sliceData =
      imageFormat === 'PNG'
        ? slice.toDataURL('image/png')
        : slice.toDataURL('image/jpeg', jpegQuality);
    const sliceHeightMm = (sliceH / canvas.height) * imgHeightMm;

    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(sliceData, imageFormat, imgX, margin, imgWidthMm, sliceHeightMm);
    yPx += sliceH;
    pageIndex++;
    if (pageIndex % 2 === 0) await yieldToMain();
  }

  return pdf.output('blob');
}

export type CaptureElementToPdfA4Options = {
  scale?: number;
  /** Класс для measurePdfKeepTogetherBlocks; по умолчанию PDF_CARD_KEEP_TOGETHER_CLASS */
  keepTogetherClass?: string;
  /** JPEG — компактный файл (по умолчанию); PNG — без потерь, очень тяжёлый */
  imageFormat?: 'JPEG' | 'PNG';
  /** 0.72–0.95, только для JPEG. По умолчанию 0.86 */
  jpegQuality?: number;
  /** Доп. опции html2canvas */
  html2canvas?: Partial<Html2CanvasOptions>;
  /** Портрет по умолчанию; ландшафт удобнее для широких теплокарт. */
  orientation?: 'p' | 'l';
};

/**
 * Снимок узла как на экране → многостраничный PDF A4 (по ширине вписан, по высоте нарезан).
 */
export async function captureElementToPdfA4Blob(
  el: HTMLElement,
  opts: CaptureElementToPdfA4Options = {},
): Promise<Blob> {
  const scale = opts.scale ?? DEFAULT_SCALE;
  const imageFormat = opts.imageFormat ?? DEFAULT_IMAGE_FORMAT;
  const jpegQuality = clampJpegQuality(opts.jpegQuality ?? DEFAULT_JPEG_QUALITY);
  const keepClass = opts.keepTogetherClass ?? PDF_CARD_KEEP_TOGETHER_CLASS;
  const { onclone: userOnClone, ...html2canvasRest } = opts.html2canvas ?? {};
  const dims = resolveHtml2CanvasDimensions(el);
  const viewportW = Math.max(
    document.documentElement.clientWidth || 0,
    window.innerWidth || 0,
    dims.width,
  );
  const viewportH = Math.max(
    document.documentElement.clientHeight || 0,
    window.innerHeight || 0,
    dims.height,
  );
  await yieldToMain();
  // Bake modern CSS colors to rgb/rgba before html2canvas parses stylesheets.
  const restoreColors = flattenCssColorsForPdfCapture(el);
  try {
    const canvas = await html2canvas(el, {
      scale,
      width: dims.width,
      height: dims.height,
      windowWidth: viewportW,
      windowHeight: viewportH,
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      ...html2canvasRest,
      onclone: (clonedDoc, clonedRoot) => {
        replaceTextareasInCloneForPdfCapture(el, clonedDoc, clonedRoot);
        if (clonedRoot instanceof HTMLElement) {
          preparePdfCaptureCloneLayout(clonedRoot);
          neutralizeCrossOriginImagesForPdfClone(clonedRoot);
        }
        userOnClone?.(clonedDoc, clonedRoot);
      },
    });
    const rawBlocks = measurePdfKeepTogetherBlocks(el, keepClass, scale);
    const keepBlocks = mapKeepBlocksToCanvas(rawBlocks, dims.height * scale, canvas.height);
    await yieldToMain();
    return canvasToPdfBlob(canvas, keepBlocks, imageFormat, jpegQuality, opts.orientation ?? 'p', scale);
  } catch (err) {
    throw humanizeHtml2CanvasPdfError(err);
  } finally {
    restoreColors();
  }
}

export async function pdfBlobToBase64Data(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? '');
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.onerror = () => reject(r.error ?? new Error('FileReader'));
    r.readAsDataURL(blob);
  });
}
