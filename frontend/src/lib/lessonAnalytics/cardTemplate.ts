import { type LessonAnalyticsCardTemplate } from '../../api/lessonAnalytics';
import type { LessonAnalyticsTeacherPdfBranding } from './buildLessonAnalyticsTeacherPdfFromCardData';
import {
  DEFAULT_LESSON_PDF_VISUAL,
  normalizeLessonPdfVisual,
  resolveLessonPdfVisual,
} from './lessonAnalyticsPdfVisual';

export const DEFAULT_LESSON_CARD_TEMPLATE: LessonAnalyticsCardTemplate = {
  v: 1,
  updatedAt: '',
  showSliceCharts: true,
  showCompetencyTable: true,
  showProsePanel: true,
  showQuickSummary: true,
  showAiNarrative: true,
  /** По умолчанию — быстрый и более предсказуемый ИИ по карточкам. */
  aiFastMode: true,
  introText: '',
  footerText: '',
  aiUserFocus: '',
  pdfVisual: { ...DEFAULT_LESSON_PDF_VISUAL },
};

export function normalizeLessonCardTemplate(
  raw?: LessonAnalyticsCardTemplate | null,
): LessonAnalyticsCardTemplate {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_LESSON_CARD_TEMPLATE, updatedAt: new Date().toISOString() };
  }
  return {
    ...DEFAULT_LESSON_CARD_TEMPLATE,
    ...raw,
    v: 1,
    showSliceCharts: raw.showSliceCharts !== false,
    showCompetencyTable: raw.showCompetencyTable !== false,
    showProsePanel: raw.showProsePanel !== false,
    showQuickSummary: raw.showQuickSummary !== false,
    showAiNarrative: raw.showAiNarrative !== false,
    introText: String(raw.introText ?? ''),
    footerText: String(raw.footerText ?? ''),
    aiUserFocus: String(raw.aiUserFocus ?? ''),
    aiFastMode: raw.aiFastMode !== false,
    pdfVisual: normalizeLessonPdfVisual(raw.pdfVisual),
  };
}

export function pdfBrandingFromCardTemplate(
  template: LessonAnalyticsCardTemplate,
  projectTitle: string,
): LessonAnalyticsTeacherPdfBranding {
  const resolved = resolveLessonPdfVisual(template, projectTitle);
  return {
    defaultTitle: resolved.projectTitle,
    entityCaption: resolved.entityCaption,
    reportTagline: resolved.reportTagline || undefined,
    leadLine: resolved.leadLine,
    footerLine: resolved.footerLine,
  };
}

export function pdfVisualFromCardTemplate(
  template: LessonAnalyticsCardTemplate,
  projectTitle: string,
) {
  return resolveLessonPdfVisual(template, projectTitle);
}

export function pluralRuCards(n: number): string {
  const x = Math.abs(n) % 100;
  const y = x % 10;
  if (x > 10 && x < 20) return 'карточек';
  if (y > 1 && y < 5) return 'карточки';
  if (y === 1) return 'карточка';
  return 'карточек';
}

/** Оценка времени до конца фоновой очереди ИИ. */
export function estimateAiBatchRemainingSec(leftInQueue: number, gapMs: number, secPerLlmCall = 24): number {
  if (leftInQueue <= 0) return 0;
  return Math.ceil(leftInQueue * (gapMs / 1000 + secPerLlmCall));
}

export function formatEtaRu(totalSec: number): string {
  if (totalSec <= 0) return 'скоро';
  if (totalSec < 45) return `~${totalSec} сек`;
  const min = Math.ceil(totalSec / 60);
  if (min < 60) return min === 1 ? '~1 мин' : `~${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `~${h} ч ${m} мин` : `~${h} ч`;
}
