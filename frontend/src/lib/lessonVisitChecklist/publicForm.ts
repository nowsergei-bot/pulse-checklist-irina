import { VISIT_FORMAT_SELF_ANALYSIS } from './normalizeChecklist.ts';
import type { LessonVisitChecklistConfig, LessonVisitDirectory } from './types.ts';

/** Старый 9-блочный проект 2026 — не использовать в кабинете. */
const LEGACY_2026_FORM_TOKEN = 'be57bd59186a4b30b467c9d2eb6b4b49';

function viteFormToken(): string {
  try {
    const env = (import.meta as ImportMeta & { env?: { VITE_LESSON_VISIT_FORM_TOKEN?: string } }).env;
    const token = String(env?.VITE_LESSON_VISIT_FORM_TOKEN || '').trim();
    if (!token || token === LEGACY_2026_FORM_TOKEN) return '';
    return token;
  } catch {
    return '';
  }
}

/** Env-only public form token. Cabinet loads the live token from GET /api/public/lesson-visit-form/latest. */
export const LESSON_VISIT_PUBLIC_FORM_TOKEN = viteFormToken();

export const VISIT_FORMAT_QUERY = 'format';

/** In-cabinet fill — PulseCabinetShell stays. Public share links keep `lessonVisitPublicFormPath`. */
export const VISIT_CHECKLIST_FORM_PATH = '/cabinet/feedback/form';

export type LessonVisitPublicFormPathOpts = {
  token?: string;
  format?: string | null;
};

export function lessonVisitPublicFormPath(opts?: LessonVisitPublicFormPathOpts): string {
  const token = String(opts?.token || LESSON_VISIT_PUBLIC_FORM_TOKEN).trim();
  const format = String(opts?.format || '').trim();
  if (!token) {
    if (!format) return VISIT_CHECKLIST_FORM_PATH;
    const q = new URLSearchParams({ [VISIT_FORMAT_QUERY]: format });
    return `${VISIT_CHECKLIST_FORM_PATH}?${q.toString()}`;
  }
  const base = `/view/lesson-visit/${encodeURIComponent(token)}`;
  if (!format) return base;
  const q = new URLSearchParams({ [VISIT_FORMAT_QUERY]: format });
  return `${base}?${q.toString()}`;
}

export function lessonVisitSelfAnalysisFormPath(token?: string): string {
  return lessonVisitPublicFormPath({ token, format: VISIT_FORMAT_SELF_ANALYSIS });
}

export function lessonVisitCabinetFormPath(opts?: LessonVisitPublicFormPathOpts & { base?: string }): string {
  const raw = String(opts?.base || VISIT_CHECKLIST_FORM_PATH).trim() || VISIT_CHECKLIST_FORM_PATH;
  const hashAt = raw.indexOf('#');
  const href = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const hash = hashAt >= 0 ? raw.slice(hashAt) : '';
  const qAt = href.indexOf('?');
  const path = qAt >= 0 ? href.slice(0, qAt) : href;
  const q = new URLSearchParams(qAt >= 0 ? href.slice(qAt + 1) : '');
  const format = String(opts?.format || '').trim();
  const token = String(opts?.token || '').trim();
  if (format) q.set(VISIT_FORMAT_QUERY, format);
  if (token) q.set('token', token);
  const qs = q.toString();
  return `${path}${qs ? `?${qs}` : ''}${hash}`;
}

export function lessonVisitCabinetSelfAnalysisFormPath(opts?: { token?: string; base?: string }): string {
  return lessonVisitCabinetFormPath({
    token: opts?.token,
    format: VISIT_FORMAT_SELF_ANALYSIS,
    base: opts?.base,
  });
}

export function isVisitChecklistCabinetFormPath(pathname: string): boolean {
  const norm = pathname.replace(/^\/cabinet\/as/, '/cabinet').replace(/\/+$/, '') || '/';
  return norm === VISIT_CHECKLIST_FORM_PATH || norm.startsWith(`${VISIT_CHECKLIST_FORM_PATH}/`);
}

const SELF_ANALYSIS_ALIASES = new Set(['самоанализ', 'self', 'self-analysis', 'samoanaliz']);

export function preferredVisitFormatFromQuery(raw?: string | null, options?: string[] | null): string | null {
  const q = String(raw || '').trim();
  if (!q) return null;
  const opts = Array.isArray(options) ? options.filter((o) => String(o || '').trim()) : [];
  const lower = q.toLowerCase();
  const fromOptions = opts.find((o) => o.toLowerCase() === lower);
  if (fromOptions) return fromOptions;
  if (SELF_ANALYSIS_ALIASES.has(lower)) {
    const self = opts.find((o) => o === VISIT_FORMAT_SELF_ANALYSIS || o.toLowerCase() === VISIT_FORMAT_SELF_ANALYSIS.toLowerCase());
    return self || VISIT_FORMAT_SELF_ANALYSIS;
  }
  return null;
}

