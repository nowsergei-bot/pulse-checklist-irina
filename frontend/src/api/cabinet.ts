import { jdPreviewHeaders } from '../lib/jobDescriptions/preview';

import { API_BASE, apiFetch, adminHeaders, parseJson } from './http';
import { AuthUser } from './auth';

export type CabinetDirectoryPerson = {
  staff_id?: number | null;
  full_name: string;
  position: string;
  department?: string | null;
  chair?: string | null;
  email: string | null;
  is_manager: boolean;
  photo_url?: string | null;
  photo_thumb_url?: string | null;
  telegram_nick?: string | null;
  max_nick?: string | null;
};

export type CabinetDirectoryDepartment = {
  name: string;
  count: number;
  people: CabinetDirectoryPerson[];
};

export async function cabinetDirectory(): Promise<{
  departments: CabinetDirectoryDepartment[];
  department_count: number;
  people_count: number;
}> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/directory`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{
    departments?: CabinetDirectoryDepartment[];
    department_count?: number;
    people_count?: number;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(data.message || data.error || 'Не удалось открыть справочник');
  return {
    departments: data.departments || [],
    department_count: data.department_count || 0,
    people_count: data.people_count || 0,
  };
}

export async function patchCabinetProfile(body: {
  cabinet_theme?: 'corporate' | 'blue' | 'green' | 'dark';
  complete_onboarding?: boolean;
  telegram_nick?: string;
  max_nick?: string;
}): Promise<AuthUser> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/profile`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ user?: AuthUser; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || 'Не удалось сохранить настройки');
  if (!data.user) throw new Error('Нет данных профиля');
  return data.user;
}

export async function uploadCabinetPhoto(
  body: {
    image_data_url: string;
    thumb_data_url?: string;
  },
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<AuthUser> {
  const timeoutMs = options?.timeoutMs ?? 25000;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  const onOuterAbort = () => ctrl.abort();
  options?.signal?.addEventListener('abort', onOuterAbort);
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE}/api/cabinet/profile/photo`, {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted) {
      throw new Error('Фото не загрузилось вовремя. Контакты не пропали — нажмите «Сохранить».');
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
    options?.signal?.removeEventListener('abort', onOuterAbort);
  }
  const data = await parseJson<{ user?: AuthUser; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || 'Не удалось загрузить фото');
  if (!data.user) throw new Error('Нет данных профиля');
  return data.user;
}

export async function deleteCabinetPhoto(): Promise<AuthUser> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/profile/photo`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  const data = await parseJson<{ user?: AuthUser; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || 'Не удалось удалить фото');
  if (!data.user) throw new Error('Нет данных профиля');
  return data.user;
}

// ——— Эмоциональный интеллект (киоск) ———

export type PulseSpreadsheetSheet = { name: string; rows: string[][] };

export type PulseSpreadsheetAccessRow = {
  staff_id: number;
  role: 'viewer' | 'editor';
  full_name: string;
  email?: string | null;
};

export type PulseSpreadsheetInvolved = {
  raw: string;
  matched: { id: number | string | null; name: string } | null;
};

export type PulseSpreadsheetVisit = {
  date: string;
  lesson: string;
  class_name: string;
  subject: string;
  department: string;
  teacher: string;
  visitor: string;
  mark: string;
  sheet: string;
};

export type PulseSpreadsheetSummary = {
  id: number;
  title: string;
  source: string;
  source_url?: string | null;
  public_token: string;
  public_path: string;
  public_enabled?: boolean;
  version?: number;
  archived_at?: string | null;
  last_edited_by?: string | null;
  last_edited_by_staff_id?: number | null;
  access_count?: number;
  created_by_staff_id?: number | null;
  author_name?: string | null;
  my_role?: 'viewer' | 'editor' | null;
  can_manage?: boolean;
  can_edit?: boolean;
  updated_at?: string;
};

export type PulseSpreadsheetWorkbook = PulseSpreadsheetSummary & {
  sheets: PulseSpreadsheetSheet[];
  doc?: unknown;
  can_edit: boolean;
  can_manage: boolean;
  can_assign?: boolean;
  smtp_configured?: boolean;
  access?: PulseSpreadsheetAccessRow[];
  involved?: PulseSpreadsheetInvolved[];
  visits?: PulseSpreadsheetVisit[];
};

export type PulseSpreadsheetShareRow = {
  id: number;
  recipient_staff_id: number | null;
  recipient_name: string;
  sender_name: string;
  mode: 'cabinet' | 'public_link';
  role?: string | null;
  message: string;
  scope: string;
  created_at: string;
};

