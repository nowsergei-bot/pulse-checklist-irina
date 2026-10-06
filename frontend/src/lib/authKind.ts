export type AuthKind = 'anonymous' | 'staff' | 'admin-key';

export type AuthStorage = {
  getItem(key: string): string | null;
};

export type AuthKindOptions = {
  path?: string;
  sessionHint?: boolean;
};

export function isAdminKeySurface(path: string | undefined | null): boolean {
  const p = String(path || '').replace(/\/+$/, '') || '/';
  return p === '/admin' || p.startsWith('/admin/') || p === '/auth/local';
}

/** OAuth bridge: pulse_has_session and/or pulse_session_bearer (not only legacy auth_token). */
function defaultStaffSessionHint(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    if (sessionStorage.getItem('pulse_has_session') === '1') return true;
    return Boolean(sessionStorage.getItem('pulse_session_bearer')?.trim());
  } catch {
    return false;
  }
}

export function readAuthKind(
  storage: AuthStorage | null | undefined,
  opts: AuthKindOptions = {},
): AuthKind {
  if (!storage) return 'anonymous';
  const path =
    opts.path ?? (typeof location !== 'undefined' ? String(location.pathname || '') : '');
  const sessionHint = opts.sessionHint ?? defaultStaffSessionHint();
  const admin = storage.getItem('admin_api_key')?.trim();
  if (admin && isAdminKeySurface(path)) return 'admin-key';
  const staff = storage.getItem('auth_token')?.trim();
  if (sessionHint || staff) return 'staff';
  return 'anonymous';
}

export function brandHomePath(kind: AuthKind): string {
  if (kind === 'admin-key') return '/admin';
  if (kind === 'staff') return '/cabinet';
  return '/';
}

export function isStaffAuth(kind: AuthKind): boolean {
  return kind === 'staff';
}

export function isAdminKeyAuth(kind: AuthKind): boolean {
  return kind === 'admin-key';
}
