import type { Question, Survey } from '../types';
import moEngagementLocalesEn from '../data/moEngagementLocalesEn.json';

export type SurveyLocale = 'ru' | 'en';

/** Опрос вовлечённости МО: slug в scripts/data/mo-engagement-survey.json */
export const MO_ENGAGEMENT_ACCESS_LINK_PREFIX = 'mo-vovlechennost';

/** Анкета обратной связи родителей: slug в scripts/data/parent-feedback-survey.json */
export const PARENT_FEEDBACK_ACCESS_LINK_PREFIX = 'parent-feedback';

export function isParentFeedbackAccessLink(accessLink: string | null | undefined): boolean {
  return Boolean(accessLink?.startsWith(PARENT_FEEDBACK_ACCESS_LINK_PREFIX));
}

/** Опрос об отсутствии ребёнка: scripts/data/parent-absence-survey.json */
export const PARENT_ABSENCE_ACCESS_LINK = '772db23ea35040eeaf518118d45be53c';

export function isParentAbsenceAccessLink(accessLink: string | null | undefined): boolean {
  return accessLink === PARENT_ABSENCE_ACCESS_LINK;
}

/** Анкета 10 класса «Мои цели, интересы и планы»: slug в scripts/data/grade10-goals-plans-survey.json */
export const GRADE10_GOALS_ACCESS_LINK_PREFIX = '10klass-celi-plany';
/** Анкета 11 класса: slug в scripts/data/grade11-goals-plans-survey.json */
export const GRADE11_GOALS_ACCESS_LINK_PREFIX = '11klass-celi-plany';
/** Анкета 9 класса: slug в scripts/data/grade9-goals-plans-survey.json */
export const GRADE9_GOALS_ACCESS_LINK_PREFIX = '9klass-celi-plany';

export function isGrade10GoalsAccessLink(accessLink: string | null | undefined): boolean {
  const s = accessLink?.toLowerCase() || '';
  return (
    s.startsWith(GRADE9_GOALS_ACCESS_LINK_PREFIX) ||
    s.startsWith(GRADE10_GOALS_ACCESS_LINK_PREFIX) ||
    s.startsWith(GRADE11_GOALS_ACCESS_LINK_PREFIX)
  );
}

/** Опрос гимназистов 5-х классов: slug в scripts/data/grade5-gymnasium-survey.json */
export const GRADE5_GYMNASIUM_ACCESS_LINK_PREFIX = '5klass-opros';
/** Опрос новых гимназистов: slug в scripts/data/newcomers-gymnasium-survey.json */
export const NEWCOMERS_GYMNASIUM_ACCESS_LINK_PREFIX = 'novye-gimnazisty';

export function isGrade5GymnasiumAccessLink(accessLink: string | null | undefined): boolean {
  return Boolean(accessLink?.toLowerCase().startsWith(GRADE5_GYMNASIUM_ACCESS_LINK_PREFIX));
}

export function isNewcomersGymnasiumAccessLink(accessLink: string | null | undefined): boolean {
  return Boolean(accessLink?.toLowerCase().startsWith(NEWCOMERS_GYMNASIUM_ACCESS_LINK_PREFIX));
}

export function isGymnasiumStudentPulseAccessLink(accessLink: string | null | undefined): boolean {
  return isGrade5GymnasiumAccessLink(accessLink) || isNewcomersGymnasiumAccessLink(accessLink);
}

/** Параллель анкеты «цели и планы»: 9, 10 или 11. */
export function gradeGoalsClassNumber(accessLink: string | null | undefined): 9 | 10 | 11 {
  const s = accessLink?.toLowerCase() || '';
  if (s.startsWith(GRADE9_GOALS_ACCESS_LINK_PREFIX)) return 9;
  if (s.startsWith(GRADE11_GOALS_ACCESS_LINK_PREFIX)) return 11;
  return 10;
}

/** Корпоративный тимбилдинг: slug в scripts/data/corporate-teambuilding-survey.json */
export const CORPORATE_TEAMBUILDING_ACCESS_LINK_PREFIX = 'corporate-teambuilding';

export function isCorporateTeambuildingAccessLink(accessLink: string | null | undefined): boolean {
  return Boolean(accessLink?.toLowerCase().startsWith(CORPORATE_TEAMBUILDING_ACCESS_LINK_PREFIX));
}

