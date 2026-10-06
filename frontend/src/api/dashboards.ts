import type { AnalyticsFilter, ResultsPayload, Survey, SurveyExportRowsPayload, TextAnswersPage } from '../types';
import { publicResultsAccessHeaders, surveyResultsAccessHeaders } from '../lib/resultsAccess';

import { API_BASE, apiFetch, adminHeaders, parseJson, apiErrText, throwVerifyResultsPasswordError, throwApiResponseError, clientAppBase, moEngagementClientErrorMessage } from './http';

function textAnswersQueryString(params: { question_id?: number; q?: string; offset?: number; limit?: number }) {
  const sp = new URLSearchParams();
  if (params.question_id != null) sp.set('question_id', String(params.question_id));
  if (params.q) sp.set('q', params.q);
  sp.set('offset', String(params.offset ?? 0));
  sp.set('limit', String(params.limit ?? 40));
  return sp.toString();
}

export type CorporateStaffRow = {
  id: number;
  full_name: string;
  email: string;
  notes: string | null;
  updated_at: string;
};

export async function listCorporateStaffDirectory(): Promise<CorporateStaffRow[]> {
  const res = await apiFetch(`${API_BASE}/api/corporate-staff-directory`, { headers: adminHeaders() });
  const data = await parseJson<{ rows?: CorporateStaffRow[]; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data.rows ?? [];
}

export async function postCorporateStaffDirectory(body: {
  full_name: string;
  email: string;
  notes?: string | null;
}): Promise<CorporateStaffRow> {
  const res = await apiFetch(`${API_BASE}/api/corporate-staff-directory`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ row?: CorporateStaffRow; error?: string }>(res);
  if (!res.ok || !data.row) throw new Error(data.error || res.statusText);
  return data.row;
}

export async function deleteCorporateStaffDirectory(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/corporate-staff-directory/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  const data = await parseJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
}

export async function getPublicSurvey(accessLink: string): Promise<Survey> {
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${encodeURIComponent(accessLink)}`);
  const data = await parseJson<{ survey: Survey; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data.survey;
}

/**
 * У API Gateway Яндекса лимит тела запроса по умолчанию 4 МБ (4194304).
 * Base64 увеличивает размер файла ~на 4/3, плюс рамка JSON и имя файла — нельзя брать «сырой» лимит 4 МБ.
 */

export type CorporateEventState = {
  tables?: Record<string, string[]>;
  seatsByTable?: Record<string, Record<string, string>>;
  tableCount?: number;
  seatsPerTable?: number;
  submittedNames?: string[];
  roommateRequestsForMe?: string[];
  roommateRequestsByTarget?: Record<string, string[]>;
  confirmedPairs?: [string, string][];
  takenRoommates?: string[];
  letterRecipients?: string[];
  letterListReady?: boolean;
  topicSlots?: Record<string, string[]>;
  topicSlotMeta?: Record<
    string,
    {
      id: string;
      label: string;
      group: string;
      groupLabel: string;
      timeLabel?: string;
      theme?: string;
      themeLabel?: string;
    }
  >;
  pickCount?: number;
  capacityPerSlot?: number;
  onePerGroup?: boolean;
  groups?: Array<{ id: string; label: string; timeLabel?: string }>;
};

export async function getPublicSurveyEventState(
  accessLink: string,
  person?: string,
): Promise<CorporateEventState> {
  const qs = person ? `?person=${encodeURIComponent(person)}` : '';
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${encodeURIComponent(accessLink)}/event-state${qs}`,
    { cache: 'no-store' },
  );
  const data = await parseJson<CorporateEventState & { error?: string; ok?: boolean }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return {
    tables: data.tables || {},
    seatsByTable: data.seatsByTable || {},
    tableCount: data.tableCount || 30,
    seatsPerTable: data.seatsPerTable || 12,
    submittedNames: data.submittedNames || [],
    roommateRequestsForMe: data.roommateRequestsForMe || [],
    roommateRequestsByTarget: data.roommateRequestsByTarget || {},
    confirmedPairs: data.confirmedPairs || [],
    takenRoommates: data.takenRoommates || [],
    letterRecipients: data.letterRecipients || [],
    letterListReady: Boolean(data.letterListReady),
    topicSlots: data.topicSlots || undefined,
    topicSlotMeta: data.topicSlotMeta || undefined,
    pickCount: data.pickCount,
    capacityPerSlot: data.capacityPerSlot,
    onePerGroup: data.onePerGroup,
    groups: data.groups,
  };
}

export function grade10GoalsDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/grade10-dashboard`;
}

export function grade10GoalsDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${grade10GoalsDashboardPath(accessLink)}`;
}

export function parentAbsenceDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/parent-absence-dashboard`;
}

export function parentAbsenceDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${parentAbsenceDashboardPath(accessLink)}`;
}

/** Публичный путь дашборда опроса гимназистов 5-х классов. */

export function grade5GymnasiumDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/grade5-dashboard`;
}

export function grade5GymnasiumDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${grade5GymnasiumDashboardPath(accessLink)}`;
}

/** Публичный путь дашборда опроса новых гимназистов. */

export function newcomersGymnasiumDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/newcomers-dashboard`;
}

export function newcomersGymnasiumDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${newcomersGymnasiumDashboardPath(accessLink)}`;
}

/** Публичный путь дашборда корпоративного тимбилдинга. */

export function corporateTeambuildingDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/teambuilding`;
}

export function corporateTeambuildingDashboardPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${corporateTeambuildingDashboardPath(accessLink)}`;
}

export function methodHelpDashboardPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/method-help`;
}

export function corporateTeambuildingLookupViewsPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/lookup-views`;
}

export function corporateTeambuildingLookupViewsPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${corporateTeambuildingLookupViewsPath(accessLink)}`;
}

export type CorporateTeambuildingTeamColor = {
  color: string;
  color_name: string;
};

export type CorporateTeambuildingLookupMatch = {
  name: string;
  team: number;
  team_color: string;
  team_color_name: string;
  team_colors?: CorporateTeambuildingTeamColor[];
  table: number | null;
  seat: number | null;
  is_admin?: boolean;
};

export type CorporateTeambuildingLookupPayload = {
  title?: string;
  matches?: CorporateTeambuildingLookupMatch[];
  person: null | {
    name: string;
    team: number;
    team_color: string;
    team_color_name: string;
    team_colors?: CorporateTeambuildingTeamColor[];
    is_admin?: boolean;
    table: number | null;
    seat: number | null;
    table_label: string;
    department: string;
    position: string;
  };
  team: null | {
    team: number;
    size: number;
    color: string;
    color_name: string;
    colors?: CorporateTeambuildingTeamColor[];
    is_native_team: boolean;
    is_admin_team?: boolean;
    members: Array<{
      name: string;
      department: string;
      position: string;
      you: boolean;
    }>;
  };
  table: null | {
    table: number;
    label: string;
    occupied: number;
    seats: Array<{ seat: number; name: string; you: boolean }>;
  };
  room: null | {
    hotel: string;
    room: number | null;
    block: string;
    category: string;
    room_kind: 'single' | 'double_bed' | 'twin' | 'other';
    room_kind_label: string;
    solo: boolean;
    solo_label: string | null;
    roommates: Array<{ name: string }>;
  };
  map: {
    stage: string;
    highlight_table: number | null;
    tables: Array<{ table: number; x: number; y: number; yours: boolean }>;
  };
  admin_extras_locked?: boolean;
  error?: string;
  message?: string;
};

export async function getPublicCorporateTeambuildingLookup(
  accessLink: string,
  params: { q?: string; name?: string; unlock?: string },
): Promise<CorporateTeambuildingLookupPayload> {
  const enc = encodeURIComponent(accessLink);
  const qs = new URLSearchParams();
  if (params.name) qs.set('name', params.name);
  else if (params.q) qs.set('q', params.q);
  if (params.unlock) qs.set('unlock', params.unlock);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/teambuilding-dashboard/lookup?${qs.toString()}`,
    { cache: 'no-store' },
  );
  const data = await parseJson<CorporateTeambuildingLookupPayload>(res);
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `HTTP ${res.status}`) as Error & {
      code?: string;
      status?: number;
    };
    err.code = data?.error;
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Публичный дашборд выбора тем проектных сессий (форум). */

export function publicSurveyResultsPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/results`;
}

export function publicSurveyResultsPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${publicSurveyResultsPath(accessLink)}`;
}

/** Публичная аналитика по выборке (SPA, без входа сотрудника). */

export function publicSurveyAnalyticsPath(accessLink: string): string {
  return `/s/${encodeURIComponent(accessLink)}/analytics`;
}

export function publicSurveyAnalyticsPublicUrl(accessLink: string): string {
  return `${clientAppBase()}${publicSurveyAnalyticsPath(accessLink)}`;
}

export type PublicSurveyResultsAccessStatus = {
  survey_id: number;
  password_required: boolean;
  results_password_supported: boolean;
};

export async function getPublicSurveyResultsAccessStatus(
  accessLink: string,
): Promise<PublicSurveyResultsAccessStatus> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/results-access`, { cache: 'no-store' });
  const data = await parseJson<PublicSurveyResultsAccessStatus & { error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function postPublicSurveyVerifyResultsPassword(
  accessLink: string,
  password: string,
): Promise<{ token: string; expires_at: string }> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/verify-results-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await parseJson<{ token?: string; expires_at?: string; error?: string; message?: string }>(res);
  if (!res.ok) throwVerifyResultsPasswordError(res, data, { publicRoute: true });
  const token = String(data.token || '').trim();
  if (!token) throw new Error('Некорректный ответ сервера');
  return { token, expires_at: String(data.expires_at || '') };
}

export async function getPublicMoEngagementAccessLinkBySurveyId(
  surveyId: number,
): Promise<{ access_link: string; survey_id: number }> {
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/by-id/${surveyId}/mo-engagement-access-link`,
    { cache: 'no-store' },
  );
  const data = await parseJson<{ access_link?: string; survey_id?: number; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  const accessLink = String(data.access_link || '').trim();
  if (!accessLink) throw new Error('Not found');
  return { access_link: accessLink, survey_id: data.survey_id ?? surveyId };
}

