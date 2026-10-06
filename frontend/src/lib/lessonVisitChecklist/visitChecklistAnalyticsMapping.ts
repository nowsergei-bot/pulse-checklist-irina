import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import type { LessonVisitChecklistConfig, LessonVisitQuestion, LessonVisitSection } from './types';

/** Порядок уровней 10.1 (от слабого к сильному) для metric_ordinal_text. */
export const LESSON_VISIT_ORDINAL_LEVELS = [
  'Низкий',
  'Ниже среднего',
  'Средний',
  'Высокий',
  'Очень высокий',
] as const;

/** Разделы 1–10 «Чек-лист 4.0.xlsx». */
export const LESSON_VISIT_SECTION_DEFS: readonly {
  role: ColumnRole;
  code: string;
  title: string;
}[] = [
  { role: 'lesson_visit_sec_1', code: '1', title: 'Организационный блок' },
  { role: 'lesson_visit_sec_2', code: '2', title: 'Целеполагание' },
  { role: 'lesson_visit_sec_3', code: '3', title: 'Методическая и психолого-педагогическая грамотность' },
  { role: 'lesson_visit_sec_4', code: '4', title: 'Корректность и глубина понимания предметного содержания' },
  { role: 'lesson_visit_sec_5', code: '5', title: 'Результативность' },
  { role: 'lesson_visit_sec_6', code: '6', title: 'Мотивация и вовлеченность' },
  { role: 'lesson_visit_sec_7', code: '7', title: 'Воспитательный потенциал урока' },
  { role: 'lesson_visit_sec_8', code: '8', title: 'Инструменты' },
  { role: 'lesson_visit_sec_9', code: '9', title: 'Коммуникативная культура' },
  { role: 'lesson_visit_sec_10', code: '10', title: 'Общая оценка урока' },
] as const;

const VISIT_SCALE_SECTION_CODES = new Set(LESSON_VISIT_SECTION_DEFS.map((d) => d.code));

export function lessonVisitSectionHeader(def: (typeof LESSON_VISIT_SECTION_DEFS)[number]): string {
  return `${def.code} ${def.title}`;
}

export function rolesIncludeVisitChecklistSections(roles: ColumnRole[]): boolean {
  return roles.some((r) => r.startsWith('lesson_visit_sec_'));
}

type QuestionTarget =
  | ColumnRole
  | 'ordinal'
  | 'text_summary'
  | 'text_recommendations'
  | 'skip';

function visitSectionRoleForCode(code: string): ColumnRole | null {
  if (!VISIT_SCALE_SECTION_CODES.has(code)) return null;
  return `lesson_visit_sec_${code}` as ColumnRole;
}

/** Строки-навигация «если да — блок N» без собственного кода и без вариантов ответа. */
function isBranchingQuestion(q: LessonVisitQuestion): boolean {
  if (q.options.length > 0) return false;
  if (q.hint && /следующий блок|блок\s*\d/i.test(q.hint)) return true;
  if (!q.code && q.type === 'radio' && /следующий блок/i.test(q.text)) return true;
  return false;
}

export function resolveVisitQuestionTarget(
  q: LessonVisitQuestion,
  section: LessonVisitSection,
): QuestionTarget {
  if (q.type === 'text') {
    if (/возьму с собой/i.test(q.text) || q.code === '10.3') return 'text_recommendations';
    if (q.code === '10.2' || /общие выводы/i.test(q.text)) return 'text_summary';
    return 'text_summary';
  }

  if (
    q.code === '10.1' ||
    q.code === '7.9' ||
    /уровень представленного урока/i.test(q.text) ||
    /мастерств\w*\s*учител\w*\s*в\s*целом/i.test(q.text)
  ) {
    return 'ordinal';
  }
  if (isBranchingQuestion(q)) return 'skip';

  const secRole = section.code ? visitSectionRoleForCode(section.code) : null;
  if (secRole) return secRole;

  return 'skip';
}

export const LESSON_VISIT_ORDINAL_HEADER = '10.1 Оцените уровень представленного урока';

export const LESSON_VISIT_SUMMARY_HEADER =
  '10.2 Общие выводы: сформулируйте конкретные наблюдения (положительные моменты, зоны роста).';

export const LESSON_VISIT_RECOMMENDATIONS_HEADER = '10.3 Что я возьму с собой с этого урока?';

/** Заголовки таблицы для синхронизации с модулем «Аналитика уроков». */
export function buildLessonVisitAnalyticsHeaders(_checklist: LessonVisitChecklistConfig): string[] {
  const general = _checklist.generalFields.map((f) => f.label);
  const sections = LESSON_VISIT_SECTION_DEFS.map((d) => lessonVisitSectionHeader(d));
  return [
    'respondent_id',
    ...general,
    ...sections,
    LESSON_VISIT_ORDINAL_HEADER,
    LESSON_VISIT_SUMMARY_HEADER,
    LESSON_VISIT_RECOMMENDATIONS_HEADER,
  ];
}

/** Роли колонок — без эвристик autoMap (иначе чек-лист «разъезжается»). */
export function buildLessonVisitColumnRoles(headers: string[]): ColumnRole[] {
  const generalRoleByLabel: Record<string, ColumnRole> = {
    'дата посещения урока': 'date',
    'дата посещения': 'date',
    'фио посетившего урок (полностью)': 'filter_custom_1',
    'фио посетившего урок': 'filter_custom_1',
    'формат посещения урока': 'filter_format',
    класс: 'filter_class',
    предмет: 'filter_subject',
    кафедра: 'filter_custom_2',
    'фио педагога': 'filter_teacher_code',
    'фио учителя, проводившего урок': 'filter_teacher_code',
    'фио учителя': 'filter_teacher_code',
    'количество учеников на уроке': 'metric_numeric',
    'количество обучающихся на уроке': 'metric_numeric',
  };

  const sectionHeaders = new Map(
    LESSON_VISIT_SECTION_DEFS.map((d) => [lessonVisitSectionHeader(d), d.role]),
  );

  return headers.map((header, i) => {
    if (i === 0 && header === 'respondent_id') return 'id_row';

    const exactSection = sectionHeaders.get(header);
    if (exactSection) return exactSection;

    if (header === LESSON_VISIT_ORDINAL_HEADER) return 'metric_ordinal_text';
    if (header === LESSON_VISIT_SUMMARY_HEADER) return 'text_ai_summary';
    if (header === LESSON_VISIT_RECOMMENDATIONS_HEADER) return 'text_ai_recommendations';

    const norm = String(header ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const generalRole = generalRoleByLabel[norm];
    if (generalRole) return generalRole;

    return 'ignore';
  });
}

export function buildLessonVisitCustomLabels(): CustomFilterLabels {
  return {
    filter_custom_1: 'Посетивший урок',
    filter_custom_2: 'Кафедра',
  };
}

export function formatVisitAnswerPhrase(q: LessonVisitQuestion, raw: unknown): string {
  if (raw == null || raw === '') return '';
  const answer = Array.isArray(raw) ? raw.map(String).join('; ') : String(raw).trim();
  if (!answer) return '';
  const code = String(q.code ?? '').trim();
  if (code) return `${code} — ${answer}`;
  const short = String(q.text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 72);
  return short ? `${short}: ${answer}` : answer;
}