const LEADERSHIP_DEPARTMENT_NAME = 'кафедра лидерства';
/** Пункты формы 4.1, скрытые для учителей кафедры лидерства (лист «Исключения»). */
export const LEADERSHIP_HIDDEN_QUESTION_CODES = ['5.4'];

/**
 * Форма, которую видит наблюдатель: для учителя кафедры лидерства пункт 5.4 скрыт.
 * Кафедра берётся по выбранному учителю из справочника, иначе по полю «Кафедра».
 */
export function visibleLessonVisitChecklist(
  checklist: LessonVisitChecklistConfig,
  general: Record<string, string>,
  directory: LessonVisitDirectory | null | undefined,
): LessonVisitChecklistConfig {
  if (checklist.formVersion !== '4.1') return checklist;
  const teacher = directory?.teachers.find((t) => t.id === general.teacher_id);
  const departmentId = teacher?.departmentId || general.department_id || '';
  const departmentName = directory?.departments.find((d) => d.id === departmentId)?.name || '';
  if (departmentName.trim().toLocaleLowerCase('ru') !== LEADERSHIP_DEPARTMENT_NAME) return checklist;
  const sections = checklist.sections
    .map((sec) => ({
      ...sec,
      questions: sec.questions.filter((q) => !LEADERSHIP_HIDDEN_QUESTION_CODES.includes(q.code)),
    }))
    .filter((sec) => sec.questions.length > 0);
  return { ...checklist, sections };
}

/** Ответы только на видимые вопросы формы. */
export function answersForVisibleQuestions(
  checklist: LessonVisitChecklistConfig,
  answers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const visible = new Set(checklist.sections.flatMap((sec) => sec.questions.map((q) => q.id)));
  return Object.fromEntries(Object.entries(answers).filter(([id]) => visible.has(id)));
}

// ---------------------------------------------------------------------------
/**
 * Чек-лист феноменального урока / Phenomenon-based lesson checklist.
 * Формулировки и баллы взяты из таблицы «Чек-лист феноменального урока RU-EN».
 * Ответы хранятся по идентификаторам вопросов и вариантов, поэтому записи на русском
 * и английском совпадают. Баллы наблюдателю на форме не показываются.
 */

export type PhenomenonLocale = 'ru' | 'en';

export type Bilingual = { ru: string; en: string };

export type PhenomenonOption = {
  id: string;
  label: Bilingual;
  /** null: вариант без баллов. */
  score: number | null;
};

export type PhenomenonChoiceItem = {
  id: string;
  kind: 'choice';
  title: Bilingual;
  scored: boolean;
  options: PhenomenonOption[];
};

export const PHENOMENON_FORM_VERSION = 'phenomenon-2026-11';
export const PHENOMENON_MAX_SCORE = 22;

/** Постоянный адрес формы. По нему сервер находит (и при первом обращении создаёт) отдельный проект. */
export const PHENOMENON_FORM_TOKEN = 'phenomenon-lesson-2026';

/**
 * ПЕРЕКЛЮЧАТЕЛЬ. false: форма видна только участникам пробного доступа (список на сервере),
 * остальным «Раздел пока недоступен». true: форма открыта всем. Значение должно совпадать с
 * PHENOMENON_OPEN_FOR_ALL в backend/functions/lib/lesson-visit-checklist.js (проверяется тестом).
 */
export const PHENOMENON_OPEN_FOR_ALL = false;

const ACCESS_KEY = 'pulse_phenomenon_checklist_access';

/** Ответ сервера о пробном доступе, запомненный на время сессии вкладки. */
export function readCachedPhenomenonAccess(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(ACCESS_KEY) === '1';
  } catch {
    return false;
  }
}

export function cachePhenomenonAccess(allowed: boolean): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (allowed) sessionStorage.setItem(ACCESS_KEY, '1');
    else sessionStorage.removeItem(ACCESS_KEY);
  } catch {
    /* без запоминания пункт меню появится после открытия формы по кнопке */
  }
}

/** Виден ли пункт меню прямо сейчас (меню строится без запросов к серверу). */
export function phenomenonMenuVisible(): boolean {
  return PHENOMENON_OPEN_FOR_ALL || readCachedPhenomenonAccess();
}

/** Значение параметра ?form= на странице чек-листа в кабинете. */
export const PHENOMENON_FORM_QUERY_VALUE = 'phenomenon';

export const PHENOMENON_TITLE: Bilingual = {
  ru: 'Чек-лист феноменального урока',
  en: 'Phenomenon-based lesson checklist',
};

export const PHENOMENON_SECTIONS = {
  registration: { ru: 'Регистрационные данные', en: 'Lesson details' },
  evaluation: { ru: 'Оценивание урока', en: 'Lesson evaluation' },
  overall: { ru: 'Общая оценка', en: 'Overall assessment' },
} satisfies Record<string, Bilingual>;

export type PhenomenonGeneralFieldId =
  | 'date'
  | 'observer_name'
  | 'class_name'
  | 'students_count'
  | 'lesson_number'
  | 'teacher1'
  | 'teacher2';