export async function cabinetSpreadsheetsList(params?: {
  scope?: 'mine' | 'shared' | 'all' | 'archived';
  q?: string;
  sort?: 'updated' | 'title' | 'author';
}): Promise<{
  can_assign: boolean;
  items: PulseSpreadsheetSummary[];
  visit_schedule_url: string;
  smtp_configured?: boolean;
}> {
  const qs = new URLSearchParams();
  if (params?.scope) qs.set('scope', params.scope);
  if (params?.q) qs.set('q', params.q);
  if (params?.sort) qs.set('sort', params.sort);
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets${qs.toString() ? `?${qs}` : ''}`, {
    headers: jdPreviewHeaders(),
  });
  const data = await parseJson<{
    can_assign?: boolean;
    items?: PulseSpreadsheetSummary[];
    visit_schedule_url?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось загрузить таблицы');
  return {
    can_assign: Boolean(data.can_assign),
    items: data.items || [],
    visit_schedule_url: data.visit_schedule_url || '',
    smtp_configured: Boolean((data as { smtp_configured?: boolean }).smtp_configured),
  };
}

export async function cabinetSpreadsheetGet(id: number): Promise<PulseSpreadsheetWorkbook> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}`, { headers: jdPreviewHeaders() });
  const data = await parseJson<PulseSpreadsheetWorkbook & { message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось открыть таблицу');
  return data;
}

export async function cabinetSpreadsheetCreate(body: {
  title: string;
  sheets: PulseSpreadsheetSheet[];
  source?: string;
  source_url?: string | null;
  doc?: unknown;
}): Promise<PulseSpreadsheetWorkbook> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ workbook?: PulseSpreadsheetWorkbook; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось создать таблицу');
  return data.workbook as PulseSpreadsheetWorkbook;
}

export async function cabinetSpreadsheetImportGoogle(body: {
  url?: string;
  title?: string;
}): Promise<{ workbook: PulseSpreadsheetWorkbook; replacements: Array<{ from: string; to: string }> }> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/import-google`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    workbook?: PulseSpreadsheetWorkbook;
    replacements?: Array<{ from: string; to: string }>;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось импортировать таблицу');
  return { workbook: data.workbook as PulseSpreadsheetWorkbook, replacements: data.replacements || [] };
}

export async function cabinetSpreadsheetSave(
  id: number,
  body: { title?: string; sheets?: PulseSpreadsheetSheet[]; doc?: unknown; base_version?: number },
): Promise<PulseSpreadsheetWorkbook> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}`, {
    method: 'PUT',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<PulseSpreadsheetWorkbook & { message?: string; error?: string; version?: number }>(res);
  if (res.status === 409) throw new Error(data.message || 'Таблица изменилась, ваши последние правки не применились.');
  if (!res.ok) throw new Error(data.message || 'Не удалось сохранить таблицу');
  return data;
}

export async function cabinetSpreadsheetPatch(
  id: number,
  body: { title?: string; archived?: boolean; public_enabled?: boolean },
): Promise<PulseSpreadsheetWorkbook> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}`, {
    method: 'PATCH',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<PulseSpreadsheetWorkbook & { message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось обновить таблицу');
  return data;
}

export async function cabinetSpreadsheetOps(
  id: number,
  body: { base_version: number; client_id: string; ops: unknown[] },
): Promise<{ version: number; applied: boolean; rebased?: boolean; remote_ops?: unknown[] }> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/ops`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    version?: number;
    applied?: boolean;
    rebased?: boolean;
    remote_ops?: unknown[];
    message?: string;
  }>(res);
  if (res.status === 409) throw new Error(data.message || 'Таблица изменилась, ваши последние правки не применились.');
  if (!res.ok) throw new Error(data.message || 'Не удалось сохранить правки');
  return { version: Number(data.version || 0), applied: Boolean(data.applied), rebased: data.rebased, remote_ops: data.remote_ops };
}

export async function cabinetSpreadsheetSync(
  id: number,
  params: { since: number; sheet?: number; cell?: string },
): Promise<{ version: number; remote_ops: unknown[]; presence: Array<{ staff_id: number; full_name: string; sheet_index: number; cell: string }> }> {
  const qs = new URLSearchParams({ since: String(params.since) });
  if (params.sheet != null) qs.set('sheet', String(params.sheet));
  if (params.cell) qs.set('cell', params.cell);
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/sync?${qs}`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{
    version?: number;
    remote_ops?: unknown[];
    presence?: Array<{ staff_id: number; full_name: string; sheet_index: number; cell: string }>;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось синхронизировать таблицу');
  return { version: Number(data.version || 0), remote_ops: data.remote_ops || [], presence: data.presence || [] };
}

export async function cabinetSpreadsheetRevisions(
  id: number,
  params?: { limit?: number; before?: number },
): Promise<Array<{ version: number; full_name: string; created_at: string; has_snapshot: boolean; ops_count: number }>> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.before) qs.set('before', String(params.before));
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/revisions${qs.toString() ? `?${qs}` : ''}`, {
    headers: jdPreviewHeaders(),
  });
  const data = await parseJson<{ items?: Array<{ version: number; full_name: string; created_at: string; has_snapshot: boolean; ops_count: number }>; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось загрузить историю');
  return data.items || [];
}

