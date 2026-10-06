import type { JdMailResult, JdMeResponse, JdNotification, JdQualityIssue, JdRoute, JdRouteProblem, JdStaff, JobDescription, JdSectionKey, JdSections, JdStep, JdTeamMember, JdBroadcastResult } from '../lib/jobDescriptions/types';
import { jdPreviewHeaders } from '../lib/jobDescriptions/preview';

import { API_BASE, apiFetch, adminHeaders, parseJson } from './http';

function throwJd(res: Response, data: { error?: string; message?: string }, fallback: string): never {
  throw new Error(data.message || data.error || fallback || res.statusText);
}

export type JdPreviewStaffRow = {
  id?: number;
  full_name: string;
  email: string | null;
  position?: string;
  department?: string;
  is_manager?: boolean;
  in_jd_staff: boolean;
};

export async function jdPreviewStaffSearch(q: string): Promise<JdPreviewStaffRow[]> {
  const qs = new URLSearchParams({ q });
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/preview-staff?${qs}`, {
    headers: adminHeaders(),
  });
  const data = await parseJson<{
    staff?: JdPreviewStaffRow[];
    directory_only?: Array<{ full_name: string; email: string | null; in_jd_staff: boolean }>;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось загрузить список сотрудников');
  const staff = (data.staff || []).map((row) => ({ ...row, in_jd_staff: true }));
  const extra = (data.directory_only || []).map((row) => ({
    full_name: row.full_name,
    email: row.email,
    in_jd_staff: false,
  }));
  return [...staff, ...extra];
}

export async function jdMe(): Promise<JdMeResponse> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/me`, { headers: jdPreviewHeaders() });
  const data = await parseJson<JdMeResponse & { error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось открыть кабинет должностных инструкций');
  return data;
}

export async function jdList(
  scope: 'mine' | 'inbox' | 'upcoming' | 'team' | 'done' | 'all',
  status?: string,
): Promise<{ items: JobDescription[] }> {
  const qs = new URLSearchParams({ scope });
  if (status) qs.set('status', status);
  const res = await apiFetch(`${API_BASE}/api/job-descriptions?${qs}`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{ items?: JobDescription[]; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось загрузить список');
  return { items: data.items || [] };
}

export async function jdCreateMine(staffId?: number): Promise<{ item: JobDescription; steps: JdStep[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(staffId ? { staff_id: staffId } : {}),
  });
  const data = await parseJson<{ item?: JobDescription; steps?: JdStep[]; error?: string; message?: string }>(res);
  if (!res.ok || !data.item) throwJd(res, data, 'Не удалось создать инструкцию');
  return { item: data.item, steps: data.steps || [] };
}

export async function jdGet(
  id: number,
): Promise<{
  item: JobDescription;
  steps: JdStep[];
  can_edit?: boolean;
  can_submit?: boolean;
  can_approve?: boolean;
  can_return?: boolean;
  can_view_content?: boolean;
}> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/${id}`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{
    item?: JobDescription;
    steps?: JdStep[];
    can_edit?: boolean;
    can_submit?: boolean;
    can_approve?: boolean;
    can_return?: boolean;
    can_view_content?: boolean;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.item) throwJd(res, data, 'Инструкция не найдена');
  return {
    item: { ...data.item, steps: data.steps },
    steps: data.steps || [],
    can_edit: data.can_edit,
    can_submit: data.can_submit,
    can_approve: data.can_approve,
    can_return: data.can_return,
    can_view_content: data.can_view_content,
  };
}

export async function jdSave(
  id: number,
  body: { title?: string; position?: string; department?: string; sections?: JdSections },
): Promise<{ item: JobDescription }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/${id}`, {
    method: 'PUT',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ item?: JobDescription; error?: string; message?: string }>(res);
  if (!res.ok || !data.item) throwJd(res, data, 'Не удалось сохранить');
  return { item: data.item };
}

export async function jdGenerateSection(
  id: number,
  sectionKey: JdSectionKey,
  notes: string,
): Promise<{ item: JobDescription; generated?: { section_key: string; text: string } }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/${id}/generate`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify({ section_key: sectionKey, notes }),
  });
  const data = await parseJson<{
    item?: JobDescription;
    generated?: { section_key: string; text: string };
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.item) throwJd(res, data, 'Не удалось сгенерировать раздел');
  return { item: data.item, generated: data.generated };
}

export async function jdSubmit(id: number): Promise<{ item: JobDescription; steps: JdStep[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/${id}/submit`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: '{}',
  });
  const data = await parseJson<{ item?: JobDescription; steps?: JdStep[]; error?: string; message?: string }>(res);
  if (!res.ok || !data.item) throwJd(res, data, 'Не удалось отправить на согласование');
  return { item: data.item, steps: data.steps || [] };
}

