import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useVoiceFormFillContext } from '../contexts/VoiceFormFillContext';
import { useMicPreflight } from '../hooks/useMicPreflight';
import { DictationClipRecorder, MIN_DICTATION_RECORDING_MS } from '../lib/dictationClipRecorder';
import { createDictationMicLevelMonitor } from '../lib/dictationMicLevel';
import { transcribeDictationClip } from '../lib/dictationServerStt';
import { getPublicDictationUnsupportedReason } from '../lib/micPreflight';
import { isIos, isStandalone, prefersDictationRecordingOverlay } from '../lib/pwaInstall';
import { needsIosMicPrimeBeforeSpeech, requestMicrophoneInUserGesture } from '../lib/pwaMic';
import {
  appendDictationTranscript,
  beginDictationSession,
  createDictationAppendState,
  dictationPauseBeforeFinal,
  disposeSharedSpeechRecognition,
  effectiveDictationUsesServerStt,
  humanizeSpeechRecognitionError,
  polishDictatedRussian,
  resetDictationAppendState,
  startSpeechRecognition,
  type SpeechRecognitionInstance,
} from '../lib/speechDictation';
import { humanizePublicFormError } from '../lib/humanizePublicFormError';
import DictationRecordingOverlay from './DictationRecordingOverlay';

const DEFAULT_BAR_LEVELS = [0, 0, 0, 0, 0] as const;
const CONNECTING_TIMEOUT_MS = 5000;

type Props = {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  lang?: string;
  autoPolishOnStop?: boolean;
  showPolishButton?: boolean;
  /** Скрыть полноэкранный оверлей записи (режим «Заполнить голосом»). */
  hideOverlay?: boolean;
};

