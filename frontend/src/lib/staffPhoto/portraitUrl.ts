/** Prefer full portrait over tight square thumb so hair/face stay in frame. */

const STAFF_PHOTO_PUBLIC_BASE =
  (typeof import.meta !== 'undefined' &&
    String((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_STAFF_PHOTO_PUBLIC_BASE_URL || '').trim()) ||
  'https://videofotos1.storage.yandexcloud.net';

/** Old CF builds returned `/staff-photos/…` relative to the static site (wiped by sync --delete). */
export function resolveStaffPhotoUrl(raw?: string | null): string | null {
  const src = String(raw || '').trim();
  if (!src) return null;
  if (/^https?:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('blob:')) return src;
  if (src.startsWith('/staff-photos/')) {
    const base = STAFF_PHOTO_PUBLIC_BASE.replace(/\/+$/, '');
    return `${base}${src}`;
  }
  return src;
}

export function staffPortraitUrl(photo?: {
  photo_url?: string | null;
  photo_thumb_url?: string | null;
} | null): string | null {
  if (!photo) return null;
  const full = String(photo.photo_url || '').trim();
  const thumb = String(photo.photo_thumb_url || '').trim();
  return resolveStaffPhotoUrl(full || thumb || null);
}