export async function getPublicSurveyAccessLinkBySurveyId(
  surveyId: number,
): Promise<{ access_link: string; survey_id: number }> {
  const res = await apiFetch(`${API_BASE}/api/public/surveys/by-id/${surveyId}/access-link`, {
    cache: 'no-store',
  });
  const data = await parseJson<{ access_link?: string; survey_id?: number; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  const accessLink = String(data.access_link || '').trim();
  if (!accessLink) throw new Error('Not found');
  return { access_link: accessLink, survey_id: data.survey_id ?? surveyId };
}

function throwPublicSurveyResultsApiError(
  res: Response,
  data: { error?: string; message?: string; password_required?: boolean },
): never {
  const err = (data.error || '').trim().toLowerCase();
  if (res.status === 404) {
    throw new Error(
      apiErrText(
        data,
        'Опрос не найден или ещё не опубликован. Проверьте ссылку и статус опроса (published/closed).',
      ),
    );
  }
  if (err === 'results_password_required' || data.password_required) {
    throw new Error('results_password_required');
  }
  if (res.status === 401 || (res.status === 403 && err === 'forbidden')) {
    throw new Error(
      'Публичный просмотр результатов недоступен: на сервере, вероятно, не развёрнута свежая Cloud Function (нужны маршруты /api/public/surveys/…/results). Администратору: ./scripts/deploy-functions.sh; проверка GET /api/ping → deploy_stamp.',
    );
  }
  throw new Error(apiErrText(data, res.statusText || 'Ошибка загрузки результатов'));
}

function publicSurveyResultsRequestHeaders(accessLink: string, surveyId?: number | null, withJson = false): HeadersInit {
  const h: Record<string, string> = {
    ...(publicResultsAccessHeaders(accessLink) as Record<string, string>),
    ...(surveyId != null && Number.isFinite(surveyId)
      ? (surveyResultsAccessHeaders(surveyId, accessLink) as Record<string, string>)
      : {}),
  };
  if (withJson) h['Content-Type'] = 'application/json';
  return h;
}

export async function getPublicSurveyResults(
  accessLink: string,
  surveyId?: number | null,
): Promise<ResultsPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/results`, {
    cache: 'no-store',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId),
  });
  const data = await parseJson<ResultsPayload & { error?: string; password_required?: boolean }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function getPublicSurveyAnalyticsFacets(
  accessLink: string,
  surveyId?: number | null,
): Promise<{ facets: Record<string, string[]> }> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/analytics-facets`, {
    cache: 'no-store',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId),
  });
  const data = await parseJson<{ facets?: Record<string, string[]>; error?: string; password_required?: boolean }>(
    res,
  );
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return { facets: data.facets || {} };
}

export async function postPublicUnifiedSurveyDashboard(
  accessLink: string,
  filters: AnalyticsFilter[] = [],
  surveyId?: number | null,
): Promise<import('../types').UnifiedSurveyDashboardPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/unified-dashboard`, {
    method: 'POST',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify({ filters }),
  });
  const data = await parseJson<
    import('../types').UnifiedSurveyDashboardPayload & { error?: string; password_required?: boolean }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function postPublicSurveyResultsFilter(
  accessLink: string,
  filters: AnalyticsFilter[],
  surveyId?: number | null,
): Promise<ResultsPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/results-filter`, {
    method: 'POST',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify({ filters }),
  });
  const data = await parseJson<ResultsPayload & { error?: string; password_required?: boolean }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function getPublicSurveyExportRows(
  accessLink: string,
  surveyId?: number | null,
): Promise<SurveyExportRowsPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/export-rows`, {
    cache: 'no-store',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId),
  });
  const data = await parseJson<SurveyExportRowsPayload & { error?: string; password_required?: boolean }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export type AiPedagogyOrganizerFeedback = {
  text?: string;
  draft_source?: string;
  llm_provider?: string | null;
  updated_at?: string;
  emailed_at?: string | null;
  emailed_to?: string | null;
};

export async function postAiPedagogyFeedbackGenerate(
  accessLink: string,
  responseId: number,
  surveyId?: number | null,
): Promise<{
  ok: boolean;
  draft: string;
  draft_source: string;
  llm_provider?: string | null;
  hint?: string | null;
  smtp_configured?: boolean;
  criteria?: { id: string; name: string; productTitle: string; checklist: string[] } | null;
}> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/ai-pedagogy-feedback-generate`, {
    method: 'POST',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify({ response_id: responseId }),
  });
  const data = await parseJson<{
    ok?: boolean;
    draft?: string;
    draft_source?: string;
    llm_provider?: string | null;
    hint?: string | null;
    smtp_configured?: boolean;
    criteria?: { id: string; name: string; productTitle: string; checklist: string[] } | null;
    error?: string;
    message?: string;
    password_required?: boolean;
  }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return {
    ok: true,
    draft: String(data.draft || ''),
    draft_source: String(data.draft_source || 'template'),
    llm_provider: data.llm_provider ?? null,
    hint: data.hint ?? null,
    smtp_configured: Boolean(data.smtp_configured),
    criteria: data.criteria ?? null,
  };
}

export async function putAiPedagogyFeedback(
  accessLink: string,
  body: {
    response_id: number;
    feedback_text: string;
    draft_source?: string;
    llm_provider?: string | null;
  },
  surveyId?: number | null,
): Promise<{ ok: boolean; organizer_feedback: AiPedagogyOrganizerFeedback; smtp_configured?: boolean }> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/ai-pedagogy-feedback`, {
    method: 'PUT',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    ok?: boolean;
    organizer_feedback?: AiPedagogyOrganizerFeedback;
    smtp_configured?: boolean;
    error?: string;
    message?: string;
    password_required?: boolean;
  }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return {
    ok: true,
    organizer_feedback: data.organizer_feedback || { text: body.feedback_text },
    smtp_configured: Boolean(data.smtp_configured),
  };
}

export async function postAiPedagogyFeedbackSend(
  accessLink: string,
  body: { response_id: number; feedback_text?: string; to_email?: string; subject?: string },
  surveyId?: number | null,
): Promise<{
  ok: boolean;
  to: string;
  emailed_at: string;
  organizer_feedback: AiPedagogyOrganizerFeedback;
}> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/ai-pedagogy-feedback-send`, {
    method: 'POST',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    ok?: boolean;
    to?: string;
    emailed_at?: string;
    organizer_feedback?: AiPedagogyOrganizerFeedback;
    error?: string;
    message?: string;
    password_required?: boolean;
  }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return {
    ok: true,
    to: String(data.to || ''),
    emailed_at: String(data.emailed_at || ''),
    organizer_feedback: data.organizer_feedback || {},
  };
}

