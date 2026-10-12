import { readWorkbookSheets } from '../excelWorkbook';

const MAX_ROWS = 4000;
const MAX_COLS = 20;

function cellValue(c: unknown): string | number | Date | '' {
  if (c == null || c === '') return '';
  if (c instanceof Date) return c;
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  return String(c);
}

export async function parseEnglishContingentWorkbook(buffer: ArrayBuffer): Promise<{
  headers: string[];
  rows: (string | number | Date | '')[][];
  sheetName: string;
}> {
  const sheets = await readWorkbookSheets(buffer);
  const first = sheets[0];
  if (!first) throw new Error('В файле нет листов.');
  const sheetName = first.name;
  const matrix = first.matrix;
  if (!matrix.length) throw new Error('Пустой лист.');
  const headers = matrix[0].slice(0, MAX_COLS).map((h) => String(h ?? '').trim());
  if (!headers.some((h) => h)) throw new Error('Не найдены заголовки столбцов.');
  const rows: (string | number | Date | '')[][] = [];
  for (let r = 1; r < matrix.length && rows.length < MAX_ROWS; r += 1) {
    const line = Array.isArray(matrix[r]) ? matrix[r] : [];
    const row = headers.map((_, i) => cellValue(line[i]));
    if (row.every((c) => c === '' || c == null)) continue;
    rows.push(row);
  }
  return { headers, rows, sheetName };
}

export function maskFullName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/);
  return parts
    .map((p, i) => (i === 0 ? p : p ? `${p.slice(0, 1)}.` : ''))
    .filter(Boolean)
    .join(' ');
}
