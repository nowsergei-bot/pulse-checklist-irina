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

/** 16–18 ноября включительно, по московскому времени. */
export const ORDINARY_CHECKLIST_PAUSE_START = Date.parse('2026-11-16T00:00:00+03:00');
export const ORDINARY_CHECKLIST_PAUSE_END = Date.parse('2026-11-19T00:00:00+03:00');
export const ORDINARY_CHECKLIST_PAUSE_MESSAGE =
  'На\u00a0период проведения феноменальных уроков действует отдельный чек-лист';

export function ordinaryChecklistPaused(now = Date.now()): boolean {
  return now >= ORDINARY_CHECKLIST_PAUSE_START && now < ORDINARY_CHECKLIST_PAUSE_END;
}

/**
 * ПЕРЕКЛЮЧАТЕЛЬ. false: форма видна только участникам пробного доступа (список на сервере),
 * остальным «Раздел пока недоступен». true: форма открыта всем. Значение должно совпадать с
 * PHENOMENON_OPEN_FOR_ALL в backend/functions/lib/lesson-visit-checklist.js (проверяется тестом).
 */
export const PHENOMENON_OPEN_FOR_ALL = true;

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
  /** Дата + пара педагогов. Окончательный урок: summarizePhenomenonLessons / phenomenonLessonByRecord. */
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

/** № урока в форме: выбор из списка. */
export const PHENOMENON_LESSON_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * № урока из записи: первое число 1-9 («3», «3 урок», «3rd period»). Время («11:50-12:30»),
 * номер кабинета и пустое поле дают null.
 */
export function parsePhenomenonLessonNumber(raw: string): number | null {
  const m = /\d+/.exec(String(raw || ''));
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 1 && n <= 9 && !/^\s*\d{1,2}[:.]\d{2}/.test(String(raw)) ? n : null;
}

/** Латинские буквы, которые пишут вместо русских в названии класса («4AC» = «4АС», «2D» = «2Д»). */
const CLASS_LATIN_TO_CYRILLIC: Record<string, string> = {
  A: 'А', B: 'В', C: 'С', D: 'Д', E: 'Е', G: 'Г', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
};

/** Класс для сравнения: верхний регистр, латиница как кириллица, без пробелов и знаков. */
export function normalizePhenomenonClass(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/[A-Z]/g, (ch) => CLASS_LATIN_TO_CYRILLIC[ch] ?? ch)
    .replace(/[^0-9А-ЯA-Z]/g, '');
}

/** Похоже на один класс: одинаковая запись или одна запись только номер параллели другой («10» и «10А»). */
function sameClass(a: string, b: string): boolean {
  const x = normalizePhenomenonClass(a);
  const y = normalizePhenomenonClass(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const grade = (s: string) => /^(\d+)/.exec(s)?.[1] ?? '';
  if (/^\d+$/.test(x)) return grade(y) === x;
  if (/^\d+$/.test(y)) return grade(x) === y;
  return false;
}

function pairKeyOf(r: Pick<PhenomenonRecord, 'teacher1' | 'teacher2' | 'teacher1Key' | 'teacher2Key'>): string {
  const one = personKey(r.teacher1) || r.teacher1Key;
  const two = personKey(r.teacher2) || r.teacher2Key;
  return [one, two].sort().join('+');
}

/** Дата + пара педагогов (без учёта порядка). Класс в ключ не входит: его пишут по-разному. */
export function phenomenonLessonKey(r: Pick<PhenomenonRecord, 'date' | 'teacher1' | 'teacher2' | 'teacher1Key' | 'teacher2Key'>): string {
  return `${r.date}|${pairKeyOf(r)}`;
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

/**
 * Делит чек-листы одной пары за один день на уроки.
 * Обычно это один урок. Два урока, только если указаны разные № урока и классы в них разные
 * (у одного урока наблюдатели могли ошибиться в номере: тогда класс совпадает и урок один).
 * Чек-лист без распознанного номера идёт к уроку с тем же классом, иначе к самому большому.
 */
function splitPairDay(list: PhenomenonRecord[]): PhenomenonRecord[][] {
  const byNo = new Map<number, PhenomenonRecord[]>();
  const unknown: PhenomenonRecord[] = [];
  for (const r of list) {
    const n = parsePhenomenonLessonNumber(r.lessonNumber);
    if (n == null) unknown.push(r);
    else byNo.set(n, [...(byNo.get(n) || []), r]);
  }
  let groups = [...byNo.entries()].sort((x, y) => x[0] - y[0]).map(([, g]) => g);
  if (groups.length <= 1) return [list];
  // Склеиваем номера, у которых есть общий класс.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        if (groups[i].some((a) => groups[j].some((b) => sameClass(a.className, b.className)))) {
          groups[i] = [...groups[i], ...groups[j]];
          groups = groups.filter((_, k) => k !== j);
          merged = true;
          break outer;
        }
      }
    }
  }
  for (const r of unknown) {
    const target =
      groups.find((g) => g.some((x) => sameClass(x.className, r.className))) ||
      groups.reduce((best, g) => (g.length > best.length ? g : best), groups[0]);
    target.push(r);
  }
  return groups;
}

