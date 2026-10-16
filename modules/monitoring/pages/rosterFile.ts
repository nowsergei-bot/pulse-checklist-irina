// Чтение листа «Составы» в браузере. На сервер уходят только параллель, группа, ФИО ученика и класс;
// столбцы с учителями не читаются. Сам файл никуда не отправляется.

const SHEET = 'составы';

export type RosterRow = [string, string, string, string];

function plain(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return String(value).trim();
  if (typeof value === 'object') {
    const rec = value as { result?: unknown; text?: unknown; richText?: { text?: string }[] };
    if (Array.isArray(rec.richText)) return rec.richText.map(p => p.text || '').join('').trim();
    if (rec.result !== undefined) return plain(rec.result);
    if (typeof rec.text === 'string') return rec.text.trim();
  }
  return '';
}

const norm = (text: string) => text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

export async function readRosterFile(file: File): Promise<RosterRow[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Файл больше 5 МиБ');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error('Не удалось прочитать файл. Нужен файл Excel (.xlsx).');
  }
  const ws = wb.worksheets.find(w => norm(w.name) === SHEET);
  if (!ws) throw new Error('В файле нет листа «Составы»');

  // Строка заголовков: в ней есть «ФИО ученика» и «Группа».
  let headerRow = 0;
  const col: Record<string, number> = {};
  for (let r = 1; r <= Math.min(ws.rowCount, 20) && !headerRow; r += 1) {
    const found: Record<string, number> = {};
    ws.getRow(r).eachCell((cell, c) => {
      const text = norm(plain(cell.value));
      if (text.startsWith('фио')) found.name = c;
      else if (text === 'группа') found.group = c;
      else if (text === 'параллель') found.parallel = c;
      else if (text === 'класс') found.cls = c;
    });
    if (found.name && found.group) { headerRow = r; Object.assign(col, found); }
  }
  if (!headerRow) throw new Error('На листе «Составы» не найдены столбцы «Группа» и «ФИО ученика»');

  // Параллель и группа часто объединены на несколько строк: пустую ячейку берём из строки выше.
  const rows: RosterRow[] = [];
  let parallel = '';
  let group = '';
  for (let r = headerRow + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const get = (c?: number) => (c ? plain(row.getCell(c).value) : '');
    parallel = get(col.parallel) || parallel;
    group = get(col.group) || group;
    const name = get(col.name);
    if (!name) continue;
    rows.push([parallel, group, name, get(col.cls)]);
  }
  if (!rows.length) throw new Error('На листе «Составы» нет учеников');
  return rows;
}
