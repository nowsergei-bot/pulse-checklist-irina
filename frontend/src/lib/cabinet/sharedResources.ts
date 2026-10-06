import { cabinetDirectory } from '../../api/cabinet';
import { type CabinetDirectoryDepartment } from '../../api/cabinet';
import { jdMe } from '../../api/jobDescriptions';
import { getJdPreviewEmail, getJdPreviewStaffId } from '../jobDescriptions/preview';
import type { JdMeResponse } from '../jobDescriptions/types';
import { cabinetSessionKey } from './sessionKey';
import {
  createSharedLoadState,
  invalidateSharedLoad,
  sharedLoad,
  type SharedLoadState,
} from './sharedLoad';

const TTL_MS = 60_000;

export function previewResourceKey(): string {
  const staff = getJdPreviewStaffId();
  const email = getJdPreviewEmail();
  return `${cabinetSessionKey()}|${staff || ''}|${email || ''}`;
}

const jdState: SharedLoadState<JdMeResponse> = createSharedLoadState();
const dirState: SharedLoadState<{ departments: CabinetDirectoryDepartment[] }> = createSharedLoadState();

export function invalidateSharedJdMe() {
  invalidateSharedLoad(jdState);
}

export function invalidateSharedDirectory() {
  invalidateSharedLoad(dirState);
}

export function loadJdMe(force = false): Promise<JdMeResponse> {
  return sharedLoad(jdState, previewResourceKey(), () => jdMe(), TTL_MS, force);
}

export function loadCabinetDirectory(force = false): Promise<{ departments: CabinetDirectoryDepartment[] }> {
  return sharedLoad(
    dirState,
    previewResourceKey(),
    () => cabinetDirectory().then((data) => ({ departments: data.departments })),
    TTL_MS,
    force,
  );
}
