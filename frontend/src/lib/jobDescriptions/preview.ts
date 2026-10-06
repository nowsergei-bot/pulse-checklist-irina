import { createContext, useContext } from 'react';
import { resolveStaffBearer } from '../staffSession';

export type JdPreviewContextValue = {
  previewEmail: string | null;
  previewStaffId: number | null;
  basePath: string;
  path: (suffix: string) => string;
  isPreview: boolean;
};

export const JdPreviewContext = createContext<JdPreviewContextValue>({
  previewEmail: null,
  previewStaffId: null,
  basePath: '/job-descriptions',
  path: (suffix) => `/job-descriptions${suffix}`,
  isPreview: false,
});

export function useJdPreview() {
  return useContext(JdPreviewContext);
}

export function jdPreviewQuery(email: string | null, staffId: number | null): string {
  const params = new URLSearchParams();
  if (staffId && staffId > 0) params.set('staff', String(staffId));
  else if (email) params.set('email', email);
  const q = params.toString();
  return q ? `?${q}` : '';
}

export function buildJdPreviewContext(
  previewEmail: string | null,
  previewStaffId: number | null = null,
): JdPreviewContextValue {
  const email = previewEmail?.trim().toLowerCase() || null;
  const staffId = previewStaffId && previewStaffId > 0 ? previewStaffId : null;
  const isPreview = Boolean(email || staffId);
  const basePath = isPreview ? '/job-descriptions/as' : '/job-descriptions';
  const q = jdPreviewQuery(email, staffId);
  return {
    previewEmail: email,
    previewStaffId: staffId,
    basePath,
    path: (suffix: string) => `${basePath}${suffix}${q}`,
    isPreview,
  };
}

const PREVIEW_EMAIL_KEY = 'jd_preview_as_email';
const PREVIEW_STAFF_KEY = 'jd_preview_as_staff';

let jdPreviewEmail: string | null = null;
let jdPreviewStaffId: number | null = null;
let jdAccessToken: string | null = null;
let previewHydrated = false;

function readStoredEmail(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem(PREVIEW_EMAIL_KEY)?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function readStoredStaffId(): number | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const n = Number(sessionStorage.getItem(PREVIEW_STAFF_KEY) || '');
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeStoredEmail(email: string | null) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (email) sessionStorage.setItem(PREVIEW_EMAIL_KEY, email);
    else sessionStorage.removeItem(PREVIEW_EMAIL_KEY);
  } catch {
    /* private mode */
  }
}

function writeStoredStaffId(id: number | null) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (id && id > 0) sessionStorage.setItem(PREVIEW_STAFF_KEY, String(id));
    else sessionStorage.removeItem(PREVIEW_STAFF_KEY);
  } catch {
    /* private mode */
  }
}

function hydratePreviewFromStorage() {
  if (previewHydrated) return;
  previewHydrated = true;
  if (!jdPreviewEmail) jdPreviewEmail = readStoredEmail();
  if (!jdPreviewStaffId) jdPreviewStaffId = readStoredStaffId();
}

export function setJdPreviewEmail(email: string | null) {
  hydratePreviewFromStorage();
  jdPreviewEmail = email?.trim().toLowerCase() || null;
  writeStoredEmail(jdPreviewEmail);
}

export function setJdPreviewStaffId(id: number | null) {
  hydratePreviewFromStorage();
  jdPreviewStaffId = id && id > 0 ? id : null;
  writeStoredStaffId(jdPreviewStaffId);
}

export function setJdAccessToken(token: string | null) {
  jdAccessToken = token?.trim() || null;
  if (typeof localStorage !== 'undefined') {
    if (jdAccessToken) localStorage.setItem('jd_access_token', jdAccessToken);
    else localStorage.removeItem('jd_access_token');
  }
}

export function getJdAccessToken() {
  if (jdAccessToken) return jdAccessToken;
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('jd_access_token') || null;
  }
  return null;
}

export function getJdPreviewEmail() {
  hydratePreviewFromStorage();
  return jdPreviewEmail;
}

export function getJdPreviewStaffId() {
  hydratePreviewFromStorage();
  return jdPreviewStaffId;
}

export function jdPreviewHeaders(): HeadersInit {
  const h = {} as Record<string, string>;
  const token = resolveStaffBearer();
  h['Content-Type'] = 'application/json';
  if (token) h['Authorization'] = `Bearer ${token}`;
  const email = getJdPreviewEmail();
  const staffId = getJdPreviewStaffId();
  if (email) h['X-Jd-Preview-As'] = email;
  if (staffId) h['X-Jd-Preview-As-Staff'] = String(staffId);
  const access = getJdAccessToken();
  if (access) h['X-Jd-Access-Token'] = access;
  return h;
}
