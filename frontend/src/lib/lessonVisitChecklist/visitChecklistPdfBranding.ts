import type { LessonAnalyticsTeacherPdfBranding } from '../lessonAnalytics/buildLessonAnalyticsTeacherPdfFromCardData';
import { displayVisitChecklistTitle, VISIT_CHECKLIST_TITLE } from './normalizeChecklist';
import { LESSON_VISIT_ORDINAL_HEADER } from './visitChecklistAnalyticsMapping';

export const VISIT_CHECKLIST_PDF_REPORT_TITLE = 'Аналитика уроков';

/** Переопределение подписей PDF для проектов чек-листа (экран + выгрузка). */
export function visitChecklistPdfBrandingOverride(
  projectTitle: string,
  base?: LessonAnalyticsTeacherPdfBranding | null,
): LessonAnalyticsTeacherPdfBranding {
  const title = displayVisitChecklistTitle(projectTitle) || VISIT_CHECKLIST_TITLE;
  return {
    ...base,
    defaultTitle: title,
    entityCaption: 'Педагог',
    reportTagline: VISIT_CHECKLIST_PDF_REPORT_TITLE,
    leadLine: base?.leadLine || 'Сводка по наблюдениям методиста / посетившего урок',
    footerLine: base?.footerLine,
    ordinalBarsTitle: LESSON_VISIT_ORDINAL_HEADER,
  };
}
