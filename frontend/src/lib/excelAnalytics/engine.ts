import type { CellPrimitive } from './parse';
import type { ColumnRole, CustomFilterLabels } from './types';
import { formatBilingualCellLabel } from './excelDisplayLabel';
import { inferParallelFromClassLabel } from './parallelFromClass';
import { resolveListFeatureToken, splitCommaSemicolonParts, splitListFeatureParts } from './listFeatureTokens';

/** Производное измерение «параллель», если в файле есть класс, но нет отдельной колонки параллели */
export const PULSE_PARALLEL_AUTO_KEY = '__pulse_parallel_auto';

/** Подпись уровня текстовой шкалы как отдельное измерение среза */
export const PULSE_ORDINAL_LEVEL_KEY = '__pulse_ordinal_level';

/** Производные измерения от ИИ; не входят в семантический ключ «урока» */
export const PULSE_AI_DIM_PREFIX = '__pulse_ai_dim_';

const PULSE_SURVEY_COL_PREFIX = '__pulse_survey_col_';

/** Колонка опроса как измерение среза (все графы кроме даты — через роли ≠ ignore/date и не дублируя фильтры). */
export function pulseSurveyColKey(colIndex: number): string {
  return `${PULSE_SURVEY_COL_PREFIX}${colIndex}`;
}

/** Спецификация смысловой группы (значение базовой колонки → метка группы) */
export type DerivedFilterDimensionSpec = {
  id: string;
  sourceFilterKey: string;
  assignments: Record<string, string>;
};

/** Годы вне диапазона — чаще всего числовые ответы анкеты ошибочно прочитаны как дата Excel (1900-е). */
function isPlausibleAnalyticsIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return false;
  const y = Number(iso.slice(0, 4));
  return y >= 1990 && y <= 2100;
}

function excelSerialToIsoDate(n: number): string | null {
  if (!Number.isFinite(n)) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function parseAnalyticsDate(cell: CellPrimitive): string | null {
  if (cell == null || cell === '') return null;
  if (cell instanceof Date) {
    if (!Number.isFinite(cell.getTime())) return null;
    const iso = cell.toISOString().slice(0, 10);
    return isPlausibleAnalyticsIsoDate(iso) ? iso : null;
  }
  if (typeof cell === 'number') {
    const iso = excelSerialToIsoDate(cell);
    return iso && isPlausibleAnalyticsIsoDate(iso) ? iso : null;
  }
  const s = String(cell).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.slice(0, 10);
    return isPlausibleAnalyticsIsoDate(iso) ? iso : null;
  }
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 10);
  return isPlausibleAnalyticsIsoDate(iso) ? iso : null;
}

export function parseNumber(cell: CellPrimitive): number | null {
  if (cell == null || cell === '') return null;
  if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
  const n = Number(String(cell).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Для анкет: «Да»/«Нет» в числовых столбцах → 1/0 (остальное как parseNumber). */
export function parseNumericOrYesNo(cell: CellPrimitive): number | null {
  const n = parseNumber(cell);
  if (n != null) return n;
  const t = formatBilingualCellLabel(cellText(cell), 'ru').trim().toLowerCase();
  if (t === 'да' || t === 'yes' || t === 'да.') return 1;
  if (t === 'нет' || t === 'no' || t === 'нет.') return 0;
  return null;
}

/** Recharts использует decimal.js; NaN/Infinity в data/domain даёт «[DecimalError] Invalid argument: NaN». */
export function chartSafeFinite(n: unknown, fallback = 0): number {
  const x = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(x) ? x : fallback;
}

/** Плоская зачистка числовых полей строки перед передачей в Recharts. */
export function rechartsSanitizeRow<T extends Record<string, unknown>>(row: T): T {
  const o = { ...row } as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'number' && !Number.isFinite(v)) o[k] = 0;
  }
  return o as T;
}

export function rechartsSanitizeRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map(rechartsSanitizeRow);
}

export function filterKeyForRole(role: ColumnRole, labels: CustomFilterLabels): string {
  if (role === 'filter_custom_1' && labels.filter_custom_1?.trim()) return labels.filter_custom_1.trim();
  if (role === 'filter_custom_2' && labels.filter_custom_2?.trim()) return labels.filter_custom_2.trim();
  if (role === 'filter_custom_3' && labels.filter_custom_3?.trim()) return labels.filter_custom_3.trim();
  return role;
}

const FILTER_ROLES: ColumnRole[] = [
  'filter_teacher_code',
  'filter_parallel',
  'filter_class',
  'filter_subject',
  'filter_format',
  'filter_custom_1',
  'filter_custom_2',
  'filter_custom_3',
];

export function isFilterRole(r: ColumnRole): boolean {
  return FILTER_ROLES.includes(r);
}

/** Длинные текстовые графы (комментарии, рекомендации, списки признаков) — не измерения фильтра. */
const PULSE_NON_FILTER_SURVEY_ROLES: ColumnRole[] = [
  'text_ai_summary',
  'text_ai_recommendations',
  'text_list_features',
];

/** Колонка может попасть в кандидаты опросных фильтров (решение принимает ИИ по сэмплам). */
export function shouldExposePulseSurveyFilterCandidate(role: ColumnRole): boolean {
  if (role === 'ignore' || role === 'date') return false;
  if (isFilterRole(role)) return false;
  if (role === 'metric_ordinal_text') return false;
  if (role.startsWith('lesson_comp_scale_')) return false;
  return !PULSE_NON_FILTER_SURVEY_ROLES.includes(role);
}

