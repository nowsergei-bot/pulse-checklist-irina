import { hasStaffSessionHint } from '../staffSession';
import { getUserAnalyticsWorkspaceCache, scheduleUserAnalyticsWorkspacePatch } from '../userAnalyticsWorkspace';

/** Роли колонок — см. docs/ANALYTICS_EXCEL_MAPPING.md */
export type ColumnRole =
  | 'ignore'
  | 'date'
  | 'row_label'
  | 'filter_teacher_code'
  | 'filter_parallel'
  | 'filter_class'
  | 'filter_subject'
  | 'filter_format'
  | 'filter_custom_1'
  | 'filter_custom_2'
  | 'filter_custom_3'
  | 'metric_numeric'
  | 'metric_ordinal_text'
  | 'text_ai_summary'
  | 'text_ai_recommendations'
  | 'text_list_features'
  | 'id_row'
  /** Уровни 0–4 в ячейке через запятую (свод по блоку рубрики) — модуль «Аналитика уроков». */
  | 'lesson_comp_scale_org_tech'
  | 'lesson_comp_scale_methodology'
  | 'lesson_comp_scale_general'
  | 'lesson_comp_scale_rapport'
  | 'lesson_comp_scale_misc'
  | 'lesson_comp_scale_summary'
  /** Разделы 1–10 чек-листа 4.0 (формулировки пунктов через запятую). */
  | 'lesson_visit_sec_1'
  | 'lesson_visit_sec_2'
  | 'lesson_visit_sec_3'
  | 'lesson_visit_sec_4'
  | 'lesson_visit_sec_5'
  | 'lesson_visit_sec_6'
  | 'lesson_visit_sec_7'
  | 'lesson_visit_sec_8'
  | 'lesson_visit_sec_9'
  | 'lesson_visit_sec_10';

export const COLUMN_ROLE_OPTIONS: { value: ColumnRole; label: string; group: string }[] = [
  {
    value: 'ignore',
    label: 'Исключить из дашборда',
    group: 'Дополнительно',
  },
  {
    value: 'id_row',
    label: 'Номер строки в источнике (одинаковый № = одна запись для счётчиков и графиков)',
    group: 'Дополнительно',
  },
  { value: 'date', label: 'Дата', group: 'Время и подпись' },
  { value: 'row_label', label: 'Подпись строки', group: 'Время и подпись' },
  { value: 'filter_teacher_code', label: 'Педагог', group: 'Фильтры' },
  { value: 'filter_parallel', label: 'Параллель', group: 'Фильтры' },
  { value: 'filter_class', label: 'Класс', group: 'Фильтры' },
  { value: 'filter_subject', label: 'Предмет / тема', group: 'Фильтры' },
  { value: 'filter_format', label: 'Формат', group: 'Фильтры' },
  { value: 'filter_custom_1', label: 'Доп. фильтр 1', group: 'Фильтры' },
  { value: 'filter_custom_2', label: 'Доп. фильтр 2', group: 'Фильтры' },
  { value: 'filter_custom_3', label: 'Доп. фильтр 3', group: 'Фильтры' },
  { value: 'metric_numeric', label: 'Числовой пункт (больше = лучше)', group: 'Метрики' },
  { value: 'metric_ordinal_text', label: 'Текстовая шкала', group: 'Метрики' },
  { value: 'text_ai_summary', label: 'Текст: выводы / резюме', group: 'Тексты' },
  { value: 'text_ai_recommendations', label: 'Текст: рекомендации', group: 'Тексты' },
  {
    value: 'text_list_features',
    label: 'Список через запятую (отмеченные на уроке аспекты / «пойнты»)',
    group: 'Тексты',
  },
  {
    value: 'lesson_comp_scale_org_tech',
    label:
      'Компетенции 0–4 (в ячейке числа 0–4 через запятую): орг.-тех. условия // Organisational and technical conditions',
    group: 'Аналитика уроков · шкала 0–4',
  },
  {
    value: 'lesson_comp_scale_methodology',
    label: 'Компетенции 0–4 (через запятую): методика // Lesson methodology',
    group: 'Аналитика уроков · шкала 0–4',
  },
  {
    value: 'lesson_comp_scale_general',
    label: 'Компетенции 0–4 (через запятую): общекультурные компетенции // General performance',
    group: 'Аналитика уроков · шкала 0–4',
  },
  {
    value: 'lesson_comp_scale_rapport',
    label: 'Компетенции 0–4 (через запятую): взаимодействие // Teacher-student rapport',
    group: 'Аналитика уроков · шкала 0–4',
  },
  {
    value: 'lesson_comp_scale_misc',
    label: 'Компетенции 0–4 (через запятую): дополнительные // Miscellaneous',
    group: 'Аналитика уроков · шкала 0–4',
  },
  {
    value: 'lesson_comp_scale_summary',
    label:
      'Компетенции 0–4 (через запятую): итоговая строка рубрики «выводы» — не путать с текстовым столбцом выводов ниже',
    group: 'Аналитика уроков · шкала 0–4',
  },
  {
    value: 'lesson_visit_sec_1',
    label: 'Чек-лист · §1 Организационный блок',
    group: 'Чек-лист посещения урока',
  },
  {
    value: 'lesson_visit_sec_2',
    label: 'Чек-лист · §2 Целеполагание',
    group: 'Чек-лист посещения урока',
  },
  {
    value: 'lesson_visit_sec_3',
    label: 'Чек-лист · §3 Методическая и психолого-педагогическая грамотность',
    group: 'Чек-лист посещения урока',
  },
  {
    value: 'lesson_visit_sec_4',
    label: 'Чек-лист · §4 Предметное содержание',
    group: 'Чек-лист посещения урока',
  },
  {
    value: 'lesson_visit_sec_5',
    label: 'Чек-лист · §5 Результативность',
    group: 'Чек-лист посещения урока',
  },
  {
    value: 'lesson_visit_sec_6',
    label: 'Чек-лист · §6 Мотивация и вовлечённость',
    group: 'Чек-лист посещения урока',
  },
  {
    value: 'lesson_visit_sec_7',
    label: 'Чек-лист · §7 Воспитательный потенциал',
    group: 'Чек-лист посещения урока',
  },
  {
    value: 'lesson_visit_sec_8',
    label: 'Чек-лист · §8 Инструменты',
    group: 'Чек-лист посещения урока',
  },
  {
    value: 'lesson_visit_sec_9',
    label: 'Чек-лист · §9 Коммуникативная культура',
    group: 'Чек-лист посещения урока',
  },
  {
    value: 'lesson_visit_sec_10',
    label: 'Чек-лист · §10 Общая оценка урока',
    group: 'Чек-лист посещения урока',
  },
];

