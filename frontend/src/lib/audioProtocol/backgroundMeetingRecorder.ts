import { isIos } from '../pwaInstall';
import { mimeTypeFromRecorderChoice } from './recordingBlobFormat';

/**
 * iOS Safari / PWA: MediaRecorder обычно отдаёт audio/mp4 (AAC), не WebM.
 * isTypeSupported('audio/webm') на iOS = false; пустой blob.type — расширение по сигнатуре ftyp.
 */
const IOS_RECORDER_MIME_CANDIDATES = [
  'audio/mp4',
  'audio/aac',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
] as const;

const DEFAULT_RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

/** Интервал выдачи фрагментов MediaRecorder, когда вкладка на экране. */
const SLICE_VISIBLE_DESKTOP_MS = 90_000;
const SLICE_VISIBLE_MOBILE_MS = 30_000;
/** Короткие фрагменты в фоне — меньше риск потери при throttle ОС. */
const SLICE_HIDDEN_DESKTOP_MS = 20_000;
const SLICE_HIDDEN_MOBILE_MS = 10_000;
const FLUSH_VISIBLE_MS = 25_000;
const FLUSH_VISIBLE_MOBILE_MS = 12_000;
const FLUSH_HIDDEN_MS = 8_000;
/** iOS Safari: timeslice даёт целые MP4 без перезапуска (WebM на десктопе — через stop/restart). */
const IOS_RECORDER_TIMESLICE_MS = 12_000;
const HEALTH_CHECK_MS = 5_000;

export type BackgroundMeetingRecorderHandlers = {
  onChunk: (blob: Blob, isFinal: boolean, mimeHint?: string) => void;
  onError: (message: string) => void;
  onBackgroundChange?: (hidden: boolean) => void;
};

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches)
  );
}

