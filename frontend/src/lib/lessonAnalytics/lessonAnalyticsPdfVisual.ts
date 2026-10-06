import { type LessonAnalyticsCardTemplate, type LessonAnalyticsPdfVisualSettings } from '../../api/lessonAnalytics';
import { LESSON_MONITORING_REPORT_TITLE } from './lessonAnalyticsTeacherPdfDocument';
import {
  normalizeLessonPdfLayoutSettings,
  type ResolvedLessonPdfModuleLayout,
} from './lessonAnalyticsPdfLayout';

export type LessonAnalyticsPdfAccent = 'pulse-red' | 'blue' | 'green' | 'slate';
export type LessonAnalyticsPdfDensity = 'compact' | 'normal' | 'airy';
export type LessonAnalyticsPdfOrientation = 'landscape' | 'portrait';

export type LessonAnalyticsPdfVisual = LessonAnalyticsPdfVisualSettings;

export type ResolvedLessonPdfVisual = {
  orientation: LessonAnalyticsPdfOrientation;
  accentRgb: [number, number, number];
  accentDeepRgb: [number, number, number];
  margin: number;
  maxPages: number;
  maxSliceCharts: number;
  reportTitle: string;
  projectTitle: string;
  entityCaption: string;
  reportTagline: string;
  leadLine: string;
  footerLine: string;
  showDisclaimer: boolean;
  showPulseBrand: boolean;
  showPageNumbers: boolean;
  showGeneratedDate: boolean;
  showSectionBars: boolean;
  moduleLayout: ResolvedLessonPdfModuleLayout;
};

const ACCENT_MAP: Record<
  LessonAnalyticsPdfAccent,
  { main: [number, number, number]; deep: [number, number, number] }
> = {
  'pulse-red': { main: [227, 6, 19], deep: [153, 27, 27] },
  blue: { main: [37, 99, 235], deep: [30, 64, 175] },
  green: { main: [22, 163, 74], deep: [21, 128, 61] },
  slate: { main: [71, 85, 105], deep: [51, 65, 85] },
};

const DENSITY_MARGIN: Record<LessonAnalyticsPdfDensity, number> = {
  compact: 24,
  normal: 32,
  airy: 40,
};

export const DEFAULT_LESSON_PDF_VISUAL: LessonAnalyticsPdfVisual = {
  orientation: 'landscape',
  accent: 'pulse-red',
  density: 'normal',
  reportTitle: LESSON_MONITORING_REPORT_TITLE,
  entityCaption: 'Педагог',
  reportTagline: '',
  leadLine: '',
  showDisclaimer: true,
  showPulseBrand: true,
  showPageNumbers: true,
  showGeneratedDate: true,
  showSectionBars: true,
  maxSliceCharts: 6,
  maxPages: 16,
  layout: {
    sliceWidthPct: 48,
    sliceChartsPerRow: 2,
    competenciesPageBreakBefore: true,
    aiNarrativeKeepTogether: true,
    phraseCountHeatColors: true,
    showLessonCountInHeader: true,
  },
};

export function normalizeLessonPdfVisual(raw?: LessonAnalyticsPdfVisual | null): LessonAnalyticsPdfVisual {
  const d = DEFAULT_LESSON_PDF_VISUAL;
  if (!raw || typeof raw !== 'object') return { ...d };
  const maxCharts = Number(raw.maxSliceCharts);
  const maxPages = Number(raw.maxPages);
  return {
    orientation: raw.orientation === 'portrait' ? 'portrait' : 'landscape',
    accent:
      raw.accent === 'blue' || raw.accent === 'green' || raw.accent === 'slate' ? raw.accent : 'pulse-red',
    density:
      raw.density === 'compact' || raw.density === 'airy' ? raw.density : 'normal',
    reportTitle: String(raw.reportTitle ?? d.reportTitle ?? ''),
    entityCaption: String(raw.entityCaption ?? d.entityCaption ?? ''),
    reportTagline: String(raw.reportTagline ?? ''),
    leadLine: String(raw.leadLine ?? ''),
    showDisclaimer: raw.showDisclaimer !== false,
    showPulseBrand: raw.showPulseBrand !== false,
    showPageNumbers: raw.showPageNumbers !== false,
    showGeneratedDate: raw.showGeneratedDate !== false,
    showSectionBars: raw.showSectionBars !== false,
    maxSliceCharts: Number.isFinite(maxCharts) ? Math.min(12, Math.max(1, Math.round(maxCharts))) : 6,
    maxPages: Number.isFinite(maxPages) ? Math.min(32, Math.max(4, Math.round(maxPages))) : 16,
    layout: raw.layout,
  };
}

