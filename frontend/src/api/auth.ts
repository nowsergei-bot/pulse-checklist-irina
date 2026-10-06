import { rememberStaffCsrf } from '../lib/staffSession';

import { API_BASE, apiBaseUrl, apiErrText, apiFetch, parseJson, adminHeaders, adminKeyHeaders, throwApiResponseError } from './http';
import type { ProtocolCabinet, RbacRoleRef } from './audioProtocol';

export function authOauth2AuthorizeUrl(returnTo = '/cabinet', opts?: { stepUp?: 'mfa' }): string {
  const q = new URLSearchParams({ return_to: returnTo });
  if (opts?.stepUp === 'mfa') q.set('step_up', 'mfa');
  const path = `/api/auth/oauth2/authorize?${q.toString()}`;
  if (!apiBaseUrl()) {
    if (import.meta.env.DEV) return path;
    throw new Error('Не задан адрес API при сборке (VITE_API_BASE).');
  }
  return `${apiBaseUrl()}${path}`;
}

export function startOAuth2Login(returnTo?: string, opts?: { stepUp?: 'mfa' }): void {
  const path = typeof returnTo === 'string' && returnTo.startsWith('/') ? returnTo : '/cabinet';
  try {
    window.location.href = authOauth2AuthorizeUrl(path, opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Не удалось начать вход через корпоративный портал';
    window.alert(msg);
  }
}

export async function authLogin(payload: { email: string; password: string }): Promise<{ token: string; user: { id: number; email: string; role: string }; expires_at: string }> {
  const res = await apiFetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ token?: string; csrf?: string; user?: { id: number; email: string; role: string }; expires_at?: string; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  if (!data.user) throw new Error('Нет данных пользователя');
  rememberStaffCsrf(data.csrf);
  return { token: data.token || '', user: data.user, expires_at: data.expires_at || '' };
}

export async function authProtocolRoleLogin(payload: {
  role: 'assistant_director' | 'director';
  password: string;
}): Promise<{ token: string; user: { id: number; email: string; role: string }; expires_at: string }> {
  const res = await apiFetch(`${API_BASE}/api/auth/protocol-role-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{
    token?: string;
    csrf?: string;
    user?: { id: number; email: string; role: string };
    expires_at?: string;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  if (!data.user) throw new Error('Нет данных пользователя');
  rememberStaffCsrf(data.csrf);
  return { token: data.token || '', user: data.user, expires_at: data.expires_at || '' };
}

export type AuthUser = {
  id: number;
  email: string;
  role: string;
  legacy_role?: string;
  display_name?: string | null;
  oauth_subject_id?: string | null;
  rbac_role_id?: number | null;
  rbac_role?: RbacRoleRef | null;
  account_status?: 'pending_role' | 'active';
  first_login_at?: string | null;
  photo_url?: string | null;
  photo_thumb_url?: string | null;
  cabinet_theme?: 'corporate' | 'blue' | 'green' | 'dark' | null;
  onboarding_completed_at?: string | null;
  telegram_nick?: string | null;
  max_nick?: string | null;
  permissions?: string[];
  platform_owner?: boolean;
  mfa_verified?: boolean;
  can_preview_as_staff?: boolean;
  protocol_cabinet_id?: number | null;
  protocol_cabinet?: ProtocolCabinet | null;
};

export async function authMe(): Promise<AuthUser> {
  const res = await apiFetch(`${API_BASE}/api/auth/me`, { headers: adminHeaders() });
  const data = await parseJson<{ user?: AuthUser; pending_role?: boolean; error?: string; message?: string }>(res);
  if (!res.ok) throwApiResponseError(res, data, 'GET /api/auth/me');
  if (!data.user) throw new Error('Нет данных пользователя');
  return data.user;
}

export async function adminMe(): Promise<{ ok: true }> {
  const res = await apiFetch(`${API_BASE}/api/admin/me`, { headers: adminKeyHeaders() });
  const data = await parseJson<{ ok?: boolean; error?: string; message?: string }>(res);
  if (!res.ok || !data.ok) throwApiResponseError(res, data, 'GET /api/admin/me');
  return { ok: true };
}

export async function authLogout(): Promise<void> {
  await apiFetch(`${API_BASE}/api/auth/logout`, { method: 'POST', headers: adminHeaders() }).catch(() => {});
}