/** Порядок педагогов урока: кого чаще указывали первым; при равенстве по алфавиту. */
function pairOrder(list: PhenomenonRecord[]): { teacher1: string; teacher2: string } {
  const first = new Map<string, { name: string; n: number }>();
  for (const r of list) {
    const k = personKey(r.teacher1);
    first.set(k, { name: r.teacher1, n: (first.get(k)?.n || 0) + 1 });
  }
  const a = list[0].teacher1;
  const b = list[0].teacher2;
  const na = first.get(personKey(a))?.n || 0;
  const nb = first.get(personKey(b))?.n || 0;
  if (na > nb || (na === nb && a.localeCompare(b, 'ru') <= 0)) return { teacher1: a, teacher2: b };
  return { teacher1: b, teacher2: a };
}

/** Балл в виде «19,3 из 22 · 88%». */
export function phenomenonPointsText(points: number | null, max: number = PHENOMENON_MAX_SCORE): string {
  if (points == null) return '—';
  const p = String(round1(points)).replace('.', ',');
  return `${p} из ${max} · ${Math.round((points / max) * 100)}%`;
}

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export type PhenomenonLessonSummary = {
  lessonKey: string;
  date: string;
  /** Все варианты написания класса через запятую. */
  className: string;
  /** № урока (чаще всего указанный), пусто, если не распознан. */
  lessonNumber: string;
  teachers: string[];
  checklists: number;
  recordIds: number[];
  /** Сколько разных наблюдателей. */
  observers: number;
  percent: number;
  level: PhenomenonLevel;
  /** Разброс: минимальный и максимальный итог чек-листов урока. */
  minPercent: number;
  maxPercent: number;
  /** Балл урока: среднее по чек-листам, из PHENOMENON_MAX_SCORE. Он же балл каждого педагога пары. */
  points: number;
  /** Педагог 1 и педагог 2 в том порядке, как их чаще указывали наблюдатели. */
  teacher1: string;
  teacher2: string;
};

/** Итог урока: среднее по чек-листам всех наблюдателей этого урока. */
export function summarizePhenomenonLessons(records: PhenomenonRecord[]): PhenomenonLessonSummary[] {
  const byPairDay = new Map<string, PhenomenonRecord[]>();
  for (const r of records) {
    const key = phenomenonLessonKey(r);
    byPairDay.set(key, [...(byPairDay.get(key) || []), r]);
  }
  const out: PhenomenonLessonSummary[] = [];
  for (const [pairDayKey, all] of byPairDay) {
    const parts = splitPairDay(all);
    for (const list of parts) {
      const raw = list.reduce((s, r) => s + (r.score.points / r.score.max) * 100, 0) / list.length;
      const numbers = list.map((r) => parsePhenomenonLessonNumber(r.lessonNumber)).filter((n): n is number => n != null);
      const no = mostCommon(numbers);
      const classes: string[] = [];
      for (const r of list) {
        const c = r.className.trim();
        if (c && !classes.includes(c)) classes.push(c);
      }
      const first = list[0];
      out.push({
        lessonKey: parts.length > 1 ? `${pairDayKey}|${no ?? ''}` : pairDayKey,
        date: first.date,
        className: classes.join(', '),
        lessonNumber: no != null ? String(no) : '',
        teachers: [first.teacher1, first.teacher2].sort((x, y) => x.localeCompare(y, 'ru')),
        checklists: list.length,
        recordIds: list.map((r) => r.id),
        observers: new Set(list.map((r) => personKey(r.observer) || `#${r.id}`)).size,
        percent: round1(raw),
        level: phenomenonLevel(raw),
        minPercent: Math.min(...list.map((r) => r.score.percent)),
        maxPercent: Math.max(...list.map((r) => r.score.percent)),
        points: round1(list.reduce((sum, r) => sum + r.score.points, 0) / list.length),
        ...pairOrder(list),
      });
    }
  }
  return out.sort((x, y) => {
    if (x.date !== y.date) return x.date < y.date ? 1 : -1;
    const nx = Number(x.lessonNumber) || 99;
    const ny = Number(y.lessonNumber) || 99;
    return nx !== ny ? nx - ny : x.className.localeCompare(y.className, 'ru');
  });
}

