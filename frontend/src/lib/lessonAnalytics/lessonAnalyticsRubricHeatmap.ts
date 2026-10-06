import { formatBilingualCellLabel } from '../excelAnalytics/excelDisplayLabel';
import type { CellPrimitive } from '../excelAnalytics/parse';
import { filterKeyForRole, isFilterRole } from '../excelAnalytics/engine';
import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import type { PhenomenalCompetencyKey } from '../phenomenalLessons/competencyScores';
import { PHENOMENAL_RUBRIC_DIMENSIONS } from '../phenomenalLessons/phenomenalRubricDimensions';
import type { TeacherLessonChecklistRow } from '../phenomenalLessons/parseTeacherChecklistApril';

function headerCell(h: unknown): string {
  return String(h ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Те же эвристики, что в parseTeacherChecklistApril.resolveColumnMap для столбцов рубрики. */
export function phenomenalRubricColumnIndicesFromHeaders(headerRow: unknown[]): Partial<
  Record<PhenomenalCompetencyKey, number>
> {
  const headers = headerRow.map((c) => headerCell(c));
  const lower = headers.map((h) => h.toLowerCase());
  const find = (pred: (h: string) => boolean): number => {
    for (let i = 0; i < lower.length; i++) {
      if (pred(lower[i])) return i;
    }
    return -1;
  };
  const out: Partial<Record<PhenomenalCompetencyKey, number>> = {};
  const ixR0 = find((h) => /организац.*пространств/i.test(h));
  if (ixR0 >= 0) out.rubricOrganizational = ixR0;
  const ixR1 = find((h) => /целеполагани/i.test(h));
  if (ixR1 >= 0) out.rubricGoalSetting = ixR1;
  const ixR2 = find((h) => /технологи.*обучен/i.test(h));
  if (ixR2 >= 0) out.rubricTechnologies = ixR2;
  const ixR3 = find((h) => /информационн.*культур/i.test(h));
  if (ixR3 >= 0) out.rubricInformation = ixR3;
  const ixR4 = find((h) => /содержательн.*общезначим/i.test(h));
  if (ixR4 >= 0) out.rubricGeneralContent = ixR4;
  const ixR5 = find((h) => /культурологическ/i.test(h));
  if (ixR5 >= 0) out.rubricCultural = ixR5;
  const ixR6 = find((h) => /рефлексивн/i.test(h));
  if (ixR6 >= 0) out.rubricReflection = ixR6;
  return out;
}

export function teacherDataColumnIndex(
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
  teacherFilterKey: string | null,
): number {
  if (!teacherFilterKey) return -1;
  for (let i = 0; i < roles.length; i++) {
    const r = roles[i];
    if (!isFilterRole(r)) continue;
    if (filterKeyForRole(r, customLabels) === teacherFilterKey) return i;
  }
  return -1;
}

function normCellForTeacherMatch(c: CellPrimitive): string {
  const raw =
    c == null || c === ''
      ? ''
      : c instanceof Date
        ? Number.isFinite(c.getTime())
          ? c.toISOString().slice(0, 10)
          : ''
        : String(c);
  return formatBilingualCellLabel(raw, 'ru').trim().toLowerCase();
}

export function rowMatchesTeacher(cell: CellPrimitive, teacherLabel: string): boolean {
  const tv = normCellForTeacherMatch(cell);
  const want = formatBilingualCellLabel(teacherLabel, 'ru').trim().toLowerCase();
  if (!tv || !want) return false;
  if (tv === want) return true;
  if (tv.includes(want) || want.includes(tv)) return true;
  return false;
}

/**
 * Склеивает текст рубрики по всем строкам среза педагога → для PhenomenalRubricUsageHeatmap source="teacherRow".
 */
export function buildSyntheticTeacherChecklistRowForRubricHeatmap(
  headers: string[],
  matrixRows: CellPrimitive[][],
  rolesForRun: ColumnRole[],
  customLabels: CustomFilterLabels,
  teacherFilterKey: string | null,
  teacherLabel: string,
): TeacherLessonChecklistRow | null {
  const rubricIdx = phenomenalRubricColumnIndicesFromHeaders(headers);
  if (Object.keys(rubricIdx).length === 0) return null;
  const ti = teacherDataColumnIndex(rolesForRun, customLabels, teacherFilterKey);
  if (ti < 0) return null;
  const want = formatBilingualCellLabel(teacherLabel, 'ru').trim();
  if (!want) return null;

  const chunks: Partial<Record<PhenomenalCompetencyKey, string[]>> = {};
  for (const row of matrixRows) {
    if (!row.length) continue;
    const teacherCell = ti < row.length ? row[ti] : '';
    if (!rowMatchesTeacher(teacherCell, teacherLabel)) continue;

    for (const d of PHENOMENAL_RUBRIC_DIMENSIONS) {
      const k = d.key;
      const ci = rubricIdx[k];
      if (ci == null || ci >= row.length) continue;
      const raw = String(row[ci] ?? '').trim();
      if (!raw) continue;
      if (!chunks[k]) chunks[k] = [];
      chunks[k]!.push(raw);
    }
  }

  const join = (k: PhenomenalCompetencyKey) => (chunks[k]?.length ? chunks[k]!.join('\n\n') : '');

  const empty: TeacherLessonChecklistRow = {
    submittedAt: null,
    observerName: '',
    subjects: '',
    lessonCode: '',
    conductingTeachers: '',
    rubricOrganizational: join('rubricOrganizational'),
    rubricGoalSetting: join('rubricGoalSetting'),
    rubricTechnologies: join('rubricTechnologies'),
    rubricInformation: join('rubricInformation'),
    rubricGeneralContent: join('rubricGeneralContent'),
    rubricCultural: join('rubricCultural'),
    rubricReflection: join('rubricReflection'),
    generalThoughts: '',
    methodologicalScore: null,
  };

  const anyText = PHENOMENAL_RUBRIC_DIMENSIONS.some((d) => {
    const v = empty[d.key as keyof TeacherLessonChecklistRow];
    return typeof v === 'string' && v.trim().length > 0;
  });
  if (!anyText) return null;
  return empty;
}
