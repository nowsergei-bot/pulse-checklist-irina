import type { CellPrimitive } from '../excelAnalytics/parse';

function normHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru');
}

function headersEqualInOrder(baseHeaders: string[], incomingHeaders: string[]): boolean {
  if (baseHeaders.length !== incomingHeaders.length) return false;
  for (let i = 0; i < baseHeaders.length; i++) {
    if (normHeader(baseHeaders[i]) !== normHeader(incomingHeaders[i])) return false;
  }
  return true;
}

/** Подпись сводной таблицы в проекте (один или несколько Excel). */
export function formatLessonGridSourceLabel(sourceFiles: string[], fallback = ''): string {
  const files = sourceFiles.map((f) => String(f ?? '').trim()).filter(Boolean);
  if (files.length === 0) return fallback.trim() || 'file.xlsx';
  if (files.length === 1) return files[0];
  if (files.length === 2) return `${files[0]} + ${files[1]}`;
  return `${files[0]} + ещё ${files.length - 1} файл(ов)`;
}

export type AlignIncomingRowsResult =
  | { ok: true; rows: CellPrimitive[][] }
  | { ok: false; message: string };

/**
 * Приводит строки дополнительного листа к порядку колонок основной таблицы.
 * Колонки сопоставляются по заголовку (без учёта регистра и лишних пробелов).
 */
export function alignIncomingRowsToBaseHeaders(
  baseHeaders: string[],
  incomingHeaders: string[],
  incomingRows: CellPrimitive[][],
): AlignIncomingRowsResult {
  if (!baseHeaders.length) {
    return { ok: false, message: 'В проекте ещё нет заголовков колонок.' };
  }
  if (!incomingRows.length) {
    return { ok: false, message: 'В дополнительном файле нет строк данных (только заголовок?).' };
  }

  if (headersEqualInOrder(baseHeaders, incomingHeaders)) {
    return { ok: true, rows: incomingRows };
  }

  const baseNorm = baseHeaders.map(normHeader);
  const usedIncoming = new Set<number>();
  const indexMap: number[] = [];

  for (let bi = 0; bi < baseHeaders.length; bi++) {
    const want = baseNorm[bi];
    let found = -1;
    for (let j = 0; j < incomingHeaders.length; j++) {
      if (usedIncoming.has(j)) continue;
      if (normHeader(incomingHeaders[j]) === want) {
        found = j;
        break;
      }
    }
    if (found < 0) {
      return {
        ok: false,
        message: `В новом файле нет колонки «${baseHeaders[bi]}». Заголовки должны совпадать с уже загруженной таблицей.`,
      };
    }
    usedIncoming.add(found);
    indexMap.push(found);
  }

  const aligned = incomingRows.map((line) => indexMap.map((j) => line[j] ?? ''));
  return { ok: true, rows: aligned };
}

export type AppendLessonExcelGridResult =
  | { ok: true; rows: CellPrimitive[][]; appendedCount: number }
  | { ok: false; message: string };

export function appendRowsToLessonGrid(
  baseHeaders: string[],
  existingRows: CellPrimitive[][],
  incomingHeaders: string[],
  incomingRows: CellPrimitive[][],
  maxTotalRows: number,
): AppendLessonExcelGridResult {
  const aligned = alignIncomingRowsToBaseHeaders(baseHeaders, incomingHeaders, incomingRows);
  if (!aligned.ok) return { ok: false, message: aligned.message };

  const total = existingRows.length + aligned.rows.length;
  if (total > maxTotalRows) {
    const room = Math.max(0, maxTotalRows - existingRows.length);
    return {
      ok: false,
      message: `После добавления будет ${total} строк — лимит ${maxTotalRows}. Можно добавить не более ${room} строк из нового файла.`,
    };
  }

  return {
    ok: true,
    rows: [...existingRows, ...aligned.rows],
    appendedCount: aligned.rows.length,
  };
}