export async function jdApproveAll(): Promise<{ approved: number; failed: number; ids: number[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/approve-all`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: '{}',
  });
  const data = await parseJson<{
    approved?: number;
    failed?: number;
    ids?: number[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось согласовать все документы');
  return { approved: data.approved || 0, failed: data.failed || 0, ids: data.ids || [] };
}

export async function jdApprove(
  id: number,
  body: { comment?: string; sections?: JdSections },
): Promise<{ item: JobDescription; steps: JdStep[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/${id}/approve`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ item?: JobDescription; steps?: JdStep[]; error?: string; message?: string }>(res);
  if (!res.ok || !data.item) throwJd(res, data, 'Не удалось согласовать');
  return { item: data.item, steps: data.steps || [] };
}

export async function jdRoutes(): Promise<{ routes: JdRoute[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/routes`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{ routes?: JdRoute[]; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось загрузить маршруты');
  return { routes: data.routes || [] };
}

export async function jdSaveRoutes(routes: JdRoute[], deleteIds?: number[]): Promise<{ routes: JdRoute[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/routes`, {
    method: 'PUT',
    headers: jdPreviewHeaders(),
    body: JSON.stringify({ routes, delete_ids: deleteIds || [] }),
  });
  const data = await parseJson<{ routes?: JdRoute[]; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось сохранить маршруты');
  return { routes: data.routes || [] };
}

export async function jdResetRoutes(): Promise<{ routes: JdRoute[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/routes/reset`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: '{}',
  });
  const data = await parseJson<{ routes?: JdRoute[]; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось сбросить маршруты');
  return { routes: data.routes || [] };
}

export async function jdStaffReimport(): Promise<{ result?: { staff?: number } }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/staff/reimport`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: '{}',
  });
  const data = await parseJson<{ result?: { staff?: number }; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось обновить справочник');
  return data;
}

export async function jdExportAll(): Promise<{ items: JobDescription[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/export`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{ items?: JobDescription[]; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось выгрузить инструкции');
  return { items: data.items || [] };
}

export async function jdReturn(
  id: number,
  comment: string,
): Promise<{ item: JobDescription; steps: JdStep[]; mail_warnings?: JdMailResult[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/${id}/return`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify({ comment }),
  });
  const data = await parseJson<{ item?: JobDescription; steps?: JdStep[]; mail_warnings?: JdMailResult[]; error?: string; message?: string }>(res);
  if (!res.ok || !data.item) throwJd(res, data, 'Не удалось отправить на доработку');
  return { item: data.item, steps: data.steps || [], mail_warnings: data.mail_warnings };
}

export async function jdCheck(id: number): Promise<{ issues: JdQualityIssue[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/${id}/check`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: '{}',
  });
  const data = await parseJson<{ issues?: JdQualityIssue[]; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось проверить текст');
  return { issues: data.issues || [] };
}

export async function jdTeam(): Promise<{ items: JdTeamMember[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/team`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{ items?: JdTeamMember[]; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось загрузить команду');
  return { items: data.items || [] };
}

export async function jdTeamRemind(body: {
  staff_ids: number[];
  kind: 'jd' | 'survey';
  message?: string;
  survey_url?: string;
}): Promise<{ sent: number; mail_warnings?: JdMailResult[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/team/remind`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    sent?: number;
    mail_warnings?: JdMailResult[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось отправить напоминание');
  return { sent: data.sent || 0, mail_warnings: data.mail_warnings };
}

export async function jdBroadcast(body: {
  subject: string;
  title: string;
  body: string;
  cta_url?: string;
  cta_label?: string;
  scope?: 'all' | 'departments' | 'staff';
  departments?: string[];
  staff_ids?: number[];
}): Promise<JdBroadcastResult> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/broadcast`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<JdBroadcastResult & { error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось отправить рассылку');
  return {
    recipient_count: data.recipient_count || 0,
    sent: data.sent || 0,
    notified: data.notified || 0,
    smtp: Boolean(data.smtp),
    mail_error: data.mail_error,
  };
}

export async function jdGenerateAll(id: number): Promise<{ item: JobDescription; highlights: JdQualityIssue[] }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/${id}/generate-all`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: '{}',
  });
  const data = await parseJson<{ item?: JobDescription; highlights?: JdQualityIssue[]; error?: string; message?: string }>(res);
  if (!res.ok || !data.item) throwJd(res, data, 'Не удалось сгенерировать черновик');
  return { item: data.item, highlights: data.highlights || [] };
}

export async function jdEscalate(body: {
  reason: string;
  wrong_match?: boolean;
  suggested_name?: string;
}): Promise<{ ok: boolean; escalation_id: number }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/escalate`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ ok?: boolean; escalation_id?: number; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось отправить запрос');
  return { ok: Boolean(data.ok), escalation_id: Number(data.escalation_id) };
}

export async function jdNotifications(): Promise<{ items: JdNotification[]; unread: number }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/notifications`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{ items?: JdNotification[]; unread?: number; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось загрузить уведомления');
  return { items: data.items || [], unread: data.unread || 0 };
}

export async function jdNotificationRead(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/notifications/${id}/read`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: '{}',
  });
  if (!res.ok) {
    const data = await parseJson<{ error?: string; message?: string }>(res);
    throwJd(res, data, 'Не удалось отметить уведомление');
  }
}