/** Урок каждого чек-листа: номер чек-листа → урок. */
export function phenomenonLessonByRecord(records: PhenomenonRecord[]): Map<number, PhenomenonLessonSummary> {
  const map = new Map<number, PhenomenonLessonSummary>();
  for (const lesson of summarizePhenomenonLessons(records)) {
    for (const id of lesson.recordIds) map.set(id, lesson);
  }
  return map;
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

/** Листы выгрузки в Excel: чек-листы, уроки, педагоги, профиль по критериям, расхождения. */
export function phenomenonExcelSheets(
  records: PhenomenonRecord[],
  directory?: LessonVisitDirectory | null,
): Array<{ name: string; rows: Array<Array<string | number>> }> {
  const lessons = summarizePhenomenonLessons(records);
  const lessonByRecord = new Map<number, PhenomenonLessonSummary>();
  for (const l of lessons) for (const id of l.recordIds) lessonByRecord.set(id, l);
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
    const lesson = lessonByRecord.get(r.id);
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
    [
      'Дата',
      '№ урока',
      'Класс',
      'Педагог 1',
      'Балл педагога 1',
      'Педагог 2',
      'Балл педагога 2',
      `Балл урока (из ${PHENOMENON_MAX_SCORE})`,
      'Наблюдателей',
      'Чек-листов',
      'Итог урока, %',
      'Уровень',
      'Минимум, %',
      'Максимум, %',
    ],
    ...lessons.map((l) => [
      formatRuDate(l.date),
      l.lessonNumber,
      l.className,
      l.teacher1,
      phenomenonPointsText(l.points),
      l.teacher2,
      phenomenonPointsText(l.points),
      l.points,
      l.observers,
      l.checklists,
      l.percent,
      PHENOMENON_LEVEL_LABELS[l.level].ru,
      l.minPercent,
      l.maxPercent,
    ]),
  ];
  const teacherRows: Array<Array<string | number>> = [
    [
      'Педагог',
      'Балл',
      `Балл (из ${PHENOMENON_MAX_SCORE})`,
      'Кафедра',
      'Феноменальных уроков',
      'Средний итог уроков, %',
      'Среднее мастерство (1-10)',
      'Оценок мастерства',
    ],
    ...sortPhenomenonTeachers(phenomenonTeacherRows(records, directory), 'points_desc').map((t) => [
      t.name,
      phenomenonPointsText(t.points),
      t.points ?? '',
      t.department,
      t.lessons,
      t.average ?? '',
      t.mastery ?? '',
      t.ratings,
    ]),
  ];
  const summary = summarizePhenomenonWeek(records);
  const profileRows: Array<Array<string | number>> = [['Пункт', '% от максимума', 'Вариант ответа', 'Чек-листов', 'Доля, %']];
  for (const p of summary.profile) {
    p.options.forEach((o, i) => profileRows.push([i === 0 ? p.title : '', i === 0 ? (p.percent ?? 'без баллов') : '', o.label, o.count, o.percent]));
  }
  const d = phenomenonDiscrepancies(records);
  const discRows: Array<Array<string | number>> = [
    ['Вид', 'Дата', '№ урока', 'Класс', 'Педагоги', 'Наблюдатель', 'Подробности'],
    ...d.spread.map((l) => [
      `Итоги наблюдателей отличаются на ${PHENOMENON_SPREAD_LIMIT} и больше`,
      formatRuDate(l.date),
      l.lessonNumber,
      l.className,
      l.teachers.join(', '),
      '',
      `от ${l.minPercent} до ${l.maxPercent} (${l.checklists} чек-листов)`,
    ]),
    ...d.ratingGaps.map((g) => [
      'Оценка наблюдателя расходится с баллами',
      formatRuDate(g.record.date),
      g.lesson?.lessonNumber ?? g.record.lessonNumber,
      g.record.className,
      [g.record.teacher1, g.record.teacher2].join(', '),
      g.record.observer,
      `по баллам: ${PHENOMENON_LEVEL_LABELS[PHENOMENON_LEVEL_ORDER[g.scoreLevel]].ru} (${g.record.score.percent}); наблюдатель: ${optionLabel(PHENOMENON_OVERALL.id, g.record.answers[PHENOMENON_OVERALL.id])}`,
    ]),
  ];
  return [
    { name: 'Чек-листы', rows: checklistRows },
    { name: 'Уроки', rows: lessonRows },
    { name: 'Педагоги', rows: teacherRows },
    { name: 'Профиль по критериям', rows: profileRows },
    { name: 'Расхождения', rows: discRows },
  ];
}

export { formatRuDate as formatPhenomenonDate };

// ---------- Аналитика феноменальных уроков ----------

export type PhenomenonWeek = { id: string; title: string; from: string; to: string };

/**
 * Феноменальные недели. Одна строка на неделю: id, название феномена, первый и последний день (ГГГГ-ММ-ДД).
 * Новую неделю добавляем сюда одной строкой. Чек-лист попадает в неделю по дате посещения.
 */
export const PHENOMENON_WEEKS: PhenomenonWeek[] = [
  { id: '2026-11-16', title: 'Эпохи России', from: '2026-11-16', to: '2026-11-18' },
];