export const PHENOMENON_GENERAL_LABELS: Record<PhenomenonGeneralFieldId, Bilingual> = {
  date: { ru: 'Дата посещения', en: 'Date' },
  observer_name: { ru: 'ФИО посетившего урок', en: 'Your full name' },
  class_name: { ru: 'Класс', en: 'Class' },
  students_count: { ru: 'Количество обучающихся на уроке', en: 'Number of students present' },
  lesson_number: { ru: '№ урока', en: 'Period' },
  teacher1: { ru: 'ФИО первого педагога', en: 'Teacher 1 (full name)' },
  teacher2: { ru: 'ФИО второго педагога', en: 'Teacher 2 (full name)' },
};

export const PHENOMENON_ITEMS: PhenomenonChoiceItem[] = [
  {
    id: 'ph_org',
    kind: 'choice',
    scored: true,
    title: {
      ru: 'Организационно-технические условия (наличие плана урока, готовность кабинета, раздаточные материалы)',
      en: 'Organisation and resources (lesson plan available, classroom ready, handouts prepared)',
    },
    options: [
      { id: 'none', score: 0, label: { ru: 'условия не выполнены', en: 'not in place' } },
      { id: 'partly', score: 1, label: { ru: 'условия выполнены частично', en: 'partly in place' } },
      { id: 'full', score: 2, label: { ru: 'условия выполнены полностью', en: 'fully in place' } },
    ],
  },
  {
    id: 'ph_objectives',
    kind: 'choice',
    scored: true,
    title: { ru: 'Целеполагание урока', en: 'Lesson objectives' },
    options: [
      { id: 'none', score: 0, label: { ru: 'цели урока не сформулированы', en: 'no objectives were set' } },
      { id: 'teachers', score: 2, label: { ru: 'цели урока сформулированы учителями', en: 'set by the teachers' } },
      {
        id: 'joint',
        score: 3,
        label: { ru: 'цели урока сформулированы совместно с учащимися', en: 'set jointly with the students' },
      },
      { id: 'students', score: 3, label: { ru: 'цели урока сформулированы учащимися', en: 'set by the students' } },
    ],
  },
  {
    id: 'ph_method',
    kind: 'choice',
    scored: true,
    title: { ru: 'Методическая грамотность урока', en: 'Teaching methodology' },
    options: [
      { id: 'none', score: 0, label: { ru: 'структура урока не прослеживается', en: 'no clear lesson structure' } },
      {
        id: 'frontal',
        score: 1,
        label: {
          ru: 'структура урока есть, но работа в основном фронтальная (преобладает лекционный формат)',
          en: 'the lesson has a structure, but it is mostly whole-class, teacher-led work (largely lecture-style)',
        },
      },
      {
        id: 'varied',
        score: 2,
        label: {
          ru: 'структура урока чёткая, формы и методы работы сменяются',
          en: 'clear structure with a variety of activities and methods',
        },
      },
    ],
  },
  {
    id: 'ph_phenomenon',
    kind: 'choice',
    scored: true,
    title: {
      ru: 'Раскрытие феномена «Эпохи России»',
      en: 'Exploring the phenomenon “Epochs of Russia”',
    },
    options: [
      { id: 'none', score: 0, label: { ru: 'феномен не раскрыт', en: 'the phenomenon was not explored' } },
      {
        id: 'parallel',
        score: 2,
        label: {
          ru: 'феномен назван, но предметы идут параллельно, без связи, или раскрыт только через один предмет',
          en: 'the phenomenon was mentioned, but the two subjects ran in parallel without any connection, or it was explored through one subject only',
        },
      },
      {
        id: 'teachers_link',
        score: 4,
        label: {
          ru: 'феномен раскрыт через оба предмета, связь между ними объясняют учителя',
          en: 'the phenomenon was explored through both subjects, with the teachers explaining the links between them',
        },
      },
      {
        id: 'students_link',
        score: 6,
        label: {
          ru: 'учащиеся сами связывают знания двух предметов и формулируют вывод о феномене',
          en: 'students themselves connected knowledge from both subjects and drew their own conclusions about the phenomenon',
        },
      },
    ],
  },
  {
    id: 'ph_coteaching',
    kind: 'choice',
    scored: true,
    title: { ru: 'Взаимодействие педагогов', en: 'Co-teaching' },
    options: [
      {
        id: 'turns',
        score: 0,
        label: {
          ru: 'учителя ведут урок по очереди, каждый свою часть; переходы между частями формальные',
          en: 'the teachers took turns, each teaching their own part; the transitions between parts were mechanical',
        },
      },
      {
        id: 'complement',
        score: 2,
        label: {
          ru: 'учителя дополняют друг друга, оба работают на протяжении всего урока',
          en: 'the teachers complemented each other and were both actively involved throughout the lesson',
        },
      },
    ],
  },
  {
    id: 'ph_tools',
    kind: 'choice',
    scored: false,
    title: {
      ru: 'Использование дополнительных инструментов (цифровые средства, наглядность)',
      en: 'Use of additional tools (digital tools, visual aids)',
    },
    options: [
      { id: 'high', score: null, label: { ru: 'использовались на высоком уровне', en: 'used very effectively' } },
      { id: 'medium', score: null, label: { ru: 'использовались на среднем уровне', en: 'used fairly effectively' } },
      { id: 'low', score: null, label: { ru: 'использовались на низком уровне', en: 'used ineffectively' } },
      {
        id: 'missing_hurt',
        score: null,
        label: {
          ru: 'не использовались, что снизило качество урока',
          en: 'not used, which lowered the quality of the lesson',
        },
      },
      {
        id: 'not_needed',
        score: null,
        label: {
          ru: 'не использовались ввиду специфики урока',
          en: 'not used, as the lesson did not require them',
        },
      },
    ],
  },
  {
    id: 'ph_reflection',
    kind: 'choice',
    scored: true,
    title: { ru: 'Рефлексия', en: 'Reflection' },
    options: [
      { id: 'none', score: 0, label: { ru: 'рефлексия не проводилась', en: 'no reflection took place' } },
      {
        id: 'formal',
        score: 1,
        label: {
          ru: 'рефлексия формальная («понравилось?», «что запомнили?»)',
          en: 'superficial reflection ("Did you enjoy it?", "What do you remember?")',
        },
      },
      {
        id: 'meaningful',
        score: 2,
        label: {
          ru: 'учащиеся соотносят результат с целью урока или с феноменом: что получилось, что нет',
          en: 'students compared their results with the lesson objectives or the phenomenon: what worked and what did not',
        },
      },
    ],
  },
  {
    id: 'ph_engagement',
    kind: 'choice',
    scored: true,
    title: { ru: 'Вовлечённость', en: 'Student engagement' },
    options: [
      { id: 'all', score: 3, label: { ru: '100% обучающихся вовлечены в урок', en: 'all students were actively engaged' } },
      {
        id: 'most',
        score: 2,
        label: {
          ru: 'вовлечено большинство обучающихся (не менее ¾ класса)',
          en: 'most students were engaged (at least three quarters of the class)',
        },
      },
      {
        id: 'some',
        score: 1,
        label: {
          ru: 'вовлечена только часть класса, большинство пассивны',
          en: 'only some students were engaged; most remained passive',
        },
      },
      { id: 'none', score: 0, label: { ru: 'массовое отсутствие вовлечённости', en: 'widespread lack of engagement' } },
    ],
  },
  {
    id: 'ph_communication',
    kind: 'choice',
    scored: true,
    title: {
      ru: 'Коммуникативная культура учителей (грамотная речь, уважительное обращение, создание благоприятной атмосферы)',
      en: "Teachers' communication (accurate speech, respectful manner, positive classroom climate)",
    },
    options: [
      {
        id: 'poor',
        score: 0,
        label: {
          ru: 'некорректное обращение к учащимся, речевые ошибки или напряжённая атмосфера',
          en: 'inappropriate manner towards students, speech errors or a tense atmosphere',
        },
      },
      {
        id: 'formal',
        score: 1,
        label: {
          ru: 'обращение уважительное, но атмосфера формальная, учащимся мало дают высказаться',
          en: 'respectful manner, but a formal atmosphere; students had few chances to speak',
        },
      },
      {
        id: 'good',
        score: 2,
        label: {
          ru: 'грамотная речь, уважительное обращение, учащиеся свободно задают вопросы и высказываются',
          en: 'accurate speech and a respectful manner; students freely asked questions and shared their views',
        },
      },
    ],
  },
];