/** Detect by question types when access_link may differ. */
export function isCorporateTeambuildingSurvey(
  accessLink: string | null | undefined,
  questions?: { type: string }[] | null,
): boolean {
  if (isCorporateTeambuildingAccessLink(accessLink)) return true;
  if (!questions?.length) return false;
  return questions.some((q) => q.type === 'person_select') && questions.some((q) => q.type === 'table_seat');
}

/** Обратная связь по тимбилдингу (feedback, не регистрация) */
export const TEAMBUILDING_FEEDBACK_ACCESS_LINK_PREFIX = 'teambuilding-zavidovo-feedback';

export function isTeambuildingFeedbackAccessLink(accessLink: string | null | undefined): boolean {
  return Boolean(accessLink?.toLowerCase().startsWith(TEAMBUILDING_FEEDBACK_ACCESS_LINK_PREFIX));
}

/** Форум Магадан: выбор тем проектных сессий */
export const FORUM_TOPIC_SLOTS_ACCESS_LINK_PREFIX = 'magadan-forum-project-session';

export function isForumTopicSlotsAccessLink(accessLink: string | null | undefined): boolean {
  return Boolean(accessLink?.toLowerCase().startsWith(FORUM_TOPIC_SLOTS_ACCESS_LINK_PREFIX));
}

export function isForumTopicSlotsSurvey(
  accessLink: string | null | undefined,
  questions?: { type: string }[] | null,
): boolean {
  if (isForumTopicSlotsAccessLink(accessLink)) return true;
  return Boolean(questions?.some((q) => q.type === 'topic_slots'));
}

/** Форум Магадан: обратная связь по мастер-классам */
export const FORUM_TOPIC_FEEDBACK_ACCESS_LINK_PREFIX = 'magadan-forum-feedback';

export function isForumTopicFeedbackAccessLink(accessLink: string | null | undefined): boolean {
  return Boolean(accessLink?.toLowerCase().startsWith(FORUM_TOPIC_FEEDBACK_ACCESS_LINK_PREFIX));
}

export function isForumTopicFeedbackSurvey(
  accessLink: string | null | undefined,
  questions?: { type: string }[] | null,
): boolean {
  if (isForumTopicFeedbackAccessLink(accessLink)) return true;
  return Boolean(questions?.some((q) => q.type === 'topic_feedback_rounds'));
}

export {
  METHOD_HELP_ACCESS_LINK,
  METHOD_HELP_ACCESS_LINK_PREFIX,
  isMethodHelpAccessLink,
} from './methodHelpDashboard';

export {
  PRIMA_QUIZPLIZ_REGISTRATION_ACCESS_LINK,
  LIGA_DOMOV_CHILD_REFLECTION_ACCESS_LINK,
  HOUSES,
  HOUSE_COLORS,
  isPrimaQuizplizRegistrationAccessLink,
  isLigaDomovChildReflectionAccessLink,
} from './housesLeagueSurveyI18n';

/** Опрос «Рабочее время педагогов»: slug в scripts/data/teacher-working-time-survey.json */
export function isTeacherWorkingTimeAccessLink(accessLink: string | null | undefined): boolean {
  if (!accessLink) return false;
  return accessLink === 'rabochee-vremya-2026-27' || accessLink.startsWith('rabochee-vremya-');
}

/** Результаты: только сетки по педагогам (без карточек ФИО/кафедры и сводки по умолчанию). */
export function isTeacherWorkingTimeResultsView(
  accessLink: string | null | undefined,
  questions?: { type: string }[] | null,
): boolean {
  if (isTeacherWorkingTimeAccessLink(accessLink)) return true;
  return Boolean(questions?.some((q) => q.type === 'teacher_availability'));
}

type MoEngagementLocalesEn = {
  title?: string;
  description?: string;
};

const MO_ENGAGEMENT_LOCALES = moEngagementLocalesEn as MoEngagementLocalesEn;

export const SURVEY_OTHER_VALUE = 'Другое';

const OTHER_BASE_RE = /^(другое|другими(?:\s*\([^)]*\))?)$/i;
const OTHER_PREFIXED_RE = /^(другое|другими(?:\s*\([^)]*\))?)\s*:/i;

/** «Другое» or «Другими (укажите какими)» — with or without typed suffix. */
export function isOtherChoiceValue(value: string): boolean {
  const s = String(value || '').trim();
  return OTHER_BASE_RE.test(s) || OTHER_PREFIXED_RE.test(s);
}

export function findOtherChoiceLabel(choices: string[]): string | null {
  const found = choices.find((c) => OTHER_BASE_RE.test(String(c).trim()));
  return found ?? null;
}

