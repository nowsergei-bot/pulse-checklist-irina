export type SurveyStatus = 'draft' | 'published' | 'closed';
export type QuestionType =
  | 'radio'
  | 'checkbox'
  | 'scale'
  | 'text'
  | 'rating'
  | 'date'
  | 'teacher_availability'
  | 'rating_matrix'
  | 'person_select'
  | 'file_upload'
  | 'roommate_pair'
  | 'table_seat'
  | 'topic_slots'
  | 'topic_feedback_rounds';

/** Раздел (группа) опросов в админке — для методистов и сводной аналитики */
export interface SurveyGroup {
  id: number;
  slug: string;
  name: string;
  curator_name: string;
  sort_order: number;
}

export interface Question {
  id: number;
  survey_id: number;
  text: string;
  type: QuestionType;
  options: unknown;
  sort_order: number;
  required: boolean;
}

export interface Survey {
  id: number;
  title: string;
  description: string;
  created_at: string;
  created_by: number | null;
  status: SurveyStatus;
  access_link: string;
  allow_multiple_responses?: boolean;
  /** false — в БД нет колонки, настройка не сохраняется (нужна миграция). */
  allow_multiple_responses_supported?: boolean;
  /** false — опрос опубликован, но новые ответы не принимаются. */
  accepting_responses?: boolean;
  accepting_responses_supported?: boolean;
  /** ISO timestamptz — автозакрытие (ввод в админке по Europe/Moscow). */
  close_at?: string | null;
  close_at_supported?: boolean;
  /** true — для публичных результатов задан пароль (хеш в БД, не отдаётся). */
  results_password_set?: boolean;
  results_password_supported?: boolean;
  /** Секрет для страницы «для директора» (не путать с access_link формы). */
  director_token?: string | null;
  media?: {
    photos?: { src: string; name?: string }[];
    /** false — скрыть «Заполнить голосом» на публичной форме. По умолчанию true. */
    voiceFillEnabled?: boolean;
    i18n?: import('../lib/surveyI18n').SurveyI18nMedia;
    [key: string]: unknown;
  };
  questions?: Question[];
  survey_group_id?: number | null;
  survey_group?: SurveyGroup | null;
  /** Владелец не назначен — общий опрос (отдельный блок на рабочем столе, не «Ваши опросы»). */
  owner_user_id?: number | null;
  /** Соавторы: вместе с owner_user_id попадают в «Мои опросы». */
  author_user_ids?: number[];
  is_shared?: boolean;
}

export interface ListSurveysResponse {
  surveys: Survey[];
  sharedSurveys: Survey[];
}

export interface SurveyInviteRow {
  email: string;
  status: 'pending' | 'sent' | 'error' | 'responded' | string;
  sent_at: string | null;
  last_sent_at?: string | null;
  responded_at?: string | null;
  attempts?: number;
  last_error: string | null;
  created_at: string;
}

export interface SurveyInviteTemplate {
  subject: string;
  html: string;
  updated_at: string | null;
}

export interface AnswerSubmit {
  question_id: number;
  value: string | number | string[] | Record<string, unknown>;
}

export interface CommentRow {
  id: number;
  survey_id: number;
  question_id: number | null;
  user_id: number | null;
  text: string;
  created_at: string;
}

export interface ResultQuestion {
  question_id: number;
  type: QuestionType;
  text: string;
  response_count: number;
  distribution?: { label: string | number; count: number }[];
  average?: number | null;
  min?: number | null;
  max?: number | null;
  /** Пустой в публичном API; полный список — через text-answers */
  samples?: string[];
  /** Самые содержательные уникальные ответы (по длине текста) */
  samples_highlight?: string[];
  /** То же, что samples_highlight, но с ФИО из person_select */
  samples_highlight_with_persons?: { text: string; person?: string }[];
  samples_total?: number;
}

export interface TextWordCloudWord {
  text: string;
  count: number;
}

export interface TextAnswersPage {
  rows: { question_id: number; text: string; submitted_at: string; person?: string }[];
  total: number;
  question_ids?: number[];
}

export interface ResultsChartDailyPoint {
  date: string;
  total: number;
}

export interface ResultsChartQuestionSeries {
  question_id: number;
  short_label: string;
  points: { date: string; count: number }[];
}

export interface ResultsChartDowStack {
  dow: number;
  label: string;
  stacks: { question_id: number; label: string; count: number }[];
}

