import {
  captureElementToPdfA4Blob,
  PDF_CARD_KEEP_TOGETHER_CLASS,
  pdfBlobToBase64Data,
} from '../pdf/captureElementToPdfA4';
import { yieldToMain } from '../yieldToMain';

/** Ширина карточки при снимке ≈ полезная ширина A4 с полями 12 мм. */
const PDF_CAPTURE_WIDTH_PX = 700;
/** 1.35 + JPEG: достаточно для A4, заметно легче и быстрее, чем scale 2 + PNG. */
const PDF_CAPTURE_SCALE = 1.35;
const PDF_CAPTURE_JPEG_QUALITY = 0.86;
const BODY_CAPTURE_CLASS = 'lesson-analytics-pdf-capturing';

function hideInRoot(root: HTMLElement, selector: string): () => void {
  const nodes = [...root.querySelectorAll(selector)] as HTMLElement[];
  const saved = nodes.map((el) => ({ el, display: el.style.display }));
  for (const el of nodes) el.style.display = 'none';
  return () => {
    for (const { el, display } of saved) el.style.display = display;
  };
}

/** Элементы с этим классом скрываются при снимке карточки педагога (кнопки, подсказки). */
export const LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS = 'lesson-analytics-teacher-card__pdf-hide';

export const LESSON_ANALYTICS_TEACHER_CARD_CLASS = 'lesson-analytics-teacher-card';

function maskLessonAnalyticsTeacherCard(root: HTMLElement): () => void {
  return hideInRoot(root, `.${LESSON_ANALYTICS_TEACHER_CARD_PDF_HIDE_CLASS}`);
}

function insertPdfPreamble(
  article: HTMLElement,
  opts: { projectTitle: string; teacherLabel: string },
): () => void {
  const project = String(opts.projectTitle || '').trim() || 'Аналитика уроков';
  const teacher = String(opts.teacherLabel || '').trim();

  const box = document.createElement('div');
  box.setAttribute('data-lesson-analytics-pdf-preamble', '1');
  box.className = `lesson-analytics-pdf-preamble ${PDF_CARD_KEEP_TOGETHER_CLASS}`;

  const warn = document.createElement('p');
  warn.className = 'lesson-analytics-pdf-preamble__warn';
  warn.textContent =
    'Важно. Этот документ сформирован на основе обобщения данных опроса других педагогов (сопоставление с вашим срезом). Содержание носит рекомендательный характер и не заменяет экспертную оценку урока.';

  const brand = document.createElement('p');
  brand.className = 'lesson-analytics-pdf-preamble__brand';
  brand.textContent = 'Аналитика ИИ «Пульс»';

  const meta = document.createElement('p');
  meta.className = 'lesson-analytics-pdf-preamble__meta';
  meta.textContent = teacher ? `${project} · ${teacher}` : project;

  box.append(warn, brand, meta);
  article.insertBefore(box, article.firstChild);
  return () => {
    if (box.parentNode === article) article.removeChild(box);
  };
}

function prepareArticleForPdfCapture(article: HTMLElement): () => void {
  const saved = {
    width: article.style.width,
    maxWidth: article.style.maxWidth,
    minWidth: article.style.minWidth,
    background: article.style.background,
    boxShadow: article.style.boxShadow,
    border: article.style.border,
    margin: article.style.margin,
    className: article.className,
  };
  article.classList.add('lesson-analytics-teacher-card--pdf-capture');
  article.style.width = `${PDF_CAPTURE_WIDTH_PX}px`;
  article.style.maxWidth = `${PDF_CAPTURE_WIDTH_PX}px`;
  article.style.minWidth = `${PDF_CAPTURE_WIDTH_PX}px`;
  article.style.background = '#ffffff';
  article.style.boxShadow = 'none';
  article.style.border = '1px solid #e2e8f0';
  article.style.margin = '0 auto';
  article.style.height = 'auto';
  article.style.maxHeight = 'none';
  article.style.overflow = 'visible';
  (article.style as CSSStyleDeclaration & { contentVisibility?: string }).contentVisibility = 'visible';
  return () => {
    article.classList.remove('lesson-analytics-teacher-card--pdf-capture');
    article.style.width = saved.width;
    article.style.maxWidth = saved.maxWidth;
    article.style.minWidth = saved.minWidth;
    article.style.background = saved.background;
    article.style.boxShadow = saved.boxShadow;
    article.style.border = saved.border;
    article.style.margin = saved.margin;
    article.className = saved.className;
  };
}

