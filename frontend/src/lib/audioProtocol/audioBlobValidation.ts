import { isIos } from '../pwaInstall';
import {
  detectRecordingBlobFormat,
  hasMp4Ftyp,
  hasMp4MoofOrMdat,
  hasOggHead,
  hasWebmEbmlHeader,
  isMp4ContinuationOnly,
  type RecordingBlobFormat,
} from './recordingBlobFormat';

/** Пустой/обрывок MediaRecorder — не показываем ошибку. */
export const MIN_EMPTY_CHUNK_BYTES = 200;
/** Минимум для целого webm с EBML. */
export const MIN_WEBM_WITH_HEADER_BYTES = 800;
/** Минимум для фрагмента MP4/M4A (iPhone часто 800–3000 Б). */
export const MIN_MP4_FRAGMENT_BYTES = 800;
/** Продолжение fMP4 (moof) без init — слишком мало для ffmpeg. */
export const MIN_MP4_CONTINUATION_BYTES = 1200;

async function readBlobHead(blob: Blob, len = 16): Promise<Uint8Array> {
  const slice = blob.slice(0, len);
  const buf = await slice.arrayBuffer();
  return new Uint8Array(buf);
}

function mimeImpliesMp4(mimeHint: string): boolean {
  const t = mimeHint.toLowerCase();
  return t.includes('mp4') || t.includes('m4a') || t.includes('aac') || t.includes('mp4a');
}

function isMp4ish(format: RecordingBlobFormat, mimeHint: string): boolean {
  return format === 'mp4' || mimeImpliesMp4(mimeHint) || (format === 'unknown' && isIos());
}

/**
 * Можно ли отправлять фрагмент с микрофона на расшифровку.
 * @param mimeHint MIME MediaRecorder (на iPhone blob.type часто пустой).
 */
export type UploadableRecordingChunkOpts = {
  /** Финальная склейка iOS перед отправкой — нужен init (ftyp), иначе ffmpeg/STT молчат. */
  final?: boolean;
};

export async function isUploadableRecordingChunk(
  blob: Blob,
  mimeHint = '',
  opts?: UploadableRecordingChunkOpts,
): Promise<boolean> {
  if (!blob || blob.size < MIN_EMPTY_CHUNK_BYTES) return false;

  const format = await detectRecordingBlobFormat(blob, mimeHint);
  const mp4ish = isMp4ish(format, mimeHint);

  try {
    const head = await readBlobHead(blob, 64);

    if (mp4ish) {
      if (opts?.final && isIos() && !hasMp4Ftyp(head)) {
        return false;
      }
      if (isMp4ContinuationOnly(head)) {
        return blob.size >= MIN_MP4_CONTINUATION_BYTES;
      }
      if (hasMp4Ftyp(head) || hasMp4MoofOrMdat(head)) {
        return blob.size >= MIN_MP4_FRAGMENT_BYTES;
      }
      return blob.size >= MIN_MP4_FRAGMENT_BYTES;
    }

    if (format === 'webm') {
      if (!hasWebmEbmlHeader(head)) return false;
      return blob.size >= MIN_WEBM_WITH_HEADER_BYTES;
    }
    if (format === 'ogg') {
      if (!hasOggHead(head)) return false;
      return blob.size >= 2048;
    }

    return blob.size >= 2048;
  } catch {
    const min = mp4ish
      ? MIN_MP4_FRAGMENT_BYTES
      : format === 'webm'
        ? MIN_WEBM_WITH_HEADER_BYTES
        : 2048;
    return blob.size >= min;
  }
}

export type RecordingChunkRejectContext = {
  /** Номер следующего фрагмента (1-based для сообщений). */
  seq: number;
  isFinal: boolean;
};

/**
 * Причина отказа для UI или null (пропустить фрагмент без ошибки).
 */
export async function explainRecordingChunkReject(
  blob: Blob,
  mimeHint: string,
  ctx: RecordingChunkRejectContext,
): Promise<string | null> {
  const frag = ctx.seq > 0 ? ` №${ctx.seq}` : '';

  if (!blob || blob.size < MIN_EMPTY_CHUNK_BYTES) {
    if (ctx.isFinal && blob && blob.size >= 1) {
      return `Последний фрагмент${frag} слишком короткий. Говорите ещё 12–15 с перед остановкой, не сворачивайте приложение (iPhone: MP4).`;
    }
    return null;
  }

  if (await isUploadableRecordingChunk(blob, mimeHint, { final: ctx.isFinal })) return null;

  if (ctx.isFinal && isIos() && mimeImpliesMp4(mimeHint)) {
    try {
      const head = await readBlobHead(blob, 64);
      if (!hasMp4Ftyp(head)) {
        return `Запись без заголовка MP4 (ftyp) — файл не пригоден для расшифровки. Говорите 15–20 с, держите приложение открытым, затем «Стоп»; при повторе — «Перезаписать».`;
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const head = await readBlobHead(blob, 64);
    if (isMp4ContinuationOnly(head) && blob.size < MIN_MP4_CONTINUATION_BYTES) {
      if (ctx.isFinal) {
        return `Последний фрагмент${frag} ещё формируется. Подождите 12–15 с после речи, затем остановите запись; не закрывайте приложение.`;
      }
      if (ctx.seq <= 1) {
        return `Первый фрагмент${frag} ещё не готов. Говорите 15–20 с, держите экран включённым (iPhone: MP4), затем повторите.`;
      }
      return null;
    }
  } catch {
    /* ignore */
  }

  if (ctx.isFinal) {
    return `Последний фрагмент${frag} не принят — расшифровка по уже отправленным. Говорите дольше перед «Стоп», держите приложение открытым, при сбое нажмите «Перезаписать».`;
  }
  if (ctx.seq <= 1) {
    return `Первый фрагмент${frag} ещё не готов. Говорите 15–20 с, не блокируйте экран (iPhone: MP4); если ошибка повторяется — «Перезаписать».`;
  }
  return null;
}

export { type RecordingBlobFormat };
