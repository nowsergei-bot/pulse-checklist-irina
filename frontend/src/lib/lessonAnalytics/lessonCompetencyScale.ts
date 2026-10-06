import type { CellPrimitive } from '../excelAnalytics/parse';
import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import {
  LESSON_VISIT_SECTION_DEFS,
  lessonVisitSectionHeader,
  rolesIncludeVisitChecklistSections,
} from '../lessonVisitChecklist/visitChecklistAnalyticsMapping';
import { formatVisitSectionPhraseDisplay } from '../lessonVisitChecklist/visitChecklistScoring';
import { rowMatchesTeacher, teacherDataColumnIndex } from './lessonAnalyticsRubricHeatmap';

function normHeaderForSummary(h: string): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Заголовок столбца «Общие выводы по уроку / Summary» в шаблоне ИИ-аналитики урока. */
const LESSON_SUMMARY_COLUMN_HEADER_RE =
  /общие\s*выводы\s*по\s*уроку|выводы\s*\/\s*рекомендац|summary\s*\/\s*recommendation|summary\/recommendation/i;

/** Фиксированные строки матрицы «уровни в срезе» (как в феноменальных уроках), данные — из ячеек 0–4 через запятую. */
export const LESSON_COMPETENCY_SCALE_DEFS: readonly {
  role: ColumnRole;
  title: string;
}[] = [
  {
    role: 'lesson_comp_scale_org_tech',
    title:
      'Организационно-технические условия проведения урока // Organisational and technical conditions of the lesson',
  },
  {
    role: 'lesson_comp_scale_methodology',
    title: 'Методическая грамотность построения урока // Lesson methodology*',
  },
  {
    role: 'lesson_comp_scale_general',
    title: 'Общекультурные компетенции // General performance',
  },
  {
    role: 'lesson_comp_scale_rapport',
    title: 'Взаимодействие участников образовательной деятельности // Teacher-student rapport',
  },
  {
    role: 'lesson_comp_scale_misc',
    title: 'Дополнительные // Miscellaneous',
  },
  {
    role: 'lesson_comp_scale_summary',
    title: 'Общие выводы по уроку/рекомендации // Summary/recommendation',
  },
] as const;

/** Только шкала 0–4 для блока «Компетенции» (без столбца общих выводов — он идёт текстом ниже). */
export const LESSON_COMPETENCY_MATRIX_DEFS = LESSON_COMPETENCY_SCALE_DEFS.filter(
  (d) => d.role !== 'lesson_comp_scale_summary',
);

