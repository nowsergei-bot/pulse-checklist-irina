import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { type AuthUser } from '../../api/auth';
import { useIsAuthenticated } from '../isAuthenticated';
import {
  normalizeCabinetTheme,
  persistCabinetTheme,
  readStoredCabinetTheme,
  type CabinetTheme,
} from '../cabinetTheme';
import { loadAuthMe, peekCachedAuthMe } from './sharedAuth';

type CabinetProfileValue = {
  user: AuthUser | null;
  loading: boolean;
  theme: CabinetTheme;
  refresh: () => Promise<AuthUser | null>;
  applyLocalTheme: (theme: CabinetTheme) => void;
  applyUser: (user: AuthUser) => void;
};

const CabinetProfileContext = createContext<CabinetProfileValue>({
  user: null,
  loading: false,
  theme: 'corporate',
  refresh: async () => null,
  applyLocalTheme: () => undefined,
  applyUser: () => undefined,
});

export function useCabinetProfile() {
  return useContext(CabinetProfileContext);
}

export function CabinetProfileProvider({ children }: { children: ReactNode }) {
  const authed = useIsAuthenticated();
  const [user, setUser] = useState<AuthUser | null>(() => (authed ? peekCachedAuthMe() : null));
  const [loading, setLoading] = useState(() => authed && !peekCachedAuthMe());
  const [theme, setTheme] = useState<CabinetTheme>(readStoredCabinetTheme);

  const applyUser = useCallback((next: AuthUser) => {
    setUser(next);
    if (next.cabinet_theme) {
      const t = normalizeCabinetTheme(next.cabinet_theme);
      persistCabinetTheme(t);
      setTheme(t);
    }
  }, []);

  const applyLocalTheme = useCallback((next: CabinetTheme) => {
    persistCabinetTheme(next);
    setTheme(next);
  }, []);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!authed) {
      setUser(null);
      setLoading(false);
      return null;
    }
    const cached = !opts?.silent ? peekCachedAuthMe() : null;
    if (cached) {
      applyUser(cached);
      setLoading(false);
    } else if (!opts?.silent) {
      setLoading(true);
    }
    try {
      const next = await loadAuthMe(Boolean(opts?.silent));
      applyUser(next);
      return next;
    } catch {
      if (!opts?.silent) setUser(null);
      return null;
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [authed, applyUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onTheme = () => setTheme(readStoredCabinetTheme());
    const onProfile = () => {
      void refresh({ silent: true });
    };
    window.addEventListener('pulse-cabinet-theme', onTheme);
    window.addEventListener('pulse-cabinet-profile', onProfile);
    return () => {
      window.removeEventListener('pulse-cabinet-theme', onTheme);
      window.removeEventListener('pulse-cabinet-profile', onProfile);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ user, loading, theme, refresh, applyLocalTheme, applyUser }),
    [user, loading, theme, refresh, applyLocalTheme, applyUser],
  );

  return <CabinetProfileContext.Provider value={value}>{children}</CabinetProfileContext.Provider>;
}
