import type { jsPDF } from 'jspdf';
import { PDF_BODY_FONT } from './jsPdfEmbedFonts';

/** Активная вёрстка «2 панели на альбомном листе» для pdfEnsureY. */
let activeDualPanelLayout: PdfDualPanelLayout | null = null;

export function getActivePdfDualPanelLayout(): PdfDualPanelLayout | null {
  return activeDualPanelLayout;
}

export function setActivePdfDualPanelLayout(layout: PdfDualPanelLayout | null): void {
  activeDualPanelLayout = layout;
}

/**
 * Альбомный A4: две логические «страницы» на одном листе (верхняя и нижняя панели).
 */
export class PdfDualPanelLayout {
  readonly doc: jsPDF;
  readonly margin: number;
  readonly gutter: number;
  readonly pageW: number;
  readonly pageH: number;
  readonly maxW: number;
  readonly panelH: number;
  readonly useHeadingTypography = true;

  private panelIndex: 0 | 1 = 0;
  private dualPanelEnabled = false;

  constructor(doc: jsPDF, opts?: { margin?: number; gutter?: number }) {
    this.doc = doc;
    this.margin = opts?.margin ?? 34;
    this.gutter = opts?.gutter ?? 12;
    this.pageW = doc.internal.pageSize.getWidth();
    this.pageH = doc.internal.pageSize.getHeight();
    this.maxW = this.pageW - this.margin * 2;
    this.panelH = (this.pageH - this.margin * 2 - this.gutter) / 2;
  }

  enableDualPanel(): void {
    this.dualPanelEnabled = true;
    this.panelIndex = 0;
    this.drawPanelSeparator();
  }

  isDualPanelEnabled(): boolean {
    return this.dualPanelEnabled;
  }

  panelTopY(index: 0 | 1): number {
    return this.margin + index * (this.panelH + this.gutter);
  }

  contentStartY(): number {
    return this.panelTopY(this.panelIndex) + 10;
  }

  ensureY(y: number, need: number): number {
    const top = this.panelTopY(this.panelIndex);
    const bottom = top + this.panelH;
    let yy = y < top + 6 ? top + 10 : y;

    if (yy + need <= bottom - 4) return yy;

    if (this.panelIndex === 0) {
      this.panelIndex = 1;
      return this.panelTopY(1) + 10;
    }

    this.doc.addPage();
    this.panelIndex = 0;
    this.drawPanelSeparator();
    return this.panelTopY(0) + 10;
  }

  drawPanelSeparator(): void {
    const mid = this.panelTopY(1) - this.gutter / 2;
    this.doc.setDrawColor(226, 232, 240);
    this.doc.setLineWidth(0.6);
    this.doc.setLineDashPattern([4, 3], 0);
    this.doc.line(this.margin, mid, this.pageW - this.margin, mid);
    this.doc.setLineDashPattern([], 0);
  }

  drawFooters(footerLine: string, dateStr: string): void {
    const total = this.doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      this.doc.setPage(i);
      this.doc.setFont(PDF_BODY_FONT, 'normal');
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(130, 130, 130);
      const foot = footerLine.length > 110 ? `${footerLine.slice(0, 107)}…` : footerLine;
      this.doc.text(foot, this.margin, this.pageH - 14);
      const pageLabel = `Лист ${i} / ${total}`;
      this.doc.text(pageLabel, this.pageW - this.margin - this.doc.getTextWidth(pageLabel), this.pageH - 14);
      this.doc.text(dateStr, this.pageW / 2 - this.doc.getTextWidth(dateStr) / 2, this.pageH - 14);
    }
  }
}
