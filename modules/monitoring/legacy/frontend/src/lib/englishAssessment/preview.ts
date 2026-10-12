import { getJdPreviewEmail, getJdPreviewStaffId } from '../jobDescriptions/preview';

let eaPreviewEmail: string | null = null;
let eaPreviewTeacherId: number | null = null;

export function setEaPreviewEmail(email: string | null) {
  eaPreviewEmail = email?.trim().toLowerCase() || null;
}

export function setEaPreviewTeacherId(id: number | null) {
  eaPreviewTeacherId = id && id > 0 ? id : null;
}

export function getEaPreviewEmail() {
  return eaPreviewEmail;
}

export function getEaPreviewTeacherId() {
  return eaPreviewTeacherId;
}

export function eaPreviewHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const email = eaPreviewEmail || getJdPreviewEmail();
  const staffId = getJdPreviewStaffId();
  if (email) {
    h['X-Ea-Preview-As'] = email;
    h['X-Jd-Preview-As'] = email;
  }
  if (eaPreviewTeacherId) h['X-Ea-Preview-As-Teacher'] = String(eaPreviewTeacherId);
  if (staffId) h['X-Jd-Preview-As-Staff'] = String(staffId);
  return h;
}
