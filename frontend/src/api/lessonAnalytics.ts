import type { SavedExcelSession } from '../lib/excelAnalytics/excelSessionStorage';

import { API_BASE, apiFetch, adminHeaders, parseJson } from './http';

export type ServerImportedExcelGrid = {
  v: 1;
  fileName: string;
  /** Все подгруженные вручную файлы по порядку (если сводка собрана из нескольких Excel). */
  sourceFiles?: string[];
  sheet: string;
  headerRow1Based: number;
  headers: string[];
  rows: (string | number | boolean | null)[][];
};

/** Модуль «Аналитика уроков» — проект на сервере (Excel + блоки по педагогам). */

export interface LessonAnalyticsProjectRow {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  /** Токен публичной ссылки для руководителя (не меняется при пересохранении). */
  director_share_token?: string;
}

/** Ручной состав карточки: какие аналитические строки входят в сводку педагога. */

export type LessonAnalyticsTeacherRowMembership = {
  includeKeys?: string[];
  excludeKeys?: string[];
};

export interface LessonAnalyticsTeacherBlock {
  id: string;
  teacherLabel: string;
  status: 'draft' | 'agreed';
  /** Время фиксации согласования (сохраняется в draft на сервере). */
  agreedAt?: string | null;
  /** Связный текст от ИИ (как «Сводный анализ» в Наблюдения Excel). */
  aiNarrative?: string;
  /** Хеш входных данных карточки на момент генерации ИИ (JSON-архив). */
  aiNarrativeContentHash?: string;
  /** Текст правился методистом вручную (не перезаписывать при пакетном ИИ без явного запроса). */
  aiNarrativeManualEdit?: boolean;
  /** Ручное добавление/исключение строк наблюдений (если Пульс перепутал похожие ФИО). */
  rowMembership?: LessonAnalyticsTeacherRowMembership | null;
  emailedAt?: string | null;
  pdfPrintedAt?: string | null;
}

/** Подключённый опрос Пульс — живое обновление сводки на странице проекта. */

export interface LessonAnalyticsLinkedSurvey {
  id: number;
  title: string;
  lastSyncedAt: string | null;
  lastSyncSignature: string | null;
  /** false — только ручная синхронизация */
  liveEnabled?: boolean;
}

/** Макет модулей PDF (конструктор → все отчёты проекта). */

export type LessonAnalyticsPdfLayoutSettings = {
  /** Ширина одной диаграммы среза, % полезной ширины листа (30–100). */
  sliceWidthPct?: number;
  /** 1 — на всю ширину; 2 — две диаграммы в ряд (при sliceWidthPct ≈ 50). */
  sliceChartsPerRow?: 1 | 2;
  competenciesPageBreakBefore?: boolean;
  aiNarrativeKeepTogether?: boolean;
  phraseCountHeatColors?: boolean;
  showLessonCountInHeader?: boolean;
};

/** Визуальные настройки PDF (конструктор аналитики уроков). */

export type LessonAnalyticsPdfVisualSettings = {
  orientation?: 'landscape' | 'portrait';
  accent?: 'pulse-red' | 'blue' | 'green' | 'slate';
  density?: 'compact' | 'normal' | 'airy';
  reportTitle?: string;
  entityCaption?: string;
  reportTagline?: string;
  leadLine?: string;
  showDisclaimer?: boolean;
  showPulseBrand?: boolean;
  showPageNumbers?: boolean;
  showGeneratedDate?: boolean;
  showSectionBars?: boolean;
  maxSliceCharts?: number;
  maxPages?: number;
  layout?: LessonAnalyticsPdfLayoutSettings;
};

/** Шаблон оформления карточек педагога в проекте (экран + PDF). */

