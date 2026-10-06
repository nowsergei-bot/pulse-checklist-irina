import type { jsPDF } from 'jspdf';
import { PHENOMENAL_METRIC_MAX, scaleLevelsForMetric, type PhenomenalCompetencyKey } from '../phenomenalLessons/competencyScores';
import { PHENOMENAL_RUBRIC_DIMENSIONS } from '../phenomenalLessons/phenomenalRubricDimensions';
import type { TeacherLessonChecklistRow } from '../phenomenalLessons/parseTeacherChecklistApril';
import { parseUsedScaleLevelsFromRubricText } from '../phenomenalLessons/rubricUsageLevels';
import { PDF_BODY_FONT, PDF_HEADING_FONT } from './jsPdfEmbedFonts';
import { PDF_COLOR_RED, PDF_COLOR_RED_DEEP, drawPdfBarGroup, pdfEnsureY } from './jsPdfBarPanel';
import { getActivePdfDualPanelLayout } from './pdfDualPanelLayout';

function pdfChartHeadingFont(): string {
  return getActivePdfDualPanelLayout()?.useHeadingTypography ? PDF_HEADING_FONT : PDF_BODY_FONT;
}

const PANEL_BG: [number, number, number] = [248, 250, 252];
const PANEL_BORDER: [number, number, number] = [203, 213, 225];
const AXIS: [number, number, number] = [200, 200, 200];

export type PdfLinePoint = { label: string; value: number | null };

/**
 * Линейный график одной числовой серии (баллы или /10).
 * Возвращает y после блока.
 */
export function drawPdfLineChart(
  doc: jsPDF,
  margin: number,
  y: number,
  maxW: number,
  title: string,
  series: PdfLinePoint[],
  lineColor: [number, number, number],
): number {
  const pts = series
    .map((s, i) => ({ i, v: s.value }))
    .filter((x): x is { i: number; v: number } => x.v != null && Number.isFinite(x.v));
  if (pts.length === 0) return y;

  const chartH = 100;
  const titleH = 22;
  const pad = 10;
  const leftGutter = 34;
  const bottomGutter = 28;
  const blockH = titleH + chartH + bottomGutter + pad * 2;

  y = pdfEnsureY(doc, y, blockH + 24, margin);

  doc.setFillColor(...PANEL_BG);
  doc.setDrawColor(...PANEL_BORDER);
  doc.setLineWidth(0.45);
  doc.roundedRect(margin, y, maxW, blockH, 5, 5, 'FD');

  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin + pad, y + pad + 10);

  const innerX = margin + pad + leftGutter;
  const innerY = y + titleH + pad;
  const innerW = maxW - pad * 2 - leftGutter - 8;
  const innerH = chartH - 8;

  const vals = pts.map((p) => p.v);
  let vmin = Math.min(...vals);
  let vmax = Math.max(...vals);
  if (vmin === vmax) {
    vmin -= 1;
    vmax += 1;
  }
  const span = vmax - vmin || 1;

  doc.setDrawColor(...AXIS);
  doc.setLineWidth(0.35);
  doc.rect(innerX, innerY, innerW, innerH, 'S');

  const n = series.length;
  const xAt = (idx: number) => innerX + (n <= 1 ? innerW / 2 : (idx / (n - 1)) * innerW);
  const yAt = (v: number) => innerY + innerH - ((v - vmin) / span) * innerH;

  doc.setFont(PDF_BODY_FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(String(Math.round(vmax * 10) / 10), margin + pad, innerY + 8);
  doc.text(String(Math.round(vmin * 10) / 10), margin + pad, innerY + innerH);

  doc.setDrawColor(...lineColor);
  doc.setLineWidth(1.2);
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    doc.line(xAt(a.i), yAt(a.v), xAt(b.i), yAt(b.v));
  }
  doc.setFillColor(...lineColor);
  for (const p of pts) {
    doc.circle(xAt(p.i), yAt(p.v), 2.2, 'F');
  }

  doc.setFont(PDF_BODY_FONT, 'normal');
  doc.setFontSize(6);
  doc.setTextColor(90, 90, 90);
  const maxLabels = Math.min(n, 12);
  const step = Math.max(1, Math.ceil(n / maxLabels));
  for (let i = 0; i < n; i += step) {
    const lab = series[i]?.label || String(i + 1);
    const short = lab.length > 10 ? `${lab.slice(0, 9)}…` : lab;
    const tw = doc.getTextWidth(short);
    const tx = xAt(i) - tw / 2;
    doc.text(short, Math.max(innerX, Math.min(innerX + innerW - tw, tx)), innerY + innerH + 14);
  }

  return y + blockH + 14;
}

