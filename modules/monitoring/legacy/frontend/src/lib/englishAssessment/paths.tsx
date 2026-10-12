import { createContext, useContext, useMemo, type ReactNode } from 'react';

export const EA_ANALYTICS_BASE = '/analytics/english-assessment';
export const EA_CABINET_BASE = '/cabinet/english';

export type EaPaths = {
  base: string;
  cabinet: boolean;
  search: string;
  href: (suffix?: string) => string;
};

const defaultHref = (suffix = '') => `${EA_ANALYTICS_BASE}${suffix}`;

const EaPathsContext = createContext<EaPaths>({
  base: EA_ANALYTICS_BASE,
  cabinet: false,
  search: '',
  href: defaultHref,
});

export function EaPathsProvider({
  base,
  cabinet = false,
  search = '',
  children,
}: {
  base: string;
  cabinet?: boolean;
  search?: string;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      base,
      cabinet,
      search,
      href: (suffix = '') => `${base}${suffix}${search}`,
    }),
    [base, cabinet, search],
  );
  return <EaPathsContext.Provider value={value}>{children}</EaPathsContext.Provider>;
}

export function useEaPaths(): EaPaths {
  return useContext(EaPathsContext);
}

export function cabinetEnglishPath(pathname: string): string {
  const rest = pathname.replace(EA_ANALYTICS_BASE, '') || '';
  return `${EA_CABINET_BASE}${rest}`;
}
