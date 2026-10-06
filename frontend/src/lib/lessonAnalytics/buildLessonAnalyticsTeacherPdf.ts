import { jsPDF } from 'jspdf';
import { drawPdfBarGroup, PDF_COLOR_RED, PDF_COLOR_RED_DEEP, pdfEnsureY } from '../pdf/jsPdfBarPanel';
import {
  drawPdfLessonCompetencyHeatmap,
  drawPdfLessonCompetencyPointsTable,
  drawPdfMetricTiles,
  drawPdfPhenomenalRubricHeatmap,
} from '../pdf/jsPdfChartsExtra';
import type { TeacherLessonChecklistRow } from '../phenomenalLessons/parseTeacherChecklistApril';
import { embedPdfFonts, PDF_BODY_FONT } from '../pdf/jsPdfEmbedFonts';
import { yieldToMain } from '../yieldToMain';
import { buildLessonMonitoringTeacherPdfBytes } from './lessonAnalyticsTeacherPdfDocument';
import type { ResolvedLessonPdfVisual } from './lessonAnalyticsPdfVisual';
import type { RubricPhraseBreakdownRow } from './lessonCompetencyScale';
import type { VisitSectionPresence } from '../lessonVisitChecklist/visitChecklistScoring';

export type PdfMetricBar = { label: string; mean: number };
export type PdfOrdinalBar = { level: string; count: number };
export type PdfSliceChart = { title: string; items: { label: string; value: number }[] };

