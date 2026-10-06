import type { QuestionType } from '../types';
import { hasStaffSessionHint } from '../lib/staffSession';
import { getUserAnalyticsWorkspaceCache, scheduleUserAnalyticsWorkspacePatch } from '../lib/userAnalyticsWorkspace';

export type SurveyTemplateQuestion = {
  text: string;
  type: QuestionType;
  options: unknown;
  required?: boolean;
};

export type SurveyTemplate = {
  id: string;
  emoji: string;
  category: string;
  title: string;
  description: string;
  questions: SurveyTemplateQuestion[];
};

const blank: SurveyTemplate = {
  id: 'blank',
  emoji: '✨',
  category: 'Базовый',
  title: '',
  description: '',
  questions: [],
};

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    id: 'udovletvorennost-servis',
    emoji: '⭐',
    category: 'Сервис',
    title: 'Удовлетворённость сервисом',
    description:
      'Короткий опрос для оценки качества обслуживания: готовность рекомендовать, скорость ответа и свободный комментарий.',
    questions: [
      {
        text: 'Насколько вы довольны качеством сервиса в целом?',
        type: 'rating',
        options: { min: 1, max: 5 },
      },
      {
        text: 'Скорее всего вы порекомендуете нас знакомым или коллегам?',
        type: 'radio',
        options: ['Обязательно да', 'Скорее да', 'Не уверен(а)', 'Скорее нет', 'Точно нет'],
      },
      {
        text: 'Что нам стоит улучшить в первую очередь?',
        type: 'checkbox',
        options: ['Скорость ответа', 'Вежливость', 'Полнота информации', 'Удобство записи / связи', 'Другое'],
      },
      {
        text: 'Дополнительные пожелания или комментарий',
        type: 'text',
        options: { maxLength: 2000 },
      },
    ],
  },
  {
    id: 'posle-meropriyatiya',
    emoji: '🎤',
    category: 'События',
    title: 'Обратная связь после мероприятия',
    description: 'Соберите впечатления участников: организация, контент и формат.',
    questions: [
      {
        text: 'Насколько мероприятие оправдало ваши ожидания?',
        type: 'scale',
        options: { min: 1, max: 10 },
      },
      {
        text: 'Что понравилось больше всего?',
        type: 'checkbox',
        options: ['Программа', 'Спикеры', 'Площадка', 'Нетворкинг', 'Организация', 'Атмосфера'],
      },
      {
        text: 'Порекомендуете ли вы это мероприятие другим?',
        type: 'radio',
        options: ['Да', 'Скорее да', 'Затрудняюсь ответить', 'Скорее нет', 'Нет'],
      },
      {
        text: 'Что стоит изменить в следующий раз?',
        type: 'text',
        options: { maxLength: 2000 },
      },
    ],
  },
  {
    id: 'kurs-zanyatie',
    emoji: '📚',
    category: 'Образование',
    title: 'Оценка занятия / курса',
    description: 'Для преподавателей и методистов: понятность материала и нагрузка.',
    questions: [
      {
        text: 'Материал занятия был понятен?',
        type: 'radio',
        options: ['Полностью', 'В основном', 'Частично', 'Скорее нет', 'Нет'],
      },
      {
        text: 'Оцените темп подачи материала',
        type: 'radio',
        options: ['Слишком медленно', 'Комфортно', 'Слишком быстро'],
      },
      {
        text: 'Насколько полезным было занятие для вас?',
        type: 'scale',
        options: { min: 1, max: 10 },
      },
      {
        text: 'Темы, которые хотелось бы разобрать подробнее',
        type: 'text',
        options: { maxLength: 1500 },
      },
    ],
  },
  {
    id: 'klimat-komandy',
    emoji: '🤝',
    category: 'HR',
    title: 'Анонимный опрос: климат в команде',
    description: 'Короткая анкета без персональных данных — для внутренней аналитики.',
    questions: [
      {
        text: 'В целом я чувствую себя комфортно в нашей команде',
        type: 'scale',
        options: { min: 1, max: 10 },
      },
      {
        text: 'Мне достаточно информации о целях и планах',
        type: 'radio',
        options: ['Да', 'Скорее да', 'Скорее нет', 'Нет'],
      },
      {
        text: 'С чем чаще всего сталкиваетесь? (можно несколько)',
        type: 'checkbox',
        options: ['Перегруз', 'Недостаток обратной связи', 'Неясные приоритеты', 'Конфликты', 'Ничего из перечисленного'],
      },
      {
        text: 'Анонимное предложение по улучшению (необязательно)',
        type: 'text',
        options: { maxLength: 2000 },
      },
    ],
  },
  {
    id: 'vybor-daty',
    emoji: '📅',
    category: 'Организация',
    title: 'Выбор удобной даты встречи',
    description: 'Респонденты отмечают все подходящие дни — удобно для согласования.',
    questions: [
      {
        text: 'Какие дни вам подходят на этой неделе?',
        type: 'checkbox',
        options: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'],
      },
      {
        text: 'Предпочтительное время',
        type: 'radio',
        options: ['Утро (до 12)', 'День (12–17)', 'Вечер (после 17)', 'Гибко'],
      },
      {
        text: 'Комментарий по времени или формату (онлайн / офлайн)',
        type: 'text',
        options: { maxLength: 800 },
      },
    ],
  },
  {
    id: 'registraciya-uchastie',
    emoji: '✅',
    category: 'События',
    title: 'Регистрация на участие',
    description: 'Формат «приду / не приду» плюс контакт и пожелания по питанию.',
    questions: [
      {
        text: 'Подтвердите участие',
        type: 'radio',
        options: ['Буду присутствовать', 'Не смогу прийти', 'Пока не уверен(а)'],
      },
      {
        text: 'Предпочтения по питанию (если актуально)',
        type: 'checkbox',
        options: ['Обычное меню', 'Вегетарианское', 'Без лактозы', 'Без глютена', 'Не требуется'],
      },
      {
        text: 'Контакт для связи (телеграм, телефон или почта)',
        type: 'text',
        options: { maxLength: 200 },
      },
    ],
  },
  {
    id: 'stolovaya',
    emoji: '🍽️',
    category: 'Сервис',
    title: 'Качество питания в столовой',
    description: 'Вкус, разнообразие и чистота — для администрации и поставщика.',
    questions: [
      {
        text: 'Как оцениваете вкус блюд сегодня?',
        type: 'rating',
        options: { min: 1, max: 5 },
      },
      {
        text: 'Достаточно ли разнообразия меню?',
        type: 'radio',
        options: ['Да', 'Скорее да', 'Скорее нет', 'Нет'],
      },
      {
        text: 'Что улучшить в первую очередь?',
        type: 'checkbox',
        options: ['Ассортимент', 'Температура блюд', 'Скорость обслуживания', 'Чистота зала', 'Цены'],
      },
      {
        text: 'Ваш комментарий',
        type: 'text',
        options: { maxLength: 1500 },
      },
    ],
  },
  {
    id: 'parent-feedback-2025',
    emoji: '👨‍👩‍👧',
    category: 'Образование',
    title: 'Анкета обратной связи для родителей по итогам 2025/2026 учебного года',
    description:
      'Анкета обратной связи для родителей: дошкольное отделение, доп. образование, сервисы, информирование и общие впечатления.',
    questions: [
      {
        text: 'Укажите, пожалуйста, группу Вашего ребенка/детей в 2025/2026 учебном году.',
        type: 'checkbox',
        required: true,
        options: [
          'Pre-Nursery - Группа кратковременного пребывания',
          'Nursery',
          'Reception',
          'Year 1',
          'Year 2',
        ],
      },
      {
        text: 'Насколько Вы довольны организацией развивающего и образовательного процессов в дошкольном отделении?',
        type: 'radio',
        required: true,
        options: ['Полностью доволен.', 'Скорее доволен.', 'Не доволен.', 'Другое'],
      },
      {
        text: 'Насколько Вы довольны содержанием учебных программ в дошкольном отделении?',
        type: 'radio',
        required: true,
        options: ['Полностью доволен.', 'Скорее доволен.', 'Не доволен.', 'Другое'],
      },
      {
        text: 'Справляется ли Ваш ребенок с образовательной программой дошкольного отделения Гимназии?',
        type: 'radio',
        required: true,
        options: [
          'Да, справляется. Ему хватает знаний и навыков для того, чтобы легко погрузиться в образовательный процесс.',
          'Не всегда справляется. Сложная программа. Но мы считаем, что это естественные трудности обучения.',
          'Моему ребенку очень сложно справляться с программой. Мы оказываем ему всестороннюю помощь.',
          'Ребенок не справляется с программой. Мы вынуждены обращаться за помощью к внешним специалистам.',
          'Другое',
        ],
      },
      {
        text: 'Насколько Вы довольны мероприятиями в ДО (концерты, экскурсии, тематические недели, мероприятия и т.п.) в целом?',
        type: 'radio',
        required: true,
        options: ['Полностью доволен.', 'Скорее доволен.', 'Не доволен.', 'Другое'],
      },
      {
        text: 'Напишите, пожалуйста, какие мероприятия Вам понравились и запомнились больше всего.',
        type: 'text',
        required: true,
        options: { maxLength: 4000 },
      },
      {
        text: 'Укажите ФИО воспитателя (воспитателей), с которым у Вашего ребенка выстраивается наиболее интересная и продуктивная работа?',
        type: 'text',
        options: { maxLength: 500 },
      },
      {
        text: 'Укажите ФИО воспитателя (воспитателей), с которым Вашему ребенку трудно заниматься в Гимназии, возникают сложности восприятия информации и усвоения учебного материала?',
        type: 'text',
        options: { maxLength: 500 },
      },
      {
        text: 'Насколько Вы довольны взаимодействием воспитателей с детьми?',
        type: 'radio',
        required: true,
        options: ['Полностью доволен.', 'Скорее доволен.', 'Не доволен.', 'Другое'],
      },
      {
        text: 'Насколько Вы довольны взаимодействием воспитателей с родителями?',
        type: 'radio',
        required: true,
        options: ['Полностью доволен.', 'Скорее доволен.', 'Не доволен.'],
      },
      {
        text: 'Насколько Вы довольны качеством предоставляемых дополнительных образовательных услуг?',
        type: 'radio',
        required: true,
        options: [
          'Полностью доволен.',
          'Скорее доволен.',
          'Не доволен.',
          'Ребенок не посещает объединения дополнительного образования в Гимназии.',
          'Другое',
        ],
      },
      {
        text: 'Перечислите названия кружков и секций, работой которых Вы довольны.',
        type: 'text',
        required: true,
        options: { maxLength: 4000 },
      },
      {
        text: 'Перечислите названия кружков и секций, работой которых Вы не довольны.',
        type: 'text',
        required: true,
        options: { maxLength: 4000 },
      },
      {
        text: 'Какие объединения дополнительного образования посещает Ваш ребенок вне нашей Гимназии?',
        type: 'text',
        required: true,
        options: { maxLength: 4000 },
      },
      {
        text: 'Насколько Вы довольны организацией питания?',
        type: 'radio',
        required: true,
        options: ['Полностью доволен.', 'Скорее доволен.', 'Не доволен.', 'Другое'],
      },
      {
        text: 'Насколько Вы довольны работой медицинской службы?',
        type: 'radio',
        required: true,
        options: ['Полностью доволен.', 'Скорее доволен.', 'Не доволен.', 'Другое'],
      },
      {
        text: 'Насколько Вы довольны работой службы безопасности?',
        type: 'radio',
        required: true,
        options: ['Полностью доволен.', 'Скорее доволен.', 'Не доволен.', 'Другое'],
      },
      {
        text: 'Насколько Вы довольны ассортиментом школьной формы и ее качеством?',
        type: 'radio',
        required: true,
        options: ['Полностью доволен.', 'Скорее доволен.', 'Не доволен.', 'Другое'],
      },
      {
        text: 'Насколько Вы информированы о событиях и мероприятиях, проводимых в Гимназии?',
        type: 'radio',
        required: true,
        options: ['Полностью.', 'Частично.'],
      },
      {
        text: 'Какие источники информации Вы используете, чтобы узнать о событиях и жизни Гимназии?',
        type: 'checkbox',
        required: true,
        options: [
          'Всю информацию получаем через воспитателя из ClassDojo.',
          'Подписаны на Telegram-канал Гимназии.',
          'Узнаем от своего ребенка.',
          'Подписаны на страницу Гимназии в социальной сети ВКонтакте.',
          'Следим за информацией на официальном сайте.',
          'Воспитатели помогают',
        ],
      },
      {
        text: 'Пользуетесь ли вы приложением Гимназии для родителей? (Ссылка для скачивания)',
        type: 'radio',
        required: true,
        options: ['Да', 'Нет'],
      },
      {
        text: 'Что бы Вы хотели изменить/добавить в работе приложения?',
        type: 'text',
        options: { maxLength: 4000 },
      },
      {
        text: 'Насколько Вы информированы о существовании Фонда Гимназии? (страница фонда на сайте Гимназии)',
        type: 'radio',
        required: true,
        options: ['Полностью.', 'Частично.'],
      },
      {
        text: 'Что больше всего нравится Вашему ребенку в Гимназии?',
        type: 'text',
        required: true,
        options: { maxLength: 4000 },
      },
      {
        text: 'Что не нравится Вашему ребенку в Гимназии?',
        type: 'text',
        required: true,
        options: { maxLength: 4000 },
      },
      {
        text: 'Кому из воспитателей, педагогов и сотрудников Гимназии Вы хотите выразить отдельную благодарность?',
        type: 'text',
        options: { maxLength: 500 },
      },
      {
        text: 'Будем признательны за Ваши предложения и пожелания по улучшению организации работы Гимназии в новом учебном году.',
        type: 'text',
        options: { maxLength: 4000 },
      },
    ],
  },
  {
    id: 'roditelskiy-shkola',
    emoji: '🏫',
    category: 'Образование',
    title: 'Родительский опрос (школа)',
    description: 'Обратная связь о коммуникации, нагрузке и атмосфере.',
    questions: [
      {
        text: 'Насколько вам понятна информация от школы (расписание, объявления)?',
        type: 'radio',
        options: ['Очень понятно', 'В целом да', 'Иногда не хватает', 'Часто непонятно'],
      },
      {
        text: 'Как вы оцениваете домашнюю нагрузку ребёнка?',
        type: 'radio',
        options: ['Оптимальная', 'Слегка много', 'Слишком много', 'Мало'],
      },
      {
        text: 'Что для вас важнее всего улучшить?',
        type: 'checkbox',
        options: ['Связь с классным руководителем', 'Дополнительные кружки', 'Питание', 'Безопасность', 'Инфраструктура'],
      },
      {
        text: 'Пожелания или вопросы администрации',
        type: 'text',
        options: { maxLength: 2000 },
      },
    ],
  },
  {
    id: 'it-podderzhka',
    emoji: '💻',
    category: 'IT',
    title: 'Оценка работы IT-поддержки',
    description: 'После обращения в техподдержку: скорость и качество решения.',
    questions: [
      {
        text: 'Ваша заявка была решена?',
        type: 'radio',
        options: ['Да, полностью', 'Частично', 'Нет', 'Ещё в работе'],
      },
      {
        text: 'Насколько быстро ответили на первое обращение?',
        type: 'radio',
        options: ['В тот же день', '1–2 дня', '3–5 дней', 'Дольше недели'],
      },
      {
        text: 'Оцените общее качество поддержки',
        type: 'scale',
        options: { min: 1, max: 10 },
      },
      {
        text: 'Что можно улучшить?',
        type: 'text',
        options: { maxLength: 1500 },
      },
    ],
  },
  {
    id: 'distancionnoe-obuchenie',
    emoji: '🌐',
    category: 'Образование',
    title: 'Дистанционное обучение',
    description: 'Платформа, связь и самочувствие при онлайн-формате.',
    questions: [
      {
        text: 'Насколько удобна для вас используемая платформа?',
        type: 'rating',
        options: { min: 1, max: 5 },
      },
      {
        text: 'С какими трудностями сталкиваетесь чаще всего?',
        type: 'checkbox',
        options: ['Связь / интернет', 'Сложный интерфейс', 'Нехватка времени', 'Усталость от экрана', 'Другое'],
      },
      {
        text: 'Достаточно ли обратной связи от преподавателя?',
        type: 'radio',
        options: ['Да', 'Скорее да', 'Скорее нет', 'Нет'],
      },
      {
        text: 'Пожелания по организации дистанционного обучения',
        type: 'text',
        options: { maxLength: 2000 },
      },
    ],
  },
  {
    id: 'volonter',
    emoji: '🙋',
    category: 'События',
    title: 'Анкета волонтёра',
    description: 'Направления помощи, доступность и контакт.',
    questions: [
      {
        text: 'В каких направлениях готовы помогать?',
        type: 'checkbox',
        options: ['Регистрация участников', 'Логистика', 'Фото / видео', 'Работа со зрителями', 'Другое'],
      },
      {
        text: 'Сколько часов в неделю готовы уделять?',
        type: 'radio',
        options: ['До 2 ч', '2–5 ч', '5–10 ч', 'Больше 10 ч', 'Только разовые задачи'],
      },
      {
        text: 'Есть ли у вас опыт волонтёрства?',
        type: 'radio',
        options: ['Да, регулярно', 'Иногда', 'Нет, но хочу попробовать'],
      },
      {
        text: 'Контакт (телефон или мессенджер)',
        type: 'text',
        options: { maxLength: 300 },
      },
    ],
  },
  {
    id: 'produkt-mvp',
    emoji: '🚀',
    category: 'Продукт',
    title: 'Исследование продукта (MVP)',
    description: 'PMF-скан: проблема, частота использования и готовность платить.',
    questions: [
      {
        text: 'Насколько актуальна для вас описываемая проблема?',
        type: 'scale',
        options: { min: 1, max: 10 },
      },
      {
        text: 'Как часто вы сталкивались с этой задачей за последний месяц?',
        type: 'radio',
        options: ['Не сталкивался(ась)', '1–2 раза', 'Еженедельно', 'Почти каждый день'],
      },
      {
        text: 'Готовы ли попробовать решение бесплатно в бета-версии?',
        type: 'radio',
        options: ['Да', 'Возможно', 'Нет'],
      },
      {
        text: 'Что для вас критично в таком продукте?',
        type: 'text',
        options: { maxLength: 2000 },
      },
    ],
  },
  {
    id: 'eko-povedenie',
    emoji: '♻️',
    category: 'Экология',
    title: 'Экологические привычки',
    description: 'Лёгкий опрос для образовательных или корпоративных инициатив.',
    questions: [
      {
        text: 'Сортируете ли вы отходы дома или на работе?',
        type: 'radio',
        options: ['Да, всегда', 'Иногда', 'Нет, но планирую', 'Нет'],
      },
      {
        text: 'Что мешает чаще всего?',
        type: 'checkbox',
        options: ['Нет контейнеров рядом', 'Нет времени', 'Не знаю правил', 'Лень', 'Не мешает ничего'],
      },
      {
        text: 'Насколько важна для вас тема устойчивого развития?',
        type: 'scale',
        options: { min: 1, max: 10 },
      },
      {
        text: 'Идеи или предложения',
        type: 'text',
        options: { maxLength: 1500 },
      },
    ],
  },
  {
    id: 'bezopasnost-raboty',
    emoji: '🦺',
    category: 'HR',
    title: 'Культура безопасности на рабочем месте',
    description: 'Восприятие инструктажей и готовность сообщать о рисках.',
    questions: [
      {
        text: 'Инструктажи по охране труда понятны и полезны?',
        type: 'radio',
        options: ['Да', 'Скорее да', 'Скорее нет', 'Нет', 'Не проходил(а)'],
      },
      {
        text: 'Знаете ли вы, куда сообщать о потенциальной опасности?',
        type: 'radio',
        options: ['Да', 'Скорее да', 'Не уверен(а)', 'Нет'],
      },
      {
        text: 'Оцените уровень безопасности в вашей зоне (объективно, насколько можете)',
        type: 'rating',
        options: { min: 1, max: 5 },
      },
      {
        text: 'Замечания или предложения по безопасности',
        type: 'text',
        options: { maxLength: 2000 },
      },
    ],
  },
  {
    id: 'onboarding-novichok',
    emoji: '👋',
    category: 'HR',
    title: 'Онбординг: первые недели',
    description: 'Соберите обратную связь у новых сотрудников после адаптации.',
    questions: [
      {
        text: 'Насколько ясно вам объяснили ваши задачи и ожидания?',
        type: 'scale',
        options: { min: 1, max: 10 },
      },
      {
        text: 'Кого или что не хватало в первые недели?',
        type: 'checkbox',
        options: ['Наставник', 'Документация', 'Доступы к системам', 'Знакомство с командой', 'Всё было ок'],
      },
      {
        text: 'Рекомендовали бы вы нашу компанию как работодателя знакомым?',
        type: 'radio',
        options: ['Да', 'Скорее да', 'Не уверен(а)', 'Скорее нет', 'Нет'],
      },
      {
        text: 'Что улучшить в процессе онбординга?',
        type: 'text',
        options: { maxLength: 2000 },
      },
    ],
  },
];