export interface ResultsChartsBlock {
  daily: ResultsChartDailyPoint[];
  top_questions_timeseries: ResultsChartQuestionSeries[];
  dow_stacked: ResultsChartDowStack[];
}

export interface WorkbookSheet {
  name: string;
  headers: string[];
  rows: (string | number | boolean | null)[][];
}

export interface SurveyWorkbook {
  id: number;
  filename: string;
  sheets: WorkbookSheet[];
  ai_commentary: string | null;
  created_at: string;
}

/** Срез для аналитики по выборке (совпадает с телом filters у API). */
export interface AnalyticsFilter {
  question_id: number;
  value: string;
}

export interface AnalyticsChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Таблица для скачивания .xlsx из «Нейросеть Пульс». */
export interface PulseAiExportSheet {
  name: string;
  rows: string[][];
}

export interface PulseAiExport {
  filename: string;
  sheets: PulseAiExportSheet[];
}

export interface PulseAiChatResponse {
  reply: string;
  source?: string;
  export?: PulseAiExport | null;
}

export type PulseAiChatMessage = AnalyticsChatMessage & {
  export?: PulseAiExport | null;
};

export interface AnalyticsChatResponse {
  source: string;
  reply: string;
  total_responses: number;
}

/** Унифицированный ответ `POST /api/excel-dashboard-ai` (поля зависят от action). */
export type ExcelDashboardAiAction =
  | 'normalize_values'
  | 'value_hierarchy'
  | 'nl_slice'
  | 'explain_slice'
  | 'chart_interpret'
  | 'chart_anomalies'
  | 'chart_spec'
  | 'lesson_analytics_column_roles';

/** Запрос выводов ИИ по разделам дашборда вовлечённости (один batch на 12 разделов). */
export interface MoEngagementSectionInsightInput {
  number: number;
  title: string;
  shortTitle: string;
  pct: number | null;
  avg: number | null;
  questionCount: number;
  questions: { text: string; pct: number | null; avg: number | null }[];
  deptBreakdown: { department: string; pct: number | null }[];
  yoyDelta?: number | null;
  yoyBaselinePct?: number | null;
}

export interface MoEngagementSectionInsightsRequest {
  surveyTitle: string;
  totalResponses: number;
  filterDepartment?: string | null;
  compareWithPreviousYear?: boolean;
  sections: MoEngagementSectionInsightInput[];
}

export interface MoEngagementSectionInsightItem {
  number: number;
  title: string;
  body: string;
}

export interface MoEngagementSectionInsightsResponse {
  source: 'llm' | 'heuristic' | 'error' | string;
  sections: MoEngagementSectionInsightItem[];
  hint?: string;
}

/** Запрос общего ИИ-вывода по дашборду вовлечённости (открытый LLM-провайдер). */
export interface MoEngagementOverallInsightSectionInput {
  number: number;
  shortTitle: string;
  pct: number | null;
  yoyDelta?: number | null;
  yoyBaselinePct?: number | null;
}

export interface MoEngagementOverallInsightRequest {
  surveyTitle: string;
  totalResponses: number;
  filterDepartment?: string | null;
  compareWithPreviousYear?: boolean;
  engagementIndex: number | null;
  yoyIndexDelta?: number | null;
  yoyBaselineIndex?: number | null;
  sections: MoEngagementOverallInsightSectionInput[];
}

export interface MoEngagementOverallInsightResponse {
  source: 'llm' | 'heuristic' | 'error' | string;
  title: string;
  body: string;
  hint?: string;
}

export interface ExcelDashboardAiResponse {
  source: string;
  hint?: string;
  /** action lesson_analytics_column_roles */
  roles?: string[] | null;
  canonicalMap?: Record<string, string> | null;
  groups?: { id: string; label: string; parentId: string | null; values: string[] }[] | null;
  reply?: string | null;
  apply_filters?: Record<string, string[]> | null;
  explanation?: string | null;
  insight?: string | null;
  bullets?: string[] | null;
  recommendation?: string | null;
  focusFilterKey?: string | null;
  focusMetricLabel?: string | null;
}

/** ИИ: 1–3 производных измерения (каждое — маппинг значения базовой колонки → группа). */
export interface ExcelDerivedFilterDimensionPayload {
  title: string;
  assignments: Record<string, string>;
}

/** Сохраняется на клиенте вместе с id и исходным ключом фильтра */
export interface ExcelDerivedFilterDimension extends ExcelDerivedFilterDimensionPayload {
  id: string;
  sourceFilterKey: string;
}

