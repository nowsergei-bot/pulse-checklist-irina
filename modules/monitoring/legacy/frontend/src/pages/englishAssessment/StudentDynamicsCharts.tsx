import { useMemo, type ReactNode } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  formatHeldOn,
  formatPct,
  normalizeHeldOn,
  overallTestPercent,
  scoreZone,
  zoneBadgeClass,
} from '../../lib/englishAssessment/analyticsUi';
import type { EaScoreRow } from '../../lib/englishAssessment/types';

const NAVY = '#1f4e79';
const GREEN = '#206e46';
const AMBER = '#b47814';
const RED = '#8a1218';
const GRID = '#e6e0d6';
const MUTED = '#6b6560';
const SECTION_COLORS = [NAVY, GREEN, AMBER, RED, '#5b4b8a'];

const tooltipStyle = {
  border: `1px solid ${GRID}`,
  borderRadius: 0,
  fontSize: 12,
};

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <article className="ea-chart-card">
      <h3 className="ea-chart-card__title">{title}</h3>
      {subtitle ? <p className="ea-note ea-chart-card__sub">{subtitle}</p> : null}
      <div className="ea-chart-card__body">{children}</div>
    </article>
  );
}

/** Динамика одного учащегося по датам и разделам (без сравнения с другими). */
export default function StudentDynamicsCharts({ history }: { history: EaScoreRow[] }) {
  const complete = useMemo(
    () => (history || []).filter((r) => r.status === 'complete' && r.percent != null && r.held_on),
    [history],
  );

  const overallTrend = useMemo(() => {
    const byDate = new Map<string, EaScoreRow[]>();
    for (const row of complete) {
      const d = normalizeHeldOn(row.held_on);
      if (!d) continue;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(row);
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, vals]) => ({
        date,
        label: formatHeldOn(date),
        mean: overallTestPercent(vals),
        skillMean: Math.round((vals.reduce((a, b) => a + Number(b.percent), 0) / vals.length) * 10) / 10,
        counted: vals.length,
      }));
  }, [complete]);

  const sectionKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of complete) {
      const code = row.section_code || 'other';
      if (!map.has(code)) map.set(code, row.section_title || code);
    }
    return [...map.entries()];
  }, [complete]);

  const sectionTrend = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string | null>>();
    for (const row of complete) {
      const d = normalizeHeldOn(row.held_on);
      if (!d) continue;
      if (!byDate.has(d)) byDate.set(d, { date: d, label: formatHeldOn(d) });
      const code = row.section_code || 'other';
      byDate.get(d)![code] = Number(row.percent);
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [complete]);

  const latest = overallTrend.length ? overallTrend[overallTrend.length - 1] : null;
  const prev = overallTrend.length > 1 ? overallTrend[overallTrend.length - 2] : null;
  const delta =
    latest?.mean != null && prev?.mean != null
      ? Math.round((latest.mean - prev.mean) * 10) / 10
      : null;

  if (!complete.length) {
    return (
      <p className="ea-note">Динамика появится после выставленных баллов по датам.</p>
    );
  }

  return (
    <div className="ea-student-dynamics">
      <div className="ea-kpi-grid">
        <div className="ea-stat">
          <span className="ea-kicker">Итог теста</span>
          <strong>
            <span className={zoneBadgeClass(scoreZone(latest?.mean), latest?.mean)}>
              {formatPct(latest?.mean ?? null)}
            </span>
          </strong>
          <span className="ea-note">
            {latest ? formatHeldOn(latest.date) : '—'} · сумма баллов / сумма максимумов
          </span>
        </div>
        <div className="ea-stat">
          <span className="ea-kicker">К прошлому срезу</span>
          <strong>
            {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toLocaleString('ru-RU')} п.п.`}
          </strong>
          <span className="ea-note">только этот учащийся</span>
        </div>
        <div className="ea-stat">
          <span className="ea-kicker">Среднее по навыкам</span>
          <strong>{formatPct(latest?.skillMean ?? null)}</strong>
          <span className="ea-note">среднее процентов разделов, не итог теста</span>
        </div>
        <div className="ea-stat">
          <span className="ea-kicker">Зона</span>
          <strong>{latest?.mean != null ? (
            <span className={zoneBadgeClass(scoreZone(latest.mean), latest.mean)}>
              {scoreZone(latest.mean) === 'green'
                ? 'Высокий'
                : scoreZone(latest.mean) === 'yellow'
                  ? 'Средний'
                  : scoreZone(latest.mean) === 'red'
                    ? 'Ниже среднего'
                    : 'Риск'}
            </span>
          ) : (
            '—'
          )}</strong>
        </div>
      </div>

      <div className="ea-analytics-split">
        <ChartCard title="Динамика итога" subtitle="Сумма баллов / сумма максимумов на дату">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={overallTrend} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} width={40} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Итог теста']} />
              <Line type="monotone" dataKey="mean" stroke={NAVY} strokeWidth={2.5} dot={{ r: 4, fill: NAVY }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="По разделам" subtitle="Listening / Reading / …">
          {sectionKeys.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={sectionTrend} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} width={40} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${Number(v).toFixed(1)}%`, String(name)]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {sectionKeys.map(([code, title], i) => (
                  <Line
                    key={code}
                    type="monotone"
                    dataKey={code}
                    name={title}
                    stroke={SECTION_COLORS[i % SECTION_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Пока один срез — линии разделов появятся позже.</p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