export function listStructuralFilterKeys(
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
  derivedDimensions: readonly { id: string }[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (k: string) => {
    if (seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  for (let i = 0; i < roles.length; i++) {
    const r = roles[i];
    if (r === 'ignore' || r === 'date') continue;
    if (isFilterRole(r)) {
      push(filterKeyForRole(r, customLabels));
      if (r === 'filter_class' && !roles.includes('filter_parallel')) {
        push(PULSE_PARALLEL_AUTO_KEY);
      }
    }
  }
  if (roles.includes('metric_ordinal_text')) {
    push(PULSE_ORDINAL_LEVEL_KEY);
  }
  for (const d of derivedDimensions) {
    push(d.id);
  }
  return out;
}

export function listSurveyCandidateFilterKeys(roles: ColumnRole[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < roles.length; i++) {
    if (!shouldExposePulseSurveyFilterCandidate(roles[i])) continue;
    out.push(pulseSurveyColKey(i));
  }
  return out;
}

/** Все измерения среза (структурные фильтры + графы опроса из маппинга колонок) — без отбора ИИ. */
export function buildPulseDashboardFilterKeys(
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
  derivedDimensions: readonly { id: string }[],
): string[] {
  return [...listStructuralFilterKeys(roles, customLabels, derivedDimensions), ...listSurveyCandidateFilterKeys(roles)];
}

export type AnalyticRow = {
  idx: number;
  /** Значение колонки с ролью id_row (напр. «№ строки» в выгрузке). Одно значение = одно событие/урок для KPI и средних. */
  sourceRowId: string | null;
  /** Если в ячейке «наставники» было несколько ФИО, это номер фрагмента (1…N) */
  splitPart?: number;
  date: string | null;
  rowLabel: string | null;
  metricsNumeric: { colIndex: number; header: string; value: number | null }[];
  metricOrdinal: number | null;
  texts: { kind: ColumnRole; header: string; text: string }[];
  /** для фильтрации */
  filterValues: Record<string, string>;
};

function cellText(cell: CellPrimitive): string {
  if (cell == null || cell === '') return '';
  if (cell instanceof Date) {
    if (!Number.isFinite(cell.getTime())) return '';
    return cell.toISOString().slice(0, 10);
  }
  return String(cell).trim();
}

/**
 * ordinalLevels: порядок уровней от «худшего» к «лучшему»; значение получает rank 1..N
 */
export function buildOrdinalRankMap(levelsOrdered: string[]): Map<string, number> {
  const m = new Map<string, number>();
  levelsOrdered.forEach((raw, i) => {
    const k = formatBilingualCellLabel(String(raw), 'ru').trim().toLowerCase();
    if (k && !m.has(k)) m.set(k, i + 1);
  });
  return m;
}

export function ordinalRankForCell(
  cell: CellPrimitive,
  rankMap: Map<string, number>,
): number | null {
  const t = formatBilingualCellLabel(cellText(cell), 'ru').trim().toLowerCase();
  if (!t) return null;
  return rankMap.get(t) ?? null;
}

export function buildAnalyticRows(
  headers: string[],
  rows: CellPrimitive[][],
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
  ordinalLevelsOrdered: string[],
): AnalyticRow[] {
  const ordinalCol = roles.findIndex((r) => r === 'metric_ordinal_text');
  const rankMap = ordinalCol >= 0 ? buildOrdinalRankMap(ordinalLevelsOrdered) : new Map<string, number>();

  const metricNumericCols: { i: number; h: string }[] = [];
  roles.forEach((r, i) => {
    if (r === 'metric_numeric') metricNumericCols.push({ i, h: headers[i] || `Колонка ${i + 1}` });
  });

  const out: AnalyticRow[] = [];
  rows.forEach((line, idx) => {
    const filterValues: Record<string, string> = {};
    for (let c = 0; c < roles.length; c++) {
      const role = roles[c];
      if (!isFilterRole(role)) continue;
      const key = filterKeyForRole(role, customLabels);
      const raw = cellText(line[c]);
      filterValues[key] = raw || '(не указано)';
    }

    const dateCol = roles.indexOf('date');
    const labelCol = roles.indexOf('row_label');
    const idRowCol = roles.indexOf('id_row');
    const rawSourceId = idRowCol >= 0 ? cellText(line[idRowCol]) : '';
    const sourceRowId = rawSourceId.trim() ? rawSourceId.trim() : null;

    const metricsNumeric = metricNumericCols.map(({ i, h }) => ({
      colIndex: i,
      header: h,
      value: parseNumericOrYesNo(line[i]),
    }));

    let metricOrdinal: number | null = null;
    if (ordinalCol >= 0) {
      metricOrdinal = ordinalRankForCell(line[ordinalCol], rankMap);
    }

    const texts: { kind: ColumnRole; header: string; text: string }[] = [];
    roles.forEach((r, c) => {
      if (r === 'text_ai_summary' || r === 'text_ai_recommendations' || r === 'text_list_features') {
        const t = cellText(line[c]);
        if (t) texts.push({ kind: r, header: headers[c] || `Колонка ${c + 1}`, text: t });
      }
    });

    if (ordinalCol >= 0) {
      const rawOrd = cellText(line[ordinalCol]);
      const ordRu = formatBilingualCellLabel(rawOrd, 'ru').trim();
      filterValues[PULSE_ORDINAL_LEVEL_KEY] = ordRu || '(не указано)';
    }

    for (let c = 0; c < roles.length; c++) {
      const role = roles[c];
      if (role === 'ignore' || role === 'date') continue;
      if (isFilterRole(role)) continue;
      if (c === ordinalCol && ordinalCol >= 0) continue;
      if (!shouldExposePulseSurveyFilterCandidate(role)) continue;
      const key = pulseSurveyColKey(c);
      const raw = cellText(line[c]);
      filterValues[key] = raw || '(не указано)';
    }

    out.push({
      idx,
      sourceRowId,
      date: dateCol >= 0 ? parseAnalyticsDate(line[dateCol]) : null,
      rowLabel: labelCol >= 0 ? cellText(line[labelCol]) || null : null,
      metricsNumeric,
      metricOrdinal,
      texts,
      filterValues,
    });
  });

  return out;
}

/**
 * Если задан только «Класс» (7А, 7B…), без колонки «Параллель» — добавляет filterValues[PULSE_PARALLEL_AUTO_KEY].
 * Методист может сузить срез до параллели «7» и смотреть график «По наставникам» только по этой параллели.
 */
export function augmentRowsWithDerivedParallel(
  rows: AnalyticRow[],
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
): AnalyticRow[] {
  if (roles.includes('filter_parallel')) return rows;
  if (!roles.includes('filter_class')) return rows;
  const classKey = filterKeyForRole('filter_class', customLabels);
  return rows.map((r) => {
    const raw = r.filterValues[classKey] ?? '';
    const p = inferParallelFromClassLabel(raw);
    return {
      ...r,
      filterValues: {
        ...r.filterValues,
        [PULSE_PARALLEL_AUTO_KEY]: p ?? '(не указано)',
      },
    };
  });
}

export function applyDerivedDimensionsToRows(
  rows: AnalyticRow[],
  dims: DerivedFilterDimensionSpec[] | null | undefined,
): AnalyticRow[] {
  if (!dims?.length) return rows;
  return rows.map((r) => {
    const fv = { ...r.filterValues };
    for (const d of dims) {
      const raw = fv[d.sourceFilterKey];
      if (raw == null || raw === '' || raw === '(не указано)') {
        fv[d.id] = '(не указано)';
      } else {
        const g = d.assignments[raw];
        const t = g != null ? String(g).trim() : '';
        fv[d.id] = t ? t.slice(0, 120) : 'Прочее';
      }
    }
    return { ...r, filterValues: fv };
  });
}

/**
 * ИИ-нормализация: для указанных измерений подменяет сырое значение в filterValues на каноническую метку.
 */
export function applyCanonicalMapsToRows(
  rows: AnalyticRow[],
  maps: Record<string, Record<string, string>> | null | undefined,
): AnalyticRow[] {
  if (!maps || !Object.keys(maps).length) return rows;
  return rows.map((r) => {
    const fv = { ...r.filterValues };
    for (const [dimKey, m] of Object.entries(maps)) {
      if (!m || typeof m !== 'object') continue;
      const v = fv[dimKey];
      if (v == null || v === '' || v === '(не указано)') continue;
      const canon = m[v];
      if (canon && canon !== v) fv[dimKey] = canon;
    }
    return { ...r, filterValues: fv };
  });
}

function slugForAiDimId(title: string): string {
  const t = title
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return (t || 'dim').slice(0, 36);
}

export function newAiDerivedDimensionId(title: string): string {
  const suf =
    (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID?.().slice(0, 8)) ||
    String(Date.now()).slice(-8);
  return `${PULSE_AI_DIM_PREFIX}${slugForAiDimId(title)}_${suf}`;
}

/**
 * Разделители в ячейке с несколькими наставниками / ФИО.
 * Не используем одиночный «/» — ломает подписи вида «Русский // English».
 */
export function splitMultiValues(raw: string): string[] {
  return raw
    .split(/[,;|]|\n+|\r+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Мультивыбор в графах опроса (запятая, точка с запятой, перевод строки).
 * Каждый фрагмент — только русская часть до «//».
 */
export function splitPulseSurveyCellTokens(raw: string): string[] {
  const s = String(raw ?? '').trim();
  if (!s || s === '(не указано)') return [];
  return s
    .split(/[,;]|\n+|\r+/)
    .map((t) => formatBilingualCellLabel(t.trim(), 'ru').trim())
    .filter(Boolean);
}

function expandOnePulseSurveyColumn(rows: AnalyticRow[], key: string): AnalyticRow[] {
  const next: AnalyticRow[] = [];
  for (const row of rows) {
    const raw = row.filterValues[key];
    if (raw == null || raw === '' || raw === '(не указано)') {
      next.push(row);
      continue;
    }
    const parts = splitPulseSurveyCellTokens(raw);
    if (parts.length <= 1) {
      next.push({
        ...row,
        filterValues: { ...row.filterValues, [key]: parts[0] ?? raw },
      });
      continue;
    }
    for (const p of parts) {
      next.push({
        ...row,
        filterValues: { ...row.filterValues, [key]: p },
      });
    }
  }
  return next;
}

/** Разворачивает мультивыбор в колонках опроса в отдельные строки (отдельный «пойнт» в фильтре). */
export function expandRowsForPulseSurveyMultiSelect(rows: AnalyticRow[], roles: ColumnRole[]): AnalyticRow[] {
  const keys: string[] = [];
  for (let c = 0; c < roles.length; c++) {
    const role = roles[c];
    if (!shouldExposePulseSurveyFilterCandidate(role)) continue;
    keys.push(pulseSurveyColKey(c));
  }
  let out = rows;
  for (const key of keys) {
    out = expandOnePulseSurveyColumn(out, key);
  }
  return out;
}

/**
 * Одна ячейка с несколькими значениями через запятую (Google Forms и т.п.) → несколько аналитических строк
 * с теми же метриками; в фильтрах и графиках каждое значение — отдельный «пойнт».
 * Для колонки наставника сохраняется нумерация splitPart (как раньше).
 * Порядок развёртки — слева направо по колонкам в таблице (роли в массиве roles).
 */
function expandOneFilterColumn(rows: AnalyticRow[], key: string, role: ColumnRole): AnalyticRow[] {
  const isTeacher = role === 'filter_teacher_code';
  const next: AnalyticRow[] = [];
  for (const row of rows) {
    const raw = row.filterValues[key];
    if (raw == null || raw === '' || raw === '(не указано)') {
      next.push(row);
      continue;
    }
    const parts = splitMultiValues(raw);
    if (parts.length <= 1) {
      next.push({
        ...row,
        splitPart: isTeacher ? undefined : row.splitPart,
        filterValues: { ...row.filterValues, [key]: parts[0] ?? raw },
      });
      continue;
    }
    parts.forEach((p, si) => {
      next.push({
        ...row,
        splitPart: isTeacher ? si + 1 : row.splitPart,
        filterValues: { ...row.filterValues, [key]: p },
      });
    });
  }
  return next;
}

export function expandRowsForMultiValueFilterColumns(
  rows: AnalyticRow[],
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
): AnalyticRow[] {
  let out = rows;
  for (let i = 0; i < roles.length; i++) {
    const r = roles[i];
    if (!isFilterRole(r)) continue;
    const key = filterKeyForRole(r, customLabels);
    out = expandOneFilterColumn(out, key, r);
  }
  return out;
}

/** Одна колонка наставников (обратная совместимость). */
export function expandRowsForMultiTeacher(rows: AnalyticRow[], teacherFilterKey: string): AnalyticRow[] {
  return expandOneFilterColumn(rows, teacherFilterKey, 'filter_teacher_code');
}

export type FilterSelection = Record<string, string[] | null>;
/** null = все значения (нет ограничения) */

export function applyFilters(rows: AnalyticRow[], selection: FilterSelection): AnalyticRow[] {
  return rows.filter((row) => {
    for (const [key, allowed] of Object.entries(selection)) {
      if (allowed == null) continue;
      if (allowed.length === 0) return false;
      const v = row.filterValues[key];
      if (v == null) return false;
      if (!allowed.includes(v)) return false;
    }
    return true;
  });
}

/** Срез по всем фильтрам, кроме одного ключа (для него «все значения») — основа каскадных списков. */
export function applyFiltersExceptKey(rows: AnalyticRow[], selection: FilterSelection, exceptKey: string): AnalyticRow[] {
  const partial: FilterSelection = { ...selection };
  if (exceptKey in partial) partial[exceptKey] = null;
  return applyFilters(rows, partial);
}

/**
 * Убирает из выбора значения, несовместимые с остальными фильтрами (итеративно до стабилизации).
 * Пустой массив [] по ключу = «ничего не выбрано» — не трогаем.
 */
export function pruneFilterSelection(
  rows: AnalyticRow[],
  selection: FilterSelection,
  filterKeys: string[],
): FilterSelection {
  let current: FilterSelection = { ...selection };
  for (let iter = 0; iter < 14; iter++) {
    let changed = false;
    const next: FilterSelection = { ...current };
    for (const key of filterKeys) {
      const cur = next[key];
      if (cur == null) continue;
      if (Array.isArray(cur) && cur.length === 0) continue;

      const base = applyFiltersExceptKey(rows, next, key);
      const allowed = new Set(uniqueFilterValues(base, key));
      const kept = cur.filter((v) => allowed.has(v));
      if (kept.length === 0) {
        next[key] = null;
        changed = true;
      } else if (kept.length < cur.length) {
        next[key] = kept;
        changed = true;
      }
    }
    if (!changed) return next;
    current = next;
  }
  return current;
}

export function filterSelectionsEqual(a: FilterSelection, b: FilterSelection, keys: string[]): boolean {
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (x === y) continue;
    if (x == null && y == null) continue;
    if (x == null || y == null) return false;
    if (!Array.isArray(x) || !Array.isArray(y)) return false;
    if (x.length !== y.length) return false;
    const xs = [...x].sort((u, v) => u.localeCompare(v, 'ru'));
    const ys = [...y].sort((u, v) => u.localeCompare(v, 'ru'));
    if (!xs.every((v, i) => v === ys[i])) return false;
  }
  return true;
}

export function uniqueFilterValues(rows: AnalyticRow[], key: string): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const v = r.filterValues[key];
    if (v != null) s.add(v);
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Гистограмма для первой числовой метрики с индексом colIndex (из mapping) */
export function histogramNumeric(
  rows: AnalyticRow[],
  colIndex: number,
  bins: number,
): { label: string; count: number }[] {
  return histogramNumericBins(rows, colIndex, bins).map(({ label, count }) => ({ label, count }));
}

export type HistogramBinDetail = {
  label: string;
  count: number;
  binIndex: number;
  /** Границы бина в тех же единицах, что значение в строке (для клика по столбцу) */
  minInclusive: number;
  maxInclusive: number;
};

/** Номер бина (как при подсчёте гистограммы), согласован с histogramNumericBins */
export function numericValueBinIndex(v: number, min: number, max: number, bins: number): number {
  if (!Number.isFinite(v) || bins < 1) return 0;
  if (min === max) return 0;
  const step = (max - min) / bins;
  let i = Math.floor((v - min) / step);
  if (i >= bins) i = bins - 1;
  if (i < 0) i = 0;
  return i;
}

function rowNumericAt(row: AnalyticRow, colIndex: number): number | null {
  const v = row.metricsNumeric.find((m) => m.colIndex === colIndex)?.value;
  return v != null && Number.isFinite(v) ? v : null;
}

/**
 * Гистограмма с границами бинов — для интерактива «кто в этом диапазоне».
 */
export function histogramNumericBins(
  rows: AnalyticRow[],
  colIndex: number,
  bins: number,
): HistogramBinDetail[] {
  const vals = rows
    .map((r) => rowNumericAt(r, colIndex))
    .filter((v): v is number => v != null);
  if (vals.length === 0) return [];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min === max) {
    return [
      {
        label: String(min.toFixed(2)),
        count: vals.length,
        binIndex: 0,
        minInclusive: min,
        maxInclusive: max,
      },
    ];
  }
  const step = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of vals) {
    let i = Math.floor((v - min) / step);
    if (i >= bins) i = bins - 1;
    if (i < 0) i = 0;
    counts[i]++;
  }
  return counts.map((count, i) => {
    const lo = min + i * step;
    const hi = i === bins - 1 ? max : min + (i + 1) * step;
    const label = `${lo.toFixed(1)}–${hi.toFixed(1)}`;
    return {
      label,
      count: chartSafeFinite(count, 0),
      binIndex: i,
      minInclusive: chartSafeFinite(lo, min),
      maxInclusive: chartSafeFinite(hi, max),
    };
  });
}

/**
 * Педагоги, у которых хотя бы один урок (по dedupe idx) попал в бин метрики.
 */
export function teachersInMetricBin(
  rowsOnePerLesson: AnalyticRow[],
  colIndex: number,
  bin: HistogramBinDetail,
  allMin: number,
  allMax: number,
  bins: number,
  teacherFilterKey: string,
): { teacher: string; lessons: number }[] {
  const m = new Map<string, number>();
  const isSingle = allMin === allMax;
  for (const row of rowsOnePerLesson) {
    const v = rowNumericAt(row, colIndex);
    if (v == null) continue;
    const bi = isSingle ? 0 : numericValueBinIndex(v, allMin, allMax, bins);
    if (bi !== bin.binIndex) continue;
    const t = row.filterValues[teacherFilterKey];
    if (!t || t === '(не указано)') continue;
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([teacher, lessons]) => ({ teacher, lessons }))
    .sort((a, b) => b.lessons - a.lessons || a.teacher.localeCompare(b.teacher, 'ru'));
}

export function countsByMonth(rows: AnalyticRow[]): { month: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.date) continue;
    const month = r.date.slice(0, 7);
    m.set(month, (m.get(month) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

export function ordinalDistribution(
  rows: AnalyticRow[],
  ordinalLevelsOrdered: string[],
): { rank: number; level: string; count: number }[] {
  const m = new Map<number, number>();
  for (const r of rows) {
    if (r.metricOrdinal == null) continue;
    m.set(r.metricOrdinal, (m.get(r.metricOrdinal) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rank, count]) => ({
      rank,
      level: ordinalLevelsOrdered[rank - 1]?.trim() || `Уровень ${rank}`,
      count: chartSafeFinite(count, 0),
    }));
}

/**
 * Педагоги с хотя бы одним уроком на выбранном уровне текстовой шкалы (rank 1…N).
 */
export function teachersAtOrdinalRank(
  rowsOnePerLesson: AnalyticRow[],
  teacherFilterKey: string,
  rank: number,
): { teacher: string; lessons: number }[] {
  const m = new Map<string, number>();
  for (const row of rowsOnePerLesson) {
    if (row.metricOrdinal !== rank) continue;
    const t = row.filterValues[teacherFilterKey];
    if (!t || t === '(не указано)') continue;
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([teacher, lessons]) => ({ teacher, lessons }))
    .sort((a, b) => b.lessons - a.lessons || a.teacher.localeCompare(b.teacher, 'ru'));
}

export function meanMinMax(rows: AnalyticRow[], colIndex: number): { mean: number; min: number; max: number; n: number } | null {
  const vals = rows
    .map((r) => r.metricsNumeric.find((m) => m.colIndex === colIndex)?.value)
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length === 0) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (!Number.isFinite(mean) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { mean, min, max, n: vals.length };
}

/** Сумма всех числовых пунктов в строке (пропуски не входят). */
export function rowNumericSum(row: AnalyticRow): number | null {
  const parts = row.metricsNumeric.map((m) => m.value).filter((v): v is number => v != null && Number.isFinite(v));
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0);
}

export function sumTotalStats(rows: AnalyticRow[]): { mean: number; min: number; max: number; n: number } | null {
  const sums = rows.map(rowNumericSum).filter((v): v is number => v != null);
  if (sums.length === 0) return null;
  const min = Math.min(...sums);
  const max = Math.max(...sums);
  const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
  return { mean, min, max, n: sums.length };
}

/** Среднее по каждому числовому столбцу — для сравнительной диаграммы. */
export function meanByNumericColumn(
  rows: AnalyticRow[],
  colIndices: number[],
  headerByIndex: (i: number) => string,
): { name: string; mean: number; colIndex: number }[] {
  return colIndices
    .map((colIndex) => {
      const mm = meanMinMax(rows, colIndex);
      if (!mm) return null;
      return { name: headerByIndex(colIndex), mean: chartSafeFinite(mm.mean, 0), colIndex };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}

/** Средние по каждому наставнику по всем числовым пунктам — для групповой диаграммы. */
export function meanByTeacherGrouped(
  rows: AnalyticRow[],
  teacherKey: string,
  metricColIndices: number[],
): Array<Record<string, string | number | null>> {
  const teachers = uniqueFilterValues(rows, teacherKey).filter((t) => t && t !== '(не указано)');
  return teachers
    .map((teacher) => {
      const sub = rows.filter((r) => r.filterValues[teacherKey] === teacher);
      const row: Record<string, string | number> = { mentor: teacher };
      for (const mi of metricColIndices) {
        const mm = meanMinMax(sub, mi);
        /*0 вместо null: иначе Recharts / decimal.js при групповых Bar даёт NaN в домене. */
        row[`m${mi}`] = mm ? chartSafeFinite(mm.mean, 0) : 0;
      }
      return row;
    })
    .sort((a, b) => String(a.mentor).localeCompare(String(b.mentor), 'ru'));
}

const TEXT_KIND_LABEL: Partial<Record<ColumnRole, string>> = {
  text_ai_summary: 'выводы / резюме',
  text_ai_recommendations: 'рекомендации',
  text_list_features: 'списки / теги',
};

/** Убирает из текста для ИИ «хвосты» вроде 4,58955223880597 (ошибки ввода / Excel). */
function sanitizeNumericNoiseForContext(s: string): string {
  return s.replace(/\b\d+[.,]\d{5,}\b/g, (m) => {
    const n = Number(m.replace(',', '.'));
    if (!Number.isFinite(n)) return m;
    const r = Math.round(n * 100) / 100;
    if (Number.isInteger(r)) return String(r);
    return r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  });
}

function excerpt(s: string, max = 160): string {
  const t = sanitizeNumericNoiseForContext(s.replace(/\s+/g, ' ').trim());
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Как показывать методические текстовые колонки в сводке и в выгрузке для ИИ. */
type MethodicalPresentKind =
  | 'summary_table'
  | 'points_from_list'
  | 'methodology_prose'
  | 'rapport_prose'
  | 'misc'
  | 'default';

function classifyMethodicalPresentation(header: string, kind: ColumnRole): MethodicalPresentKind {
  const h = header;
  if (/общие\s+выводы.*рекомендаци|summary\s*\/\s*recommendation/i.test(h)) return 'summary_table';
  if (/организационно-технич|organisational\s+and\s+technical/i.test(h)) return 'points_from_list';
  if (/общекультурн|general\s+performance/i.test(h)) return 'points_from_list';
  if (/целеполагани|goal\s+setting/i.test(h)) return 'points_from_list';
  if (/педагогическ.*образовательн.*технолог|pedagogical.*educational.*technolog/i.test(h)) return 'points_from_list';
  if (/информационн.*обеспечен.*урок|information.*support.*lesson/i.test(h)) return 'points_from_list';
  if (/общее\s+содержан|феномен.*космос|general\s+content.*phenomenon|phenomenon.*cosmos/i.test(h)) return 'points_from_list';
  if (/методическ.*грамотност.*построени|lesson\s+methodology/i.test(h)) return 'methodology_prose';
  if (/взаимодействие\s+участников|teacher-student\s+rapport/i.test(h)) return 'rapport_prose';
  if (/^дополнительн|miscellaneous/i.test(h.trim())) return 'misc';
  if (kind === 'text_list_features') return 'points_from_list';
  if (kind === 'text_ai_summary') return 'methodology_prose';
  if (kind === 'text_ai_recommendations') return 'rapport_prose';
  return 'default';
}

function aggregateLessonCellTextFrequency(
  rows: AnalyticRow[],
  kind: ColumnRole,
  header: string,
): { display: string; lessons: number }[] {
  const byNorm = new Map<string, { display: string; count: number }>();
  for (const row of rows) {
    const entry = row.texts.find((t) => t.kind === kind && t.header === header);
    const raw = entry?.text?.trim();
    if (!raw) continue;
    const cleaned = sanitizeNumericNoiseForContext(raw.replace(/\s+/g, ' ').trim());
    const norm = cleaned.toLowerCase();
    const cur = byNorm.get(norm);
    if (cur) {
      cur.count += 1;
      if (cleaned.length > cur.display.length) cur.display = cleaned;
    } else {
      byNorm.set(norm, { display: cleaned, count: 1 });
    }
  }
  return [...byNorm.values()]
    .map((v) => ({ display: v.display, lessons: v.count }))
    .sort((a, b) => b.lessons - a.lessons || a.display.localeCompare(b.display, 'ru'));
}

function aggregateCommaLikePointsPerLesson(
  rows: AnalyticRow[],
  kind: ColumnRole,
  header: string,
): { display: string; lessons: number }[] {
  const m = new Map<string, { display: string; lessonIds: Set<string> }>();
  for (const row of rows) {
    const entry = row.texts.find((t) => t.kind === kind && t.header === header);
    const raw = entry?.text?.trim();
    if (!raw) continue;
    const lid = lessonIdentityKey(row);
    const parts = splitListFeatureParts(sanitizeNumericNoiseForContext(raw));
    const seenInLesson = new Set<string>();
    for (const part of parts) {
      const p = part.trim().replace(/\s+/g, ' ');
      if (p.length < 2) continue;
      const nk = p.toLowerCase();
      if (seenInLesson.has(nk)) continue;
      seenInLesson.add(nk);
      const cur = m.get(nk);
      if (!cur) m.set(nk, { display: p, lessonIds: new Set([lid]) });
      else {
        cur.lessonIds.add(lid);
        if (p.length > cur.display.length) cur.display = p;
      }
    }
  }
  return [...m.values()]
    .map((v) => ({ display: v.display, lessons: v.lessonIds.size }))
    .sort((a, b) => b.lessons - a.lessons || a.display.localeCompare(b.display, 'ru'));
}

/** Агрегат по ячейкам, где пункты перечислены через запятую/; (без разреза по переносам строк — не путаем с прозой). */
function aggregateCommaOnlyPointsPerLesson(
  rows: AnalyticRow[],
  kind: ColumnRole,
  header: string,
): { display: string; lessons: number }[] {
  const m = new Map<string, { display: string; lessonIds: Set<string> }>();
  for (const row of rows) {
    const entry = row.texts.find((t) => t.kind === kind && t.header === header);
    const raw = entry?.text?.trim();
    if (!raw) continue;
    const lid = lessonIdentityKey(row);
    const parts = splitCommaSemicolonParts(sanitizeNumericNoiseForContext(raw));
    const seenInLesson = new Set<string>();
    for (const part of parts) {
      const p = part.trim().replace(/\s+/g, ' ');
      if (p.length < 2) continue;
      const nk = p.toLowerCase();
      if (seenInLesson.has(nk)) continue;
      seenInLesson.add(nk);
      const cur = m.get(nk);
      if (!cur) m.set(nk, { display: p, lessonIds: new Set([lid]) });
      else {
        cur.lessonIds.add(lid);
        if (p.length > cur.display.length) cur.display = p;
      }
    }
  }
  return [...m.values()]
    .map((v) => ({ display: v.display, lessons: v.lessonIds.size }))
    .sort((a, b) => b.lessons - a.lessons || a.display.localeCompare(b.display, 'ru'));
}

function defaultColumnActsAsCommaChecklist(
  f1: AnalyticRow[],
  kind: ColumnRole,
  header: string,
): { display: string; lessons: number }[] | null {
  const agg = aggregateCommaOnlyPointsPerLesson(f1, kind, header);
  if (agg.length < 3) return null;
  const maxLen = Math.max(...agg.map((a) => a.display.length));
  if (maxLen > 220) return null;
  return agg;
}

/**
 * Методические текстовые поля: подписи по смыслу колонки (не общий «тип роли»).
 */
function appendMethodicalTextSectionLines(
  lines: string[],
  f1: AnalyticRow[],
  sectionTitle: string,
  excerptMax: number,
  maxSnippets: number,
): void {
  const keys = new Set<string>();
  for (const row of f1) {
    for (const t of row.texts) {
      keys.add(`${t.kind}\t${t.header}`);
    }
  }
  if (keys.size === 0) return;
  lines.push('');
  lines.push(sectionTitle);
  const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b, 'ru'));
  for (const key of sortedKeys) {
    const tab = key.indexOf('\t');
    const kind = (tab >= 0 ? key.slice(0, tab) : key) as ColumnRole;
    const header = tab >= 0 ? key.slice(tab + 1) : '';
    const mode = classifyMethodicalPresentation(header, kind);
    const headDisplay = sanitizeNumericNoiseForContext(header);

    if (mode === 'misc') {
      lines.push(`  • «${headDisplay}» — дополнительный фильтр среза (значения — в панели «Наблюдения Excel»).`);
      continue;
    }

    if (mode === 'summary_table') {
      const agg = aggregateLessonCellTextFrequency(f1, kind, header);
      if (agg.length === 0) continue;
      lines.push(`  • «${headDisplay}» — таблица формулировок (сколько уроков с такой отметкой):`);
      agg.forEach((row, i) => {
        lines.push(`      ${i + 1}. ${excerpt(row.display, excerptMax)} — ${row.lessons}`);
      });
      continue;
    }

    if (mode === 'points_from_list') {
      if (kind === 'text_list_features') {
        const tagCounts = listFeatureTagCounts(f1, header, null);
        if (tagCounts.length > 0) {
          lines.push(`  • «${headDisplay}» — список через запятую: отмеченные аспекты (число уроков):`);
          for (const { display, uniqueLessons } of tagCounts) {
            lines.push(`      · ${sanitizeNumericNoiseForContext(display)} — ${uniqueLessons}`);
          }
          continue;
        }
      }
      const agg = aggregateCommaLikePointsPerLesson(f1, kind, header);
      if (agg.length > 0) {
        lines.push(`  • «${headDisplay}» — отмеченные аспекты (число уроков):`);
        for (const row of agg) {
          lines.push(`      · ${excerpt(row.display, excerptMax)} — ${row.lessons}`);
        }
        continue;
      }
    }

    if (mode === 'methodology_prose') {
      lines.push(`  • «${headDisplay}» — текст: выводы / резюме, примеры:`);
      let n = 0;
      const seen = new Set<string>();
      outer: for (const row of f1) {
        const entry = row.texts.find((t) => t.kind === kind && t.header === header);
        const raw = entry?.text?.trim();
        if (!raw || seen.has(raw)) continue;
        seen.add(raw);
        n += 1;
        lines.push(`    ${n}) ${excerpt(sanitizeNumericNoiseForContext(raw), excerptMax)}`);
        if (n >= maxSnippets) break outer;
      }
      continue;
    }

    if (mode === 'rapport_prose') {
      lines.push(`  • «${headDisplay}» — текст: рекомендации, примеры:`);
      let n = 0;
      const seen = new Set<string>();
      outer: for (const row of f1) {
        const entry = row.texts.find((t) => t.kind === kind && t.header === header);
        const raw = entry?.text?.trim();
        if (!raw || seen.has(raw)) continue;
        seen.add(raw);
        n += 1;
        lines.push(`    ${n}) ${excerpt(sanitizeNumericNoiseForContext(raw), excerptMax)}`);
        if (n >= maxSnippets) break outer;
      }
      continue;
    }

    if (mode === 'default') {
      const checklist = defaultColumnActsAsCommaChecklist(f1, kind, header);
      if (checklist && checklist.length > 0) {
        lines.push(`  • «${headDisplay}» — пункты через запятую в ячейках (число уроков):`);
        for (const row of checklist) {
          lines.push(`      · ${excerpt(row.display, excerptMax)} — ${row.lessons}`);
        }
        continue;
      }
    }

    const kindRu = TEXT_KIND_LABEL[kind] ?? 'текст';
    lines.push(`  • «${headDisplay}» (${kindRu}), примеры:`);
    let n = 0;
    const seen = new Set<string>();
    outer: for (const row of f1) {
      const entry = row.texts.find((t) => t.kind === kind && t.header === header);
      const raw = entry?.text?.trim();
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      n += 1;
      lines.push(`    ${n}) ${excerpt(sanitizeNumericNoiseForContext(raw), excerptMax)}`);
      if (n >= maxSnippets) break outer;
    }
  }
}

/** Секции для столбчатых диаграмм вместо простыни «Методические метрики — текстовый анализ». */
export type MethodicalBarSection = {
  columnTitle: string;
  items: { label: string; lessons: number }[];
};

/**
 * Собирает агрегаты по методическим колонкам (таблица формулировок / списки пунктов), пригодные для графиков.
 * Проза (методика, рекомендации) сюда не входит — её можно не показывать в UI.
 */
export function collectMethodicalBarSections(f1: AnalyticRow[]): MethodicalBarSection[] {
  const keys = new Set<string>();
  for (const row of f1) {
    for (const t of row.texts) {
      keys.add(`${t.kind}\t${t.header}`);
    }
  }
  if (keys.size === 0) return [];
  const out: MethodicalBarSection[] = [];
  const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b, 'ru'));
  for (const key of sortedKeys) {
    const tab = key.indexOf('\t');
    const kind = (tab >= 0 ? key.slice(0, tab) : key) as ColumnRole;
    const header = tab >= 0 ? key.slice(tab + 1) : '';
    const mode = classifyMethodicalPresentation(header, kind);
    const headDisplay = sanitizeNumericNoiseForContext(header);

    if (mode === 'misc') continue;

    if (mode === 'summary_table') {
      const agg = aggregateLessonCellTextFrequency(f1, kind, header);
      if (agg.length === 0) continue;
      out.push({
        columnTitle: headDisplay,
        items: agg.map((x) => ({ label: x.display, lessons: x.lessons })),
      });
      continue;
    }

    if (mode === 'points_from_list') {
      if (kind === 'text_list_features') {
        const tagCounts = listFeatureTagCounts(f1, header, null);
        if (tagCounts.length > 0) {
          out.push({
            columnTitle: headDisplay,
            items: tagCounts.map((x) => ({
              label: sanitizeNumericNoiseForContext(x.display),
              lessons: x.uniqueLessons,
            })),
          });
          continue;
        }
      }
      const agg = aggregateCommaLikePointsPerLesson(f1, kind, header);
      if (agg.length > 0) {
        out.push({
          columnTitle: headDisplay,
          items: agg.map((x) => ({ label: x.display, lessons: x.lessons })),
        });
      }
      continue;
    }

    if (mode === 'default') {
      const checklist = defaultColumnActsAsCommaChecklist(f1, kind, header);
      if (checklist && checklist.length > 0) {
        out.push({
          columnTitle: headDisplay,
          items: checklist.map((x) => ({ label: x.display, lessons: x.lessons })),
        });
      }
    }
  }
  return out;
}

/** Развёрнутые текстовые поля по уроку (резюме, рекомендации и т.п.) — не дублируют агрегаты чек-листа. */
export type LessonProseCommentBlock = {
  lessonKey: string;
  lessonTitle: string;
  columnTitle: string;
  rawText: string;
  textKind: ColumnRole;
};

/**
 * Собирает прозаические колонки по каждому уникальному уроку в срезе (для таблицы комментариев как в феноменальных).
 * Исключает summary_table / points_from_list / misc и колонки default, распознанные как списки через запятую
 * (такие пункты попадают только в «Пункты чек-листа по срезу»).
 */
export function collectLessonProseCommentBlocks(f1: AnalyticRow[]): LessonProseCommentBlock[] {
  const keys = new Set<string>();
  for (const row of f1) {
    for (const t of row.texts) {
      keys.add(`${t.kind}\t${t.header}`);
    }
  }
  const excludeCommaChecklistDefault = new Set<string>();
  for (const key of keys) {
    const tab = key.indexOf('\t');
    const kind = (tab >= 0 ? key.slice(0, tab) : key) as ColumnRole;
    const header = tab >= 0 ? key.slice(tab + 1) : '';
    if (classifyMethodicalPresentation(header, kind) !== 'default') continue;
    if (defaultColumnActsAsCommaChecklist(f1, kind, header)) excludeCommaChecklistDefault.add(key);
  }

  const out: LessonProseCommentBlock[] = [];
  for (const row of f1) {
    const lessonKey = lessonIdentityKey(row);
    const lessonTitle =
      (row.rowLabel && String(row.rowLabel).trim()) ||
      (row.date && String(row.date).trim()) ||
      `Строка ${row.idx}`;
    for (const t of row.texts) {
      const colKey = `${t.kind}\t${t.header}`;
      const mode = classifyMethodicalPresentation(t.header, t.kind);
      if (mode === 'summary_table' || mode === 'points_from_list' || mode === 'misc') continue;
      if (excludeCommaChecklistDefault.has(colKey)) continue;
      const raw = t.text?.trim();
      if (!raw) continue;
      const columnTitle = sanitizeNumericNoiseForContext(t.header);
      out.push({ lessonKey, lessonTitle, columnTitle, rawText: raw, textKind: t.kind });
    }
  }
  return out;
}

function normLessonKeyPart(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
}

/**
 * Одна запись в источнике для KPI и дедупликации: колонка «ID строки» (id_row), иначе позиция строки в загруженном файле.
 */
export function lessonIdentityKey(row: AnalyticRow): string {
  const s = row.sourceRowId?.trim();
  if (s) return `sr:${normLessonKeyPart(s)}`;
  return `idx:${row.idx}`;
}

/** Одна аналитическая строка на логическое событие (по id источника или первой строке idx) — без раздувания средних при дубликатах и развёртке. */
export function dedupeRowsByLessonIdx(rows: AnalyticRow[]): AnalyticRow[] {
  const seen = new Set<string>();
  const out: AnalyticRow[] = [];
  for (const r of rows) {
    const k = lessonIdentityKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/**
 * Логический «урок»/событие для счётчиков на дашборде: при заданном id_row — он задаёт ядро ключа (дубликаты с одним № сливаются);
 * иначе дата + подпись + фильтры, кроме наставника.
 * Если признаков мало (одна координата) и нет id_row — к ключу добавляется idx.
 */
export function lessonSemanticKey(row: AnalyticRow, excludeTeacherFilterKey: string | null): string {
  const segs: string[] = [];
  if (row.sourceRowId?.trim()) {
    segs.push(`sr:${normLessonKeyPart(row.sourceRowId)}`);
  }
  if (row.date) segs.push(`d:${row.date}`);
  if (row.rowLabel?.trim()) segs.push(`lbl:${normLessonKeyPart(row.rowLabel)}`);
  const keys = Object.keys(row.filterValues).sort((a, b) => a.localeCompare(b, 'ru'));
  for (const k of keys) {
    if (excludeTeacherFilterKey && k === excludeTeacherFilterKey) continue;
    if (k.startsWith(PULSE_AI_DIM_PREFIX)) continue;
    if (k.startsWith(PULSE_SURVEY_COL_PREFIX)) continue;
    const v = row.filterValues[k];
    if (!v || v === '(не указано)') continue;
    segs.push(`${k}:${normLessonKeyPart(String(v))}`);
  }
  if (!row.sourceRowId?.trim() && segs.length <= 1) {
    return `${segs.join('|')}|idx:${row.idx}`;
  }
  return segs.join('|');
}

export function countUniqueLessonSemantics(rows: AnalyticRow[], excludeTeacherFilterKey: string | null): number {
  const s = new Set<string>();
  for (const r of rows) {
    s.add(lessonSemanticKey(r, excludeTeacherFilterKey));
  }
  return s.size;
}

/** Число уникальных записей в выборке: по id_row, если задан, иначе по строкам файла (idx). */
export function countUniqueImportRows(rows: AnalyticRow[]): number {
  return new Set(rows.map((r) => lessonIdentityKey(r))).size;
}

/** Ключ для объединения почти одинаковых подписей («Математика» / «математика »). */
export function normalizeFacetAggregateKey(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s || s === '(не указано)') return s;
  return s.toLocaleLowerCase('ru');
}

export type FilterBucketCounts = {
  display: string;
  /** Уникальные логические уроки (семантический ключ, без двойного счёта дубликатов строк Excel) */
  uniqueLessons: number;
  /** Сколько аналитических строк после развёртки мультизначений */
  expandedRows: number;
};

/**
 * Срез по фильтру: считает уникальные логические уроки и строки развёртки; сливает варианты с одинаковой нормализованной подписью.
 * excludeTeacherFilterKey — ключ колонки наставника в filterValues (исключается из семантического ключа урока).
 */
export function topFilterBucketsByUniqueLesson(
  rows: AnalyticRow[],
  key: string,
  topN: number,
  _excludeTeacherFilterKey: string | null,
): FilterBucketCounts[] {
  const m = new Map<string, { display: string; lessonKeys: Set<string>; expandedRows: number }>();
  for (const r of rows) {
    const raw = (r.filterValues[key] ?? '(не указано)').trim() || '(не указано)';
    const k = normalizeFacetAggregateKey(raw);
    /** Одна строка Excel = один урок; не дробить на «семантические» ключи после развёртки рубрики. */
    const lk = lessonIdentityKey(r);
    const cur = m.get(k);
    if (!cur) {
      m.set(k, { display: raw, lessonKeys: new Set([lk]), expandedRows: 1 });
    } else {
      cur.lessonKeys.add(lk);
      cur.expandedRows += 1;
    }
  }
  return [...m.values()]
    .map((v) => ({
      display: v.display,
      uniqueLessons: chartSafeFinite(v.lessonKeys.size, 0),
      expandedRows: chartSafeFinite(v.expandedRows, 0),
    }))
    .sort((a, b) => b.uniqueLessons - a.uniqueLessons || b.expandedRows - a.expandedRows)
    .slice(0, topN);
}

/**
 * Распределение по столбцу metric_numeric (значение как категория: «12», «7-11» не сюда — только распознанные числа).
 * Для «количество учеников» в аналитике уроков, где число не попадает в filterValues.
 */
export function topMetricNumericBucketsByUniqueLesson(
  rows: AnalyticRow[],
  colIndex: number,
  topN: number,
  _excludeTeacherFilterKey: string | null,
): FilterBucketCounts[] {
  const m = new Map<string, { display: string; lessonKeys: Set<string>; expandedRows: number }>();
  for (const r of rows) {
    const entry = r.metricsNumeric.find((x) => x.colIndex === colIndex);
    let raw: string;
    if (entry?.value != null && Number.isFinite(entry.value)) {
      const v = entry.value;
      raw =
        Number.isInteger(v) || Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : String(v);
    } else {
      raw = '(не указано)';
    }
    const k = normalizeFacetAggregateKey(raw);
    const lk = lessonIdentityKey(r);
    const cur = m.get(k);
    if (!cur) {
      m.set(k, { display: raw, lessonKeys: new Set([lk]), expandedRows: 1 });
    } else {
      cur.lessonKeys.add(lk);
      cur.expandedRows += 1;
    }
  }
  return [...m.values()]
    .map((v) => ({
      display: v.display,
      uniqueLessons: chartSafeFinite(v.lessonKeys.size, 0),
      expandedRows: chartSafeFinite(v.expandedRows, 0),
    }))
    .sort((a, b) => b.uniqueLessons - a.uniqueLessons || b.expandedRows - a.expandedRows)
    .slice(0, topN);
}

/** Частоты отдельных формулировок в колонке «список через запятую»: одна строка импорта = один урок; каждый тег в ячейке считается не более одного раза на урок. topN: null — без обрезки. */
export function listFeatureTagCounts(
  rowsOnePerLesson: AnalyticRow[],
  columnHeader: string,
  topN: number | null = 28,
): { display: string; uniqueLessons: number }[] {
  const m = new Map<string, { display: string; lessonIds: Set<string> }>();
  for (const row of rowsOnePerLesson) {
    const entry = row.texts.find((t) => t.kind === 'text_list_features' && t.header === columnHeader);
    if (!entry?.text?.trim()) continue;
    const parts = splitListFeatureParts(entry.text);
    const seenInRow = new Set<string>();
    for (const raw of parts) {
      const resolved = resolveListFeatureToken(raw);
      if (!resolved) continue;
      const k = resolved.aggregateKey;
      if (seenInRow.has(k)) continue;
      seenInRow.add(k);
      const lid = lessonIdentityKey(row);
      const cur = m.get(k);
      if (!cur) {
        m.set(k, { display: resolved.displayLabel, lessonIds: new Set([lid]) });
      } else {
        cur.lessonIds.add(lid);
        if (resolved.displayLabel.length > cur.display.length) cur.display = resolved.displayLabel;
      }
    }
  }
  const out = [...m.values()]
    .map((v) => ({ display: v.display, uniqueLessons: v.lessonIds.size }))
    .sort((a, b) => b.uniqueLessons - a.uniqueLessons || a.display.localeCompare(b.display, 'ru'));
  if (topN == null || out.length <= topN) return out;
  return out.slice(0, topN);
}

/** Все различные пункты колонки «список через запятую» в выборке (объединение по всем строкам). */
export function listFeatureTagUniverse(
  rowsOnePerLesson: AnalyticRow[],
  columnHeader: string,
): { key: string; display: string }[] {
  const m = new Map<string, string>();
  for (const row of rowsOnePerLesson) {
    const entry = row.texts.find((t) => t.kind === 'text_list_features' && t.header === columnHeader);
    if (!entry?.text?.trim()) continue;
    const parts = splitListFeatureParts(entry.text);
    const seenInRow = new Set<string>();
    for (const raw of parts) {
      const resolved = resolveListFeatureToken(raw);
      if (!resolved) continue;
      const k = resolved.aggregateKey;
      if (seenInRow.has(k)) continue;
      seenInRow.add(k);
      const prev = m.get(k);
      if (prev == null) m.set(k, resolved.displayLabel);
      else if (resolved.displayLabel.length > prev.length) m.set(k, resolved.displayLabel);
    }
  }
  return [...m.entries()]
    .map(([key, display]) => ({ key, display }))
    .sort((a, b) => a.display.localeCompare(b.display, 'ru'));
}

/**
 * По развёрнутым строкам (после мультинаставников): для выбранного педагога — сколько записей (по id_row или idx),
 * где в ячейке встретился пункт. topN: null — без обрезки.
 */
export function listFeatureTagFrequencyByTeacher(
  rowsExpanded: AnalyticRow[],
  teacherFilterKey: string,
  teacherValue: string,
  columnHeader: string,
  topN: number | null = 32,
): { display: string; lessonCount: number }[] {
  const m = new Map<string, { display: string; lessonIds: Set<string> }>();
  for (const row of rowsExpanded) {
    if (row.filterValues[teacherFilterKey] !== teacherValue) continue;
    const entry = row.texts.find((t) => t.kind === 'text_list_features' && t.header === columnHeader);
    if (!entry?.text?.trim()) continue;
    const parts = splitListFeatureParts(entry.text);
    const seenInRow = new Set<string>();
    for (const raw of parts) {
      const resolved = resolveListFeatureToken(raw);
      if (!resolved) continue;
      const k = resolved.aggregateKey;
      if (seenInRow.has(k)) continue;
      seenInRow.add(k);
      const lid = lessonIdentityKey(row);
      const cur = m.get(k);
      if (!cur) {
        m.set(k, { display: resolved.displayLabel, lessonIds: new Set([lid]) });
      } else {
        cur.lessonIds.add(lid);
        if (resolved.displayLabel.length > cur.display.length) cur.display = resolved.displayLabel;
      }
    }
  }
  const out = [...m.values()]
    .map((v) => ({ display: v.display, lessonCount: v.lessonIds.size }))
    .sort((a, b) => b.lessonCount - a.lessonCount || a.display.localeCompare(b.display, 'ru'));
  if (topN == null || out.length <= topN) return out;
  return out.slice(0, topN);
}

/** Сколько различных пунктов из справочника среза встретилось у педагога хотя бы в одном уроке. */
export function teacherListFeatureCoverage(
  rowsExpanded: AnalyticRow[],
  teacherFilterKey: string,
  teacherValue: string,
  columnHeader: string,
  universeNormKeys: Set<string>,
): { collectedUnique: number; totalUniverse: number } {
  const teacherKeys = new Set<string>();
  for (const row of rowsExpanded) {
    if (row.filterValues[teacherFilterKey] !== teacherValue) continue;
    const entry = row.texts.find((t) => t.kind === 'text_list_features' && t.header === columnHeader);
    if (!entry?.text?.trim()) continue;
    for (const raw of splitListFeatureParts(entry.text)) {
      const resolved = resolveListFeatureToken(raw);
      if (!resolved) continue;
      teacherKeys.add(resolved.aggregateKey);
    }
  }
  let collected = 0;
  for (const k of teacherKeys) {
    if (universeNormKeys.has(k)) collected += 1;
  }
  return { collectedUnique: collected, totalUniverse: universeNormKeys.size };
}

/** Среднее значение числового пункта по календарным месяцам (YYYY-MM из даты строки). */
export function meanNumericByMonth(
  rowsOnePerLesson: AnalyticRow[],
  colIndex: number,
): { month: string; mean: number; n: number }[] {
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const r of rowsOnePerLesson) {
    const d = r.date;
    if (!d || d.length < 7) continue;
    const month = d.slice(0, 7);
    const v = r.metricsNumeric.find((m) => m.colIndex === colIndex)?.value;
    if (v == null || !Number.isFinite(v)) continue;
    const cur = buckets.get(month) ?? { sum: 0, n: 0 };
    cur.sum += v;
    cur.n += 1;
    buckets.set(month, cur);
  }
  return [...buckets.entries()]
    .map(([month, { sum, n }]) => ({ month, mean: n > 0 ? sum / n : 0, n }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** По каждому месяцу — среднее по каждому числовому столбцу (одна линия на метрику). */
export function meanNumericByMonthAllMetrics(
  rowsOnePerLesson: AnalyticRow[],
  metricColIndices: number[],
): { month: string; means: Record<number, number | null> }[] {
  const monthBuckets = new Map<string, Map<number, { sum: number; n: number }>>();
  for (const r of rowsOnePerLesson) {
    const d = r.date;
    if (!d || d.length < 7) continue;
    const month = d.slice(0, 7);
    let colMap = monthBuckets.get(month);
    if (!colMap) {
      colMap = new Map();
      monthBuckets.set(month, colMap);
    }
    for (const mi of metricColIndices) {
      const v = r.metricsNumeric.find((m) => m.colIndex === mi)?.value;
      if (v == null || !Number.isFinite(v)) continue;
      const cur = colMap.get(mi) ?? { sum: 0, n: 0 };
      cur.sum += v;
      cur.n += 1;
      colMap.set(mi, cur);
    }
  }
  return [...monthBuckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, colMap]) => {
      const means: Record<number, number | null> = {};
      for (const mi of metricColIndices) {
        const cur = colMap.get(mi);
        means[mi] = cur && cur.n > 0 ? cur.sum / cur.n : null;
      }
      return { month, means };
    });
}

/** Средний ранг текстовой шкалы (1…N) по месяцам — динамика «качества» по времени. */
export function meanOrdinalRankByMonth(rowsOnePerLesson: AnalyticRow[]): { month: string; meanRank: number; n: number }[] {
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const r of rowsOnePerLesson) {
    const d = r.date;
    if (!d || d.length < 7) continue;
    if (r.metricOrdinal == null || !Number.isFinite(r.metricOrdinal)) continue;
    const month = d.slice(0, 7);
    const cur = buckets.get(month) ?? { sum: 0, n: 0 };
    cur.sum += r.metricOrdinal;
    cur.n += 1;
    buckets.set(month, cur);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, { sum, n }]) => ({ month, meanRank: n > 0 ? sum / n : 0, n }));
}

