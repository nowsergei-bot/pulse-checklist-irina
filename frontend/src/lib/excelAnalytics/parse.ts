import { readWorkbookSheets } from '../excelWorkbook';

const MAX_SHEETS = 24;
const MAX_MATRIX_ROWS = 12000;
const DEFAULT_MAX_COLS = 120;
/** Верхняя граница столбцов для широких выгрузок форм (лидерский сертификат и т.п.). */
export const EXCEL_PARSE_ABS_MAX_COLS = 500;

export type CellPrimitive = string | number | boolean | Date | null;

/** xlsx при cellDates: true иногда отдаёт Date с невалидным временем — toISOString() тогда бросает RangeError. */
export function isValidExcelDate(d: Date): boolean {
  return Number.isFinite(d.getTime());
}

/** Строка из ячейки для подписей уровней и т.п. (без bilingual //). */
export function primitiveCellToPlainString(c: CellPrimitive): string {
  if (c == null || c === '') return '';
  if (c instanceof Date) return isValidExcelDate(c) ? c.toISOString().slice(0, 10) : '';
  return String(c).trim();
}

function normalizeCell(c: unknown): CellPrimitive {
  if (c == null || c === '') return null;
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  if (typeof c === 'boolean') return c;
  if (c instanceof Date) return isValidExcelDate(c) ? c : null;
  const s = String(c);
  return s.length > 8000 ? `${s.slice(0, 7997)}…` : s;
}

/** Сырые имена листов и матрица без нормализации строки заголовков. */
export async function readWorkbookMeta(buffer: ArrayBuffer): Promise<{ sheetNames: string[] }> {
  const sheets = await readWorkbookSheets(buffer);
  return { sheetNames: sheets.slice(0, MAX_SHEETS).map((s) => s.name.slice(0, 120)) };
}

export async function getSheetMatrix(buffer: ArrayBuffer, sheetName: string): Promise<unknown[][]> {
  const sheets = await readWorkbookSheets(buffer);
  const sh = sheets.find((s) => s.name === sheetName);
  if (!sh) throw new Error(`Лист «${sheetName}» не найден`);
  return sh.matrix.slice(0, MAX_MATRIX_ROWS);
}

/**
 * @param headerRow1Based номер строки с заголовками (1 = первая строка файла)
 */
function rowWidth(arr: unknown): number {
  return Array.isArray(arr) ? arr.length : 0;
}

/**
 * @param maxCols максимум столбцов (по умолчанию 120; для широких Google Forms — до 500)
 */
export function extractHeadersAndRows(
  matrix: unknown[][],
  headerRow1Based: number,
  maxDataRows: number,
  maxCols: number = DEFAULT_MAX_COLS,
): { headers: string[]; rows: CellPrimitive[][] } {
  if (headerRow1Based < 1) throw new Error('Номер строки заголовков должен быть ≥ 1');
  const idx = headerRow1Based - 1;
  if (idx >= matrix.length) throw new Error('Строка заголовков за пределами листа');

  const cap = Math.min(EXCEL_PARSE_ABS_MAX_COLS, Math.max(8, maxCols));
  const headerRow = matrix[idx] ?? [];
  let width = rowWidth(headerRow);
  for (let r = idx + 1; r < matrix.length && r < idx + 1 + maxDataRows + 50; r++) {
    width = Math.max(width, rowWidth(matrix[r]));
  }
  width = Math.min(cap, Math.max(width, rowWidth(headerRow) || 1));

  const headers = Array.from({ length: width }, (_, i) => {
    const h = Array.isArray(headerRow) ? headerRow[i] : undefined;
    return String(h ?? '').trim() || `Колонка ${i + 1}`;
  });

  const rows: CellPrimitive[][] = [];
  for (let r = idx + 1; r < matrix.length && rows.length < maxDataRows; r++) {
    const line = matrix[r];
    const arr = Array.isArray(line) ? line : [];
    const row = headers.map((_, i) => normalizeCell(arr[i]));
    if (row.every((c) => c == null || c === '')) continue;
    rows.push(row);
  }

  return { headers, rows };
}
