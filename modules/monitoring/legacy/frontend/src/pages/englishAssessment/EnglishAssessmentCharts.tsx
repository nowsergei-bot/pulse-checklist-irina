import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCount, formatHeldOnLong, formatPct } from '../../lib/englishAssessment/analyticsUi';

const INK = '#1a1512';
const MUTED = '#5c5148';
const GREEN = '#206e46';
const AMBER = '#b47814';
const NAVY = '#1f4e79';
const GRID = 'rgba(26, 21, 18, 0.12)';

const tooltipStyle = {
  background: '#fff',
  border: `1px solid ${GRID}`,
  borderRadius: 8,
  color: INK,
  fontSize: 13,
  boxShadow: '0 8px 24px rgba(26,21,18,0.12)',
};

function tipPct(value: unknown, counted?: unknown): [string, string] {
  const n = counted != null ? ` · n=${counted}` : '';
  return [`${Number(value).toFixed(1)}%${n}`, 'Среднее'];
}

function ChartCard({
  title,
  subtitle,
  children,
  tall,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  tall?: boolean;
}) {
  return (
    <article className={`ea-chart-card${tall ? ' ea-chart-card--tall' : ''}`}>
      <h3 className="ea-chart-card__title">{title}</h3>
      {subtitle ? <p className="ea-note ea-chart-card__sub">{subtitle}</p> : null}
      <div className="ea-chart-card__body">{children}</div>
    </article>
  );
}

export type ExtraTab = 'cefr' | 'works' | 'dist';

export type EnglishChartDrill = {
  parallel?: string;
  classKey?: string;
  level?: string;
  group?: string;
  bucket?: string;
  students?: boolean;
};

type AttentionGroup = { id: number; title: string; mean: number | null };

type Props = {
  trendChart: Array<{ label: string; date: string; mean: number | null; counted: number }>;
  parallelChart: Array<{ name: string; parallel: string; mean: number; counted?: number }>;
  sectionChart: Array<{ name: string; mean: number; counted?: number }>;
  levelChart: Array<{ code: string; name: string; mean: number; counted: number; groups: number }>;
  workTypeChart: Array<{ name: string; mean: number; counted: number }>;
  distributionChart: Array<{ key: string; name: string; count: number }>;
  attention: AttentionGroup[];
  emptyCount: number;
  extraTab: ExtraTab;
  onExtraTab: (tab: ExtraTab) => void;
  onDrill: (patch: EnglishChartDrill) => void;
  onEmptyFilter: () => void;
};

export function TeacherTrendChart({
  trendChart,
}: {
  trendChart: Array<{ label: string; date: string; mean: number | null; counted: number }>;
}) {
  return (
    <article className="ea-chart-card ea-chart-card--tall">
      <h3 className="ea-chart-card__title">Личная динамика</h3>
      <p className="ea-note ea-chart-card__sub">Только ваши группы, без сравнения с коллегами</p>
      <div className="ea-chart-card__body">
        {trendChart.some((t) => t.mean != null) ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} width={40} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => tipPct(v)} />
              <Line type="monotone" dataKey="mean" stroke={NAVY} strokeWidth={2.5} dot={{ r: 4, fill: NAVY }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="ea-note">Динамика появится после нескольких дат проведения.</p>
        )}
      </div>
    </article>
  );
}