/** Для заголовка карточки: первая «фамилия» в русской записи «Фамилия И. О.». */
export function lessonAnalyticsCardSurname(teacherLabel: string): string {
  const t = String(teacherLabel || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '—';
  const first = t.split(/[\s\u00A0]+/)[0];
  return first || t;
}

const SCALE_MAX = 4;

/**
 * Извлекает уровни 0…max из ячейки вида «3, 4» или «2;3» (числа через разделитель).
 */
export function parseCommaSeparatedScaleLevels(raw: unknown, maxLevel: number = SCALE_MAX): Set<number> {
  const used = new Set<number>();
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return used;
  const parts = s.split(/[,;،\s]+/).filter((p) => p.length > 0);
  for (const part of parts) {
    const m = part.match(/(\d+)/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 0 && n <= maxLevel) used.add(n);
  }
   return used;
}

/** Сколько отдельных чисел 0…maxLevel в ячейке (через запятую и т.п.). */
export function countCommaSeparatedScaleTokens(raw: unknown, maxLevel: number = SCALE_MAX): number {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return 0;
  const parts = s.split(/[,;،\s]+/).filter((p) => p.length > 0);
  let n = 0;
  for (const part of parts) {
    const m = part.match(/(\d+)/);
    if (!m) continue;
    const v = parseInt(m[1], 10);
    if (Number.isFinite(v) && v >= 0 && v <= maxLevel) n++;
  }
  return n;
}

/** Перенос строки внутри одной формулировки (Excel) — пробел; абзацы — отдельные пункты. */
function normalizeRubricCellText(raw: string): string {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/\n{2,}/g, '\n\n')
    .replace(/(?<!\n)\n(?!\n)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Разделение пунктов рубрики по запятой только вне круглых скобок.
 * Иначе «(внешний вид, одежда, стиль)» режется на три строки таблицы.
 */
function splitRubricPhrasesParenthesisAware(s: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);

    if (ch === ',' && depth === 0) {
      const rest = s.slice(i + 1);
      const nextPhrase = /^\s*(?:[А-ЯЁA-Z]|\d+\.)/.test(rest);
      if (nextPhrase) {
        const piece = buf.trim();
        if (piece) parts.push(piece);
        buf = '';
        continue;
      }
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) parts.push(tail);
  return parts;
}

/**
 * Шаблон «Для анализа ИИ»: в ячейке перечислены формулировки критериев через запятую (не «0,1,2»).
 */
export function countRubricItemsInCell(raw: unknown): number {
  return splitRubricPhrasesFromCell(raw).length;
}

/**
 * Те же части, что считает {@link countRubricItemsInCell}, но списком (без ячеек «только 0–4»).
 */
export function splitRubricPhrasesFromCell(raw: unknown): string[] {
  const s = normalizeRubricCellText(raw == null ? '' : String(raw));
  if (!s) return [];
  if (looksLikeNumericCommaScaleOnly(s)) return [];

  if (s.includes('\n\n')) {
    return s
      .split(/\n\n+/)
      .map((p) => normalizeRubricCellText(p))
      .filter((p) => p.length > 0);
  }

  if (/[А-ЯЁа-яё]/.test(s)) {
    const parts = splitRubricPhrasesParenthesisAware(s);
    if (parts.length >= 1) return parts;
  }

  return s.split(/\s*,\s*/).map((p) => p.trim()).filter((p) => p.length > 0);
}

function normalizeRubricPhraseKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeNumericCommaScaleOnly(s: string): boolean {
  const t = s.replace(/\./g, '').trim();
  return /^[\d\s,;،]+$/.test(t) && t.length > 0;
}

function competencyCellDisplayTokens(raw: unknown): { levels: Set<number>; displayMax: number } {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return { levels: new Set(), displayMax: 0 };
  const levels = parseCommaSeparatedScaleLevels(s);
  const numTok = countCommaSeparatedScaleTokens(s);
  const rubTok = countRubricItemsInCell(s);
  if (looksLikeNumericCommaScaleOnly(s) && numTok > 0) {
    return { levels, displayMax: numTok };
  }
  if (/[a-zA-Zа-яА-ЯЁё]/.test(s) && rubTok > 0) {
    return { levels: new Set(), displayMax: rubTok };
  }
  if (numTok > 0) {
    return { levels, displayMax: numTok };
  }
  return { levels: new Set(), displayMax: 0 };
}

export type LessonCompetencyScaleRow = {
  title: string;
  used: Set<number>;
  /** Максимум числа отметок 0–4 в одной ячейке среди уроков среза. */
  maxCommaTokensInCell: number;
  /** Наибольший уровень среди всех ячеек среза; null, если ни одной валидной отметки. */
  peakLevel: number | null;
  /** Макс. число пунктов в одной ячейке по столбцу по всему файлу (опор для рубрики-текста). */
  globalMaxItemsInColumn: number;
};

export type RubricPhraseBreakdownRow = {
  title: string;
  /** Сколько раз формулировка встретилась в ячейках среза (одна ячейка может дать несколько вхождений). */
  phrases: { text: string; count: number }[];
};

export type LessonCompetencyScaleAggregate = {
  rows: LessonCompetencyScaleRow[];
  hasAny: boolean;
  /** Режим «формулировки через запятую»: детализация по пунктам, а не только макс. в ячейке. */
  rubricPhraseBreakdown?: RubricPhraseBreakdownRow[];
  /** Чек-лист посещения урока (разделы 1–10) vs шкала компетенций Excel. */
  kind?: 'visit_checklist' | 'competency_scale';
};

type ScaleMatrixDef = { role: ColumnRole; title: string; sectionCode?: string };

function resolveScaleMatrixDefs(roles: ColumnRole[]): ScaleMatrixDef[] {
  if (rolesIncludeVisitChecklistSections(roles)) {
    return LESSON_VISIT_SECTION_DEFS.filter((d) => roles.includes(d.role)).map((d) => ({
      role: d.role,
      title: lessonVisitSectionHeader(d),
      sectionCode: d.code,
    }));
  }
  return LESSON_COMPETENCY_MATRIX_DEFS.filter((d) => roles.includes(d.role));
}

export type LessonCompetencyScaleAggregateOptions = {
  /** Ограничить агрегацию idx строк карточки (наблюдения педагога в срезе). */
  rowIdxs?: number[];
};

/**
 * Объединяет уровни по всем строкам среза педагога (union): если в каком-то уроке встретился уровень — ячейка «вкл».
 */
export function buildLessonCompetencyScaleAggregates(
  matrixRows: CellPrimitive[][],
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
  teacherFilterKey: string | null,
  teacherLabel: string,
  options?: LessonCompetencyScaleAggregateOptions,
): LessonCompetencyScaleAggregate | null {
  const defs = resolveScaleMatrixDefs(roles);
  if (defs.length === 0) return null;

  const kind: LessonCompetencyScaleAggregate['kind'] = rolesIncludeVisitChecklistSections(roles)
    ? 'visit_checklist'
    : 'competency_scale';

  const ti = teacherDataColumnIndex(roles, customLabels, teacherFilterKey);
  if (ti < 0) return null;

  const rowIdxSet = options?.rowIdxs?.length ? new Set(options.rowIdxs) : null;
  const rowAllowed = (ri: number) => rowIdxSet == null || rowIdxSet.has(ri);

  const globalMaxByCol = new Map<number, number>();
  for (const d of defs) {
    const col = roles.indexOf(d.role);
    if (col < 0) continue;
    let g = 0;
    for (let ri = 0; ri < matrixRows.length; ri++) {
      if (!rowAllowed(ri)) continue;
      const line = matrixRows[ri];
      if (!line.length) continue;
      const cell = col < line.length ? line[col] : '';
      const { displayMax } = competencyCellDisplayTokens(cell);
      if (displayMax > g) g = displayMax;
    }
    globalMaxByCol.set(col, g);
  }

  const rows: LessonCompetencyScaleRow[] = defs.map((d) => {
    const col = roles.indexOf(d.role);
    const used = new Set<number>();
    let maxCommaTokensInCell = 0;
    let peakLevel: number | null = null;
    const globalMaxItemsInColumn = col >= 0 ? globalMaxByCol.get(col) ?? 0 : 0;
    if (col < 0) {
      return { title: d.title, used, maxCommaTokensInCell: 0, peakLevel: null, globalMaxItemsInColumn: 0 };
    }

    for (let ri = 0; ri < matrixRows.length; ri++) {
      if (!rowAllowed(ri)) continue;
      const line = matrixRows[ri];
      if (!line.length) continue;
      const teacherCell = ti < line.length ? line[ti] : '';
      if (!rowMatchesTeacher(teacherCell, teacherLabel)) continue;
      const cell = col < line.length ? line[col] : '';
      const { levels, displayMax } = competencyCellDisplayTokens(cell);
      for (const lv of levels) used.add(lv);
      if (displayMax > maxCommaTokensInCell) maxCommaTokensInCell = displayMax;
      if (levels.size > 0) {
        const localPeak = Math.max(...levels);
        if (peakLevel == null || localPeak > peakLevel) peakLevel = localPeak;
      }
    }
    return { title: d.title, used, maxCommaTokensInCell, peakLevel, globalMaxItemsInColumn };
  });

  const hasAny = rows.some((r) => r.used.size > 0 || r.maxCommaTokensInCell > 0);

  const rubricPhraseBreakdown: RubricPhraseBreakdownRow[] = [];
  for (const d of defs) {
    const col = roles.indexOf(d.role);
    if (col < 0) continue;
    const acc = new Map<string, { count: number; display: string }>();
    for (let ri = 0; ri < matrixRows.length; ri++) {
      if (!rowAllowed(ri)) continue;
      const line = matrixRows[ri];
      if (!line.length) continue;
      const teacherCell = ti < line.length ? line[ti] : '';
      if (!rowMatchesTeacher(teacherCell, teacherLabel)) continue;
      const cell = col < line.length ? line[col] : '';
      const phrases = splitRubricPhrasesFromCell(cell);
      for (const ph of phrases) {
        const display =
          kind === 'visit_checklist' && d.sectionCode
            ? formatVisitSectionPhraseDisplay(ph, d.sectionCode)
            : ph;
        const key = normalizeRubricPhraseKey(display);
        const prev = acc.get(key);
        if (prev) prev.count += 1;
        else acc.set(key, { count: 1, display });
      }
    }
    if (acc.size === 0) continue;
    const phrases = [...acc.values()]
      .map(({ count, display }) => ({ text: display, count }))
      .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ru'));
    rubricPhraseBreakdown.push({ title: d.title, phrases });
  }

  return {
    rows,
    hasAny,
    rubricPhraseBreakdown: rubricPhraseBreakdown.length > 0 ? rubricPhraseBreakdown : undefined,
    kind,
  };
}


/** Тексты из столбца Excel по роли (все непустые ячейки строк среза педагога). */
export function buildLessonMappedTextQuotes(
  matrixRows: CellPrimitive[][],
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
  teacherFilterKey: string | null,
  teacherLabel: string,
  role: ColumnRole,
  options?: { skipCellsThatLookLikeNumericList?: boolean },
): string[] {
  if (!roles.includes(role)) return [];
  const ti = teacherDataColumnIndex(roles, customLabels, teacherFilterKey);
  const col = roles.indexOf(role);
  if (ti < 0 || col < 0) return [];
  const skipNum = options?.skipCellsThatLookLikeNumericList ?? false;
  const out: string[] = [];
  for (const line of matrixRows) {
    if (!line.length) continue;
    const teacherCell = ti < line.length ? line[ti] : '';
    if (!rowMatchesTeacher(teacherCell, teacherLabel)) continue;
    const raw = col < line.length ? String(line[col] ?? '').trim() : '';
    if (!raw) continue;
    if (skipNum && /^[\d\s,;،]+$/.test(raw)) continue;
    out.push(raw);
  }
  return out;
}

/**
 * Цитаты блока «Общие выводы»: роль `lesson_comp_scale_summary` или `text_ai_summary` у столбца с типовым заголовком
 * (шаблон «Для анализа ИИ»).
 */
export function buildLessonCompScaleSummaryQuotes(
  matrixRows: CellPrimitive[][],
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
  teacherFilterKey: string | null,
  teacherLabel: string,
  headers?: string[],
): string[] {
  const fromScale = buildLessonMappedTextQuotes(
    matrixRows,
    roles,
    customLabels,
    teacherFilterKey,
    teacherLabel,
    'lesson_comp_scale_summary',
    { skipCellsThatLookLikeNumericList: true },
  );
  if (fromScale.length) return fromScale;

  const ti = teacherDataColumnIndex(roles, customLabels, teacherFilterKey);
  if (ti < 0 || !headers?.length || headers.length !== roles.length) return [];

  const hasLessonRubricCols = roles.some(
    (r) =>
      r === 'lesson_comp_scale_org_tech' ||
      r === 'lesson_comp_scale_methodology' ||
      r === 'lesson_comp_scale_general' ||
      r === 'lesson_comp_scale_rapport' ||
      r === 'lesson_comp_scale_misc' ||
      r.startsWith('lesson_visit_sec_'),
  );

  const summaryHeaderOk = (col: number) => {
    if (!hasLessonRubricCols) return true;
    const h = normHeaderForSummary(headers[col] ?? '');
    if (LESSON_SUMMARY_COLUMN_HEADER_RE.test(h)) return true;
    return /(^|\s)15[\s.)].*(комментар|пожелан|дополнительн)/i.test(h) || /пожалуйста.*оставьте|свободн\w*\s+комментар/i.test(h);
  };

  const out: string[] = [];
  for (let col = 0; col < roles.length; col++) {
    if (roles[col] !== 'text_ai_summary') continue;
    if (!summaryHeaderOk(col)) continue;
    for (const line of matrixRows) {
      if (!line.length) continue;
      const teacherCell = ti < line.length ? line[ti] : '';
      if (!rowMatchesTeacher(teacherCell, teacherLabel)) continue;
      const raw = col < line.length ? String(line[col] ?? '').trim() : '';
      if (!raw) continue;
      if (/^[\d\s,;،]+$/.test(raw)) continue;
      out.push(raw);
    }
  }
  return out;
}

