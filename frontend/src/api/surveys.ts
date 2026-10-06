import type { AiInsightsPayload, AnalyticsChatMessage, AnalyticsChatResponse, AnalyticsFilter, TextQuestionInsightsPayload, AnswerSubmit, ResultsPayload, DirectorLessonGroupsPayload, Survey, ListSurveysResponse, SurveyGroup, SurveyExportRowsPayload, PhenomenalMergeLlmChoice, SurveyWorkbook, TextAnswersPage } from '../types';
import { getSmartCaptchaToken } from '../lib/smartCaptcha';

import { API_BASE, apiFetch, adminHeaders, adminResultsHeaders, parseJson, throwIfResultsPasswordRequired, throwVerifyResultsPasswordError, throwApiResponseError, clientAppBase } from './http';
import { PulseSpreadsheetSheet } from './cabinet';

export async function listSurveysSplit(): Promise<ListSurveysResponse> {
  const res = await apiFetch(`${API_BASE}/api/surveys`, { headers: adminHeaders() });
  const data = await parseJson<{ surveys?: Survey[]; shared_surveys?: Survey[]; error?: string; message?: string }>(
    res,
  );
  if (!res.ok) throwApiResponseError(res, data, 'GET /api/surveys');
  const owned = data.surveys || [];
  const shared = data.shared_surveys || [];
  return { surveys: owned, sharedSurveys: shared };
}

/** Все доступные опросы (личные + общие) — для выбора в аналитике и группах. */

export async function listSurveys(): Promise<Survey[]> {
  const { surveys, sharedSurveys } = await listSurveysSplit();
  const seen = new Set<number>();
  const out: Survey[] = [];
  for (const s of [...surveys, ...sharedSurveys]) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

export async function getSurveyGroups(): Promise<SurveyGroup[]> {
  const res = await apiFetch(`${API_BASE}/api/survey-groups`, { headers: adminHeaders() });
  const data = await parseJson<{ groups: SurveyGroup[]; error?: string; message?: string }>(res);
  if (!res.ok) throwApiResponseError(res, data, 'GET /api/survey-groups');
  return data.groups || [];
}

/** Создать раздел опросов (сессия сотрудника с правом на разделы). */

export async function createSurveyGroup(payload: {
  name: string;
  curator_name?: string;
  sort_order?: number;
  slug?: string;
}): Promise<SurveyGroup> {
  const res = await apiFetch(`${API_BASE}/api/survey-groups`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ group?: SurveyGroup; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || res.statusText);
  if (!data.group) throw new Error('Нет данных раздела');
  return data.group;
}

export async function getSurvey(id: number): Promise<Survey> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${id}`, { headers: adminHeaders() });
  const data = await parseJson<{ survey: Survey }>(res);
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data.survey;
}

export type SurveyWritePayload = Omit<Partial<Survey>, 'questions'> & { questions?: unknown[] };

export async function createSurvey(payload: SurveyWritePayload): Promise<Survey> {
  const res = await apiFetch(`${API_BASE}/api/surveys`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ survey: Survey }>(res);
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data.survey;
}

export async function deleteSurvey(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; message?: string }>(res);
  if (!res.ok) throwApiResponseError(res, data, 'DELETE /api/surveys/:id');
}

export async function updateSurvey(id: number, payload: SurveyWritePayload): Promise<Survey> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ survey: Survey }>(res);
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data.survey;
}

export type SurveyResultsAccessStatus = {
  survey_id: number;
  access_link: string | null;
  password_required: boolean;
  results_password_supported: boolean;
};

export async function getSurveyResultsAccessStatus(surveyId: number): Promise<SurveyResultsAccessStatus> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/results-access`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  const data = await parseJson<SurveyResultsAccessStatus & { error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function postSurveyVerifyResultsPassword(
  surveyId: number,
  password: string,
): Promise<{ token: string; expires_at: string }> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/verify-results-password`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ password }),
  });
  const data = await parseJson<{ token?: string; expires_at?: string; error?: string; message?: string }>(res);
  if (!res.ok) throwVerifyResultsPasswordError(res, data);
  const token = String(data.token || '').trim();
  if (!token) throw new Error('Некорректный ответ сервера');
  return { token, expires_at: String(data.expires_at || '') };
}

export async function getResults(
  id: number,
  accessLink?: string | null,
): Promise<ResultsPayload> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${id}/results`, {
    headers: adminResultsHeaders(id, accessLink),
  });
  const data = await parseJson<ResultsPayload & { error?: string; password_required?: boolean }>(res);
  throwIfResultsPasswordRequired(res, data);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function getAnalyticsFacets(
  surveyId: number,
  accessLink?: string | null,
): Promise<{ facets: Record<string, string[]> }> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/analytics-facets`, {
    headers: adminResultsHeaders(surveyId, accessLink),
  });
  const data = await parseJson<{ facets?: Record<string, string[]>; error?: string; password_required?: boolean }>(
    res,
  );
  throwIfResultsPasswordRequired(res, data);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return { facets: data.facets || {} };
}

export async function postResultsFilter(
  surveyId: number,
  filters: AnalyticsFilter[],
  accessLink?: string | null,
): Promise<ResultsPayload> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/results-filter`, {
    method: 'POST',
    headers: adminResultsHeaders(surveyId, accessLink),
    body: JSON.stringify({ filters }),
  });
  const data = await parseJson<ResultsPayload & { error?: string; password_required?: boolean }>(res);
  throwIfResultsPasswordRequired(res, data);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function getSurveyExportRows(
  surveyId: number,
  accessLink?: string | null,
): Promise<SurveyExportRowsPayload> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/export-rows`, {
    headers: adminResultsHeaders(surveyId, accessLink),
  });
  const data = await parseJson<SurveyExportRowsPayload & { error?: string; password_required?: boolean }>(res);
  throwIfResultsPasswordRequired(res, data);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function deleteSurveyResponse(surveyId: number, responseId: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/responses/${responseId}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  const data = await parseJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
}

export async function clearSurveyResponses(surveyId: number): Promise<{ deleted_count: number }> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/responses`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  const data = await parseJson<{ ok?: boolean; deleted_count?: number; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return { deleted_count: data.deleted_count ?? 0 };
}