export default function PublicDictationField({
  value,
  onChange,
  multiline = true,
  placeholder,
  className = '',
  inputClassName = '',
  lang = 'ru-RU',
  autoPolishOnStop = true,
  showPolishButton = true,
  hideOverlay = false,
}: Props) {
  const fieldId = useId();
  const voiceFormFill = useVoiceFormFillContext();
  const voiceFormModeActive = voiceFormFill?.active === true || hideOverlay;
  const unsupportedReason = getPublicDictationUnsupportedReason();
  const micPreflight = useMicPreflight();
  const useRecordingOverlay = prefersDictationRecordingOverlay() && !voiceFormModeActive;
  const usesServerStt = effectiveDictationUsesServerStt();

  const micAvailable =
    unsupportedReason == null && micPreflight.micAvailable && !micPreflight.checking;
  const micDisabledReason =
    unsupportedReason ?? micPreflight.micBlockedReason ?? 'Голосовой ввод недоступен';

  const [listening, setListening] = useState(false);
  const [preparingMic, setPreparingMic] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [interimPreview, setInterimPreview] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [barLevels, setBarLevels] = useState<number[]>([...DEFAULT_BAR_LEVELS]);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const [stopTooEarly, setStopTooEarly] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [polishNote, setPolishNote] = useState<string | null>(null);

  const ownerRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const pendingInterimRef = useRef('');
  const appendStateRef = useRef(createDictationAppendState());
  const dictatedThisSessionRef = useRef(false);
  const userStopRequestedRef = useRef(false);
  const iosRestartingRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const clipRecorderRef = useRef<DictationClipRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const levelMonitorRef = useRef<ReturnType<typeof createDictationMicLevelMonitor> | null>(null);
  const connectingTimeoutRef = useRef(0);
  const polishNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idlePulseRafRef = useRef(0);
  const voiceFormWasActiveRef = useRef(false);

  onChangeRef.current = onChange;
  valueRef.current = value;

  const stopMicStream = useCallback(() => {
    levelMonitorRef.current?.dispose();
    levelMonitorRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setMicLevel(0);
    setBarLevels([...DEFAULT_BAR_LEVELS]);
  }, []);

  const attachLevelMonitor = useCallback((stream: MediaStream) => {
    levelMonitorRef.current?.dispose();
    levelMonitorRef.current = createDictationMicLevelMonitor(stream, (level, bars) => {
      setMicLevel(level);
      setBarLevels([...bars]);
    });
  }, []);

  const showPolishFeedback = useCallback((message: string) => {
    if (polishNoteTimerRef.current) clearTimeout(polishNoteTimerRef.current);
    setPolishNote(message);
    polishNoteTimerRef.current = setTimeout(() => setPolishNote(null), 3200);
  }, []);

  const applyPolish = useCallback(
    (raw?: string, options?: { quiet?: boolean }) => {
      const src = raw ?? valueRef.current;
      const next = polishDictatedRussian(src, { multiline });
      if (next !== src) {
        onChangeRef.current(next);
        if (!options?.quiet) {
          showPolishFeedback('Текст улучшен: пунктуация, орфография и логика фраз');
        }
      } else if (!options?.quiet) {
        showPolishFeedback('Изменений не требуется — текст уже в порядке');
      }
      return next;
    },
    [multiline, showPolishFeedback],
  );

  const appendFinalSegment = useCallback(
    (transcript: string) => {
      const pause = dictationPauseBeforeFinal(appendStateRef.current);
      const next = appendDictationTranscript(valueRef.current, transcript, pause, { multiline });
      dictatedThisSessionRef.current = true;
      onChangeRef.current(next);
    },
    [multiline],
  );

  const flushInterim = useCallback(() => {
    const interim = pendingInterimRef.current.trim();
    pendingInterimRef.current = '';
    setInterimPreview('');
    if (!interim) return;
    appendFinalSegment(interim);
  }, [appendFinalSegment]);

  const clearConnectingTimeout = useCallback(() => {
    if (connectingTimeoutRef.current) {
      window.clearTimeout(connectingTimeoutRef.current);
      connectingTimeoutRef.current = 0;
    }
  }, []);

  const release = useCallback(() => {
    clearConnectingTimeout();
    clipRecorderRef.current?.cancel();
    clipRecorderRef.current = null;
    ownerRef.current = null;
    recognitionRef.current = null;
    iosRestartingRef.current = false;
    stopMicStream();
    setListening(false);
    setPreparingMic(false);
    setTranscribing(false);
    setShowOverlay(false);
    setInterimPreview('');
    setOverlayError(null);
    setStopTooEarly(false);
    if (idlePulseRafRef.current) {
      cancelAnimationFrame(idlePulseRafRef.current);
      idlePulseRafRef.current = 0;
    }
  }, [clearConnectingTimeout, stopMicStream]);

  const armConnectingTimeout = useCallback(() => {
    clearConnectingTimeout();
    connectingTimeoutRef.current = window.setTimeout(() => {
      connectingTimeoutRef.current = 0;
      if (ownerRef.current !== fieldId) return;
      const msg =
        'Не удалось подключить микрофон за 5 секунд. Разрешите микрофон (Настройки iPhone → «Пульс» → Микрофон) или откройте форму по HTTPS.';
      setHint(msg);
      setOverlayError(msg);
      clipRecorderRef.current?.cancel();
      clipRecorderRef.current = null;
      release();
    }, CONNECTING_TIMEOUT_MS);
  }, [clearConnectingTimeout, fieldId, release]);

  const maybeAutoPolish = useCallback(() => {
    if (!autoPolishOnStop || !dictatedThisSessionRef.current) return;
    applyPolish(undefined, { quiet: true });
    dictatedThisSessionRef.current = false;
  }, [applyPolish, autoPolishOnStop]);

  const stopServerStt = useCallback(async () => {
    userStopRequestedRef.current = true;
    if (ownerRef.current !== fieldId) return;

    const recorder = clipRecorderRef.current;
    clipRecorderRef.current = null;
    clearConnectingTimeout();

    if (!recorder) {
      release();
      return;
    }

    setListening(false);
    setPreparingMic(false);
    setTranscribing(true);

    try {
      const clip = await recorder.stop();
      stopMicStream();
      const text = await transcribeDictationClip(clip.blob, clip.filename, (status) => {
        setInterimPreview(status);
      });
      dictatedThisSessionRef.current = true;
      appendFinalSegment(text);
      maybeAutoPolish();
    } catch (err) {
      const msg = humanizePublicFormError(err, { fallback: 'Не удалось распознать речь.' });
      setHint(msg);
      setOverlayError(msg);
    } finally {
      setTranscribing(false);
      release();
    }
  }, [
    appendFinalSegment,
    clearConnectingTimeout,
    fieldId,
    maybeAutoPolish,
    release,
    stopMicStream,
  ]);

  const stop = useCallback(() => {
    if (usesServerStt) {
      const elapsed = clipRecorderRef.current?.getElapsedMs() ?? 0;
      if (elapsed > 0 && elapsed < MIN_DICTATION_RECORDING_MS) return;
      void stopServerStt();
      return;
    }
    userStopRequestedRef.current = true;
    const recognition = recognitionRef.current;
    if (!recognition || ownerRef.current !== fieldId) return;
    flushInterim();
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
    }
    release();
  }, [fieldId, flushInterim, release, stopServerStt, usesServerStt]);

  const startServerStt = useCallback(() => {
    setHint(null);
    setPolishNote(null);
    setOverlayError(null);
    pendingInterimRef.current = '';
    setInterimPreview('');
    resetDictationAppendState(appendStateRef.current);
    userStopRequestedRef.current = false;
    ownerRef.current = fieldId;

    if (useRecordingOverlay && !voiceFormModeActive) {
      setShowOverlay(true);
    }
    setPreparingMic(true);
    armConnectingTimeout();

    const recorder = new DictationClipRecorder();
    clipRecorderRef.current = recorder;

    requestMicrophoneInUserGesture()
      .then(async (stream) => {
        if (ownerRef.current !== fieldId) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        clearConnectingTimeout();
        micStreamRef.current = stream;
        attachLevelMonitor(stream);
        await recorder.start(stream);
        if (ownerRef.current !== fieldId) return;
        setPreparingMic(false);
        setListening(true);
      })
      .catch((err) => {
        clearConnectingTimeout();
        if (ownerRef.current !== fieldId) return;
        const msg = humanizePublicFormError(err, { fallback: 'Не удалось получить доступ к микрофону.' });
        setHint(msg);
        setOverlayError(msg);
        clipRecorderRef.current?.cancel();
        clipRecorderRef.current = null;
        release();
      });
  }, [armConnectingTimeout, attachLevelMonitor, clearConnectingTimeout, fieldId, release, useRecordingOverlay, voiceFormModeActive]);

  const start = useCallback(() => {
    if (!micAvailable) {
      setHint(micDisabledReason);
      return;
    }

    if (usesServerStt) {
      startServerStt();
      return;
    }

    const recognition = beginDictationSession(lang);
    if (!recognition) {
      setHint(getPublicDictationUnsupportedReason() ?? 'Диктовка недоступна в этом браузере.');
      return;
    }

    setHint(null);
    setPolishNote(null);
    setOverlayError(null);
    pendingInterimRef.current = '';
    setInterimPreview('');
    resetDictationAppendState(appendStateRef.current);
    userStopRequestedRef.current = false;
    ownerRef.current = fieldId;
    recognitionRef.current = recognition;

    if (useRecordingOverlay && !voiceFormModeActive) {
      setShowOverlay(true);
    }
    setPreparingMic(true);
    armConnectingTimeout();

    const primeMic = needsIosMicPrimeBeforeSpeech();

    const beginListening = () => {
      recognition.onstart = () => {
        if (ownerRef.current !== fieldId) return;
        clearConnectingTimeout();
        setPreparingMic(false);
        setListening(true);
      };

      try {
        startSpeechRecognition(recognition);
        if (!primeMic) {
          clearConnectingTimeout();
          setPreparingMic(false);
          setListening(true);
        } else {
          window.setTimeout(() => {
            if (ownerRef.current !== fieldId) return;
            clearConnectingTimeout();
            setPreparingMic(false);
            setListening(true);
          }, 900);
        }
      } catch {
        setHint('Не удалось запустить диктовку. Нажмите кнопку микрофона ещё раз.');
        release();
      }
    };

    recognition.onresult = (event) => {
      if (ownerRef.current !== fieldId) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          appendFinalSegment(transcript);
          pendingInterimRef.current = '';
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        pendingInterimRef.current = interim;
        setInterimPreview(interim);
      }
    };

    recognition.onerror = (event) => {
      if (ownerRef.current !== fieldId) return;
      if (event.error === 'aborted' && iosRestartingRef.current) return;
      if (event.error === 'aborted' || event.error === 'no-speech') {
        release();
        return;
      }
      const msg = humanizeSpeechRecognitionError(event.error);
      setHint(msg);
      setOverlayError(msg);
      release();
    };

    recognition.onend = () => {
      if (ownerRef.current !== fieldId) return;
      flushInterim();

      if (isIos() && !userStopRequestedRef.current) {
        iosRestartingRef.current = true;
        try {
          startSpeechRecognition(recognition);
          iosRestartingRef.current = false;
          return;
        } catch {
          iosRestartingRef.current = false;
        }
      }

      release();
      maybeAutoPolish();
    };

    if (primeMic) {
      requestMicrophoneInUserGesture()
        .then((stream) => {
          if (ownerRef.current !== fieldId) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          micStreamRef.current = stream;
          attachLevelMonitor(stream);
          beginListening();
        })
        .catch((err) => {
          if (ownerRef.current !== fieldId) return;
          const msg = humanizePublicFormError(err, { fallback: 'Не удалось получить доступ к микрофону.' });
          setHint(msg);
          setOverlayError(msg);
          release();
        });
      return;
    }

    beginListening();
  }, [
    appendFinalSegment,
    armConnectingTimeout,
    attachLevelMonitor,
    clearConnectingTimeout,
    fieldId,
    flushInterim,
    lang,
    maybeAutoPolish,
    micAvailable,
    micDisabledReason,
    release,
    startServerStt,
    useRecordingOverlay,
    usesServerStt,
    voiceFormModeActive,
  ]);

  const toggle = useCallback(() => {
    if (transcribing) return;
    if (listening || preparingMic) stop();
    else start();
  }, [listening, preparingMic, start, stop, transcribing]);

  const onPolishClick = useCallback(() => {
    applyPolish();
  }, [applyPolish]);

  useEffect(() => {
    return () => {
      if (polishNoteTimerRef.current) clearTimeout(polishNoteTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!voiceFormModeActive) {
      voiceFormWasActiveRef.current = false;
      return;
    }
    setShowOverlay(false);
    const justActivated = !voiceFormWasActiveRef.current;
    voiceFormWasActiveRef.current = true;
    if (justActivated && ownerRef.current === fieldId) {
      userStopRequestedRef.current = true;
      release();
    }
  }, [fieldId, release, voiceFormModeActive]);

  useEffect(() => {
    if (!listening || !usesServerStt) {
      setStopTooEarly(false);
      return;
    }
    const tick = () => {
      const elapsed = clipRecorderRef.current?.getElapsedMs() ?? 0;
      setStopTooEarly(elapsed < MIN_DICTATION_RECORDING_MS);
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [listening, usesServerStt]);

  useEffect(() => {
    if (!listening || micStreamRef.current) return;
    let phase = 0;
    const tick = () => {
      phase += 1;
      const level = 0.14 + Math.abs(Math.sin(phase * 0.09)) * 0.18;
      setMicLevel(level);
      setBarLevels(DEFAULT_BAR_LEVELS.map((_, i) => level * (0.7 + i * 0.06)));
      idlePulseRafRef.current = requestAnimationFrame(tick);
    };
    idlePulseRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (idlePulseRafRef.current) cancelAnimationFrame(idlePulseRafRef.current);
      idlePulseRafRef.current = 0;
    };
  }, [listening]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && ownerRef.current === fieldId) stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (ownerRef.current === fieldId) {
        disposeSharedSpeechRecognition();
        ownerRef.current = null;
      }
    };
  }, [fieldId, stop]);

  const busy = listening || preparingMic || transcribing;
  const canPolish = showPolishButton && value.trim().length > 0 && !busy && !voiceFormModeActive;
  const micDisabled = !micAvailable || voiceFormModeActive;
  const showPwaMicHint = isStandalone() && isIos() && !busy && !hint && micAvailable;
  const micPulse = busy ? 0.35 + micLevel * 0.65 : 0;
  const micTitle = voiceFormModeActive
    ? 'Голосовое заполнение формы активно — используйте плавающий микрофон'
    : !micAvailable
      ? micDisabledReason
      : listening
        ? 'Остановить диктовку'
        : 'Наговорить ответ (нажмите, не удерживайте)';

  const field = multiline ? (
    <textarea
      className={inputClassName}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ) : (
    <input
      type="text"
      className={inputClassName || 'public-other-input'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );

  return (
    <div className={`public-dictation-wrap ${className}`.trim()}>
      {field}
      <div className="public-dictation-toolbar">
        <button
          type="button"
          className={`public-dictation-mic${listening ? ' is-active' : ''}${busy ? ' is-pulsing' : ''}`}
          style={{ '--dictation-mic-pulse': String(micPulse) } as CSSProperties}
          onClick={toggle}
          disabled={micDisabled}
          aria-pressed={listening}
          aria-disabled={micDisabled}
          aria-label={
            voiceFormModeActive
              ? 'Микрофон поля недоступен — активен режим голосового заполнения формы'
              : !micAvailable
                ? 'Голосовой ввод недоступен'
                : listening
                  ? 'Остановить диктовку'
                  : 'Наговорить ответ'
          }
          title={micTitle}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path
              fill="currentColor"
              d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"
            />
          </svg>
        </button>

        {busy && !useRecordingOverlay && (
          <div className="public-dictation-inline-eq" aria-hidden>
            {barLevels.map((h, i) => (
              <span
                key={i}
                className="public-dictation-inline-eq__bar"
                style={{ transform: `scaleY(${0.15 + h * 0.85})` }}
              />
            ))}
          </div>
        )}

        {canPolish && (
          <button
            type="button"
            className="public-dictation-polish"
            onClick={onPolishClick}
            aria-label="Улучшить текст: пунктуация, орфография и логика фраз"
            title="Пунктуация, орфография и логическое достраивание фраз (без отправки на сервер)"
          >
            Улучшить текст (пунктуация, орфография и логика)
          </button>
        )}
        {micPreflight.checking && (
          <span className="public-dictation-status">Проверка микрофона…</span>
        )}
        {!useRecordingOverlay && preparingMic && (
          <span className="public-dictation-status">Разрешите микрофон…</span>
        )}
        {!useRecordingOverlay && listening && (
          <span className="public-dictation-status">Слушаю… нажмите ещё раз, чтобы остановить</span>
        )}
        {!micAvailable && !micPreflight.checking && (
          <span className="public-dictation-status">{micDisabledReason}</span>
        )}
      </div>

      {!voiceFormModeActive ? (
        <DictationRecordingOverlay
          open={showOverlay}
          connecting={preparingMic}
          transcribing={transcribing}
          stopDisabled={listening && stopTooEarly}
          interimText={interimPreview}
          barLevels={barLevels}
          micLevel={micLevel}
          errorMessage={overlayError}
          onStop={stop}
          fullscreen={useRecordingOverlay}
        />
      ) : null}

      {showPwaMicHint ? (
        <p className="public-dictation-hint muted">
          Приложение с главного экрана: если микрофон не работает — Настройки iPhone → «Пульс» → Микрофон.
        </p>
      ) : null}
      {polishNote && <p className="public-dictation-hint muted">{polishNote}</p>}
      {hint && <p className="public-dictation-hint err">{hint}</p>}
    </div>
  );
}
