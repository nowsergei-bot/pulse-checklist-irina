/** Бренд в заголовке вкладки браузера. */
export const DOCUMENT_TITLE_BRAND = 'Пульс';

export const DOCUMENT_TITLE_DEFAULT = `${DOCUMENT_TITLE_BRAND} · Гимназия им. Е.М. Примакова`;

/** «Заголовок страницы · Пульс» */
export function formatDocumentTitle(pageTitle: string): string {
  const t = pageTitle.trim();
  if (!t) return DOCUMENT_TITLE_DEFAULT;
  if (t === DOCUMENT_TITLE_BRAND || t.endsWith(` · ${DOCUMENT_TITLE_BRAND}`)) return t;
  return `${t} · ${DOCUMENT_TITLE_BRAND}`;
}

const LESSON_ANALYTICS_TITLE_BASE = 'Аналитика уроков';

/**
 * Заголовок вкладки для модуля «Аналитика уроков»: всегда с «Аналитика»,
 * даже если в проекте сохранено только «уроков» или короткое имя.
 */
export function displayLessonAnalyticsTitle(projectTitle?: string | null): string {
  const raw = String(projectTitle ?? '').trim();
  if (!raw || /^аналитика\s+уроков$/i.test(raw)) return LESSON_ANALYTICS_TITLE_BASE;
  if (/аналитика/i.test(raw) && /урок/i.test(raw)) return raw;
  if (/^уроков?$/i.test(raw) || /^урок/i.test(raw)) return LESSON_ANALYTICS_TITLE_BASE;
  return `${LESSON_ANALYTICS_TITLE_BASE} · ${raw}`;
}

type TitleRule = { test: (path: string) => boolean; title: string | ((path: string) => string) };