/** Чек-лист посещения: плотная вёрстка PDF без лишних разрывов между блоками. */
export function resolveLessonPdfVisualVisitChecklist(
  template: LessonAnalyticsCardTemplate,
  projectTitle: string,
): ResolvedLessonPdfVisual {
  const base = resolveLessonPdfVisual(template, projectTitle);
  return {
    ...base,
    margin: 22,
    moduleLayout: {
      ...base.moduleLayout,
      sliceChartsPerRow: 2,
      sliceWidthPct: 48,
      competenciesPageBreakBefore: false,
      aiNarrativeKeepTogether: false,
      phraseCountHeatColors: base.moduleLayout.phraseCountHeatColors,
      showLessonCountInHeader: base.moduleLayout.showLessonCountInHeader,
    },
  };
}

/** Альбомный отчёт на одну страницу: 3 диаграммы в ряд, без тепловой карты. */
export function resolveLessonPdfVisualOnePage(
  template: LessonAnalyticsCardTemplate,
  projectTitle: string,
): ResolvedLessonPdfVisual {
  const base = resolveLessonPdfVisual(template, projectTitle);
  return {
    ...base,
    margin: 22,
    maxPages: 2,
    maxSliceCharts: 3,
    moduleLayout: {
      ...base.moduleLayout,
      sliceChartsPerRow: 3,
      sliceWidthPct: 32,
      competenciesPageBreakBefore: false,
      aiNarrativeKeepTogether: false,
      phraseCountHeatColors: false,
      showLessonCountInHeader: base.moduleLayout.showLessonCountInHeader,
    },
  };
}

export function resolveLessonPdfVisual(
  template: LessonAnalyticsCardTemplate,
  projectTitle: string,
): ResolvedLessonPdfVisual {
  const v = normalizeLessonPdfVisual(template.pdfVisual);
  const accent = ACCENT_MAP[v.accent ?? 'pulse-red'];
  const intro = String(template.introText ?? '').trim();
  const footer = String(template.footerText ?? '').trim();
  const tagline = String(v.reportTagline ?? '').trim();
  const leadFromTpl = String(v.leadLine ?? '').trim();

  return {
    orientation: v.orientation ?? 'landscape',
    accentRgb: accent.main,
    accentDeepRgb: accent.deep,
    margin: DENSITY_MARGIN[v.density ?? 'normal'],
    maxPages: v.maxPages ?? 16,
    maxSliceCharts: v.maxSliceCharts ?? 6,
    reportTitle: String(v.reportTitle ?? '').trim() || LESSON_MONITORING_REPORT_TITLE,
    projectTitle: projectTitle || 'Аналитика уроков',
    entityCaption: String(v.entityCaption ?? '').trim() || 'Педагог',
    reportTagline: tagline,
    leadLine:
      leadFromTpl ||
      intro ||
      'Диаграммы и сводка по срезу данных (как в интерфейсе модуля).',
    footerLine: footer || 'Материал сформирован в модуле «Аналитика уроков».',
    showDisclaimer: v.showDisclaimer !== false,
    showPulseBrand: v.showPulseBrand !== false,
    showPageNumbers: v.showPageNumbers !== false,
    showGeneratedDate: v.showGeneratedDate !== false,
    showSectionBars: v.showSectionBars !== false,
    moduleLayout: normalizeLessonPdfLayoutSettings(v.layout),
  };
}

export const LESSON_ANALYTICS_DEFAULT_TEMPLATE_STORAGE_KEY = 'pulse-lesson-analytics-default-card-template';

export function loadDefaultLessonCardTemplate(): LessonAnalyticsCardTemplate | null {
  try {
    const raw = localStorage.getItem(LESSON_ANALYTICS_DEFAULT_TEMPLATE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LessonAnalyticsCardTemplate;
  } catch {
    return null;
  }
}

export function saveDefaultLessonCardTemplate(template: LessonAnalyticsCardTemplate): void {
  localStorage.setItem(LESSON_ANALYTICS_DEFAULT_TEMPLATE_STORAGE_KEY, JSON.stringify(template));
}
