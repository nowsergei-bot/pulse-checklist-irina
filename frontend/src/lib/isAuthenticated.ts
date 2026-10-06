import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { readAuthKind, type AuthKind } from './authKind';

/** Есть любой сохранённый признак входа. Не использовать для решения staff vs admin. */
export function isAuthenticated(): boolean {
  return readAuthKind(typeof localStorage === 'undefined' ? null : localStorage) !== 'anonymous';
}

export function useAuthKind(): AuthKind {
  const location = useLocation();
  const [kind, setKind] = useState<AuthKind>(() =>
    readAuthKind(typeof localStorage === 'undefined' ? null : localStorage),
  );

  useEffect(() => {
    setKind(readAuthKind(localStorage));
  }, [location.pathname, location.key]);

  useEffect(() => {
    const onStorage = () => setKind(readAuthKind(localStorage));
    window.addEventListener('storage', onStorage);
    window.addEventListener('pulse-auth-changed', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pulse-auth-changed', onStorage);
    };
  }, []);

  return kind;
}

export function useIsAuthenticated(): boolean {
  return useAuthKind() !== 'anonymous';
}