/** Presigned download for a product file attached to an ai-pedagogy-products response. */

export async function fetchAiPedagogyProductFileUrl(
  accessLink: string,
  key: string,
  filename?: string | null,
  surveyId?: number | null,
): Promise<string> {
  const enc = encodeURIComponent(accessLink);
  const qs = new URLSearchParams({ key });
  if (filename) qs.set('filename', filename);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/ai-pedagogy-file-url?${qs.toString()}`,
    { cache: 'no-store', headers: publicSurveyResultsRequestHeaders(accessLink, surveyId) },
  );
  const data = await parseJson<{ url?: string; error?: string; message?: string; password_required?: boolean }>(
    res,
  );
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  if (!data.url) throw new Error('Сервер не вернул ссылку на скачивание');
  return data.url;
}

export async function getPublicSurveyTextAnswers(
  accessLink: string,
  params: { question_id?: number; q?: string; offset?: number; limit?: number },
  surveyId?: number | null,
): Promise<TextAnswersPage> {
  const qs = textAnswersQueryString(params);
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/text-answers?${qs}`, {
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId),
  });
  const data = await parseJson<TextAnswersPage & { error?: string; password_required?: boolean }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

/** Перевод текста(ов) через LLM (публичный дашборд результатов опроса). */

export async function postPublicSurveyAiTranslate(
  accessLink: string,
  body: { text?: string; texts?: string[]; source_lang?: string; target_lang?: string },
  surveyId?: number | null,
): Promise<AiTranslateResponse> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/ai-translate`, {
    method: 'POST',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify(body),
  });
  const data = await parseJson<AiTranslateResponse & { error?: string; password_required?: boolean }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function postPublicParentFeedbackDashboard(
  accessLink: string,
  surveyId?: number | null,
): Promise<import('../lib/parentFeedback/intake').ParentFeedbackDashboardAggregate> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/parent-feedback-dashboard`, {
    method: 'POST',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify({}),
  });
  const data = await parseJson<
    import('../lib/parentFeedback/intake').ParentFeedbackDashboardAggregate & {
      error?: string;
      password_required?: boolean;
    }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function postPublicParentFeedbackPresentationCopy(
  accessLink: string,
  body: {
    total_responses: number;
    satisfaction_index?: number | null;
    full_satisfaction_pct?: number | null;
    negative_pct?: number | null;
    section_scores?: Array<{ short_title: string; pct: number | null }>;
    risks?: Array<{ kind: string; title: string; pct: number | null }>;
    topics?: Array<{
      display_label: string;
      tone: string;
      section_numbers: number[];
    }>;
    filter_summary?: string;
  },
  surveyId?: number | null,
): Promise<import('../lib/parentFeedback/types').ParentFeedbackPresentationCopyPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/parent-feedback-presentation-copy`, {
    method: 'POST',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify(body),
  });
  const data = await parseJson<
    import('../lib/parentFeedback/types').ParentFeedbackPresentationCopyPayload & {
      error?: string;
      password_required?: boolean;
      message?: string;
    }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function postPublicParentFeedbackTextInsights(
  accessLink: string,
  body: { question_id: number; filters?: import('../types').AnalyticsFilter[] },
  surveyId?: number | null,
): Promise<import('../lib/parentFeedback/types').ParentFeedbackTextInsightPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/parent-feedback-text-insights`, {
    method: 'POST',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify(body),
  });
  const data = await parseJson<
    import('../lib/parentFeedback/types').ParentFeedbackTextInsightPayload & {
      error?: string;
      password_required?: boolean;
      message?: string;
    }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function postPublicTeambuildingFeedbackAnalytics(
  accessLink: string,
  surveyId?: number | null,
): Promise<import('../types').TeambuildingFeedbackAnalyticsPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/feedback-analytics`, {
    method: 'POST',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify({}),
  });
  const data = await parseJson<
    import('../types').TeambuildingFeedbackAnalyticsPayload & {
      error?: string;
      password_required?: boolean;
      message?: string;
    }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function getPublicCorporateTeambuildingDashboard(
  accessLink: string,
  surveyId?: number | null,
): Promise<import('../types').CorporateTeambuildingDashboardPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/teambuilding-dashboard/results`,
    { cache: 'no-store', headers: publicSurveyResultsRequestHeaders(accessLink, surveyId) },
  );
  const data = await parseJson<
    import('../types').CorporateTeambuildingDashboardPayload & {
      error?: string;
      password_required?: boolean;
      message?: string;
    }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export type CorporateTeambuildingLookupViewsPerson = {
  name: string;
  team: number | null;
  table: number | null;
  is_admin: boolean;
  viewed: boolean;
  view_count: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  viewed_at: string[];
};

export type CorporateTeambuildingLookupViewsPayload = {
  survey: {
    id: number;
    title: string;
    access_link: string;
  };
  overview: {
    total: number;
    viewed: number;
    not_viewed: number;
    views_total: number;
  };
  people: CorporateTeambuildingLookupViewsPerson[];
};