/** Автосопоставление чек-листа педагогов с ответами родителей: опрос в системе или второй Excel (LLM на сервере). */

export function teacherBookingPublicUrl(shareToken: string): string {
  return `${clientAppBase()}/view/teacher-booking/${encodeURIComponent(shareToken)}`;
}

export function additionalEducationDirectorPublicUrl(shareToken: string): string {
  return `${clientAppBase()}/view/additional-education/${encodeURIComponent(shareToken)}`;
}

export function arabicCenterParentPulseDirectorPublicUrl(shareToken: string): string {
  return `${clientAppBase()}/view/parent-pulse/${encodeURIComponent(shareToken)}`;
}

/** Горизонтальные столбцы на слайде (layout "chart"). */

export function phenomenalReportPublicUrl(shareToken: string): string {
  const enc = encodeURIComponent(shareToken);
  return `${clientAppBase()}/phenomenal-report/${enc}`;
}

/** ИИ: сгруппировать блоки отчёта, если один урок попал в несколько блоков из-за расхождений в шифре. */

export type UserAnalyticsWorkspaceStatePayload = Record<string, unknown>;

export async function getUserAnalyticsWorkspace(): Promise<{
  state: UserAnalyticsWorkspaceStatePayload;
  updated_at: string | null;
}> {
  const res = await apiFetch(`${API_BASE}/api/user-analytics-workspace`, { headers: adminHeaders() });
  const data = await parseJson<{
    state?: UserAnalyticsWorkspaceStatePayload;
    updated_at?: string | null;
    error?: string;
  }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return { state: data.state || {}, updated_at: data.updated_at ?? null };
}

export async function putUserAnalyticsWorkspace(
  patch: UserAnalyticsWorkspaceStatePayload,
): Promise<{ state: UserAnalyticsWorkspaceStatePayload; updated_at: string }> {
  const res = await apiFetch(`${API_BASE}/api/user-analytics-workspace`, {
    method: 'PUT',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ patch }),
  });
  const data = await parseJson<{
    state?: UserAnalyticsWorkspaceStatePayload;
    updated_at?: string;
    error?: string;
  }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return { state: data.state || {}, updated_at: String(data.updated_at || '') };
}

