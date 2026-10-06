/** Menu visibility follows authenticated server capabilities. */

export const VISIT_CHECKLIST_ANALYTICS_PATH = '/analytics/lesson-visit/dashboard';
export const VISIT_CHECKLIST_DIRECTOR_PATH = '/cabinet/visit-checklist';
export const VISIT_CHECKLIST_ANALYTICS_TITLE = 'Аналитика уроков';
export const VISIT_CHECKLIST_DIRECTOR_TITLE = 'Чек-лист директора';

export type VisitChecklistAnalyticsIdentity = {
 email?:string|null;display_name?:string|null;full_name?:string|null;role?:string|null;permissions?:string[];
};
function permitted(user:VisitChecklistAnalyticsIdentity|null|undefined,permission:string):boolean {
 return Boolean(user && (['admin','assistant_director'].includes(user.role||'')||user.permissions?.includes('*')||user.permissions?.includes(permission)));
}
export function isVisitChecklistDirectorPerson(user:VisitChecklistAnalyticsIdentity|null|undefined,_staffName?:string|null):boolean {
 return permitted(user,'pulse.director.checklist')||permitted(user,'pulse.director.analytics');
}
export function isVisitChecklistDirectorOnlyPerson(_user:VisitChecklistAnalyticsIdentity|null|undefined,_staffName?:string|null):boolean {return false;}

export function isVisitChecklistDirectorPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  const asPath = path.replace(/^\/cabinet\/as(?=\/|$)/, '/cabinet');
  return asPath === VISIT_CHECKLIST_DIRECTOR_PATH || asPath.startsWith(`${VISIT_CHECKLIST_DIRECTOR_PATH}/`);
}

export function isVisitChecklistAnalyticsPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (isVisitChecklistDirectorPath(path)) return true;
  if (path === VISIT_CHECKLIST_ANALYTICS_PATH || path.startsWith(`${VISIT_CHECKLIST_ANALYTICS_PATH}/`)) {
    return true;
  }
  if (path === '/analytics/lesson-visit' || path.startsWith('/analytics/lesson-visit/')) {
    return true;
  }
  if (path === '/analytics/checklist-2' || path.startsWith('/analytics/checklist-2/')) return true;
  if (path === '/analytics/checklist-3' || path.startsWith('/analytics/checklist-3/')) return true;
  if (path === '/analytics/visit-checklist' || path.startsWith('/analytics/visit-checklist/')) return true;
  return false;
}

/** Methodist / Excel wizard surfaces that the director should not keep. */
export function isVisitChecklistMethodistAnalyticsPath(pathname: string): boolean {
  return isVisitChecklistAnalyticsPath(pathname) && !isVisitChecklistDirectorPath(pathname);
}

/** Show «Аналитика уроков» in Pulse cabinet. Callers still hide in preview. */
export function canSeeVisitChecklistAnalyticsNav(
  user: VisitChecklistAnalyticsIdentity | null | undefined,
  _staffName?: string | null,
  opts?: { preview?: boolean },
): boolean {
  if (opts?.preview) return false;
  return permitted(user,'pulse.analytics.view')||permitted(user,'pulse.analytics.all');
}

export function visitChecklistAnalyticsNavPath(
  user: VisitChecklistAnalyticsIdentity | null | undefined,
  staffName?: string | null,
  opts?: { preview?: boolean },
): string | null {
  if (!canSeeVisitChecklistAnalyticsNav(user, staffName, opts)) return null;
  return isVisitChecklistDirectorOnlyPerson(user, staffName)
    ? VISIT_CHECKLIST_DIRECTOR_PATH
    : VISIT_CHECKLIST_ANALYTICS_PATH;
}

export function canSeeVisitChecklistDirectorNav(
  user: VisitChecklistAnalyticsIdentity | null | undefined,
  staffName?: string | null,
  opts?: { preview?: boolean },
): boolean {
  if (opts?.preview) return false;
  return isVisitChecklistDirectorPerson(user, staffName);
}

export function visitChecklistDirectorNavPath(
  user: VisitChecklistAnalyticsIdentity | null | undefined,
  staffName?: string | null,
  opts?: { preview?: boolean },
): string | null {
  return canSeeVisitChecklistDirectorNav(user, staffName, opts) ? VISIT_CHECKLIST_DIRECTOR_PATH : null;
}

export function visitChecklistAnalyticsNavTitle(
  user: VisitChecklistAnalyticsIdentity | null | undefined,
  staffName?: string | null,
  opts?: { preview?: boolean },
): string | null {
  if (!canSeeVisitChecklistAnalyticsNav(user, staffName, opts)) return null;
  return isVisitChecklistDirectorOnlyPerson(user, staffName)
    ? VISIT_CHECKLIST_DIRECTOR_TITLE
    : VISIT_CHECKLIST_ANALYTICS_TITLE;
}

/** Additional analytics menu entries use the same capabilities. */
export function canSeeVisitChecklistMethodistAnalyticsNav(
  user: VisitChecklistAnalyticsIdentity | null | undefined,
  staffName?: string | null,
  opts?: { preview?: boolean },
): boolean {
  return (
    canSeeVisitChecklistAnalyticsNav(user, staffName, opts) && !isVisitChecklistDirectorOnlyPerson(user, staffName)
  );
}

export function shouldRedirectVisitChecklistToDirector(
  pathname: string,
  user: VisitChecklistAnalyticsIdentity | null | undefined,
  staffName?: string | null,
): boolean {
  return isVisitChecklistDirectorOnlyPerson(user, staffName) && isVisitChecklistMethodistAnalyticsPath(pathname);
}
