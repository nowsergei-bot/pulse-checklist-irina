import { adminMe, authMe } from '../../api/auth';
import { type AuthUser } from '../../api/auth';
import { invalidateSharedEaDirectory, invalidateSharedEaGroups } from '../englishAssessment/sharedResources';
import { invalidateSharedEaMe } from '../englishAssessment/sharedMe';
import { cabinetSessionKey } from './sessionKey';
import { hasStaffSessionHint } from '../staffSession';
import {
  createSharedLoadState,
  invalidateSharedLoad,
  peekSharedLoad,
  sharedLoad,
  type SharedLoadState,
} from './sharedLoad';
import { invalidateSharedDirectory, invalidateSharedJdMe } from './sharedResources';

const TTL_MS = 60_000;

const authState: SharedLoadState<AuthUser> = createSharedLoadState();
const adminState: SharedLoadState<{ ok: true }> = createSharedLoadState();

function staffTokenKey(): string {
  // Cookie or sessionStorage Bearer bridge share one cache key (not legacy auth_token).
  if (hasStaffSessionHint()) return 'cookie-session';
  return '';
}

function adminKeyKey(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem('admin_api_key')?.trim() || '';
}

export function invalidateSharedAuthMe() {
  invalidateSharedLoad(authState);
}

export function invalidateSharedAdminMe() {
  invalidateSharedLoad(adminState);
}

export function invalidateSharedSession() {
  invalidateSharedAuthMe();
  invalidateSharedAdminMe();
  invalidateSharedJdMe();
  invalidateSharedDirectory();
  invalidateSharedEaMe();
  invalidateSharedEaDirectory();
  invalidateSharedEaGroups();
}

/** Deduped / TTL-cached GET /api/auth/me for cabinet gates and profile. */
export function loadAuthMe(force = false): Promise<AuthUser> {
  return sharedLoad(authState, staffTokenKey() || cabinetSessionKey(), () => authMe(), TTL_MS, force);
}

/** Deduped / TTL-cached GET /api/admin/me for admin-key gates. */
export function loadAdminMe(force = false): Promise<{ ok: true }> {
  return sharedLoad(adminState, adminKeyKey(), () => adminMe(), TTL_MS, force);
}

/** Sync peek — used to paint shell without waiting when session was just verified. */
export function peekCachedAuthMe(): AuthUser | null {
  const key = staffTokenKey();
  if (!key) return null;
  return peekSharedLoad(authState, key, TTL_MS);
}