export type SurveyUiStrings = {
  loading: string;
  submit: string;
  submitting: string;
  thanksTitle: string;
  thanksBody: string;
  retake: string;
  scaleRequired: string;
  scaleOptional: string;
  notSelected: string;
  otherPlaceholder: string;
  unavailableTitle: string;
};

const DEFAULT_UI: Record<SurveyLocale, SurveyUiStrings> = {
  ru: {
    loading: 'Загрузка опроса…',
    submit: 'Отправить ответы',
    submitting: 'Отправка…',
    thanksTitle: 'Спасибо!',
    thanksBody: 'Ваши ответы сохранены.',
    retake: 'Пройти опрос еще раз',
    scaleRequired: 'Выберите значение на шкале.',
    scaleOptional: 'Необязательный вопрос — можно пропустить.',
    notSelected: '— не выбрано —',
    otherPlaceholder: 'Уточните…',
    unavailableTitle: 'Опрос недоступен',
  },
  en: {
    loading: 'Loading survey…',
    submit: 'Submit responses',
    submitting: 'Submitting…',
    thanksTitle: 'Thank you!',
    thanksBody: 'Your responses have been saved.',
    retake: 'Take the survey again',
    scaleRequired: 'Please select a value on the scale.',
    scaleOptional: 'Optional question — you may skip it.',
    notSelected: '— not selected —',
    otherPlaceholder: 'Please specify…',
    unavailableTitle: 'Survey unavailable',
  },
};

export type SurveyI18nMedia = {
  enabled?: boolean;
  defaultLocale?: SurveyLocale;
  ru?: { title?: string; description?: string; ui?: Partial<SurveyUiStrings> };
  en?: { title?: string; description?: string; ui?: Partial<SurveyUiStrings> };
};

type QuestionI18nOptions = {
  helpText?: string;
  sectionNumber?: number;
  sectionTitle?: string;
  i18n?: {
    text?: Partial<Record<SurveyLocale, string>>;
    helpText?: Partial<Record<SurveyLocale, string>>;
    sectionTitle?: Partial<Record<SurveyLocale, string>>;
    choices?: Array<Partial<Record<SurveyLocale, string>>>;
  };
  choices?: unknown[];
  min?: number;
  max?: number;
  maxLength?: number;
};

export function isMoEngagementAccessLink(accessLink: string | null | undefined): boolean {
  return Boolean(accessLink?.startsWith(MO_ENGAGEMENT_ACCESS_LINK_PREFIX));
}

function surveyHasQuestionI18n(survey: Survey | null | undefined): boolean {
  return Boolean(survey?.questions?.some((q) => questionHasI18n(q)));
}

function buildMoEngagementFallbackMedia(survey: Survey): SurveyI18nMedia {
  const dbI18n =
    survey.media && typeof survey.media === 'object'
      ? (survey.media as { i18n?: SurveyI18nMedia }).i18n
      : undefined;
  return {
    enabled: true,
    defaultLocale: 'ru',
    ru: {
      title: dbI18n?.ru?.title ?? survey.title,
      description: dbI18n?.ru?.description ?? survey.description ?? '',
      ui: dbI18n?.ru?.ui,
    },
    en: {
      title: dbI18n?.en?.title ?? MO_ENGAGEMENT_LOCALES.title ?? survey.title,
      description:
        dbI18n?.en?.description ?? MO_ENGAGEMENT_LOCALES.description ?? survey.description ?? '',
      ui: dbI18n?.en?.ui,
    },
  };
}

function buildQuestionI18nFallbackMedia(survey: Survey): SurveyI18nMedia {
  const dbI18n =
    survey.media && typeof survey.media === 'object'
      ? (survey.media as { i18n?: SurveyI18nMedia }).i18n
      : undefined;
  return {
    enabled: true,
    defaultLocale: dbI18n?.defaultLocale ?? 'ru',
    ru: {
      title: dbI18n?.ru?.title ?? survey.title,
      description: dbI18n?.ru?.description ?? survey.description ?? '',
      ui: dbI18n?.ru?.ui,
    },
    en: dbI18n?.en,
  };
}

function moEngagementLocalesPack(): SurveyI18nMedia {
  return {
    enabled: true,
    defaultLocale: 'ru',
    en: {
      title: MO_ENGAGEMENT_LOCALES.title,
      description: MO_ENGAGEMENT_LOCALES.description,
    },
  };
}

