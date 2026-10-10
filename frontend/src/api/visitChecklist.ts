import { jdPreviewHeaders } from '../lib/jobDescriptions/preview';

import { API_BASE, apiFetch, adminHeaders, parseJson, apiErrText, clientAppBase } from './http';

export type LessonVisitProjectRow = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  form_token: string;
  director_share_token?: string;
  response_count?: number;
  la_director_token?: string;
};

export type LessonVisitDraftSave = import('../lib/lessonVisitChecklist/types').LessonVisitDraft;

export async function listLessonVisitProjects(): Promise<LessonVisitProjectRow[]> {
  const res = await apiFetch(`${API_BASE}/api/lesson-visit-projects`, { headers: adminHeaders() });
  const data = await parseJson<{ projects?: LessonVisitProjectRow[]; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return data.projects ?? [];
}

export async function postLessonVisitProject(body: {
  title?: string;
  draft?: LessonVisitDraftSave;
}): Promise<{ project: LessonVisitProjectRow; draft: LessonVisitDraftSave }> {
  const res = await apiFetch(`${API_BASE}/api/lesson-visit-projects`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    project?: LessonVisitProjectRow;
    draft?: LessonVisitDraftSave;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.project || !data.draft) throw new Error(apiErrText(data, res.statusText));
  return { project: data.project, draft: data.draft };
}

export async function getLessonVisitProject(
  projectId: number,
): Promise<{
  project: LessonVisitProjectRow;
  draft: LessonVisitDraftSave;
  /** ID учителя анкеты → подразделения из справочника сотрудников (пусто = не определено). */
  staffUnits: Record<string, string[]>;
  /** Сервер открыл этому пользователю экран «Сводка для директора» (по его сессии). */
  directorSummary: boolean;
  /** Номер учётной записи самого пользователя в Пульсе (для обращения за доступом). */
  viewerId: number | null;
}> {
  const res = await apiFetch(`${API_BASE}/api/lesson-visit-projects/${projectId}`, { headers: adminHeaders() });
  const data = await parseJson<{
    project?: LessonVisitProjectRow;
    draft?: LessonVisitDraftSave;
    staff_units?: Record<string, string[]>;
    directorSummary?: boolean;
    viewerId?: number | null;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.project || !data.draft) throw new Error(apiErrText(data, res.statusText));
  return {
    project: data.project,
    draft: data.draft,
    staffUnits: data.staff_units || {},
    directorSummary: data.directorSummary === true,
    viewerId: typeof data.viewerId === 'number' ? data.viewerId : null,
  };
}

export async function putLessonVisitProject(
  projectId: number,
  body: { title?: string; draft: LessonVisitDraftSave },
): Promise<{ project: LessonVisitProjectRow; draft: LessonVisitDraftSave }> {
  const res = await apiFetch(`${API_BASE}/api/lesson-visit-projects/${projectId}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    project?: LessonVisitProjectRow;
    draft?: LessonVisitDraftSave;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.project || !data.draft) throw new Error(apiErrText(data, res.statusText));
  return { project: data.project, draft: data.draft };
}

/** Узкая запись: меняет только список «новых учителей» (ID справочника), остальной черновик не трогает. */
export async function saveNewTeacherIds(projectId: number, newTeacherIds: string[]): Promise<string[]> {
  const res = await apiFetch(`${API_BASE}/api/lesson-visit-projects/${projectId}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ patch: { newTeacherIds } }),
  });
  const data = await parseJson<{ ok?: boolean; newTeacherIds?: string[]; error?: string; message?: string }>(res);
  if (res.status === 404 || res.status === 403)
    throw new Error('Список новых учителей сохраняет только директор.');
  if (!res.ok || !Array.isArray(data.newTeacherIds)) throw new Error(apiErrText(data, res.statusText));
  return data.newTeacherIds;
}

export async function deleteLessonVisitProject(projectId: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/lesson-visit-projects/${projectId}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
}

export async function listLessonVisitResponses(projectId: number): Promise<
  import('../lib/lessonVisitChecklist/types').LessonVisitResponseRow[]
