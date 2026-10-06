import { hasStaffSessionHint } from '../staffSession';

/** Auth identity for sharedLoad keys — preview mode stays a separate suffix. */
export function cabinetSessionKey(): string {
  return hasStaffSessionHint() ? 'cookie-session' : '';
}