const COMPACT_LINE_TITLE_H = 14;
const COMPACT_LINE_CHART_H = 48;
const COMPACT_LINE_BOTTOM = 18;
const COMPACT_LINE_PAD = 5;
const COMPACT_LINE_LEFT = 26;

/** Компактный линейный график без смены страницы (для «один ребёнок — один лист»). */
export function drawPdfLineChartCompact(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  title: string,
  series: PdfLinePoint[],
  lineColor: [number, number, number],
): number {
  const pts = series
    .map((s, i) => ({ i, v: s.value }))
    .filter((x): x is { i: number; v: number } => x.v != null && Number.isFinite(x.v));
  if (pts.length === 0) return y;

  const chartH = COMPACT_LINE_CHART_H;
  const titleH = COMPACT_LINE_TITLE_H;
  const pad = COMPACT_LINE_PAD;
  const leftGutter = COMPACT_LINE_LEFT;
  const bottomGutter = COMPACT_LINE_BOTTOM;
  const blockH = titleH + chartH + bottomGutter + pad * 2;

  doc.setFillColor(...PANEL_BG);
  doc.setDrawColor(...PANEL_BORDER);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, blockH, 4, 4, 'FD');

  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  const tLines = doc.splitTextToSize(title, w - pad * 2);
  doc.text(tLines[0] || title, x + pad, y + pad + 8);

  const innerX = x + pad + leftGutter;
  const innerY = y + titleH + pad + 2;
  const innerW = w - pad * 2 - leftGutter - 6;
  const innerH = chartH - 6;

  const vals = pts.map((p) => p.v);
  let vmin = Math.min(...vals);
  let vmax = Math.max(...vals);
  if (vmin === vmax) {
    vmin -= 1;
    vmax += 1;
  }
  const span = vmax - vmin || 1;

  doc.setDrawColor(...AXIS);
  doc.setLineWidth(0.3);
  doc.rect(innerX, innerY, innerW, innerH, 'S');

  const n = series.length;
  const xAt = (idx: number) => innerX + (n <= 1 ? innerW / 2 : (idx / (n - 1)) * innerW);
  const yAt = (v: number) => innerY + innerH - ((v - vmin) / span) * innerH;

  doc.setFont(PDF_BODY_FONT, 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text(String(Math.round(vmax * 10) / 10), x + pad, innerY + 7);
  doc.text(String(Math.round(vmin * 10) / 10), x + pad, innerY + innerH);

  doc.setDrawColor(...lineColor);
  doc.setLineWidth(1);
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    doc.line(xAt(a.i), yAt(a.v), xAt(b.i), yAt(b.v));
  }
  doc.setFillColor(...lineColor);
  for (const p of pts) {
    doc.circle(xAt(p.i), yAt(p.v), 1.8, 'F');
  }

  doc.setFont(PDF_BODY_FONT, 'normal');
  doc.setFontSize(5);
  doc.setTextColor(90, 90, 90);
  const maxLabels = Math.min(n, 10);
  const step = Math.max(1, Math.ceil(n / maxLabels));
  for (let i = 0; i < n; i += step) {
    const lab = series[i]?.label || String(i + 1);
    const short = lab.length > 8 ? `${lab.slice(0, 7)}…` : lab;
    const tw = doc.getTextWidth(short);
    const tx = xAt(i) - tw / 2;
    doc.text(short, Math.max(innerX, Math.min(innerX + innerW - tw, tx)), innerY + innerH + 11);
  }

  return y + blockH + 4;
}

export function leadershipCompactLineBlockHeight(): number {
  return COMPACT_LINE_TITLE_H + COMPACT_LINE_CHART_H + COMPACT_LINE_BOTTOM + COMPACT_LINE_PAD * 2 + 4;
}