export async function putSurveyInviteTemplate(
  surveyId: number,
  payload: { subject: string; html: string }
): Promise<{ ok: boolean }> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/invites/template`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return { ok: Boolean(data.ok) };
}

function textAnswersQueryString(params: { question_id?: number; q?: string; offset?: number; limit?: number }) {
  const sp = new URLSearchParams();
  if (params.question_id != null) sp.set('question_id', String(params.question_id));
  if (params.q) sp.set('q', params.q);
  sp.set('offset', String(params.offset ?? 0));
  sp.set('limit', String(params.limit ?? 40));
  return sp.toString();
}

export async function getSurveyTextAnswers(
  surveyId: number,
  params: { question_id?: number; q?: string; offset?: number; limit?: number },
  accessLink?: string | null,
): Promise<TextAnswersPage> {
  const qs = textAnswersQueryString(params);
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/text-answers?${qs}`, {
    headers: adminResultsHeaders(surveyId, accessLink),
  });
  const data = await parseJson<TextAnswersPage & { error?: string; password_required?: boolean }>(res);
  throwIfResultsPasswordRequired(res, data);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

/** Несколько опросов: сводка, темы, выбранные диаграммы и связный текст (контур ИИ на функции). */

export async function requestAiInsights(surveyId: number, filters?: AnalyticsFilter[]): Promise<AiInsightsPayload> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/ai-insights`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ filters: filters ?? [] }),
  });
  const data = await parseJson<AiInsightsPayload & { error?: string; message?: string }>(res);
  if (!res.ok) throwApiResponseError(res, data, 'POST /api/surveys/:id/ai-insights');
  return data;
}

/** Единый ИИ-дашборд: секции, графики, KPI, теплокарта сегментов, нарратив. */
export async function postUnifiedSurveyDashboard(
  surveyId: number,
  filters?: AnalyticsFilter[],
  accessLink?: string | null,
): Promise<import('../types').UnifiedSurveyDashboardPayload> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/unified-dashboard`, {
    method: 'POST',
    headers: adminResultsHeaders(surveyId, accessLink),
    body: JSON.stringify({ filters: filters ?? [] }),
  });
  const data = await parseJson<import('../types').UnifiedSurveyDashboardPayload & { error?: string; message?: string }>(
    res,
  );
  if (!res.ok) throwApiResponseError(res, data, 'POST /api/surveys/:id/unified-dashboard');
  return data;
}

export async function postUnifiedDashboardRefine(
  surveyId: number,
  prompt: string,
  filters?: AnalyticsFilter[],
  accessLink?: string | null,
): Promise<{
  dashboard_plan: import('../types').UnifiedDashboardPlan;
  plan_blocks: import('../types').UnifiedDashboardPlanBlock[];
  change_summary?: string;
  plan_source?: string;
  llm_error?: string;
}> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/unified-dashboard/refine`, {
    method: 'POST',
    headers: adminResultsHeaders(surveyId, accessLink),
    body: JSON.stringify({ prompt, filters: filters ?? [] }),
  });
  const data = await parseJson<
    {
      dashboard_plan: import('../types').UnifiedDashboardPlan;
      plan_blocks: import('../types').UnifiedDashboardPlanBlock[];
      change_summary?: string;
      plan_source?: string;
      llm_error?: string;
      error?: string;
      message?: string;
    }
  >(res);
  if (!res.ok) throwApiResponseError(res, data, 'POST /api/surveys/:id/unified-dashboard/refine');
  return data;
}

export async function postSurveyDraftAi(
  surveyId: number,
  body: {
    prompt: string;
    questions: unknown[];
    title?: string;
    description?: string;
    revision?: number;
  },
): Promise<import('../types').SurveyDraftAiPatchResponse> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/draft-ai`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<import('../types').SurveyDraftAiPatchResponse & { error?: string; message?: string }>(res);
  if (!res.ok) throwApiResponseError(res, data, 'POST /api/surveys/:id/draft-ai');
  return data;
}

/** ИИ-группировка ответов по «урокам» для сводки директора (нет шифра в форме). До 100 ответов. */