/** Строка среза в блоке для ИИ — без технического жаргона подсчёта строк. */
function formatFilterBucketLineForLlm(b: FilterBucketCounts): string {
  const n = b.uniqueLessons;
  const extra =
    b.expandedRows > n ? ` (развёртка рубрики: ${b.expandedRows} строк)` : '';
  return `  • ${sanitizeNumericNoiseForContext(b.display)}: ${n} ${n === 1 ? 'урок' : n < 5 ? 'урока' : 'уроков'}${extra}`;
}

/**
 * Развёрнутая выгрузка фактов для ИИ: срезы по фильтрам, распределение шкалы, педагоги с числом строк,
 * больше текстовых цитат — чтобы модель могла писать отчёт уровня «комплексного анализа», а не пересказ одной строки.
 */
export function buildRichLlmContextRu(
  allRows: AnalyticRow[],
  filtered: AnalyticRow[],
  opts: {
    dateLabel: string;
    numericMetrics: { colIndex: number; label: string }[];
    hasOrdinal: boolean;
    ordinalLevels: string[];
    teacherFilterKey: string | null;
    filterKeys: string[];
    filterLabels: Record<string, string>;
  },
): string {
  const lines: string[] = [];
  const filteredOneLesson = dedupeRowsByLessonIdx(filtered);
  const impAll = countUniqueImportRows(allRows);
  const impFilt = countUniqueImportRows(filtered);
  const semAll = countUniqueLessonSemantics(allRows, opts.teacherFilterKey);
  const semFiltered = countUniqueLessonSemantics(filtered, opts.teacherFilterKey);
  lines.push('=== Факты по выборке (источник для связного отчёта) ===');
  lines.push(
    `Объём: в полном файле ${impAll} ${impAll === 1 ? 'урок' : impAll < 5 ? 'урока' : 'уроков'} (уникальных строк наблюдений в таблице), в текущем срезе ${impFilt}.`,
  );
  if (semAll !== impAll || semFiltered !== impFilt) {
    lines.push(
      `Служебно: при развёртке пунктов рубрики в фильтрах получается больше аналитических строк (${semFiltered} по срезу, ${semAll} по файлу) — для отчёта о числе уроков используйте ${impFilt}, не ${semFiltered}.`,
    );
  }
  lines.push(
    'Средние по баллам и доли по шкале посчитаны корректно (без двойного учёта при нескольких отметках в одной ячейке). Не пересказывай эту служебную строку в отчёте.',
  );

  if (opts.dateLabel) {
    const dates = filteredOneLesson.map((r) => r.date).filter((d): d is string => Boolean(d));
    if (dates.length) {
      dates.sort();
      const from = dates[0];
      const to = dates[dates.length - 1];
      if (isPlausibleAnalyticsIsoDate(from) && isPlausibleAnalyticsIsoDate(to)) {
        lines.push(`Календарный период (колонка «${opts.dateLabel}»): с ${from} по ${to}.`);
      } else {
        lines.push(
          `Колонка «${opts.dateLabel}» задана как дата, но значения недостоверны для календаря — в отчёте не указывай даты периода; опиши только содержание ответов.`,
        );
      }
    }
  }

  if (opts.teacherFilterKey) {
    const buckets = topFilterBucketsByUniqueLesson(filtered, opts.teacherFilterKey, 200, opts.teacherFilterKey);
    const known = buckets.filter((x) => x.display !== '(не указано)');
    lines.push('');
    lines.push(`Педагоги по полю «${opts.filterLabels[opts.teacherFilterKey] ?? opts.teacherFilterKey}»:`);
    for (const b of known) {
      lines.push(formatFilterBucketLineForLlm(b));
    }
    if (known.length === 0) lines.push('  (нет заполненных значений в срезе)');
  }

  for (const fk of opts.filterKeys) {
    if (fk === PULSE_PARALLEL_AUTO_KEY) continue;
    if (opts.teacherFilterKey && fk === opts.teacherFilterKey) continue;
    const label = opts.filterLabels[fk] ?? fk;
    const top = topFilterBucketsByUniqueLesson(filtered, fk, 18, opts.teacherFilterKey);
    if (top.length === 0) continue;
    lines.push('');
    lines.push(`Тема/поле «${label}» (топ по числу ответов; близкие формулировки объединены):`);
    for (const b of top) {
      lines.push(formatFilterBucketLineForLlm(b));
    }
  }

  if (opts.numericMetrics.length > 0) {
    lines.push('');
    lines.push(
      'Баллы по вопросам (чем выше, тем лучше по смыслу формулировки столбца; название столбца = формулировка вопроса):',
    );
    for (const { colIndex, label } of opts.numericMetrics) {
      const mm = meanMinMax(filteredOneLesson, colIndex);
      if (mm) {
        lines.push(
          `  • «${label}»: среднее ${mm.mean.toFixed(2)}, от ${mm.min.toFixed(2)} до ${mm.max.toFixed(2)} (${mm.n} ответов с баллом).`,
        );
      } else {
        lines.push(`  • «${label}»: нет чисел в срезе.`);
      }
    }
    if (opts.numericMetrics.length > 1) {
      const st = sumTotalStats(filteredOneLesson);
      if (st) {
        lines.push(
          `Сумма баллов по всем перечисленным вопросам в одной строке (пустые ячейки не входят): в среднем ${st.mean.toFixed(2)}, от ${st.min.toFixed(2)} до ${st.max.toFixed(2)} (${st.n} ответов).`,
        );
      }
    }
  }

  if (opts.hasOrdinal && opts.ordinalLevels.length > 0) {
    const dist = ordinalDistribution(filteredOneLesson, opts.ordinalLevels);
    lines.push('');
    lines.push(
      `Текстовая шкала — только у уроков с заполненной ячейкой шкалы; всего уроков в срезе ${impFilt} (строк таблицы).`,
    );
    lines.push('Распределение по текстовой шкале (доли по уникальным урокам со шкалой):');
    if (dist.length === 0) {
      lines.push('  (нет заполненных значений шкалы)');
    } else {
      const total = dist.reduce((s, x) => s + x.count, 0);
      for (const { level, count } of dist) {
        const pct = total > 0 ? ((100 * count) / total).toFixed(1) : '0';
        lines.push(`  • ${level}: ${count} уроков (${pct}%)`);
      }
      lines.push(`  Сумма по уровням: ${total} уроков (не больше числа уроков со шкалой; не смешивай с общим ${impFilt}).`);
    }
  } else if (opts.hasOrdinal) {
    const withO = filteredOneLesson.filter((r) => r.metricOrdinal != null).length;
    lines.push('');
    lines.push(`Текстовая шкала: заполнено в ${withO} уроках (порядок уровней в интерфейсе не передан).`);
  }

  const listFeatureHeaders = new Set<string>();
  for (const row of filteredOneLesson) {
    for (const { kind, header } of row.texts) {
      if (kind === 'text_list_features') listFeatureHeaders.add(header);
    }
  }
  for (const h of [...listFeatureHeaders].sort((a, b) => a.localeCompare(b, 'ru'))) {
    const uni = listFeatureTagUniverse(filteredOneLesson, h);
    const tagCounts = listFeatureTagCounts(filteredOneLesson, h, 32);
    if (tagCounts.length === 0 && uni.length === 0) continue;
    lines.push('');
    lines.push(
      `Отметки в поле «${sanitizeNumericNoiseForContext(h)}» (несколько вариантов в одной ячейке через запятую). Топ по числу ответов:`,
    );
    for (const { display, uniqueLessons } of tagCounts) {
      lines.push(`  • ${sanitizeNumericNoiseForContext(display)}: ${uniqueLessons} ответов`);
    }
  }

  appendMethodicalTextSectionLines(
    lines,
    filteredOneLesson,
    'Методические метрики — текстовые поля (структура по смыслу колонки; для связного отчёта):',
    320,
    12,
  );

  lines.push('');
  lines.push('=== КОНЕЦ ВЫГРУЗКИ ===');
  return lines.join('\n');
}

