import type { Question } from '../../types';
import {
  normalizeFillVariants,
  normalizeTeacherAvailabilityOptions,
  resolveColumnCount,
  rowsFromOptions,
} from './builderOptions';
import {
  AVAILABILITY_DAY_KEYS,
  DEFAULT_FILL_VARIANTS,
  formatLessonPeriodLabel,
  type AvailabilityCellState,
  type AvailabilityMatrix,
  type FillVariantConfig,
  type GridRowConfig,
  type LessonPeriodHeader,
  type TeacherAvailabilityQuestionOptions,
} from './types';

const VALID_STATES = new Set<AvailabilityCellState>(['forbidden', 'acceptable', 'allowed']);

export function parseAvailabilityOptions(raw: unknown): {
  periods: number[];
  rows: GridRowConfig[];
  /** @deprecated use rows */
  days: string[];
  gridTitlePrefix: string;
  showGridTitle: boolean;
  fillVariants: FillVariantConfig[];
} {
  const normalized = normalizeTeacherAvailabilityOptions(raw);
  const colCount = resolveColumnCount(normalized);
  const periods = Array.from({ length: colCount }, (_, i) => i + 1);
  const rows = rowsFromOptions(normalized);
  const gridTitlePrefix =
    typeof normalized.gridTitlePrefix === 'string' && normalized.gridTitlePrefix.trim()
      ? normalized.gridTitlePrefix.trim()
      : 'Рабочее время';
  return {
    periods,
    rows,
    days: rows.map((r) => r.key),
    gridTitlePrefix,
    showGridTitle: normalized.showGridTitle === true,
    fillVariants: normalized.fillVariants ?? DEFAULT_FILL_VARIANTS,
  };
}

export function rowLabelMap(options: unknown): Record<string, string> {
  const { rows } = parseAvailabilityOptions(options);
  return Object.fromEntries(rows.map((r) => [r.key, r.label]));
}

export function emptyAvailabilityMatrix(): AvailabilityMatrix {
  return {};
}

export function periodCountFromOptions(options: unknown): number {
  return parseAvailabilityOptions(options).periods.length;
}

function periodTimesFromOptions(o: TeacherAvailabilityQuestionOptions, n: number): (string | undefined)[] {
  if (!Array.isArray(o.periodTimes) || !o.periodTimes.length) {
    return Array.from({ length: n }, () => undefined);
  }
  return Array.from({ length: n }, (_, i) => {
    const t = o.periodTimes![i];
    return typeof t === 'string' && t.trim() ? t.trim() : undefined;
  });
}

export function periodHeadersFromOptions(options: unknown, count?: number): LessonPeriodHeader[] {
  const normalized = normalizeTeacherAvailabilityOptions(options);
  const n = count ?? resolveColumnCount(normalized);
  const times = periodTimesFromOptions(normalized, n);
  const labels = normalized.periodLabels ?? [];
  return Array.from({ length: n }, (_, i) => ({
    title: labels[i]?.trim() || formatLessonPeriodLabel(i + 1),
    time: times[i],
  }));
}

/** Однострочные подписи (обратная совместимость, aria, экспорт). */
export function periodLabelsFromOptions(options: unknown, count?: number): string[] {
  return periodHeadersFromOptions(options, count).map(({ title, time }) =>
    time ? `${title}\n${time}` : title,
  );
}

export function formSelectableVariants(options: unknown): FillVariantConfig[] {
  return normalizeFillVariants(parseAvailabilityOptions(options).fillVariants).filter(
    (v) => v.formSelectable,
  );
}

export function stateLabelsFromOptions(options: unknown): Record<AvailabilityCellState, string> {
  const labels: Record<AvailabilityCellState, string> = {
    allowed: 'Можно провести занятие',
    acceptable: 'Допустимо',
    forbidden: 'Не могу провести занятие',
  };
  for (const v of normalizeFillVariants(parseAvailabilityOptions(options).fillVariants)) {
    labels[v.state] = v.label;
  }
  return labels;
}

export function getCellState(
  matrix: AvailabilityMatrix,
  rowKey: string,
  period: number,
): AvailabilityCellState | null {
  const row = matrix[rowKey];
  if (!row) return null;
  const v = row[String(period)];
  return VALID_STATES.has(v as AvailabilityCellState) ? (v as AvailabilityCellState) : null;
}

export function setCellState(
  matrix: AvailabilityMatrix,
  rowKey: string,
  period: number,
  state: AvailabilityCellState | null,
): AvailabilityMatrix {
  const key = String(period);
  const next: AvailabilityMatrix = { ...matrix };
  const row = { ...(next[rowKey] || {}) };
  if (state == null) {
    delete row[key];
  } else {
    row[key] = state;
  }
  if (Object.keys(row).length === 0) {
    const { [rowKey]: _removed, ...rest } = next;
    return rest;
  }
  next[rowKey] = row;
  return next;
}

/** Состояние ячейки на публичной форме: только formSelectable варианты или пусто. */
export function getFormCellState(
  matrix: AvailabilityMatrix,
  rowKey: string,
  period: number,
  options?: unknown,
): AvailabilityCellState | null {
  const st = getCellState(matrix, rowKey, period);
  if (!st) return null;
  const selectable = new Set(formSelectableVariants(options).map((v) => v.state));
  return selectable.has(st) ? st : null;
}

/** Состояние для просмотра методистом; неотмеченное и legacy «allowed» = можно. */
export function getResultsCellState(
  matrix: AvailabilityMatrix,
  rowKey: string,
  period: number,
): AvailabilityCellState {
  const st = getCellState(matrix, rowKey, period);
  if (st === 'forbidden' || st === 'acceptable') return st;
  return 'allowed';
}

