import {
  AVAILABILITY_DAY_KEYS,
  AVAILABILITY_DAY_LABELS,
  DEFAULT_FILL_VARIANTS,
  DEFAULT_PERIOD_COUNT,
  formatLessonPeriodLabel,
  type AvailabilityCellState,
  type FillVariantConfig,
  type GridRowConfig,
  type TeacherAvailabilityQuestionOptions,
} from './types';

const ROW_KEY_POOL: string[] = [...AVAILABILITY_DAY_KEYS, 'sat', 'sun'];

export function defaultRowKey(index: number): string {
  return ROW_KEY_POOL[index] ?? `row${index + 1}`;
}

export function defaultRowLabel(index: number): string {
  const key = defaultRowKey(index) as keyof typeof AVAILABILITY_DAY_LABELS;
  if (key in AVAILABILITY_DAY_LABELS) return AVAILABILITY_DAY_LABELS[key];
  return `Строка ${index + 1}`;
}

export function normalizeTeacherAvailabilityOptions(raw: unknown): TeacherAvailabilityQuestionOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as TeacherAvailabilityQuestionOptions;
  const rowCount = resolveRowCount(o);
  const colCount = resolveColumnCount(o);
  const rows = rowsFromOptions(o, rowCount);
  const periodLabels = normalizePeriodLabels(o, colCount);
  const periodTimes = normalizePeriodTimes(o, colCount);
  const fillVariants = normalizeFillVariants(o.fillVariants);
  return {
    periods: colCount,
    rows,
    periodLabels,
    periodTimes,
    fillVariants,
    showGridTitle: o.showGridTitle === true,
    gridTitlePrefix:
      typeof o.gridTitlePrefix === 'string' && o.gridTitlePrefix.trim()
        ? o.gridTitlePrefix.trim()
        : undefined,
  };
}

export function resolveColumnCount(o: TeacherAvailabilityQuestionOptions): number {
  if (Array.isArray(o.periods) && o.periods.length) {
    return Math.max(1, Math.min(20, o.periods.length));
  }
  if (typeof o.periods === 'number' && o.periods >= 1) {
    return Math.max(1, Math.min(20, Math.floor(o.periods)));
  }
  if (Array.isArray(o.periodLabels) && o.periodLabels.length) {
    return Math.max(1, Math.min(20, o.periodLabels.length));
  }
  return DEFAULT_PERIOD_COUNT;
}

export function resolveRowCount(o: TeacherAvailabilityQuestionOptions): number {
  if (Array.isArray(o.rows) && o.rows.length) {
    return Math.max(1, Math.min(14, o.rows.length));
  }
  if (Array.isArray(o.days) && o.days.length) {
    return Math.max(1, Math.min(14, o.days.length));
  }
  if (Array.isArray(o.rowLabels) && o.rowLabels.length) {
    return Math.max(1, Math.min(14, o.rowLabels.length));
  }
  return AVAILABILITY_DAY_KEYS.length;
}

export function rowsFromOptions(o: TeacherAvailabilityQuestionOptions, count?: number): GridRowConfig[] {
  const n = count ?? resolveRowCount(o);
  if (Array.isArray(o.rows) && o.rows.length) {
    return Array.from({ length: n }, (_, i) => {
      const src = o.rows![i];
      if (src && typeof src.key === 'string' && src.key.trim()) {
        return {
          key: src.key.trim(),
          label: String(src.label ?? src.key).trim() || defaultRowLabel(i),
        };
      }
      return { key: defaultRowKey(i), label: defaultRowLabel(i) };
    });
  }
  const days =
    Array.isArray(o.days) && o.days.length
      ? o.days.filter((d) => typeof d === 'string').slice(0, n)
      : AVAILABILITY_DAY_KEYS.slice(0, n);
  const labels = Array.isArray(o.rowLabels) ? o.rowLabels : [];
  return Array.from({ length: n }, (_, i) => {
    const key = (days[i] as string | undefined)?.trim() || defaultRowKey(i);
    const label =
      (typeof labels[i] === 'string' && labels[i].trim()) ||
      AVAILABILITY_DAY_LABELS[key as keyof typeof AVAILABILITY_DAY_LABELS] ||
      defaultRowLabel(i);
    return { key, label };
  });
}

function normalizePeriodLabels(o: TeacherAvailabilityQuestionOptions, count: number): string[] {
  const src = Array.isArray(o.periodLabels) ? o.periodLabels : [];
  return Array.from({ length: count }, (_, i) => {
    const custom = src[i];
    if (typeof custom === 'string' && custom.trim()) return custom.trim();
    return formatLessonPeriodLabel(i + 1);
  });
}

function normalizePeriodTimes(o: TeacherAvailabilityQuestionOptions, count: number): string[] {
  const src = Array.isArray(o.periodTimes) ? o.periodTimes : [];
  return Array.from({ length: count }, (_, i) => {
    const t = src[i];
    return typeof t === 'string' ? t.trim() : '';
  });
}