/**
 * Краткий текст без внешнего ИИ. Коды педагогов не перечисляем поимённо.
 * Все числовые пункты перечисляются с названиями столбцов; текстовые поля — краткие выдержки.
 */
export function buildQuickSummaryRu(
  rows: AnalyticRow[],
  filtered: AnalyticRow[],
  opts: {
    hasTeacherFilter: boolean;
    /** Ключ filterValues колонки наставника (исключается из семантического ключа урока). */
    mentorFilterKey: string | null;
    dateLabel: string;
    /** Все столбцы с ролью «числовая метрика» — каждый отражается в тексте. */
    numericMetrics: { colIndex: number; label: string }[];
    hasOrdinal: boolean;
    /** Не добавлять длинный блок методических текстов (в UI показывают диаграммы). */
    omitMethodicalSections?: boolean;
    /** Без служебных строк про объём, развёртку, период — для карточек аналитики уроков на экране. */
    omitTechnicalMeta?: boolean;
  },
): string {
  const lines: string[] = [];
  const f1 = dedupeRowsByLessonIdx(filtered);
  const impAll = countUniqueImportRows(rows);
  const impFilt = countUniqueImportRows(filtered);
  const semFilt = countUniqueLessonSemantics(filtered, opts.mentorFilterKey);
  if (!opts.omitTechnicalMeta) {
    lines.push(`Объём: в файле ${impAll} уроков (уникальных строк таблицы), в срезе ${impFilt}.`);
    if (semFilt !== impFilt) {
      lines.push(
        'Точек после развёртки ячеек больше, чем уроков; графики и средние — по одному разу на урок.',
      );
    }
    lines.push('Средние и шкала посчитаны без двойного учёта при размножении строк из одной ячейки.');
    if (opts.dateLabel) {
      const dates = f1.map((r) => r.date).filter((d): d is string => Boolean(d));
      if (dates.length) {
        dates.sort();
        const from = dates[0];
        const to = dates[dates.length - 1];
        if (isPlausibleAnalyticsIsoDate(from) && isPlausibleAnalyticsIsoDate(to)) {
          lines.push(`Период (колонка «${opts.dateLabel}»): с ${from} по ${to}.`);
        }
      }
    }
    if (opts.hasTeacherFilter && opts.mentorFilterKey) {
      const mk = opts.mentorFilterKey;
      const teachers = new Set(filtered.map((r) => r.filterValues[mk]).filter((x) => x && x !== '(не указано)'));
      lines.push(
        `Наставников в выборке: ${teachers.size}. Сводные средние по каждому — на графике «По наставникам»; ФИО в тексте не перечисляем.`,
      );
    }
  }

  if (opts.numericMetrics.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(
      'Баллы по вопросам (чем выше, тем лучше по смыслу; название столбца — формулировка вопроса):',
    );
    for (const { colIndex, label } of opts.numericMetrics) {
      const mm = meanMinMax(f1, colIndex);
      if (mm) {
        lines.push(
          `  • «${label}»: среднее ${mm.mean.toFixed(2)}, от ${mm.min.toFixed(2)} до ${mm.max.toFixed(2)} (${mm.n} ответов с баллом).`,
        );
      } else {
        lines.push(`  • «${label}»: нет числовых значений в выборке.`);
      }
    }
    if (opts.numericMetrics.length > 1) {
      const st = sumTotalStats(f1);
      if (st) {
        lines.push(
          `Сумма баллов по строке (пустые ячейки не входят): в среднем ${st.mean.toFixed(2)}, от ${st.min.toFixed(2)} до ${st.max.toFixed(2)} (${st.n} ответов).`,
        );
      }
    }
  }

  if (opts.hasOrdinal && !opts.omitTechnicalMeta) {
    const withO = f1.filter((r) => r.metricOrdinal != null).length;
    lines.push('');
    lines.push(`Текстовая шкала: заполнена у ${withO} из ${impFilt} уроков в срезе (остальные без уровня в данных).`);
  }

  if (!opts.omitMethodicalSections) {
    appendMethodicalTextSectionLines(
      lines,
      f1,
      'Методические метрики — текстовый анализ (по типу колонки):',
      220,
      4,
    );
  }

  return lines.join('\n');
}

