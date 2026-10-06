import type { PhenomenalLessonsMergePayload, PhenomenalMergeRow } from '../../types';
import { parentAnswersToStructuredReview, tryParseStructuredFromFlatReviewText } from './parentReviewFormat';
import {
  buildLessonMatchKey,
  normalizeLessonCodeForGroup,
  type TeacherLessonChecklistRow,
} from './parseTeacherChecklistApril';

export { PHENOMENAL_REPORT_AUTOSAVE_KEY, PHENOMENAL_REPORT_SEED_KEY } from './storageKeys';

/**
 * Редактируемый черновик отчёта «как лист Отзывы»: поля из Excel педагогов + строки от родителей.
 */
export interface PhenomenalReportReviewLine {
  id: string;
  /** Совмещённый текст (экспорт, совместимость) */
  text: string;
  /** ФИО посетившего / родителя */
  respondentName?: string;
  /** Общая оценка (например 1–10) */
  overallRating?: string;
  /** Комментарии и ответы на вопросы — отдельным абзацем от ФИО и оценки */
  comments?: string;
  /** Пришло из слияния с ответом родителя */
  fromMergedParent?: boolean;
  /** Подставлено из текстов опроса на Пульсе (обновляется при смене полей блока) */
  fromPulse?: boolean;
}

export interface PhenomenalReportBlockDraft {
  id: string;
  /** Индекс строки в первом Excel (чек-лист); null — блок добавлен вручную */
  sourceTeacherRowIndex: number | null;
  /** Все строки чек-листа, если блок собран по одному шифру из нескольких строк */
  sourceTeacherRowIndices?: number[];
  /** Отметка времени из чек-листа (ISO или как в Excel) */
  submittedAt?: string | null;
  lessonCode: string;
  conductingTeachers: string;
  subjects: string;
  rubricOrganizational?: string;
  rubricGoalSetting?: string;
  rubricTechnologies?: string;
  rubricInformation?: string;
  rubricGeneralContent?: string;
  rubricCultural?: string;
  rubricReflection?: string;
  /** Строка для поля ввода (число или пусто) */
  methodologicalScore: string;
  teacherNotes: string;
  observerName: string;
  /** Класс как в опросе родителей на Пульсе — для точного сопоставления отзывов */
  parentClassLabel?: string;
  matchConfidence?: number;
  /** Строка чек-листа без пары в расписании — внизу списка, для ручного слияния с уроком */
  checklistUnmatchedOrphan?: boolean;
  reviews: PhenomenalReportReviewLine[];
}

export interface PhenomenalReportDraft {
  title: string;
  periodLabel: string;
  blocks: PhenomenalReportBlockDraft[];
  updatedAt: string;
  /** Опрос родителей на Пульсе (id) — подгрузка отзывов по ссылке для руководителя */
  surveyId?: number | null;
}

/**
 * Заголовок блока: ПРЕДМЕТ (КЛАСС) капсом; класс только из опроса родителей.
 * Без предмета — шифр урока или «Урок N».
 */