/** Два компактных графика в один ряд (баллы + /10) или один на всю ширину. */
export function drawPdfLeadershipDynamicsRow(
  doc: jsPDF,
  margin: number,
  y: number,
  maxW: number,
  pointsSeries: PdfLinePoint[],
  selfSeries: PdfLinePoint[],
  hasPoints: boolean,
  hasSelf: boolean,
): number {
  const gap = 5;
  const h = leadershipCompactLineBlockHeight();
  if (hasPoints && hasSelf) {
    const half = (maxW - gap) / 2;
    drawPdfLineChartCompact(doc, margin, y, half, 'Баллы по записям', pointsSeries, PDF_COLOR_RED);
    drawPdfLineChartCompact(doc, margin + half + gap, y, half, 'Оценка /10', selfSeries, PDF_COLOR_RED_DEEP);
    return y + h;
  }
  if (hasPoints) {
    return drawPdfLineChartCompact(doc, margin, y, maxW, 'Баллы по записям', pointsSeries, PDF_COLOR_RED);
  }
  if (hasSelf) {
    return drawPdfLineChartCompact(doc, margin, y, maxW, 'Оценка /10 по записям', selfSeries, PDF_COLOR_RED_DEEP);
  }
  return y;
}

export type LeadershipPdfTileRow = {
  label: string;
  experience: string;
  points: number | null;
  self10: number | null;
};

/** Компактные плитки записей с типом опыта (лидерский сертификат). */
export function drawPdfLeadershipRecordTilesCompact(
  doc: jsPDF,
  margin: number,
  y: number,
  maxW: number,
  title: string,
  rows: LeadershipPdfTileRow[],
): number {
  const maxRows = 48;
  const slice = rows.slice(0, maxRows);
  if (slice.length === 0) return y;

  const cols = 4;
  const gap = 5;
  const tileW = (maxW - gap * (cols - 1)) / cols;
  const tileH = 44;
  const headH = 11;

  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin, y + 8);
  y += headH;

  for (let i = 0; i < slice.length; i += cols) {
    const rowSlice = slice.slice(i, i + cols);
    for (let c = 0; c < rowSlice.length; c++) {
      const it = rowSlice[c];
      const tx = margin + c * (tileW + gap);
      doc.setFillColor(...PANEL_BG);
      doc.setDrawColor(...PANEL_BORDER);
      doc.roundedRect(tx, y, tileW, tileH, 3, 3, 'FD');

      doc.setFont(PDF_BODY_FONT, 'bold');
      doc.setFontSize(6);
      doc.setTextColor(51, 65, 85);
      const labLines = doc.splitTextToSize(it.label, tileW - 8);
      let ly = y + 8;
      for (const ln of labLines.slice(0, 1)) {
        doc.text(ln, tx + 4, ly);
        ly += 7;
      }

      doc.setFont(PDF_BODY_FONT, 'normal');
      doc.setFontSize(5.2);
      doc.setTextColor(90, 95, 110);
      const expRaw = (it.experience || '—').trim() || '—';
      const expLines = doc.splitTextToSize(`Опыт: ${expRaw}`, tileW - 8);
      for (const ln of expLines.slice(0, 2)) {
        doc.text(ln, tx + 4, ly);
        ly += 6.5;
      }

      doc.setFont(PDF_BODY_FONT, 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...PDF_COLOR_RED);
      const pStr = it.points != null && Number.isFinite(it.points) ? String(it.points) : '—';
      const sStr = it.self10 != null && Number.isFinite(it.self10) ? String(it.self10) : '—';
      doc.text(`Баллы: ${pStr}  ·  /10: ${sStr}`, tx + 4, y + tileH - 5);
    }
    y += tileH + gap;
  }

  if (rows.length > maxRows) {
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`… и ещё ${rows.length - maxRows} записей`, margin, y + 6);
    y += 10;
  }

  return y + 4;
}