/** Пакет фактов для ИИ-записки директору по одному педагогу (или педагог+предмет). */
export type DirectorFactPacket = {
  segmentId: string;
  teacher: string;
  subject: string | null;
  factsSummary: string;
  rowCount: number;
};

function buildDirectorSegmentFactsLines(
  subRows: AnalyticRow[],
  opts: {
    teacher: string;
    subject: string | null;
    teacherHeader: string;
    subjectHeader: string;
    dateLabel: string;
    numericMetrics: { colIndex: number; label: string }[];
    hasOrdinal: boolean;
    ordinalLevels: string[];
    teacherFilterKey: string;
  },
): string {
  const lines: string[] = [];
  const uniqueSemantic = countUniqueLessonSemantics(subRows, opts.teacherFilterKey);
  const subOne = dedupeRowsByLessonIdx(subRows);
  lines.push(`Педагог: ${opts.teacher} (колонка «${opts.teacherHeader}»).`);
  if (opts.subject != null) {
    lines.push(`Предмет / тематика: ${opts.subject} (колонка «${opts.subjectHeader}»).`);
  }
  lines.push(`В этом сегменте ${uniqueSemantic} ответов (уроков по смыслу).`);

  if (opts.dateLabel) {
    const dates = subOne.map((r) => r.date).filter((d): d is string => Boolean(d));
    if (dates.length) {
      dates.sort();
      const from = dates[0];
      const to = dates[dates.length - 1];
      if (isPlausibleAnalyticsIsoDate(from) && isPlausibleAnalyticsIsoDate(to)) {
        lines.push(`Период (колонка «${opts.dateLabel}»): с ${from} по ${to}.`);
      }
    }
  }

  if (opts.numericMetrics.length > 0) {
    lines.push('');
    lines.push('Баллы по вопросам (чем выше, тем лучше по смыслу столбца):');
    for (const { colIndex, label } of opts.numericMetrics) {
      const mm = meanMinMax(subOne, colIndex);
      if (mm) {
        lines.push(
          `  • «${label}»: среднее ${mm.mean.toFixed(2)}, от ${mm.min.toFixed(2)} до ${mm.max.toFixed(2)} (${mm.n} ответов с баллом).`,
        );
      } else {
        lines.push(`  • «${label}»: нет числовых значений в этом сегменте.`);
      }
    }
    if (opts.numericMetrics.length > 1) {
      const st = sumTotalStats(subOne);
      if (st) {
        lines.push(
          `Сумма баллов по строке (пустые ячейки не входят): в среднем ${st.mean.toFixed(2)}, от ${st.min.toFixed(2)} до ${st.max.toFixed(2)} (${st.n} ответов).`,
        );
      }
    }
  }

  if (opts.hasOrdinal) {
    const withO = subOne.filter((r) => r.metricOrdinal != null).length;
    lines.push('');
    lines.push(`Текстовая шкала: заполнено в ${withO} уроках.`);
    if (opts.ordinalLevels.length > 0) {
      const dist = ordinalDistribution(subOne, opts.ordinalLevels);
      if (dist.length) {
        lines.push('Распределение по уровням шкалы (по уникальным урокам):');
        for (const { level, count } of dist) {
          lines.push(`  • ${level}: ${count}`);
        }
      }
    }
  }

  appendMethodicalTextSectionLines(lines, subOne, 'Методические метрики — текстовые поля (сегмент):', 220, 4);

  return lines.join('\n');
}