> {
  const res = await apiFetch(`${API_BASE}/api/lesson-visit-projects/${projectId}/responses`, {
    headers: adminHeaders(),
  });
  const data = await parseJson<{
    responses?: import('../lib/lessonVisitChecklist/types').LessonVisitResponseRow[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return data.responses ?? [];
}

export async function deleteLessonVisitResponse(projectId: number, responseId: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/lesson-visit-projects/${projectId}/responses/${responseId}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
}

export type VisitChecklistDashChartRow = {
  name: string;
  visits: number;
  score_ratio: number;
  score_pct: number;
  traffic: 'green' | 'yellow' | 'red' | string;
  code?: string;
};

export type VisitChecklistAiConclusions = {
  summary?: string;
  strengths?: string[];
  growth?: string[];
  recommendations?: string[];
};

export type VisitChecklistTeacherAiReport = {
  title?: string;
  basis?: string;
  summary?: string;
  strengths?: Array<{ title?: string; evidence?: string; meaning?: string }>;
  patterns?: string[];
  growthAreas?: Array<{
    title?: string;
    evidence?: string;
    whyItMatters?: string;
    recommendation?: string;
    kind?: string;
  }>;
  nextLessonActions?: string[];
  dynamics?: string;
  reflectionQuestions?: string[];
  nextObservationFocus?: string[];
  conclusion?: string;
  limitations?: string;
};

export type VisitChecklistSchoolAiReport = {
  scope?: { period?: string; visits?: number; teachers?: number; coverage?: string };
  executiveSummary?: string;
  coverageAssessment?: string;
  strengths?: Array<{ title?: string; evidence?: string; meaning?: string }>;
  growthAreas?: Array<{ title?: string; evidence?: string; meaning?: string; kind?: string }>;
  trends?: string[];
  departments?: Array<{ name?: string; strengths?: string; requests?: string; exchange?: string }>;
  methodicalPriorities?: Array<{ band?: string; title?: string; evidence?: string }>;
  recommendations?: Array<{ action?: string; dataReason?: string }>;
  nextCycleQuestions?: string[];
  dataQuality?: string[];
  limitations?: string[];
  observerWarning?: string;
};

export type VisitChecklistSchoolAi = {
  narrative?: string;
  conclusions?: VisitChecklistAiConclusions | null;
  report?: VisitChecklistSchoolAiReport | null;
  source?: string | null;
  fingerprint?: string | null;
  payload_hash?: string | null;
  prompt_version?: string | null;
  observer_warning?: string | null;
  updated_at?: string | null;
  error?: string | null;
  insufficient?: boolean | null;
};

export type VisitChecklistDashKpis = {
  response_count: number;
  observe_count?: number;
  self_count?: number;
  teacher_count: number;
  agreed_count: number;
  published_count: number;
  department_count: number;
  avg_score_ratio: number;
  school_ai?: VisitChecklistSchoolAi | null;
  sections?: { code: string; title: string; avgEarned: number; max: number; fillRatio: number }[];
  charts?: {
    by_department?: VisitChecklistDashChartRow[];
    by_teacher?: VisitChecklistDashChartRow[];
    by_subject?: VisitChecklistDashChartRow[];
    by_class?: VisitChecklistDashChartRow[];
    by_format?: VisitChecklistDashChartRow[];
    by_visitor?: VisitChecklistDashChartRow[];
    by_ordinal?: VisitChecklistDashChartRow[];
    trend?: VisitChecklistDashChartRow[];
    sections?: VisitChecklistDashChartRow[];
  };
};

export type VisitChecklistDashTeacherListItem = {
  teacher_key: string;
  teacher_label: string;
  department: string;
  visit_count: number;
  score_ratio: number;
  last_visit: { date?: string; class_name?: string; subject?: string; visitor?: string; format?: string } | null;
  photo_url?: string | null;
  photo_thumb_url?: string | null;
  status: 'draft' | 'agreed' | string;
  agreed_at?: string | null;
  published_at?: string | null;
  has_narrative?: boolean;
  sections?: { code: string; title: string; fillRatio: number }[];
};

export type VisitChecklistDashCard = {
  teacher_key: string;
  teacher_label: string;
  department?: string | null;
  visit_count: number;
  photo_url?: string | null;
  photo_thumb_url?: string | null;
  stats: {
    visit_count?: number;
    score_ratio?: number;
    last_visit?: VisitChecklistDashTeacherListItem['last_visit'];
    sections?: { code: string; title: string; earned: number; max: number; fillRatio: number }[];
    sparkline?: { date: string; score: number }[];
    subjects?: string[];
    classes?: string[];
    visits?: {
      id: number;
      date: string;
      visitor: string;
      class_name: string;
      subject: string;
      format: string;
      earned: number;
      max: number;
      summary: string;
      recommendations: string;
      ordinal?: string;
      sections?: Array<{
        code?: string;
        title?: string;
        earned?: number;
        max?: number;
        fillRatio?: number;
        marks?: Array<{ code?: string; pick?: string; pts?: number; max?: number; indicator?: string }>;
        unanswered_codes?: string[];
      }>;
    }[];
  };
  narrative: string;
  narrative_source?: string | null;
  ai_conclusions?: VisitChecklistAiConclusions | null;
  ai_report?: VisitChecklistTeacherAiReport | null;
  ai_payload_hash?: string | null;
  ai_prompt_version?: string | null;
  status: 'draft' | 'agreed' | string;
  agreed_at?: string | null;
  published_at?: string | null;
  published?: boolean;
  staff_email?: string | null;
};

export type VisitChecklistDashPayload = {
  project: { id: number; title: string; updated_at?: string } | null;
  kpis: VisitChecklistDashKpis;
  teachers: VisitChecklistDashTeacherListItem[];
  updated_at?: string | null;
  message?: string;
};

export async function getVisitChecklistDashboard(projectId?: number): Promise<VisitChecklistDashPayload> {
  const q = projectId && Number.isFinite(projectId) ? `?project=${projectId}` : '';
  const res = await apiFetch(`${API_BASE}/api/visit-checklist-dashboard${q}`, { headers: adminHeaders() });
  const data = await parseJson<VisitChecklistDashPayload & { error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return data;
}

export async function getVisitChecklistDashboardTeacher(
  teacherKey: string,
  projectId?: number,
): Promise<{ project_id: number; card: VisitChecklistDashCard }> {
  const q = projectId && Number.isFinite(projectId) ? `?project=${projectId}` : '';
  const res = await apiFetch(
    `${API_BASE}/api/visit-checklist-dashboard/teachers/${encodeURIComponent(teacherKey)}${q}`,
    { headers: adminHeaders() },
  );
  const data = await parseJson<{ project_id?: number; card?: VisitChecklistDashCard; error?: string; message?: string }>(
    res,
  );
  if (!res.ok || !data.card) throw new Error(apiErrText(data, res.statusText));
  return { project_id: data.project_id ?? projectId ?? 0, card: data.card };
}

export async function postVisitChecklistDashboardTeacherAi(
  teacherKey: string,
  projectId?: number,
  opts?: { force?: boolean },
): Promise<{
  project_id: number;
  card: VisitChecklistDashCard;
  narrative: string;
  conclusions: VisitChecklistAiConclusions | null;
  report?: VisitChecklistTeacherAiReport | null;
  source: string;
  error: string | null;
  insufficient?: boolean;
}> {
  const params = new URLSearchParams();
  if (projectId && Number.isFinite(projectId)) params.set('project', String(projectId));
  if (opts?.force) params.set('force', '1');
  const q = params.toString() ? `?${params}` : '';
  const res = await apiFetch(
    `${API_BASE}/api/visit-checklist-dashboard/teachers/${encodeURIComponent(teacherKey)}/ai${q}`,
    {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: Boolean(opts?.force) }),
    },
  );
  const data = await parseJson<{
    project_id?: number;
    card?: VisitChecklistDashCard;
    narrative?: string;
    conclusions?: VisitChecklistAiConclusions | null;
    report?: VisitChecklistTeacherAiReport | null;
    source?: string;
    error?: string;
    insufficient?: boolean;
    message?: string;
  }>(res);
  if (!res.ok || !data.card) throw new Error(apiErrText(data, res.statusText));
  return {
    project_id: data.project_id ?? projectId ?? 0,
    card: data.card,
    narrative: data.narrative || data.card.narrative || '',
    conclusions: data.conclusions ?? data.card.ai_conclusions ?? null,
    report: data.report ?? data.card.ai_report ?? null,
    source: data.source || '',
    error: data.error || null,
    insufficient: Boolean(data.insufficient),
  };
}

export async function postVisitChecklistDashboardSchoolAi(
  projectId?: number,
  opts?: { force?: boolean; filters?: { status?: string } },
): Promise<{
  project_id: number;
  school_ai: VisitChecklistSchoolAi | null;
  source: string;
  error: string | null;
  insufficient?: boolean;
}> {
  const params = new URLSearchParams();
  if (projectId && Number.isFinite(projectId)) params.set('project', String(projectId));
  if (opts?.force) params.set('force', '1');
  const q = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`${API_BASE}/api/visit-checklist-dashboard/school-ai${q}`, {
    method: 'POST',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: Boolean(opts?.force), filters: opts?.filters || {} }),
  });
  const data = await parseJson<{
    project_id?: number;
    school_ai?: VisitChecklistSchoolAi | null;
    source?: string;
    error?: string;
    insufficient?: boolean;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return {
    project_id: data.project_id ?? projectId ?? 0,
    school_ai: data.school_ai || null,
    source: data.source || '',
    error: data.error || null,
    insufficient: Boolean(data.insufficient),
  };
}

