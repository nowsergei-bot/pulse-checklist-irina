/**
 * Cabinet menu «Чек-лист посещения урока» and its nested routes.
 * Schedule and analytics live in this branch, not as top-level items.
 */

import { VISIT_CHECKLIST_FORM_PATH, isVisitChecklistCabinetFormPath } from './lessonVisitChecklist/publicForm.ts';
import { LESSON_VISIT_SCHEDULE_LEGACY_PATH, LESSON_VISIT_SCHEDULE_PATH } from './lessonVisitScheduleAccess.ts';
import { isPulseSpreadsheetsPath } from './pulseSpreadsheetsAccess.ts';
import {
  VISIT_CHECKLIST_ANALYTICS_TITLE,
  VISIT_CHECKLIST_DIRECTOR_PATH,
  VISIT_CHECKLIST_DIRECTOR_TITLE,
  isVisitChecklistAnalyticsPath,
  isVisitChecklistDirectorPath,
} from './visitChecklistAnalyticsAccess.ts';

export const VISIT_CHECKLIST_HUB_PATH = '/cabinet/feedback';
export const VISIT_CHECKLIST_ME_PATH = '/cabinet/feedback/me';
export { VISIT_CHECKLIST_FORM_PATH };
export const VISIT_CHECKLIST_NAV_TITLE = 'Чек-лист посещения урока';

export type VisitChecklistNavItem = {
  to: string;
  title: string;
};

export function visitChecklistNavItems(opts?: {
  analyticsPath?: string | null;
  analyticsTitle?: string | null;
  directorPath?: string | null;
  directorTitle?: string | null;
}): VisitChecklistNavItem[] {
  const items: VisitChecklistNavItem[] = [
    { to: VISIT_CHECKLIST_FORM_PATH, title: 'Чек-лист' },
    { to: VISIT_CHECKLIST_ME_PATH, title: 'Моя обратная связь' },
    { to: LESSON_VISIT_SCHEDULE_PATH, title: 'График посещения' },
  ];
  const directorPath =
    opts?.directorPath ||
    (opts?.analyticsPath === VISIT_CHECKLIST_DIRECTOR_PATH ? VISIT_CHECKLIST_DIRECTOR_PATH : null);
  const analyticsPath =
    opts?.analyticsPath && opts.analyticsPath !== VISIT_CHECKLIST_DIRECTOR_PATH ? opts.analyticsPath : null;
  if (directorPath) {
    items.push({
      to: directorPath,
      title: opts?.directorTitle || VISIT_CHECKLIST_DIRECTOR_TITLE,
    });
  }
  if (analyticsPath) {
    items.push({
      to: analyticsPath,
      title: opts?.analyticsTitle || VISIT_CHECKLIST_ANALYTICS_TITLE,
    });
  }
  return items;
}

export function normalizeCabinetPath(pathname: string): string {
  return pathname.replace(/^\/cabinet\/as/, '/cabinet').replace(/\/+$/, '') || '/';
}

export function isVisitChecklistNavPath(pathname: string): boolean {
  const norm = normalizeCabinetPath(pathname);
  if (norm === VISIT_CHECKLIST_HUB_PATH || norm.startsWith(`${VISIT_CHECKLIST_HUB_PATH}/`)) return true;
  if (isVisitChecklistAnalyticsPath(pathname)) return true;
  if (norm === LESSON_VISIT_SCHEDULE_LEGACY_PATH || norm.startsWith(`${LESSON_VISIT_SCHEDULE_LEGACY_PATH}/`)) {
    return true;
  }
  return isPulseSpreadsheetsPath(pathname);
}

export function isVisitChecklistNavItemCurrent(pathname: string, to: string): boolean {
  const norm = normalizeCabinetPath(pathname);
  if (to === VISIT_CHECKLIST_HUB_PATH || to === VISIT_CHECKLIST_FORM_PATH) {
    return norm === VISIT_CHECKLIST_HUB_PATH || isVisitChecklistCabinetFormPath(pathname);
  }
  if (to === LESSON_VISIT_SCHEDULE_PATH) {
    return (
      norm === LESSON_VISIT_SCHEDULE_PATH ||
      norm.startsWith(`${LESSON_VISIT_SCHEDULE_PATH}/`) ||
      norm === LESSON_VISIT_SCHEDULE_LEGACY_PATH ||
      norm.startsWith(`${LESSON_VISIT_SCHEDULE_LEGACY_PATH}/`) ||
      isPulseSpreadsheetsPath(pathname)
    );
  }
  if (isVisitChecklistDirectorPath(to) || to === VISIT_CHECKLIST_DIRECTOR_PATH) {
    return isVisitChecklistDirectorPath(pathname);
  }
  if (isVisitChecklistAnalyticsPath(to)) {
    return isVisitChecklistAnalyticsPath(pathname) && !isVisitChecklistDirectorPath(pathname);
  }
  return norm === to || norm.startsWith(`${to}/`);
}
