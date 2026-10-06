import { postPulseAiFinalizeUpload, postPulseAiPresignUpload, postPulseAiTranscribe } from '../api/pulseAi';
import { uploadPresignedFileCollectionObject } from '../api/fileCollection';
import { MIN_MP4_FRAGMENT_BYTES } from './audioProtocol/audioBlobValidation';

/** Короткие фрагменты диктовки в публичной форме (~1–2 мин речи). */
export const MAX_DICTATION_CLIP_BYTES = 4 * 1024 * 1024;

const MIN_DICTATION_CLIP_BYTES = MIN_MP4_FRAGMENT_BYTES;

/**
 * Загрузка клипа в бакет (presign) и синхронная расшифровка Yandex SpeechKit на функции.
 */
export async function transcribeDictationClip(
  blob: Blob,
  filename: string,
  onStatus?: (message: string) => void,
): Promise<string> {
  if (blob.size > MAX_DICTATION_CLIP_BYTES) {
    throw new Error('Запись слишком длинная. Остановите диктовку и начните снова короче.');
  }
  if (blob.size < MIN_DICTATION_CLIP_BYTES) {
    throw new Error('Запись слишком короткая. Говорите 2–3 с, пока идёт запись.');
  }

  const file = new File([blob], filename, {
    type: blob.type && blob.type.trim() ? blob.type : 'audio/mp4',
  });

  onStatus?.('Подготовка загрузки…');
  let batch_id: string;
  let uploads: Awaited<ReturnType<typeof postPulseAiPresignUpload>>['uploads'];
  try {
    ({ batch_id, uploads } = await postPulseAiPresignUpload([file]));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Не удалось получить адрес загрузки.';
    throw new Error(msg.includes('вход') || /Unauthorized|401/i.test(msg) ? msg : `Загрузка: ${msg}`);
  }
  const up = uploads[0];
  if (!up?.key) {
    throw new Error('Сервер не выдал адрес для загрузки аудио.');
  }

  onStatus?.('Загрузка на сервер…');
  const completion = await uploadPresignedFileCollectionObject(up, file, () => {});
  await postPulseAiFinalizeUpload({
    batch_id,
    keys: [up.key],
    ...(completion ? { multipart_completions: [completion] } : {}),
  });

  onStatus?.('Расшифровка речи…');
  const { text } = await postPulseAiTranscribe(up.key);
  const out = String(text ?? '').trim();
  if (!out) {
    throw new Error(
      'Речь не распознана. Говорите громче 2–3 с, держите телефон ближе к микрофону или попробуйте в тихом месте.',
    );
  }
  return out;
}