export interface LessonAnalyticsCardTemplate {
  v: 1;
  updatedAt: string;
  /** Текст в начале каждой карточки / PDF */
  introText?: string;
  /** Подпись внизу PDF */
  footerText?: string;
  showSliceCharts?: boolean;
  showCompetencyTable?: boolean;
  /** Выводы и рекомендации из файла */
  showProsePanel?: boolean;
  showQuickSummary?: boolean;
  showAiNarrative?: boolean;
  /** Доп. указание для ИИ при фоновой аналитике всех карточек */
  aiUserFocus?: string;
  /** Быстрый режим ИИ: компактный промпт, короче ответ (~быстрее очередь). */
  aiFastMode?: boolean;
  /** Визуальные настройки PDF (конструктор) */
  pdfVisual?: LessonAnalyticsPdfVisualSettings;
}

export type LessonAnalyticsLlmProvider = 'closed' | 'open';

export interface LessonAnalyticsDraft {
  title: string;
  updatedAt: string;
  /** Маппинг колонок и срез; вместе с importedGrid хранится на сервере в проекте. */
  excelSession: SavedExcelSession | null;
  /**
   * Красное выделение карточек (отдельно от filterSelection в excelSession).
   * Те же ключи измерений; не сужает список — только подсветка.
   */
  redHighlightSelection?: import('../lib/excelAnalytics/engine').FilterSelection | null;
  teacherBlocks: LessonAnalyticsTeacherBlock[];
  /** Снимок листа в state_json на сервере — при открытии проекта файл с диска не обязателен. */
  importedGrid?: ServerImportedExcelGrid | null;
  /** Опрос Пульс: ответы → та же сетка, что из Excel */
  linkedSurvey?: LessonAnalyticsLinkedSurvey | null;
  /** Единый шаблон карточки для всех педагогов проекта */
  cardTemplate?: LessonAnalyticsCardTemplate | null;
  /** ИИ- или ручная аналитика по срезу (чек-лист посещения урока). */
  dashboardNarrative?: string | null;
  dashboardNarrativeSource?: 'llm' | 'manual' | null;
  /**
   * Календарный период среза и связь с прошлым периодом для ИИ-сравнения.
   * @see docs/LESSON_ANALYTICS_PERIOD_COMPARISON.md
   */
  analysisPeriod?: LessonAnalyticsAnalysisPeriod | null;
  /**
   * Временный переключатель контура ИИ для этого проекта.
   * closed — Qwen на ai.primakov.school (по умолчанию); open — OpenRouter («роутер») / GigaChat по конфигу (не YandexGPT).
   */
  llmProvider?: LessonAnalyticsLlmProvider | null;
}

/** Заготовка для динамического сравнения с предыдущим периодом (см. design doc). */

export type LessonAnalyticsAnalysisPeriod = {
  label?: string;
  start?: string | null;
  end?: string | null;
  /** id другого проекта lesson_analytics для baseline-сравнения */
  compareWithProjectId?: number | null;
  /** TODO: ключ среза в lesson analytics module для корреляции */
  analyticsModuleKey?: string | null;
};

