import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import {
  beginCabinetLoad,
  endCabinetLoad,
  peekCabinetLoadHostMounted,
  subscribeCabinetLoadHost,
  updateCabinetLoad,
} from '../lib/cabinetLoadOverlay';
import { cabinetWaitLabel, resolveCabinetWaitKind, type CabinetWaitKind } from '../lib/cabinetWaitEta';

export function useCabinetLoadHostMounted(): boolean {
  return useSyncExternalStore(subscribeCabinetLoadHost, peekCabinetLoadHostMounted, () => false);
}

export function useCabinetLoadOverlay(opts: {
  active: boolean;
  kind?: CabinetWaitKind;
  label?: string;
  error?: string | null;
  immediate?: boolean;
}): void {
  const { pathname } = useLocation();
  const idRef = useRef<number | null>(null);
  const kind = opts.kind || resolveCabinetWaitKind(pathname);
  const label = opts.label?.trim() || cabinetWaitLabel(kind);
  const error = opts.error ?? null;
  const immediate = Boolean(opts.immediate);

  useEffect(() => {
    // Error/idle must end the ticket: a leftover ticket keeps .cab-wait-overlay--busy
    // on the stage and freezes every cabinet button (visit-checklist, surveys, …).
    const blocking = Boolean(opts.active) && !error;
    if (!blocking) {
      if (idRef.current != null) {
        endCabinetLoad(idRef.current);
        idRef.current = null;
      }
      return;
    }
    if (idRef.current == null) {
      idRef.current = beginCabinetLoad({ kind, label, pathname, error: null, immediate });
    } else {
      updateCabinetLoad(idRef.current, { kind, label, error: null, immediate });
    }
    return () => {
      if (idRef.current != null) {
        endCabinetLoad(idRef.current);
        idRef.current = null;
      }
    };
  }, [opts.active, kind, label, error, immediate, pathname]);
}
