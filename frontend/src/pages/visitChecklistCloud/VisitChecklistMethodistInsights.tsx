import { displayTeacherTitle } from '../../lib/lessonVisitChecklist/visitChecklistCloudUi';
import { formatScoreDelta } from '../../lib/lessonVisitChecklist/visitChecklistCompare';
import type { MethodistInsights } from '../../lib/lessonVisitChecklist/visitChecklistCardInsights';
import { PDF_CARD_KEEP_TOGETHER_CLASS } from '../../lib/pdf/captureElementToPdfA4';

function Queue({
  title,
  rows,
}: {
  title?: string;
  rows: MethodistInsights['pending'];
}) {
  if (!rows.length) return null;
  return (
    <div>
      {title ? (
        <p className="vcd-insight__label">
          {title} · {rows.length}
        </p>
      ) : (
        <p className="vcd-insight__label">{rows.length}</p>
      )}
      <ul className="vcd-insight__list">
        {rows.slice(0, 12).map((row) => (
          <li key={row.teacher_key}>
            <span>{displayTeacherTitle(row.teacher_label)}</span>
            <strong>
              н {row.observe} · с {row.self}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function VisitChecklistMethodistInsights({
  insights,
  pendingReady = true,
}: {
  insights: MethodistInsights;
  pendingReady?: boolean;
}) {
  const { outliers, visitors, pending, recurringWeak } = insights;
  if (!pendingReady && !outliers.length && !visitors.length && !pending.length && !recurringWeak) {
    return (
      <section className={`vcd-methodist ${PDF_CARD_KEEP_TOGETHER_CLASS}`} aria-label="Методическая поддержка">
        <article className="card glass-surface vcd-methodist__card">
          <h3>Осталось посетить</h3>
          <p className="muted vcd-insight__hint">Загрузка списка педагогов…</p>
        </article>
      </section>
    );
  }
  if (!outliers.length && !visitors.length && !pending.length && !recurringWeak) {
    return null;
  }
  return (
    <section className={`vcd-methodist ${PDF_CARD_KEEP_TOGETHER_CLASS}`} aria-label="Методическая поддержка">
      {outliers.length ? (
        <article className="card glass-surface vcd-methodist__card">
          <h3>Выше и ниже среднего</h3>
          <p className="muted vcd-insight__hint">
            Результаты, которые отличаются от среднего по кафедре более чем на 20 процентных пунктов.
          </p>
          <ul className="vcd-insight__list">
            {outliers.map((row) => (
              <li key={row.teacher_key}>
                <span>
                  {displayTeacherTitle(row.teacher_label)} · {row.department}
                </span>
                <strong>
                  {row.score_pct}% ({formatScoreDelta(row.delta)})
                </strong>
              </li>
            ))}
          </ul>
        </article>
      ) : null}
      {visitors.length ? (
        <article className="card glass-surface vcd-methodist__card">
          <h3>Посещения по наблюдателям</h3>
          <p className="muted vcd-insight__hint">Количество посещённых уроков и средняя выставленная оценка.</p>
          <ul className="vcd-insight__list">
            {visitors.slice(0, 8).map((row) => (
              <li key={row.name}>
                <span>{row.name}</span>
                <strong>
                  {row.count}
                  {row.score_pct ? ` · ${row.score_pct}%` : ''}
                </strong>
              </li>
            ))}
          </ul>
        </article>
      ) : null}
      {!pendingReady ? (
        <article className="card glass-surface vcd-methodist__card">
          <h3>Осталось посетить</h3>
          <p className="muted vcd-insight__hint">Загрузка списка педагогов…</p>
        </article>
      ) : pending.length ? (
        <article className="card glass-surface vcd-methodist__card">
          <h3>Осталось посетить</h3>
          <Queue rows={pending} />
        </article>
      ) : null}
      {recurringWeak ? (
        <article className="card glass-surface vcd-methodist__card">
          <h3>Рекомендуемая тема</h3>
          <p className="muted vcd-insight__hint">
            Критерий с низкими результатами у нескольких педагогов, который стоит обсудить на методической встрече.
          </p>
          <p className="vcd-theme">
            {recurringWeak.title}
            <span>
              {recurringWeak.score_pct}%
              {recurringWeak.teacher_count ? ` · ${recurringWeak.teacher_count} пед.` : ''}
            </span>
          </p>
        </article>
      ) : null}
    </section>
  );
}