export async function listLessonAnalyticsProjects(): Promise<LessonAnalyticsProjectRow[]> {
  const res = await apiFetch(`${API_BASE}/api/lesson-analytics-projects`, { headers: adminHeaders() });
  const data = await parseJson<{ projects?: LessonAnalyticsProjectRow[]; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data.projects ?? [];
}

export async function getLessonAnalyticsProject(
  projectId: number,
): Promise<{ project: LessonAnalyticsProjectRow; draft: LessonAnalyticsDraft }> {
  const res = await apiFetch(`${API_BASE}/api/lesson-analytics-projects/${projectId}`, { headers: adminHeaders() });
  const data = await parseJson<{
    project?: LessonAnalyticsProjectRow;
    draft?: LessonAnalyticsDraft;
    error?: string;
  }>(res);
  if (!res.ok || !data.project || !data.draft) throw new Error(data.error || res.statusText);
  return { project: data.project, draft: data.draft };
}

export async function putLessonAnalyticsProject(
  projectId: number,
  body: { title?: string; draft: LessonAnalyticsDraft },
): Promise<{ project: LessonAnalyticsProjectRow; draft: LessonAnalyticsDraft }> {
  const res = await apiFetch(`${API_BASE}/api/lesson-analytics-projects/${projectId}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    project?: LessonAnalyticsProjectRow;
    draft?: LessonAnalyticsDraft;
    error?: string;
  }>(res);
  if (!res.ok || !data.project || !data.draft) throw new Error(data.error || res.statusText);
  return { project: data.project, draft: data.draft };
}

export async function getPublicLessonAnalyticsProject(
  shareToken: string,
): Promise<{ project: { id: number; title: string; updated_at: string }; draft: LessonAnalyticsDraft }> {
  const enc = encodeURIComponent(shareToken);
  const res = await apiFetch(`${API_BASE}/api/public/lesson-analytics-project/${enc}`, { cache: 'no-store' });
  const data = await parseJson<{
    project?: { id: number; title: string; updated_at: string };
    draft?: LessonAnalyticsDraft;
    error?: string;
  }>(res);
  if (!res.ok || !data.project || !data.draft) throw new Error(data.error || res.statusText);
  return { project: data.project, draft: data.draft };
}

export async function postLessonAnalyticsSendEmail(body: {
  project_id: number;
  block_id: string;
  teacher_label: string;
  narrative?: string;
  narrative_html?: string;
  html_intro?: string;
  /** Base64 PDF (опционально); на сервере — вложение к письму. */
  pdf_base64?: string;
  /** Ключ PDF в S3-архиве — сервер подтянет файл, если pdf_base64 не передан. */
  pdf_cache_key?: string;
}): Promise<{ ok: boolean; to: string; emailed_at: string }> {
  const res = await apiFetch(`${API_BASE}/api/lesson-analytics/send-email`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<
    { ok?: boolean; to?: string; emailed_at?: string; error?: string; message?: string } & Record<string, unknown>
  >(res);
  if (!res.ok) {
    const msg = [data.error, data.message].filter(Boolean).join(': ');
    throw new Error(msg || res.statusText);
  }
  return { ok: true, to: String(data.to || ''), emailed_at: String(data.emailed_at || '') };
}

export type LessonAnalyticsTeacherPdfArchiveHit = {
  hit: boolean;
  stored?: boolean;
  download_url?: string;
  object_key?: string;
  size_bytes?: number;
  filename?: string;
};

export async function getLessonAnalyticsTeacherPdfArchive(
  projectId: number,
  query: { block_id: string; cache_key: string; teacher_label?: string },
): Promise<LessonAnalyticsTeacherPdfArchiveHit> {
  const q = new URLSearchParams({
    block_id: query.block_id,
    cache_key: query.cache_key,
  });
  if (query.teacher_label) q.set('teacher_label', query.teacher_label);
  const res = await apiFetch(
    `${API_BASE}/api/lesson-analytics-projects/${projectId}/teacher-pdf-archive?${q.toString()}`,
    { headers: adminHeaders(), cache: 'no-store' },
  );
  const data = await parseJson<LessonAnalyticsTeacherPdfArchiveHit & { error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function postLessonAnalyticsTeacherPdfArchive(
  projectId: number,
  body: {
    block_id: string;
    cache_key: string;
    teacher_label?: string;
    pdf_base64: string;
  },
): Promise<LessonAnalyticsTeacherPdfArchiveHit> {
  const res = await apiFetch(`${API_BASE}/api/lesson-analytics-projects/${projectId}/teacher-pdf-archive`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<LessonAnalyticsTeacherPdfArchiveHit & { error?: string; message?: string }>(res);
  if (!res.ok) {
    const msg = [data.error, data.message].filter(Boolean).join(': ');
    throw new Error(msg || res.statusText);
  }
  return data;
}

export async function listLessonAnalyticsTeacherPdfArchive(
  projectId: number,
): Promise<
  Array<{
    block_id: string;
    object_key: string;
    size_bytes: number;
    updated_at: string | null;
    download_url: string;
  }>
> {
  const res = await apiFetch(
    `${API_BASE}/api/lesson-analytics-projects/${projectId}/teacher-pdf-archive?list=1`,
    { headers: adminHeaders(), cache: 'no-store' },
  );
  const data = await parseJson<{ items?: Array<Record<string, unknown>>; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return (data.items ?? []) as Array<{
    block_id: string;
    object_key: string;
    size_bytes: number;
    updated_at: string | null;
    download_url: string;
  }>;
}

export type LessonAnalyticsTeacherCardArchiveSnapshot = {
  v?: number;
  projectId?: number;
  blockId?: string;
  contentHash?: string;
  teacherLabel?: string;
  aiNarrative: string;
  aiNarrativeSource?: 'llm' | 'fallback' | 'manual' | null;
  fromLlm?: boolean;
  generatedAt?: string;
};

export type LessonAnalyticsTeacherCardArchiveHit = {
  hit: boolean;
  stored?: boolean;
  download_url?: string;
  object_key?: string;
  size_bytes?: number;
  snapshot?: LessonAnalyticsTeacherCardArchiveSnapshot;
  content_hash?: string;
  block_id?: string;
};

export async function getLessonAnalyticsTeacherCardArchive(
  projectId: number,
  query: { block_id: string; content_hash: string },
): Promise<LessonAnalyticsTeacherCardArchiveHit> {
  const q = new URLSearchParams({
    block_id: query.block_id,
    content_hash: query.content_hash,
  });
  const res = await apiFetch(
    `${API_BASE}/api/lesson-analytics-projects/${projectId}/teacher-card-archive?${q.toString()}`,
    { headers: adminHeaders(), cache: 'no-store' },
  );
  const data = await parseJson<LessonAnalyticsTeacherCardArchiveHit & { error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function postLessonAnalyticsTeacherCardArchive(
  projectId: number,
  body: {
    block_id: string;
    content_hash: string;
    teacher_label?: string;
    snapshot: LessonAnalyticsTeacherCardArchiveSnapshot;
  },
): Promise<LessonAnalyticsTeacherCardArchiveHit> {
  const res = await apiFetch(`${API_BASE}/api/lesson-analytics-projects/${projectId}/teacher-card-archive`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<LessonAnalyticsTeacherCardArchiveHit & { error?: string; message?: string }>(res);
  if (!res.ok) {
    const msg = [data.error, data.message].filter(Boolean).join(': ');
    throw new Error(msg || res.statusText);
  }
  return data;
}

export async function listLessonAnalyticsTeacherCardArchive(
  projectId: number,
): Promise<
  Array<{
    block_id: string;
    object_key: string;
    size_bytes: number;
    updated_at: string | null;
    download_url?: string;
  }>
> {
  const res = await apiFetch(
    `${API_BASE}/api/lesson-analytics-projects/${projectId}/teacher-card-archive?list=1`,
    { headers: adminHeaders(), cache: 'no-store' },
  );
  const data = await parseJson<{ items?: Array<Record<string, unknown>>; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return (data.items ?? []) as Array<{
    block_id: string;
    object_key: string;
    size_bytes: number;
    updated_at: string | null;
    download_url?: string;
  }>;
}

export type LessonAnalyticsTeacherCardArchiveBulkHit = {
  block_id: string;
  content_hash: string;
  hit: boolean;
  object_key?: string;
  size_bytes?: number;
  snapshot?: LessonAnalyticsTeacherCardArchiveSnapshot;
};

/** Пакетная загрузка снимков карточек — один запрос вместо сотен GET. */

export async function postLessonAnalyticsTeacherCardArchiveBulk(
  projectId: number,
  items: Array<{ block_id: string; content_hash: string }>,
): Promise<LessonAnalyticsTeacherCardArchiveBulkHit[]> {
  const res = await apiFetch(
    `${API_BASE}/api/lesson-analytics-projects/${projectId}/teacher-card-archive?bulk=1`,
    {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ bulk: 1, items }),
    },
  );
  const data = await parseJson<{ items?: LessonAnalyticsTeacherCardArchiveBulkHit[]; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data.items ?? [];
}