function expandScrollAreasForPdf(root: HTMLElement): () => void {
  const nodes = [...root.querySelectorAll('.lesson-analytics-prose-comments-scroll')] as HTMLElement[];
  const saved = nodes.map((el) => ({
    el,
    maxHeight: el.style.maxHeight,
    overflowY: el.style.overflowY,
    overflow: el.style.overflow,
  }));
  for (const el of nodes) {
    el.style.maxHeight = 'none';
    el.style.overflowY = 'visible';
    el.style.overflow = 'visible';
  }
  return () => {
    for (const { el, maxHeight, overflowY, overflow } of saved) {
      el.style.maxHeight = maxHeight;
      el.style.overflowY = overflowY;
      el.style.overflow = overflow;
    }
  };
}

/** На время снимка скрываем остальные карточки — html2canvas не обходит весь список педагогов. */
function hideSiblingTeacherCards(article: HTMLElement): () => void {
  const parent = article.parentElement;
  if (!parent) return () => {};
  const saved: { el: HTMLElement; display: string }[] = [];
  for (const child of parent.children) {
    if (!(child instanceof HTMLElement) || child === article) continue;
    if (!child.classList.contains(LESSON_ANALYTICS_TEACHER_CARD_CLASS)) continue;
    saved.push({ el: child, display: child.style.display });
    child.style.display = 'none';
  }
  return () => {
    for (const { el, display } of saved) el.style.display = display;
  };
}

function setBodyPdfCapturing(on: boolean): () => void {
  if (typeof document === 'undefined') return () => {};
  if (on) document.body.classList.add(BODY_CAPTURE_CLASS);
  else document.body.classList.remove(BODY_CAPTURE_CLASS);
  return () => document.body.classList.remove(BODY_CAPTURE_CLASS);
}

function lessonAnalyticsPdfOnClone(clonedDoc: Document, clonedRoot: HTMLElement): void {
  const selectors = '.glass-surface, .card, .excel-filter-distribution-mini';
  for (const el of clonedRoot.querySelectorAll(selectors)) {
    if (!(el instanceof HTMLElement)) continue;
    el.style.background = '#ffffff';
    el.style.backdropFilter = 'none';
    (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'none';
    el.style.boxShadow = 'none';
  }
  for (const el of clonedRoot.querySelectorAll('.lesson-analytics-pdf-preamble')) {
    if (el instanceof HTMLElement) {
      el.style.background = '#fef2f2';
      el.style.border = '1px solid rgba(227, 6, 19, 0.28)';
    }
  }
  for (const svg of clonedRoot.querySelectorAll('svg')) {
    if (svg instanceof SVGElement) svg.setAttribute('shape-rendering', 'geometricPrecision');
  }
  void clonedDoc;
}

async function waitForPaint(): Promise<void> {
  await yieldToMain();
  await yieldToMain();
  await yieldToMain(180);
}

/**
 * PDF карточки «как на сайте»: html2canvas по DOM-статье педагога.
 */
export async function buildLessonAnalyticsTeacherPdfFromDomBase64(
  article: HTMLElement,
  projectTitle: string,
  teacherLabel = '',
): Promise<string> {
  const teacher =
    teacherLabel.trim() ||
    (article.querySelector('.lesson-analytics-teacher-card__title')?.textContent ?? '').trim();

  const removePreamble = insertPdfPreamble(article, { projectTitle, teacherLabel: teacher });
  const unmask = maskLessonAnalyticsTeacherCard(article);
  const restoreLayout = prepareArticleForPdfCapture(article);
  const restoreScroll = expandScrollAreasForPdf(article);
  const restoreSiblings = hideSiblingTeacherCards(article);
  const restoreBodyClass = setBodyPdfCapturing(true);

  try {
    article.scrollIntoView({ block: 'start', behavior: 'auto' });
    await waitForPaint();
    await yieldToMain();
    const blob = await captureElementToPdfA4Blob(article, {
      scale: PDF_CAPTURE_SCALE,
      imageFormat: 'JPEG',
      jpegQuality: PDF_CAPTURE_JPEG_QUALITY,
      html2canvas: {
        onclone: (_doc, clonedRoot) => lessonAnalyticsPdfOnClone(_doc, clonedRoot),
      },
    });
    return pdfBlobToBase64Data(blob);
  } finally {
    restoreBodyClass();
    restoreSiblings();
    restoreScroll();
    restoreLayout();
    unmask();
    removePreamble();
  }
}
