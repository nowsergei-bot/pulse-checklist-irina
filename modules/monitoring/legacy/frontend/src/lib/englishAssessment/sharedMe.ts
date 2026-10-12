import { eaMe } from '../../api/englishAssessment';
import type { EaMe } from './types';
import {
  createSharedLoadState,
  invalidateSharedLoad,
  peekSharedLoad,
  sharedLoad,
  type SharedLoadState,
} from '../cabinet/sharedLoad';
import { cabinetSessionKey } from '../cabinet/sessionKey';
import { getEaPreviewEmail, getEaPreviewTeacherId } from './preview';
import { getJdPreviewEmail, getJdPreviewStaffId } from '../jobDescriptions/preview';

const TTL_MS = 45_000;
const eaState: SharedLoadState<EaMe> = createSharedLoadState();

function eaMeKey(yearId?: string | number | null) {
  const teacher = getEaPreviewTeacherId() || '';
  const email = getEaPreviewEmail() || getJdPreviewEmail() || '';
  const staff = getJdPreviewStaffId() || '';
  const year = yearId != null && String(yearId) !== '' ? String(yearId) : '';
  return `${cabinetSessionKey()}|${teacher}|${email}|${staff}|${year}`;
}

export function invalidateSharedEaMe() {
  invalidateSharedLoad(eaState);
}

export function peekCachedEaMe(yearId?: string | number | null): EaMe | null {
  return peekSharedLoad(eaState, eaMeKey(yearId), TTL_MS);
}

export function loadEaMe(yearId?: string | number | null, force = false): Promise<EaMe> {
  return sharedLoad(
    eaState,
    eaMeKey(yearId),
    () => eaMe(yearId != null && String(yearId) !== '' ? { year_id: yearId } : undefined),
    TTL_MS,
    force,
  );
}
