import { type LessonAnalyticsAnalysisPeriod } from '../../api/lessonAnalytics';
import type { TeacherPeriodComparison } from './computeLessonPeriodComparison';

function formatSignedDelta(n: number, suffix = ''): string {
  if (n > 0) return `+${n}${suffix}`;
  if (n < 0) return `${n}${suffix}`;
  return `0${suffix}`;
}

function formatDeltaPctPoints(n: number): string {
  return formatSignedDelta(n, ' п.п.');
}

/**
 * Блок «Изменения относительно прошлого периода» для промпта ИИ по карточке педагога.
 */
export function buildLessonPeriodComparisonContextRu(
  period: LessonAnalyticsAnalysisPeriod | null | undefined,
  comparison: TeacherPeriodComparison | null | undefined,
): string {
  if (!period && !comparison) return '';

  const lines: string[] = ['=== Сравнение с прошлым периодом ==='];

  const label = String(period?.label ?? '').trim();
  if (label) lines.push(`Текущий период: ${label}.`);
  if (period?.start || period?.end) {
    lines.push(`Даты среза: ${period.start ?? '—'} … ${period.end ?? '—'}.`);
  }
  if (period?.compareWithProjectId) {
    lines.push(`Baseline-проект: id ${period.compareWithProjectId}.`);
  }

  if (!comparison) {
    if (period?.compareWithProjectId) {
      lines.push(
        'Числовые Δ по baseline пока недоступны (педагог не найден в прошлом периоде или несовместимая рубрика).',
      );
      lines.push('Служебно для модели: не выдумывай динамику — опиши только текущий срез.');
    }
    return lines.join('\n');
  }

  if (!comparison.matched) {
    lines.push(
      `Педагог «${comparison.teacherLabel}» не найден в baseline-периоде — динамику по разделам не считаем.`,
    );
    lines.push(`Наблюдений в текущем срезе: ${comparison.currentObservations}.`);
    lines.push('Служебно для модели: не выдумывай улучшения/ухудшения относительно прошлого периода.');
    return lines.join('\n');
  }

  lines.push(
    `Сопоставление: «${comparison.teacherLabel}» (текущий) ↔ «${comparison.baselineTeacherLabel}» (baseline).`,
  );
  lines.push(
    `Наблюдений: было ${comparison.baselineObservations}, стало ${comparison.currentObservations} (Δ ${formatSignedDelta(comparison.deltaObservations)}).`,
  );

  if (comparison.schemaKind === 'visit_checklist' && comparison.sectionDeltas.length) {
    lines.push('', 'Δ среднего % от максимума по разделам (текущий − baseline):');
    const sorted = [...comparison.sectionDeltas].sort(
      (a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct),
    );
    for (const sec of sorted) {
      lines.push(
        `  • «${sec.title}»: ${sec.baselinePct}% → ${sec.currentPct}% (${formatDeltaPctPoints(sec.deltaPct)})`,
      );
    }
  }

  if (comparison.schemaKind === 'competency_scale' && comparison.competencyDeltas.length) {
    lines.push('', 'Δ пикового уровня по компетенциям (текущий − baseline):');
    for (const d of comparison.competencyDeltas.filter((x) => x.deltaPeak != null && x.deltaPeak !== 0)) {
      const short = d.title.split('//')[0]?.trim() || d.title;
      lines.push(
        `  • «${short}»: ${d.baselinePeak ?? '—'} → ${d.currentPeak ?? '—'} (${formatSignedDelta(d.deltaPeak ?? 0)})`,
      );
    }
  }

  if (comparison.newWeakIndicators.length) {
    lines.push('', 'Новые слабые показатели (есть сейчас, не было в baseline):');
    for (const ind of comparison.newWeakIndicators.slice(0, 8)) {
      lines.push(`  • ${ind}`);
    }
  }
  if (comparison.resolvedWeakIndicators.length) {
    lines.push('', 'Улучшились / исчезли слабые показатели (были в baseline, сейчас нет):');
    for (const ind of comparison.resolvedWeakIndicators.slice(0, 8)) {
      lines.push(`  • ${ind}`);
    }
  }

  lines.push(
    '',
    'Служебно для модели: опирайся на числовые Δ выше; в ответе пользователю — связная динамика (рост/спад/стабильность), без выдуманных цифр. Для педагога не перегружай сырыми процентами.',
  );

  return lines.join('\n');
}