export function getSurveyI18nMedia(
  survey: Survey | null | undefined,
  accessLink?: string | null,
): SurveyI18nMedia | null {
  const link = accessLink ?? survey?.access_link ?? '';

  if (survey?.media && typeof survey.media === 'object') {
    const i18n = (survey.media as { i18n?: SurveyI18nMedia }).i18n;
    if (i18n?.enabled) return i18n;
  }

  if (survey && isMoEngagementAccessLink(link)) {
    return buildMoEngagementFallbackMedia(survey);
  }

  if (survey && surveyHasQuestionI18n(survey)) {
    return buildQuestionI18nFallbackMedia(survey);
  }

  if (!survey && isMoEngagementAccessLink(link)) {
    return moEngagementLocalesPack();
  }

  return null;
}

/** @deprecated Prefer surveySupportsI18n */
export function isSurveyI18nEnabled(
  survey: Survey | null | undefined,
  accessLink?: string | null,
): boolean {
  return surveySupportsI18n(survey, accessLink);
}

export function surveySupportsI18n(
  survey: Survey | null | undefined,
  accessLink?: string | null,
): boolean {
  return getSurveyI18nMedia(survey, accessLink) != null;
}

/** Публичная форма: переключатель RU/EN только при явном bilingual в конструкторе (или МО). */
export function isSurveyBilingualMode(
  survey: Survey | null | undefined,
  accessLink?: string | null,
): boolean {
  const link = accessLink ?? survey?.access_link ?? '';
  if (isMoEngagementAccessLink(link)) return true;
  if (survey?.media && typeof survey.media === 'object') {
    const i18n = (survey.media as { i18n?: SurveyI18nMedia }).i18n;
    return i18n?.enabled === true;
  }
  return false;
}

export function getSurveyDefaultLocale(
  survey: Survey | null | undefined,
  accessLink?: string | null,
): SurveyLocale {
  const link = accessLink ?? survey?.access_link ?? '';
  if (!isSurveyBilingualMode(survey, accessLink)) return 'ru';
  if (survey?.media && typeof survey.media === 'object') {
    const locale = (survey.media as { i18n?: SurveyI18nMedia }).i18n?.defaultLocale;
    if (locale === 'en' || locale === 'ru') return locale;
  }
  if (isMoEngagementAccessLink(link)) return 'ru';
  return 'ru';
}

/** Публичная форма: локаль только из sessionStorage в двуязычном режиме. */
export function resolvePublicFormLocale(
  survey: Survey,
  accessLink: string,
  storedLocale: SurveyLocale | null,
): SurveyLocale {
  const defaultLocale = getSurveyDefaultLocale(survey, accessLink);
  if (!isSurveyBilingualMode(survey, accessLink)) return defaultLocale;
  return storedLocale ?? defaultLocale;
}

export function getSurveyUiStrings(
  survey: Survey | null | undefined,
  locale: SurveyLocale,
  accessLink?: string | null,
): SurveyUiStrings {
  const base = DEFAULT_UI[locale];
  const pack = getSurveyI18nMedia(survey, accessLink)?.[locale]?.ui;
  return pack ? { ...base, ...pack } : base;
}

export function getSurveyTitle(
  survey: Survey,
  locale: SurveyLocale,
  accessLink?: string | null,
): string {
  const localized = getSurveyI18nMedia(survey, accessLink)?.[locale]?.title;
  if (locale === 'en' && localized) return localized;
  return survey.title;
}

export function getSurveyDescription(
  survey: Survey,
  locale: SurveyLocale,
  accessLink?: string | null,
): string {
  const localized = getSurveyI18nMedia(survey, accessLink)?.[locale]?.description;
  if (locale === 'en' && localized) return localized;
  return survey.description || '';
}

function questionOpts(q: Question): QuestionI18nOptions {
  if (!q.options || typeof q.options !== 'object' || Array.isArray(q.options)) {
    return Array.isArray(q.options) ? { choices: q.options } : {};
  }
  return q.options as QuestionI18nOptions;
}

export function questionHasI18n(q: Question): boolean {
  return Boolean(questionOpts(q).i18n);
}

/** Canonical stored values for radio/checkbox (Russian labels in DB). */
export function getChoiceValues(q: Question): string[] {
  const opts = questionOpts(q);
  if (Array.isArray(opts.choices)) return opts.choices.map(String);
  if (Array.isArray(q.options)) return q.options.map(String);
  return [];
}

