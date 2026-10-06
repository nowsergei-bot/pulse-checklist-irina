import { jsPDF } from 'jspdf';
import { drawPdfBarGroupCompact, estimatePdfBarGroupCompactHeight } from '../pdf/jsPdfBarPanel';
import { embedPdfFonts, PDF_BODY_FONT } from '../pdf/jsPdfEmbedFonts';
import { PdfLessonReportLayout, setActivePdfLessonReportLayout } from '../pdf/pdfLessonReportLayout';
import { yieldToMain } from '../yieldToMain';
import type { PdfProseSection, PdfSliceChart } from './buildLessonAnalyticsTeacherPdf';
import type { RubricPhraseBreakdownRow } from './lessonCompetencyScale';
import type { VisitSectionPresence } from '../lessonVisitChecklist/visitChecklistScoring';
import {
  DEFAULT_LESSON_PDF_VISUAL,
  resolveLessonPdfVisual,
  type ResolvedLessonPdfVisual,
} from './lessonAnalyticsPdfVisual';

export const LESSON_MONITORING_REPORT_TITLE = 'Отчёт по результатам мониторинга';

const DISCLAIMER_TEXT =
  'Документ сформирован на основе обобщения данных опроса других педагогов. Содержание носит рекомендательный характер и не заменяет экспертную оценку урока.';

const PDF_COLOR_RED: [number, number, number] = [227, 6, 19];
const HEAT_LEVELS = [0, 1, 2, 3, 4] as const;
const PDF_RUBRIC_ON: [number, number, number] = [211, 47, 47];
const PDF_RUBRIC_OFF: [number, number, number] = [232, 234, 246];
const PANEL_BORDER: [number, number, number] = [203, 213, 225];

const MAX_ITEMS_PER_CHART = 24;

function defaultPdfVisual(projectTitle: string): ResolvedLessonPdfVisual {
  return resolveLessonPdfVisual(
    { v: 1, updatedAt: '', pdfVisual: { ...DEFAULT_LESSON_PDF_VISUAL } },
    projectTitle,
  );
}
const MAX_PROSE_CHARS = 2400;
const MAX_NARRATIVE_CHARS = 3200;

export function stripDuplicatePulseFromNarrative(text: string): string {
  const parts = String(text || '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const kept = parts.filter((p) => {
    const low = p.toLowerCase();
    if (low.includes('аналитика ии') && low.includes('пульс')) return false;
    if (low.startsWith('важно') && low.includes('обобщен') && low.includes('опрос')) return false;
    if (low.startsWith('важно.') && low.includes('других педагогов')) return false;
    return true;
  });
  return kept.join('\n\n').trim();
}