export default function EnglishAssessmentCharts({
  trendChart,
  parallelChart,
  sectionChart,
  levelChart,
  workTypeChart,
  distributionChart,
  attention,
  emptyCount,
  extraTab,
  onExtraTab,
  onDrill,
  onEmptyFilter,
}: Props) {
  return (
    <>
      <div className="ea-analytics-hero">
        <ChartCard tall title="Динамика" subtitle="Средний % по датам проведения">
          {trendChart.some((t) => t.mean != null) ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendChart} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} interval={0} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: MUTED }}
                  stroke={GRID}
                  width={40}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(_, payload) => {
                    const iso = (payload?.[0]?.payload as { date?: string } | undefined)?.date;
                    return formatHeldOnLong(iso);
                  }}
                  formatter={(v, _n, item) => tipPct(v, (item?.payload as { counted?: number } | undefined)?.counted)}
                />
                <Line type="monotone" dataKey="mean" stroke={NAVY} strokeWidth={2.5} dot={{ r: 4, fill: NAVY }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нужно несколько дат проведения.</p>
          )}
        </ChartCard>
        <article className="ea-attention">
          <h3 className="ea-chart-card__title">Требуют внимания</h3>
          <p className="ea-note ea-chart-card__sub">Результат ниже 50% по уже выставленным баллам</p>
          {attention.length ? (
            <ul className="ea-attention__list">
              {attention.slice(0, 8).map((g) => (
                <li key={g.id}>
                  <button type="button" className="ea-linkish" onClick={() => onDrill({ group: String(g.id), students: true })}>
                    {g.title}
                  </button>
                  <span className="ea-badge ea-badge--low">{formatPct(g.mean)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ea-note">Нет групп ниже 50% в выбранном срезе.</p>
          )}
          {emptyCount ? (
            <button type="button" className="ea-linkish ea-attention__empty" onClick={onEmptyFilter}>
              Без баллов: {formatCount(emptyCount)} групп
            </button>
          ) : null}
        </article>
      </div>

      <div className="ea-analytics-split">
        <ChartCard title="Параллели" subtitle="Клик — группы параллели">
          {parallelChart.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={parallelChart}
                layout="vertical"
                margin={{ top: 8, right: 36, left: 4, bottom: 4 }}
                onClick={(state) => {
                  const p = (state?.activePayload?.[0]?.payload as { parallel?: string } | undefined)?.parallel;
                  if (p) onDrill({ parallel: p, classKey: `p:${p}`, group: '', bucket: '', students: false });
                }}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={36} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, _n, item) => tipPct(v, (item?.payload as { counted?: number } | undefined)?.counted)}
                />
                <Bar dataKey="mean" fill={NAVY} radius={[0, 4, 4, 0]} barSize={16}>
                  <LabelList dataKey="mean" position="right" formatter={(v: unknown) => `${Number(v).toFixed(0)}%`} style={{ fontSize: 11, fill: MUTED }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нет среза по параллелям.</p>
          )}
        </ChartCard>
        <ChartCard title="Разделы" subtitle="Listening, Reading, грамматика, письмо">
          {sectionChart.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sectionChart} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} stroke={GRID} interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} width={40} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, _n, item) => tipPct(v, (item?.payload as { counted?: number } | undefined)?.counted)}
                />
                <Bar dataKey="mean" fill={NAVY} radius={[4, 4, 0, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Пока нет выставленных разделов.</p>
          )}
        </ChartCard>
      </div>

      <div className="ea-extra-tabs">
        <div className="ea-tabs" role="tablist" aria-label="Дополнительные разрезы">
          {(
            [
              ['cefr', 'Уровни CEFR'],
              ['works', 'Типы работ'],
              ['dist', 'Распределение'],
            ] as [ExtraTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={extraTab === id}
              className={`ea-tab${extraTab === id ? ' is-current' : ''}`}
              onClick={() => onExtraTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {extraTab === 'cefr' ? (
          <ChartCard title="Уровни CEFR" subtitle="Клик — фильтр уровня">
            {levelChart.some((l) => l.counted > 0 || l.groups > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={levelChart}
                  onClick={(state) => {
                    const code = (state?.activePayload?.[0]?.payload as { code?: string } | undefined)?.code;
                    if (code) onDrill({ level: code, group: '', bucket: '', students: false });
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} width={40} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => tipPct(v)} />
                  <Bar dataKey="mean" fill={NAVY} radius={[4, 4, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="ea-note">Уровни ещё не размечены.</p>
            )}
          </ChartCard>
        ) : null}
        {extraTab === 'works' ? (
          <ChartCard title="Типы работ">
            {workTypeChart.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={workTypeChart} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} tickFormatter={(v: number) => `${v}%`} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => tipPct(v)} />
                  <Bar dataKey="mean" fill={AMBER} radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="ea-note">Типы работ ещё не заполнены.</p>
            )}
          </ChartCard>
        ) : null}
        {extraTab === 'dist' ? (
          <ChartCard title="Распределение" subtitle="Клик — список учащихся в интервале">
            {distributionChart.some((d) => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={distributionChart}
                  onClick={(state) => {
                    const key = (state?.activePayload?.[0]?.payload as { key?: string } | undefined)?.key;
                    if (key) onDrill({ bucket: key, students: true, group: '' });
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} width={40} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatCount(Number(v)), 'Учеников']} />
                  <Bar dataKey="count" fill={GREEN} radius={[4, 4, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="ea-note">Нет полных результатов для распределения.</p>
            )}
          </ChartCard>
        ) : null}
      </div>
    </>
  );
}

/** Диаграммы кабинета преподавателя: только свои группы, без сравнения с коллегами. */
export function TeacherOwnCharts({
  trendChart,
  groupChart,
  sectionChart,
  parallelChart,
  workTypeChart,
  distributionChart,
  levelChart,
  completenessChart,
  sessionChart,
}: {
  trendChart: Array<{ label: string; date: string; mean: number | null; counted: number }>;
  groupChart: Array<{ name: string; mean: number; counted: number }>;
  sectionChart: Array<{ name: string; mean: number; counted: number }>;
  parallelChart: Array<{ name: string; mean: number; counted: number }>;
  workTypeChart: Array<{ name: string; mean: number; counted: number }>;
  distributionChart: Array<{ name: string; count: number }>;
  levelChart: Array<{ name: string; mean: number; counted: number; groups: number }>;
  completenessChart: Array<{ name: string; filled: number; roster: number; pct: number }>;
  sessionChart: Array<{ name: string; mean: number; counted: number }>;
}) {
  const hasTrend = trendChart.some((t) => t.mean != null);
  return (
    <div className="ea-teacher-charts">
      <TeacherTrendChart trendChart={trendChart} />

      <div className="ea-analytics-split">
        <ChartCard title="Ваши группы" subtitle="Средний % по каждой группе">
          {groupChart.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={groupChart} layout="vertical" margin={{ top: 8, right: 36, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, _n, item) => tipPct(v, (item?.payload as { counted?: number })?.counted)} />
                <Bar dataKey="mean" fill={NAVY} radius={[0, 4, 4, 0]} barSize={16}>
                  <LabelList dataKey="mean" position="right" formatter={(v: unknown) => `${Number(v).toFixed(0)}%`} style={{ fontSize: 11, fill: MUTED }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Появится после первых баллов.</p>
          )}
        </ChartCard>
        <ChartCard title="Разделы" subtitle="Listening, Reading и др. — только ваши группы">
          {sectionChart.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sectionChart} margin={{ top: 8, right: 8, left: 0, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} stroke={GRID} interval={0} angle={-18} textAnchor="end" height={52} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} width={40} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, _n, item) => tipPct(v, (item?.payload as { counted?: number })?.counted)} />
                <Bar dataKey="mean" fill={NAVY} radius={[4, 4, 0, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Пока нет выставленных разделов.</p>
          )}
        </ChartCard>
      </div>

      <div className="ea-analytics-split">
        <ChartCard title="Параллели" subtitle="Срез по вашим параллелям">
          {parallelChart.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={parallelChart} layout="vertical" margin={{ top: 8, right: 28, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={40} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => tipPct(v)} />
                <Bar dataKey="mean" fill={GREEN} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нет данных по параллелям.</p>
          )}
        </ChartCard>
        <ChartCard title="Типы работ" subtitle="Текущие / входные / контрольные">
          {workTypeChart.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={workTypeChart} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => tipPct(v)} />
                <Bar dataKey="mean" fill={AMBER} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Типы работ ещё не заполнены.</p>
          )}
        </ChartCard>
      </div>

      <div className="ea-analytics-split">
        <ChartCard title="Распределение баллов" subtitle="Сколько ваших учащихся в каждом интервале %">
          {distributionChart.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={distributionChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} width={40} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatCount(Number(v)), 'Учащихся']} />
                <Bar dataKey="count" fill={GREEN} radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нет полных результатов.</p>
          )}
        </ChartCard>
        <ChartCard title="Уровни CEFR" subtitle="Только размеченные ваши группы">
          {levelChart.some((l) => l.counted > 0 || l.groups > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={levelChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} width={40} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => tipPct(v)} />
                <Bar dataKey="mean" fill={NAVY} radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Уровни ещё не размечены.</p>
          )}
        </ChartCard>
      </div>

      <div className="ea-analytics-split">
        <ChartCard title="Полнота по группам" subtitle="% выставленных баллов от состава">
          {completenessChart.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={completenessChart} layout="vertical" margin={{ top: 8, right: 36, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, _n, item) => {
                    const p = item?.payload as { filled?: number; roster?: number } | undefined;
                    return [`${Number(v).toFixed(0)}% (${p?.filled ?? 0}/${p?.roster ?? 0})`, 'Полнота'];
                  }}
                />
                <Bar dataKey="pct" fill={AMBER} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нет состава групп.</p>
          )}
        </ChartCard>
        <ChartCard title="Недавние работы" subtitle="Последние сессии ваших групп">
          {sessionChart.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={sessionChart} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED }} stroke={GRID} interval={0} angle={-24} textAnchor="end" height={64} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} width={40} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, _n, item) => tipPct(v, (item?.payload as { counted?: number })?.counted)} />
                <Bar dataKey="mean" fill={NAVY} radius={[4, 4, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Сессии появятся после сохранений.</p>
          )}
        </ChartCard>
      </div>

      {!hasTrend && !groupChart.length ? (
        <p className="ea-note">Сводка и диаграммы заполнятся после первых выставленных баллов.</p>
      ) : null}
    </div>
  );
}