/** Связный текст сводки Excel-дашборда (ИИ по машинной сводке). */
export interface ExcelNarrativeSummaryResponse {
  source: string;
  narrative: string | null;
  hint?: string;
  /** Оценка длины отчёта (слова), если ответ от LLM прошёл проверку. */
  wordCount?: number;
  /** Вернётся с бэкенда: standard | deep */
  analysisMode?: string;
}

/** Записки для директора по сегментам (педагог / педагог+предмет). */
export interface ExcelDirectorDossierItem {
  segmentId: string;
  narrative: string;
}

export interface ExcelDirectorDossierResponse {
  source: string;
  items: ExcelDirectorDossierItem[] | null;
  hint?: string;
}

export interface ResultsPayload {
  survey: {
    id: number;
    title: string;
    status: SurveyStatus;
    access_link?: string;
    director_token?: string | null;
  };
  total_responses: number;
  questions: ResultQuestion[];
  charts?: ResultsChartsBlock;
  /** Облако слов по всем свободным ответам опроса */
  text_word_cloud?: { words: TextWordCloudWord[] };
  /** Если ответ пришёл с POST /results-filter — какие условия применены */
  filters_applied?: AnalyticsFilter[];
  /** Ответы в responses есть, answer_values пусты (часто после seed --update с пересозданием вопросов) */
  results_integrity_warning?: 'responses_exist_but_no_answer_values';
  workbooks?: SurveyWorkbook[];
  /** Срез по одному уроку (публичная ссылка директора с lesson_key) */
  lesson_key?: string;
  lesson_filter_active?: boolean;
}

/** Урок для сводки директора по феноменальным опросам (группировка ответов родителей) */
export interface DirectorLessonGroup {
  lesson_key: string;
  teacher: string;
  class_label: string;
  lesson_code: string;
  response_count: number;
}

export type DirectorLessonSplitMode =
  | 'triple'
  | 'code_teacher'
  | 'code_class'
  | 'code_only'
  | 'entire_survey';

export interface DirectorLessonGroupsPayload {
  survey: { id: number; title: string; status: SurveyStatus };
  lesson_split: {
    source: string;
    mode: DirectorLessonSplitMode;
    teacher_question_id: number | null;
    class_question_id: number | null;
    lesson_code_question_id: number | null;
  };
  groups: DirectorLessonGroup[];
  /** entire_survey + сохранённые ИИ-группы в media.directorAiLessonGroups */
  lesson_groups_source?: 'ai' | 'heuristic';
  hint?: string;
}

export type InsightTone = 'positive' | 'neutral' | 'attention' | 'negative';

export interface InsightKpi {
  id: string;
  label: string;
  value: string;
  hint: string | null;
}

export interface InsightBlock {
  title: string;
  body: string;
  tone: InsightTone;
}

export interface InsightQuestionSummary {
  question_id: number;
  title: string;
  type: QuestionType;
  response_count: number;
  detail: string;
  avg?: number | null;
  min?: number | null;
  max?: number | null;
  bars: { label: string; pct: number }[];
}

export interface InsightDashboard {
  kpis: InsightKpi[];
  highlights: InsightBlock[];
  alerts: InsightBlock[];
  questions: InsightQuestionSummary[];
  meta: { generated: string; response_count: number };
}

export interface InsightRelation {
  a: number;
  b: number;
  n: number;
  method: 'pearson_abs' | 'cramers_v' | 'eta2' | string;
  score: number;
  why: string;
  a_type?: string;
  b_type?: string;
  a_text?: string;
  b_text?: string;
}

export interface AiInsightsPayload {
  source: string;
  /** Если нейросеть не ответила, краткая причина (для админов; ключи не раскрываются). */
  llm_error?: string;
  dashboard: InsightDashboard;
  relations?: InsightRelation[];
  narrative: string | null;
  survey: Pick<Survey, 'id' | 'title' | 'status' | 'access_link' | 'questions'>;
  total_responses: number;
}

export interface UnifiedDashboardKpi {
  id: string;
  label: string;
  value: string;
  hint: string;
}

export interface UnifiedDashboardSectionQuestion {
  index: number;
  question_id: number;
  text: string;
  type: QuestionType;
  average: number | null;
  pct: number | null;
  response_count: number;
  distribution: { label: string; count: number; pct: number }[];
}

