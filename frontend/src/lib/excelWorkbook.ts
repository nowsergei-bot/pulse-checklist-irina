import ExcelJS from 'exceljs';

function flattenCell(value: unknown): unknown {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const rec = value as { result?: unknown; text?: string; richText?: Array<{ text?: string }>; formula?: string };
    if (rec.richText) return rec.richText.map((p) => p.text || '').join('');
    if (typeof rec.text === 'string') return rec.text;
    if ('hyperlink' in rec && rec.text == null && typeof (rec as { hyperlink?: unknown }).hyperlink === 'string') {
      return String((rec as { hyperlink: string }).hyperlink);
    }
    if (rec.result != null) return flattenCell(rec.result);
  }
  return String(value);
}

export async function readWorkbookSheets(
  buffer: ArrayBuffer,
): Promise<Array<{ name: string; matrix: unknown[][] }>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => {
    const colCount = Math.max(ws.columnCount || 0, 1);
    const rowCount = Math.max(ws.rowCount || 0, 0);
    const matrix: unknown[][] = [];
    for (let r = 1; r <= rowCount; r += 1) {
      const row = ws.getRow(r);
      const line: unknown[] = [];
      for (let c = 1; c <= colCount; c += 1) {
        line.push(flattenCell(row.getCell(c).value));
      }
      matrix.push(line);
    }
    return { name: ws.name, matrix };
  });
}

export async function downloadAoaXlsx(
  filename: string,
  sheets: Array<{ name: string; rows: Array<Array<string | number>> }>,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31) || 'Sheet');
    for (const row of sheet.rows) ws.addRow(row);
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