export const PHENOMENON_OVERALL: PhenomenonChoiceItem = {
  id: 'ph_overall',
  kind: 'choice',
  scored: false,
  title: { ru: 'Оценка урока наблюдателем', en: 'Your overall rating of the lesson' },
  options: [
    { id: 'very_high', score: null, label: { ru: 'очень высокий', en: 'very high' } },
    { id: 'high', score: null, label: { ru: 'высокий', en: 'high' } },
    { id: 'average', score: null, label: { ru: 'средний', en: 'average' } },
    { id: 'below_average', score: null, label: { ru: 'ниже среднего', en: 'below average' } },
    { id: 'low', score: null, label: { ru: 'низкий', en: 'low' } },
  ],
};

export const PHENOMENON_MASTERY_IDS = ['ph_mastery_1', 'ph_mastery_2'] as const;
export type PhenomenonMasteryId = (typeof PHENOMENON_MASTERY_IDS)[number];

export const PHENOMENON_MASTERY_TITLE: Record<PhenomenonMasteryId, Bilingual> = {
  ph_mastery_1: {
    ru: 'Уровень профессионально-методического мастерства: [ФИО первого педагога]',
    en: "Teaching expertise: [Teacher 1's name]",
  },
  ph_mastery_2: {
    ru: 'Уровень профессионально-методического мастерства: [ФИО второго педагога]',
    en: "Teaching expertise: [Teacher 2's name]",
  },
};