export interface UnifiedDashboardSection {
  id: string;
  number: number;
  family: string;
  title: string;
  shortTitle: string;
  question_count: number;
  response_count: number;
  avg: number | null;
  pct: number | null;
  tone: InsightTone;
  questions: UnifiedDashboardSectionQuestion[];
}

export interface UnifiedQuestionChart {
  question_id: number;
  type: QuestionType;
  title: string;
  chart_type: string;
  response_count: number;
  average: number | null;
  min: number | null;
  max: number | null;
  top_options: { label: string; count: number; pct: number }[];
  rationale: string;
}

export interface UnifiedSegmentHeatmap {
  segment_label: string;
  sections: string[];
  rows: { label: string; cells: (number | null)[]; index_pct: number | null }[];
}

export interface UnifiedSurveyDashboardBlock {
  nav_items: { id: string; label: string }[];
  kpis: UnifiedDashboardKpi[];
  scale_index: number | null;
  sections: UnifiedDashboardSection[];
  segment: { question_id: number; label: string; values: string[] } | null;
  segment_heatmap: UnifiedSegmentHeatmap | null;
  question_charts: UnifiedQuestionChart[];
  risks: InsightBlock[];
  strengths: InsightBlock[];
  meta: {
    generated: string;
    response_count: number;
    scale_question_count: number;
    choice_question_count: number;
    text_question_count: number;
  };
}

export interface UnifiedSurveyDashboardPayload {
  lesson_interest?: {
    source: string;
    respondents: number;
    summary: string;
    recommendations: string[];
    error?: string;
    generated_at?: string;
    themes: { label: string; positive: number; negative: number; positive_pct: number; negative_pct: number }[];
  };
  source: string;
  llm_error?: string;
  dashboard: UnifiedSurveyDashboardBlock;
  dashboard_plan?: UnifiedDashboardPlan;
  plan_blocks?: UnifiedDashboardPlanBlock[];
  plan_source?: string;
  plan_metrics?: Record<string, UnifiedDashboardMetric>;
  text_coverage?: UnifiedTextCoverageItem[];
  insights: {
    narrative: string | null;
    relations?: InsightRelation[];
    highlights?: InsightBlock[];
    alerts?: InsightBlock[];
  } | null;
  results: ResultsPayload;
  survey: Pick<Survey, 'id' | 'title' | 'status' | 'access_link'>;
  total_responses: number;
  filters_applied?: AnalyticsFilter[];
}

export type UnifiedDashboardPlanBlockKind = 'kpi' | 'bar' | 'table' | 'insight';

export interface UnifiedDashboardPlanBlock {
  id: string;
  kind: UnifiedDashboardPlanBlockKind;
  title?: string;
  order?: number;
  metric_id?: string;
  question_id?: number;
  question_ids?: number[];
  body?: string;
  tone?: InsightTone;
  state?: string;
  display?: string;
  value?: number | null;
  hint?: string;
  rows?: { label: string; count: number; pct: number }[] | UnifiedDashboardPlanTableRow[];
  chart_type?: string;
  average?: number | null;
  pct?: number | null;
  response_count?: number;
  evidence_metric_ids?: string[];
}

export interface UnifiedDashboardPlanTableRow {
  question_id: number;
  text: string;
  type?: QuestionType;
  average?: number | null;
  pct?: number | null;
  top?: { label: string; count: number; pct: number }[];
  response_count?: number;
}

export interface UnifiedDashboardPlan {
  version: number;
  id: string;
  survey_fingerprint?: string;
  updated_at?: string;
  source?: string;
  blocks: UnifiedDashboardPlanBlock[];
  last_prompt?: string;
  change_summary?: string;
}

export interface UnifiedDashboardMetric {
  kind: string;
  value?: number | null;
  label?: string;
  question_id?: number;
  samples_shown?: number;
}

export interface UnifiedTextCoverageItem {
  question_id: number;
  text: string;
  total: number;
  shown: number;
  cap: number | null;
  partial: boolean;
}

export type SurveyDraftAiPatchResponse = {
  summary: string;
  title?: string;
  description?: string;
  questions: Array<{
    id?: number;
    text: string;
    type: QuestionType;
    options: unknown;
    required: boolean;
    sort_order: number;
  }>;
  diff: string[];
  revision: number;
};

/** Секция связного текста мультисводки (нейросеть). */
export interface MultiSurveyNarrativeSection {
  heading: string;
  body: string;
}

