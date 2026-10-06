import { jsPDF } from 'jspdf';
import { PDF_BODY_FONT, PDF_HEADING_FONT, registerPdfFontsFromBase64, type PdfFontPack } from '../../../lib/pdf/jsPdfEmbedFonts.ts';
import type { PdfOp, TeacherCardPdfLayout } from './types.ts';

export type PdfRenderAssets = {
  fonts?: PdfFontPack | null;
  photoJpeg?: string | null;
};

function fontName(op: Extract<PdfOp, { t: 'text' }>, hasFonts: boolean): string {
  if (!hasFonts) return 'helvetica';
  return op.font === 'head' ? PDF_HEADING_FONT : PDF_BODY_FONT;
}

function drawOp(doc: jsPDF, op: PdfOp, assets: PdfRenderAssets): void {
  const hasFonts = Boolean(assets.fonts);
  if (op.t === 'text') {
    doc.setFont(fontName(op, hasFonts), op.bold ? 'bold' : 'normal');
    doc.setFontSize(op.size);
    doc.setTextColor(...op.color);
    doc.text(op.s, op.x, op.y);
    return;
  }
  if (op.t === 'rect') {
    if (op.fill) doc.setFillColor(...op.fill);
    if (op.stroke) {
      doc.setDrawColor(...op.stroke);
      doc.setLineWidth(op.lw || 0.4);
    }
    const style = op.fill && op.stroke ? 'FD' : op.fill ? 'F' : 'S';
    if (op.r) doc.roundedRect(op.x, op.y, op.w, op.h, op.r, op.r, style);
    else doc.rect(op.x, op.y, op.w, op.h, style);
    return;
  }
  if (op.t === 'line') {
    doc.setDrawColor(...op.color);
    doc.setLineWidth(op.lw);
    doc.line(op.x1, op.y1, op.x2, op.y2);
    return;
  }
  if (op.t === 'poly') {
    const { pts } = op;
    if (pts.length < 2) return;
    if (op.stroke) {
      doc.setDrawColor(...op.stroke);
      doc.setLineWidth(op.lw || 0.8);
    }
    if (op.fill) doc.setFillColor(...op.fill);
    const style = op.fill && op.stroke ? 'FD' : op.fill ? 'F' : 'S';
    doc.lines(
      pts.slice(1).map((p, i) => [p[0] - pts[i]![0], p[1] - pts[i]![1]]),
      pts[0]![0],
      pts[0]![1],
      [1, 1],
      style,
      Boolean(op.close),
    );
    return;
  }
  if (op.t === 'image' && assets.photoJpeg) {
    doc.addImage(assets.photoJpeg, 'JPEG', op.x, op.y, op.w, op.h);
  }
}

export async function renderTeacherCardPdf(layout: TeacherCardPdfLayout, assets: PdfRenderAssets = {}): Promise<Blob> {
  if (!assets.fonts) {
    throw new Error('Не удалось подключить шрифты PDF');
  }
  const first = layout.pages[0];
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  registerPdfFontsFromBase64(doc, assets.fonts);
  layout.pages.forEach((page, i) => {
    if (i > 0) doc.addPage([page.width, page.height], 'portrait');
    for (const op of page.ops) drawOp(doc, op, assets);
    void first;
  });
  return doc.output('blob');
}

export function pdfPageCountFromBlobBytes(bytes: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(bytes);
  const m = text.match(/\/Type\s*\/Pages[\s\S]{0,200}\/Count\s+(\d+)/);
  return m ? Number(m[1]) : 0;
}

export function pdfHasRasterPage(bytes: Uint8Array): boolean {
  const text = new TextDecoder('latin1').decode(bytes);
  const images = [...text.matchAll(/\/Subtype\s*\/Image/g)].length;
  return images > 4;
}
