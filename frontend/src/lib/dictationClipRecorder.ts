import { pickRecorderMimeType } from './audioProtocol/backgroundMeetingRecorder';
import {
  explainRecordingChunkReject,
  isUploadableRecordingChunk,
  MIN_MP4_FRAGMENT_BYTES,
} from './audioProtocol/audioBlobValidation';
import { concatRecordingBlobsAsync } from './audioProtocol/concatRecordingBlobs';
import {
  detectRecordingBlobFormat,
  extensionForRecordingFormat,
  mimeForRecordingFormat,
} from './audioProtocol/recordingBlobFormat';
import { isIos } from './pwaInstall';

const IOS_RECORDER_MIME_CANDIDATES = ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm'] as const;

/** Короткие срезы на iOS — init (ftyp) попадает в первый фрагмент до «Стоп». */
const IOS_DICTATION_TIMESLICE_MS = 1000;

/** Минимальная длительность речи перед остановкой (с). */
export const MIN_DICTATION_RECORDING_MS = 1500;

function createMediaRecorder(stream: MediaStream, preferredMime: string): MediaRecorder {
  const attempts: (string | undefined)[] = preferredMime ? [preferredMime, undefined] : [undefined];
  if (isIos() && preferredMime !== 'audio/mp4') {
    attempts.splice(1, 0, 'audio/mp4');
  }
  let lastErr: unknown;
  for (const mime of attempts) {
    try {
      return mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Не удалось начать запись с микрофона.');
}

export type DictationClip = {
  blob: Blob;
  filename: string;
};

/**
 * Короткая запись с микрофона (push-to-talk) для серверной STT на iOS.
 * На iPhone: timeslice + склейка fMP4 (как в audio-protocol), иначе STT получает moof без ftyp.
 */
export class DictationClipRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeUsed = '';
  private startedAt: number | null = null;

  getElapsedMs(): number {
    return this.startedAt != null ? Math.max(0, Date.now() - this.startedAt) : 0;
  }

  async start(stream: MediaStream): Promise<void> {
    this.stopTracks();
    this.stream = stream;
    this.chunks = [];
    this.startedAt = Date.now();
    this.mimeUsed = pickRecorderMimeType();
    if (!this.mimeUsed) {
      for (const v of IOS_RECORDER_MIME_CANDIDATES) {
        try {
          if (MediaRecorder.isTypeSupported(v)) {
            this.mimeUsed = v;
            break;
          }
        } catch {
          /* ignore */
        }
      }
    }
    this.recorder = createMediaRecorder(stream, this.mimeUsed);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    if (isIos()) {
      this.recorder.start(IOS_DICTATION_TIMESLICE_MS);
    } else {
      this.recorder.start();
    }
  }

  async stop(): Promise<DictationClip> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') {
      this.stopTracks();
      throw new Error('Запись не была начата.');
    }

    const elapsed = this.getElapsedMs();
    if (elapsed < MIN_DICTATION_RECORDING_MS) {
      throw new Error(
        `Говорите ещё ${Math.ceil((MIN_DICTATION_RECORDING_MS - elapsed) / 1000)} с, затем остановите запись.`,
      );
    }

    await this.finalizeRecorder(recorder);

    const mimeHint = recorder.mimeType || this.mimeUsed || 'audio/mp4';
    let blob: Blob;
    if (isIos() && this.chunks.length > 1) {
      blob = await concatRecordingBlobsAsync(this.chunks);
    } else if (this.chunks.length === 1) {
      blob = this.chunks[0];
    } else {
      const type = mimeHint || 'audio/mp4';
      blob = new Blob(this.chunks, { type });
    }
    if (!blob.type || !blob.type.trim()) {
      blob = new Blob([blob], { type: mimeHint || 'audio/mp4' });
    }

    this.recorder = null;
    this.chunks = [];
    this.startedAt = null;
    this.stopTracks();

    const minBytes = isIos() ? MIN_MP4_FRAGMENT_BYTES : 400;
    if (blob.size < minBytes) {
      throw new Error('Запись слишком короткая. Говорите 2–3 с, затем остановите диктовку.');
    }

    const uploadable = await isUploadableRecordingChunk(blob, mimeHint, { final: true });
    if (!uploadable) {
      const reason = await explainRecordingChunkReject(blob, mimeHint, { seq: 0, isFinal: true });
      throw new Error(
        reason ??
          'Запись не готова для расшифровки. Говорите 2–3 с, держите приложение открытым, затем «Стоп».',
      );
    }

    const format = await detectRecordingBlobFormat(blob, mimeHint);
    const ext = extensionForRecordingFormat(format, mimeHint);
    const filename = `dictation-${Date.now()}.${ext}`;
    const mime = blob.type || mimeForRecordingFormat(format);
    return { blob: mime ? new Blob([blob], { type: mime }) : blob, filename };
  }

  /** requestData + onstop — иначе на iOS/webm нет целого заголовка. */
  private finalizeRecorder(recorder: MediaRecorder): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const timer = window.setTimeout(done, 800);
      recorder.addEventListener(
        'stop',
        () => {
          window.clearTimeout(timer);
          window.setTimeout(done, 120);
        },
        { once: true },
      );
      recorder.onerror = () => {
        window.clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(new Error('Ошибка записи с микрофона.'));
        }
      };
      try {
        recorder.requestData();
      } catch {
        /* ignore */
      }
      try {
        recorder.stop();
      } catch (e) {
        window.clearTimeout(timer);
        reject(e instanceof Error ? e : new Error('Не удалось остановить запись.'));
      }
    });
  }

  cancel(): void {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    } catch {
      /* ignore */
    }
    this.recorder = null;
    this.chunks = [];
    this.startedAt = null;
    this.stopTracks();
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
