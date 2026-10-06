import type {
  RatingMatrixAnswers,
  RatingMatrixColumn,
  RatingMatrixOptions,
  RatingMatrixRow,
  RatingMatrixSelectAxis,
} from './types';

export type ParsedRatingMatrix = {
  rows: RatingMatrixRow[];
  columns: RatingMatrixColumn[];
  selectAxis: RatingMatrixSelectAxis;
  allowPartial: boolean;
  cornerLabel: string;
  hideRowKeys: boolean;
};

function parseRows(raw: unknown): RatingMatrixRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: RatingMatrixRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as RatingMatrixRow;
    const key = String(rec.key ?? '').trim();
    const label = String(rec.label ?? '').trim();
    if (!key || !label) continue;
    const group = String(rec.group ?? '').trim();
    rows.push(group ? { key, label, group } : { key, label });
  }
  return rows;
}

function parseColumns(raw: unknown): RatingMatrixColumn[] {
  if (!Array.isArray(raw)) return [];
  const columns: RatingMatrixColumn[] = [];
  for (const col of raw) {
    if (typeof col === 'string') {
      const label = col.trim();
      if (label) columns.push({ key: label, label });
      continue;
    }
    if (!col || typeof col !== 'object') continue;
    const rec = col as { key?: unknown; label?: unknown; allowedRows?: unknown };
    const label = String(rec.label ?? rec.key ?? '').trim();
    const key = String(rec.key ?? rec.label ?? '').trim();
    if (!key || !label) continue;
    const allowedRowKeys = Array.isArray(rec.allowedRows)
      ? rec.allowedRows.map((x) => String(x).trim()).filter(Boolean)
      : undefined;
    columns.push(allowedRowKeys?.length ? { key, label, allowedRowKeys } : { key, label });
  }
  return columns;
}

export function parseRatingMatrixOptions(options: unknown): ParsedRatingMatrix {
  const o = (options && typeof options === 'object' ? options : {}) as RatingMatrixOptions;
  const rows = parseRows(o.rows);
  const columns = parseColumns(o.columns);
  const selectAxis: RatingMatrixSelectAxis = o.selectAxis === 'column' ? 'column' : 'row';
  const allowPartial = o.allowPartial === true;
  const defaultCorner = selectAxis === 'column' ? 'Желаемый результат' : 'Аспект';
  const cornerLabel = String(o.cornerLabel ?? defaultCorner).trim() || defaultCorner;
  const hideRowKeys = o.hideRowKeys === true || selectAxis === 'column';
  return { rows, columns, selectAxis, allowPartial, cornerLabel, hideRowKeys };
}

export function isRowAllowedForColumn(column: RatingMatrixColumn, row: RatingMatrixRow): boolean {
  const allowed = column.allowedRowKeys;
  if (!allowed?.length) return true;
  return allowed.includes(row.key) || allowed.includes(row.label);
}

function axisKeys(parsed: ParsedRatingMatrix): string[] {
  return parsed.selectAxis === 'column' ? parsed.columns.map((c) => c.key) : parsed.rows.map((r) => r.key);
}

export function emptyRatingMatrix(optionsOrRows?: unknown): RatingMatrixAnswers {
  const parsed = Array.isArray(optionsOrRows)
    ? ({
        rows: parseRows(optionsOrRows),
        columns: [],
        selectAxis: 'row' as const,
        allowPartial: false,
        cornerLabel: 'Аспект',
        hideRowKeys: false,
      } satisfies ParsedRatingMatrix)
    : parseRatingMatrixOptions(optionsOrRows);
  const out: RatingMatrixAnswers = {};
  for (const key of axisKeys(parsed)) out[key] = '';
  return out;
}