export function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const variants = isIos() ? IOS_RECORDER_MIME_CANDIDATES : DEFAULT_RECORDER_MIME_CANDIDATES;
  for (const v of variants) {
    try {
      if (MediaRecorder.isTypeSupported(v)) return v;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function createMediaRecorder(stream: MediaStream, preferredMime: string): MediaRecorder {
  const attempts: (string | undefined)[] = preferredMime
    ? [preferredMime, undefined]
    : [undefined];
  if (isIos() && preferredMime !== 'audio/mp4') {
    attempts.splice(1, 0, 'audio/mp4');
  }
  let lastErr: unknown;
  for (const mime of attempts) {
    try {
      return mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Не удалось создать MediaRecorder');
}

function sliceMs(hidden: boolean): number {
  const mobile = isMobileDevice();
  if (hidden) return mobile ? SLICE_HIDDEN_MOBILE_MS : SLICE_HIDDEN_DESKTOP_MS;
  return mobile ? SLICE_VISIBLE_MOBILE_MS : SLICE_VISIBLE_DESKTOP_MS;
}

function flushIntervalMs(hidden: boolean): number {
  if (hidden) return FLUSH_HIDDEN_MS;
  return isMobileDevice() ? FLUSH_VISIBLE_MOBILE_MS : FLUSH_VISIBLE_MS;
}

/**
 * Движок записи с микрофона, устойчивый к сворачиванию вкладки на телефоне:
 * короткие фрагменты в фоне, периодический requestData, keep-alive AudioContext,
 * Media Session и автоперезапуск MediaRecorder при остановке в фоне.
 */
export class BackgroundMeetingRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuffer: Uint8Array | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt: number | null = null;
  private mimeType = '';
  /** Фактический MIME записи (для подсказок UI). */
  private recorderMimeUsed = '';
  private active = false;
  private stopping = false;
  private finalizing = false;
  private hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  private handlers: BackgroundMeetingRecorderHandlers;
  private sessionTitle = 'Запись встречи';
  private boundVisibility: (() => void) | null = null;
  private boundPageHide: (() => void) | null = null;
  private boundPageShow: (() => void) | null = null;
  private boundFreeze: (() => void) | null = null;
  private boundResume: (() => void) | null = null;
  /** Отсечь поздние ondataavailable после перезапуска MediaRecorder. */
  private recorderGeneration = 0;

  constructor(handlers: BackgroundMeetingRecorderHandlers) {
    this.handlers = handlers;
  }

  get isActive(): boolean {
    return this.active;
  }

  get isBackground(): boolean {
    return this.hidden;
  }

  /** MIME, с которым реально работает MediaRecorder (пусто = браузер по умолчанию). */
  get recorderMimeType(): string {
    return this.recorderMimeUsed;
  }

  get elapsedSec(): number {
    if (!this.startedAt) return 0;
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  /** Нормализованный уровень громкости микрофона 0…1 для визуализации. */
  getAudioLevel(): number {
    const analyser = this.analyser;
    const buf = this.levelBuffer;
    if (!analyser || !buf || !this.active) return 0;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    return Math.min(1, rms * 4.2);
  }

  /**
   * @param micStream Promise, созданный синхронно в обработчике клика (iOS standalone PWA).
   */
  async start(title?: string, micStream?: Promise<MediaStream>): Promise<void> {
    if (this.active) return;
    if (!navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('Браузер не поддерживает запись с микрофона.');
    }

    this.sessionTitle = String(title || 'Запись встречи').trim() || 'Запись встречи';
    this.stopping = false;
    this.mimeType = pickRecorderMimeType();

    const stream = micStream
      ? await micStream
      : await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
    this.stream = stream;
    this.attachTrackGuards(stream);
    this.setupKeepAliveAudio(stream);
    this.setupMediaSession();
    this.bindLifecycle();

    this.active = true;
    this.startedAt = Date.now();
    this.startRecorder(sliceMs(this.hidden));
    this.restartTimers();
  }

  async stop(): Promise<void> {
    if (!this.active || this.stopping) return;
    this.stopping = true;
    this.clearTimers();
    this.unbindLifecycle();
    this.clearMediaSession();

    this.finalizing = true;
    const recorder = this.recorder;
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          /** iOS Safari: dataavailable часто после onstop — даём время onChunk с isFinal. */
          window.setTimeout(resolve, isIos() ? 450 : 120);
        };
        recorder.onstop = () => done();
        try {
          recorder.requestData();
        } catch {
          /* ignore */
        }
        try {
          recorder.stop();
        } catch {
          done();
        }
        window.setTimeout(done, isIos() ? 1600 : 900);
      });
    }
    /** Финальный сигнал для склейки буфера на iOS (dataavailable часто пустой). */
    this.handlers.onChunk(
      new Blob([], { type: this.recorderMimeUsed || this.mimeType || 'audio/mp4' }),
      true,
      this.recorderMimeUsed || this.mimeType,
    );
    if (isIos()) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 280));
    }
    this.finalizing = false;
    this.recorder = null;

    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;

    if (this.audioCtx) {
      try {
        await this.audioCtx.close();
      } catch {
        /* ignore */
      }
      this.audioCtx = null;
    }
    this.analyser = null;
    this.levelBuffer = null;

    this.active = false;
    this.stopping = false;
    this.startedAt = null;
  }

  dispose(): void {
    void this.stop();
  }

  private attachTrackGuards(stream: MediaStream): void {
    for (const track of stream.getAudioTracks()) {
      track.onended = () => {
        if (!this.active || this.stopping) return;
        this.handlers.onError('Микрофон был отключён системой. Откройте вкладку и начните запись заново.');
        void this.stop();
      };
    }
  }

  /** Тихий AudioContext помогает не «заморозить» аудиопоток при сворачивании вкладки. */
  private setupKeepAliveAudio(stream: MediaStream): void {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      void ctx.resume();
      this.audioCtx = ctx;
      this.analyser = analyser;
      this.levelBuffer = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      /* ignore */
    }
  }

  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.sessionTitle,
        artist: 'Пульс · протокол',
        album: 'Запись встречи',
      });
      navigator.mediaSession.playbackState = 'playing';
    } catch {
      /* ignore */
    }
  }

  private clearMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    } catch {
      /* ignore */
    }
  }

  private bindLifecycle(): void {
    this.boundVisibility = () => {
      const nowHidden = document.visibilityState === 'hidden';
      if (nowHidden === this.hidden) return;
      this.hidden = nowHidden;
      this.handlers.onBackgroundChange?.(nowHidden);
      this.flushPending();
      this.restartRecorderWithSlice(sliceMs(nowHidden));
      this.restartTimers();
      if (!nowHidden && this.audioCtx?.state === 'suspended') {
        void this.audioCtx.resume();
      }
    };
    this.boundPageHide = () => {
      this.hidden = true;
      this.handlers.onBackgroundChange?.(true);
      this.flushPending();
      this.restartRecorderWithSlice(sliceMs(true));
      this.restartTimers();
    };
    this.boundPageShow = () => {
      this.hidden = document.visibilityState === 'hidden';
      this.handlers.onBackgroundChange?.(this.hidden);
      this.ensureRecorderRunning();
      if (this.audioCtx?.state === 'suspended') void this.audioCtx.resume();
      this.restartTimers();
    };
    this.boundFreeze = () => {
      this.flushPending();
    };
    this.boundResume = () => {
      this.ensureRecorderRunning();
      if (this.audioCtx?.state === 'suspended') void this.audioCtx.resume();
    };

    document.addEventListener('visibilitychange', this.boundVisibility);
    window.addEventListener('pagehide', this.boundPageHide);
    window.addEventListener('pageshow', this.boundPageShow);
    document.addEventListener('freeze', this.boundFreeze as EventListener);
    document.addEventListener('resume', this.boundResume as EventListener);
  }

  private unbindLifecycle(): void {
    if (this.boundVisibility) document.removeEventListener('visibilitychange', this.boundVisibility);
    if (this.boundPageHide) window.removeEventListener('pagehide', this.boundPageHide);
    if (this.boundPageShow) window.removeEventListener('pageshow', this.boundPageShow);
    if (this.boundFreeze) document.removeEventListener('freeze', this.boundFreeze as EventListener);
    if (this.boundResume) document.removeEventListener('resume', this.boundResume as EventListener);
    this.boundVisibility = null;
    this.boundPageHide = null;
    this.boundPageShow = null;
    this.boundFreeze = null;
    this.boundResume = null;
  }

  private clearTimers(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.flushTimer = null;
    this.healthTimer = null;
  }

  private restartTimers(): void {
    this.clearTimers();
    if (!this.active) return;
    const flushMs = this.usesIosTimeslice()
      ? IOS_RECORDER_TIMESLICE_MS + 2000
      : flushIntervalMs(this.hidden);
    this.flushTimer = setInterval(() => this.flushPending(), flushMs);
    this.healthTimer = setInterval(() => this.ensureRecorderRunning(), HEALTH_CHECK_MS);
  }

  private usesIosTimeslice(): boolean {
    return isIos();
  }

  private flushPending(): void {
    if (!this.active || this.stopping) return;
    if (this.audioCtx?.state === 'suspended') void this.audioCtx.resume();
    if (this.usesIosTimeslice()) {
      const rec = this.recorder;
      if (rec?.state === 'recording') {
        try {
          rec.requestData();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    /** requestData даёт обрывки без EBML — перезапуск MediaRecorder отдаёт целый webm. */
    this.restartRecorderWithSlice(sliceMs(this.hidden));
  }

  private startRecorder(timesliceMs: number): void {
    if (!this.stream || this.stopping) return;
    const liveTracks = this.stream.getAudioTracks().filter((t) => t.readyState === 'live' && t.enabled);
    if (!liveTracks.length) {
      this.handlers.onError('Микрофон недоступен — откройте вкладку и перезапустите запись.');
      return;
    }

    const prev = this.recorder;
    if (prev && prev.state === 'recording') {
      void this.finalizePreviousRecorder(prev).then(() => {
        if (!this.active || this.stopping) return;
        this.attachNewRecorder(timesliceMs);
      });
      return;
    }

    this.attachNewRecorder(timesliceMs);
  }

  /** Дождаться ondataavailable после stop — иначе webm без заголовка EBML. */
  private finalizePreviousRecorder(prev: MediaRecorder): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const timer = window.setTimeout(done, 600);
      prev.addEventListener(
        'stop',
        () => {
          window.clearTimeout(timer);
          window.setTimeout(done, 80);
        },
        { once: true },
      );
      try {
        prev.requestData();
      } catch {
        /* ignore */
      }
      try {
        prev.stop();
      } catch {
        window.clearTimeout(timer);
        done();
      }
    });
  }

  private attachNewRecorder(_sliceHintMs: number): void {
    if (!this.stream || this.stopping) return;
    if (this.recorder?.state === 'recording') return;

    let recorder: MediaRecorder;
    try {
      recorder = createMediaRecorder(this.stream, this.mimeType);
      this.recorderMimeUsed =
        mimeTypeFromRecorderChoice(recorder.mimeType || this.mimeType) || this.mimeType;
    } catch (e) {
      this.handlers.onError(
        e instanceof Error ? e.message : 'Не удалось запустить запись (проверьте доступ к микрофону)',
      );
      return;
    }
    const generation = ++this.recorderGeneration;
    recorder.ondataavailable = (ev: BlobEvent) => {
      if (generation !== this.recorderGeneration) return;
      if (ev.data && ev.data.size > 0) {
        this.handlers.onChunk(
          ev.data,
          this.finalizing,
          this.recorderMimeUsed || this.mimeType,
        );
      }
    };
    recorder.onerror = () => {
      if (!this.active || this.stopping) return;
      this.handlers.onError('Ошибка записи — пробуем продолжить…');
      window.setTimeout(() => this.ensureRecorderRunning(), 400);
    };
    recorder.onstop = () => {
      if (this.stopping || !this.active) return;
      if (this.recorder !== recorder) return;
      window.setTimeout(() => this.ensureRecorderRunning(), 300);
    };
    this.recorder = recorder;
    try {
      if (this.usesIosTimeslice()) {
        recorder.start(IOS_RECORDER_TIMESLICE_MS);
      } else {
        /** Без timeslice: фрагменты только при stop/перезапуске — целые webm с заголовком. */
        recorder.start();
      }
    } catch (e) {
      this.handlers.onError(e instanceof Error ? e.message : 'Не удалось продолжить запись');
    }
  }

  private restartRecorderWithSlice(timesliceMs: number): void {
    if (!this.active || this.stopping || this.usesIosTimeslice()) return;
    this.startRecorder(timesliceMs);
  }

  private ensureRecorderRunning(): void {
    if (!this.active || this.stopping || !this.stream) return;
    const state = this.recorder?.state;
    if (state === 'recording') return;
    if (this.usesIosTimeslice()) {
      this.startRecorder(IOS_RECORDER_TIMESLICE_MS);
      return;
    }
    this.startRecorder(sliceMs(this.hidden));
  }
}
