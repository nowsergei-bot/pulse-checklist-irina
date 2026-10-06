import type { jsPDF } from 'jspdf';
import { PDF_BODY_FONT, PDF_HEADING_FONT } from './jsPdfEmbedFonts';
import { getActivePdfDualPanelLayout } from './pdfDualPanelLayout';
import { getActivePdfLessonReportLayout } from './pdfLessonReportLayout';

export const PDF_COLOR_RED: [number, number, number] = [227, 6, 19];
export const PDF_COLOR_RED_DEEP: [number, number, number] = [185, 28, 28];
const COLOR_AXIS: [number, number, number] = [200, 200, 200];
const COLOR_PANEL: [number, number, number] = [248, 250, 252];
const COLOR_PANEL_BORDER: [number, number, number] = [203, 213, 225];

function panelTitleFont(): string {
  if (getActivePdfLessonReportLayout()) return PDF_BODY_FONT;
  const layout = getActivePdfDualPanelLayout();
  return layout?.useHeadingTypography ? PDF_HEADING_FONT : PDF_BODY_FONT;
}

export function pdfEnsureY(doc: jsPDF, y: number, need: number, margin: number): number {
  const lesson = getActivePdfLessonReportLayout();
  if (lesson) return lesson.ensureY(y, need);

  const layout = getActivePdfDualPanelLayout();
  if (layout?.isDualPanelEnabled()) return layout.ensureY(y, need);

  const h = doc.internal.pageSize.getHeight();
  if (y + need > h - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

/** Горизонтальные бары в панели (как в аналитике уроков). */
export function drawPdfBarGroup(
  doc: jsPDF,
  margin: number,
  y: number,
  maxW: number,
  title: string,
  items: { label: string; value: number }[],
  color: [number, number, number],
): number {
  const panelPad = 12;
  const labelW = Math.min(240, Math.max(140, Math.floor(maxW * 0.42)));
  const barAreaW = Math.max(72, maxW - labelW - panelPad * 2 - 36);
  const barH = 13;

  const titleLines = doc.splitTextToSize(title, maxW - panelPad * 2);
  let estH = panelPad + titleLines.length * 14 + 10;
  for (const it of items) {
    const labelLines = doc.splitTextToSize(String(it.label || '—'), labelW - 6);
    const rowH = Math.max(barH, 12 + (labelLines.length - 1) * 11);
    estH += rowH + 8;
  }
  estH += panelPad;

  y = pdfEnsureY(doc, y, estH + 20, margin);
  const panelTop = y;

  doc.setFillColor(...COLOR_PANEL);
  doc.setDrawColor(...COLOR_PANEL_BORDER);
  doc.setLineWidth(0.45);
  doc.roundedRect(margin, panelTop, maxW, estH, 5, 5, 'FD');

  let yy = panelTop + panelPad + 10;
  doc.setFont(panelTitleFont(), 'bold');
  doc.setFontSize(getActivePdfDualPanelLayout()?.useHeadingTypography ? 10.5 : 11);
  doc.setTextColor(15, 23, 42);
  for (const ln of titleLines) {
    doc.text(ln, margin + panelPad, yy);
    yy += 14;
  }
  yy += 4;

  doc.setFont(PDF_BODY_FONT, 'normal');
  doc.setFontSize(9);
  const maxVal = Math.max(1, ...items.map((i) => i.value));

  for (const it of items) {
    const labelLines = doc.splitTextToSize(String(it.label || '—'), labelW - 6);
    const rowH = Math.max(barH, 12 + (labelLines.length - 1) * 11);
    yy = pdfEnsureY(doc, yy, rowH + 10, margin);
    doc.setTextColor(51, 65, 85);
    let ly = yy + 10;
    for (const ln of labelLines) {
      doc.text(ln, margin + panelPad, ly);
      ly += 11;
    }
    const barY = yy + (rowH - barH) / 2;
    const barX = margin + panelPad + labelW;
    const bw = (it.value / maxVal) * barAreaW;
    doc.setDrawColor(...COLOR_AXIS);
    doc.rect(barX, barY, barAreaW, barH, 'S');
    doc.setFillColor(...color);
    const valStr = Number.isInteger(it.value) ? String(it.value) : it.value.toFixed(2).replace(/\.?0+$/, '');
    doc.setFont(PDF_BODY_FONT, 'bold');
    doc.setFontSize(9);
    const valW = doc.getTextWidth(valStr);
    const pad = 6;
    let fillW = Math.max(0, Math.min(barAreaW, bw));
    if (valW + pad > fillW && valW + pad <= barAreaW) {
      fillW = valW + pad;
    }
    if (fillW > 0.5) {
      doc.rect(barX, barY, fillW, barH, 'F');
      doc.setTextColor(255, 255, 255);
      const valX = barX + Math.max(3, (fillW - valW) / 2);
      doc.text(valStr, valX, barY + 9);
    } else {
      doc.setTextColor(51, 65, 85);
      doc.text(valStr, barX + barAreaW + 6, barY + 9);
    }
    doc.setFont(PDF_BODY_FONT, 'normal');
    yy += rowH + 8;
  }

  return panelTop + estH + 16;
}

type CompactBarPanelOpts = { maxItems?: number; ultraNarrow?: boolean };

function compactBarPanelLayout(
  doc: jsPDF,
  maxW: number,
  title: string,
  items: { label: string; value: number }[],
  opts?: CompactBarPanelOpts,
) {
  const maxItems = opts?.maxItems ?? 24;
  const slice = items.slice(0, maxItems);
  const ultraNarrow = opts?.ultraNarrow === true || maxW < 200;
  const panelPad = ultraNarrow ? 4 : 6;
  const innerW = maxW - panelPad * 2;
  const labelW = ultraNarrow
    ? Math.min(92, Math.max(64, Math.floor(innerW * 0.42)))
    : Math.min(200, Math.max(100, Math.floor(innerW * 0.36)));
  const barH = ultraNarrow ? 6 : 7;
  const titleLineH = ultraNarrow ? 8 : 10;
  const titleMaxLines = ultraNarrow ? 2 : 4;
  const titleLines = doc.splitTextToSize(title, maxW - panelPad * 2).slice(0, titleMaxLines);
  const labelMaxLines = ultraNarrow ? 1 : 2;
  const textMaxW = maxW - panelPad * 2;
  const barAreaW = Math.max(ultraNarrow ? 18 : 40, innerW - labelW - (ultraNarrow ? 4 : 8));

  const clipLabel = (shortLab: string) =>
    ultraNarrow && shortLab.length > 22
      ? `${shortLab.slice(0, 20)}…`
      : shortLab.length > 42
        ? `${shortLab.slice(0, 40)}…`
        : shortLab;

  let estH = panelPad + titleLines.length * titleLineH + 6;
  const rows: { labelLines: string[]; rowH: number }[] = [];
  for (const it of slice) {
    const clipped = clipLabel(String(it.label || '—'));
    const labelLines = doc.splitTextToSize(clipped, labelW - 4).slice(0, labelMaxLines);
    const rowH = Math.max(barH, (ultraNarrow ? 7 : 8) + (labelLines.length - 1) * (ultraNarrow ? 7 : 8));
    rows.push({ labelLines, rowH });
    estH += rowH + (ultraNarrow ? 3 : 4);
  }
  estH += panelPad;

  return { slice, ultraNarrow, panelPad, labelW, barH, titleLineH, titleLines, textMaxW, barAreaW, estH, rows };
}

/** Оценка высоты компактной панели (перенос строки диаграмм на следующую страницу). */
export function estimatePdfBarGroupCompactHeight(
  doc: jsPDF,
  maxW: number,
  title: string,
  items: { label: string; value: number }[],
  opts?: CompactBarPanelOpts,
): number {
  if (!items.length) return 0;
  return compactBarPanelLayout(doc, maxW, title, items, opts).estH + 8;
}

/** Компактные бары: все столбики, короткие подписи, без обрезки панели. */
export function drawPdfBarGroupCompact(
  doc: jsPDF,
  margin: number,
  y: number,
  maxW: number,
  title: string,
  items: { label: string; value: number }[],
  color: [number, number, number],
  opts?: CompactBarPanelOpts,
): number {
  const layout = compactBarPanelLayout(doc, maxW, title, items, opts);
  const { slice, ultraNarrow, panelPad, labelW, barH, titleLineH, titleLines, textMaxW, barAreaW, estH, rows } =
    layout;
  if (slice.length === 0) return y;

  y = pdfEnsureY(doc, y, estH + 8, margin);

  const panelTop = y;
  const panelRight = margin + maxW;
  const textRight = panelRight - panelPad;
  const safeTextX = (x: number, str: string) =>
    Math.min(x, Math.max(margin + panelPad, textRight - doc.getTextWidth(str)));

  doc.setFillColor(...COLOR_PANEL);
  doc.setDrawColor(...COLOR_PANEL_BORDER);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, panelTop, maxW, estH, 4, 4, 'FD');

  let yy = panelTop + panelPad + (ultraNarrow ? 6 : 7);
  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(ultraNarrow ? 6.5 : 8);
  doc.setTextColor(15, 23, 42);
  for (const ln of titleLines) {
    doc.text(ln, margin + panelPad, yy, { maxWidth: textMaxW });
    yy += titleLineH;
  }
  yy += 2;

  doc.setFont(PDF_BODY_FONT, 'normal');
  doc.setFontSize(ultraNarrow ? 5.5 : 6.5);
  const maxVal = Math.max(1, ...slice.map((i) => i.value));
  const barX0 = margin + panelPad + labelW;

  for (let ri = 0; ri < slice.length; ri++) {
    const it = slice[ri]!;
    const { labelLines, rowH } = rows[ri]!;
    doc.setTextColor(51, 65, 85);
    let ly = yy + (ultraNarrow ? 5 : 6);
    for (const ln of labelLines) {
      doc.text(ln, margin + panelPad, ly, { maxWidth: labelW - 4 });
      ly += ultraNarrow ? 7 : 8;
    }
    const barY = yy + (rowH - barH) / 2;
    const barX = barX0;
    let bw = Math.max(0, Math.min(barAreaW - 2, (it.value / maxVal) * barAreaW));
    doc.setDrawColor(...COLOR_AXIS);
    doc.rect(barX, barY, barAreaW, barH, 'S');
    doc.setFillColor(...color);

    doc.setFont(PDF_BODY_FONT, 'bold');
    doc.setFontSize(ultraNarrow ? 5.5 : 6.5);
    const valStr = Number.isInteger(it.value) ? String(it.value) : it.value.toFixed(2).replace(/\.?0+$/, '');
    const valW = doc.getTextWidth(valStr);
    const pad = 4;
    const needW = valW + pad;
    if (needW > bw && needW <= barAreaW) {
      bw = needW;
    }
    bw = Math.min(bw, barAreaW);
    if (bw > 0.5) {
      doc.rect(barX, barY, bw, barH, 'F');
      doc.setTextColor(255, 255, 255);
      const valX = safeTextX(barX + Math.max(2, (bw - valW) / 2), valStr);
      doc.text(valStr, valX, barY + barH / 2 + (ultraNarrow ? 2 : 2.5), { maxWidth: bw });
    } else {
      doc.setTextColor(51, 65, 85);
      const valX = safeTextX(barX + barAreaW + 2, valStr);
      if (valX + valW <= textRight + 0.5) {
        doc.text(valStr, valX, barY + (ultraNarrow ? 4.5 : 5.5));
      }
    }
    doc.setFont(PDF_BODY_FONT, 'normal');
    yy += rowH + (ultraNarrow ? 3 : 4);
  }

  return panelTop + estH + 8;
}