export function isRatingMatrixAnswers(value: unknown): value is RatingMatrixAnswers {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function lookupRow(parsed: ParsedRatingMatrix, value: string): RatingMatrixRow | null {
  const v = value.trim();
  if (!v) return null;
  return parsed.rows.find((r) => r.key === v || r.label === v) ?? null;
}

function lookupColumn(parsed: ParsedRatingMatrix, value: string): RatingMatrixColumn | null {
  const v = value.trim();
  if (!v) return null;
  return parsed.columns.find((c) => c.key === v || c.label === v) ?? null;
}

function rawValueForKey(value: RatingMatrixAnswers, key: string, alt?: string): string {
  const direct = value[key];
  if (typeof direct === 'string') return direct;
  if (alt && alt !== key) {
    const other = value[alt];
    if (typeof other === 'string') return other;
  }
  return '';
}

export function normalizeRatingMatrix(value: unknown, options?: unknown): RatingMatrixAnswers {
  const parsed = parseRatingMatrixOptions(options);
  const base = emptyRatingMatrix(options);
  if (!isRatingMatrixAnswers(value)) return base;
  if (parsed.selectAxis === 'column') {
    for (const col of parsed.columns) {
      const raw = rawValueForKey(value, col.key, col.label).trim();
      const row = lookupRow(parsed, raw);
      base[col.key] = row && isRowAllowedForColumn(col, row) ? row.key : '';
    }
    return base;
  }
  const colSet = new Set(parsed.columns.flatMap((c) => [c.key, c.label]));
  for (const row of parsed.rows) {
    const raw = rawValueForKey(value, row.key, row.label).trim();
    base[row.key] = raw && colSet.has(raw) ? raw : '';
  }
  return base;
}

function hasValidSelection(parsed: ParsedRatingMatrix, matrix: RatingMatrixAnswers): boolean {
  if (parsed.selectAxis === 'column') {
    return parsed.columns.some((col) => {
      const row = lookupRow(parsed, matrix[col.key] ?? '');
      return Boolean(row && isRowAllowedForColumn(col, row));
    });
  }
  const colSet = new Set(parsed.columns.flatMap((c) => [c.key, c.label]));
  return parsed.rows.some((row) => colSet.has(String(matrix[row.key] ?? '').trim()));
}

export function isRatingMatrixComplete(
  value: unknown,
  options: unknown,
  required: boolean,
): boolean {
  if (!required) return true;
  const parsed = parseRatingMatrixOptions(options);
  if (!parsed.rows.length || !parsed.columns.length) return false;
  const matrix = normalizeRatingMatrix(value, options);
  if (parsed.allowPartial) return hasValidSelection(parsed, matrix);
  if (parsed.selectAxis === 'column') {
    return parsed.columns.every((col) => {
      const row = lookupRow(parsed, matrix[col.key] ?? '');
      return Boolean(row && isRowAllowedForColumn(col, row));
    });
  }
  const colSet = new Set(parsed.columns.flatMap((c) => [c.key, c.label]));
  return parsed.rows.every((row) => {
    const v = String(matrix[row.key] ?? '').trim();
    return v.length > 0 && colSet.has(v);
  });
}

export function matrixForSubmit(value: RatingMatrixAnswers, options?: unknown): RatingMatrixAnswers {
  const parsed = parseRatingMatrixOptions(options);
  const matrix = normalizeRatingMatrix(value, options);
  const out: RatingMatrixAnswers = {};
  if (parsed.selectAxis === 'column') {
    for (const col of parsed.columns) {
      const row = lookupRow(parsed, matrix[col.key] ?? '');
      if (row && isRowAllowedForColumn(col, row)) out[col.key] = row.key;
    }
    return out;
  }
  const colSet = new Set(parsed.columns.flatMap((c) => [c.key, c.label]));
  for (const row of parsed.rows) {
    const v = String(matrix[row.key] ?? '').trim();
    if (v && colSet.has(v)) out[row.key] = v;
  }
  return out;
}

export function ratingMatrixFilledEntries(value: unknown, options?: unknown): Array<{ key: string; label: string; value: string }> {
  const parsed = parseRatingMatrixOptions(options);
  const matrix = normalizeRatingMatrix(value, options);
  if (parsed.selectAxis === 'column') {
    return parsed.columns.flatMap((col) => {
      const row = lookupRow(parsed, matrix[col.key] ?? '');
      if (!row || !isRowAllowedForColumn(col, row)) return [];
      return [{ key: col.key, label: col.label, value: row.label }];
    });
  }
  return parsed.rows.flatMap((row) => {
    const raw = String(matrix[row.key] ?? '').trim();
    const col = lookupColumn(parsed, raw);
    if (!col) return [];
    return [{ key: row.key, label: row.label, value: col.label }];
  });
}