const DEFAULT_DIRECTOR_MAX_SEGMENTS = 36;

/**
 * Разбивает текущую выборку на сегменты по педагогу; если задан колонка предмета — по паре педагог+предмет.
 * Пустой код педагога в строке пропускается.
 */
export function buildDirectorFactPackets(
  filtered: AnalyticRow[],
  opts: {
    teacherKey: string;
    subjectKey: string | null;
    teacherHeader: string;
    subjectHeader: string;
    dateLabel: string;
    numericMetrics: { colIndex: number; label: string }[];
    hasOrdinal: boolean;
    ordinalLevels: string[];
    maxSegments?: number;
  },
): { packets: DirectorFactPacket[]; truncated: boolean; totalGroups: number } {
  const maxSeg = opts.maxSegments ?? DEFAULT_DIRECTOR_MAX_SEGMENTS;
  const groups = new Map<string, AnalyticRow[]>();
  for (const r of filtered) {
    const t = r.filterValues[opts.teacherKey];
    if (!t || t === '(не указано)') continue;
    const key = opts.subjectKey
      ? `${t}\u0000${r.filterValues[opts.subjectKey] ?? '(не указано)'}`
      : t;
    const cur = groups.get(key);
    if (cur) cur.push(r);
    else groups.set(key, [r]);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
  const totalGroups = sortedKeys.length;
  const limitedKeys = sortedKeys.slice(0, maxSeg);
  const packets: DirectorFactPacket[] = limitedKeys.map((key, idx) => {
    const sub = groups.get(key) ?? [];
    let teacher: string;
    let subject: string | null;
    if (opts.subjectKey) {
      const i = key.indexOf('\u0000');
      teacher = i >= 0 ? key.slice(0, i) : key;
      subject = i >= 0 ? key.slice(i + 1) : null;
    } else {
      teacher = key;
      subject = null;
    }
    const factsSummary = buildDirectorSegmentFactsLines(sub, {
      teacher,
      subject,
      teacherHeader: opts.teacherHeader,
      subjectHeader: opts.subjectHeader,
      dateLabel: opts.dateLabel,
      numericMetrics: opts.numericMetrics,
      hasOrdinal: opts.hasOrdinal,
      ordinalLevels: opts.ordinalLevels,
      teacherFilterKey: opts.teacherKey,
    });
    return {
      segmentId: `seg_${idx}`,
      teacher,
      subject,
      factsSummary,
      rowCount: sub.length,
    };
  });

  return { packets, truncated: totalGroups > maxSeg, totalGroups };
}
