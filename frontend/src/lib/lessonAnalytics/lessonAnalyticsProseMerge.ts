import type { ColumnRole } from '../excelAnalytics/types';
import type { LessonProseCommentBlock } from '../excelAnalytics/engine';
import { parseTeacherNotesIntoPointRows } from '../phenomenalLessons/segmentTeacherNotes';

function normQuoteRowKey(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru');
}

/** Одна и та же фраза из matrix и из analytic rows не должна идти дважды в таблице. */
function dedupeQuoteRows(rows: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const t = String(row ?? '').trim();
    if (!t) continue;
    const k = normQuoteRowKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function quoteRowsFromChunks(chunks: string[]): string[] {
  const out: string[] = [];
  for (const raw of chunks) {
    const rows = parseTeacherNotesIntoPointRows(raw);
    if (rows.length) out.push(...rows);
    else if (raw.trim()) out.push(raw.trim());
  }
  return dedupeQuoteRows(out);
}

function flattenProseByKind(blocks: LessonProseCommentBlock[], kind: ColumnRole): string[] {
  const out: string[] = [];
  for (const c of blocks) {
    if (c.textKind !== kind) continue;
    let displayRows = parseTeacherNotesIntoPointRows(c.rawText);
    if (displayRows.length === 0 && c.rawText.trim()) displayRows = [c.rawText.trim()];
    out.push(...displayRows);
  }
  return out;
}

function mergeQuoteLists(excelParts: string[], fromBlocks: string[]): string[] {
  return dedupeQuoteRows([...quoteRowsFromChunks(excelParts), ...fromBlocks]);
}

export function getMergedLessonAnalyticsProseRows(
  blocks: LessonProseCommentBlock[],
  excelSummaryChunks: string[],
  excelRecommendationChunks: string[],
): { allSummaryRows: string[]; allRecRows: string[] } {
  return {
    allSummaryRows: mergeQuoteLists(excelSummaryChunks, flattenProseByKind(blocks, 'text_ai_summary')),
    allRecRows: mergeQuoteLists(excelRecommendationChunks, flattenProseByKind(blocks, 'text_ai_recommendations')),
  };
}

/**
 * Текст для PDF в блоке «Краткая сводка по данным» — как в интерфейсе панели выводов/рекомендаций.
 */
export function formatLessonAnalyticsMethodologyProseForPdf(allSummaryRows: string[], allRecRows: string[]): string {
  const parts: string[] = [];
  if (allRecRows.length === 0 && allSummaryRows.length === 0) return '';

  parts.push('Методические метрики — текстовый анализ (по типу колонки):');
  parts.push('');

  if (allRecRows.length > 0) {
    parts.push('• «Рекомендации учителю» — текст: рекомендации, примеры:');
    allRecRows.forEach((row, i) => {
      parts.push(`${i + 1}) ${row}`);
    });
    parts.push('');
  }

  if (allSummaryRows.length > 0) {
    parts.push('• «Общие выводы по уроку / рекомендации // Summary/recommendation» — формулировки:');
    allSummaryRows.forEach((row, i) => {
      parts.push(`${i + 1}. ${row}`);
    });
  }

  return parts.join('\n').trim();
}

/**
 * Полный текст секции «Краткая сводка по данным» для PDF: сводка по баллам + методические метрики.
 */
export function buildLessonAnalyticsPdfSummaryForPedagogue(
  quickFullForExport: string,
  humanizeQuick: (quick: string) => string,
  blocks: LessonProseCommentBlock[],
  excelSummaryChunks: string[],
  excelRecommendationChunks: string[],
): string {
  const quick = humanizeQuick(String(quickFullForExport || '')).trim();
  const { allSummaryRows, allRecRows } = getMergedLessonAnalyticsProseRows(
    blocks,
    excelSummaryChunks,
    excelRecommendationChunks,
  );
  const meth = formatLessonAnalyticsMethodologyProseForPdf(allSummaryRows, allRecRows);
  const parts: string[] = [];
  if (quick) parts.push(quick);
  if (meth) parts.push(meth);
  return parts.join('\n\n').trim();
}