export function roleAllowsDuplicate(role: ColumnRole): boolean {
  return role === 'ignore' || role === 'metric_numeric' || role.startsWith('text_');
}

export function validateRoles(roles: ColumnRole[]): { ok: boolean; message?: string } {
  const seen = new Set<ColumnRole>();
  for (const r of roles) {
    if (roleAllowsDuplicate(r)) continue;
    if (seen.has(r)) {
      return { ok: false, message: `Роль «${COLUMN_ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r}» назначена более чем одной колонке.` };
    }
    seen.add(r);
  }
  const hasMetric = roles.some((r) => r === 'metric_numeric' || r === 'metric_ordinal_text');
  const hasDate = roles.includes('date');
  const hasText = roles.some((r) => r.startsWith('text_'));
  const hasLessonCompScale = roles.some((r) => r.startsWith('lesson_comp_scale_'));
  const hasVisitSections = roles.some((r) => r.startsWith('lesson_visit_sec_'));
  if (!hasMetric && !hasDate && !hasText && !hasLessonCompScale && !hasVisitSections) {
    return {
      ok: false,
      message:
        'Укажите хотя бы одну дату, числовую/шкальную метрику, текстовое поле или столбец шкалы компетенций (0–4).',
    };
  }
  return { ok: true };
}

export type CustomFilterLabels = {
  filter_custom_1?: string;
  filter_custom_2?: string;
  filter_custom_3?: string;
};

export type SavedMappingTemplate = {
  id: string;
  name: string;
  /** нормализованный заголовок → роль */
  headerMap: Record<string, ColumnRole>;
  customLabels: CustomFilterLabels;
  createdAt: string;
};

const LS_TEMPLATES = 'pulse_excel_analytics_templates_v1';

export function loadTemplates(): SavedMappingTemplate[] {
  const w = getUserAnalyticsWorkspaceCache().excelTemplates;
  if (Array.isArray(w) && w.length) {
    return w.filter((x) => x && typeof x === 'object' && typeof (x as SavedMappingTemplate).name === 'string') as SavedMappingTemplate[];
  }
  try {
    const raw = localStorage.getItem(LS_TEMPLATES);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter((x) => x && typeof x === 'object' && typeof (x as SavedMappingTemplate).name === 'string') as SavedMappingTemplate[];
  } catch {
    return [];
  }
}

export function saveTemplates(list: SavedMappingTemplate[]): void {
  const filtered = list.filter((x) => x && typeof x === 'object' && typeof (x as SavedMappingTemplate).name === 'string') as SavedMappingTemplate[];
  if (typeof localStorage !== 'undefined' && !hasStaffSessionHint()) {
    localStorage.setItem(LS_TEMPLATES, JSON.stringify(filtered));
    return;
  }
  scheduleUserAnalyticsWorkspacePatch({ excelTemplates: filtered });
}

export function normalizeHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
