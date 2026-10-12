/** Excel / Word lists of groups and students from English analytics. */

import { downloadAoaXlsx } from '../excelWorkbook';
import {
  formatPct,
  formatScoreSlash,
  formatSchoolGrade,
  overallTestTotals,
  schoolGradeFromPercent,
} from './analyticsUi.ts';
import type { EaDashboardStudent } from './types.ts';

export type AnalyticsExportStudentRow = {
  groupId: number;
  groupTitle: string;
  parallel: number | null;
  fullName: string;
  percent: number | null;
  score: number | null;
  max: number | null;
  slash: string;
  grade: string;
};

const EXPORT_HEADERS = ['Группа', 'Параллель', 'Учащийся', 'Баллы', '%', 'Оценка'];

export function studentsFromAnalyticsDash(
  dash: {
    students?: EaDashboardStudent[] | null;
    ranking?: { by_group?: { group_id: number; students?: EaDashboardStudent[] | null }[] };
  } | null,
  allowedGroupIds?: Array<string | number> | null,
): EaDashboardStudent[] {
  const allowed = allowedGroupIds?.length ? new Set(allowedGroupIds.map(String)) : null;
  const table = dash?.students || [];
  if (table.length) {
    return allowed ? table.filter((s) => allowed.has(String(s.group_id))) : table;
  }
  const out: EaDashboardStudent[] = [];
  for (const g of dash?.ranking?.by_group || []) {
    if (allowed && !allowed.has(String(g.group_id))) continue;
    out.push(...(g.students || []));
  }
  return out;
}

export function collectAnalyticsExportRows(
  students: EaDashboardStudent[] | null | undefined,
  allowedGroupIds?: Array<string | number> | null,
): AnalyticsExportStudentRow[] {
  const allowed = allowedGroupIds?.length ? new Set(allowedGroupIds.map(String)) : null;
  const rows: AnalyticsExportStudentRow[] = [];
  for (const s of students || []) {
    if (allowed && !allowed.has(String(s.group_id))) continue;
    const fromSections = overallTestTotals(s.sections || []);
    const score = s.total_score ?? fromSections.score;
    const max = s.total_max ?? fromSections.max;
    const percent = s.mean ?? fromSections.percent;
    rows.push({
      groupId: Number(s.group_id),
      groupTitle: s.group_title || 'Группа',
      parallel: s.parallel ?? null,
      fullName: s.full_name,
      percent,
      score,
      max,
      slash: formatScoreSlash(score, max),
      grade: formatSchoolGrade(schoolGradeFromPercent(percent)),
    });
  }
  return rows.sort((a, b) => {
    const g = a.groupTitle.localeCompare(b.groupTitle, 'ru', { numeric: true });
    if (g) return g;
    return a.fullName.localeCompare(b.fullName, 'ru');
  });
}

export function groupAnalyticsExportRows(rows: AnalyticsExportStudentRow[]): Map<string, AnalyticsExportStudentRow[]> {
  const map = new Map<string, AnalyticsExportStudentRow[]>();
  for (const row of rows) {
    const key = `${row.groupId}:${row.groupTitle}`;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

export function analyticsExportAoa(rows: AnalyticsExportStudentRow[]): string[][] {
  const aoa = [EXPORT_HEADERS];
  for (const row of rows) {
    aoa.push([
      row.groupTitle,
      row.parallel == null ? '' : String(row.parallel),
      row.fullName,
      row.slash,
      row.percent == null ? '' : formatPct(row.percent).replace('%', '').trim(),
      row.grade,
    ]);
  }
  return aoa;
}

function safeSheetName(name: string, fallback: string): string {
  const raw = (name || fallback).replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31);
  return raw || fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function analyticsExportBasename(scopeLabel: string): string {
  const scope = (scopeLabel || 'srez')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .slice(0, 40) || 'srez';
  return `angliyskiy-${scope}-${stamp()}`;
}

export async function downloadAnalyticsXlsx(rows: AnalyticsExportStudentRow[], scopeLabel: string) {
  const sheets: Array<{ name: string; rows: Array<Array<string | number>> }> = [
    { name: 'Все группы', rows: analyticsExportAoa(rows) },
  ];
  const grouped = groupAnalyticsExportRows(rows);
  let i = 1;
  for (const [, list] of grouped) {
    const name = safeSheetName(list[0]?.groupTitle || `Группа ${i}`, `Группа ${i}`);
    sheets.push({ name, rows: analyticsExportAoa(list) });
    i += 1;
  }
  await downloadAoaXlsx(`${analyticsExportBasename(scopeLabel)}.xlsx`, sheets);
}

export async function downloadAnalyticsDocx(rows: AnalyticsExportStudentRow[], scopeLabel: string) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
    ShadingType,
    VerticalAlign,
  } = await import('docx');

  const border = { style: BorderStyle.SINGLE, size: 4, color: 'C5B8B0' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const headerFill = 'F4EDEA';
  const cellMargins = { top: 40, bottom: 40, left: 80, right: 80 };

  function cell(text: string, opts?: { header?: boolean; width?: number }) {
    return new TableCell({
      width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
      borders,
      margins: cellMargins,
      verticalAlign: VerticalAlign.CENTER,
      shading: opts?.header ? { type: ShadingType.CLEAR, fill: headerFill } : undefined,
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text,
              font: 'Calibri',
              size: opts?.header ? 20 : 21,
              bold: Boolean(opts?.header),
              color: opts?.header ? '7F0A10' : '1A1512',
            }),
          ],
        }),
      ],
    });
  }

  function tableFor(list: AnalyticsExportStudentRow[]) {
    const header = new TableRow({
      children: [
        cell('Учащийся', { header: true, width: 4200 }),
        cell('Баллы', { header: true, width: 1600 }),
        cell('%', { header: true, width: 1400 }),
        cell('Оценка', { header: true, width: 1400 }),
      ],
    });
    const body = list.map(
      (row) =>
        new TableRow({
          children: [
            cell(row.fullName, { width: 4200 }),
            cell(row.slash, { width: 1600 }),
            cell(row.percent == null ? '—' : formatPct(row.percent), { width: 1400 }),
            cell(row.grade, { width: 1400 }),
          ],
        }),
    );
    return new Table({
      width: { size: 8600, type: WidthType.DXA },
      columnWidths: [4200, 1600, 1400, 1400],
      rows: [header, ...body],
    });
  }

  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: 'Результаты тестов по английскому',
          font: 'Calibri',
          bold: true,
          color: '7F0A10',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${scopeLabel} · ${stamp()}`,
          font: 'Calibri',
          italics: true,
          color: '5C5148',
          size: 22,
        }),
      ],
    }),
  ];

  const grouped = groupAnalyticsExportRows(rows);
  if (!grouped.size) {
    children.push(new Paragraph({ text: 'В выбранном срезе нет учащихся с баллами.' }));
  }
  for (const [, list] of grouped) {
    const head = list[0];
    const parallel = head?.parallel != null ? ` · ${head.parallel} параллель` : '';
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
        children: [
          new TextRun({
            text: `${head?.groupTitle || 'Группа'}${parallel}`,
            font: 'Calibri',
            bold: true,
            color: '1A1512',
          }),
        ],
      }),
    );
    children.push(tableFor(list));
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${analyticsExportBasename(scopeLabel)}.docx`);
}
