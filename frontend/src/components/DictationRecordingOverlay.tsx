import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

export const DICTATION_OVERLAY_ROOT_ID = 'dictation-overlay-root';

function getDictationOverlayRoot(): HTMLElement {
  let root = document.getElementById(DICTATION_OVERLAY_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = DICTATION_OVERLAY_ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
  }
  return root;
}

type Props = {
  open: boolean;
  /** Подключение микрофона / ожидание распознавания. */
  connecting: boolean;
  /** Серверная расшифровка после остановки записи (iOS). */
  transcribing?: boolean;
  /** Ещё нельзя останавливать (короткая запись на iPhone). */
  stopDisabled?: boolean;
  interimText: string;
  barLevels: readonly number[];
  micLevel: number;
  errorMessage?: string | null;
  onStop: () => void;
  /** Полноэкранный режим (телефон / iOS). */
  fullscreen?: boolean;
};

export default function DictationRecordingOverlay({
  open,
  connecting,
  transcribing = false,
  stopDisabled = false,
  interimText,
  barLevels,
  micLevel,
  errorMessage,
  onStop,
  fullscreen = true,
}: Props) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    setPortalRoot(getDictationOverlayRoot());
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('dictation-overlay-open');
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.classList.remove('dictation-overlay-open');
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [open]);

  if (!open) return null;

  const title = connecting ? 'Подключение…' : transcribing ? 'Расшифровка…' : 'Идёт запись';
  const pulse = connecting || transcribing ? 0.35 : 0.35 + micLevel * 0.65;
  const rootClass = [
    'dictation-recording-overlay',
    fullscreen ? 'dictation-recording-overlay--fullscreen' : 'dictation-recording-overlay--compact',
  ].join(' ');

  const overlay = (
    <div className={rootClass} role="dialog" aria-modal="true" aria-labelledby="dictation-overlay-title">
      <div className="dictation-recording-overlay__panel">
        <div className="dictation-recording-overlay__content">
          <h2 id="dictation-overlay-title" className="dictation-recording-overlay__title">
            {title}
          </h2>
          <p className="dictation-recording-overlay__hint">
            Не надо зажимать кнопку. Нажмите ещё раз на микрофон, чтобы остановить.
          </p>

          <div
            className="dictation-recording-overlay__mic"
            style={{ '--dictation-mic-pulse': String(pulse) } as CSSProperties}
            aria-hidden
          >
            <svg viewBox="0 0 24 24" width="48" height="48">
              <path
                fill="currentColor"
                d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"
              />
            </svg>
          </div>

          <div className="dictation-recording-overlay__eq" aria-hidden>
            {barLevels.map((h, i) => (
              <span
                key={i}
                className="dictation-recording-overlay__eq-bar"
                style={{ transform: `scaleY(${0.12 + h * 0.88})` }}
              />
            ))}
          </div>

          <p className="dictation-recording-overlay__interim" aria-live="polite">
            {connecting
              ? 'Разрешите микрофон, если браузер спросит.'
              : transcribing
                ? interimText.trim() || 'Отправка на сервер и распознавание речи…'
                : interimText.trim() || 'Говорите… текст появится здесь.'}
          </p>

          {errorMessage ? <p className="dictation-recording-overlay__err">{errorMessage}</p> : null}
        </div>

        <div className="dictation-recording-overlay__footer">
          <button
            type="button"
            className="dictation-recording-overlay__stop"
            onClick={onStop}
            disabled={transcribing || stopDisabled}
          >
            {transcribing ? 'Расшифровка…' : stopDisabled ? 'Говорите ещё…' : 'Остановить запись'}
          </button>
        </div>
      </div>
    </div>
  );

  if (!portalRoot) return null;
  return createPortal(overlay, portalRoot);
}