/** Объединённые ИИ схожие вопросы из разных волн опроса. */
export interface MultiSurveyMergedTheme {
  theme_title: string;
  refs: string[];
  synthesis: string;
  takeaway: string;
}

/** Вопрос с данными для диаграммы — выбран ИИ или эвристикой. */
export interface MultiSurveyHighlight {
  survey_id: number;
  survey_title: string;
  question: ResultQuestion;
  /** Зачем показан этот график (от ИИ). */
  chart_rationale?: string;
}

/** Почему вместо LLM показана эвристика (только при source heuristic_multi). */
export interface MultiSurveyLlmFallback {
  code: string;
  hint_ru: string;
}

/** Сводка и текстовая аналитика сразу по нескольким опросам (админка). */
export interface MultiSurveyAnalyticsPayload {
  source: 'llm_multi' | 'llm_multi_partial' | 'heuristic_multi' | string;
  narrative: string | null;
  /** Структурированный текст при ответе нейросети. */
  narrative_sections?: MultiSurveyNarrativeSection[];
  merged_themes?: MultiSurveyMergedTheme[];
  highlight_questions?: MultiSurveyHighlight[];
  /** Уточнение, если сработала автосводка вместо нейросети. */
  llm_fallback?: MultiSurveyLlmFallback | null;
  surveys: {
    id: number;
    title: string;
    status: SurveyStatus;
    total_responses: number;
    question_count: number;
  }[];
  grand_total_responses: number;
}

/** Сводка по одному текстовому вопросу: эвристика + опционально нейросеть. */
export interface TextQuestionInsightsPayload {
  source: string;
  question_id: number;
  question_text: string;
  answers_used: number;
  heuristic_summary: string;
  top_terms: { word: string; count: number }[];
  narrative: string | null;
}

/** AI analytics block for teambuilding feedback public dashboard. */
export interface TeambuildingFeedbackAnalyticsPayload {
  source: string;
  narrative: string | null;
  narrative_sections?: { heading: string; body: string }[];
  overall_scale_avg?: number | null;
  text_answers_used: number;
  total_responses: number;
  survey_title?: string;
}

/** Сырые строки для выгрузки ответов в Excel (админка). */
export interface SurveyExportRowsPayload {
  survey: { id: number; title: string };
  questions: { id: number; text: string; type: QuestionType; fieldKey?: string }[];
  integrity?: {
    response_total: number;
    responses_with_answers: number;
    responses_without_answers: number;
  };
  rows: {
    id: number;
    respondent_id: string;
    source?: string;
    created_at: string;
    answers: Record<number, unknown>;
    admin_meta?: {
      organizer_feedback?: {
        text?: string;
        draft_source?: string;
        llm_provider?: string | null;
        updated_at?: string;
        emailed_at?: string | null;
        emailed_to?: string | null;
      };
      [key: string]: unknown;
    };
  }[];
}

/** Слияние ответов родителей (опрос) со строками чек-листа педагогов через LLM на сервере. */
export interface PhenomenalMergeRow {
  parent_row_index: number;
  teacher_row_index: number | null;
  confidence: number;
  reason: string;
  parent: {
    created_at: string;
    respondent_id: string;
    answers_labeled: Record<string, unknown>;
  } | null;
  teacher: {
    lessonCode: string;
    conductingTeachers: string;
    subjects: string;
    submittedAt: string | null;
    methodologicalScore: number | null;
    /** Все баллы по строкам чек-листа с тем же шифром (после сведения на сервере). */
    methodologicalScores?: number[];
    generalThoughts: string;
    observerName: string;
    rubricOrganizational?: string;
    rubricGoalSetting?: string;
    rubricTechnologies?: string;
    rubricInformation?: string;
    rubricGeneralContent?: string;
    rubricCultural?: string;
    rubricReflection?: string;
  } | null;
}

/** Ответ API phenomenal-lessons merge/cluster (единый контур Пульса). */
export type PhenomenalMergeLlmChoice = 'pulse';

export interface PhenomenalLessonsMergePayload {
  survey: { id: number; title: string };
  /** Откуда взяты строки родителей: опрос в системе или второй Excel */
  parent_source?: 'survey' | 'excel';
  confidence_threshold: number;
  warnings: string[];
  /** Нормализованный выбор из запроса (для отображения). */
  llm_choice?: PhenomenalMergeLlmChoice;
  llm_provider: string | null;
  stats: {
    parent_rows: number;
    teacher_rows: number;
    merged_high_confidence: number;
    uncertain_or_no_match: number;
  };
  merged: PhenomenalMergeRow[];
  uncertain: PhenomenalMergeRow[];
  unmatched_parent_indices: number[];
  unmatched_teacher_indices: number[];
}