export async function postSurveyDirectorAiLessonGroups(surveyId: number): Promise<{
  ok: true;
  groups_count: number;
  llm_provider: string | null;
  llm_choice?: PhenomenalMergeLlmChoice;
  repaired_singletons?: number;
}> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/director-ai-lesson-groups`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({}),
  });
  const data = await parseJson<{
    ok?: boolean;
    groups_count?: number;
    llm_provider?: string | null;
    llm_choice?: PhenomenalMergeLlmChoice;
    repaired_singletons?: number;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) {
    const msg = (data.message || data.error || res.statusText || '').trim();
    throw new Error(msg || `Запрос не выполнен (${res.status})`);
  }
  if (!data.ok) {
    throw new Error((data.message || data.error || 'Не удалось сохранить группы').trim());
  }
  const repaired = Number(data.repaired_singletons) || 0;
  return {
    ok: true,
    groups_count: Number(data.groups_count) || 0,
    llm_provider: data.llm_provider ?? null,
    ...(data.llm_choice ? { llm_choice: data.llm_choice } : {}),
    ...(repaired > 0 ? { repaired_singletons: repaired } : {}),
  };
}

/** Публичная сводка по секретному токену директора (без авторизации). */

export async function getDirectorSurveyResults(
  directorToken: string,
  opts?: { lessonKey?: string },
): Promise<ResultsPayload> {
  const enc = encodeURIComponent(directorToken);
  const q =
    opts?.lessonKey != null && String(opts.lessonKey).trim() !== ''
      ? `?lesson_key=${encodeURIComponent(String(opts.lessonKey).trim())}`
      : '';
  const res = await apiFetch(`${API_BASE}/api/public/director/${enc}/results${q}`, { cache: 'no-store' });
  const data = await parseJson<ResultsPayload & { error?: string; message?: string }>(res);
  if (!res.ok) {
    throw new Error(data.message || data.error || res.statusText);
  }
  return data;
}

/** Сырые строки ответов для сводки директора (карточки респондентов). */

export async function getDirectorSurveyExportRows(
  directorToken: string,
  opts?: { lessonKey?: string },
): Promise<SurveyExportRowsPayload> {
  const enc = encodeURIComponent(directorToken);
  const q =
    opts?.lessonKey != null && String(opts.lessonKey).trim() !== ''
      ? `?lesson_key=${encodeURIComponent(String(opts.lessonKey).trim())}`
      : '';
  const res = await apiFetch(`${API_BASE}/api/public/director/${enc}/export-rows${q}`, { cache: 'no-store' });
  const data = await parseJson<SurveyExportRowsPayload & { error?: string; message?: string }>(res);
  if (!res.ok) {
    throw new Error(data.message || data.error || res.statusText);
  }
  return data;
}

/** Список уроков для сводки директора (группировка по учителю, классу, шифру урока). */

export async function getDirectorLessonGroups(directorToken: string): Promise<DirectorLessonGroupsPayload> {
  const enc = encodeURIComponent(directorToken);
  const res = await apiFetch(`${API_BASE}/api/public/director/${enc}/lesson-groups`, { cache: 'no-store' });
  const data = await parseJson<DirectorLessonGroupsPayload & { error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || res.statusText);
  return data;
}

export async function requestDirectorAiInsights(
  directorToken: string,
  opts?: { lessonKey?: string },
): Promise<AiInsightsPayload> {
  const enc = encodeURIComponent(directorToken);
  const body: Record<string, unknown> = { filters: [] };
  if (opts?.lessonKey != null && String(opts.lessonKey).trim() !== '') {
    const k = String(opts.lessonKey).trim();
    body.lesson_key = k;
    body.lessonKey = k;
  }
  const res = await apiFetch(`${API_BASE}/api/public/director/${enc}/ai-insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson<AiInsightsPayload & { error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || res.statusText);
  return data;
}

/** Диалог с нейроаналитиком по текущей выборке и срезу (на функции нужен OPENAI_API_KEY). */

export async function postAnalyticsChat(
  surveyId: number,
  payload: { filters: AnalyticsFilter[]; messages: AnalyticsChatMessage[] },
): Promise<AnalyticsChatResponse> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/analytics-chat`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ filters: payload.filters, messages: payload.messages }),
  });
  const data = await parseJson<AnalyticsChatResponse & { error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

/** Связный «Сводный анализ» по машинной сводке и контексту (нужен OPENAI_API_KEY). */

export async function requestTextQuestionInsights(
  surveyId: number,
  questionId: number,
  filters?: AnalyticsFilter[],
): Promise<TextQuestionInsightsPayload> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/text-question-insights`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ question_id: questionId, filters: filters ?? [] }),
  });
  const data = await parseJson<TextQuestionInsightsPayload & { error?: string; message?: string }>(res);
  if (!res.ok) throwApiResponseError(res, data, 'POST /api/surveys/:id/text-question-insights');
  return data;
}