const CUSTOM_STORAGE_KEY = 'pulse_custom_survey_templates_v1';

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadCustomTemplates(): SurveyTemplate[] {
  const w = getUserAnalyticsWorkspaceCache().customSurveyTemplates;
  if (Array.isArray(w) && w.length) {
    return w
      .filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string' && Array.isArray(t.questions))
      .slice(0, 200);
  }
  if (typeof localStorage === 'undefined') return [];
  const parsed = safeParseJson<SurveyTemplate[]>(localStorage.getItem(CUSTOM_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string' && Array.isArray(t.questions))
    .slice(0, 200);
}

function storeCustomTemplates(list: SurveyTemplate[]) {
  const slice = list.slice(0, 200);
  if (typeof localStorage !== 'undefined' && !hasStaffSessionHint()) {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(slice));
    return;
  }
  scheduleUserAnalyticsWorkspacePatch({ customSurveyTemplates: slice });
}

export function saveCustomTemplate(t: Omit<SurveyTemplate, 'id'> & { id?: string }): SurveyTemplate {
  const id = (t.id && String(t.id).trim()) || `custom-${crypto.randomUUID()}`;
  const next: SurveyTemplate = {
    id,
    emoji: String(t.emoji || '🧩').slice(0, 6),
    category: String(t.category || 'Пользовательские').slice(0, 60),
    title: String(t.title || '').slice(0, 180),
    description: String(t.description || '').slice(0, 600),
    questions: Array.isArray(t.questions) ? t.questions : [],
  };
  const prev = loadCustomTemplates();
  const merged = [next, ...prev.filter((x) => x.id !== id)];
  storeCustomTemplates(merged);
  return next;
}

export function deleteCustomTemplate(id: string) {
  const prev = loadCustomTemplates();
  storeCustomTemplates(prev.filter((t) => t.id !== id));
}

export function listSurveyTemplates(): SurveyTemplate[] {
  return [...SURVEY_TEMPLATES, ...loadCustomTemplates()];
}

export function getSurveyTemplate(id: string): SurveyTemplate | undefined {
  if (id === blank.id) return blank;
  for (const t of SURVEY_TEMPLATES) if (t.id === id) return t;
  for (const t of loadCustomTemplates()) if (t.id === id) return t;
  return undefined;
}

export function templateCategories(): string[] {
  const s = new Set<string>();
  for (const t of SURVEY_TEMPLATES) s.add(t.category);
  for (const t of loadCustomTemplates()) s.add(t.category);
  return ['Все', ...Array.from(s).sort((a, b) => a.localeCompare(b, 'ru'))];
}
