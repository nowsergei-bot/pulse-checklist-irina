import { type LessonAnalyticsPdfVisualSettings } from '../../api/lessonAnalytics';

export type ResolvedLessonPdfModuleLayout = {
  /** Ширина блока «Распределение по срезам», % от полезной ширины листа (30–100). */
  sliceWidthPct: number;
  /** Диаграмм среза в одном ряду (1, 2 или 3). */
  sliceChartsPerRow: 1 | 2 | 3;
  /** Компетенции — с новой страницы. */
  competenciesPageBreakBefore: boolean;
  /** ИИ-текст: перенос на новую страницу, если не помещается целиком на текущей. */
  aiNarrativeKeepTogether: boolean;
  /** Тепловая заливка ячеек «Вхождений» (как на экране). */
  phraseCountHeatColors: boolean;
  /** Показывать число уроков в шапке PDF. */
  showLessonCountInHeader: boolean;
};

const DEFAULT_LAYOUT: ResolvedLessonPdfModuleLayout = {
  sliceWidthPct: 48,
  sliceChartsPerRow: 2,
  competenciesPageBreakBefore: true,
  aiNarrativeKeepTogether: true,
  phraseCountHeatColors: true,
  showLessonCountInHeader: true,
};

export function normalizeLessonPdfLayoutSettings(
  raw?: LessonAnalyticsPdfVisualSettings['layout'] | null,
): ResolvedLessonPdfModuleLayout {
  const d = DEFAULT_LAYOUT;
  if (!raw || typeof raw !== 'object') return { ...d };
  const w = Number(raw.sliceWidthPct);
  const perRow = Number(raw.sliceChartsPerRow);
  return {
    sliceWidthPct: Number.isFinite(w) ? Math.min(100, Math.max(30, Math.round(w))) : d.sliceWidthPct,
    sliceChartsPerRow: perRow === 1 ? 1 : perRow === 3 ? 3 : 2,
    competenciesPageBreakBefore: raw.competenciesPageBreakBefore !== false,
    aiNarrativeKeepTogether: raw.aiNarrativeKeepTogether !== false,
    phraseCountHeatColors: raw.phraseCountHeatColors !== false,
    showLessonCountInHeader: raw.showLessonCountInHeader !== false,
  };
}