const YC_APIGW_DEFAULT_BODY_BYTES = 4 * 1024 * 1024;

const WORKBOOK_JSON_OVERHEAD_BYTES = 48 * 1024;

const WORKBOOK_BASE64_MAX_BYTES = Math.max(
  256 * 1024,
  Math.floor(((YC_APIGW_DEFAULT_BODY_BYTES - WORKBOOK_JSON_OVERHEAD_BYTES) * 3) / 4),
);

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      const comma = r.indexOf(',');
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

/**
 * Новый черновик из Excel: предпочтительно JSON + file_base64 (стабильно через API Gateway);
 * для крупных файлов — multipart (поле file).
 */

export async function postSurveyFromWorkbook(file: File): Promise<{
  survey: Survey;
  workbook: SurveyWorkbook;
  import?: { imported: number; errors: { row: number; error: string }[] };
}> {
  const url = `${API_BASE}/api/surveys/from-workbook`;

  let res: Response;
  if (file.size <= WORKBOOK_BASE64_MAX_BYTES) {
    const file_base64 = await readFileAsBase64(file);
    res = await apiFetch(url, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ filename: file.name, file_base64 }),
    });
  } else {
    const fd = new FormData();
    fd.append('file', file, file.name);
    res = await apiFetch(url, {
      method: 'POST',
      headers: adminHeaders(),
      body: fd,
    });
  }

  const text = await res.text();
  let data: {
    survey?: Survey;
    workbook?: SurveyWorkbook;
    import?: { imported: number; errors: { row: number; error: string }[] };
    error?: string;
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    if (!res.ok && (res.status === 413 || /4194304|4\s*МБ|размер файла/i.test(text))) {
      throw new Error(
        'Файл слишком большой для лимита шлюза (обычно 4 МБ на один запрос). Уменьшите .xlsx, либо в Яндекс Облаке у API Gateway увеличьте максимальный размер тела запроса; для больших файлов приложение отправляет multipart вместо JSON.',
      );
    }
    throw new Error(
      res.ok ? 'Некорректный ответ сервера' : 'Сервер вернул не JSON — проверьте VITE_API_BASE и шлюз',
    );
  }
  if (!res.ok) {
    const apiErr = (data as { error?: string }).error || res.statusText;
    if (res.status === 413 || /4194304|4\s*МБ/i.test(apiErr)) {
      throw new Error(
        'Файл слишком большой для лимита шлюза (4 МБ). Уменьшите .xlsx или увеличьте лимит тела запроса в настройках API Gateway.',
      );
    }
    throw new Error(apiErr);
  }
  if (!data.survey) throw new Error(data.error || 'Нет данных опроса в ответе');
  return {
    survey: data.survey,
    workbook: data.workbook as SurveyWorkbook,
    import: data.import,
  };
}

export async function submitResponse(
  accessLink: string,
  respondentId: string,
  answers: AnswerSubmit[]
): Promise<void> {
  const smart_captcha = await getSmartCaptchaToken();
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${encodeURIComponent(accessLink)}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      respondent_id: respondentId,
      answers,
      ...(smart_captcha ? { smart_captcha } : {}),
    }),
  });
  const data = await parseJson<{
    error?: string;
    message?: string;
    question_id?: number;
    maxLength?: number;
  }>(res);
  if (!res.ok) {
    const err = new Error(data.message || data.error || res.statusText) as Error & {
      code?: string;
      question_id?: number;
      maxLength?: number;
    };
    err.code = data.error;
    if (Number.isFinite(Number(data.question_id))) err.question_id = Number(data.question_id);
    if (Number.isFinite(Number(data.maxLength))) err.maxLength = Number(data.maxLength);
    throw err;
  }
}

export function publicFormUrl(accessLink: string, opts?: { person?: string | null }): string {
  const base = `${clientAppBase()}/s/${accessLink}`;
  const person = opts?.person != null ? String(opts.person).trim() : '';
  if (!person) return base;
  const qs = new URLSearchParams({ person });
  return `${base}?${qs.toString()}`;
}

