import type { CellPrimitive } from './parse';

/** Ячейки в JSON (Date → ISO-строка). */
export type JsonCell = string | number | boolean | null;

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function serializeImportedRows(rows: CellPrimitive[][]): JsonCell[][] {
  return rows.map((r) =>
    r.map((c) => {
      if (c == null || c === '') return c === '' ? '' : null;
      if (c instanceof Date) return Number.isFinite(c.getTime()) ? c.toISOString() : null;
      if (typeof c === 'boolean' || typeof c === 'number') return c;
      return String(c);
    }),
  );
}

export function reviveImportedRows(rows: JsonCell[][]): CellPrimitive[][] {
  return rows.map((r) =>
    r.map((c) => {
      if (c == null) return null;
      if (typeof c === 'string' && ISO_LIKE.test(c)) {
        const d = new Date(c);
        return Number.isFinite(d.getTime()) ? d : c;
      }
      return c as CellPrimitive;
    }),
  );
}
