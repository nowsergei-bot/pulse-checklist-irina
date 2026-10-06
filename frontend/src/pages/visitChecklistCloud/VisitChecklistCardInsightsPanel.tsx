import {
  trendDirectionLabel,
  type MethodistDraft,
  type TeacherCardInsights,
} from '../../lib/lessonVisitChecklist/visitChecklistCardInsights';
import { formatEarnedMax } from '../../lib/lessonVisitChecklist/visitChecklistCloudUi';
import type { RubricHighlight } from '../../lib/lessonVisitChecklist/visitChecklistLiveCharts';
import { PDF_CARD_KEEP_TOGETHER_CLASS } from '../../lib/pdf/captureElementToPdfA4';

const COVERAGE_METRICS = [
  {
    key: 'scoredPct',
    tone: 'ok',
    title: 'С оценкой',
    hint: 'Доля пунктов рубрики, где выставлен балл или явный выбор',
  },
  {
    key: 'zeroPct',
    tone: 'zero',
    title: 'Явный ноль',
    hint: 'Пункты, где наблюдатель отметил «0» или эквивалент отсутствия практики',
  },
  {
    key: 'unansweredPct',
    tone: 'empty',
    title: 'Пропущено',
    hint: 'Пункты без ответа — не учитываются в среднем балле',
  },
] as const;

function SliceList({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: TeacherCardInsights['bySubject'];
}) {
  if (!rows.length) return null;
  return (
    <div className="vcd-insight__col">
      <p className="vcd-insight__label">{title}</p>
      <p className="vcd-insight__hint">{hint}</p>
      <ul className="vcd-insight__list">
        {rows.slice(0, 6).map((row) => (
          <li key={row.name}>
            <span>{row.name}</span>
            <strong>
              {row.score_pct}% · {row.visits} ур.
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CriterionList({ title, hint, rows }: { title: string; hint: string; rows: RubricHighlight[] }) {
  if (!rows.length) return null;
  return (
    <div className="vcd-insight__col">
      <p className="vcd-insight__label">{title}</p>
      <p className="vcd-insight__hint">{hint}</p>
      <ul className="vcd-insight__list">
        {rows.map((item) => (
          <li key={item.code}>
            <span>{item.title}</span>
            <strong>{formatEarnedMax(item.earned, item.max)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VisitChecklistDraftBlock({
  draft,
  compact,
}: {
  draft: MethodistDraft;
  compact?: boolean;
}) {
  const lines = [draft.keep, draft.strengthen, draft.check].filter(Boolean);
  if (!lines.length) return null;
  return (
    <aside className={`vcd-draft ${PDF_CARD_KEEP_TOGETHER_CLASS}`}>
      <p className="vcd-insight__label">{compact ? 'Выводы по данным' : 'Черновик выводов'}</p>
      {compact ? null : <p className="muted vcd-insight__hint">Не заменяет текст методиста и ИИ.</p>}
      <ul className="vcd-draft__list">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </aside>
  );
}

export default function VisitChecklistCardInsightsPanel({
  insights,
  weakItems,
  strongItems,
}: {
  insights: TeacherCardInsights;
  weakItems?: RubricHighlight[];
  strongItems?: RubricHighlight[];
}) {
  const { coverage, strengths, weaknesses, bySubject, byClass, trend } = insights;
  const hasCoverage = coverage.total > 0;
  const hasCriteria = Boolean(strongItems?.length || weakItems?.length);
  const hasLists = strengths.length || weaknesses.length || bySubject.length || byClass.length || hasCriteria;
  if (!hasCoverage && !hasLists && trend.points.length < 2) return null;

  return (
    <section className={`vcd-insights ${PDF_CARD_KEEP_TOGETHER_CLASS}`} aria-label="Сводка по карточке">
      {trend.points.length > 1 ? (
        <p className="vcd-insight__trend">
          Последние {trend.points.length} визитов: <strong>{trendDirectionLabel(trend.direction)}</strong>
          {trend.points.map((point) => ` ${point.score_pct}%`).join(' →')}
        </p>
      ) : null}
      {hasCoverage ? (
        <div className="vcd-cov" aria-label="Заполненность рубрики">
          <p className="vcd-insight__label">Заполненность рубрики</p>
          <p className="vcd-insight__hint">По всем посещениям педагога: что отмечено, где ноль, что пропущено.</p>
          <div className="vcd-cov__grid">
            {COVERAGE_METRICS.map((metric) => (
              <article key={metric.key} className={`vcd-cov__tile vcd-cov__tile--${metric.tone}`}>
                <span className="vcd-cov__value">{coverage[metric.key]}%</span>
                <span className="vcd-cov__title">{metric.title}</span>
                <span className="vcd-cov__hint">{metric.hint}</span>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {bySubject.length || byClass.length ? (
        <div className="vcd-insight__grid">
          <SliceList title="По предметам" hint="Средний балл и число уроков в каждом предмете." rows={bySubject} />
          <SliceList title="По классам" hint="Средний балл и число уроков в каждом классе." rows={byClass} />
        </div>
      ) : null}
      {hasCriteria ? (
        <div className="vcd-insight__grid">
          <CriterionList title="Сильные критерии" hint="Топ пунктов рубрики с высокими баллами." rows={strongItems || []} />
          <CriterionList title="Слабые критерии" hint="Топ пунктов, где баллы ниже остальных." rows={weakItems || []} />
        </div>
      ) : null}
      {strengths.length || weaknesses.length ? (
        <div className="vcd-insight__grid">
          {strengths.length ? (
            <div className="vcd-insight__col">
              <p className="vcd-insight__label">Стабильно сильно</p>
              <p className="vcd-insight__hint">Критерии с высокими оценками в нескольких визитах подряд.</p>
              <ul className="vcd-insight__list">
                {strengths.map((item) => (
                  <li key={`s-${item.code}`}>
                    <span>{item.title}</span>
                    <strong>{item.streak}×</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {weaknesses.length ? (
            <div className="vcd-insight__col">
              <p className="vcd-insight__label">Стабильно слабо</p>
              <p className="vcd-insight__hint">Критерии с низкими оценками в нескольких визитах подряд.</p>
              <ul className="vcd-insight__list">
                {weaknesses.map((item) => (
                  <li key={`w-${item.code}`}>
                    <span>{item.title}</span>
                    <strong>{item.streak}×</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