/** Рекомендации учителю — колонка с ролью «Текст: рекомендации». */
export function buildLessonTeacherRecommendationsQuotes(
  matrixRows: CellPrimitive[][],
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
  teacherFilterKey: string | null,
  teacherLabel: string,
): string[] {
  return buildLessonMappedTextQuotes(
    matrixRows,
    roles,
    customLabels,
    teacherFilterKey,
    teacherLabel,
    'text_ai_recommendations',
  );
}

/** Для PDF: матрица «компетенции» как на экране (уровни 0–4). */
export function lessonCompScaleHeatmapRowsForPdf(
  agg: LessonCompetencyScaleAggregate | null,
): { title: string; usedLevels: number[] }[] | null {
  if (!agg) return null;
  return agg.rows.map((r) => ({
    title: r.title,
    usedLevels: [...r.used].filter((n) => n >= 0 && n <= 4).sort((a, b) => a - b),
  }));
}

/** Для PDF: таблица «макс. отметок в ячейке» и пиковый уровень. */
export function lessonCompScaleRowsForPdf(
  agg: LessonCompetencyScaleAggregate | null,
): { title: string; maxCommaTokensInCell: number; peakLevel: number | null; globalMaxItemsInColumn: number }[] | null {
  if (!agg) return null;
  return agg.rows.map((r) => ({
    title: r.title,
    maxCommaTokensInCell: r.maxCommaTokensInCell,
    peakLevel: r.peakLevel,
    globalMaxItemsInColumn: r.globalMaxItemsInColumn,
  }));
}