/** Состояние «день закрыт» на форме: forbidden, если доступен, иначе первый formSelectable. */
export function rowCloseState(options?: unknown): AvailabilityCellState {
  const selectable = formSelectableVariants(options);
  const forbidden = selectable.find((v) => v.state === 'forbidden');
  if (forbidden) return 'forbidden';
  if (selectable.length) return selectable[0].state;
  return 'forbidden';
}

/** Все ячейки строки отмечены состоянием «день закрыт». */
export function isRowFullyClosed(
  matrix: AvailabilityMatrix,
  rowKey: string,
  periods: number[],
  options?: unknown,
): boolean {
  const closeState = rowCloseState(options);
  return (
    periods.length > 0 &&
    periods.every((p) => getFormCellState(matrix, rowKey, p, options) === closeState)
  );
}

/** Переключить строку: закрыть весь день или снять отметки, если уже полностью закрыт. */
export function toggleRowFormCells(
  matrix: AvailabilityMatrix,
  rowKey: string,
  periods: number[],
  options?: unknown,
): AvailabilityMatrix {
  const closeState = rowCloseState(options);
  const fullyClosed = isRowFullyClosed(matrix, rowKey, periods, options);
  let next = matrix;
  for (const p of periods) {
    next = setCellState(next, rowKey, p, fullyClosed ? null : closeState);
  }
  return next;
}

/** Левый клик на форме: цикл null → formSelectable[0] → … → null. */
export function cycleFormCellState(
  current: AvailabilityCellState | null,
  options?: unknown,
): AvailabilityCellState | null {
  const selectable = formSelectableVariants(options);
  if (!selectable.length) {
    return current === 'forbidden' ? null : 'forbidden';
  }
  if (current == null) return selectable[0].state;
  const idx = selectable.findIndex((v) => v.state === current);
  if (idx < 0) return selectable[0].state;
  if (idx >= selectable.length - 1) return null;
  return selectable[idx + 1].state;
}

/** @deprecated use cycleFormCellState */
export function toggleFormCellState(current: AvailabilityCellState | null): AvailabilityCellState | null {
  return cycleFormCellState(current);
}

export function isTeacherAvailabilityMatrix(value: unknown): value is AvailabilityMatrix {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const [rowKey, row] of Object.entries(value as Record<string, unknown>)) {
    if (!rowKey.trim()) return false;
    if (row == null || typeof row !== 'object' || Array.isArray(row)) return false;
    for (const v of Object.values(row as Record<string, unknown>)) {
      if (!VALID_STATES.has(v as AvailabilityCellState)) return false;
    }
  }
  return true;
}

export function normalizeAvailabilityMatrix(raw: unknown): AvailabilityMatrix {
  if (!isTeacherAvailabilityMatrix(raw)) return emptyAvailabilityMatrix();
  return raw;
}

export function formatGridTitle(prefix: string, fio: string): string {
  const name = fio.trim();
  return name ? `${prefix} — ${name}` : prefix;
}

/** Сохраняем только явно отмеченные formSelectable ячейки; остальное трактуется как «можно». */
export function matrixForSubmit(matrix: AvailabilityMatrix, options?: unknown): AvailabilityMatrix {
  const selectable = new Set(formSelectableVariants(options).map((v) => v.state));
  if (!selectable.size) selectable.add('forbidden');
  const out: AvailabilityMatrix = {};
  for (const [rowKey, row] of Object.entries(matrix)) {
    if (!row) continue;
    const cleaned: Partial<Record<string, AvailabilityCellState>> = {};
    for (const [key, st] of Object.entries(row)) {
      if (st && selectable.has(st)) cleaned[key] = st;
    }
    if (Object.keys(cleaned).length) out[rowKey] = cleaned;
  }
  return out;
}

export function findFioFromAnswers(
  questions: Question[],
  answers: Record<number, unknown>,
): string {
  const fioQ =
    questions.find((q) => {
      if (q.type !== 'text') return false;
      const o =
        q.options && typeof q.options === 'object' && !Array.isArray(q.options)
          ? (q.options as { fieldKey?: string; format?: string; inputType?: string })
          : {};
      const key = String(o.fieldKey || '').toLowerCase();
      if (key === 'email' || key === 'почта') return false;
      const format = String(o.format || o.inputType || '').toLowerCase();
      if (format === 'email') return false;
      return /ф\.?\s*и\.?\s*о|фио|фамилия/i.test(q.text);
    }) ||
    questions.find((q) => {
      if (q.type !== 'text') return false;
      const o =
        q.options && typeof q.options === 'object' && !Array.isArray(q.options)
          ? (q.options as { fieldKey?: string; format?: string; inputType?: string })
          : {};
      const key = String(o.fieldKey || '').toLowerCase();
      if (key === 'email' || key === 'почта') return false;
      const format = String(o.format || o.inputType || '').toLowerCase();
      return format !== 'email';
    });
  if (!fioQ) return '';
  const v = answers[fioQ.id];
  return typeof v === 'string' ? v.trim() : '';
}

/** Ключи строк из конфига вопроса (для валидации на бэкенде — дублируется в validation.js). */
export function rowKeysFromQuestionOptions(options: unknown): string[] {
  return rowsFromOptions(normalizeTeacherAvailabilityOptions(options)).map((r) => r.key);
}

/** Обратная совместимость для analytics */
export const AVAILABILITY_ROW_KEYS = AVAILABILITY_DAY_KEYS;