/** Тип сущности для псевдонимизации перед отправкой в LLM (префикс токена на сервере). */
export type PedagogicalPiiEntityType = 'teacher' | 'phone' | 'address' | 'class' | 'child' | 'other';

export interface PedagogicalPiiEntityDraft {
  type: PedagogicalPiiEntityType;
  value: string;
}

/** Последний ответ LLM по сессии (replyRedacted — как от модели; replyPlain — после подстановки на сервере). */
export interface PedagogicalLlmLast {
  at: string;
  provider: string;
  replyRedacted: string;
  replyPlain: string;
}

/** Мета авто-псевдонимизации последнего прогона. */
export interface PedagogicalPiiAutoMeta {
  at: string;
  entityCount: number;
  autoDetectedCount: number;
}

/** Сегмент педагогической аналитики (один педагог / пара педагог+предмет). */
export interface PedagogicalSegmentState {
  id: string;
  teacher: string;
  subject?: string | null;
  /** Текст от ИИ (после обработки). */
  narrative?: string;
  /** Ответ модели с токенами (для сводки сессии). */
  narrativeRedacted?: string;
  /** Статус генерации. */
  genStatus?: 'pending' | 'running' | 'done' | 'failed';
  /** Сообщение при genStatus === 'failed'. */
  genError?: string;
  /** Согласование методистом. */
  reviewStatus?: 'pending' | 'approved' | 'skipped';
  /** Строки-опоры из сводки (кратко). */
  sourceSnippet?: string;
}

/** Состояние сессии «Педагогическая аналитика» (хранится в JSON на сервере). */
export interface PedagogicalAnalyticsState {
  v: 1;
  step: 'draft' | 'generating' | 'review' | 'report' | 'sent';
  job: {
    status: 'idle' | 'running' | 'done' | 'failed';
    done: number;
    total: number;
    error?: string | null;
  };
  segments: PedagogicalSegmentState[];
  notification: {
    emailEnabled: boolean;
    maxWebhookUrl: string;
    consent: boolean;
    lastNotifiedAt?: string;
  };
  excelProjectId?: number | null;
  /**
   * Если задано (например после загрузки .xlsx), авто-ПДн на сервере собирается по каждому элементу отдельно, затем объединяется.
   * Редактирование текста вручную в поле фактов сбрасывает этот режим (см. клиент).
   */
  sourceBlocks?: string[] | null;
  /** token → исходное значение; в промпт LLM не передаётся. */
  piiMap: Record<string, string>;
  /** Текст для ИИ после замены ПДн на токены. */
  redactedSource: string;
  /** Черновик исходного текста с ПДн. */
  sourcePlain: string;
  piiEntitiesDraft: PedagogicalPiiEntityDraft[];
  llmLast: PedagogicalLlmLast | null;
  piiAuto: PedagogicalPiiAutoMeta | null;
}

export interface PedagogicalSessionListItem {
  id: number;
  title: string;
  step: string | null;
  updated_at: string;
}

export interface PedagogicalSessionPayload {
  id: number;
  title: string;
  state: PedagogicalAnalyticsState;
  created_at: string;
  updated_at: string;
}

/** Автономная фотостена (не опрос) */
export type PhotoWallModerationStatus = 'pending' | 'approved' | 'rejected';

export interface PhotoWallPhotoRow {
  id: number;
  respondent_id: string;
  created_at: string;
  moderation_status: PhotoWallModerationStatus;
  /** Превью для списка модерации (лёгкий JPEG data URL) */
  preview_data: string;
  /** Старые записи без thumb — подгружаем полное фото отдельным запросом */
  needs_full_image: boolean;
}

/** Дашборд корпоративного тимбилдинга */
export type CorporateTransportType = 'transfer' | 'car' | null;

export interface CorporateRoommateInfo {
  mode: string;
  roommate: string;
  status: string;
  label: string;
  incomingRequests?: string[];
  /** Если status=stranded — с кем оказался выбранный сосед */
  conflictWith?: string;
}