export function normalizeFillVariants(raw: FillVariantConfig[] | undefined): FillVariantConfig[] {
  if (!Array.isArray(raw) || !raw.length) return [...DEFAULT_FILL_VARIANTS];
  const out: FillVariantConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item.state !== 'string') continue;
    if (item.state !== 'allowed' && item.state !== 'acceptable' && item.state !== 'forbidden') continue;
    const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : DEFAULT_FILL_VARIANTS.find((v) => v.state === item.state)?.label ?? item.state;
    out.push({
      state: item.state,
      label,
      formSelectable: item.formSelectable === true,
    });
  }
  return out.length ? out : [...DEFAULT_FILL_VARIANTS];
}

export function setRowCount(options: unknown, count: number): TeacherAvailabilityQuestionOptions {
  const prev = normalizeTeacherAvailabilityOptions(options);
  const n = Math.max(1, Math.min(14, Math.floor(count) || 1));
  const prevRows = prev.rows ?? rowsFromOptions(prev);
  const labels = Array.from({ length: n }, (_, i) => prevRows[i]?.label ?? defaultRowLabel(i));
  const keys = Array.from({ length: n }, (_, i) => prevRows[i]?.key ?? defaultRowKey(i));
  return {
    ...prev,
    rows: keys.map((key, i) => ({ key, label: labels[i] })),
    days: undefined,
    rowLabels: undefined,
  };
}

export function setRowLabelsFromLines(options: unknown, lines: string[]): TeacherAvailabilityQuestionOptions {
  const prev = normalizeTeacherAvailabilityOptions(options);
  const rows = (prev.rows ?? rowsFromOptions(prev)).map((row, i) => ({
    ...row,
    label: lines[i]?.trim() || row.label,
  }));
  return { ...prev, rows, days: undefined, rowLabels: undefined };
}

export function setColumnCount(options: unknown, count: number): TeacherAvailabilityQuestionOptions {
  const prev = normalizeTeacherAvailabilityOptions(options);
  const n = Math.max(1, Math.min(20, Math.floor(count) || 1));
  return {
    ...prev,
    periods: n,
    periodLabels: normalizePeriodLabels(prev, n),
    periodTimes: normalizePeriodTimes(prev, n),
  };
}

export function setColumnLabelsFromLines(options: unknown, lines: string[]): TeacherAvailabilityQuestionOptions {
  const prev = normalizeTeacherAvailabilityOptions(options);
  const n = resolveColumnCount(prev);
  const periodLabels = Array.from({ length: n }, (_, i) => lines[i]?.trim() || formatLessonPeriodLabel(i + 1));
  return { ...prev, periodLabels };
}

export function setColumnTimesFromLines(options: unknown, lines: string[]): TeacherAvailabilityQuestionOptions {
  const prev = normalizeTeacherAvailabilityOptions(options);
  const n = resolveColumnCount(prev);
  const periodTimes = Array.from({ length: n }, (_, i) => lines[i]?.trim() ?? '');
  return { ...prev, periodTimes };
}

export function setFillVariants(options: unknown, variants: FillVariantConfig[]): TeacherAvailabilityQuestionOptions {
  const prev = normalizeTeacherAvailabilityOptions(options);
  return { ...prev, fillVariants: normalizeFillVariants(variants) };
}

export function addFillVariant(options: unknown): TeacherAvailabilityQuestionOptions {
  const prev = normalizeTeacherAvailabilityOptions(options);
  const variants = [...(prev.fillVariants ?? DEFAULT_FILL_VARIANTS)];
  const used = new Set(variants.map((v) => v.state));
  const nextState: AvailabilityCellState =
    !used.has('forbidden') ? 'forbidden' : !used.has('acceptable') ? 'acceptable' : 'allowed';
  variants.push({
    state: nextState,
    label: DEFAULT_FILL_VARIANTS.find((v) => v.state === nextState)?.label ?? nextState,
    formSelectable: false,
  });
  return { ...prev, fillVariants: variants };
}

export function updateFillVariantAt(
  options: unknown,
  index: number,
  patch: Partial<FillVariantConfig>,
): TeacherAvailabilityQuestionOptions {
  const prev = normalizeTeacherAvailabilityOptions(options);
  const variants = [...(prev.fillVariants ?? DEFAULT_FILL_VARIANTS)];
  if (index < 0 || index >= variants.length) return prev;
  variants[index] = { ...variants[index], ...patch };
  return { ...prev, fillVariants: normalizeFillVariants(variants) };
}

export function removeFillVariantAt(options: unknown, index: number): TeacherAvailabilityQuestionOptions {
  const prev = normalizeTeacherAvailabilityOptions(options);
  const variants = [...(prev.fillVariants ?? DEFAULT_FILL_VARIANTS)];
  if (variants.length <= 1 || index < 0 || index >= variants.length) return prev;
  variants.splice(index, 1);
  return { ...prev, fillVariants: variants };
}

export function rowLabelsToLines(options: unknown): string {
  return rowsFromOptions(normalizeTeacherAvailabilityOptions(options))
    .map((r) => r.label)
    .join('\n');
}

export function columnLabelsToLines(options: unknown): string {
  return normalizeTeacherAvailabilityOptions(options).periodLabels?.join('\n') ?? '';
}

export function columnTimesToLines(options: unknown): string {
  return normalizeTeacherAvailabilityOptions(options).periodTimes?.join('\n') ?? '';
}
