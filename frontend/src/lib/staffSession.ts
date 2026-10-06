const CSRF_KEY = 'pulse_csrf';
const SESSION_HINT = 'pulse_has_session';
/** Tab-scoped Bearer when cross-origin HttpOnly cookie is missing after OAuth 302. */
const BEARER_KEY = 'pulse_session_bearer';

/** In-tab fallback when sessionStorage throws (Safari private / blocked). */
let memoryBearer = '';
let memoryCsrf = '';
let memoryHint = false;

function writeSession(key: string, value: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode / quota — memory fields still keep the tab session */
  }
}

function readSession(key: string): string {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return sessionStorage.getItem(key)?.trim() || '';
  } catch {
    return '';
  }
}

function removeSession(key: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function rememberStaffCsrf(token: string | null | undefined): void {
  const value = String(token || '').trim();
  if (!value) return;
  memoryCsrf = value;
  memoryHint = true;
  writeSession(CSRF_KEY, value);
  writeSession(SESSION_HINT, '1');
}

/** OAuth hash token bridge — not localStorage (security.md). */
export function rememberStaffBearer(token: string | null | undefined): void {
  const value = String(token || '').trim();
  if (!value) return;
  memoryBearer = value;
  memoryHint = true;
  writeSession(BEARER_KEY, value);
  writeSession(SESSION_HINT, '1');
}

export function getStaffBearer(): string {
  return readSession(BEARER_KEY) || memoryBearer;
}

/** Bearer for API calls: legacy localStorage token, else OAuth bridge in sessionStorage. */
export function resolveStaffBearer(): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const legacy = localStorage.getItem('auth_token')?.trim() || '';
      if (legacy) return legacy;
    } catch {
      /* ignore */
    }
  }
  return getStaffBearer();
}

export function markStaffSessionActive(): void {
  memoryHint = true;
  writeSession(SESSION_HINT, '1');
}

function csrfFromDocumentCookie(): string {
  if (typeof document === 'undefined') return '';
  const raw = String(document.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== 'pulse_csrf') continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return part.slice(idx + 1).trim();
    }
  }
  return '';
}

export function getStaffCsrf(): string {
  const stored = readSession(CSRF_KEY) || memoryCsrf;
  if (stored) return stored;
  const fromCookie = csrfFromDocumentCookie();
  if (fromCookie) rememberStaffCsrf(fromCookie);
  return fromCookie;
}

export function clearStaffSessionHint(): void {
  memoryBearer = '';
  memoryCsrf = '';
  memoryHint = false;
  removeSession(CSRF_KEY);
  removeSession(BEARER_KEY);
  removeSession(SESSION_HINT);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('auth_token');
    } catch {
      /* ignore */
    }
  }
}

export function hasStaffSessionHint(): boolean {
  if (memoryHint || memoryBearer) return true;
  if (readSession(SESSION_HINT) === '1') return true;
  if (readSession(BEARER_KEY)) return true;
  if (typeof localStorage !== 'undefined') {
    try {
      if (localStorage.getItem('auth_token')?.trim()) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}
