import type { TeacherPeriodComparison } from '../lib/lessonAnalytics/computeLessonPeriodComparison';

function deltaTrend(delta: number): { arrow: string; color: string } {
  if (delta > 0) return { arrow: '↑', color: 'var(--ok, #15803d)' };
  if (delta < 0) return { arrow: '↓', color: 'var(--err, #b91c1c)' };
  return { arrow: '→', color: 'var(--muted, #64748b)' };
}

function formatSigned(n: number, suffix = ''): string {
  if (n === 0) return `0${suffix}`;
  return `${n > 0 ? '+' : ''}${n}${suffix}`;
}

export type TeacherPeriodComparisonDynamicsProps = {
  comparison: TeacherPeriodComparison | null | undefined;
  /** Скрыть числа в режиме «для педагога». */
  hideRawNumbers?: boolean;
};

export default function TeacherPeriodComparisonDynamics({
  comparison,
  hideRawNumbers = false,
}: TeacherPeriodComparisonDynamicsProps) {
  if (!comparison?.matched) return null;

  const obsTrend = deltaTrend(comparison.deltaObservations);

  return (
    <div
      className="lesson-period-comparison-dynamics"
      style={{
        marginTop: '0.75rem',
        padding: '0.65rem 0.75rem',
        borderRadius: 8,
        border: '1px solid var(--border, #e2e8f0)',
        background: 'var(--surface-muted, rgba(248, 250, 252, 0.7))',
      }}
    >
      <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600 }}>Динамика относительно прошлого периода</p>
      <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
        Baseline: {comparison.baselineTeacherLabel}
      </p>

      <p style={{ margin: '0.5rem 0 0', fontSize: '0.84rem' }}>
        Наблюдений:{' '}
        <span style={{ color: obsTrend.color, fontWeight: 600 }}>
          {obsTrend.arrow} {formatSigned(comparison.deltaObservations)}
        </span>
        {!hideRawNumbers ? (
          <span className="muted">
            {' '}
            ({comparison.currentObservations} сейчас, {comparison.baselineObservations} было)
          </span>
        ) : null}
      </p>

      {comparison.schemaKind === 'visit_checklist' && comparison.sectionDeltas.length > 0 ? (
        <div style={{ marginTop: '0.55rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
            Δ по разделам (% от максимума):
          </p>
          <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
            {[...comparison.sectionDeltas]
              .filter((s) => s.deltaPct !== 0 || s.currentPct !== s.baselinePct)
              .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
              .slice(0, 7)
              .map((s) => {
                const t = deltaTrend(s.deltaPct);
                return (
                  <li key={s.code} style={{ marginBottom: 2 }}>
                    <span style={{ color: t.color, fontWeight: 600 }}>{t.arrow}</span>{' '}
                    {s.title}: {formatSigned(s.deltaPct, ' п.п.')}
                    {!hideRawNumbers ? (
                      <span className="muted">
                        {' '}
                        ({s.currentPct}% → было {s.baselinePct}%)
                      </span>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}

      {comparison.schemaKind === 'competency_scale' && comparison.competencyDeltas.length > 0 ? (
        <div style={{ marginTop: '0.55rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
            Δ пикового уровня по компетенциям:
          </p>
          <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
            {comparison.competencyDeltas
              .filter((d) => d.deltaPeak != null && d.deltaPeak !== 0)
              .slice(0, 6)
              .map((d) => {
                const t = deltaTrend(d.deltaPeak ?? 0);
                const short = d.title.split('//')[0]?.trim() || d.title;
                return (
                  <li key={d.title} style={{ marginBottom: 2 }}>
                    <span style={{ color: t.color, fontWeight: 600 }}>{t.arrow}</span> {short}:{' '}
                    {formatSigned(d.deltaPeak ?? 0)}
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}

      {comparison.newWeakIndicators.length > 0 ? (
        <p style={{ margin: '0.55rem 0 0', fontSize: '0.82rem', color: 'var(--err, #b91c1c)' }}>
          Новые слабые показатели: {comparison.newWeakIndicators.slice(0, 4).join('; ')}
          {comparison.newWeakIndicators.length > 4 ? '…' : ''}
        </p>
      ) : null}

      {comparison.resolvedWeakIndicators.length > 0 ? (
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--ok, #15803d)' }}>
          Улучшилось: {comparison.resolvedWeakIndicators.slice(0, 4).join('; ')}
          {comparison.resolvedWeakIndicators.length > 4 ? '…' : ''}
        </p>
      ) : null}
    </div>
  );
}