export async function getPublicCorporateTeambuildingLookupViews(
  accessLink: string,
  surveyId?: number | null,
): Promise<CorporateTeambuildingLookupViewsPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/teambuilding-dashboard/lookup-views`,
    { cache: 'no-store', headers: publicSurveyResultsRequestHeaders(accessLink, surveyId) },
  );
  const data = await parseJson<
    CorporateTeambuildingLookupViewsPayload & {
      error?: string;
      password_required?: boolean;
      message?: string;
    }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function getPublicForumTopicSlotsDashboard(
  accessLink: string,
  surveyId?: number | null,
): Promise<import('../types').ForumTopicSlotsDashboardPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/forum-topic-slots-dashboard/results`,
    { cache: 'no-store', headers: publicSurveyResultsRequestHeaders(accessLink, surveyId) },
  );
  const data = await parseJson<
    import('../types').ForumTopicSlotsDashboardPayload & {
      error?: string;
      password_required?: boolean;
      message?: string;
    }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function getPublicForumTopicFeedbackDashboard(
  accessLink: string,
  surveyId?: number | null,
): Promise<import('../types').ForumTopicFeedbackDashboardPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/forum-topic-feedback-dashboard/results`,
    { cache: 'no-store', headers: publicSurveyResultsRequestHeaders(accessLink, surveyId) },
  );
  const data = await parseJson<
    import('../types').ForumTopicFeedbackDashboardPayload & {
      error?: string;
      password_required?: boolean;
      message?: string;
    }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function getForumTopicFeedbackDashboard(
  surveyId: number,
): Promise<import('../types').ForumTopicFeedbackDashboardPayload> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/forum-topic-feedback-results`, {
    cache: 'no-store',
    headers: { ...adminHeaders(), ...surveyResultsAccessHeaders(surveyId) },
  });
  const data = await parseJson<
    import('../types').ForumTopicFeedbackDashboardPayload & {
      error?: string;
      password_required?: boolean;
      message?: string;
    }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function postPublicForumTopicFeedbackAnalytics(
  accessLink: string,
  surveyId?: number | null,
): Promise<import('../types').ForumTopicFeedbackAiPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/forum-topic-feedback-dashboard/analytics`, {
    method: 'POST',
    headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify({}),
  });
  const data = await parseJson<
    import('../types').ForumTopicFeedbackAiPayload & {
      error?: string;
      password_required?: boolean;
      message?: string;
    }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function postForumTopicFeedbackAnalyticsAdmin(
  surveyId: number,
): Promise<import('../types').ForumTopicFeedbackAiPayload> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/forum-topic-feedback-analytics`, {
    method: 'POST',
    headers: { ...adminHeaders(), ...surveyResultsAccessHeaders(surveyId), 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await parseJson<
    import('../types').ForumTopicFeedbackAiPayload & {
      error?: string;
      password_required?: boolean;
      message?: string;
    }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function postForumTopicFeedbackAnalytics(
  accessLink: string,
  surveyId?: number | null,
): Promise<import('../types').ForumTopicFeedbackAiPayload> {
  if (accessLink) return postPublicForumTopicFeedbackAnalytics(accessLink, surveyId);
  if (surveyId != null && Number.isFinite(surveyId)) return postForumTopicFeedbackAnalyticsAdmin(surveyId);
  throw new Error('Нет ссылки опроса');
}

export async function assignCorporateRoommatePair(
  surveyId: number,
  name: string,
  partner: string | null,
  opts?: { allowOtherGender?: boolean },
): Promise<{ ok: boolean; name: string; partner: string | null; mode: string }> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/corporate-results/roommate`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), ...surveyResultsAccessHeaders(surveyId) },
    body: JSON.stringify({
      name,
      partner,
      allowOtherGender: Boolean(opts?.allowOtherGender),
    }),
  });
  const data = await parseJson<{
    ok?: boolean;
    name?: string;
    partner?: string | null;
    mode?: string;
    error?: string;
  }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return {
    ok: Boolean(data.ok),
    name: data.name || name,
    partner: data.partner ?? partner,
    mode: data.mode || '',
  };
}

/** Назначить/снять пару соседей (публичный дашборд с паролем результатов). */

export async function assignPublicCorporateRoommatePair(
  accessLink: string,
  name: string,
  partner: string | null,
  surveyId?: number | null,
  opts?: { allowOtherGender?: boolean },
): Promise<{ ok: boolean; name: string; partner: string | null; mode: string }> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/teambuilding-dashboard/roommate`,
    {
      method: 'PATCH',
      headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
      body: JSON.stringify({
        name,
        partner,
        allowOtherGender: Boolean(opts?.allowOtherGender),
      }),
    },
  );
  const data = await parseJson<{
    ok?: boolean;
    name?: string;
    partner?: string | null;
    mode?: string;
    error?: string;
    password_required?: boolean;
  }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return {
    ok: Boolean(data.ok),
    name: data.name || name,
    partner: data.partner ?? partner,
    mode: data.mode || '',
  };
}

/** Переместить участника на другой стол/место (admin). */

export async function moveCorporateTableSeat(
  surveyId: number,
  name: string,
  table: number,
  seat?: number,
): Promise<{ ok: boolean; name: string; table: number; seat: number }> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/corporate-results/table-seat`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), ...surveyResultsAccessHeaders(surveyId) },
    body: JSON.stringify({ name, table, ...(seat != null ? { seat } : {}) }),
  });
  const data = await parseJson<{
    ok?: boolean;
    name?: string;
    table?: number;
    seat?: number;
    error?: string;
  }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return {
    ok: Boolean(data.ok),
    name: data.name || name,
    table: data.table ?? table,
    seat: data.seat ?? seat ?? 0,
  };
}

/** Переместить участника на другой стол/место (публичный дашборд с паролем результатов). */

export async function movePublicCorporateTableSeat(
  accessLink: string,
  name: string,
  table: number,
  seat?: number,
  surveyId?: number | null,
): Promise<{ ok: boolean; name: string; table: number; seat: number }> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/teambuilding-dashboard/table-seat`,
    {
      method: 'PATCH',
      headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
      body: JSON.stringify({ name, table, ...(seat != null ? { seat } : {}) }),
    },
  );
  const data = await parseJson<{
    ok?: boolean;
    name?: string;
    table?: number;
    seat?: number;
    error?: string;
    password_required?: boolean;
  }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return {
    ok: Boolean(data.ok),
    name: data.name || name,
    table: data.table ?? table,
    seat: data.seat ?? seat ?? 0,
  };
}

