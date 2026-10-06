import { useEffect, useState } from 'react';
import { yieldToMain } from './yieldToMain';

/** Пошагово монтирует тяжёлые секции карточки, отдавая main thread между шагами. */
export function useProgressiveMountSteps(stepCount: number, enabled: boolean, resetKey: string): number {
  const [step, setStep] = useState(() => (enabled ? 0 : stepCount));

  useEffect(() => {
    if (!enabled) {
      setStep(stepCount);
      return;
    }
    setStep(0);
    let cancelled = false;
    void (async () => {
      for (let i = 1; i <= stepCount && !cancelled; i++) {
        await yieldToMain();
        if (cancelled) return;
        setStep(i);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, stepCount, resetKey]);

  return enabled ? step : stepCount;
}