/** Плитки по каждой записи: дата, баллы, /10. */
export function drawPdfPointsTileGrid(
  doc: jsPDF,
  margin: number,
  y: number,
  maxW: number,
  title: string,
  rows: { label: string; points: number | null; self10: number | null }[],
): number {
  const maxRows = 40;
  const slice = rows.slice(0, maxRows);
  if (slice.length === 0) return y;

  const cols = 3;
  const gap = 8;
  const tileW = (maxW - gap * (cols - 1)) / cols;
  const tileH = 52;
  const headH = 20;

  y = pdfEnsureY(doc, y, headH + 16, margin);
  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin, y + 12);
  y += headH;

  for (let i = 0; i < slice.length; i += cols) {
    const rowSlice = slice.slice(i, i + cols);
    y = pdfEnsureY(doc, y, tileH + gap + 10, margin);
    for (let c = 0; c < rowSlice.length; c++) {
      const it = rowSlice[c];
      const tx = margin + c * (tileW + gap);
      doc.setFillColor(...PANEL_BG);
      doc.setDrawColor(...PANEL_BORDER);
      doc.roundedRect(tx, y, tileW, tileH, 4, 4, 'FD');
      doc.setFont(PDF_BODY_FONT, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      const lab = doc.splitTextToSize(it.label, tileW - 10);
      let ly = y + 10;
      for (const ln of lab.slice(0, 2)) {
        doc.text(ln, tx + 5, ly);
        ly += 9;
      }
      doc.setFont(PDF_BODY_FONT, 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...PDF_COLOR_RED);
      const pStr = it.points != null && Number.isFinite(it.points) ? String(it.points) : '—';
      const sStr = it.self10 != null && Number.isFinite(it.self10) ? String(it.self10) : '—';
      doc.text(`Баллы: ${pStr}`, tx + 5, y + 32);
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`/10: ${sStr}`, tx + 5, y + 44);
    }
    y += tileH + gap;
  }

  if (rows.length > maxRows) {
    y = pdfEnsureY(doc, y, 14, margin);
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`… и ещё ${rows.length - maxRows} записей`, margin, y);
    y += 12;
  }

  return y + 8;
}

/** Крупные плитки со средними/значениями критериев (аналитика уроков). */
export function drawPdfMetricTiles(
  doc: jsPDF,
  margin: number,
  y: number,
  maxW: number,
  title: string,
  tiles: { label: string; value: string }[],
): number {
  if (tiles.length === 0) return y;

  const cols = Math.min(4, Math.max(2, tiles.length <= 4 ? tiles.length : 4));
  const gap = 10;
  const tileW = (maxW - gap * (cols - 1)) / cols;
  const tileH = 56;
  const headH = 18;
  const rows = Math.ceil(tiles.length / cols);
  const totalH = headH + rows * (tileH + gap) + 8;

  y = pdfEnsureY(doc, y, totalH + 20, margin);

  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin, y + 12);
  y += headH;

  for (let i = 0; i < tiles.length; i += cols) {
    const row = tiles.slice(i, i + cols);
    y = pdfEnsureY(doc, y, tileH + gap + 6, margin);
    for (let c = 0; c < row.length; c++) {
      const t = row[c];
      const tx = margin + c * (tileW + gap);
      doc.setFillColor(...PANEL_BG);
      doc.setDrawColor(...PANEL_BORDER);
      doc.roundedRect(tx, y, tileW, tileH, 4, 4, 'FD');
      doc.setFont(PDF_BODY_FONT, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      const lines = doc.splitTextToSize(t.label, tileW - 10);
      let ly = y + 10;
      for (const ln of lines.slice(0, 3)) {
        doc.text(ln, tx + 6, ly);
        ly += 9;
      }
      doc.setFont(PDF_BODY_FONT, 'bold');
      const v = t.value;
      doc.setFontSize(v.length > 22 ? 11 : v.length > 14 ? 13 : 16);
      doc.setTextColor(...PDF_COLOR_RED);
      const vLines = doc.splitTextToSize(v, tileW - 12);
      let vy = y + tileH - 12 - Math.max(0, (vLines.length - 1) * 11);
      for (const vl of vLines.slice(0, 2)) {
        doc.text(vl, tx + 6, vy);
        vy += 11;
      }
    }
    y += tileH + gap;
  }

  return y + 10;
}

/** Две полосы-сравнения (объём текста и т.п.). */
export function drawPdfTwoBarComparison(
  doc: jsPDF,
  margin: number,
  y: number,
  maxW: number,
  title: string,
  a: { label: string; value: number },
  b: { label: string; value: number },
): number {
  const items = [
    { label: a.label, value: Math.max(0, a.value) },
    { label: b.label, value: Math.max(0, b.value) },
  ];
  return drawPdfBarGroup(doc, margin, y, maxW, title, items, PDF_COLOR_RED_DEEP);
}

const PDF_RUBRIC_ON: [number, number, number] = [211, 47, 47];
const PDF_RUBRIC_OFF: [number, number, number] = [232, 234, 246];
const HEAT_LEVELS = [0, 1, 2, 3, 4] as const;