export async function markCorporateMissingDeclined(
  surveyId: number,
  name: string,
): Promise<{ ok: boolean; name: string; response_id?: number }> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/corporate-results/mark-declined`, {
    method: 'POST',
    headers: { ...adminHeaders(), ...surveyResultsAccessHeaders(surveyId) },
    body: JSON.stringify({ name }),
  });
  const data = await parseJson<{
    ok?: boolean;
    name?: string;
    response_id?: number;
    error?: string;
  }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return { ok: Boolean(data.ok), name: data.name || name, response_id: data.response_id };
}

/** Организатор: человек из «Не ответили» → ответ «не едет» (публичный дашборд). */

export async function markPublicCorporateMissingDeclined(
  accessLink: string,
  name: string,
  surveyId?: number | null,
): Promise<{ ok: boolean; name: string; response_id?: number }> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/teambuilding-dashboard/mark-declined`,
    {
      method: 'POST',
      headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
      body: JSON.stringify({ name }),
    },
  );
  const data = await parseJson<{
    ok?: boolean;
    name?: string;
    response_id?: number;
    error?: string;
    password_required?: boolean;
  }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return { ok: Boolean(data.ok), name: data.name || name, response_id: data.response_id };
}

export type CorporateAdminFillMissingPayload = {
  name: string;
  attending?: boolean;
  attend_label?: string;
  first_day_only?: boolean;
  transport?: 'transfer' | 'car';
  transport_label?: string;
  plate?: string;
  car_model?: string;
  roommate_mode?: 'solo' | 'request' | 'confirm';
  roommate_name?: string;
  table?: number;
  seat?: number;
  decline_reason?: string;
};

/** Организатор: inline-заполнение анкеты за участника из «Не ответили» (admin). */

export async function adminFillCorporateMissing(
  surveyId: number,
  payload: CorporateAdminFillMissingPayload,
): Promise<{ ok: boolean; name: string; response_id?: number }> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/corporate-results/fill-missing`, {
    method: 'POST',
    headers: { ...adminHeaders(), ...surveyResultsAccessHeaders(surveyId) },
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{
    ok?: boolean;
    name?: string;
    response_id?: number;
    error?: string;
  }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return { ok: Boolean(data.ok), name: data.name || payload.name, response_id: data.response_id };
}

/** Орganизатор: inline-заполнение (публичный дашборд). */

export async function adminFillPublicCorporateMissing(
  accessLink: string,
  payload: CorporateAdminFillMissingPayload,
  surveyId?: number | null,
): Promise<{ ok: boolean; name: string; response_id?: number }> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/teambuilding-dashboard/fill-missing`,
    {
      method: 'POST',
      headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
      body: JSON.stringify(payload),
    },
  );
  const data = await parseJson<{
    ok?: boolean;
    name?: string;
    response_id?: number;
    error?: string;
    password_required?: boolean;
  }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return { ok: Boolean(data.ok), name: data.name || payload.name, response_id: data.response_id };
}