export async function cabinetSpreadsheetRevision(id: number, version: number): Promise<{ version: number; doc: unknown; sheets: PulseSpreadsheetSheet[] }> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/revisions/${version}`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{ version?: number; doc?: unknown; sheets?: PulseSpreadsheetSheet[]; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось открыть версию');
  return { version: Number(data.version || version), doc: data.doc, sheets: data.sheets || [] };
}

export async function cabinetSpreadsheetDuplicate(id: number): Promise<PulseSpreadsheetWorkbook> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/duplicate`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
  });
  const data = await parseJson<{ workbook?: PulseSpreadsheetWorkbook; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось создать копию');
  return data.workbook as PulseSpreadsheetWorkbook;
}

export async function cabinetSpreadsheetDelete(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}`, {
    method: 'DELETE',
    headers: jdPreviewHeaders(),
  });
  const data = await parseJson<{ message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось удалить таблицу');
}

export async function cabinetSpreadsheetRotatePublicToken(id: number): Promise<PulseSpreadsheetWorkbook> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/public-token/rotate`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
  });
  const data = await parseJson<PulseSpreadsheetWorkbook & { message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось перевыпустить ссылку');
  return data;
}

export async function cabinetSpreadsheetShare(
  id: number,
  body: {
    scope: 'staff' | 'access' | 'department' | 'all';
    staff_ids?: number[];
    departments?: string[];
    mode: 'cabinet' | 'public_link';
    role?: 'viewer' | 'editor';
    message?: string;
    email?: boolean;
  },
): Promise<{
  recipients: number;
  access_granted: number;
  notified: number;
  mailed: number;
  skipped_recent: number;
  mail_warnings: unknown[];
  access: PulseSpreadsheetAccessRow[];
}> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/share`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    recipients?: number;
    access_granted?: number;
    notified?: number;
    mailed?: number;
    skipped_recent?: number;
    mail_warnings?: unknown[];
    access?: PulseSpreadsheetAccessRow[];
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось отправить таблицу');
  return {
    recipients: Number(data.recipients || 0),
    access_granted: Number(data.access_granted || 0),
    notified: Number(data.notified || 0),
    mailed: Number(data.mailed || 0),
    skipped_recent: Number(data.skipped_recent || 0),
    mail_warnings: data.mail_warnings || [],
    access: data.access || [],
  };
}

export async function cabinetSpreadsheetShares(id: number): Promise<PulseSpreadsheetShareRow[]> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/shares?limit=20`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{ items?: PulseSpreadsheetShareRow[]; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось загрузить журнал отправок');
  return data.items || [];
}

export async function cabinetSpreadsheetDepartments(): Promise<{ items: string[]; smtp_configured: boolean }> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/departments`, { headers: jdPreviewHeaders() });
  const data = await parseJson<{ items?: string[]; smtp_configured?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось загрузить кафедры');
  return { items: data.items || [], smtp_configured: Boolean(data.smtp_configured) };
}

export async function cabinetSpreadsheetExpandNames(id: number): Promise<{
  workbook: PulseSpreadsheetWorkbook;
  replacements: Array<{ from: string; to: string; column?: string }>;
  involved: PulseSpreadsheetInvolved[];
  visits: PulseSpreadsheetVisit[];
}> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/expand-names`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
  });
  const data = await parseJson<{
    workbook?: PulseSpreadsheetWorkbook;
    replacements?: Array<{ from: string; to: string; column?: string }>;
    involved?: PulseSpreadsheetInvolved[];
    visits?: PulseSpreadsheetVisit[];
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось подставить фамилии');
  return {
    workbook: data.workbook as PulseSpreadsheetWorkbook,
    replacements: data.replacements || [],
    involved: data.involved || [],
    visits: data.visits || [],
  };
}

export async function cabinetSpreadsheetStaffSearch(
  id: number,
  q: string,
): Promise<Array<{ id: number; full_name: string; department?: string; position?: string; access_role?: 'viewer' | 'editor' | null }>> {
  const qs = new URLSearchParams({ q });
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/staff?${qs}`, {
    headers: jdPreviewHeaders(),
  });
  const data = await parseJson<{ items?: Array<{ id: number; full_name: string; department?: string; position?: string; access_role?: 'viewer' | 'editor' | null }>; message?: string }>(
    res,
  );
  if (!res.ok) throw new Error(data.message || 'Не удалось найти сотрудника');
  return data.items || [];
}

export async function cabinetSpreadsheetGrantAccess(
  id: number,
  body: { staff_id?: number; staff_ids?: number[]; role: 'viewer' | 'editor'; from_involved?: boolean },
): Promise<{ access: PulseSpreadsheetAccessRow[] }> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/access`, {
    method: 'POST',
    headers: jdPreviewHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ access?: PulseSpreadsheetAccessRow[]; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось выдать доступ');
  return { access: data.access || [] };
}

export async function cabinetSpreadsheetRevokeAccess(
  id: number,
  staffId: number,
): Promise<{ access: PulseSpreadsheetAccessRow[] }> {
  const res = await apiFetch(`${API_BASE}/api/cabinet/spreadsheets/${id}/access/${staffId}`, {
    method: 'DELETE',
    headers: jdPreviewHeaders(),
  });
  const data = await parseJson<{ access?: PulseSpreadsheetAccessRow[]; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || 'Не удалось снять доступ');
  return { access: data.access || [] };
}
