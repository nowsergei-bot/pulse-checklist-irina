import { useEffect, useRef } from 'react';
import type { EaDirectoryStudent } from './types';
import { invalidateSharedEaMe } from './sharedMe';
import { invalidateSharedEaDirectory, invalidateSharedEaGroups } from './sharedResources';

export const EA_LIVE_EVENT = 'ea-live';

export type EaLiveDetail =
  | { kind: 'roster'; groupId: number; students: EaDirectoryStudent[] }
  | { kind: 'specs' }
  | { kind: 'scores' }
  | { kind: 'placement' };

export function emitEaLive(detail: EaLiveDetail) {
  invalidateSharedEaMe();
  invalidateSharedEaDirectory();
  invalidateSharedEaGroups();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<EaLiveDetail>(EA_LIVE_EVENT, { detail }));
}

export function useEaLive(handler: (detail: EaLiveDetail) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onEvent = (event: Event) => {
      ref.current((event as CustomEvent<EaLiveDetail>).detail);
    };
    window.addEventListener(EA_LIVE_EVENT, onEvent);
    return () => window.removeEventListener(EA_LIVE_EVENT, onEvent);
  }, []);
}

export function asDirectoryStudents(rows: Array<Partial<EaDirectoryStudent> & { id?: number; full_name?: string }> | undefined): EaDirectoryStudent[] {
  return (rows || [])
    .filter((row) => row && row.id != null)
    .map((row) => ({
      id: Number(row.id),
      public_id: row.public_id,
      full_name: String(row.full_name || ''),
      birth_date: row.birth_date ?? null,
      sex: row.sex || 'unknown',
      campus: row.campus,
      class_label: row.class_label ?? null,
    }));
}