export interface CorporateDocumentFile {
  key: string;
  name: string;
  size?: number | null;
  contentType?: string | null;
  slot?: string | null;
  slotLabel?: string | null;
  batchId?: string | null;
  person?: string;
  response_id?: number;
}

export interface CorporateParticipantCard {
  response_id: number;
  submitted_at: string | null;
  name: string;
  /** True when FIO was entered manually (not in official participant list). */
  name_manual?: boolean;
  attending: boolean | null;
  attending_label: string | null;
  decline_reason: string | null;
  transport: CorporateTransportType;
  transport_label: string | null;
  plate: string | null;
  car_model: string | null;
  roommate: CorporateRoommateInfo | null;
  table: number | null;
  day2: string | null;
  letter: string | null;
  documents: CorporateDocumentFile[];
  documents_count: number;
  /** Просмотры страницы «Моя команда и стол» (lookup). */
  lookup_view?: {
    count: number;
    first_at: string;
    last_at: string;
    viewed_at: string[];
  } | null;
}

export interface CorporateTableGroup {
  label: string;
  tables: number[];
  color?: string | null;
  reserved?: boolean;
  block?: string | null;
}

export interface CorporateTableRow {
  table: number;
  occupied: number;
  capacity: number;
  free: number;
  names: string[];
  seats?: Record<string, string>;
  /** Кафедра / группа из table_seat.tableGroups */
  label?: string | null;
  /** Блок (педперсонал, УВП, …) */
  block?: string | null;
  group_color?: string | null;
  reserved?: boolean;
}

export interface CorporateTeambuildingDashboardPayload {
  survey: {
    id: number;
    title: string;
    access_link: string;
    status: string;
    response_count: number;
  };
  questions?: {
    person_select_id: number | null;
    attend_id: number | null;
    transport_id: number | null;
    plate_id: number | null;
    car_model_id: number | null;
    file_upload_id: number | null;
    roommate_id: number | null;
    table_seat_id: number | null;
    day2_id: number | null;
    letter_id: number | null;
  };
  form_options?: {
    attend_choices: string[];
    transport_choices: string[];
    day2_choices: string[];
    participant_choices: string[];
  };
  overview: {
    total: number;
    attending: { yes: number; no: number; unknown: number };
    manual_names?: number;
    roster_total?: number;
    roster_answered?: number;
    roster_missing?: number;
    transfer: number;
    car: number;
    day2_stay: number;
    day2_counts: Record<string, number>;
    documents: number;
    tables_occupied: number;
    confirmed_roommate_pairs: number;
    lookup_views_people?: number;
    lookup_views_total?: number;
  };
  participants: CorporateParticipantCard[];
  tables: CorporateTableRow[];
  /** Группы столов из options table_seat (кафедры / блоки) */
  tableGroups?: CorporateTableGroup[];
  tableCount: number;
  seatsPerTable: number;
  cars: Array<{ name: string; plate: string; model: string; response_id: number }>;
  transfer: Array<{ name: string; response_id: number }>;
  day2: {
    counts: Record<string, number>;
    stay: Array<{ name: string; label: string | null; response_id: number }>;
    all: Array<{ name: string; label: string | null; response_id: number }>;
  };
  roommates: {
    confirmed_pairs: Array<[string, string]>;
    requests_by_target: Record<string, string[]>;
    taken: string[];
    /** tableExemptRecipients — скрыть из блоков расселения */
    admin_exempt?: string[];
    /** Черновик пар для «любое расселение» (ещё не confirmed в answer_values) */
    draft_suggestions?: {
      generated_at?: string | null;
      draft_pairs: Array<{
        a: string;
        b: string;
        gender?: string;
        rule?: string;
        same_department?: boolean;
        department?: string;
      }>;
      draft_unpaired: string[];
      uncovered_solos: string[];
      /** ФИО → кафедра из XLS (для подписи при смене партнёра) */
      departments_by_name?: Record<string, string>;
      meta?: {
        source_pairs?: number;
        active_draft_pairs?: number;
        draft_unpaired?: number;
        uncovered_solos?: number;
      };
    };
  };
  letter: {
    recipients: string[];
    acknowledgments: Array<{ name: string; label: string | null; response_id: number }>;
  };
  /** Official person_select roster vs who already submitted. */
  roster?: {
    total: number;
    answered_count: number;
    missing_count: number;
    answered: string[];
    missing: string[];
  };
  documents: CorporateDocumentFile[];
  files_storage_enabled: boolean;
}