export async function jdStaffSearch(q: string): Promise<{ items: JdStaff[] }> {
  const qs = new URLSearchParams({ q });
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/staff-search?${qs}`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{ items?: JdStaff[]; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось найти сотрудников');
  return { items: data.items || [] };
}

export async function jdStaffLinkEmail(staffId: number, email: string, escalationId?: number): Promise<{ staff: JdStaff }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/staff/link-email`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify({ staff_id: staffId, email, escalation_id: escalationId }),
  });
  const data = await parseJson<{ staff?: JdStaff; error?: string; message?: string }>(res);
  if (!res.ok || !data.staff) throwJd(res, data, 'Не удалось привязать email');
  return { staff: data.staff };
}

export async function jdStaffSetManager(staffId: number, managerStaffId: number): Promise<{ staff: JdStaff }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/staff/${staffId}/manager`, {
    method: 'PUT',
    headers: jdPreviewHeaders(),
    body: JSON.stringify({ manager_staff_id: managerStaffId }),
  });
  const data = await parseJson<{ staff?: JdStaff; error?: string; message?: string }>(res);
  if (!res.ok || !data.staff) throwJd(res, data, 'Не удалось назначить руководителя');
  return { staff: data.staff };
}

export async function jdStaffCreate(body: {
  full_name: string;
  position?: string;
  department?: string;
  email?: string;
  note?: string;
  register_user?: boolean;
}): Promise<{
  staff: JdStaff;
  access_link: string;
  token: string;
  user?: { id: number; created: boolean; email: string } | null;
}> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/staff/create`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    staff?: JdStaff;
    access_link?: string;
    token?: string;
    user?: { id: number; created: boolean; email: string } | null;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.staff || !data.access_link) throwJd(res, data, 'Не удалось создать карточку');
  return {
    staff: data.staff,
    access_link: data.access_link,
    token: data.token || '',
    user: data.user ?? null,
  };
}

export async function jdRoutesPrecheck(): Promise<{ problems: JdRouteProblem[]; checked: number }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/routes/precheck`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{ problems?: JdRouteProblem[]; checked?: number; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось проверить маршруты');
  return { problems: data.problems || [], checked: data.checked || 0 };
}

export async function jdAccessClaim(token: string): Promise<{ ok: boolean; staff: JdStaff; token: string }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/access`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify({ token }),
  });
  const data = await parseJson<{ ok?: boolean; staff?: JdStaff; token?: string; error?: string; message?: string }>(res);
  if (!res.ok || !data.staff) throwJd(res, data, 'Ссылка недействительна');
  return { ok: Boolean(data.ok), staff: data.staff, token: data.token || token };
}

export async function jdMatchEmails(): Promise<{ ok: boolean; result?: { matched?: number } }> {
  const res = await apiFetch(`${API_BASE}/api/job-descriptions/staff/match-emails`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: '{}',
  });
  const data = await parseJson<{ ok?: boolean; result?: { matched?: number }; error?: string; message?: string }>(res);
  if (!res.ok) throwJd(res, data, 'Не удалось сопоставить email');
  return { ok: Boolean(data.ok), result: data.result };
}