export const PHENOMENON_MASTERY_GUIDE_TITLE: Bilingual = {
  ru: 'Как оценивать мастерство',
  en: 'How to rate teaching expertise',
};

export const PHENOMENON_MASTERY_SCALE: Bilingual = { ru: 'шкала от 1 до 10', en: 'scale from 1 to 10' };

export const PHENOMENON_MASTERY_BANDS: Array<{ range: string; text: Bilingual }> = [
  {
    range: '1-3',
    text: {
      ru: 'урок держится на втором учителе, методические ошибки, феномен в своей части не раскрыт',
      en: 'relies on the other teacher, makes methodological errors, does not address the phenomenon in their part',
    },
  },
  {
    range: '4-6',
    text: {
      ru: 'свою часть ведёт уверенно, но без связи с другим предметом',
      en: 'teaches their own part confidently, but without links to the other subject',
    },
  },
  {
    range: '7-8',
    text: {
      ru: 'связывает свой предмет с феноменом и с частью второго учителя, работает со всем классом',
      en: "links their subject to the phenomenon and to the other teacher's part, works with the whole class",
    },
  },
  {
    range: '9-10',
    text: {
      ru: 'может служить образцом: глубина предмета, точные приёмы, учащиеся сами выходят на выводы',
      en: 'a model for colleagues: deep subject knowledge, well-chosen techniques, students reach conclusions on their own',
    },
  },
];

export const PHENOMENON_COMMENTS_ID = 'ph_comments';
export const PHENOMENON_COMMENTS_TITLE: Bilingual = {
  ru: 'Общие выводы по уроку',
  en: 'General comments on the lesson',
};

export const PHENOMENON_UI: Record<
  PhenomenonLocale,
  {
    submit: string;
    submitting: string;
    thanksTitle: string;
    thanksBody: string;
    again: string;
    required: string;
    teacherPlaceholder: string;
    observerPlaceholder: string;
    sameTeacher: string;
    pickTeacherFirst: string;
    missingTitle: string;
    loading: string;
    unavailable: string;
    closed: string;
    optional: string;
  }
> = {
  ru: {
    submit: 'Отправить чек-лист',
    submitting: 'Отправка…',
    thanksTitle: 'Спасибо!',
    thanksBody: 'Чек-лист отправлен.',
    again: 'Заполнить ещё раз',
    required: 'Обязательное поле',
    teacherPlaceholder: 'Начните вводить фамилию педагога…',
    observerPlaceholder: 'Начните вводить фамилию…',
    sameTeacher: 'Первый и второй педагог должны быть разными.',
    pickTeacherFirst: 'Сначала выберите педагога в регистрационных данных.',
    missingTitle: 'Заполните обязательные поля:',
    loading: 'Загрузка чек-листа…',
    unavailable: 'Чек-лист недоступен',
    closed: 'Раздел пока недоступен',
    optional: 'необязательно',
  },
  en: {
    submit: 'Submit checklist',
    submitting: 'Submitting…',
    thanksTitle: 'Thank you!',
    thanksBody: 'Your checklist has been submitted.',
    again: 'Fill in another one',
    required: 'Required',
    teacherPlaceholder: "Start typing the teacher's surname…",
    observerPlaceholder: 'Start typing your surname…',
    sameTeacher: 'Teacher 1 and Teacher 2 must be different people.',
    pickTeacherFirst: 'Please select the teacher in Lesson details first.',
    missingTitle: 'Please complete the required fields:',
    loading: 'Loading checklist…',
    unavailable: 'Checklist unavailable',
    closed: 'This section is not available yet',
    optional: 'optional',
  },
};

export type PhenomenonGeneral = {
  date: string;
  observer_name: string;
  class_name: string;
  students_count: string;
  lesson_number: string;
  teacher1_id: string;
  teacher1_name: string;
  teacher2_id: string;
  teacher2_name: string;
};

export type PhenomenonAnswers = Record<string, string>;

export type PhenomenonSubmission = {
  general: PhenomenonGeneral & { kind: 'phenomenon'; form_version: string };
  answers: PhenomenonAnswers;
};

export function todayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function emptyPhenomenonGeneral(now: Date = new Date(), observerName = ''): PhenomenonGeneral {
  return {
    date: todayIsoDate(now),
    observer_name: observerName,
    class_name: '',
    students_count: '',
    lesson_number: '',
    teacher1_id: '',
    teacher1_name: '',
    teacher2_id: '',
    teacher2_name: '',
  };
}

export function pick(text: Bilingual, locale: PhenomenonLocale): string {
  return locale === 'en' ? text.en : text.ru;
}