/** Текстовый блок компетенций для промпта ИИ (все пункты рубрики с числом вхождений). */
export function buildLessonCompetencyLlmContextRu(agg: LessonCompetencyScaleAggregate | null): string {
  if (!agg?.hasAny) return '';
  const heading =
    agg.kind === 'visit_checklist'
      ? '=== Чек-лист посещения урока (срез одного педагога) ==='
      : '=== Компетенции и рубрика урока (срез одного педагога) ===';
  const lines: string[] = [heading];
  if (agg.rubricPhraseBreakdown?.length) {
    for (const sec of agg.rubricPhraseBreakdown) {
      lines.push('');
      lines.push(`Блок «${sec.title}»:`);
      for (const p of sec.phrases) {
        lines.push(`  • «${p.text}» — ${p.count} вхождений в ячейках среза`);
      }
    }
    lines.push('');
    lines.push(
      'Интерпретируй: низкая частота пункта, отсутствие в срезе или слабые формулировки — зоны внимания; не смягчай оценку общими фразами.',
    );
  } else {
    for (const r of agg.rows) {
      const levels = [...r.used].sort((a, b) => a - b);
      const lv =
        levels.length > 0 ? `уровни ${levels.join(', ')}` : 'уровни 0–4 не зафиксированы';
      lines.push(
        `  • ${r.title}: ${lv}; макс. отметок в одной ячейке — ${r.maxCommaTokensInCell || 0}.`,
      );
    }
  }
  return lines.join('\n');
}
