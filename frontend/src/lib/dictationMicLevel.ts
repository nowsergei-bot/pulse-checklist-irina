const BAR_COUNT = 5;

export type DictationMicLevelMonitor = {
  getLevel: () => number;
  getBarLevels: () => readonly number[];
  dispose: () => void;
};

function computeRmsLevel(analyser: AnalyserNode, buffer: Uint8Array): number {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = (buffer[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / buffer.length);
  return Math.min(1, rms * 4.2);
}

/**
 * Анализатор громкости микрофона для эквалайзера и пульса иконки.
 */
export function createDictationMicLevelMonitor(
  stream: MediaStream,
  onFrame?: (level: number, bars: readonly number[]) => void,
): DictationMicLevelMonitor {
  let disposed = false;
  let level = 0;
  const barLevels = new Array<number>(BAR_COUNT).fill(0);
  let rafId = 0;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let buffer: Uint8Array | null = null;
  let phase = 0;

  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      audioCtx = new Ctx();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(audioCtx.destination);
      void audioCtx.resume();
      buffer = new Uint8Array(analyser.frequencyBinCount);
    }
  } catch {
    /* ignore */
  }

  const tick = () => {
    if (disposed) return;
    if (analyser && buffer) {
      level = computeRmsLevel(analyser, buffer);
    } else {
      level = 0.12 + Math.abs(Math.sin(phase * 0.09)) * 0.08;
    }
    phase += 1;
    for (let i = 0; i < BAR_COUNT; i++) {
      const wobble = 0.65 + 0.35 * Math.sin(phase * 0.11 + i * 1.4);
      barLevels[i] = Math.min(1, level * wobble * (0.85 + i * 0.04));
    }
    onFrame?.(level, barLevels);
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return {
    getLevel: () => level,
    getBarLevels: () => barLevels,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(rafId);
      try {
        audioCtx?.close();
      } catch {
        /* ignore */
      }
      audioCtx = null;
      analyser = null;
      buffer = null;
    },
  };
}