/** От более специфичных путей к общим. */
const ROUTE_TITLE_RULES: TitleRule[] = [
  { test: (p) => /^\/s\/[^/]+\/quizpliz-dashboard$/.test(p), title: 'ПРИМА КВИЗ, ПЛИЗ! · дашборд' },
  { test: (p) => /^\/s\/[^/]+\/liga-reflection-dashboard$/.test(p), title: 'Лига домов · дашборд рефлексии' },
  { test: (p) => /^\/s\/[^/]+\/analytics$/.test(p), title: 'Аналитика опроса' },
  { test: (p) => /^\/s\/[^/]+\/results$/.test(p), title: 'Результаты опроса' },
  { test: (p) => /^\/surveys\/[^/]+\/analytics$/.test(p), title: 'Аналитика опроса' },
  { test: (p) => /^\/surveys\/[^/]+\/results$/.test(p), title: 'Результаты опроса' },
  { test: (p) => /^\/surveys\/[^/]+\/edit$/.test(p), title: 'Редактор опроса' },
  { test: (p) => /^\/director\/[^/]+\/lessons\/[^/]+$/.test(p), title: 'Урок · сводка для руководителя' },
  { test: (p) => /^\/director\/[^/]+\/lessons$/.test(p), title: 'Уроки · для руководителя' },
  { test: (p) => /^\/director\/[^/]+$/.test(p), title: 'Сводка для руководителя' },
  { test: (p) => /^\/view\/lesson-visit-checklist\//.test(p), title: 'Чек-лист урока · для руководителя' },
  { test: (p) => /^\/view\/lesson-analytics\//.test(p), title: 'Аналитика уроков · просмотр' },
  { test: (p) => /^\/view\/additional-education\//.test(p), title: 'Доп. образование · просмотр' },
  { test: (p) => /^\/view\/parent-pulse\//.test(p), title: 'Пульс родителей · просмотр' },
  { test: (p) => /^\/view\/teacher-booking\//.test(p), title: 'Запись на мероприятия · просмотр' },
  { test: (p) => /^\/view\/file-collection/.test(p), title: 'Сбор файлов' },
  { test: (p) => /^\/phenomenal-report\//.test(p), title: 'Феноменальные уроки · отчёт' },
  { test: (p) => /^\/analytics\/lesson-analytics\/project$/.test(p), title: 'Аналитика уроков · проект' },
  { test: (p) => /^\/analytics\/additional-education\/parent-pulse\/project$/.test(p), title: 'Пульс родителей · проект' },
  { test: (p) => /^\/analytics\/additional-education\/parent-pulse$/.test(p), title: 'Пульс родителей' },
  { test: (p) => /^\/analytics\/additional-education\/project$/.test(p), title: 'Доп. образование · проект' },
  { test: (p) => /^\/analytics\/phenomenal\/report$/.test(p), title: 'Феноменальные уроки · редактор' },
  { test: (p) => p === '/analytics/phenomenal', title: 'Феноменальные уроки' },
  { test: (p) => p === '/analytics/lesson-analytics', title: 'Аналитика уроков' },
  { test: (p) => p === '/analytics/additional-education', title: 'Дополнительное образование' },
  { test: (p) => /^\/analytics\/teacher-booking\/project$/.test(p), title: 'Запись на мероприятия · календарь' },
  { test: (p) => p === '/ops-meetings', title: 'Посещение оперативного совещания' },
  { test: (p) => p === '/analytics/ops-meetings', title: 'Посещение оперативных совещаний' },
  { test: (p) => p === '/analytics/excel', title: 'Наблюдения из таблицы' },
  { test: (p) => p === '/analytics/surveys', title: 'Сводка по опросам' },
  { test: (p) => /^\/analytics\/english-assessment/.test(p), title: 'Мониторинг результатов по английскому языку' },
  { test: (p) => /^\/cabinet\/as\/english/.test(p) || /^\/cabinet\/english/.test(p), title: 'Результаты тестов по английскому' },
  { test: (p) => /^\/cabinet\/as\/ei/.test(p) || /^\/cabinet\/ei/.test(p), title: 'Эмоциональный интеллект' },
  { test: (p) => /^\/ei\/(join|j)\b/.test(p), title: 'Эмоциональный интеллект · вход' },
  { test: (p) => /^\/ei\//.test(p), title: 'Эмоциональный интеллект · киоск' },
  { test: (p) => /^\/cabinet\/as\/feedback\/me/.test(p) || /^\/cabinet\/feedback\/me/.test(p), title: 'Моя обратная связь' },
  { test: (p) => /^\/cabinet\/as\/feedback\/schedule/.test(p) || /^\/cabinet\/feedback\/schedule/.test(p), title: 'График посещения' },
  { test: (p) => /^\/cabinet\/as\/visit-checklist/.test(p) || /^\/cabinet\/visit-checklist/.test(p), title: 'Чек-лист директора' },
  { test: (p) => /^\/cabinet\/as\/lesson-visits/.test(p) || /^\/cabinet\/lesson-visits/.test(p), title: 'График посещения' },
  { test: (p) => /^\/cabinet\/as\/spreadsheets/.test(p) || /^\/cabinet\/spreadsheets/.test(p), title: 'Электронные таблицы' },
  { test: (p) => /^\/tables\//.test(p), title: 'Таблица' },
  { test: (p) => /^\/cabinet\/as\/feedback/.test(p) || /^\/cabinet\/feedback/.test(p), title: 'Чек-лист посещения урока' },
  { test: (p) => p === '/cabinet/settings' || p === '/cabinet/as/settings', title: 'Настройки кабинета' },
  { test: (p) => p === '/cabinet/onboarding', title: 'Настройка кабинета' },
  { test: (p) => p === '/cabinet/notifications' || p === '/cabinet/as/notifications', title: 'Уведомления' },
  { test: (p) => p === '/cabinet/surveys/mine' || p === '/cabinet/as/surveys/mine', title: 'Мои опросы' },
  { test: (p) => p === '/cabinet/surveys/results' || p === '/cabinet/as/surveys/results', title: 'Результаты опроса' },
  { test: (p) => p === '/cabinet/surveys' || p.startsWith('/cabinet/surveys/') || p === '/cabinet/as/surveys' || p.startsWith('/cabinet/as/surveys/'), title: 'Опросы' },
  { test: (p) => p === '/cabinet/report-problem' || p === '/cabinet/as/report-problem', title: 'Сообщить о проблеме' },
  { test: (p) => p === '/cabinet/events' || p === '/cabinet/as/events', title: 'Календарь гимназии' },
  { test: (p) => p === '/cabinet/directory' || p === '/cabinet/as/directory', title: 'Подразделения и кафедры' },
  { test: (p) => p === '/cabinet/platform-admin' || p === '/cabinet/as/platform-admin', title: 'Администратор Пульса' },
  { test: (p) => p === '/cabinet/pulse-data' || p === '/cabinet/as/pulse-data', title: 'Данные Пульса' },
  { test: (p) => p === '/cabinet/speech-timer' || p === '/cabinet/as/speech-timer', title: 'Управление таймером выступлений' },
  { test: (p) => p === '/cabinet/pep-signature' || p === '/cabinet/as/pep-signature', title: 'ПЭП (подпись)' },
  { test: (p) => p === '/cabinet/teambuilding' || p === '/cabinet/as/teambuilding', title: 'Тимбилдинг' },
  { test: (p) => p === '/cabinet/forum-sessions' || p === '/cabinet/as/forum-sessions', title: 'Слоты и отзывы форума' },
  { test: (p) => p === '/cabinet/admin' || p === '/cabinet/as/admin', title: 'Инструменты платформы' },
  { test: (p) => p === '/analytics/teacher-booking' || p.startsWith('/analytics/teacher-booking/'), title: 'Запись на съёмки' },
  { test: (p) => p.startsWith('/protocol-tasks'), title: 'Поручения' },
  { test: (p) => /^\/cabinet\/as/.test(p), title: 'Просмотр кабинета сотрудника' },
  { test: (p) => p === '/cabinet' || p === '/kabinet', title: 'Личный кабинет' },
  { test: (p) => p === '/analytics', title: 'Модули аналитики' },
  { test: (p) => p === '/surveys/new', title: 'Создать опрос' },
  { test: (p) => p === '/surveys/new/manual', title: 'Новый опрос' },
  { test: (p) => p === '/surveys/quick', title: 'Быстрый опрос' },
  { test: (p) => p === '/surveys/groups', title: 'Разделы опросов' },
  { test: (p) => p === '/import-workbook', title: 'Новый опрос из Excel' },
  { test: (p) => p === '/pulse-ai', title: 'Личный кабинет' },
  { test: (p) => p === '/audio-to-text/app', title: 'Аудио в текст' },
  { test: (p) => p === '/audio-to-text', title: 'Установить «Аудио в текст»' },
  { test: (p) => p === '/audio-protocol', title: 'Аудио в текст' },
  { test: (p) => p === '/audio-protocol/archive', title: 'Архив протоколов' },
  { test: (p) => p === '/meetings/archive', title: 'Мои записи встреч' },
  { test: (p) => p === '/meetings', title: 'Запись встреч' },
  { test: (p) => p.startsWith('/audio-protocol/day/'), title: 'Встречи и совещания дня' },
  { test: (p) => p.startsWith('/audio-protocol/event/'), title: 'Запись протокола' },
  { test: (p) => p === '/file-collection' || p === '/file-collection/admin', title: 'Сбор файлов · админка' },
  { test: (p) => p === '/file-collection/builder', title: 'Опрос: сбор файлов' },
  { test: (p) => p === '/photo-wall/results', title: 'Фотостена · результаты' },
  { test: (p) => p === '/photo-wall/collage-settings', title: 'Фотостена · коллаж' },
  { test: (p) => p === '/photo-wall/display', title: 'Фотостена · экран' },
  { test: (p) => p === '/photo-wall/test', title: 'Фотостена · тест' },
  { test: (p) => p === '/photo-wall', title: 'Фотостена · загрузка' },
  { test: (p) => p === '/maxims' || p === '/cabinet/maxims', title: 'Гадание по Максимам' },
  { test: (p) => p === '/gimn-gimnazii', title: 'Гимн гимназии' },
  { test: (p) => p === '/speech-timer' || p === '/spich', title: 'Таймер выступления' },
  { test: (p) => p === '/programma/edit', title: 'Редактирование программы' },
  { test: (p) => p === '/programma', title: 'Программа конкурсов' },
  { test: (p) => p === '/directors-club', title: 'Клуб директоров Московской области' },
  { test: (p) => p === '/priezzhaj' || p === '/pri-ezzhaj', title: 'PRIезжай с коллегой' },
  { test: (p) => p === '/self-study/magadan/reflection', title: 'Рефлексия · Магадан' },
  { test: (p) => p === '/self-study/magadan/review' || p === '/self-study/magadan/razbor' || p === '/razbor', title: 'Результаты сдачи · Магадан' },
  { test: (p) => p === '/self-study/magadan' || p === '/samouchiteli/magadan', title: 'Самоучитель по ИИ' },
  { test: (p) => p === '/job-descriptions/inbox', title: 'ДИ · согласование' },
  { test: (p) => p === '/job-descriptions/all', title: 'ДИ · все инструкции' },
  { test: (p) => p === '/job-descriptions/routes', title: 'ДИ · маршруты' },
  { test: (p) => p.startsWith('/job-descriptions/edit'), title: 'ДИ · редактор' },
  { test: (p) => p.startsWith('/job-descriptions/preview'), title: 'ДИ · документ' },
  { test: (p) => p === '/job-descriptions' || p.startsWith('/job-descriptions/'), title: 'Должностные инструкции' },
  { test: (p) => p === '/analytics/checklist-2' || p === '/analytics/checklist-3' || p === '/analytics/visit-checklist', title: 'Чек-лист директора' },
  { test: (p) => p === '/analytics/lesson-visit/dashboard' || p.startsWith('/analytics/lesson-visit/dashboard'), title: LESSON_ANALYTICS_TITLE_BASE },
  { test: (p) => p === '/analytics/lesson-visit' || p.startsWith('/analytics/lesson-visit/'), title: 'Чек-лист посещения урока' },
  { test: (p) => p === '/lesson-visit-checklist', title: 'Чек-лист посещения урока' },
  { test: (p) => /^\/view\/lesson-visit\/[^/]+$/.test(p), title: 'Чек-лист посещения урока' },
  { test: (p) => /^\/view\/lesson-analytics\/[^/]+$/.test(p), title: 'Для руководителя' },
  { test: (p) => /^\/view\/lesson-visit-checklist\/[^/]+$/.test(p), title: 'Чек-лист · для руководителя' },
  { test: (p) => p === '/auth/local', title: 'Вход · тест и API' },
  { test: (p) => p === '/auth', title: 'Вход для сотрудников' },
  { test: (p) => p === '/report-problem', title: 'Сообщить о проблеме' },
  { test: (p) => p === '/install-app', title: 'Установить на телефон' },
  { test: (p) => /^\/surveys\/[^/]+\/engagement-dashboard$/.test(p), title: 'Вовлечённость · дашборд' },
  { test: (p) => /^\/s\/[^/]+\/dashboard$/.test(p), title: 'Вовлечённость · дашборд' },
  {
    test: (p) => /^\/s\/[^/]+\/grade10-dashboard$/.test(p),
    title: (p) =>
      /\/s\/9klass/i.test(p) ? '9 класс · цели и планы' : /\/s\/11klass/i.test(p) ? '11 класс · цели и планы' : '10 класс · цели и планы',
  },
  { test: (p) => /^\/s\/[^/]+\/grade5-dashboard$/.test(p), title: '5 классы · опрос' },
  { test: (p) => /^\/s\/[^/]+\/newcomers-dashboard$/.test(p), title: 'Новые гимназисты' },
  { test: (p) => /^\/s\//.test(p), title: 'Опрос' },
  { test: (p) => p === '/', title: 'Пульс · главная' },
];

export function resolveRouteTitle(pathname: string): string {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  for (const rule of ROUTE_TITLE_RULES) {
    if (rule.test(path)) return typeof rule.title === 'function' ? rule.title(path) : rule.title;
  }
  return DOCUMENT_TITLE_BRAND;
}