export type {
  CorporateRoomingCategoryGroup,
  CorporateRoomingHotel,
  CorporateRoomingListPayload,
  CorporateRoomingNumHighlight,
  CorporateRoomingRoom,
} from '../lib/corporateRoomingList';

export interface ForumTopicSlotOccupant {
  responseId: number;
  fio: string;
  picks: Array<{ id: string; label: string; group?: string; groupLabel?: string }>;
  path?: Array<{ timeId: string; timeLabel: string; themeId: string; themeLabel: string }>;
}

export interface ForumTopicSlotsDashboardPayload {
  survey: { id: number; title: string; access_link: string };
  meta: {
    pickCount: number;
    capacityPerSlot: number;
    aiSlotId: string | null;
    aiThemeId?: string | null;
    onePerGroup?: boolean;
    uniqueThemes?: boolean;
    mode?: string;
    aiAlways?: boolean;
    tableTitle?: string;
  };
  totals: { responses: number; slotsFull: number; slotCount: number };
  slots: Array<{
    id: string;
    label: string;
    group: string;
    groupLabel: string;
    count: number;
    capacity: number;
    full: boolean;
    occupants: ForumTopicSlotOccupant[];
  }>;
  topics: Array<{
    id: string;
    label: string;
    group: string;
    groupLabel: string;
    count: number;
    capacity: number;
    full: boolean;
    participants: string[];
    entries?: Array<{ responseId: number; fio: string; timeId: string; timeLabel: string }>;
    byTime?: Array<{ timeId: string; timeLabel: string; participants: string[]; count: number }>;
  }>;
  groups: Array<{
    id: string;
    label: string;
    timeLabel?: string | null;
    count?: number;
    capacity?: number;
    full?: boolean;
    participants?: string[];
    path?: Array<{ timeId: string; timeLabel: string; themeId: string; themeLabel: string }>;
    slots: Array<{ id: string; label: string; count: number; capacity: number; full: boolean }>;
  }>;
  byTime?: Array<{
    id: string;
    label: string;
    kind: string;
    spanLabel?: string;
    cells: Array<{
      themeId: string;
      themeLabel: string;
      groupId: string;
      groupLabel: string;
      slotId?: string;
      participants: string[];
      count: number;
      capacity?: number;
      full?: boolean;
    }>;
  }>;
  participants: Array<{
    responseId: number;
    fio: string;
    submittedAt: string;
    picks: Array<{
      id: string;
      label: string;
      group: string;
      groupLabel: string;
      theme?: string;
      themeLabel?: string;
      timeLabel?: string;
    }>;
    path?: Array<{ timeId: string; timeLabel: string; themeId: string; themeLabel: string }>;
    ai: {
      usesAi: string;
      purposes?: string;
      platforms?: string;
      practices?: string;
    } | null;
  }>;
}

export interface ForumTopicFeedbackThemeBlock {
  id: string;
  label: string;
  accentIndex: number;
  responseCount: number;
  practicalAverage: number | null;
  practicalDistribution: Array<{ value: number; count: number }>;
  recommendDistribution: Array<{ label: string; count: number; pct: number }>;
  techniques: Array<{ text: string; responseId: number }>;
}

export interface ForumTopicFeedbackGeneralQuestion {
  questionId: number;
  text: string;
  sectionTitle: string;
  answerCount: number;
  answers: Array<{ responseId: number; text: string; submittedAt: string }>;
}

export interface ForumTopicFeedbackDashboardPayload {
  survey: { id: number; title: string; access_link: string };
  meta: {
    roundCount: number;
    practicalLabel: string;
    techniquesLabel: string;
    recommendLabel: string;
    recommendChoices: string[];
  };
  totals: {
    responses: number;
    feedbackRespondents: number;
    themeCount: number;
  };
  themes: ForumTopicFeedbackThemeBlock[];
  generalQuestions: ForumTopicFeedbackGeneralQuestion[];
}

export interface ForumTopicFeedbackAiThemeSummary {
  id: string;
  summary: string;
  narrative?: string;
  pluses: string[];
  minuses: string[];
}

export interface ForumTopicFeedbackAiPayload {
  source: string;
  headline: string;
  narrative?: string;
  pluses: string[];
  minuses: string[];
  comment_themes: Array<{ heading: string; body: string }>;
  next_steps: string[];
  text_answers_used: number;
  themes?: ForumTopicFeedbackAiThemeSummary[];
}
