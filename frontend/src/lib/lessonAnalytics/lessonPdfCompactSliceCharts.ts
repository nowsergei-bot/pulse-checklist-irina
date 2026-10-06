import { PULSE_ORDINAL_LEVEL_KEY, PULSE_PARALLEL_AUTO_KEY } from '../excelAnalytics/engine';
import type { PdfSliceChart } from './buildLessonAnalyticsTeacherPdf';
import type { TeacherCardViewModel } from './buildLessonAnalyticsTeacherCardView';

const COMPACT_SLICE_KEYS: { key: string; fallbackTitle: string; shortTitle?: string }[] = [
  { key: PULSE_PARALLEL_AUTO_KEY, fallbackTitle: 'Параллель' },
  { key: 'filter_subject', fallbackTitle: 'Предмет' },
  {
    key: PULSE_ORDINAL_LEVEL_KEY,
    fallbackTitle: 'Оценка уровня урока',
    shortTitle: 'Уровень урока',
  },
];

function shortBarLabel(full: string, maxLen: number): string {
  const t = String(full ?? '').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(1, maxLen - 1))}…`;
}

/** Три диаграммы среза в одну линию для краткого PDF. */
export function pickCompactSliceChartsForPdf(view: TeacherCardViewModel): PdfSliceChart[] {
  const out: PdfSliceChart[] = [];
  for (const spec of COMPACT_SLICE_KEYS) {
    const chart = view.sliceCharts.find((c) => c.key === spec.key);
    if (!chart?.bars.length) continue;
    const labelMax = spec.key === PULSE_ORDINAL_LEVEL_KEY ? 14 : 28;
    const rawTitle = chart.label?.trim() || spec.fallbackTitle;
    const title = spec.shortTitle
      ? spec.shortTitle
      : shortBarLabel(rawTitle, 26);
    out.push({
      title,
      items: chart.bars.map((b) => ({
        label: shortBarLabel(b.fullName, labelMax),
        value: b.uniqueLessons,
      })),
    });
  }
  return out;
}
