import { isIos, isStandalone } from './pwaInstall';

/** Опции микрофона (запись встречи, диктовка в опросе). */
export const MEETING_MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

function meetingAudioConstraints(deviceId?: string): MediaTrackConstraints {
  const base =
    typeof MEETING_MIC_CONSTRAINTS.audio === 'object' && MEETING_MIC_CONSTRAINTS.audio
      ? { ...MEETING_MIC_CONSTRAINTS.audio }
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (deviceId) {
    return { ...base, deviceId: { exact: deviceId } };
  }
  return base;
}

function isMicDenied(err: unknown): boolean {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return name === 'NotAllowedError' || /not allowed|permission denied|denied/i.test(msg);
}

/** Сообщение при отказе/блокировке микрофона; для PWA на iOS — отдельные шаги в Настройках. */
export function humanizeMicAccessError(err: unknown): string {
  if (!isMicDenied(err)) {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return msg.trim() || 'Не удалось получить доступ к микрофону.';
  }

  if (isStandalone() && isIos()) {
    return (
      'Микрофон заблокирован для приложения «Пульс» с главного экрана. ' +
      'Настройки iPhone → «Пульс» → Микрофон → включить. ' +
      'Либо откройте сайт в Safari, разрешите микрофон, затем снова «На экран Домой».'
    );
  }

  if (isStandalone()) {
    return (
      'Микрофон заблокирован для приложения с главного экрана. ' +
      'Разрешите доступ в настройках системы для «Пульс» или откройте сайт в обычном браузере.'
    );
  }

  return 'Разрешите доступ к микрофону в настройках браузера и повторите действие.';
}

/**
 * Запросить микрофон в том же синхронном обработчике клика (до await).
 * На iOS PWA иначе getUserMedia отклоняется после любых await (health check, React state).
 */
export function requestMicrophoneInUserGesture(deviceId?: string): Promise<MediaStream> {
  if (!navigator?.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('Браузер не поддерживает запись с микрофона.'));
  }
  const constraints: MediaStreamConstraints = {
    audio: meetingAudioConstraints(deviceId),
  };
  return navigator.mediaDevices.getUserMedia(constraints).catch((e) => {
    throw new Error(humanizeMicAccessError(e));
  });
}

/** iOS PWA: getUserMedia в том же клике, иначе SpeechRecognition → not-allowed. */
export function needsIosPwaMicPrime(): boolean {
  return isIos() && isStandalone();
}

/**
 * Safari / iOS: микрофон и SpeechRecognition в одном жесте, распознавание после потока.
 */
export function needsIosMicPrimeBeforeSpeech(): boolean {
  return isIos();
}

/** @alias requestMicrophoneInUserGesture — запись встречи на /audio-protocol */
export function requestMeetingMicrophoneInGesture(deviceId?: string): Promise<MediaStream> {
  return requestMicrophoneInUserGesture(deviceId);
}