function truncateText(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 1).trim()}…`;
}

/** Перенос абзацев с учётом текущего шрифта jsPDF (иначе строки вылезают за поля). */
function splitProseBodyLines(doc: jsPDF, body: string, maxWidth: number, fontSize: number): string[] {
  doc.setFont(PDF_BODY_FONT, 'normal');
  doc.setFontSize(fontSize);
  const normalized = String(body || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) return [];

  const out: string[] = [];
  for (const block of normalized.split(/\n\n+/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    for (const para of trimmed.split(/\n/)) {
      const p = para.trim();
      if (!p) continue;
      out.push(...doc.splitTextToSize(p, maxWidth));
    }
    out.push('');
  }
  if (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

/** Компактная шапка на первой странице (без отдельного титульного листа). */
function pdfCountHeatFill(count: number, maxVal: number): { fill: [number, number, number]; text: [number, number, number] } {
  const max = Math.max(1, maxVal);
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) {
    return { fill: [255, 255, 255], text: [15, 23, 42] };
  }
  const t = Math.min(1, n / max);
  const r = Math.round(255 + (220 - 255) * t);
  const g = Math.round(255 + (38 - 255) * t);
  const b = Math.round(255 + (38 - 255) * t);
  return { fill: [r, g, b], text: t > 0.52 ? [255, 255, 255] : [15, 23, 42] };
}

function drawFirstPageHeader(
  doc: jsPDF,
  layout: PdfLessonReportLayout,
  y: number,
  visual: ResolvedLessonPdfVisual,
  input: {
    teacherLabel: string;
    dateStr: string;
    lessonCount?: number;
    compactOnePage?: boolean;
  },
): number {
  const margin = layout.margin;
  const maxW = layout.maxW;
  const compact = input.compactOnePage === true;
  let yy = y;

  doc.setFillColor(...visual.accentRgb);
  doc.rect(0, 0, layout.pageW, 3, 'F');

  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(compact ? 12 : 14);
  doc.setTextColor(15, 23, 42);
  for (const ln of doc.splitTextToSize(visual.reportTitle, maxW)) {
    doc.text(ln, margin, yy + 12);
    yy += 16;
  }

  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(compact ? 10 : 11);
  doc.setTextColor(51, 65, 85);
  for (const ln of doc.splitTextToSize(visual.projectTitle, maxW)) {
    doc.text(ln, margin, yy + (compact ? 9 : 10));
    yy += compact ? 12 : 14;
  }

  if (!compact && visual.reportTagline) {
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    for (const ln of doc.splitTextToSize(visual.reportTagline, maxW)) {
      doc.text(ln, margin, yy + 8);
      yy += 11;
    }
  }

  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(compact ? 9 : 10);
  doc.setTextColor(...visual.accentRgb);
  doc.text(`${visual.entityCaption}: ${input.teacherLabel}`, margin, yy + (compact ? 9 : 10));
  yy += compact ? 12 : 14;

  if (visual.moduleLayout.showLessonCountInHeader && input.lessonCount != null && input.lessonCount > 0) {
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const n = input.lessonCount;
    const word = n === 1 ? 'урок' : n < 5 ? 'урока' : 'уроков';
    doc.text(`Уроков в мониторинге: ${n} ${word}`, margin, yy + 8);
    yy += 12;
  }

  if (!compact && visual.leadLine) {
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    for (const ln of doc.splitTextToSize(visual.leadLine, maxW)) {
      doc.text(ln, margin, yy + 8);
      yy += 10;
    }
    yy += 4;
  }

  if (visual.showDisclaimer) {
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(compact ? 6.5 : 7.5);
    doc.setTextColor(100, 116, 139);
    const disclaimer = compact
      ? 'Рекомендательный характер; не заменяет экспертную оценку урока.'
      : DISCLAIMER_TEXT;
    for (const ln of doc.splitTextToSize(disclaimer, maxW)) {
      doc.text(ln, margin, yy + 7);
      yy += compact ? 8 : 10;
    }
  }
  if (visual.showPulseBrand) {
    doc.setFontSize(compact ? 6.5 : 7.5);
    doc.text(`Аналитика ИИ «Пульс» · ${input.dateStr}`, margin, yy + (compact ? 8 : 10));
    yy += compact ? 10 : 14;
  } else if (visual.showGeneratedDate) {
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(input.dateStr, margin, yy + 10);
    yy += 14;
  }

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, yy, margin + maxW, yy);
  return yy + (compact ? 6 : 10);
}

function measureSectionHeading(doc: jsPDF, maxW: number, title: string, level: 1 | 2): number {
  const lines = doc.splitTextToSize(title, maxW - 14);
  return lines.length * (level === 1 ? 13 : 12) + 14;
}

function drawSectionHeading(
  doc: jsPDF,
  layout: PdfLessonReportLayout,
  y: number,
  title: string,
  level: 1 | 2,
  followingMinHeight: number,
  visual: ResolvedLessonPdfVisual,
  tight = false,
): number {
  const margin = layout.margin;
  const maxW = layout.maxW;
  const headingH = measureSectionHeading(doc, maxW, title, level);
  y = layout.ensureBlockStart(y, headingH + followingMinHeight, Math.min(followingMinHeight, 56));

  const lines = doc.splitTextToSize(title, maxW - 14);
  const barH = lines.length * (level === 1 ? 13 : 12) + 4;
  const textX = visual.showSectionBars ? margin + 10 : margin;
  if (visual.showSectionBars) {
    doc.setFillColor(...visual.accentRgb);
    doc.rect(margin, y, 3, barH, 'F');
  }

  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(level === 1 ? 11 : 10);
  doc.setTextColor(15, 23, 42);
  let ty = y + (level === 1 ? 10 : 9);
  const titleMaxW = maxW - (textX - margin) - 4;
  for (const ln of lines) {
    doc.text(ln, textX, ty, { maxWidth: titleMaxW });
    ty += level === 1 ? (tight ? 11 : 13) : tight ? 10 : 12;
  }
  return ty + (tight ? 3 : 6);
}

function measureHeatmapHeight(rows: { title: string; usedLevels: number[] }[], rowH: number, headH: number): number {
  return headH + rows.length * rowH + 10;
}

/** Тепловая карта целиком; при нехватке места — продолжение на следующем листе (до maxPages). */
function drawLessonCompetencyHeatmapPaged(
  doc: jsPDF,
  layout: PdfLessonReportLayout,
  y: number,
  rows: { title: string; usedLevels: number[] }[],
): number {
  if (!rows.length) return y;

  const margin = layout.margin;
  const maxW = layout.maxW;
  const headH = 11;
  const rowH = 10;
  const dimW = Math.min(maxW * 0.52, 280);
  const lvW = (maxW - dimW) / HEAT_LEVELS.length;
  const usedSets = rows.map((r) => new Set(r.usedLevels.filter((n) => n >= 0 && n <= 4)));

  let rowIndex = 0;
  let yy = y;
  let firstChunk = true;

  while (rowIndex < rows.length) {
    const avail = layout.contentBottom - yy;
    let rowsHere = Math.floor((avail - headH - 6) / rowH);
    if (rowsHere < 1) {
      if (!layout.canAddPage()) break;
      doc.addPage();
      yy = layout.margin + 6;
      rowsHere = Math.floor((layout.contentBottom - yy - headH - 6) / rowH);
      if (rowsHere < 1) rowsHere = 1;
    }

    const chunk = rows.slice(rowIndex, rowIndex + rowsHere);
    const chunkH = headH + chunk.length * rowH + 8;
    yy = layout.ensureBlockStart(yy, chunkH, headH + rowH);

    doc.setDrawColor(...PANEL_BORDER);
    doc.setLineWidth(0.3);
    doc.setFont(PDF_BODY_FONT, 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(40, 40, 40);
    doc.rect(margin, yy, dimW, headH, 'S');
    doc.text(firstChunk ? 'Компетенция' : 'Компетенция (продолжение)', margin + 2, yy + 7);
    for (let li = 0; li < HEAT_LEVELS.length; li++) {
      const lx = margin + dimW + li * lvW;
      doc.rect(lx, yy, lvW, headH, 'S');
      doc.text(String(HEAT_LEVELS[li]), lx + lvW / 2 - 2, yy + 7);
    }
    yy += headH;

    doc.setFont(PDF_BODY_FONT, 'normal');
    for (let ci = 0; ci < chunk.length; ci++) {
      const rr = chunk[ci];
      const used = usedSets[rowIndex + ci];
      doc.rect(margin, yy, dimW, rowH, 'S');
      const label = `${rowIndex + ci + 1}. ${rr.title}`;
      const tLines = doc.splitTextToSize(label, dimW - 4);
      doc.setFontSize(5.5);
      doc.setTextColor(30, 30, 30);
      doc.text(tLines[0] ?? '', margin + 2, yy + 7);
      if (tLines[1]) doc.text(tLines[1], margin + 2, yy + 7 + 5);

      for (let li = 0; li < HEAT_LEVELS.length; li++) {
        const lv = HEAT_LEVELS[li];
        const lx = margin + dimW + li * lvW;
        doc.rect(lx, yy, lvW, rowH, 'S');
        if (used.has(lv)) {
          doc.setFillColor(...PDF_RUBRIC_ON);
          doc.rect(lx + 0.4, yy + 0.4, lvW - 0.8, rowH - 0.8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont(PDF_BODY_FONT, 'bold');
          doc.setFontSize(6);
          doc.text('·', lx + lvW / 2 - 1.2, yy + 7);
          doc.setFont(PDF_BODY_FONT, 'normal');
        } else {
          doc.setFillColor(...PDF_RUBRIC_OFF);
          doc.rect(lx + 0.4, yy + 0.4, lvW - 0.8, rowH - 0.8, 'F');
        }
      }
      yy += rowH;
    }

    rowIndex += chunk.length;
    firstChunk = false;
    yy += 6;
    if (rowIndex < rows.length && layout.canAddPage() && yy + headH + rowH > layout.contentBottom) {
      doc.addPage();
      yy = layout.margin + 6;
    }
  }

  return yy + 4;
}

/** Чек-лист: красные плашки «баллы есть / нет» по разделам (без чисел). */
function drawVisitSectionPresencePaged(
  doc: jsPDF,
  layout: PdfLessonReportLayout,
  y: number,
  sections: VisitSectionPresence[],
  compact = false,
): number {
  if (!sections.length) return y;
  const margin = layout.margin;
  const maxW = layout.maxW;
  const gap = compact ? 3 : 6;
  const lineStep = compact ? 7 : 8;
  let yy = y;

  if (!compact) {
    doc.setFont(PDF_BODY_FONT, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    yy = layout.ensureBlockStart(yy, 14, 14);
    doc.text('Как проводятся уроки: разделы чек-листа 1–10', margin, yy + 9);
    yy += 14;

    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const lead =
      'Красная плашка — в разделе зафиксированы баллы; серая — нет. Без числовой расшифровки: только наличие отмеченных пунктов рубрики.';
    const leadLines = doc.splitTextToSize(lead, maxW);
    for (const ln of leadLines) {
      yy = layout.ensureBlockStart(yy, 12, 12);
      doc.text(ln, margin, yy + 8);
      yy += 11;
    }
    yy += 4;
  }

  for (const sec of sections) {
    const lines = sec.checklistLines?.length
      ? sec.checklistLines
      : [
          ...sec.presentIndicators.map((text) => ({ text, marked: true })),
          ...sec.absentIndicators.map((text) => ({ text, marked: false })),
        ];
    const detailLines: string[] = [];
    for (const line of lines) {
      const mark = line.marked ? '✓' : '○';
      detailLines.push(...doc.splitTextToSize(`${mark} ${line.text}`, maxW - 24));
    }
    const headerTitleLines = doc.splitTextToSize(sec.title, maxW - 16);
    const titleLineH = compact ? 8 : 10;
    const headerH = Math.max(compact ? 22 : 34, (compact ? 16 : 22) + headerTitleLines.length * titleLineH);
    const bodyH = detailLines.length ? (compact ? 6 : 8) + detailLines.length * lineStep : 0;
    const blockH = headerH + bodyH;
    yy = layout.ensureBlockStart(yy, blockH + gap, compact ? Math.min(blockH, 32) : blockH);

    const headerBg: [number, number, number] = sec.hasPoints ? [220, 38, 38] : [148, 163, 184];
    doc.setFillColor(...headerBg);
    doc.roundedRect(margin, yy, maxW, headerH, 4, 4, 'F');
    doc.setFont(PDF_BODY_FONT, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(`Раздел ${sec.code}`, margin + 8, yy + 10);
    doc.setFontSize(7.5);
    doc.text(sec.hasPoints ? 'Баллы зафиксированы' : 'Баллы не зафиксированы', margin + maxW - 8, yy + 10, {
      align: 'right',
    });
    doc.setFontSize(compact ? 7.5 : 8.5);
    let headerTy = yy + (compact ? 16 : 20);
    for (const ln of headerTitleLines.slice(0, 2)) {
      doc.text(ln, margin + 8, headerTy);
      headerTy += titleLineH;
    }

    if (detailLines.length) {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.rect(margin, yy + headerH, maxW, bodyH, 'FD');
      doc.setFont(PDF_BODY_FONT, 'normal');
      doc.setFontSize(compact ? 6.5 : 7);
      doc.setTextColor(30, 41, 59);
      let bodyTy = yy + headerH + (compact ? 6 : 8);
      for (const ln of detailLines) {
        if (bodyTy > yy + blockH - 4) break;
        doc.text(ln, margin + 10, bodyTy);
        bodyTy += lineStep;
      }
    }

    yy += blockH + gap;
  }
  return yy + (compact ? 2 : 4);
}

/** Все блоки компетенций с пунктами рубрики и числом вхождений (как в UI). */
function drawRubricPhraseBreakdownPaged(
  doc: jsPDF,
  layout: PdfLessonReportLayout,
  y: number,
  sections: RubricPhraseBreakdownRow[],
  useHeatColors: boolean,
): number {
  if (!sections.length) return y;

  const margin = layout.margin;
  const maxW = layout.maxW;
  const headH = 11;
  const countW = Math.min(72, maxW * 0.14);
  const dimW = maxW - countW;
  const rowPad = 3;

  let yy = y;

  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    if (!sec.phrases.length) continue;

    const sectionTitle = `${si + 1}. ${sec.title}`;
    const titleLines = doc.splitTextToSize(sectionTitle, maxW - 8);
    const titleH = titleLines.length * 11 + 8;
    yy = layout.ensureBlockStart(yy, titleH + headH + 14, headH + 14);

    doc.setFont(PDF_BODY_FONT, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    let ty = yy + 9;
    for (const ln of titleLines) {
      doc.text(ln, margin, ty);
      ty += 11;
    }
    yy = ty + 4;

    let phraseIndex = 0;
    while (phraseIndex < sec.phrases.length) {
      const avail = layout.contentBottom - yy;
      let rowsHere = Math.max(1, Math.floor((avail - headH - 8) / 14));
      if (rowsHere < 1) {
        if (!layout.canAddPage()) break;
        doc.addPage();
        yy = layout.margin + 6;
        rowsHere = Math.max(1, Math.floor((layout.contentBottom - yy - headH - 8) / 14));
      }

      const chunk = sec.phrases.slice(phraseIndex, phraseIndex + rowsHere);
      yy = layout.ensureBlockStart(yy, headH + chunk.length * 14 + 6, headH + 14);

      doc.setDrawColor(...PANEL_BORDER);
      doc.setLineWidth(0.3);
      doc.setFont(PDF_BODY_FONT, 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(40, 40, 40);
      doc.rect(margin, yy, dimW, headH, 'S');
      doc.text(
        phraseIndex === 0 ? 'Пункт / формулировка' : 'Пункт / формулировка (продолжение)',
        margin + 2,
        yy + 7,
      );
      doc.rect(margin + dimW, yy, countW, headH, 'S');
      doc.text('Вхождений', margin + dimW + 4, yy + 7);
      yy += headH;

      doc.setFont(PDF_BODY_FONT, 'normal');
      for (const p of chunk) {
        const phraseLines = doc.splitTextToSize(p.text, dimW - 6);
        const rowH = Math.max(12, phraseLines.length * 6 + rowPad * 2);
        doc.rect(margin, yy, dimW, rowH, 'S');
        doc.setFontSize(5.8);
        doc.setTextColor(30, 30, 30);
        let py = yy + rowPad + 5;
        for (const ln of phraseLines.slice(0, 4)) {
          doc.text(ln, margin + 2, py);
          py += 6;
        }
        doc.rect(margin + dimW, yy, countW, rowH, 'S');
        doc.setFont(PDF_BODY_FONT, 'bold');
        doc.setFontSize(7);
        const maxInSection = Math.max(1, ...sec.phrases.map((p) => p.count));
        const heat = useHeatColors ? pdfCountHeatFill(p.count, maxInSection) : null;
        if (heat) {
          doc.setFillColor(...heat.fill);
          doc.rect(margin + dimW + 0.4, yy + 0.4, countW - 0.8, rowH - 0.8, 'F');
          doc.setTextColor(...heat.text);
        } else {
          doc.setTextColor(...PDF_COLOR_RED);
        }
        doc.text(String(p.count), margin + dimW + countW / 2 - 3, yy + rowH / 2 + 2);
        doc.setFont(PDF_BODY_FONT, 'normal');
        yy += rowH;
      }

      phraseIndex += chunk.length;
      yy += 6;
      if (phraseIndex < sec.phrases.length && layout.canAddPage() && yy + headH + 14 > layout.contentBottom) {
        doc.addPage();
        yy = layout.margin + 6;
      }
    }
    yy += 4;
  }

  return yy + 4;
}

function writeProseSection(
  doc: jsPDF,
  layout: PdfLessonReportLayout,
  y: number,
  title: string,
  body: string,
  visual: ResolvedLessonPdfVisual,
  opts?: { keepTogether?: boolean; compact?: boolean },
): number {
  const margin = layout.margin;
  const maxW = layout.maxW;
  const compact = opts?.compact === true;
  const lineStep = compact ? 8.5 : 11;
  const fontSize = compact ? 7 : 8.5;
  const textX = margin + 8;
  const text = compact ? body.trim() : truncateText(body, MAX_PROSE_CHARS);
  if (!text) return y;
  const innerW = maxW - (textX - margin) - 8;
  const lines = splitProseBodyLines(doc, text, innerW, fontSize);
  const bodyH = lines.length * lineStep + 8;
  const headingH = measureSectionHeading(doc, maxW, title, 2);
  const totalH = headingH + bodyH + 8;

  const drawBodyLines = (startY: number): number => {
    let yy = startY;
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(51, 65, 85);
    for (const ln of lines) {
      if (ln === '') {
        yy = layout.ensureY(yy, lineStep * 0.6);
        yy += lineStep * 0.6;
        continue;
      }
      yy = layout.ensureY(yy, lineStep + 2);
      doc.text(ln, textX, yy, { maxWidth: innerW, align: 'left' });
      yy += lineStep;
    }
    return yy + (compact ? 4 : 8);
  };

  if (opts?.keepTogether && !compact) {
    const room = layout.contentBottom - y;
    if (totalH > room && layout.canAddPage()) {
      y = layout.forcePageBreak(y);
    }
    y = drawSectionHeading(doc, layout, y, title, 2, bodyH, visual);
    return drawBodyLines(y);
  }

  y = layout.ensureBlockStart(y, compact ? headingH + 24 : totalH, compact ? 20 : Math.min(bodyH, 40));
  y = drawSectionHeading(doc, layout, y, title, 2, compact ? 20 : bodyH, visual);
  return drawBodyLines(y);
}

function drawSliceChartsSection(
  doc: jsPDF,
  layout: PdfLessonReportLayout,
  y: number,
  sliceCharts: PdfSliceChart[],
  visual: ResolvedLessonPdfVisual,
  compactOnePage = false,
): number {
  if (!sliceCharts.length) return y;

  const ml = visual.moduleLayout;
  const chartsPerRow = ml.sliceChartsPerRow;
  const gap = chartsPerRow > 1 ? (compactOnePage ? 6 : 8) : 0;
  const chartW =
    chartsPerRow > 1
      ? Math.floor((layout.maxW - gap * (chartsPerRow - 1)) / chartsPerRow)
      : Math.floor(layout.maxW * (ml.sliceWidthPct / 100));
  const chartOpts = {
    maxItems: MAX_ITEMS_PER_CHART,
    ultraNarrow: compactOnePage && chartsPerRow >= 3,
  };
  let chartsRowEst = 0;
  for (const sc of sliceCharts) {
    chartsRowEst = Math.max(
      chartsRowEst,
      estimatePdfBarGroupCompactHeight(doc, chartW, sc.title, sc.items, chartOpts),
    );
  }
  const estH = chartsRowEst + (compactOnePage ? 16 : 20);

  y = drawSectionHeading(doc, layout, y, 'Распределение по измерениям среза', 1, estH, visual, compactOnePage);

  let rowBaseY = y;
  let rowEndY = y;
  let col = 0;

  for (let i = 0; i < sliceCharts.length; i++) {
    if (col === 0) {
      const rowSlice = sliceCharts.slice(i, Math.min(i + chartsPerRow, sliceCharts.length));
      let rowH = 0;
      for (const sc of rowSlice) {
        rowH = Math.max(
          rowH,
          estimatePdfBarGroupCompactHeight(doc, chartW, sc.title, sc.items, chartOpts),
        );
      }
      rowBaseY = layout.ensureBlockStart(rowBaseY, rowH + 8, rowH);
      rowEndY = rowBaseY;
    }
    const sc = sliceCharts[i]!;
    const chartMargin = Math.min(
      layout.margin + col * (chartW + gap),
      layout.margin + layout.maxW - chartW,
    );
    const panelW = Math.min(chartW, layout.maxW - (chartMargin - layout.margin));
    const endY = drawPdfBarGroupCompact(doc, chartMargin, rowBaseY, panelW, sc.title, sc.items, visual.accentDeepRgb, chartOpts);
    rowEndY = Math.max(rowEndY, endY);
    col++;
    if (col >= chartsPerRow || i === sliceCharts.length - 1) {
      y = rowEndY;
      col = 0;
      rowBaseY = y + (compactOnePage ? 4 : 6);
      rowEndY = rowBaseY;
    }
  }
  return y + (compactOnePage ? 2 : 4);
}

export type LessonMonitoringPdfInput = {
  projectTitle: string;
  teacherLabel: string;
  entityCaption: string;
  footerLine: string;
  lessonCount?: number;
  pdfVisual?: ResolvedLessonPdfVisual;
  sliceCharts: PdfSliceChart[];
  lessonCompHeatmapRows?: { title: string; usedLevels: number[] }[] | null;
  lessonCompScaleRows?: {
    title: string;
    maxCommaTokensInCell: number;
    peakLevel: number | null;
    globalMaxItemsInColumn?: number;
  }[] | null;
  lessonCompPhraseBreakdown?: RubricPhraseBreakdownRow[] | null;
  visitSectionPresence?: VisitSectionPresence[];
  competencySectionTitle?: string;
  extraProseSections: PdfProseSection[];
  narrativePlain: string;
  onProgress?: () => void | Promise<void>;
  /** Одна страница: без компетенций/теплокарты, компактные тексты. */
  compactOnePage?: boolean;
};

export async function buildLessonMonitoringTeacherPdfBytes(input: LessonMonitoringPdfInput): Promise<ArrayBuffer> {
  const visual =
    input.pdfVisual ??
    defaultPdfVisual(input.projectTitle);
  const compactOnePage = input.compactOnePage === true;
  const doc = new jsPDF({
    orientation: visual.orientation,
    unit: 'pt',
    format: 'a4',
    compress: true,
  });
  await embedPdfFonts(doc);

  const layout = new PdfLessonReportLayout(doc, {
    margin: visual.margin,
    maxPages: compactOnePage ? Math.min(2, visual.maxPages) : visual.maxPages,
  });
  setActivePdfLessonReportLayout(layout);

  const dateStr = new Date().toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const margin = layout.margin;
  const maxW = layout.maxW;
  let y = layout.margin + 4;

  const visitChecklistPdf = Boolean(input.visitSectionPresence?.length);
  y = drawFirstPageHeader(doc, layout, y, visual, {
    teacherLabel: input.teacherLabel,
    dateStr,
    lessonCount: input.lessonCount,
    compactOnePage: compactOnePage || visitChecklistPdf,
  });

  const tick = async () => {
    await input.onProgress?.();
    await yieldToMain();
  };

  const sliceCharts = input.sliceCharts
    .filter((sc) => sc.items.length > 0)
    .slice(0, visual.maxSliceCharts)
    .map((sc) => ({
      ...sc,
      items: sc.items.slice(0, MAX_ITEMS_PER_CHART),
    }));

  if (sliceCharts.length > 0) {
    await tick();
    y = drawSliceChartsSection(doc, layout, y, sliceCharts, visual, compactOnePage);
    await tick();
  }

  const ml = visual.moduleLayout;
  if (!compactOnePage && ml.competenciesPageBreakBefore) {
    y = layout.forcePageBreak(y);
  }

  const visitChecklistCompact =
    !compactOnePage && Boolean(input.visitSectionPresence && input.visitSectionPresence.length > 0);
  if (visitChecklistCompact) {
    const est = 28 + input.visitSectionPresence!.length * 32;
    y = drawSectionHeading(
      doc,
      layout,
      y,
      input.competencySectionTitle ?? 'Чек-лист посещения урока',
      1,
      est,
      visual,
      true,
    );
    await tick();
    y = drawVisitSectionPresencePaged(doc, layout, y, input.visitSectionPresence!, true);
    await tick();
  } else if (
    !compactOnePage &&
    input.lessonCompPhraseBreakdown &&
    input.lessonCompPhraseBreakdown.length > 0
  ) {
    y = drawSectionHeading(doc, layout, y, input.competencySectionTitle ?? 'Компетенции', 1, 80, visual);
    await tick();
    y = drawRubricPhraseBreakdownPaged(doc, layout, y, input.lessonCompPhraseBreakdown, ml.phraseCountHeatColors);
    await tick();
  } else if (!compactOnePage && input.lessonCompHeatmapRows && input.lessonCompHeatmapRows.length > 0) {
    const hmH = measureHeatmapHeight(input.lessonCompHeatmapRows, 10, 11);
    y = drawSectionHeading(doc, layout, y, 'Пойнтовая тепловая карта компетенций', 1, Math.min(hmH, 120), visual);
    await tick();
    y = drawLessonCompetencyHeatmapPaged(doc, layout, y, input.lessonCompHeatmapRows);
    await tick();
  } else if (!compactOnePage && input.lessonCompScaleRows && input.lessonCompScaleRows.length > 0) {
    const { drawPdfLessonCompetencyPointsTable } = await import('../pdf/jsPdfChartsExtra');
    const est = 80 + input.lessonCompScaleRows.length * 14;
    y = drawSectionHeading(doc, layout, y, 'Шкала компетенций', 1, est, visual);
    y = drawPdfLessonCompetencyPointsTable(doc, margin, y, maxW, input.lessonCompScaleRows);
    await tick();
  }

  for (const section of input.extraProseSections) {
    if (!section.body.trim()) continue;
    y = writeProseSection(doc, layout, y, section.title, section.body, visual, { compact: compactOnePage });
    await tick();
  }

  const narrativeRaw = stripDuplicatePulseFromNarrative(input.narrativePlain);
  const narrative = compactOnePage ? narrativeRaw : truncateText(narrativeRaw, MAX_NARRATIVE_CHARS);
  if (narrative) {
    y = writeProseSection(doc, layout, y, 'Аналитический текст (ИИ)', narrative, visual, {
      keepTogether: compactOnePage ? false : ml.aiNarrativeKeepTogether,
      compact: compactOnePage,
    });
    await tick();
  }

  layout.drawFooters(visual.footerLine || input.footerLine, dateStr, {
    showPageNumbers: visual.showPageNumbers,
    showGeneratedDate: visual.showGeneratedDate,
  });
  setActivePdfLessonReportLayout(null);

  return doc.output('arraybuffer');
}