/** Публичный путь дашборда вовлечённости (SPA, без входа). */

export function moEngagementDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/dashboard`;
}

/** Публичный дашборд вовлечённости (без входа), только mo-vovlechennost-* + published/closed. */

export function moEngagementDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${moEngagementDashboardPath(accessLink)}`;
}

/** Публичный путь дашборда родительской обратной связи (SPA, без входа). */

export function parentFeedbackDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/parent-dashboard`;
}

/** Публичный дашборд родительской анкеты, только parent-feedback-* + published/closed. */

export function parentFeedbackDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${parentFeedbackDashboardPath(accessLink)}`;
}

/** Публичный путь дашборда анкеты 10 класса (цели и планы). */

export function teambuildingFeedbackDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/feedback-dashboard`;
}

export function teambuildingFeedbackDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${teambuildingFeedbackDashboardPath(accessLink)}`;
}

/** Публичный дашборд регистрации на ПРИМА КВИЗПЛИЗ. */
export function primaQuizplizDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/quizpliz-dashboard`;
}

export function primaQuizplizDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${primaQuizplizDashboardPath(accessLink)}`;
}

/** Публичный дашборд рефлексии участника Лиги домов. */
export function ligaDomovReflectionDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/liga-reflection-dashboard`;
}

export function ligaDomovReflectionDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${ligaDomovReflectionDashboardPath(accessLink)}`;
}

export function forumTopicSlotsDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/forum-sessions`;
}

export function forumTopicSlotsDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${forumTopicSlotsDashboardPath(accessLink)}`;
}

export function teacherWorkingTimeDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/working-time`;
}

export function teacherWorkingTimeDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${teacherWorkingTimeDashboardPath(accessLink)}`;
}

/** Публичные результаты опроса (SPA, без входа сотрудника). */

export function forumTopicFeedbackDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/forum-feedback`;
}

export async function getPublicForumAccessLinkBySurveyId(
  surveyId: number,
): Promise<{ access_link: string; survey_id: number }> {
  const res = await apiFetch(`${API_BASE}/api/public/surveys/by-id/${surveyId}/forum-access-link`, {
    cache: 'no-store',
  });
  const data = await parseJson<{ access_link: string; survey_id: number; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function postPublicOpsCheckIn(input: {
  staff_id?: number | null;
  guest_name?: string;
}): Promise<{
  person: { staff_id: number | null; full_name: string; chair: string | null; guest?: boolean };
  session: { id: number; title: string; held_on: string };
  already: boolean;
}> {
  const body: { staff_id?: number; guest_name?: string } = {};
  if (input.staff_id != null && Number.isInteger(input.staff_id) && input.staff_id !== 0) {
    body.staff_id = input.staff_id;
  }
  if (input.guest_name) body.guest_name = input.guest_name;
  const res = await apiFetch(`${API_BASE}/api/public/ops-meetings/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    person?: { staff_id: number | null; full_name: string; chair: string | null; guest?: boolean };
    session?: { id: number; title: string; held_on: string };
    already?: boolean;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.person || !data.session) {
    throw new Error(data.message || data.error || 'Не удалось отметить посещение');
  }
  return { person: data.person, session: data.session, already: Boolean(data.already) };
}

export function opsMeetingsPublicUrl(): string {
  return `${clientAppBase()}/ops-meetings`;
}

export function opsMeetingsQrUrl(_size = 480): string {
  // Local asset — external QR APIs are often blocked on school networks.
  return '/ops/meetings-qr.png';
}

export async function publicSpreadsheetByToken(token: string): Promise<{
  id?: number;
  title: string;
  sheets: PulseSpreadsheetSheet[];
  doc?: unknown;
  version?: number;
  source_url?: string | null;
  can_edit: boolean;
}> {
  const res = await apiFetch(`${API_BASE}/api/tables/${encodeURIComponent(token)}`);
  const data = await parseJson<{
    id?: number;
    title?: string;
    sheets?: PulseSpreadsheetSheet[];
    doc?: unknown;
    version?: number;
    source_url?: string | null;
    can_edit?: boolean;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(data.message || 'Ссылка больше не действует.');
  return {
    id: data.id,
    title: data.title || 'Таблица',
    sheets: data.sheets || [],
    doc: data.doc,
    version: data.version,
    source_url: data.source_url || null,
    can_edit: false,
  };
}