export async function fetchCorporateRoomingList(
  surveyId: number,
): Promise<import('../types').CorporateRoomingListPayload> {
  const res = await apiFetch(
    `${API_BASE}/api/surveys/${surveyId}/corporate-results/rooming-list`,
    { headers: { ...adminHeaders(), ...surveyResultsAccessHeaders(surveyId) } },
  );
  const data = await parseJson<import('../types').CorporateRoomingListPayload & { error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function fetchPublicCorporateRoomingList(
  accessLink: string,
  surveyId?: number | null,
): Promise<import('../types').CorporateRoomingListPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/teambuilding-dashboard/rooming-list`,
    { headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true) },
  );
  const data = await parseJson<
    import('../types').CorporateRoomingListPayload & { error?: string; password_required?: boolean }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

export async function saveCorporateRoomingList(
  surveyId: number,
  assignments: Record<string, string[]>,
): Promise<import('../types').CorporateRoomingListPayload> {
  const res = await apiFetch(
    `${API_BASE}/api/surveys/${surveyId}/corporate-results/rooming-list`,
    {
      method: 'PUT',
      headers: { ...adminHeaders(), ...surveyResultsAccessHeaders(surveyId) },
      body: JSON.stringify({ assignments }),
    },
  );
  const data = await parseJson<
    import('../types').CorporateRoomingListPayload & { ok?: boolean; error?: string }
  >(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function savePublicCorporateRoomingList(
  accessLink: string,
  assignments: Record<string, string[]>,
  surveyId?: number | null,
): Promise<import('../types').CorporateRoomingListPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/teambuilding-dashboard/rooming-list`,
    {
      method: 'PUT',
      headers: publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
      body: JSON.stringify({ assignments }),
    },
  );
  const data = await parseJson<
    import('../types').CorporateRoomingListPayload & { ok?: boolean; error?: string; password_required?: boolean }
  >(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  return data;
}

async function downloadCorporateRoomingExportUrl(
  url: string,
  headers: HeadersInit,
  format: 'xlsm' | 'xlsb',
): Promise<void> {
  const res = await apiFetch(`${url}?format=${format}`, { headers });
  if (!res.ok) {
    const data = (await parseJson<{ error?: string; password_required?: boolean }>(res).catch(
      () => ({ error: res.statusText }),
    )) as { error?: string; password_required?: boolean };
    if (data.password_required) throw new Error('results_password_required');
    throw new Error(data.error || res.statusText);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ROOMING LIST 17-19.08.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadCorporateRoomingListExport(
  surveyId: number,
  format: 'xlsm' | 'xlsb' = 'xlsm',
): Promise<void> {
  await downloadCorporateRoomingExportUrl(
    `${API_BASE}/api/surveys/${surveyId}/corporate-results/rooming-list-export`,
    { ...adminHeaders(), ...surveyResultsAccessHeaders(surveyId) },
    format,
  );
}

export async function downloadPublicCorporateRoomingListExport(
  accessLink: string,
  format: 'xlsm' | 'xlsb' = 'xlsm',
  surveyId?: number | null,
): Promise<void> {
  const enc = encodeURIComponent(accessLink);
  await downloadCorporateRoomingExportUrl(
    `${API_BASE}/api/public/surveys/${enc}/teambuilding-dashboard/rooming-list-export`,
    publicSurveyResultsRequestHeaders(accessLink, surveyId, true),
    format,
  );
}

export async function fetchCorporateTeambuildingSignedDownloadUrl(
  accessLink: string,
  key: string,
  surveyId?: number | null,
  filename?: string | null,
): Promise<string> {
  const enc = encodeURIComponent(accessLink);
  const qs = new URLSearchParams({ key });
  if (filename) qs.set('filename', filename);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/teambuilding-dashboard/signed-url?${qs.toString()}`,
    { cache: 'no-store', headers: publicSurveyResultsRequestHeaders(accessLink, surveyId) },
  );
  const data = await parseJson<{ url?: string; error?: string; message?: string; password_required?: boolean }>(res);
  if (!res.ok) throwPublicSurveyResultsApiError(res, data);
  if (!data.url) throw new Error('Сервер не вернул ссылку на скачивание');
  return data.url;
}

export async function fetchCorporateTeambuildingSignedDownloadUrlBySurveyId(
  surveyId: number,
  key: string,
  filename?: string | null,
): Promise<string> {
  const qs = new URLSearchParams({ key });
  if (filename) qs.set('filename', filename);
  const res = await apiFetch(
    `${API_BASE}/api/surveys/${surveyId}/corporate-results/signed-url?${qs.toString()}`,
    { cache: 'no-store', headers: { ...adminHeaders(), ...surveyResultsAccessHeaders(surveyId) } },
  );
  const data = await parseJson<{ url?: string; error?: string; message?: string; password_required?: boolean }>(res);
  if (!res.ok) {
    if (data.password_required || data.error === 'results_password_required') {
      throw new Error('results_password_required');
    }
    throw new Error(apiErrText(data, res.statusText));
  }
  if (!data.url) throw new Error('Сервер не вернул ссылку на скачивание');
  return data.url;
}

export async function getPublicCorporateAccessLinkBySurveyId(
  surveyId: number,
): Promise<{ access_link: string; survey_id: number }> {
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/by-id/${surveyId}/corporate-access-link`,
    { cache: 'no-store' },
  );
  const data = await parseJson<{ access_link?: string; survey_id?: number; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  const accessLink = String(data.access_link || '').trim();
  if (!accessLink) throw new Error('Not found');
  return { access_link: accessLink, survey_id: data.survey_id ?? surveyId };
}

function throwPublicMoEngagementApiError(
  res: Response,
  data: {
    error?: string;
    message?: string;
    code?: string;
    deploy_stamp?: string;
    password_required?: boolean;
  },
): never {
  const err = (data.error || '').trim().toLowerCase();
  if (res.status === 400) {
    throw new Error(
      moEngagementClientErrorMessage(
        data,
        'Некорректный запрос к дашборду вовлечённости. Обновите страницу (F5) и повторите.',
      ),
    );
  }
  if (res.status === 404) {
    throw new Error(
      apiErrText(
        data,
        'Опрос не найден или ещё не опубликован. Проверьте ссылку access_link и статус опроса (published/closed).',
      ),
    );
  }
  if (err === 'results_password_required' || data.password_required) {
    throw new Error('results_password_required');
  }
  if (res.status === 401 || (res.status === 403 && err === 'forbidden')) {
    throw new Error(
      'Публичный дашборд недоступен: на сервере, вероятно, не развёрнута свежая Cloud Function (нужны маршруты /api/public/surveys/…/engagement-dashboard). Администратору: ./scripts/deploy-functions.sh и новая версия функции; проверка GET /api/ping → deploy_stamp.',
    );
  }
  throw new Error(apiErrText(data, res.statusText || 'Ошибка загрузки дашборда'));
}

function publicMoEngagementRequestHeaders(accessLink: string, surveyId?: number | null, withJson = false): HeadersInit {
  const h: Record<string, string> = {
    ...(publicResultsAccessHeaders(accessLink) as Record<string, string>),
    ...(surveyId != null && Number.isFinite(surveyId)
      ? (surveyResultsAccessHeaders(surveyId, accessLink) as Record<string, string>)
      : {}),
  };
  if (withJson) h['Content-Type'] = 'application/json';
  return h;
}

export async function getPublicMoEngagementResults(
  accessLink: string,
  surveyId?: number | null,
): Promise<ResultsPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/engagement-dashboard/results`,
    { cache: 'no-store', headers: publicMoEngagementRequestHeaders(accessLink, surveyId) },
  );
  const data = await parseJson<ResultsPayload & { error?: string; message?: string; deploy_stamp?: string }>(res);
  if (!res.ok) throwPublicMoEngagementApiError(res, data);
  return data;
}

export async function postPublicMoEngagementResultsFilter(
  accessLink: string,
  filters: AnalyticsFilter[],
  surveyId?: number | null,
): Promise<ResultsPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/engagement-dashboard/results-filter`, {
    method: 'POST',
    headers: publicMoEngagementRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify({ filters }),
  });
  const data = await parseJson<ResultsPayload & { error?: string; message?: string; deploy_stamp?: string }>(res);
  if (!res.ok) throwPublicMoEngagementApiError(res, data);
  return data;
}

export async function getPublicMoEngagementExportRows(
  accessLink: string,
  surveyId?: number | null,
): Promise<SurveyExportRowsPayload> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(
    `${API_BASE}/api/public/surveys/${enc}/engagement-dashboard/export-rows`,
    { cache: 'no-store', headers: publicMoEngagementRequestHeaders(accessLink, surveyId) },
  );
  const data = await parseJson<SurveyExportRowsPayload & { error?: string; message?: string; deploy_stamp?: string }>(
    res,
  );
  if (!res.ok) throwPublicMoEngagementApiError(res, data);
  return data;
}

