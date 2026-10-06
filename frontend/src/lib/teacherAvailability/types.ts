/** Состояние ячейки сетки «рабочее время педагога». */
export type AvailabilityCellState = 'allowed' | 'acceptable' | 'forbidden';

export type AvailabilityDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Ответ: в JSON хранятся только отмеченные ячейки; пусто = можно вести урок. */
export type AvailabilityMatrix = Partial<
  Record<string, Partial<Record<string, AvailabilityCellState>>>
>;

export const AVAILABILITY_DAY_KEYS: AvailabilityDayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

export const AVAILABILITY_DAY_LABELS: Record<AvailabilityDayKey, string> = {
  mon: 'Пн',
  tue: 'Вт',
  wed: 'Ср',
  thu: 'Чт',
  fri: 'Пт',
  sat: 'Сб',
  sun: 'Вс',
};

export const DEFAULT_PERIOD_COUNT = 11;

export function defaultPeriods(count = DEFAULT_PERIOD_COUNT): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

/** Подпись столбца сетки (как в EduPage: «Урок 1», «Урок 2», …). */
export function formatLessonPeriodLabel(period: number): string {
  return `Урок ${period}`;
}

export type LessonPeriodHeader = {
  title: string;
  time?: string;
};

export type GridRowConfig = {
  key: string;
  label: string;
};

export type FillVariantConfig = {
  state: AvailabilityCellState;
  label: string;
  /** Доступен для отметки на публичной форме (по умолчанию только forbidden). */
  formSelectable?: boolean;
};

export interface TeacherAvailabilityQuestionOptions {
  /** Массив номеров уроков или одно число N уроков */
  periods?: number[] | number;
  periodLabels?: string[];
  /** Время урока по порядку (урок 1 → index 0), например «9:00 – 9:40» */
  periodTimes?: string[];
  /** @deprecated Используйте rows; сохранено для обратной совместимости */
  days?: AvailabilityDayKey[];
  /** Строки сетки: ключ в матрице ответа + подпись слева */
  rows?: GridRowConfig[];
  /** @deprecated Используйте rows[].label */
  rowLabels?: string[];
  gridTitlePrefix?: string;
  /** Показывать заголовок «Рабочее время — ФИО» над сеткой (публичная форма по умолчанию скрыта) */
  showGridTitle?: boolean;
  /** Варианты заполнения ячеек (подписи и доступность на форме) */
  fillVariants?: FillVariantConfig[];
}

export const STATE_LABEL_RU: Record<AvailabilityCellState, string> = {
  allowed: 'Можно провести занятие',
  acceptable: 'Допустимо',
  forbidden: 'Не могу провести занятие',
};

/** Подпись в легенде публичной формы (только отметка «не могу»). */
export const FORM_FORBIDDEN_LABEL_RU = 'Не могу провести занятие';

export const DEFAULT_FILL_VARIANTS: FillVariantConfig[] = [
  { state: 'forbidden', label: FORM_FORBIDDEN_LABEL_RU, formSelectable: true },
];

export type TeacherAvailabilityCellState = AvailabilityCellState;
export type TeacherAvailabilityDayKey = AvailabilityDayKey;
export type TeacherAvailabilityMatrix = AvailabilityMatrix;
export const TEACHER_AVAILABILITY_DAYS = AVAILABILITY_DAY_KEYS;
export const TEACHER_AVAILABILITY_DAY_LABELS = AVAILABILITY_DAY_LABELS;
export const DEFAULT_TEACHER_AVAILABILITY_PERIODS = DEFAULT_PERIOD_COUNT;
export type TeacherWorkingTimeQuestionOptions = TeacherAvailabilityQuestionOptions;