/** Выбор «Все недели» (сюда входят и чек-листы с датой вне недель). */
export const PHENOMENON_ALL_WEEKS = 'all';

export function phenomenonWeekOf(date: string, weeks: PhenomenonWeek[] = PHENOMENON_WEEKS): PhenomenonWeek | null {
  const d = String(date || '').slice(0, 10);
  return weeks.find((w) => d >= w.from && d <= w.to) ?? null;
}

export function phenomenonWeekLabel(week: PhenomenonWeek): string {
  return `«${week.title}», ${formatRuDate(week.from)}-${formatRuDate(week.to)}`;
}

/** По умолчанию последняя начавшаяся неделя (если ни одна не началась, первая). */
export function defaultPhenomenonWeek(weeks: PhenomenonWeek[] = PHENOMENON_WEEKS, today: Date = new Date()): string {
  if (!weeks.length) return PHENOMENON_ALL_WEEKS;
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const started = [...weeks].sort((a, b) => (a.from < b.from ? -1 : 1)).filter((w) => w.from <= iso);
  return (started[started.length - 1] ?? weeks[0]).id;
}

export function phenomenonRecordsForWeek(
  records: PhenomenonRecord[],
  weekId: string,
  weeks: PhenomenonWeek[] = PHENOMENON_WEEKS,
): PhenomenonRecord[] {
  if (!weekId || weekId === PHENOMENON_ALL_WEEKS) return records;
  const week = weeks.find((w) => w.id === weekId);
  if (!week) return [];
  return records.filter((r) => r.date >= week.from && r.date <= week.to);
}

/** Номер уровня 0-4 (очень низкий … очень высокий), как в обычной аналитике. */
export const PHENOMENON_LEVEL_ORDER: PhenomenonLevel[] = ['very_low', 'low', 'medium', 'high', 'very_high'];

function itemById(id: string): PhenomenonChoiceItem | undefined {
  return [...PHENOMENON_ITEMS, PHENOMENON_OVERALL].find((i) => i.id === id);
}

/**
 * Ответ урока по пункту: тот, что выбрало больше наблюдателей. При равенстве берётся вариант
 * с меньшим баллом (осторожная оценка), для пунктов без баллов первый по порядку в форме.
 */
export function phenomenonLessonAnswer(list: PhenomenonRecord[], itemId: string): string {
  const item = itemById(itemId);
  const counts = new Map<string, number>();
  for (const r of list) {
    const a = r.answers[itemId];
    if (a) counts.set(a, (counts.get(a) || 0) + 1);
  }
  if (!counts.size) return '';
  const order = item?.options ?? [];
  const rank = (id: string) => {
    const idx = order.findIndex((o) => o.id === id);
    const opt = order[idx];
    return [opt?.score ?? 0, idx < 0 ? 99 : idx] as const;
  };
  return [...counts.entries()].sort((x, y) => {
    if (y[1] !== x[1]) return y[1] - x[1];
    const [sx, ix] = rank(x[0]);
    const [sy, iy] = rank(y[0]);
    return sx !== sy ? sx - sy : ix - iy;
  })[0][0];
}

export type PhenomenonIndicatorRow = {
  id: string;
  label: string;
  item: string;
  options: string[];
};

export type PhenomenonIndicatorGroup = { id: string; title: string; rows: PhenomenonIndicatorRow[] };

/** Ключевые показатели формата (раздел 2 ТЗ). */
export const PHENOMENON_KEY_INDICATORS: PhenomenonIndicatorGroup[] = [
  {
    id: 'phenomenon',
    title: 'Раскрытие феномена',
    rows: [
      {
        id: 'students_link',
        label: 'Ученики сами связывают знания двух предметов и делают вывод о феномене',
        item: 'ph_phenomenon',
        options: ['students_link'],
      },
      {
        id: 'not_revealed',
        label: 'Феномен не раскрыт или раскрыт только через один предмет',
        item: 'ph_phenomenon',
        options: ['none', 'parallel'],
      },
    ],
  },
  {
    id: 'coteaching',
    title: 'Совместное ведение',
    rows: [{ id: 'turns', label: 'Учителя ведут урок по очереди', item: 'ph_coteaching', options: ['turns'] }],
  },
  {
    id: 'reflection',
    title: 'Рефлексия',
    rows: [
      { id: 'reflection_meaningful', label: 'Содержательная', item: 'ph_reflection', options: ['meaningful'] },
      { id: 'reflection_formal', label: 'Формальная', item: 'ph_reflection', options: ['formal'] },
      { id: 'reflection_none', label: 'Не проводилась', item: 'ph_reflection', options: ['none'] },
    ],
  },
  {
    id: 'objectives',
    title: 'Цели урока',
    rows: [
      { id: 'objectives_teachers', label: 'Сформулированы учителями', item: 'ph_objectives', options: ['teachers'] },
      { id: 'objectives_joint', label: 'Совместно с учащимися', item: 'ph_objectives', options: ['joint'] },
      { id: 'objectives_students', label: 'Сформулированы учащимися', item: 'ph_objectives', options: ['students'] },
      { id: 'objectives_none', label: 'Не сформулированы', item: 'ph_objectives', options: ['none'] },
    ],
  },
];