/** Убираем из сводки служебные строки про строки/развёртку — для педагога в PDF. */
export function humanizeQuickSummaryForPdf(quick: string): string {
  const stripped = String(quick || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1');
  return stripped
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (t.startsWith('Объём:')) return false;
      if (t.includes('без двойного учёта')) return false;
      if (t.includes('Точек после развёртки')) return false;
      if (t.startsWith('Наставников в выборке:')) return false;
      if (t.startsWith('Период (колонка «')) return false;
      if (t.startsWith('Текстовая шкала: заполнена у')) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function writeProse(doc: jsPDF, margin: number, y: number, maxW: number, title: string, body: string): number {
  const text = body.trim() || '—';
  const textX = margin + 12;
  const innerW = maxW - 12;
  let yy = pdfEnsureY(doc, y, 28, margin);
  const blockStart = yy;

  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  for (const ln of doc.splitTextToSize(title, innerW)) {
    yy = pdfEnsureY(doc, yy, 16, margin);
    doc.text(ln, textX, yy + 10);
    yy += 14;
  }
  const afterTitle = yy + 4;
  doc.setDrawColor(...PDF_COLOR_RED);
  doc.setLineWidth(2.5);
  doc.line(margin, blockStart + 8, margin, afterTitle);
  doc.setLineWidth(0.45);

  yy = afterTitle + 8;
  doc.setFont(PDF_BODY_FONT, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const lines = doc.splitTextToSize(text, innerW);
  for (const ln of lines) {
    yy = pdfEnsureY(doc, yy, 14, margin);
    doc.text(ln, textX, yy);
    yy += 13;
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.line(margin, blockStart - 4, margin + maxW, blockStart - 4);
  return yy + 14;
}

function drawPageFooters(doc: jsPDF, margin: number, footerLine: string, dateStr: string): void {
  const total = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(dateStr, margin, pageH - 16);
    const pageLabel = `Стр. ${i} / ${total}`;
    doc.text(pageLabel, pageW - margin - doc.getTextWidth(pageLabel), pageH - 16);
    const foot = footerLine.length > 95 ? `${footerLine.slice(0, 92)}…` : footerLine;
    doc.text(foot, margin, pageH - 28);
  }
}

function triggerPdfDownload(blob: Blob, fileName: string): void {
  const a = document.createElement('a');
  const name = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Скачать PDF, сформированный buildLessonAnalyticsTeacherPdfBase64. */
export function downloadPdfBase64AsFile(base64: string, fileName: string): void {
  const bin = atob(String(base64).trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  triggerPdfDownload(new Blob([out], { type: 'application/pdf' }), fileName);
}

/** Быстрее base64: скачать PDF из ArrayBuffer (jsPDF output). */
export function downloadPdfArrayBufferAsFile(buffer: ArrayBuffer, fileName: string): void {
  triggerPdfDownload(new Blob([buffer], { type: 'application/pdf' }), fileName);
}

export type PdfProseSection = { title: string; body: string };

export async function buildLessonAnalyticsTeacherPdfBytes(input: {
  projectTitle: string;
  teacherLabel: string;
  metricBars: PdfMetricBar[];
  ordinalBars: PdfOrdinalBar[];
  sliceCharts: PdfSliceChart[];
  summaryForPedagogue: string;
  narrativePlain: string;
  /** Доп. секции (выводы, рекомендации…) — порядок как в массиве. */
  extraProseSections?: PdfProseSection[];
  /** lesson-card: как карточка педагога на экране; default: доп. образование и старый порядок */
  layoutMode?: 'lesson-card' | 'lesson-card-one-page' | 'default';
  compactOnePage?: boolean;
  /** Подписи для других модулей (напр. дополнительное образование). */
  pdfBranding?: {
    defaultTitle?: string;
    entityCaption?: string;
    ordinalBarsTitle?: string;
    footerLine?: string;
    /** Подзаголовок под названием проекта (до строки с педагогом), например «Полный отчёт по срезу». */
    reportTagline?: string;
    /** Пояснение под именем педагога (серая строка). */
    leadLine?: string;
  };
  /** Синтетическая строка чек-листа с текстами рубрики — матрица уровней как в отчёте по феноменальным урокам. */
  rubricChecklistRow?: TeacherLessonChecklistRow | null;
  /** Таблица пойнтов из столбцов Excel (аналитика уроков: 0–4 или пункты рубрики через запятую). */
  lessonCompScaleRows?: {
    title: string;
    maxCommaTokensInCell: number;
    peakLevel: number | null;
    globalMaxItemsInColumn?: number;
  }[] | null;
  /** Heatmap компетенций 0–4 (как в интерфейсе). */
  lessonCompHeatmapRows?: { title: string; usedLevels: number[] }[] | null;
  /** Детализация по формулировкам рубрики с числом вхождений (шаблон «Для анализа ИИ»). */
  lessonCompPhraseBreakdown?: RubricPhraseBreakdownRow[] | null;
  /** Заголовок блока компетенций / чек-листа в PDF. */
  competencySectionTitle?: string;
  /** Чек-лист: бинарное наличие баллов по разделам (без числовой детализации). */
  visitSectionPresence?: VisitSectionPresence[];
  /** Уникальные уроки в мониторинге (шапка PDF). */
  lessonCount?: number;
  pdfVisual?: ResolvedLessonPdfVisual;
  onProgress?: () => void | Promise<void>;
}): Promise<ArrayBuffer> {
  const brand = input.pdfBranding || {};
  const defaultTitle = brand.defaultTitle ?? 'Аналитика уроков';
  const entityCaption = brand.entityCaption ?? 'Педагог';
  const ordinalBarsTitle = brand.ordinalBarsTitle ?? 'Текстовая шкала (число уроков по уровню)';
  const footerLine = brand.footerLine ?? 'Материал сформирован в модуле «Аналитика уроков».';
  const reportTagline = brand.reportTagline?.trim() ?? '';
  const leadLine =
    brand.leadLine?.trim() ?? 'Диаграммы и сводка по вашему срезу данных (как в интерфейсе модуля).';

  const layoutMode = input.layoutMode ?? 'default';
  const extraProse = (input.extraProseSections ?? []).filter((s) => s.body.trim());

  if (layoutMode === 'lesson-card' || layoutMode === 'lesson-card-one-page') {
    const compactOnePage = layoutMode === 'lesson-card-one-page' || input.compactOnePage === true;
    return buildLessonMonitoringTeacherPdfBytes({
      projectTitle: input.projectTitle || defaultTitle,
      teacherLabel: input.teacherLabel,
      entityCaption,
      footerLine,
      lessonCount: input.lessonCount,
      pdfVisual: input.pdfVisual,
      sliceCharts: input.sliceCharts,
      lessonCompHeatmapRows: input.lessonCompHeatmapRows,
      lessonCompScaleRows: input.lessonCompScaleRows,
      lessonCompPhraseBreakdown: input.lessonCompPhraseBreakdown,
      visitSectionPresence: input.visitSectionPresence,
      competencySectionTitle: input.competencySectionTitle,
      extraProseSections: extraProse,
      narrativePlain: input.narrativePlain,
      onProgress: input.onProgress,
      compactOnePage,
    });
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  await embedPdfFonts(doc);
  const w = doc.internal.pageSize.getWidth();
  const margin = 44;
  const maxW = w - margin * 2;
  let y = margin;

  doc.setFillColor(252, 252, 253);
  doc.rect(0, 0, w, 68, 'F');
  doc.setFillColor(...PDF_COLOR_RED);
  doc.rect(0, 66, w, 3, 'F');

  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(227, 6, 19);
  doc.setLineWidth(0.6);
  const disclaimer =
    'Важно. Этот документ сформирован на основе обобщения данных опроса других педагогов (сопоставление с вашим срезом). Содержание носит рекомендательный характер и не заменяет экспертную оценку урока.';
  const disclaimerLines = doc.splitTextToSize(disclaimer, maxW - 20);
  const boxH = disclaimerLines.length * 12 + 38;
  doc.roundedRect(margin, y, maxW, boxH, 4, 4, 'FD');
  doc.setFont(PDF_BODY_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  let dy = y + 14;
  for (const ln of disclaimerLines) {
    doc.text(ln, margin + 10, dy);
    dy += 12;
  }
  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLOR_RED);
  doc.text('Аналитика ИИ «Пульс»', margin + 10, dy + 4);
  y += boxH + 14;

  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  for (const ln of doc.splitTextToSize(input.projectTitle || defaultTitle, maxW)) {
    doc.text(ln, margin, y);
    y += 18;
  }
  if (reportTagline) {
    doc.setFont(PDF_BODY_FONT, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    for (const ln of doc.splitTextToSize(reportTagline, maxW)) {
      doc.text(ln, margin, y);
      y += 14;
    }
    y += 6;
  }
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLOR_RED);
  doc.setFont(PDF_BODY_FONT, 'bold');
  doc.text(`${entityCaption}: ${input.teacherLabel}`, margin, y + 2);
  y += 26;

  doc.setTextColor(71, 85, 105);
  doc.setFont(PDF_BODY_FONT, 'normal');
  doc.setFontSize(9);
  for (const ln of doc.splitTextToSize(leadLine, maxW)) {
    doc.text(ln, margin, y);
    y += 12;
  }
  y += 8;
  doc.setFont(PDF_BODY_FONT, 'normal');

  const drawSliceCharts = () => {
    for (const sc of input.sliceCharts) {
      if (sc.items.length === 0) continue;
      const tileCap = 16;
      const tileItems = sc.items.slice(0, tileCap).map((it) => ({
        label: it.label,
        value: Number.isInteger(it.value) ? String(it.value) : it.value.toFixed(2).replace(/\.?0+$/, ''),
      }));
      if (sc.items.length > tileCap) {
        tileItems.push({ label: '…', value: `+${sc.items.length - tileCap}` });
      }
      y = drawPdfMetricTiles(doc, margin, y, maxW, sc.title, tileItems);
      y = drawPdfBarGroup(doc, margin, y, maxW, sc.title, sc.items, PDF_COLOR_RED_DEEP);
    }
  };

  const drawCompetency = () => {
    if (input.rubricChecklistRow) {
      y = drawPdfPhenomenalRubricHeatmap(doc, margin, y, maxW, input.rubricChecklistRow);
    }
    if (input.lessonCompHeatmapRows && input.lessonCompHeatmapRows.length > 0) {
      y = drawPdfLessonCompetencyHeatmap(doc, margin, y, maxW, input.lessonCompHeatmapRows);
    }
    if (input.lessonCompScaleRows && input.lessonCompScaleRows.length > 0) {
      y = drawPdfLessonCompetencyPointsTable(doc, margin, y, maxW, input.lessonCompScaleRows);
    }
  };

  const drawMetricAndOrdinal = () => {
    if (input.metricBars.length > 0) {
      y = drawPdfMetricTiles(
        doc,
        margin,
        y,
        maxW,
        'Средние баллы по критериям (плитка)',
        input.metricBars.map((m) => ({
          label: m.label,
          value: Number.isInteger(m.mean) ? String(m.mean) : m.mean.toFixed(2).replace(/\.?0+$/, ''),
        })),
      );
      y = drawPdfBarGroup(
        doc,
        margin,
        y,
        maxW,
        'Средние баллы по критериям (диаграмма)',
        input.metricBars.map((m) => ({ label: m.label, value: m.mean })),
        PDF_COLOR_RED,
      );
    }
    if (input.ordinalBars.length > 0) {
      y = drawPdfMetricTiles(
        doc,
        margin,
        y,
        maxW,
        `${ordinalBarsTitle} (плитка)`,
        input.ordinalBars.map((o) => ({ label: o.level, value: String(o.count) })),
      );
      y = drawPdfBarGroup(
        doc,
        margin,
        y,
        maxW,
        ordinalBarsTitle,
        input.ordinalBars.map((o) => ({ label: o.level, value: o.count })),
        PDF_COLOR_RED,
      );
    }
  };

  const drawExtraProse = () => {
    for (const section of extraProse) {
      y = writeProse(doc, margin, y, maxW, section.title, section.body);
    }
  };

  const tick = async () => {
    await input.onProgress?.();
    await yieldToMain();
  };

  {
    drawMetricAndOrdinal();
    await tick();
    drawSliceCharts();
    await tick();
    drawCompetency();
    await tick();
    if (input.summaryForPedagogue) {
      y = writeProse(doc, margin, y, maxW, 'Краткая сводка по данным', input.summaryForPedagogue);
    }
    drawExtraProse();
    await tick();
    if (input.narrativePlain.trim()) {
      y = writeProse(doc, margin, y, maxW, 'Аналитическое заключение (ИИ)', input.narrativePlain.trim());
    }
  }

  const dateStr = new Date().toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  drawPageFooters(doc, margin, footerLine, dateStr);

  return doc.output('arraybuffer');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    const sub = bytes.subarray(i, end);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

export async function buildLessonAnalyticsTeacherPdfBase64(
  input: Parameters<typeof buildLessonAnalyticsTeacherPdfBytes>[0],
): Promise<string> {
  const buf = await buildLessonAnalyticsTeacherPdfBytes(input);
  return arrayBufferToBase64(buf);
}

/** Алиас для скачивания без base64. */
export const buildLessonAnalyticsTeacherPdfArrayBuffer = buildLessonAnalyticsTeacherPdfBytes;
