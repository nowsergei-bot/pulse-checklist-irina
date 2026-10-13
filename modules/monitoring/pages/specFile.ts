// Чтение листа «Спецификация» в браузере: только ячейки шаблона C3-C6 и B9:F28.
// Сервер повторяет все проверки по этим ячейкам.

const SHEET = 'Спецификация';

function addresses(): string[] {
  const list = ['C3', 'C4', 'C5', 'C6'];
  for (let row = 9; row <= 28; row += 1) for (const col of 'BCDEF') list.push(`${col}${row}`);
  return list;
}

function plain(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const rec = value as { result?: unknown; text?: unknown; richText?: { text?: string }[] };
    if (Array.isArray(rec.richText)) return rec.richText.map(p => p.text || '').join('');
    if (rec.result !== undefined) return plain(rec.result);
    if (typeof rec.text === 'string') return rec.text;
  }
  return null;
}

export type SpecFile = { filename: string; cells: Record<string, string | number>; content_base64: string };

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function readSpecFile(file: File): Promise<SpecFile> {
  if (file.size > 3 * 1024 * 1024) throw new Error('Файл больше 3 МиБ');
  const buffer = await file.arrayBuffer();
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('Не удалось прочитать файл. Нужен файл Excel (.xlsx) по шаблону.');
  }
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`В файле нет листа «${SHEET}»`);
  const cells: Record<string, string | number> = {};
  for (const address of addresses()) {
    const value = plain(ws.getCell(address).value);
    if (value !== null && value !== '') cells[address] = value;
  }
  return { filename: file.name, cells, content_base64: toBase64(buffer) };
}
