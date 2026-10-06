import { eaDirectory, eaGroupCard } from '../../api/englishAssessment';
import type { EaDirectoryClass, EaDirectoryGroup, EaDirectoryStudent, EaGroupCard, EaTeacherListItem } from './types';
import { cabinetSessionKey } from '../cabinet/sessionKey';
import {
  createSharedLoadState,
  invalidateSharedLoad,
  peekSharedLoad,
  sharedLoad,
} from '../cabinet/sharedLoad';
import { getEaPreviewEmail, getEaPreviewTeacherId } from './preview';
import { getJdPreviewEmail, getJdPreviewStaffId } from '../jobDescriptions/preview';

const TTL_MS = 45_000;

export type EaDirectoryPayload = {
  year?: { id: number; label: string } | null;
  classes?: EaDirectoryClass[];
  students?: EaDirectoryStudent[];
  groups?: EaDirectoryGroup[];
  teachers?: EaTeacherListItem[];
};

const dirState = createSharedLoadState<EaDirectoryPayload>();
const groupState = createSharedLoadState<EaGroupCard>();

function previewPart() {
  const teacher = getEaPreviewTeacherId() || '';
  const email = getEaPreviewEmail() || getJdPreviewEmail() || '';
  const staff = getJdPreviewStaffId() || '';
  return `${cabinetSessionKey()}|${teacher}|${email}|${staff}`;
}

export function invalidateSharedEaDirectory() {
  invalidateSharedLoad(dirState);
}

export function invalidateSharedEaGroups() {
  invalidateSharedLoad(groupState);
}

export function loadEaDirectory(force = false) {
  return sharedLoad(dirState, previewPart(), () => eaDirectory(), TTL_MS, force);
}

export function peekCachedEaDirectory() {
  return peekSharedLoad(dirState, previewPart(), TTL_MS);
}

export function loadEaGroupCard(groupId: number, force = false) {
  return sharedLoad(groupState, `${previewPart()}|${groupId}`, () => eaGroupCard(groupId), TTL_MS, force);
}

export function peekCachedEaGroupCard(groupId: number) {
  return peekSharedLoad(groupState, `${previewPart()}|${groupId}`, TTL_MS);
}

export function prefetchEaGroupCard(groupId: number) {
  if (!Number.isFinite(groupId) || groupId <= 0) return;
  void loadEaGroupCard(groupId).catch(() => {});
}
