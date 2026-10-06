import type { jsPDF } from 'jspdf';
import { PDF_BODY_FONT } from './jsPdfEmbedFonts';

let activeLessonReportLayout: PdfLessonReportLayout | null = null;

export function getActivePdfLessonReportLayout(): PdfLessonReportLayout | null {
  return activeLessonReportLayout;
}

export function setActivePdfLessonReportLayout(layout: PdfLessonReportLayout | null): void {
  activeLessonReportLayout = layout;
}

/** Альбомный отчёт: полная высота листа, не более maxPages, без двух панелей на лист. */
export class PdfLessonReportLayout {
  readonly doc: jsPDF;
  readonly margin: number;
  readonly pageW: number;
  readonly pageH: number;
  readonly maxW: number;
  readonly maxPages: number;
  readonly footerReserve = 20;
  readonly useHeadingTypography = false;

  constructor(doc: jsPDF, opts?: { margin?: number; maxPages?: number }) {
    this.doc = doc;
    this.margin = opts?.margin ?? 32;
    this.maxPages = opts?.maxPages ?? 3;
    this.pageW = doc.internal.pageSize.getWidth();
    this.pageH = doc.internal.pageSize.getHeight();
    this.maxW = this.pageW - this.margin * 2;
  }

  get contentBottom(): number {
    return this.pageH - this.margin - this.footerReserve;
  }

  canAddPage(): boolean {
    return this.doc.getNumberOfPages() < this.maxPages;
  }

  ensureY(y: number, need: number): number {
    const top = this.margin + 4;
    let yy = y < top ? top : y;
    if (yy + need <= this.contentBottom) return yy;
    if (!this.canAddPage()) return yy;
    this.doc.addPage();
    return top;
  }

  /** Заголовок не остаётся внизу листа без тела блока (minTail — минимум места под контент). */
  ensureBlockStart(y: number, blockHeight: number, minTail = 48): number {
    const top = this.margin + 4;
    let yy = y < top ? top : y;
    const room = this.contentBottom - yy;
    if (room >= blockHeight || room >= minTail + 20) return yy;
    if (!this.canAddPage()) return yy;
    this.doc.addPage();
    return top;
  }

  /** Принудительно новая страница (если на текущей уже есть контент). */
  forcePageBreak(y: number): number {
    const top = this.margin + 4;
    if (y <= top + 8) return y;
    if (!this.canAddPage()) return y;
    this.doc.addPage();
    return top;
  }

  drawFooters(
    footerLine: string,
    dateStr: string,
    opts?: { showPageNumbers?: boolean; showGeneratedDate?: boolean },
  ): void {
    const showPageNumbers = opts?.showPageNumbers !== false;
    const showGeneratedDate = opts?.showGeneratedDate !== false;
    const total = this.doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      this.doc.setPage(i);
      this.doc.setFont(PDF_BODY_FONT, 'normal');
      this.doc.setFontSize(7);
      this.doc.setTextColor(130, 130, 130);
      const foot = footerLine.length > 100 ? `${footerLine.slice(0, 97)}…` : footerLine;
      this.doc.text(foot, this.margin, this.pageH - 12);
      if (showPageNumbers) {
        const pageLabel = `Стр. ${i} / ${total}`;
        this.doc.text(pageLabel, this.pageW - this.margin - this.doc.getTextWidth(pageLabel), this.pageH - 12);
      }
      if (showGeneratedDate) {
        this.doc.text(dateStr, this.pageW / 2 - this.doc.getTextWidth(dateStr) / 2, this.pageH - 12);
      }
    }
  }
}