export type PhenomenonShare = { count: number; total: number; percent: number | null };

function share(count: number, total: number): PhenomenonShare {
  return { count, total, percent: total ? round1((count / total) * 100) : null };
}

export type PhenomenonIndicatorValue = PhenomenonIndicatorRow & { lessons: PhenomenonShare; checklists: PhenomenonShare };

export type PhenomenonProfileOption = { id: string; label: string; count: number; percent: number };

export type PhenomenonProfileItem = {
  id: string;
  title: string;
  scored: boolean;
  /** Процент от максимума (среднее по урокам); null у пункта без баллов. */
  percent: number | null;
  answered: number;
  options: PhenomenonProfileOption[];
};

export type PhenomenonWeekSummary = {
  lessons: PhenomenonLessonSummary[];
  /** Средний итог по урокам (каждый урок с равным весом). */
  average: number | null;
  averageLevel: PhenomenonLevel | null;
  checklists: number;
  observers: number;
  teachers: number;
  /** Число уроков по уровням, в порядке PHENOMENON_LEVEL_ORDER. */
  levelCounts: number[];
  indicators: Array<{ group: PhenomenonIndicatorGroup; rows: PhenomenonIndicatorValue[] }>;
  profile: PhenomenonProfileItem[];
};

function lessonRecords(records: PhenomenonRecord[], lesson: PhenomenonLessonSummary): PhenomenonRecord[] {
  const ids = new Set(lesson.recordIds);
  return records.filter((r) => ids.has(r.id));
}

/** Сводка по набору чек-листов (неделя или все недели). */
export function summarizePhenomenonWeek(records: PhenomenonRecord[]): PhenomenonWeekSummary {
  const lessons = summarizePhenomenonLessons(records);
  const byLesson = lessons.map((l) => ({ lesson: l, list: lessonRecords(records, l) }));
  const rawLesson = (list: PhenomenonRecord[]) => list.reduce((s, r) => s + (r.score.points / r.score.max) * 100, 0) / list.length;
  const raws = byLesson.map((x) => rawLesson(x.list));
  const avgRaw = raws.length ? raws.reduce((s, v) => s + v, 0) / raws.length : null;
  const teachers = new Set<string>();
  for (const r of records) {
    if (r.teacher1) teachers.add(personKey(r.teacher1));
    if (r.teacher2) teachers.add(personKey(r.teacher2));
  }
  const levelCounts = PHENOMENON_LEVEL_ORDER.map((lvl) => lessons.filter((l) => l.level === lvl).length);
  const indicators = PHENOMENON_KEY_INDICATORS.map((group) => ({
    group,
    rows: group.rows.map((row) => {
      const lessonHits = byLesson.filter((x) => row.options.includes(phenomenonLessonAnswer(x.list, row.item))).length;
      const lessonTotal = byLesson.filter((x) => phenomenonLessonAnswer(x.list, row.item)).length;
      const answered = records.filter((r) => r.answers[row.item]);
      const hits = answered.filter((r) => row.options.includes(r.answers[row.item])).length;
      return { ...row, lessons: share(lessonHits, lessonTotal), checklists: share(hits, answered.length) };
    }),
  }));
  const profile: PhenomenonProfileItem[] = PHENOMENON_ITEMS.map((item) => {
    const answered = records.filter((r) => item.options.some((o) => o.id === r.answers[item.id]));
    const options = item.options.map((o) => {
      const count = answered.filter((r) => r.answers[item.id] === o.id).length;
      return { id: o.id, label: o.label.ru, count, percent: answered.length ? round1((count / answered.length) * 100) : 0 };
    });
    let percent: number | null = null;
    if (item.scored) {
      const max = Math.max(...item.options.map((o) => o.score ?? 0));
      const perLesson = byLesson
        .map((x) => {
          const vals = x.list
            .map((r) => item.options.find((o) => o.id === r.answers[item.id])?.score)
            .filter((v): v is number => v != null);
          return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length / max) * 100 : null;
        })
        .filter((v): v is number => v != null);
      percent = perLesson.length ? round1(perLesson.reduce((s, v) => s + v, 0) / perLesson.length) : null;
    }
    return { id: item.id, title: item.title.ru, scored: Boolean(item.scored), percent, answered: answered.length, options };
  });
  return {
    lessons,
    average: avgRaw == null ? null : round1(avgRaw),
    averageLevel: avgRaw == null ? null : phenomenonLevel(avgRaw),
    checklists: records.length,
    observers: new Set(records.map((r) => personKey(r.observer)).filter(Boolean)).size,
    teachers: teachers.size,
    levelCounts,
    indicators,
    profile,
  };
}