export async function patchVisitChecklistDashboardTeacher(
  teacherKey: string,
  body: {
    narrative?: string;
    narrative_source?: string;
    status?: 'draft' | 'agreed';
    agree?: boolean;
    publish?: boolean;
    ai_conclusions?: VisitChecklistAiConclusions | null;
  },
  projectId?: number,
): Promise<{ project_id: number; card: VisitChecklistDashCard }> {
  const q = projectId && Number.isFinite(projectId) ? `?project=${projectId}` : '';
  const res = await apiFetch(
    `${API_BASE}/api/visit-checklist-dashboard/teachers/${encodeURIComponent(teacherKey)}${q}`,
    { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(body) },
  );
  const data = await parseJson<{ project_id?: number; card?: VisitChecklistDashCard; error?: string; message?: string }>(
    res,
  );
  if (!res.ok || !data.card) throw new Error(apiErrText(data, res.statusText));
  return { project_id: data.project_id ?? projectId ?? 0, card: data.card };
}

export type VisitChecklistPrepareProgress = {
  ready: boolean;
  phase: 'snapshot' | 'cards' | 'school' | 'done' | string;
  done: number;
  total: number;
  pending: number;
  parallel: number;
  eta_sec: number;
  message: string;
  dashboard?: VisitChecklistDashPayload;
};

