import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { setEaPreviewEmail, setEaPreviewTeacherId } from '../englishAssessment/preview';
import {
  JdPreviewContext,
  buildJdPreviewContext,
  getJdPreviewEmail,
  getJdPreviewStaffId,
  jdPreviewQuery,
  setJdPreviewEmail,
  setJdPreviewStaffId,
} from '../jobDescriptions/preview';

export type CabinetPreviewValue = {
  previewEmail: string | null;
  previewStaffId: number | null;
  isPreview: boolean;
  basePath: string;
  path: (suffix: string) => string;
  jdPath: (suffix: string) => string;
};

export const CabinetPreviewContext = createContext<CabinetPreviewValue>({
  previewEmail: null,
  previewStaffId: null,
  isPreview: false,
  basePath: '/cabinet',
  path: (suffix) => `/cabinet${suffix}`,
  jdPath: (suffix) => `/job-descriptions${suffix}`,
});

export function useCabinetPreview() {
  return useContext(CabinetPreviewContext);
}

export function cabinetPreviewQuery(email: string | null, staffId: number | null): string {
  return jdPreviewQuery(email, staffId);
}

export function cabinetAsHref(email: string | null, staffId: number | null): string {
  const q = cabinetPreviewQuery(email, staffId);
  return q ? `/cabinet/as${q}` : '/cabinet/as';
}

export function buildCabinetPreviewContext(
  previewEmail: string | null,
  previewStaffId: number | null = null,
): CabinetPreviewValue {
  const email = previewEmail?.trim().toLowerCase() || null;
  const staffId = previewStaffId && previewStaffId > 0 ? previewStaffId : null;
  const isPreview = Boolean(email || staffId);
  const q = cabinetPreviewQuery(email, staffId);
  const basePath = isPreview ? '/cabinet/as' : '/cabinet';
  const jdBase = isPreview ? '/job-descriptions/as' : '/job-descriptions';
  return {
    previewEmail: email,
    previewStaffId: staffId,
    isPreview,
    basePath,
    path: (suffix) => `${basePath}${suffix}${isPreview ? q : ''}`,
    jdPath: (suffix) => `${jdBase}${suffix}${isPreview ? q : ''}`,
  };
}

const PREVIEW_EVENT = 'pulse-cabinet-preview';

export function isCabinetAsPath(pathname: string): boolean {
  return (
    pathname === '/cabinet/as' ||
    pathname.startsWith('/cabinet/as/') ||
    pathname === '/job-descriptions/as' ||
    pathname.startsWith('/job-descriptions/as/')
  );
}

export function readCabinetPreview(): { email: string | null; staffId: number | null } {
  return {
    email: getJdPreviewEmail(),
    staffId: getJdPreviewStaffId(),
  };
}

function notifyPreviewChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PREVIEW_EVENT));
}

export function applyCabinetPreview(email: string | null, staffId: number | null) {
  const nextEmail = email?.trim().toLowerCase() || null;
  const nextStaff = staffId && staffId > 0 ? staffId : null;
  const prev = readCabinetPreview();
  const same = prev.email === nextEmail && prev.staffId === nextStaff;
  setJdPreviewEmail(nextEmail);
  setJdPreviewStaffId(nextStaff);
  setEaPreviewEmail(nextEmail);
  setEaPreviewTeacherId(null);
  if (!same) notifyPreviewChanged();
}

export function clearCabinetPreview() {
  applyCabinetPreview(null, null);
}

function previewFromSearch(searchParams: URLSearchParams): { email: string | null; staffId: number | null } {
  const email = searchParams.get('email')?.trim().toLowerCase() || null;
  const staffIdRaw = Number(searchParams.get('staff') || '');
  const staffId = Number.isFinite(staffIdRaw) && staffIdRaw > 0 ? staffIdRaw : null;
  return { email, staffId };
}

export function CabinetPreviewProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const url = previewFromSearch(searchParams);
  const urlHasPreview = Boolean(url.email || url.staffId);
  const onAsRoute = isCabinetAsPath(pathname);
  const asPicker =
    (pathname === '/cabinet/as' || pathname === '/job-descriptions/as') && !urlHasPreview;

  const [stored, setStored] = useState(readCabinetPreview);

  useLayoutEffect(() => {
    if (asPicker) {
      clearCabinetPreview();
      setStored({ email: null, staffId: null });
      return;
    }
    if (onAsRoute && urlHasPreview) {
      applyCabinetPreview(url.email, url.staffId);
      setStored(readCabinetPreview());
      return;
    }
    if (!onAsRoute) {
      // Own /cabinet and other routes must never inherit sticky preview-as-staff.
      const prev = readCabinetPreview();
      if (prev.email || prev.staffId) clearCabinetPreview();
      setStored({ email: null, staffId: null });
      return;
    }
    setStored(readCabinetPreview());
  }, [asPicker, onAsRoute, url.email, url.staffId, urlHasPreview]);

  useLayoutEffect(() => {
    function sync() {
      if (!isCabinetAsPath(window.location.pathname)) {
        setStored({ email: null, staffId: null });
        return;
      }
      setStored(readCabinetPreview());
    }
    window.addEventListener(PREVIEW_EVENT, sync);
    return () => window.removeEventListener(PREVIEW_EVENT, sync);
  }, []);

  const email = onAsRoute && !asPicker ? url.email || stored.email : null;
  const staffId = onAsRoute && !asPicker ? url.staffId || stored.staffId : null;
  const cabinetCtx = useMemo(
    () => buildCabinetPreviewContext(email, staffId),
    [email, staffId],
  );
  const jdCtx = useMemo(() => buildJdPreviewContext(email, staffId), [email, staffId]);

  return (
    <CabinetPreviewContext.Provider value={cabinetCtx}>
      <JdPreviewContext.Provider value={jdCtx}>{children}</JdPreviewContext.Provider>
    </CabinetPreviewContext.Provider>
  );
}