/** ИИ-выводы по каждому из 12 разделов дашборда вовлечённости (один batch-запрос). */

export async function postPublicMoEngagementSectionInsights(
  accessLink: string,
  payload: import('../types').MoEngagementSectionInsightsRequest,
  surveyId?: number | null,
): Promise<import('../types').MoEngagementSectionInsightsResponse> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/engagement-dashboard/section-insights`, {
    method: 'POST',
    headers: publicMoEngagementRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<
    import('../types').MoEngagementSectionInsightsResponse & {
      error?: string;
      message?: string;
      password_required?: boolean;
    }
  >(res);
  if (!res.ok) throwPublicMoEngagementApiError(res, data);
  return data;
}

export type AiTranslateResponse = {
  translation?: string;
  translations?: string[];
  source?: string;
  error?: string;
  message?: string;
};

/** Перевод текста(ов) на русский через LLM (публичный дашборд вовлечённости). */

export async function postPublicMoEngagementAiTranslate(
  accessLink: string,
  body: { text?: string; texts?: string[]; source_lang?: string; target_lang?: string },
  surveyId?: number | null,
): Promise<AiTranslateResponse> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/engagement-dashboard/ai-translate`, {
    method: 'POST',
    headers: publicMoEngagementRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify(body),
  });
  const data = await parseJson<AiTranslateResponse>(res);
  if (!res.ok) throwPublicMoEngagementApiError(res, data);
  return data;
}

/** Перевод текста(ов) на русский (админ, X-Api-Key). */

export async function postAiTranslate(
  surveyId: number,
  body: { text?: string; texts?: string[]; source_lang?: string; target_lang?: string },
): Promise<AiTranslateResponse> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/ai-translate`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<AiTranslateResponse>(res);
  if (!res.ok) throwApiResponseError(res, data, 'POST /api/surveys/:id/ai-translate');
  return data;
}

/** Админский вариант batch-выводов по разделам (нужен X-Api-Key). */

export async function postMoEngagementSectionInsights(
  surveyId: number,
  payload: import('../types').MoEngagementSectionInsightsRequest,
): Promise<import('../types').MoEngagementSectionInsightsResponse> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/mo-engagement-section-insights`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<
    import('../types').MoEngagementSectionInsightsResponse & { error?: string; message?: string }
  >(res);
  if (!res.ok) throwApiResponseError(res, data, 'POST /api/surveys/:id/mo-engagement-section-insights');
  return data;
}

/** Общий ИИ-вывод по дашборду вовлечённости (публичный API). */

export async function postPublicMoEngagementOverallInsight(
  accessLink: string,
  payload: import('../types').MoEngagementOverallInsightRequest,
  surveyId?: number | null,
): Promise<import('../types').MoEngagementOverallInsightResponse> {
  const enc = encodeURIComponent(accessLink);
  const res = await apiFetch(`${API_BASE}/api/public/surveys/${enc}/engagement-dashboard/overall-insight`, {
    method: 'POST',
    headers: publicMoEngagementRequestHeaders(accessLink, surveyId, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<
    import('../types').MoEngagementOverallInsightResponse & {
      error?: string;
      message?: string;
      password_required?: boolean;
    }
  >(res);
  if (!res.ok) throwPublicMoEngagementApiError(res, data);
  return data;
}

/** Общий ИИ-вывод по дашборду вовлечённости (админ, X-Api-Key). */

export async function postMoEngagementOverallInsight(
  surveyId: number,
  payload: import('../types').MoEngagementOverallInsightRequest,
): Promise<import('../types').MoEngagementOverallInsightResponse> {
  const res = await apiFetch(`${API_BASE}/api/surveys/${surveyId}/mo-engagement-overall-insight`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<
    import('../types').MoEngagementOverallInsightResponse & { error?: string; message?: string }
  >(res);
  if (!res.ok) throwApiResponseError(res, data, 'POST /api/surveys/:id/mo-engagement-overall-insight');
  return data;
}

export function directorSurveyUrl(directorToken: string): string {
  const enc = encodeURIComponent(directorToken);
  return `${clientAppBase()}/director/${enc}`;
}

/** Сводка для руководителя: список уроков → отдельные диаграммы по каждому уроку (феноменальные опросы). */

export function directorSurveyLessonsUrl(directorToken: string): string {
  const enc = encodeURIComponent(directorToken);
  return `${clientAppBase()}/director/${enc}/lessons`;
}
