import { useEffect, useState } from 'react';
import { type MicPreflightResult, runMicPreflight } from '../lib/micPreflight';

const INITIAL: MicPreflightResult = {
  checking: true,
  micAvailable: true,
  micBlockedReason: null,
};

export function useMicPreflight(): MicPreflightResult {
  const [state, setState] = useState<MicPreflightResult>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, checking: true }));

    runMicPreflight().then((result) => {
      if (cancelled) return;
      setState({
        checking: false,
        micAvailable: result.micAvailable,
        micBlockedReason: result.micBlockedReason,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