export function getQuestionText(q: Question, locale: SurveyLocale): string {
  const i18n = questionOpts(q).i18n;
  if (locale === 'en' && i18n?.text?.en) return i18n.text.en;
  return q.text;
}

/** Серый текст под формулировкой вопроса (options.helpText / i18n.helpText). */
export function getQuestionHelpText(q: Question, locale: SurveyLocale): string {
  const opts = questionOpts(q);
  if (locale === 'en' && opts.i18n?.helpText?.en) return opts.i18n.helpText.en;
  if (typeof opts.helpText === 'string' && opts.helpText.trim()) return opts.helpText.trim();
  if (opts.i18n?.helpText?.ru) return opts.i18n.helpText.ru;
  return '';
}

/** Заголовок раздела (МО и др. опросы с sectionTitle в options). */
export function getQuestionSectionTitle(q: Question, locale: SurveyLocale): string {
  const opts = questionOpts(q);
  if (locale === 'en' && opts.i18n?.sectionTitle?.en) return opts.i18n.sectionTitle.en;
  if (typeof opts.sectionTitle === 'string' && opts.sectionTitle.trim()) return opts.sectionTitle.trim();
  if (opts.i18n?.sectionTitle?.ru) return opts.i18n.sectionTitle.ru;
  return '';
}

type PersonSelectOptionStrings = {
  notInListLabel?: string;
  manualNamePlaceholder?: string;
  i18n?: {
    notInListLabel?: Partial<Record<SurveyLocale, string>>;
    manualNamePlaceholder?: Partial<Record<SurveyLocale, string>>;
  };
};

function personSelectOpts(q: Question): PersonSelectOptionStrings {
  return questionOpts(q) as PersonSelectOptionStrings;
}

export function getPersonSelectNotInListLabel(q: Question, locale: SurveyLocale): string {
  const opts = personSelectOpts(q);
  if (locale === 'en' && opts.i18n?.notInListLabel?.en) return opts.i18n.notInListLabel.en;
  if (typeof opts.notInListLabel === 'string' && opts.notInListLabel.trim()) return opts.notInListLabel.trim();
  if (opts.i18n?.notInListLabel?.ru) return opts.i18n.notInListLabel.ru;
  return locale === 'en' ? 'My name is not on the list' : 'Моей фамилии нет в списке';
}

export function getPersonSelectManualPlaceholder(q: Question, locale: SurveyLocale): string {
  const opts = personSelectOpts(q);
  if (locale === 'en' && opts.i18n?.manualNamePlaceholder?.en) return opts.i18n.manualNamePlaceholder.en;
  if (typeof opts.manualNamePlaceholder === 'string' && opts.manualNamePlaceholder.trim()) {
    return opts.manualNamePlaceholder.trim();
  }
  if (opts.i18n?.manualNamePlaceholder?.ru) return opts.i18n.manualNamePlaceholder.ru;
  return locale === 'en' ? 'Last name First name Patronymic' : 'Фамилия Имя Отчество';
}

/** Display labels for choices in the selected locale. */
export function getChoiceDisplayLabels(q: Question, locale: SurveyLocale): string[] {
  const values = getChoiceValues(q);
  const i18n = questionOpts(q).i18n;
  return values.map((val, i) => {
    if (locale === 'en') {
      const en = i18n?.choices?.[i]?.en;
      if (en) return en;
    }
    return val;
  });
}

export function choiceValueToDisplay(q: Question, value: string, locale: SurveyLocale): string {
  const values = getChoiceValues(q);
  const idx = values.indexOf(value);
  if (idx < 0) return value;
  return getChoiceDisplayLabels(q, locale)[idx] ?? value;
}

export function choiceDisplayToValue(q: Question, displayLabel: string, locale: SurveyLocale): string {
  const labels = getChoiceDisplayLabels(q, locale);
  const idx = labels.indexOf(displayLabel);
  if (idx >= 0) return getChoiceValues(q)[idx] ?? displayLabel;
  return displayLabel;
}


export function getScaleOptions(q: Question): { min: number; max: number } {
  const opts = questionOpts(q);
  if (typeof opts.min === 'number' && typeof opts.max === 'number') {
    return { min: opts.min, max: opts.max };
  }
  if (q.options && typeof q.options === 'object' && !Array.isArray(q.options)) {
    const o = q.options as { min?: number; max?: number };
    return { min: o.min ?? 1, max: o.max ?? 10 };
  }
  return { min: 1, max: q.type === 'rating' ? 5 : 10 };
}
