type Props = {
  title?: string;
  text: string;
  loading?: boolean;
  compact?: boolean;
};

/** Единый блок ИИ-аналитики среза — виден без раскрытия карточек. */
export default function LessonVisitDashboardNarrativeBlock({
  title = 'ИИ-аналитика',
  text,
  loading = false,
  compact = false,
}: Props) {
  if (!text && !loading) return null;

  return (
    <section
      className="card glass-surface lesson-visit-dashboard-narrative-prominent"
      style={{ marginTop: compact ? 0 : '1rem', padding: compact ? '0.85rem 1rem' : '1rem 1.1rem' }}
    >
      <h2 className="admin-dash-title" style={{ fontSize: compact ? '1rem' : '1.05rem', margin: 0 }}>
        {title}
      </h2>
      {loading && !text ? (
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.55rem', marginBottom: 0 }}>
          Формируется аналитическая записка по срезу…
        </p>
      ) : text ? (
        <article className="excel-ai-report-prose phenomenal-public-prose" style={{ marginTop: '0.55rem' }}>
          {text.split(/\n\n+/).map((p, i) => (
            <p key={i} style={{ margin: '0.35rem 0' }}>
              {p.trim()}
            </p>
          ))}
        </article>
      ) : null}
    </section>
  );
}