export type PhenomenonLessonDetail = {
  lesson: PhenomenonLessonSummary;
  checklists: PhenomenonRecord[];
  /** Мастерство каждого педагога урока: среднее по наблюдателям. */
  mastery: Array<{ name: string; mean: number | null; ratings: number }>;
};

/** Карточка урока: все его чек-листы и мастерство каждого педагога. */
export function phenomenonLessonDetail(records: PhenomenonRecord[], lesson: PhenomenonLessonSummary): PhenomenonLessonDetail {
  const list = lessonRecords(records, lesson).sort((a, b) => a.observer.localeCompare(b.observer, 'ru'));
  const values = new Map<string, { name: string; values: number[] }>();
  const add = (name: string, v: number | null) => {
    const key = personKey(name);
    if (!key) return;
    const row = values.get(key) || { name, values: [] };
    if (v != null) row.values.push(v);
    values.set(key, row);
  };
  for (const r of list) {
    add(r.teacher1, r.mastery1);
    add(r.teacher2, r.mastery2);
  }
  const mastery = [...values.values()]
    .map((v) => ({ name: v.name, ratings: v.values.length, mean: v.values.length ? round1(v.values.reduce((s, x) => s + x, 0) / v.values.length) : null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return { lesson, checklists: list, mastery };
}

export type PhenomenonLessonSort = 'date_desc' | 'date_asc' | 'score_desc' | 'score_asc';

/** Поиск по педагогу и сортировка таблицы уроков. */
export function phenomenonLessonRows(
  lessons: PhenomenonLessonSummary[],
  opts: { search?: string; sort?: PhenomenonLessonSort } = {},
): PhenomenonLessonSummary[] {
  const q = personKey(opts.search || '');
  const rows = q ? lessons.filter((l) => l.teachers.some((t) => personKey(t).includes(q))) : [...lessons];
  const byDate = (a: PhenomenonLessonSummary, b: PhenomenonLessonSummary) =>
    a.date === b.date ? (Number(a.lessonNumber) || 99) - (Number(b.lessonNumber) || 99) : a.date < b.date ? -1 : 1;
  switch (opts.sort || 'date_desc') {
    case 'date_asc':
      return rows.sort(byDate);
    case 'score_desc':
      return rows.sort((a, b) => b.percent - a.percent || byDate(a, b));
    case 'score_asc':
      return rows.sort((a, b) => a.percent - b.percent || byDate(a, b));
    default:
      return rows.sort((a, b) => (a.date === b.date ? byDate(a, b) : a.date < b.date ? 1 : -1));
  }
}

// ---------- Педагоги, срезы, расхождения ----------

/** Кафедра педагога по справочнику: по коду из формы, иначе по ФИО. */
export function phenomenonDepartmentOf(directory: LessonVisitDirectory | null | undefined, teacherKey: string, teacherName: string): string {
  if (!directory) return '';
  const teachers = directory.teachers || [];
  const byId = teachers.find((t) => t.id === teacherKey);
  const name = personKey(teacherName);
  const t = byId || teachers.find((x) => personKey(x.name) === name);
  if (!t) return '';
  return (directory.departments || []).find((d) => d.id === t.departmentId)?.name || '';
}

export type PhenomenonTeacherRow = {
  key: string;
  name: string;
  department: string;
  lessons: number;
  /** Средний итог его уроков, %. */
  average: number | null;
  /** Балл: средний балл его уроков из PHENOMENON_MAX_SCORE. */
  points: number | null;
  /** Среднее мастерство 1-10 и число оценок. */
  mastery: number | null;
  ratings: number;
  lessonKeys: string[];
};

export function phenomenonTeacherRows(records: PhenomenonRecord[], directory?: LessonVisitDirectory | null): PhenomenonTeacherRow[] {
  const lessons = summarizePhenomenonLessons(records);
  const byRecord = new Map<number, PhenomenonLessonSummary>();
  for (const l of lessons) for (const id of l.recordIds) byRecord.set(id, l);
  const acc = new Map<string, { name: string; id: string; lessons: Map<string, number>; points: Map<string, number>; mastery: number[] }>();
  const add = (name: string, id: string, r: PhenomenonRecord, m: number | null) => {
    const key = personKey(name);
    if (!key) return;
    const row = acc.get(key) || { name, id, lessons: new Map<string, number>(), points: new Map<string, number>(), mastery: [] as number[] };
    const lesson = byRecord.get(r.id);
    if (lesson) {
      row.lessons.set(lesson.lessonKey, lesson.percent);
      row.points.set(lesson.lessonKey, lesson.points);
    }
    if (m != null) row.mastery.push(m);
    if (!row.id && id) row.id = id;
    acc.set(key, row);
  };
  for (const r of records) {
    add(r.teacher1, r.teacher1Key, r, r.mastery1);
    add(r.teacher2, r.teacher2Key, r, r.mastery2);
  }
  return [...acc.entries()].map(([key, v]) => {
    const pct = [...v.lessons.values()];
    const pts = [...v.points.values()];
    return {
      key,
      name: v.name,
      department: phenomenonDepartmentOf(directory, v.id, v.name),
      lessons: v.lessons.size,
      average: pct.length ? round1(pct.reduce((s, x) => s + x, 0) / pct.length) : null,
      points: pts.length ? round1(pts.reduce((s, x) => s + x, 0) / pts.length) : null,
      mastery: v.mastery.length ? round1(v.mastery.reduce((s, x) => s + x, 0) / v.mastery.length) : null,
      ratings: v.mastery.length,
      lessonKeys: [...v.lessons.keys()],
    };
  });
}

export type PhenomenonTeacherSort = 'points_desc' | 'points_asc' | 'name' | 'average_desc' | 'average_asc' | 'mastery_desc' | 'mastery_asc' | 'lessons_desc';

export function sortPhenomenonTeachers(rows: PhenomenonTeacherRow[], sort: PhenomenonTeacherSort, search = ''): PhenomenonTeacherRow[] {
  const q = personKey(search);
  const list = q ? rows.filter((r) => personKey(r.name).includes(q) || personKey(r.department).includes(q)) : [...rows];
  const name = (a: PhenomenonTeacherRow, b: PhenomenonTeacherRow) => a.name.localeCompare(b.name, 'ru');
  const num = (v: number | null, dir: 1 | -1) => (v == null ? Infinity : dir * v);
  switch (sort) {
    case 'points_desc':
      return list.sort((a, b) => num(a.points, -1) - num(b.points, -1) || name(a, b));
    case 'points_asc':
      return list.sort((a, b) => num(a.points, 1) - num(b.points, 1) || name(a, b));
    case 'average_desc':
      return list.sort((a, b) => num(a.average, -1) - num(b.average, -1) || name(a, b));
    case 'average_asc':
      return list.sort((a, b) => num(a.average, 1) - num(b.average, 1) || name(a, b));
    case 'mastery_desc':
      return list.sort((a, b) => num(a.mastery, -1) - num(b.mastery, -1) || name(a, b));
    case 'mastery_asc':
      return list.sort((a, b) => num(a.mastery, 1) - num(b.mastery, 1) || name(a, b));
    case 'lessons_desc':
      return list.sort((a, b) => b.lessons - a.lessons || name(a, b));
    default:
      return list.sort(name);
  }
}

export const PHENOMENON_STAGE_UNKNOWN = 'не определено';
export const PHENOMENON_STAGES = ['1-4 классы', '5-9 классы', '10-11 классы', PHENOMENON_STAGE_UNKNOWN] as const;

/** Ступень по номеру класса в начале записи («4АС» → 1-4, «10А» → 10-11); иначе «не определено». */
export function phenomenonStageOf(className: string): (typeof PHENOMENON_STAGES)[number] {
  const m = /^\s*(\d{1,2})(?!\d)/.exec(String(className || ''));
  const n = m ? Number(m[1]) : NaN;
  if (n >= 1 && n <= 4) return '1-4 классы';
  if (n >= 5 && n <= 9) return '5-9 классы';
  if (n === 10 || n === 11) return '10-11 классы';
  return PHENOMENON_STAGE_UNKNOWN;
}

/** Ступень урока: первая распознанная запись класса среди всех вариантов. */
export function phenomenonLessonStage(lesson: Pick<PhenomenonLessonSummary, 'className'>): (typeof PHENOMENON_STAGES)[number] {
  for (const part of lesson.className.split(',')) {
    const s = phenomenonStageOf(part);
    if (s !== PHENOMENON_STAGE_UNKNOWN) return s;
  }
  return PHENOMENON_STAGE_UNKNOWN;
}

export type PhenomenonSliceRow = { label: string; lessons: number; average: number | null };

function sliceRows(lessons: PhenomenonLessonSummary[], labelOf: (l: PhenomenonLessonSummary) => string): PhenomenonSliceRow[] {
  const groups = new Map<string, number[]>();
  for (const l of lessons) {
    const k = labelOf(l);
    groups.set(k, [...(groups.get(k) || []), l.percent]);
  }
  return [...groups.entries()].map(([label, v]) => ({ label, lessons: v.length, average: round1(v.reduce((s, x) => s + x, 0) / v.length) }));
}

export function phenomenonStageSlices(lessons: PhenomenonLessonSummary[]): PhenomenonSliceRow[] {
  const rows = sliceRows(lessons, (l) => phenomenonLessonStage(l));
  return PHENOMENON_STAGES.map((s) => rows.find((r) => r.label === s)).filter((r): r is PhenomenonSliceRow => Boolean(r));
}

/** Сочетание кафедр пары, например «Иностранные языки + Социальные науки» (по алфавиту). */
export function phenomenonDepartmentPairSlices(
  records: PhenomenonRecord[],
  lessons: PhenomenonLessonSummary[],
  directory?: LessonVisitDirectory | null,
): PhenomenonSliceRow[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  return sliceRows(lessons, (l) => {
    const r = byId.get(l.recordIds[0]);
    if (!r) return 'Кафедра не указана';
    const deps = [phenomenonDepartmentOf(directory, r.teacher1Key, r.teacher1), phenomenonDepartmentOf(directory, r.teacher2Key, r.teacher2)].map(
      (d) => d || 'Кафедра не указана',
    );
    return deps.sort((a, b) => a.localeCompare(b, 'ru')).join(' + ');
  }).sort((a, b) => b.lessons - a.lessons || a.label.localeCompare(b.label, 'ru'));
}

/** Уроки, где итоги чек-листов разных наблюдателей отличаются на 25 баллов и больше. */
export const PHENOMENON_SPREAD_LIMIT = 25;
/** Чек-листы, где оценка наблюдателя отличается от уровня по баллам на 2 уровня и больше. */
export const PHENOMENON_RATING_GAP = 2;

const OVERALL_LEVEL: Record<string, number> = { low: 0, below_average: 1, average: 2, high: 3, very_high: 4 };

export type PhenomenonRatingGap = {
  record: PhenomenonRecord;
  lesson: PhenomenonLessonSummary | undefined;
  scoreLevel: number;
  observerLevel: number;
  /** Положительное: наблюдатель оценил выше баллов. */
  gap: number;
};

export function phenomenonDiscrepancies(records: PhenomenonRecord[]): {
  spread: PhenomenonLessonSummary[];
  ratingGaps: PhenomenonRatingGap[];
} {
  const lessons = summarizePhenomenonLessons(records);
  const byRecord = new Map<number, PhenomenonLessonSummary>();
  for (const l of lessons) for (const id of l.recordIds) byRecord.set(id, l);
  const spread = lessons
    .filter((l) => l.checklists > 1 && l.maxPercent - l.minPercent >= PHENOMENON_SPREAD_LIMIT)
    .sort((a, b) => b.maxPercent - b.minPercent - (a.maxPercent - a.minPercent));
  const ratingGaps: PhenomenonRatingGap[] = [];
  for (const r of records) {
    const observerLevel = OVERALL_LEVEL[r.answers[PHENOMENON_OVERALL.id]];
    if (observerLevel == null) continue;
    const scoreLevel = PHENOMENON_LEVEL_ORDER_INDEX[r.score.level];
    const gap = observerLevel - scoreLevel;
    if (Math.abs(gap) >= PHENOMENON_RATING_GAP) ratingGaps.push({ record: r, lesson: byRecord.get(r.id), scoreLevel, observerLevel, gap });
  }
  ratingGaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || (a.record.date < b.record.date ? 1 : -1));
  return { spread, ratingGaps };
}

const PHENOMENON_LEVEL_ORDER_INDEX: Record<PhenomenonLevel, number> = { very_low: 0, low: 1, medium: 2, high: 3, very_high: 4 };

// ---------- Комментарии и динамика ----------

export type PhenomenonComment = {
  id: number;
  date: string;
  lesson: PhenomenonLessonSummary | undefined;
  teachers: string[];
  observer: string;
  text: string;
};

/** Лента «Общих выводов»: урок, педагоги, наблюдатель, текст; поиск по тексту. */
export function phenomenonComments(records: PhenomenonRecord[], search = ''): PhenomenonComment[] {
  const byRecord = new Map<number, PhenomenonLessonSummary>();
  for (const l of summarizePhenomenonLessons(records)) for (const id of l.recordIds) byRecord.set(id, l);
  const q = personKey(search);
  return records
    .filter((r) => r.comments.trim())
    .filter((r) => !q || personKey(r.comments).includes(q))
    .map((r) => ({
      id: r.id,
      date: r.date,
      lesson: byRecord.get(r.id),
      teachers: [r.teacher1, r.teacher2].sort((a, b) => a.localeCompare(b, 'ru')),
      observer: r.observer,
      text: r.comments,
    }))
    .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? 1 : -1));
}

export type PhenomenonWeekDynamics = { week: PhenomenonWeek; summary: PhenomenonWeekSummary };

/** Динамика: сводка по каждой неделе (по порядку дат), только недели с чек-листами. */
export function phenomenonDynamics(records: PhenomenonRecord[], weeks: PhenomenonWeek[] = PHENOMENON_WEEKS): PhenomenonWeekDynamics[] {
  return [...weeks]
    .sort((a, b) => (a.from < b.from ? -1 : 1))
    .map((week) => ({ week, summary: summarizePhenomenonWeek(phenomenonRecordsForWeek(records, week.id, weeks)) }))
    .filter((x) => x.summary.checklists > 0);
}