/** Матрица «Какие уровни шкалы отражены в ответе» (как в интерфейсе феноменальных уроков). */
export function drawPdfPhenomenalRubricHeatmap(
  doc: jsPDF,
  margin: number,
  y: number,
  maxW: number,
  row: TeacherLessonChecklistRow,
): number {
  const rows = PHENOMENAL_RUBRIC_DIMENSIONS.map((d) => {
    const key = d.key as PhenomenalCompetencyKey;
    const max = PHENOMENAL_METRIC_MAX[key];
    const used = parseUsedScaleLevelsFromRubricText(row[key], max);
    return { title: d.titleRu, used, levels: scaleLevelsForMetric(key) };
  });
  if (!rows.some((r) => r.used.size > 0)) return y;

  const titleBlock = 52;
  const rowH = 16;
  const headH = 14;
  const tableH = headH + rows.length * rowH + 8;
  y = pdfEnsureY(doc, y, titleBlock + tableH + 24, margin);

  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Какие уровни шкалы отражены в ответе', margin, y + 10);
  y += 14;
  doc.setFont(PDF_BODY_FONT, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  const lead =
    'Шкала: для шести блоков — 0–4, для рефлексии — 0–1. Красная ячейка — уровень есть в тексте; серая — нет; «—» — уровень не используется.';
  for (const ln of doc.splitTextToSize(lead, maxW)) {
    doc.text(ln, margin, y + 8);
    y += 9;
  }
  y += 10;

  const dimW = Math.min(maxW * 0.44, 220);
  const lvW = (maxW - dimW) / HEAT_LEVELS.length;

  doc.setDrawColor(...PANEL_BORDER);
  doc.setLineWidth(0.35);
  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(40, 40, 40);
  doc.rect(margin, y, dimW, headH, 'S');
  doc.text('Компетенция', margin + 3, y + 9);
  for (let li = 0; li < HEAT_LEVELS.length; li++) {
    const lx = margin + dimW + li * lvW;
    doc.rect(lx, y, lvW, headH, 'S');
    doc.text(String(HEAT_LEVELS[li]), lx + lvW / 2 - 2, y + 9);
  }
  y += headH;

  doc.setFont(PDF_BODY_FONT, 'normal');
  for (const rr of rows) {
    doc.rect(margin, y, dimW, rowH, 'S');
    const tLines = doc.splitTextToSize(rr.title, dimW - 6);
    doc.setFontSize(6.2);
    doc.setTextColor(30, 30, 30);
    doc.text(tLines[0] ?? '', margin + 3, y + 10);
    if (tLines[1]) doc.text(tLines[1], margin + 3, y + 10 + 7);
    doc.setFontSize(7);

    for (let li = 0; li < HEAT_LEVELS.length; li++) {
      const lv = HEAT_LEVELS[li];
      const lx = margin + dimW + li * lvW;
      doc.rect(lx, y, lvW, rowH, 'S');
      const applies = rr.levels.includes(lv);
      if (!applies) {
        doc.setTextColor(120, 120, 120);
        doc.text('—', lx + lvW / 2 - 2, y + 10);
        continue;
      }
      const on = rr.used.has(lv);
      if (on) {
        doc.setFillColor(...PDF_RUBRIC_ON);
        doc.rect(lx + 0.5, y + 0.5, lvW - 1, rowH - 1, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont(PDF_BODY_FONT, 'bold');
        doc.text('·', lx + lvW / 2 - 1.5, y + 10);
        doc.setFont(PDF_BODY_FONT, 'normal');
      } else {
        doc.setFillColor(...PDF_RUBRIC_OFF);
        doc.rect(lx + 0.5, y + 0.5, lvW - 1, rowH - 1, 'F');
      }
    }
    y += rowH;
  }

   return y + 14;
}

/** Матрица «Компетенции» для аналитики уроков: уровни из ячеек Excel0–4 через запятую (объединение по срезу). */
export function drawPdfLessonCompetencyHeatmap(
  doc: jsPDF,
  margin: number,
  y: number,
  maxW: number,
  rows: { title: string; usedLevels: number[] }[],
): number {
  if (!rows.length) return y;

  const compact = Boolean(getActivePdfDualPanelLayout());
  const titleBlock = compact ? 6 : 52;
  const rowH = 16;
  const headH = 14;
  const tableH = headH + rows.length * rowH + 8;
  y = pdfEnsureY(doc, y, titleBlock + tableH + 24, margin);

  if (!compact) {
    doc.setFont(pdfChartHeadingFont(), 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Компетенции', margin, y + 10);
    y += 14;
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    const lead =
      'Уровни 0–4 из столбцов Excel (числа через запятую в ячейке). По каждому педагогу — все значения, встретившиеся в его уроках. Красная ячейка — уровень есть; серая — нет.';
    for (const ln of doc.splitTextToSize(lead, maxW)) {
      doc.text(ln, margin, y + 8);
      y += 9;
    }
    y += 10;
  }

  const dimW = Math.min(maxW * 0.5, 248);
  const lvW = (maxW - dimW) / HEAT_LEVELS.length;

  doc.setDrawColor(...PANEL_BORDER);
  doc.setLineWidth(0.35);
  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(40, 40, 40);
  doc.rect(margin, y, dimW, headH, 'S');
  doc.text('Компетенция', margin + 3, y + 9);
  for (let li = 0; li < HEAT_LEVELS.length; li++) {
    const lx = margin + dimW + li * lvW;
    doc.rect(lx, y, lvW, headH, 'S');
    doc.text(String(HEAT_LEVELS[li]), lx + lvW / 2 - 2, y + 9);
  }
  y += headH;

  const usedSets = rows.map((r) => new Set(r.usedLevels.filter((n) => n >= 0 && n <= 4)));

  doc.setFont(PDF_BODY_FONT, 'normal');
  for (let ri = 0; ri < rows.length; ri++) {
    const rr = rows[ri];
    const used = usedSets[ri];
    doc.rect(margin, y, dimW, rowH, 'S');
    const tLines = doc.splitTextToSize(`${ri + 1}. ${rr.title}`, dimW - 6);
    doc.setFontSize(6.2);
    doc.setTextColor(30, 30, 30);
    doc.text(tLines[0] ?? '', margin + 3, y + 10);
    if (tLines[1]) doc.text(tLines[1], margin + 3, y + 10 + 7);
    doc.setFontSize(7);

    for (let li = 0; li < HEAT_LEVELS.length; li++) {
      const lv = HEAT_LEVELS[li];
      const lx = margin + dimW + li * lvW;
      doc.rect(lx, y, lvW, rowH, 'S');
      const on = used.has(lv);
      if (on) {
        doc.setFillColor(...PDF_RUBRIC_ON);
        doc.rect(lx + 0.5, y + 0.5, lvW - 1, rowH - 1, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont(PDF_BODY_FONT, 'bold');
        doc.text('·', lx + lvW / 2 - 1.5, y + 10);
        doc.setFont(PDF_BODY_FONT, 'normal');
      } else {
        doc.setFillColor(...PDF_RUBRIC_OFF);
        doc.rect(lx + 0.5, y + 0.5, lvW - 1, rowH - 1, 'F');
      }
    }
    y += rowH;
  }

  return y + 14;
}

/** Таблица пойнтов компетенций (аналитика уроков): числа 0–4 или пункты рубрики через запятую. */
export function drawPdfLessonCompetencyPointsTable(
  doc: jsPDF,
  margin: number,
  y: number,
  maxW: number,
  rows: { title: string; maxCommaTokensInCell: number; peakLevel: number | null; globalMaxItemsInColumn?: number }[],
): number {
  if (
    !rows.some(
      (r) =>
        r.maxCommaTokensInCell > 0 ||
        r.peakLevel != null ||
        (r.globalMaxItemsInColumn ?? 0) > 0,
    )
  )
    return y;

  const rubricTextMode =
    rows.some((r) => (r.globalMaxItemsInColumn ?? 0) > 0) && rows.every((r) => r.peakLevel == null);

  const compact = Boolean(getActivePdfDualPanelLayout());
  const titleBlock = compact ? 6 : 36;
  const headH = 14;
  const numW = 22;
  const tokW = rubricTextMode ? 48 : 52;
  const peakW = rubricTextMode ? 48 : 44;
  const fileW = rubricTextMode ? 48 : 0;
  const estRowH = rows.reduce((acc, rr) => {
    const dimW0 = Math.max(
      120,
      maxW - numW - tokW - (rubricTextMode ? fileW + peakW : peakW) - 6,
    );
    const n = doc.splitTextToSize(rr.title, dimW0 - 6).length;
    const lines = Math.min(Math.max(n, 1), 5);
    return acc + Math.max(18, 8 + lines * 6);
  }, 0);
  const tableH = headH + estRowH + 8;
  y = pdfEnsureY(doc, y, titleBlock + tableH + 24, margin);

  if (!compact) {
    doc.setFont(pdfChartHeadingFont(), 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Пойнты компетенций по срезу', margin, y + 10);
    y += 14;
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    const lead = rubricTextMode
      ? 'Перечисленные через запятую формулировки пунктов рубрики. «Макс. (файл)» — наибольшее число пунктов в одной ячейке столбца по всему файлу; «Макс. (срез)» — по урокам этого педагога.'
      : 'Числа 0–4 в ячейках через запятую. «Макс. отметок» — наибольшее число таких чисел в одной ячейке; «Макс. уровень» — наибольшее значение по срезу.';
    for (const ln of doc.splitTextToSize(lead, maxW)) {
      doc.text(ln, margin, y + 8);
      y += 9;
    }
    y += 10;
  }

  const dimW = Math.max(
    120,
    maxW - numW - tokW - (rubricTextMode ? fileW + peakW : peakW) - 6,
  );

  doc.setDrawColor(...PANEL_BORDER);
  doc.setLineWidth(0.35);
  doc.setFont(pdfChartHeadingFont(), 'bold');
  doc.setFontSize(7);
  doc.setTextColor(40, 40, 40);

  let x = margin;
  doc.rect(x, y, numW, headH, 'S');
  doc.text('\u2116', x + 6, y + 9);
  x += numW;
  doc.rect(x, y, dimW, headH, 'S');
  doc.text('Компетенция', x + 3, y + 9);
  x += dimW;
  if (rubricTextMode) {
    doc.rect(x, y, fileW, headH, 'S');
    const hF = doc.splitTextToSize('Макс. (файл)', fileW - 4);
    doc.text(hF[0] ?? '', x + 2, y + 7);
    if (hF[1]) doc.text(hF[1], x + 2, y + 7 + 6);
    x += fileW;
  }
  doc.rect(x, y, tokW, headH, 'S');
  const hTok = doc.splitTextToSize(
    rubricTextMode ? 'Макс. (срез)' : 'Макс. отметок в ячейке',
    tokW - 4,
  );
  doc.text(hTok[0] ?? '', x + 2, y + 7);
  if (hTok[1]) doc.text(hTok[1], x + 2, y + 7 + 6);
  x += tokW;
  if (!rubricTextMode) {
    doc.rect(x, y, peakW, headH, 'S');
    doc.text('Макс. ур.', x + 3, y + 9);
  }
  y += headH;

  doc.setFont(PDF_BODY_FONT, 'normal');
  for (let ri = 0; ri < rows.length; ri++) {
    const rr = rows[ri];
    const tLines = doc.splitTextToSize(rr.title, dimW - 6);
    const bodyLineCount = Math.min(Math.max(tLines.length, 1), 5);
    const rowH = Math.max(18, 8 + bodyLineCount * 6);
    const midY = y + rowH / 2 + 3;

    x = margin;
    doc.rect(x, y, numW, rowH, 'S');
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);
    doc.text(String(ri + 1), x + 7, midY);
    x += numW;
    doc.rect(x, y, dimW, rowH, 'S');
    doc.setFontSize(6);
    let ty = y + 9;
    for (let li = 0; li < bodyLineCount; li++) {
      const ln = tLines[li];
      if (ln) doc.text(ln, x + 3, ty);
      ty += 6;
    }
    x += dimW;
    if (rubricTextMode) {
      doc.rect(x, y, fileW, rowH, 'S');
      doc.setFontSize(7);
      const gm = rr.globalMaxItemsInColumn ?? 0;
      doc.text(gm > 0 ? String(gm) : '—', x + fileW / 2 - 3, midY);
      x += fileW;
    }
    doc.rect(x, y, tokW, rowH, 'S');
    doc.setFontSize(7);
    doc.text(rr.maxCommaTokensInCell > 0 ? String(rr.maxCommaTokensInCell) : '—', x + tokW / 2 - 3, midY);
    x += tokW;
    if (!rubricTextMode) {
      doc.rect(x, y, peakW, rowH, 'S');
      doc.text(rr.peakLevel != null ? String(rr.peakLevel) : '—', x + peakW / 2 - 3, midY);
    }
    y += rowH;
  }

  return y + 14;
}