export async function postVisitChecklistDashboardPrepare(
  projectId?: number,
): Promise<VisitChecklistPrepareProgress> {
  const q = projectId && Number.isFinite(projectId) ? `?project=${projectId}` : '';
  const res = await apiFetch(`${API_BASE}/api/visit-checklist-dashboard/prepare${q}`, {
    method: 'POST',
    headers: adminHeaders(),
  });
  const data = await parseJson<VisitChecklistPrepareProgress & { error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return data;
}

export async function postVisitChecklistDashboardRebuild(projectId?: number): Promise<VisitChecklistDashPayload> {
  const q = projectId && Number.isFinite(projectId) ? `?project=${projectId}` : '';
  const res = await apiFetch(`${API_BASE}/api/visit-checklist-dashboard/rebuild${q}`, {
    method: 'POST',
    headers: adminHeaders(),
  });
  const data = await parseJson<VisitChecklistDashPayload & { error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return data;
}

export type VisitChecklistPublishedMine = {
  project_id: number;
  project_title: string;
  teacher_key: string;
  published_at: string;
  card: {
    teacher_label: string;
    department?: string;
    narrative?: string;
    photo_url?: string | null;
    photo_thumb_url?: string | null;
    ai_conclusions?: VisitChecklistAiConclusions | null;
    ai_report?: VisitChecklistTeacherAiReport | null;
    stats?: VisitChecklistDashCard['stats'];
    visits?: VisitChecklistDashCard['stats']['visits'];
    published_at?: string;
  };
};

export async function getVisitChecklistDashboardMe(): Promise<{ cards: VisitChecklistPublishedMine[] }> {
  const res = await apiFetch(`${API_BASE}/api/visit-checklist-dashboard/me`, { headers: adminHeaders() });
  const data = await parseJson<{ cards?: VisitChecklistPublishedMine[]; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return { cards: data.cards ?? [] };
}

export function lessonVisitFormPublicUrl(formToken: string): string {
  return `${clientAppBase()}/view/lesson-visit/${encodeURIComponent(formToken)}`;
}

export function lessonVisitDirectorPublicUrl(shareToken: string): string {
  return `${clientAppBase()}/view/lesson-visit-checklist/${encodeURIComponent(shareToken)}`;
}

export async function getPublicLatestLessonVisitForm(): Promise<{
  form_token: string;
  title: string;
  id: number;
}> {
  const res = await fetch(`${API_BASE}/api/public/lesson-visit-form/latest`);
  const data = await parseJson<{
    form_token?: string;
    title?: string;
    id?: number;
    error?: string;
  }>(res);
  const token = String(data.form_token || '').trim();
  if (!res.ok || !token) {
    throw new Error(data.error || res.statusText);
  }
  return {
    form_token: token,
    title: data.title || '',
    id: Number(data.id) || 0,
  };
}

export async function getPublicLessonVisitForm(formToken: string): Promise<{
  project: { id: number; title: string; updated_at: string };
  checklist: import('../lib/lessonVisitChecklist/types').LessonVisitChecklistConfig;
  directory: import('../lib/lessonVisitChecklist/types').LessonVisitDirectory;
  media?: { photos?: import('../lib/lessonVisitChecklist/types').LessonVisitMediaPhoto[] };
  allow_multiple_responses?: boolean;
}> {
  const enc = encodeURIComponent(formToken);
  const res = await fetch(`${API_BASE}/api/public/lesson-visit-form/${enc}`);
  const data = await parseJson<{
    project?: { id: number; title: string; updated_at: string };
    checklist?: import('../lib/lessonVisitChecklist/types').LessonVisitChecklistConfig;
    directory?: import('../lib/lessonVisitChecklist/types').LessonVisitDirectory;
    media?: { photos?: import('../lib/lessonVisitChecklist/types').LessonVisitMediaPhoto[] };
    allow_multiple_responses?: boolean;
    error?: string;
  }>(res);
  if (!res.ok || !data.project || !data.checklist || !data.directory) {
    throw new Error(data.error || res.statusText);
  }
  return {
    project: data.project,
    checklist: data.checklist,
    directory: data.directory,
    media: data.media,
    allow_multiple_responses: data.allow_multiple_responses,
  };
}

export async function postPublicLessonVisitResponse(
  formToken: string,
  body: { general: Record<string, string>; answers: Record<string, string | string[]> },
): Promise<{ ok: boolean; response: { id: number; created_at: string } }> {
  const enc = encodeURIComponent(formToken);
  const res = await fetch(`${API_BASE}/api/public/lesson-visit-form/${enc}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    ok?: boolean;
    response?: { id: number; created_at: string };
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.response) throw new Error(data.message || data.error || res.statusText);
  return { ok: true, response: data.response };
}

/** Проект «Родительские собрания» на сервере (UUID). */

export type LessonVisitScheduleEditor = {
  staff_id: number;
  email?: string | null;
  full_name: string;
};

export type LessonVisitSchedulePayload = {
  can_edit: boolean;
  can_assign: boolean;
  editors: LessonVisitScheduleEditor[];
  rows: Array<{
    id: string;
    date: string;
    lesson: string;
    class_name: string;
    subject: string;
    department: string;
    teacher: string;
    visitor: string;
    mark: string;
    gid: string;
  }>;
  sheet: { id: string; edit_url: string; open_url: string };
};

export async function cabinetLessonVisitSchedule(): Promise<LessonVisitSchedulePayload> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/lesson-visits`, { headers: jdPreviewHeaders() });
  const data = await parseJson<LessonVisitSchedulePayload & { error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || 'Не удалось загрузить график посещений');
  return {
    can_edit: Boolean(data.can_edit),
    can_assign: Boolean(data.can_assign),
    editors: data.editors || [],
    rows: data.rows || [],
    sheet: data.sheet || { id: '', edit_url: '', open_url: '' },
  };
}

export async function cabinetLessonVisitScheduleNotify(body: {
  kind?: 'visit' | 'task';
  staff_id?: number;
  teacher?: string;
  date?: string;
  lesson?: string;
  class_name?: string;
  subject?: string;
  visitor?: string;
  message?: string;
}): Promise<{ full_name: string }> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/lesson-visits/notify`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ full_name?: string; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось отправить уведомление');
  return { full_name: data.full_name || '' };
}

export type LessonVisitSelfLink = {
  self_response_id: number;
  lesson_response_id: number;
  method: "teacher_date" | "manual";
  revision: number;
  confirmed_by: number;
  confirmed_by_label?: string;
  confirmed_at: string;
};
export async function getLessonVisitSelfLinks(
  projectId: number,
): Promise<LessonVisitSelfLink[]> {
  const res = await apiFetch(
    `${API_BASE}/api/lesson-visit-projects/${projectId}/self-analysis-links`,
    { headers: adminHeaders() },
  );
  const data = await parseJson<{
    links?: LessonVisitSelfLink[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return data.links || [];
}
export async function saveLessonVisitSelfLink(
  projectId: number,
  body:
    | { mode: "automatic" }
    | { self_response_id: number; lesson_response_id: number },
): Promise<LessonVisitSelfLink[]> {
  const res = await apiFetch(
    `${API_BASE}/api/lesson-visit-projects/${projectId}/self-analysis-links`,
    {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await parseJson<{
    links?: LessonVisitSelfLink[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return data.links || [];
}