/** Текст вопроса о мастерстве с ФИО выбранного педагога вместо заглушки. */
export function masteryQuestionText(id: PhenomenonMasteryId, locale: PhenomenonLocale, teacherName: string): string {
  const raw = pick(PHENOMENON_MASTERY_TITLE[id], locale);
  const fallback: Record<PhenomenonMasteryId, Bilingual> = {
    ph_mastery_1: { ru: 'первый педагог', en: 'Teacher 1' },
    ph_mastery_2: { ru: 'второй педагог', en: 'Teacher 2' },
  };
  const name = String(teacherName || '').trim() || pick(fallback[id], locale);
  return raw.replace(/\[[^\]]+\]/, name);
}

export function teacherNameFor(id: PhenomenonMasteryId, general: Pick<PhenomenonGeneral, 'teacher1_name' | 'teacher2_name'>): string {
  return id === 'ph_mastery_1' ? general.teacher1_name : general.teacher2_name;
}

function personKey(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sameTeacherChosen(general: Pick<PhenomenonGeneral, 'teacher1_id' | 'teacher1_name' | 'teacher2_id' | 'teacher2_name'>): boolean {
  const a = general.teacher1_id || personKey(general.teacher1_name);
  const b = general.teacher2_id || personKey(general.teacher2_name);
  if (!a || !b) return false;
  if (a === b) return true;
  return Boolean(personKey(general.teacher1_name)) && personKey(general.teacher1_name) === personKey(general.teacher2_name);
}

export type PhenomenonMissing = { id: string; label: string };

/** Все поля обязательны, кроме «Общих выводов». */
export function collectPhenomenonMissing(
  general: PhenomenonGeneral,
  answers: PhenomenonAnswers,
  locale: PhenomenonLocale,
): PhenomenonMissing[] {
  const missing: PhenomenonMissing[] = [];
  const g = (id: PhenomenonGeneralFieldId, value: string) => {
    if (!String(value || '').trim()) missing.push({ id: `general-${id}`, label: pick(PHENOMENON_GENERAL_LABELS[id], locale) });
  };
  g('date', general.date);
  g('observer_name', general.observer_name);
  g('class_name', general.class_name);
  g('students_count', general.students_count);
  g('lesson_number', general.lesson_number);
  g('teacher1', general.teacher1_name);
  g('teacher2', general.teacher2_name);
  for (const item of [...PHENOMENON_ITEMS, PHENOMENON_OVERALL]) {
    const v = answers[item.id];
    if (!v || !item.options.some((o) => o.id === v)) missing.push({ id: `question-${item.id}`, label: pick(item.title, locale) });
  }
  for (const id of PHENOMENON_MASTERY_IDS) {
    const n = Number(answers[id]);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      missing.push({ id: `question-${id}`, label: masteryQuestionText(id, locale, teacherNameFor(id, general)) });
    }
  }
  return missing;
}

export function validatePhenomenon(
  general: PhenomenonGeneral,
  answers: PhenomenonAnswers,
  locale: PhenomenonLocale,
): { ok: true } | { ok: false; missing: PhenomenonMissing[]; sameTeacher: boolean } {
  const missing = collectPhenomenonMissing(general, answers, locale);
  const same = sameTeacherChosen(general);
  if (missing.length || same) return { ok: false, missing, sameTeacher: same };
  return { ok: true };
}

/** Запись для сервера: одинакова на любом языке формы. */
export function buildPhenomenonSubmission(general: PhenomenonGeneral, answers: PhenomenonAnswers): PhenomenonSubmission {
  const cleanAnswers: PhenomenonAnswers = {};
  for (const item of [...PHENOMENON_ITEMS, PHENOMENON_OVERALL]) {
    if (answers[item.id]) cleanAnswers[item.id] = answers[item.id];
  }
  for (const id of PHENOMENON_MASTERY_IDS) {
    if (answers[id]) cleanAnswers[id] = String(answers[id]);
  }
  const comments = String(answers[PHENOMENON_COMMENTS_ID] || '').trim();
  if (comments) cleanAnswers[PHENOMENON_COMMENTS_ID] = comments;
  const trim = (s: string) => String(s || '').trim();
  return {
    general: {
      kind: 'phenomenon',
      form_version: PHENOMENON_FORM_VERSION,
      date: trim(general.date),
      observer_name: trim(general.observer_name),
      class_name: trim(general.class_name),
      students_count: trim(general.students_count),
      lesson_number: trim(general.lesson_number),
      teacher1_id: trim(general.teacher1_id),
      teacher1_name: trim(general.teacher1_name),
      teacher2_id: trim(general.teacher2_id),
      teacher2_name: trim(general.teacher2_name),
    },
    answers: cleanAnswers,
  };
}

// ---------- Расчёт ----------

export type PhenomenonLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

export const PHENOMENON_LEVEL_LABELS: Record<PhenomenonLevel, Bilingual> = {
  very_low: { ru: 'очень низкий', en: 'very low' },
  low: { ru: 'низкий', en: 'low' },
  medium: { ru: 'средний', en: 'average' },
  high: { ru: 'высокий', en: 'high' },
  very_high: { ru: 'очень высокий', en: 'very high' },
};

