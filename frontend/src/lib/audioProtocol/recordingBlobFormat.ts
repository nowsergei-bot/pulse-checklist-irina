/** Определение формата фрагмента MediaRecorder (тип MIME на iOS часто пустой). */

import { isIos } from '../pwaInstall';

export type RecordingBlobFormat = 'webm' | 'mp4' | 'ogg' | 'unknown';

async function readBlobHead(blob: Blob, len = 16): Promise<Uint8Array> {
  const slice = blob.slice(0, len);
  const buf = await slice.arrayBuffer();
  return new Uint8Array(buf);
}

export function hasWebmEbmlHeader(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
}

export function hasOggHead(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53;
}

export function hasMp4Ftyp(head: Uint8Array): boolean {
  const n = Math.min(head.length, 64);
  for (let i = 0; i <= n - 4; i++) {
    if (head[i] === 0x66 && head[i + 1] === 0x74 && head[i + 2] === 0x79 && head[i + 3] === 0x70) {
      return true;
    }
  }
  return false;
}

/** fMP4: продолжение потока без init (moof/mdat) — отдельно на STT не уходит. */
export function hasMp4MoofOrMdat(head: Uint8Array): boolean {
  const n = Math.min(head.length, 64);
  for (let i = 0; i <= n - 4; i++) {
    const b0 = head[i];
    const b1 = head[i + 1];
    const b2 = head[i + 2];
    const b3 = head[i + 3];
    if (b0 === 0x6d && b1 === 0x6f && b2 === 0x6f && b3 === 0x66) return true;
    if (b0 === 0x6d && b1 === 0x64 && b2 === 0x61 && b3 === 0x74) return true;
  }
  return false;
}

export function isMp4ContinuationOnly(head: Uint8Array): boolean {
  return hasMp4MoofOrMdat(head) && !hasMp4Ftyp(head);
}

function formatFromMime(type: string): RecordingBlobFormat | null {
  const t = type.toLowerCase();
  if (t.includes('webm')) return 'webm';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac') || t.includes('mp4a')) return 'mp4';
  return null;
}

/** Формат по MIME, подсказке MediaRecorder и сигнатуре в начале файла. */
export async function detectRecordingBlobFormat(
  blob: Blob,
  mimeHint = '',
): Promise<RecordingBlobFormat> {
  const fromMime = formatFromMime(blob.type || '') || formatFromMime(mimeHint);
  if (fromMime) return fromMime;

  try {
    const head = await readBlobHead(blob, 64);
    if (hasWebmEbmlHeader(head)) return 'webm';
    if (hasOggHead(head)) return 'ogg';
    if (hasMp4Ftyp(head)) return 'mp4';
  } catch {
    /* ignore */
  }
  if (formatFromMime(mimeHint) === 'mp4' || (isIos() && /mp4|m4a|aac/i.test(mimeHint))) {
    return 'mp4';
  }
  return 'unknown';
}

export function extensionForRecordingFormat(
  format: RecordingBlobFormat,
  mimeHint = '',
): string {
  switch (format) {
    case 'ogg':
      return 'ogg';
    case 'mp4':
      return 'm4a';
    case 'webm':
      return 'webm';
    default:
      if (formatFromMime(mimeHint) === 'mp4' || isIos()) return 'm4a';
      return 'webm';
  }
}

export function mimeForRecordingFormat(format: RecordingBlobFormat): string {
  switch (format) {
    case 'ogg':
      return 'audio/ogg';
    case 'mp4':
      return 'audio/mp4';
    case 'webm':
      return 'audio/webm';
    default:
      return 'application/octet-stream';
  }
}

export function mimeTypeFromRecorderChoice(mimeType: string): string {
  return mimeType.trim() || '';
}