export function phenomenalBlockHeadingTitle(
  block: Pick<PhenomenalReportBlockDraft, 'subjects' | 'lessonCode' | 'parentClassLabel'>,
  blockIndex: number,
): string {
  const rawSubj = String(block.subjects ?? '').trim();
  let subj = rawSubj.split(/\s*\/\s*/)[0]?.trim() || rawSubj;
  subj = subj.split('\n')[0].trim().replace(/\s+/g, ' ');
  if (!subj) {
    const code = String(block.lessonCode ?? '').trim();
    subj = code || `Урок ${blockIndex + 1}`;
  }
  if (subj.length > 88) subj = `${subj.slice(0, 86)}…`;

  const clsRaw = String(block.parentClassLabel ?? '').trim().replace(/\s+/g, ' ');
  const subjUp = subj.toLocaleUpperCase('ru-RU');
  if (clsRaw) {
    let clsUp = clsRaw.toLocaleUpperCase('ru-RU');
    if (clsUp.length > 40) clsUp = `${clsUp.slice(0, 38)}…`;
    return `${subjUp} (${clsUp})`;
  }
  return subjUp;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parentAnswersToReviewText(answers: Record<string, unknown>): string {
  const lines = Object.entries(answers)
    .map(([k, v]) => {
      const val = String(v ?? '').trim();
      if (!val) return '';
      return `${k.trim()}: ${val}`;
    })
    .filter(Boolean);
  return lines.join('\n');
}

function uniqueNormalizedStrings(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const s = p.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** «Фамилия И.О. — Фамилия Имя Отчество» → оставляем более полное ФИО. */
function preferFullPersonLabel(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const parts = s.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return s;
  return parts.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Несколько ФИО в ячейке через запятую/; или «·» между вариантами — к каждому применяем preferFullPersonLabel. */
function expandPersonListField(value: string): string {
  const withCommas = value.replace(/\s*[·•]\s*/g, ',');
  const chunks = withCommas
    .split(/[,;/]+/)
    .map((c) => preferFullPersonLabel(c))
    .filter(Boolean);
  return uniqueNormalizedStrings(chunks).join(', ');
}

/** Все оценки подряд + средний балл (для нескольких наблюдений одного урока). */
function formatMethodologyScoresLine(nums: number[]): string {
  if (nums.length === 0) return '';
  if (nums.length === 1) return String(nums[0]);
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = sum / nums.length;
  const avgRounded = Math.round(avg * 10) / 10;
  const avgStr = Number.isInteger(avgRounded)
    ? String(avgRounded)
    : String(avgRounded).replace('.', ',');
  return `${nums.join(', ')} — средний балл: ${avgStr}`;
}

/** Ключ группы: один блок на нормализованный шифр; без шифра — отдельно по строке чек-листа. */
function phenomenalMergeGroupKey(row: PhenomenalMergeRow): string | null {
  if (row.teacher_row_index == null || !row.teacher) return null;
  const raw = (row.teacher.lessonCode ?? '').replace(/\s+/g, ' ').trim();
  if (raw) return `code:${normalizeLessonCodeForGroup(raw)}`;
  return `row:${row.teacher_row_index}`;
}

function minTeacherRowIndex(rows: PhenomenalMergeRow[]): number {
  return Math.min(...rows.map((r) => r.teacher_row_index ?? Infinity));
}

function sortMergeRowsForBlock(rows: PhenomenalMergeRow[]): PhenomenalMergeRow[] {
  return [...rows].sort((a, b) => {
    const ta = a.teacher_row_index ?? 999999;
    const tb = b.teacher_row_index ?? 999999;
    if (ta !== tb) return ta - tb;
    return a.parent_row_index - b.parent_row_index;
  });
}

function groupPhenomenalMergeRowsByKey(rows: PhenomenalMergeRow[]): Map<string, PhenomenalMergeRow[]> {
  const map = new Map<string, PhenomenalMergeRow[]>();
  for (const row of rows) {
    const k = phenomenalMergeGroupKey(row);
    if (k == null) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(row);
  }
  return map;
}

function sortLessonKeysByMinTeacherRow(
  keys: string[],
  rowsByKey: Map<string, PhenomenalMergeRow[]>,
): string[] {
  return [...keys].sort((a, b) => {
    const da = minTeacherRowIndex(rowsByKey.get(a) ?? []);
    const db = minTeacherRowIndex(rowsByKey.get(b) ?? []);
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
}

function groupTeacherRowsByLessonKey(rows: TeacherLessonChecklistRow[]): Map<string, { row: TeacherLessonChecklistRow; idx: number }[]> {
  const groups = new Map<string, { row: TeacherLessonChecklistRow; idx: number }[]>();
  rows.forEach((row, idx) => {
    const raw = (row.lessonCode ?? '').replace(/\s+/g, ' ').trim();
    const key = raw ? `code:${normalizeLessonCodeForGroup(raw)}` : `row:${idx}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ row, idx });
  });
  return groups;
}

function blockSortKeyForDraft(b: PhenomenalReportBlockDraft): number {
  if (b.sourceTeacherRowIndices?.length) return Math.min(...b.sourceTeacherRowIndices);
  return b.sourceTeacherRowIndex ?? Number.POSITIVE_INFINITY;
}

/** Сжать несколько строк чек-листа одного урока в одну (для слияния с расписанием). */
export function squashTeacherChecklistRows(list: TeacherLessonChecklistRow[]): TeacherLessonChecklistRow {
  if (!list.length) {
    return {
      submittedAt: null,
      observerName: '',
      subjects: '',
      lessonCode: '',
      conductingTeachers: '',
      rubricOrganizational: '',
      rubricGoalSetting: '',
      rubricTechnologies: '',
      rubricInformation: '',
      rubricGeneralContent: '',
      rubricCultural: '',
      rubricReflection: '',
      generalThoughts: '',
      methodologicalScore: null,
    };
  }
  if (list.length === 1) return { ...list[0] };
  const primary = list[0]!;
  const scoreValues = list.map((r) => r.methodologicalScore).filter((x): x is number => x != null);
  let methodologicalScore: number | null = null;
  if (scoreValues.length === 1) methodologicalScore = scoreValues[0]!;
  else if (scoreValues.length > 1) {
    const avg = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
    methodologicalScore = Math.round(avg * 10) / 10;
  }
  const importedClassLabel = uniqueNormalizedStrings(
    list.map((r) => String(r.importedClassLabel ?? '').replace(/\s+/g, ' ').trim()),
  ).join(' · ');
  return {
    submittedAt: primary.submittedAt ?? null,
    observerName: uniqueNormalizedStrings(
      list.map((r) => preferFullPersonLabel(r.observerName.replace(/\s+/g, ' ').trim())),
    ).join(' · '),
    subjects: uniqueNormalizedStrings(list.map((r) => r.subjects)).join(' · '),
    lessonCode: primary.lessonCode ?? '',
    conductingTeachers: uniqueNormalizedStrings(list.map((r) => expandPersonListField(r.conductingTeachers))).join(
      ' · ',
    ),
    rubricOrganizational: uniqueNormalizedStrings(list.map((r) => r.rubricOrganizational)).join('\n'),
    rubricGoalSetting: uniqueNormalizedStrings(list.map((r) => r.rubricGoalSetting)).join('\n'),
    rubricTechnologies: uniqueNormalizedStrings(list.map((r) => r.rubricTechnologies)).join('\n'),
    rubricInformation: uniqueNormalizedStrings(list.map((r) => r.rubricInformation)).join('\n'),
    rubricGeneralContent: uniqueNormalizedStrings(list.map((r) => r.rubricGeneralContent)).join('\n'),
    rubricCultural: uniqueNormalizedStrings(list.map((r) => r.rubricCultural)).join('\n'),
    rubricReflection: uniqueNormalizedStrings(list.map((r) => r.rubricReflection)).join('\n'),
    generalThoughts: uniqueNormalizedStrings(list.map((r) => r.generalThoughts)).join('\n\n'),
    methodologicalScore,
    importedClassLabel: importedClassLabel || undefined,
  };
}

function teachersOverlapForMerge(a: string, b: string): boolean {
  const sa = expandPersonListField(a).replace(/\s+/g, ' ').trim().toLowerCase();
  const sb = expandPersonListField(b).replace(/\s+/g, ' ').trim().toLowerCase();
  if (!sa || !sb) return true;
  if (sa === sb) return true;
  if (sa.includes(sb) || sb.includes(sa)) return true;
  const tok = (s: string) =>
    s
      .split(/[,;\s·]+/)
      .map((x) => x.replace(/\./g, '').trim())
      .filter((x) => x.length > 2);
  const A = tok(sa);
  const B = tok(sb);
  return A.some((x) => B.some((y) => x.includes(y) || y.includes(x)));
}

function scheduleAndChecklistCompatible(
  schedule: TeacherLessonChecklistRow,
  checklist: TeacherLessonChecklistRow,
): boolean {
  const ns = normalizeLessonCodeForGroup(schedule.lessonCode);
  const nc = normalizeLessonCodeForGroup(checklist.lessonCode);
  if (ns && nc) {
    if (ns === nc) return teachersOverlapForMerge(schedule.conductingTeachers, checklist.conductingTeachers);
    return false;
  }
  const ss = schedule.subjects.replace(/\s+/g, ' ').trim().toLowerCase();
  const cs = checklist.subjects.replace(/\s+/g, ' ').trim().toLowerCase();
  if (ss && cs && ss === cs) return teachersOverlapForMerge(schedule.conductingTeachers, checklist.conductingTeachers);
  try {
    if (buildLessonMatchKey(schedule.lessonCode, schedule.conductingTeachers) === buildLessonMatchKey(checklist.lessonCode, checklist.conductingTeachers))
      return true;
  } catch {
    /* ignore */
  }
  return false;
}

function enrichScheduleRowWithChecklist(
  schedule: TeacherLessonChecklistRow,
  checklist: TeacherLessonChecklistRow,
): TeacherLessonChecklistRow {
  const out: TeacherLessonChecklistRow = { ...schedule };
  const ov = (s: string | undefined | null) => String(s ?? '').trim();
  if (checklist.submittedAt) out.submittedAt = checklist.submittedAt;
  if (ov(checklist.observerName)) out.observerName = checklist.observerName;
  if (ov(checklist.subjects)) out.subjects = checklist.subjects;
  if (ov(checklist.conductingTeachers)) out.conductingTeachers = checklist.conductingTeachers;
  if (ov(checklist.lessonCode)) out.lessonCode = checklist.lessonCode;
  const rubricKeys = [
    'rubricOrganizational',
    'rubricGoalSetting',
    'rubricTechnologies',
    'rubricInformation',
    'rubricGeneralContent',
    'rubricCultural',
    'rubricReflection',
  ] as const;
  for (const k of rubricKeys) {
    if (ov(checklist[k])) out[k] = checklist[k];
  }
  if (ov(checklist.generalThoughts)) out.generalThoughts = checklist.generalThoughts;
  if (checklist.methodologicalScore != null) out.methodologicalScore = checklist.methodologicalScore;
  if (ov(checklist.importedClassLabel)) out.importedClassLabel = checklist.importedClassLabel;
  return out;
}

/**
 * Порядок: сначала все строки расписания (если задано), с подмешанным чек-листом; в конце — строки чек-листа без пары
 * (для ручного слияния в редакторе, помечаются `checklistUnmatchedOrphan`).
 */
export function combineScheduleAndChecklistTeacherRows(
  scheduleRows: TeacherLessonChecklistRow[] | null | undefined,
  checklistRows: TeacherLessonChecklistRow[] | null | undefined,
): {
  rows: TeacherLessonChecklistRow[];
  warnings: string[];
  /** Если было расписание: число карточек «по расписанию»; индексы ≥ этого в `rows` — осиротевший чек-лист. */
  scheduleBackedRowCount?: number;
} {
  const warnings: string[] = [];
  const sch = scheduleRows?.length ? [...scheduleRows] : null;
  const ch = checklistRows?.length ? [...checklistRows] : null;
  if (!sch) {
    return { rows: ch ?? [], warnings };
  }
  if (!ch) {
    return { rows: sch, warnings, scheduleBackedRowCount: sch.length };
  }

  const chGroups = groupTeacherRowsByLessonKey(ch);
  const squashedList: TeacherLessonChecklistRow[] = [];
  for (const [, items] of chGroups) {
    squashedList.push(squashTeacherChecklistRows(items.map((x) => x.row)));
  }

  const used = new Set<number>();
  const out: TeacherLessonChecklistRow[] = [];
  let scheduleUnmatched = 0;

  for (const s of sch) {
    let bestI = -1;
    for (let i = 0; i < squashedList.length; i++) {
      if (used.has(i)) continue;
      if (scheduleAndChecklistCompatible(s, squashedList[i]!)) {
        bestI = i;
        break;
      }
    }
    if (bestI >= 0) {
      used.add(bestI);
      out.push(enrichScheduleRowWithChecklist(s, squashedList[bestI]!));
    } else {
      scheduleUnmatched++;
      out.push({ ...s });
    }
  }

  let orphanChecklist = 0;
  for (let i = 0; i < squashedList.length; i++) {
    if (used.has(i)) continue;
    orphanChecklist++;
    out.push(squashedList[i]!);
  }

  if (scheduleUnmatched > 0) {
    warnings.push(
      `${scheduleUnmatched} строк(и) расписания без пары в чек-листе — карточки только из расписания (рубрики пустые, пока не заполните вручную).`,
    );
  }
  if (orphanChecklist > 0) {
    warnings.push(
      `${orphanChecklist} строк(а) чек-листа не совпали с расписанием — добавлены в конец черновика (в редакторе выделены, их можно вручную слить с уроком).`,
    );
  }

  return { rows: out, warnings, scheduleBackedRowCount: sch.length };
}

function blockFromTeacherLessonItems(
  items: { row: TeacherLessonChecklistRow; idx: number }[],
  meta?: { checklistUnmatchedOrphan?: boolean },
): PhenomenalReportBlockDraft {
  items.sort((a, b) => a.idx - b.idx);
  const list = items.map((i) => i.row);
  const indices = items.map((i) => i.idx).sort((a, b) => a - b);
  const scoreValues = list.map((r) => r.methodologicalScore).filter((x): x is number => x != null);
  const squashed = squashTeacherChecklistRows(list);
  const cls = String(squashed.importedClassLabel ?? '').trim();
  return {
    id: newId('blk'),
    sourceTeacherRowIndex: indices[0]!,
    sourceTeacherRowIndices: indices.length > 1 ? indices : undefined,
    submittedAt: squashed.submittedAt ?? null,
    lessonCode: squashed.lessonCode ?? '',
    conductingTeachers: squashed.conductingTeachers,
    subjects: squashed.subjects,
    rubricOrganizational: squashed.rubricOrganizational || undefined,
    rubricGoalSetting: squashed.rubricGoalSetting || undefined,
    rubricTechnologies: squashed.rubricTechnologies || undefined,
    rubricInformation: squashed.rubricInformation || undefined,
    rubricGeneralContent: squashed.rubricGeneralContent || undefined,
    rubricCultural: squashed.rubricCultural || undefined,
    rubricReflection: squashed.rubricReflection || undefined,
    methodologicalScore: formatMethodologyScoresLine(scoreValues),
    teacherNotes: squashed.generalThoughts,
    observerName: squashed.observerName,
    parentClassLabel: cls || undefined,
    checklistUnmatchedOrphan: meta?.checklistUnmatchedOrphan || undefined,
    reviews: [],
  };
}

function scoresFromTeacherSnapshot(t: NonNullable<PhenomenalMergeRow['teacher']>): number[] {
  if (Array.isArray(t.methodologicalScores) && t.methodologicalScores.length) {
    return t.methodologicalScores.filter((n) => typeof n === 'number' && Number.isFinite(n));
  }
  if (t.methodologicalScore != null && Number.isFinite(t.methodologicalScore)) return [t.methodologicalScore];
  return [];
}

function extractParentClassFromMergeRows(rows: PhenomenalMergeRow[]): string {
  for (const r of rows) {
    const a = r.parent?.answers_labeled;
    if (!a || typeof a !== 'object') continue;
    for (const [k, v] of Object.entries(a)) {
      if (/класс/i.test(k)) {
        const s = String(v ?? '').trim();
        if (s) return s;
      }
    }
  }
  return '';
}

function mergeRubricsFromTeachers(
  teachers: NonNullable<PhenomenalMergeRow['teacher']>[],
  pick: (t: NonNullable<PhenomenalMergeRow['teacher']>) => string,
): string {
  return uniqueNormalizedStrings(teachers.map((t) => pick(t) || '')).join('\n');
}

function blockFromMergedGroup(rows: PhenomenalMergeRow[]): PhenomenalReportBlockDraft {
  const sorted = sortMergeRowsForBlock(rows);

  const tiOrder: number[] = [];
  const byTi = new Map<number, NonNullable<PhenomenalMergeRow['teacher']>>();
  for (const r of sorted) {
    if (r.teacher_row_index == null || !r.teacher) continue;
    const ti = r.teacher_row_index;
    if (!byTi.has(ti)) {
      byTi.set(ti, r.teacher);
      tiOrder.push(ti);
    }
  }
  const teachers = tiOrder.map((ti) => byTi.get(ti)!);
  const primary = teachers[0];

  const conductingTeachers = uniqueNormalizedStrings(
    teachers.map((t) => expandPersonListField(t.conductingTeachers)),
  ).join(' · ');
  const subjects = uniqueNormalizedStrings(teachers.map((t) => t.subjects)).join(' · ');
  const teacherNotes = uniqueNormalizedStrings(teachers.map((t) => t.generalThoughts)).join('\n\n');
  const observerName = uniqueNormalizedStrings(
    teachers.map((t) => preferFullPersonLabel(t.observerName.replace(/\s+/g, ' ').trim())),
  ).join(' · ');

  const scoreValues = teachers.flatMap((t) => scoresFromTeacherSnapshot(t));
  const methodologicalScore = formatMethodologyScoresLine(scoreValues);

  const rubricOrganizational = mergeRubricsFromTeachers(teachers, (t) => t.rubricOrganizational ?? '');
  const rubricGoalSetting = mergeRubricsFromTeachers(teachers, (t) => t.rubricGoalSetting ?? '');
  const rubricTechnologies = mergeRubricsFromTeachers(teachers, (t) => t.rubricTechnologies ?? '');
  const rubricInformation = mergeRubricsFromTeachers(teachers, (t) => t.rubricInformation ?? '');
  const rubricGeneralContent = mergeRubricsFromTeachers(teachers, (t) => t.rubricGeneralContent ?? '');
  const rubricCultural = mergeRubricsFromTeachers(teachers, (t) => t.rubricCultural ?? '');
  const rubricReflection = mergeRubricsFromTeachers(teachers, (t) => t.rubricReflection ?? '');

  const confidences = rows.map((r) => r.confidence).filter((c) => Number.isFinite(c));
  const avgConf =
    confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined;

  const seenParent = new Set<number>();
  const reviews: PhenomenalReportReviewLine[] = [];
  for (const r of sorted) {
    if (seenParent.has(r.parent_row_index)) continue;
    seenParent.add(r.parent_row_index);
    const al = r.parent?.answers_labeled;
    if (al && typeof al === 'object') {
      const st = parentAnswersToStructuredReview(al as Record<string, unknown>);
      reviews.push({
        id: newId('rev'),
        respondentName: st.respondentName || undefined,
        overallRating: st.overallRating || undefined,
        comments: st.comments || undefined,
        text: st.flatText || parentAnswersToReviewText(al as Record<string, unknown>),
        fromMergedParent: true,
      });
    } else {
      reviews.push({ id: newId('rev'), text: '', fromMergedParent: true });
    }
  }

  const sortedTi = [...tiOrder].sort((a, b) => a - b);

  return {
    id: newId('blk'),
    sourceTeacherRowIndex: tiOrder.length ? Math.min(...tiOrder) : null,
    sourceTeacherRowIndices: sortedTi.length > 1 ? sortedTi : undefined,
    submittedAt: primary?.submittedAt ?? null,
    lessonCode: primary?.lessonCode ?? '',
    conductingTeachers,
    subjects,
    rubricOrganizational: rubricOrganizational || undefined,
    rubricGoalSetting: rubricGoalSetting || undefined,
    rubricTechnologies: rubricTechnologies || undefined,
    rubricInformation: rubricInformation || undefined,
    rubricGeneralContent: rubricGeneralContent || undefined,
    rubricCultural: rubricCultural || undefined,
    rubricReflection: rubricReflection || undefined,
    methodologicalScore,
    teacherNotes,
    observerName,
    parentClassLabel: extractParentClassFromMergeRows(sorted) || undefined,
    matchConfidence: avgConf,
    reviews,
  };
}

/**
 * Черновик после слияния: карточки = строки таблицы уроков (расписание ∪ чек-лист), поля урока из чек-листа,
 * отзывы родителей подставляются по teacher_row_index из результата merge.
 */
function buildDraftFromMergeWithTeacherTable(
  merge: PhenomenalLessonsMergePayload,
  teacherRows: TeacherLessonChecklistRow[],
  opts?: { title?: string; periodLabel?: string; scheduleBackedRowCount?: number },
): PhenomenalReportDraft {
  const n = opts?.scheduleBackedRowCount;
  const blocks: PhenomenalReportBlockDraft[] = teacherRows.map((row, idx) =>
    blockFromTeacherLessonItems([{ row, idx }], {
      checklistUnmatchedOrphan: n != null && idx >= n,
    }),
  );

  const seenPi = new Set<number>();
  const confByTi: number[][] = Array.from({ length: blocks.length }, () => []);

  const pushReview = (r: PhenomenalMergeRow) => {
    const pi = r.parent_row_index;
    if (seenPi.has(pi)) return;
    const ti = r.teacher_row_index;
    if (ti == null || !Number.isFinite(ti) || ti < 0 || ti >= blocks.length) return;
    const al = r.parent?.answers_labeled;
    if (!al || typeof al !== 'object') return;
    seenPi.add(pi);
    confByTi[ti]!.push(r.confidence);
    const st = parentAnswersToStructuredReview(al as Record<string, unknown>);
    const rev: PhenomenalReportReviewLine = {
      id: newId('rev'),
      respondentName: st.respondentName || undefined,
      overallRating: st.overallRating || undefined,
      comments: st.comments || undefined,
      text: st.flatText || parentAnswersToReviewText(al as Record<string, unknown>),
      fromMergedParent: true,
    };
    const b = blocks[ti]!;
    blocks[ti] = { ...b, reviews: [...b.reviews, rev] };
  };

  for (const r of merge.merged ?? []) pushReview(r);
  for (const r of merge.uncertain ?? []) pushReview(r);

  const rowsByTi: PhenomenalMergeRow[][] = Array.from({ length: blocks.length }, () => []);
  for (const r of [...(merge.merged ?? []), ...(merge.uncertain ?? [])]) {
    const ti = r.teacher_row_index;
    if (ti != null && ti >= 0 && ti < blocks.length) rowsByTi[ti]!.push(r);
  }

  for (let i = 0; i < blocks.length; i++) {
    const confs = confByTi[i]!.filter((c) => Number.isFinite(c));
    const pc = extractParentClassFromMergeRows(rowsByTi[i] ?? []);
    const b = blocks[i]!;
    let next: PhenomenalReportBlockDraft = { ...b };
    if (confs.length) next.matchConfidence = confs.reduce((a, c) => a + c, 0) / confs.length;
    if (pc) {
      const existing = String(next.parentClassLabel ?? '').trim();
      next.parentClassLabel = existing ? uniqueNormalizedStrings([existing, pc]).join(' · ') : pc;
    }
    blocks[i] = next;
  }

  return {
    title: opts?.title ?? merge.survey?.title ?? 'Отчёт по феноменальным урокам',
    periodLabel: opts?.periodLabel ?? '',
    blocks,
    updatedAt: new Date().toISOString(),
    surveyId: merge.survey?.id ?? null,
  };
}

/** Старый режим: блоки из пар слияния (если нет массива строк уроков, напр. импорт из sessionStorage). */
function buildDraftFromMergeLegacy(
  merge: PhenomenalLessonsMergePayload,
  opts?: { title?: string; periodLabel?: string; teacherRows?: TeacherLessonChecklistRow[] },
): PhenomenalReportDraft {
  const mergedGrouped = groupPhenomenalMergeRowsByKey(merge.merged ?? []);
  const uncertainGrouped = groupPhenomenalMergeRowsByKey(merge.uncertain ?? []);

  const keysWithBlocks = new Set<string>();
  const blocks: PhenomenalReportBlockDraft[] = [];

  const mergedKeysSorted = sortLessonKeysByMinTeacherRow([...mergedGrouped.keys()], mergedGrouped);
  for (const key of mergedKeysSorted) {
    const mRows = mergedGrouped.get(key)!;
    const uRows = uncertainGrouped.get(key) ?? [];
    if (uRows.length) uncertainGrouped.delete(key);
    blocks.push(blockFromMergedGroup(sortMergeRowsForBlock([...mRows, ...uRows])));
    keysWithBlocks.add(key);
  }

  const uncertainOnlySorted = sortLessonKeysByMinTeacherRow([...uncertainGrouped.keys()], uncertainGrouped);
  for (const key of uncertainOnlySorted) {
    const rows = uncertainGrouped.get(key)!;
    blocks.push(blockFromMergedGroup(sortMergeRowsForBlock(rows)));
    keysWithBlocks.add(key);
  }

  if (opts?.teacherRows?.length) {
    const tg = groupTeacherRowsByLessonKey(opts.teacherRows);
    const teacherKeysSorted = [...tg.keys()].sort((a, b) => {
      const ia = Math.min(...(tg.get(a) ?? []).map((x) => x.idx));
      const ib = Math.min(...(tg.get(b) ?? []).map((x) => x.idx));
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
    for (const key of teacherKeysSorted) {
      if (keysWithBlocks.has(key)) continue;
      const items = tg.get(key)!;
      blocks.push(blockFromTeacherLessonItems(items));
    }
  }

  blocks.sort((a, b) => blockSortKeyForDraft(a) - blockSortKeyForDraft(b));

  return {
    title: opts?.title ?? merge.survey?.title ?? 'Отчёт по феноменальным урокам',
    periodLabel: opts?.periodLabel ?? '',
    blocks,
    updatedAt: new Date().toISOString(),
    surveyId: merge.survey?.id ?? null,
  };
}

export function buildDraftFromMerge(
  merge: PhenomenalLessonsMergePayload,
  opts?: {
    title?: string;
    periodLabel?: string;
    teacherRows?: TeacherLessonChecklistRow[];
    scheduleBackedRowCount?: number;
  },
): PhenomenalReportDraft {
  if (opts?.teacherRows?.length) {
    return buildDraftFromMergeWithTeacherTable(merge, opts.teacherRows, {
      title: opts.title,
      periodLabel: opts.periodLabel,
      scheduleBackedRowCount: opts.scheduleBackedRowCount,
    });
  }
  return buildDraftFromMergeLegacy(merge, opts);
}

/** Черновик только из чек-листа / расписания: одна карточка на строку таблицы (порядок строк сохраняется). */
export function buildDraftFromTeacherRows(
  rows: TeacherLessonChecklistRow[],
  opts?: { title?: string; periodLabel?: string; scheduleBackedRowCount?: number },
): PhenomenalReportDraft {
  const n = opts?.scheduleBackedRowCount;
  const blocks: PhenomenalReportBlockDraft[] = rows.map((row, idx) =>
    blockFromTeacherLessonItems([{ row, idx }], {
      checklistUnmatchedOrphan: n != null && idx >= n,
    }),
  );

  return {
    title: opts?.title ?? 'Черновик из чек-листа педагогов',
    periodLabel: opts?.periodLabel ?? '',
    blocks,
    updatedAt: new Date().toISOString(),
    surveyId: null,
  };
}

const RUBRIC_FIELD_KEYS = [
  'rubricOrganizational',
  'rubricGoalSetting',
  'rubricTechnologies',
  'rubricInformation',
  'rubricGeneralContent',
  'rubricCultural',
  'rubricReflection',
] as const;

type RubricFieldKey = (typeof RUBRIC_FIELD_KEYS)[number];

function extractMethodologyNumbersFromScoreString(s: string): number[] {
  const out: number[] = [];
  const re = /\b(\d+(?:[.,]\d+)?)\b/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(s)) !== null) {
    const v = parseFloat(m[1].replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > 10) continue;
    const k = String(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= 12) break;
  }
  return out;
}

function mergeRubricFieldFromBlocks(
  blocks: PhenomenalReportBlockDraft[],
  pick: (b: PhenomenalReportBlockDraft) => string | undefined,
): string | undefined {
  const s = uniqueNormalizedStrings(blocks.map((b) => pick(b) || '')).join('\n');
  return s || undefined;
}

/** Слияние нескольких блоков черновика в один (по группе индексов после ИИ). */
export function mergePhenomenalReportBlockGroup(
  blocks: PhenomenalReportBlockDraft[],
  indices: number[],
): PhenomenalReportBlockDraft {
  const sortedIdx = [...indices].sort((a, b) => a - b);
  const list = sortedIdx.map((i) => blocks[i]);
  const primary = list[0];

  const codes = list.map((b) => b.lessonCode.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const lessonCode = codes.length ? codes.reduce((a, b) => (b.length > a.length ? b : a), codes[0]) : primary.lessonCode;

  const conductingTeachers = uniqueNormalizedStrings(list.map((b) => expandPersonListField(b.conductingTeachers))).join(
    ' · ',
  );
  const subjects = uniqueNormalizedStrings(list.map((b) => b.subjects)).join(' · ');
  const observerName = uniqueNormalizedStrings(
    list.map((b) => preferFullPersonLabel(b.observerName.replace(/\s+/g, ' ').trim())),
  ).join(' · ');
  const teacherNotes = uniqueNormalizedStrings(list.map((b) => b.teacherNotes)).join('\n\n');

  const rubricPatch: Partial<Pick<PhenomenalReportBlockDraft, RubricFieldKey>> = {};
  for (const k of RUBRIC_FIELD_KEYS) {
    const merged = mergeRubricFieldFromBlocks(list, (b) => b[k]);
    if (merged) rubricPatch[k] = merged;
  }

  const methNums = sortedIdx.flatMap((i) => extractMethodologyNumbersFromScoreString(blocks[i].methodologicalScore));
  const methodologicalScore =
    methNums.length > 0
      ? formatMethodologyScoresLine(methNums)
      : uniqueNormalizedStrings(list.map((b) => b.methodologicalScore)).join(' · ') || '';

  const seenRev = new Set<string>();
  const reviews: PhenomenalReportReviewLine[] = [];
  for (const b of list) {
    for (const r of b.reviews) {
      const k = [
        r.respondentName,
        r.overallRating,
        r.comments,
        r.text,
      ]
        .map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().toLowerCase())
        .filter(Boolean)
        .join('|');
      if (!k) continue;
      if (seenRev.has(k)) continue;
      seenRev.add(k);
      reviews.push({ ...r, id: newId('rev') });
    }
  }

  const allTi: number[] = [];
  for (const b of list) {
    if (b.sourceTeacherRowIndices?.length) allTi.push(...b.sourceTeacherRowIndices);
    else if (b.sourceTeacherRowIndex != null) allTi.push(b.sourceTeacherRowIndex);
  }
  const uniqTi = [...new Set(allTi)].sort((a, b) => a - b);
  const sourceTeacherRowIndex = uniqTi.length ? uniqTi[0]! : null;
  const sourceTeacherRowIndices = uniqTi.length > 1 ? uniqTi : undefined;

  const confs = list.map((b) => b.matchConfidence).filter((c): c is number => c != null && Number.isFinite(c));
  const matchConfidence =
    confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : undefined;

  const submittedAt =
    list.map((b) => b.submittedAt).find((x) => x != null && String(x).trim() !== '') ?? primary.submittedAt ?? null;

  const parentClassLabelRaw = uniqueNormalizedStrings(
    list.map((b) => String(b.parentClassLabel ?? '').replace(/\s+/g, ' ').trim()),
  ).join(' · ');
  const parentClassLabel = parentClassLabelRaw || undefined;

  const checklistUnmatchedOrphan =
    list.length > 0 && list.every((b) => b.checklistUnmatchedOrphan);

  return {
    id: newId('blk'),
    sourceTeacherRowIndex,
    sourceTeacherRowIndices,
    submittedAt,
    lessonCode,
    conductingTeachers,
    subjects,
    ...rubricPatch,
    methodologicalScore,
    teacherNotes,
    observerName,
    parentClassLabel,
    matchConfidence,
    checklistUnmatchedOrphan: checklistUnmatchedOrphan || undefined,
    reviews,
  };
}

/** Ответ POST /api/phenomenal-lessons/polish-block-headers — по индексу блока. */
export interface PhenomenalBlockHeaderPolishItem {
  i: number;
  conductingTeachers: string;
  subjects: string;
  parentClassLabel: string;
}

/** Подставить нормализованные шапки; пустая строка в item — не менять поле блока. */
export function applyPhenomenalBlockHeaderPolish(
  blocks: PhenomenalReportBlockDraft[],
  items: PhenomenalBlockHeaderPolishItem[],
): PhenomenalReportBlockDraft[] {
  const byI = new Map<number, PhenomenalBlockHeaderPolishItem>();
  for (const x of items) {
    if (x && Number.isInteger(x.i) && x.i >= 0) byI.set(x.i, x);
  }
  return blocks.map((b, idx) => {
    const p = byI.get(idx);
    if (!p) return b;
    const ct = String(p.conductingTeachers ?? '').trim();
    const sj = String(p.subjects ?? '').trim();
    const cl = String(p.parentClassLabel ?? '').trim();
    return {
      ...b,
      conductingTeachers: ct ? ct : b.conductingTeachers,
      subjects: sj ? sj : b.subjects,
      parentClassLabel: cl ? cl : b.parentClassLabel,
    };
  });
}

export function validatePhenomenalBlockClusterGroups(groups: number[][], blockCount: number): boolean {
  if (blockCount < 1 || !Array.isArray(groups) || groups.length === 0) return false;
  const seen = new Set<number>();
  for (const g of groups) {
    if (!Array.isArray(g) || g.length === 0) return false;
    for (const x of g) {
      const i = Number(x);
      if (!Number.isInteger(i) || i < 0 || i >= blockCount) return false;
      if (seen.has(i)) return false;
      seen.add(i);
    }
  }
  return seen.size === blockCount;
}

/** Применить ответ ИИ: groups — массив групп индексов блоков. Возвращает null, если разбиение некорректно. */
export function applyPhenomenalBlockClusterGroups(
  blocks: PhenomenalReportBlockDraft[],
  groups: number[][],
): PhenomenalReportBlockDraft[] | null {
  if (!validatePhenomenalBlockClusterGroups(groups, blocks.length)) return null;
  return groups.map((g) =>
    g.length === 1 ? { ...blocks[g[0]!] } : mergePhenomenalReportBlockGroup(blocks, g),
  );
}

export function emptyBlock(): PhenomenalReportBlockDraft {
  return {
    id: newId('blk'),
    sourceTeacherRowIndex: null,
    lessonCode: '',
    conductingTeachers: '',
    subjects: '',
    methodologicalScore: '',
    teacherNotes: '',
    observerName: '',
    parentClassLabel: '',
    reviews: [],
  };
}

export function emptyReviewLine(): PhenomenalReportReviewLine {
  return { id: newId('rev'), text: '' };
}

/** Собрать поле text из структурных полей (для сохранения и экспорта). */
export function composeReviewFlatText(r: Pick<PhenomenalReportReviewLine, 'respondentName' | 'overallRating' | 'comments' | 'text'>): string {
  const name = String(r.respondentName ?? '').trim();
  const rating = String(r.overallRating ?? '').trim();
  const com = String(r.comments ?? '').trim();
  const parts = [
    name ? `ФИО, посетившего урок: ${name}` : '',
    rating ? `Общая оценка урока: ${rating}` : '',
    com,
  ].filter(Boolean);
  const built = parts.join('\n\n').trim();
  if (built) return built;
  return String(r.text ?? '').trim();
}

/** Разовое заполнение полей из старого единого text (после загрузки черновика). */
export function hydrateReviewStructuredFields(d: PhenomenalReportDraft): PhenomenalReportDraft {
  let needs = false;
  for (const b of d.blocks) {
    for (const r of b.reviews) {
      if (r.fromPulse) continue;
      const hasStruct =
        String(r.respondentName ?? '').trim() ||
        String(r.overallRating ?? '').trim() ||
        String(r.comments ?? '').trim();
      if (hasStruct) continue;
      if (tryParseStructuredFromFlatReviewText(r.text)) {
        needs = true;
        break;
      }
    }
    if (needs) break;
  }
  if (!needs) return d;

  const blocks = d.blocks.map((b) => ({
    ...b,
    reviews: b.reviews.map((r) => {
      if (r.fromPulse) return r;
      const hasStruct =
        String(r.respondentName ?? '').trim() ||
        String(r.overallRating ?? '').trim() ||
        String(r.comments ?? '').trim();
      if (hasStruct) return r;
      const p = tryParseStructuredFromFlatReviewText(r.text);
      if (!p) return r;
      const respondentName = (p.respondentName ?? '').trim();
      const overallRating = (p.overallRating ?? '').trim();
      const comments = (p.comments ?? '').trim();
      const merged = { ...r, respondentName, overallRating, comments };
      return { ...merged, text: composeReviewFlatText(merged) };
    }),
  }));
  return { ...d, blocks, updatedAt: new Date().toISOString() };
}