/** Те же уровни, что в основном чек-листе. */
export function phenomenonLevel(percent: number): PhenomenonLevel {
  if (percent < 40) return 'very_low';
  if (percent < 50) return 'low';
  if (percent < 70) return 'medium';
  if (percent < 85) return 'high';
  return 'very_high';
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export type PhenomenonScore = {
  points: number;
  max: number;
  percent: number;
  level: PhenomenonLevel;
  /** false, если какой-то пункт с баллами не заполнен. */
  complete: boolean;
};

export function scorePhenomenon(answers: PhenomenonAnswers): PhenomenonScore {
  let points = 0;
  let complete = true;
  for (const item of PHENOMENON_ITEMS) {
    if (!item.scored) continue;
    const opt = item.options.find((o) => o.id === answers[item.id]);
    if (!opt || opt.score == null) {
      complete = false;
      continue;
    }
    points += opt.score;
  }
  const raw = (points / PHENOMENON_MAX_SCORE) * 100;
  return { points, max: PHENOMENON_MAX_SCORE, percent: round1(raw), level: phenomenonLevel(raw), complete };
}

export function maxScoreFromDefinition(): number {
  return PHENOMENON_ITEMS.filter((i) => i.scored).reduce(
    (sum, item) => sum + Math.max(...item.options.map((o) => o.score ?? 0)),
    0,
  );
}

export function masteryValue(answers: PhenomenonAnswers, id: PhenomenonMasteryId): number | null {
  const n = Number(answers[id]);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

export function optionLabel(itemId: string, optionId: string, locale: PhenomenonLocale = 'ru'): string {
  const item = [...PHENOMENON_ITEMS, PHENOMENON_OVERALL].find((i) => i.id === itemId);
  const opt = item?.options.find((o) => o.id === optionId);
  return opt ? pick(opt.label, locale) : optionId || '';
}

// ---------- Таблица для администраторов ----------

export type PhenomenonResponseRow = {
  id: number;
  created_at: string;
  general: Record<string, unknown>;
  answers: Record<string, unknown>;
};

export type PhenomenonRecord = {
  id: number;
  createdAt: string;
  date: string;
  className: string;
  studentsCount: string;
  lessonNumber: string;
  observer: string;
  teacher1: string;
  teacher2: string;
  teacher1Key: string;
  teacher2Key: string;
  lessonKey: string;
  score: PhenomenonScore;
  mastery1: number | null;
  mastery2: number | null;
  answers: PhenomenonAnswers;
  comments: string;
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function classKey(raw: string): string {
  return personKey(raw).replace(/[\s«»"'-]/g, '');
}

/** Урок = пара педагогов (без учёта порядка) + дата + класс. */
export function phenomenonLessonKey(r: Pick<PhenomenonRecord, 'date' | 'className' | 'teacher1Key' | 'teacher2Key'>): string {
  const pair = [r.teacher1Key, r.teacher2Key].sort().join('+');
  return `${r.date}|${classKey(r.className)}|${pair}`;
}

export function toPhenomenonRecord(row: PhenomenonResponseRow): PhenomenonRecord {
  const g = row.general || {};
  const a: PhenomenonAnswers = {};
  for (const [k, v] of Object.entries(row.answers || {})) a[k] = str(v);
  const teacher1 = str(g.teacher1_name);
  const teacher2 = str(g.teacher2_name);
  const teacher1Key = str(g.teacher1_id) || personKey(teacher1);
  const teacher2Key = str(g.teacher2_id) || personKey(teacher2);
  const base = {
    id: Number(row.id),
    createdAt: str(row.created_at),
    date: str(g.date),
    className: str(g.class_name),
    studentsCount: str(g.students_count),
    lessonNumber: str(g.lesson_number),
    observer: str(g.observer_name),
    teacher1,
    teacher2,
    teacher1Key,
    teacher2Key,
    score: scorePhenomenon(a),
    mastery1: masteryValue(a, 'ph_mastery_1'),
    mastery2: masteryValue(a, 'ph_mastery_2'),
    answers: a,
    comments: a[PHENOMENON_COMMENTS_ID] || '',
  };
  return { ...base, lessonKey: phenomenonLessonKey(base) };
}

export type PhenomenonLessonSummary = {
  lessonKey: string;
  date: string;
  className: string;
  teachers: string[];
  checklists: number;
  percent: number;
  level: PhenomenonLevel;
};

/** Итог урока: среднее по чек-листам всех наблюдателей этого урока. */
export function summarizePhenomenonLessons(records: PhenomenonRecord[]): PhenomenonLessonSummary[] {
  const groups = new Map<string, PhenomenonRecord[]>();
  for (const r of records) {
    const list = groups.get(r.lessonKey) || [];
    list.push(r);
    groups.set(r.lessonKey, list);
  }
  const out: PhenomenonLessonSummary[] = [];
  for (const [lessonKey, list] of groups) {
    const raw = list.reduce((s, r) => s + (r.score.points / r.score.max) * 100, 0) / list.length;
    const percent = round1(raw);
    const first = list[0];
    out.push({
      lessonKey,
      date: first.date,
      className: first.className,
      teachers: [first.teacher1, first.teacher2].sort((x, y) => x.localeCompare(y, 'ru')),
      checklists: list.length,
      percent,
      level: phenomenonLevel(raw),
    });
  }
  return out.sort((x, y) => (x.date === y.date ? x.className.localeCompare(y.className, 'ru') : x.date < y.date ? 1 : -1));
}

export type PhenomenonTeacherSummary = {
  key: string;
  name: string;
  ratings: number;
  mastery: number;
};

/** Мастерство: для каждого педагога отдельно среднее по шкале 1-10. В итог урока не входит. */
export function summarizePhenomenonTeachers(records: PhenomenonRecord[]): PhenomenonTeacherSummary[] {
  const acc = new Map<string, { name: string; values: number[] }>();
  const add = (key: string, name: string, value: number | null) => {
    if (!key || value == null) return;
    const row = acc.get(key) || { name, values: [] };
    row.values.push(value);
    acc.set(key, row);
  };
  for (const r of records) {
    add(r.teacher1Key, r.teacher1, r.mastery1);
    add(r.teacher2Key, r.teacher2, r.mastery2);
  }
  return [...acc.entries()]
    .map(([key, v]) => ({
      key,
      name: v.name,
      ratings: v.values.length,
      mastery: round1(v.values.reduce((s, x) => s + x, 0) / v.values.length),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export type PhenomenonFilter = { from?: string; to?: string; teacher?: string };

export function filterPhenomenonRecords(records: PhenomenonRecord[], filter: PhenomenonFilter): PhenomenonRecord[] {
  const teacher = personKey(filter.teacher || '');
  return records.filter((r) => {
    if (filter.from && r.date < filter.from) return false;
    if (filter.to && r.date > filter.to) return false;
    if (teacher) {
      const names = [personKey(r.teacher1), personKey(r.teacher2)];
      if (!names.some((n) => n.includes(teacher))) return false;
    }
    return true;
  });
}

export function phenomenonTeacherNames(records: PhenomenonRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    if (r.teacher1) set.add(r.teacher1);
    if (r.teacher2) set.add(r.teacher2);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

function formatRuDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Листы выгрузки в Excel: чек-листы, уроки, мастерство педагогов. */
export function phenomenonExcelSheets(records: PhenomenonRecord[]): Array<{ name: string; rows: Array<Array<string | number>> }> {
  const lessons = summarizePhenomenonLessons(records);
  const lessonByKey = new Map(lessons.map((l) => [l.lessonKey, l]));
  const itemHeaders = PHENOMENON_ITEMS.map((i) => i.title.ru);
  const checklistRows: Array<Array<string | number>> = [
    [
      'Дата',
      'Класс',
      'Количество обучающихся',
      '№ урока',
      'Первый педагог',
      'Второй педагог',
      'Наблюдатель',
      `Баллы (из ${PHENOMENON_MAX_SCORE})`,
      'Итог чек-листа, %',
      'Уровень',
      'Итог урока, %',
      'Мастерство первого педагога',
      'Мастерство второго педагога',
      ...itemHeaders,
      PHENOMENON_OVERALL.title.ru,
      PHENOMENON_COMMENTS_TITLE.ru,
    ],
  ];
  for (const r of records) {
    const lesson = lessonByKey.get(r.lessonKey);
    checklistRows.push([
      formatRuDate(r.date),
      r.className,
      r.studentsCount,
      r.lessonNumber,
      r.teacher1,
      r.teacher2,
      r.observer,
      r.score.points,
      r.score.percent,
      PHENOMENON_LEVEL_LABELS[r.score.level].ru,
      lesson ? lesson.percent : '',
      r.mastery1 ?? '',
      r.mastery2 ?? '',
      ...PHENOMENON_ITEMS.map((i) => optionLabel(i.id, r.answers[i.id] || '')),
      optionLabel(PHENOMENON_OVERALL.id, r.answers[PHENOMENON_OVERALL.id] || ''),
      r.comments,
    ]);
  }
  const lessonRows: Array<Array<string | number>> = [
    ['Дата', 'Класс', 'Педагоги', 'Чек-листов', 'Итог урока, %', 'Уровень'],
    ...lessons.map((l) => [
      formatRuDate(l.date),
      l.className,
      l.teachers.join(', '),
      l.checklists,
      l.percent,
      PHENOMENON_LEVEL_LABELS[l.level].ru,
    ]),
  ];
  const teacherRows: Array<Array<string | number>> = [
    ['Педагог', 'Оценок', 'Среднее мастерство (1-10)'],
    ...summarizePhenomenonTeachers(records).map((t) => [t.name, t.ratings, t.mastery]),
  ];
  return [
    { name: 'Чек-листы', rows: checklistRows },
    { name: 'Уроки', rows: lessonRows },
    { name: 'Мастерство педагогов', rows: teacherRows },
  ];
}

export { formatRuDate as formatPhenomenonDate };
