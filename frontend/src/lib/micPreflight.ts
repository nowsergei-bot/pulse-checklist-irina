import { humanizeMicAccessError } from './pwaMic';
import { getSpeechDictationUnsupportedReason } from './speechDictation';

export type MicPreflightResult = {
  checking: boolean;
  micAvailable: boolean;
  micBlockedReason: string | null;
};

/** Что нужно полю PublicDictationField (Web Speech или серверная STT на iOS). */
export function getPublicDictationUnsupportedReason(): string | null {
  return getSpeechDictationUnsupportedReason();
}

async function queryMicrophonePermission(): Promise<PermissionState | 'unknown'> {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

/** Быстрая проверка: микрофон уже разрешён и поток открывается. */
async function probeGrantedMicrophone(): Promise<{ ok: boolean; reason: string | null }> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true, reason: null };
  } catch (err) {
    return { ok: false, reason: humanizeMicAccessError(err) };
  }
}

/**
 * Проверка микрофона при загрузке (без запроса разрешения, если статус «спросить»).
 */
export async function runMicPreflight(): Promise<Pick<MicPreflightResult, 'micAvailable' | 'micBlockedReason'>> {
  const unsupported = getPublicDictationUnsupportedReason();
  if (unsupported) {
    return { micAvailable: false, micBlockedReason: unsupported };
  }

  const perm = await queryMicrophonePermission();
  if (perm === 'denied') {
    return {
      micAvailable: false,
      micBlockedReason: humanizeMicAccessError({ name: 'NotAllowedError' }),
    };
  }

  if (perm === 'granted') {
    const probe = await probeGrantedMicrophone();
    if (!probe.ok) {
      return { micAvailable: false, micBlockedReason: probe.reason };
    }
  }

  return { micAvailable: true, micBlockedReason: null };
}
