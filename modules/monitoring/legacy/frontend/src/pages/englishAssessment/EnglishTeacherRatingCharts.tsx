import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { formatHeldOn, formatPct } from '../../lib/englishAssessment/analyticsUi';
import type { EaTeacherRating } from '../../lib/englishAssessment/types';

const INK = '#1a1512';
const MUTED = '#5c5148';
const GREEN = '#206e46';
const AMBER = '#b47814';
const NAVY = '#1f4e79';
const RED = '#7f0a10';
const GRID = 'rgba(26, 21, 18, 0.12)';
const SERIES = ['#1f4e79', '#206e46', '#b47814', '#7f0a10', '#6b3fa0', '#0e7490', '#9a3412', '#5c5148'];
const BUCKET_KEYS = [
  { key: 'b0_20', label: '0–20%', fill: '#7f0a10' },
  { key: 'b20_40', label: '20–40%', fill: '#b47814' },
  { key: 'b40_60', label: '40–60%', fill: '#8a8078' },
  { key: 'b60_80', label: '60–80%', fill: '#1f4e79' },
  { key: 'b80_100', label: '80–100%', fill: '#206e46' },
] as const;

const tooltipStyle = {
  background: '#fff',
  border: `1px solid ${GRID}`,
  borderRadius: 8,
  color: INK,
  fontSize: 13,
  boxShadow: '0 8px 24px rgba(26,21,18,0.12)',
};

function ChartCard({
  title,
  subtitle,
  children,
  wide,
  tall,
  bodyHeight,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  tall?: boolean;
  /** Explicit height so the card reserves vertical space for ResponsiveContainer. */
  bodyHeight?: number;
}) {
  return (
    <article className={`ea-chart-card${wide ? ' ea-chart-card--wide' : ''}${tall ? ' ea-chart-card--tall' : ''}`}>
      <h3 className="ea-chart-card__title">{title}</h3>
      {subtitle ? <p className="ea-note ea-chart-card__sub">{subtitle}</p> : null}
      <div
        className="ea-chart-card__body"
        style={bodyHeight != null && bodyHeight > 0 ? { minHeight: bodyHeight } : undefined}
      >
        {children}
      </div>
    </article>
  );
}

function chartHeight(rows: number, rowPx = 28, min = 260, legendPad = 36) {
  return Math.max(min, rows * rowPx + legendPad);
}

function bandFill(band: string | undefined) {
  if (band === 'above') return GREEN;
  if (band === 'below') return RED;
  return NAVY;
}

function heatClass(v: number | null | undefined) {
  if (v == null) return '';
  if (v >= 70) return 'ea-heat--ok';
  if (v >= 50) return 'ea-heat--mid';
  return 'ea-heat--low';
}

function HeatTable({
  rows,
  cols,
  cells,
  onSelect,
  selectedId,
}: {
  rows: { id: number; name: string }[];
  cols: { key: string; title: string }[];
  cells: (number | null)[][];
  onSelect: (id: number) => void;
  selectedId: number | null;
}) {
  if (!rows.length || !cols.length) return <p className="ea-note">Недостаточно данных.</p>;
  return (
    <div className="ea-table-wrap">
      <table className="ea-table ea-rating-heat">
        <thead>
          <tr>
            <th>Педагог</th>
            {cols.map((c) => (
              <th key={c.key}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className={selectedId === row.id ? 'is-selected' : undefined}>
              <th scope="row">
                <button type="button" className="ea-linkish" onClick={() => onSelect(row.id)}>
                  {row.name}
                </button>
              </th>
              {(cells[i] || []).map((v, j) => (
                <td key={cols[j]?.key || j} className={heatClass(v)}>
                  {v == null ? '—' : `${Number(v).toFixed(0)}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EnglishTeacherRatingCharts({
  rating,
  selectedId,
  onSelect,
}: {
  rating: EaTeacherRating;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const charts = rating.charts;
  if (!charts) return null;
  const rankingH = chartHeight(charts.ranking.length, 28, 280, 16);
  const distributionH = chartHeight(charts.distribution.length, 26, 260, 48);
  const quartilesH = chartHeight(charts.quartiles.length, 26, 260, 16);
  const levelsH = chartHeight(charts.levels.length, 26, 260, 48);
  const completenessH = chartHeight(charts.completeness.length, 26, 280, 16);
  const residualH = chartHeight(charts.residual.length, 28, 280, 16);
  const radarRows =
    charts.heatmap.sections.map((section) => {
      const row: Record<string, string | number | null> = { section: section.title };
      row.Кафедра = (charts.radar_dept?.[section.code] as number | null) ?? null;
      for (const t of charts.radar) {
        row[String(t.name)] = (t[section.code] as number | null) ?? null;
      }
      return row;
    }) || [];
  const trendRows = (charts.trends.dates || []).map((date) => {
    const row: Record<string, string | number | null> = { date, label: formatHeldOn(date) };
    for (const s of charts.trends.series) {
      const hit = s.points.find((p) => p.held_on === date);
      row[s.name] = hit?.mean ?? null;
    }
    return row;
  });
  const scatter = (charts.scatter || []).map((s) => ({
    ...s,
    fill: bandFill(s.band),
    z: Math.max(40, s.students * 4),
  }));
  const pieBands = (charts.bands || []).filter((b) => b.count > 0);
  const pieFills: Record<string, string> = { above: GREEN, typical: NAVY, below: RED };

  return (
    <div className="ea-rating-charts">
      <div className="ea-analytics-split">
        <ChartCard tall bodyHeight={rankingH} title="Места по индексу" subtitle="Клик по столбцу выделяет педагога">
          {charts.ranking.length ? (
            <ResponsiveContainer width="100%" height={rankingH}>
              <BarChart
                data={charts.ranking}
                layout="vertical"
                margin={{ top: 8, right: 36, left: 4, bottom: 4 }}
                onClick={(state) => {
                  const id = (state?.activePayload?.[0]?.payload as { teacher_id?: number } | undefined)?.teacher_id;
                  if (id) onSelect(id);
                }}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11, fill: MUTED }} stroke={GRID} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, name) => [
                    name === 'composite' ? String(v) : formatPct(Number(v)),
                    name === 'composite' ? 'Индекс' : String(name),
                  ]}
                />
                <Bar dataKey="composite" radius={[0, 4, 4, 0]} barSize={16}>
                  {charts.ranking.map((row) => (
                    <Cell
                      key={row.teacher_id}
                      fill={row.teacher_id === selectedId ? AMBER : bandFill(row.band)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Пока никто не набрал минимум баллов для места.</p>
          )}
        </ChartCard>
        <ChartCard tall bodyHeight={residualH} title="Остаток к контексту" subtitle="Плюс — выше параллели и уровня">
          {charts.residual.length ? (
            <ResponsiveContainer width="100%" height={residualH}>
              <BarChart data={charts.residual} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}`} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11, fill: MUTED }} stroke={GRID} />
                <ReferenceLine x={0} stroke={INK} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => [`${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)} п.п.`, 'Остаток']}
                />
                <Bar dataKey="residual" radius={[0, 4, 4, 0]} barSize={16}>
                  {charts.residual.map((row) => (
                    <Cell key={row.teacher_id} fill={bandFill(row.band)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нет остатков для сравнения.</p>
          )}
        </ChartCard>
      </div>

      <div className="ea-analytics-split">
        <ChartCard title="Результат и контекст" subtitle="Пузырёк — число учащихся. Выше нуля — сильнее среза">
          {scatter.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis
                  type="number"
                  dataKey="mean"
                  name="Среднее"
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: MUTED }}
                  stroke={GRID}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis
                  type="number"
                  dataKey="residual"
                  name="Остаток"
                  tick={{ fontSize: 12, fill: MUTED }}
                  stroke={GRID}
                  tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}`}
                />
                <ZAxis type="number" dataKey="z" range={[40, 160]} />
                <ReferenceLine y={0} stroke={INK} />
                {rating.department?.mean != null ? (
                  <ReferenceLine x={rating.department.mean} stroke={AMBER} strokeDasharray="4 4" />
                ) : null}
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ strokeDasharray: '3 3' }}
                  formatter={(v, name) => {
                    if (name === 'Среднее') return [formatPct(Number(v)), 'Среднее'];
                    if (name === 'Остаток') return [`${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)} п.п.`, 'Остаток'];
                    return [String(v), String(name)];
                  }}
                  labelFormatter={(_, payload) => String((payload?.[0]?.payload as { name?: string } | undefined)?.name || '')}
                />
                <Scatter
                  data={scatter}
                  onClick={(d) => {
                    const id = (d as { teacher_id?: number }).teacher_id;
                    if (id) onSelect(id);
                  }}
                >
                  {scatter.map((row) => (
                    <Cell key={row.teacher_id} fill={row.teacher_id === selectedId ? AMBER : row.fill} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нужны педагоги с местом.</p>
          )}
        </ChartCard>
        <ChartCard bodyHeight={completenessH} title="Полнота выставления" subtitle="Доля полных баллов, не нолей за отсутствие">
          {charts.completeness.length ? (
            <ResponsiveContainer width="100%" height={completenessH}>
              <BarChart data={charts.completeness} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11, fill: MUTED }} stroke={GRID} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatPct(Number(v)), 'Полнота']} />
                <Bar dataKey="completeness" fill={GREEN} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нет отметок.</p>
          )}
        </ChartCard>
      </div>

      <div className="ea-analytics-split">
        <ChartCard bodyHeight={distributionH} title="Распределение баллов" subtitle="Стек последних полных результатов">
          {charts.distribution.length ? (
            <ResponsiveContainer width="100%" height={distributionH}>
              <BarChart data={charts.distribution} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11, fill: MUTED }} stroke={GRID} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                {BUCKET_KEYS.map((b) => (
                  <Bar key={b.key} dataKey={b.key} name={b.label} stackId="d" fill={b.fill} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нет распределения.</p>
          )}
        </ChartCard>
        <ChartCard title="Зоны кафедры" subtitle="Среди педагогов с местом">
          {pieBands.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieBands} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={48} outerRadius={86} paddingAngle={2}>
                  {pieBands.map((b) => (
                    <Cell key={b.key} fill={pieFills[b.key] || NAVY} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нет мест.</p>
          )}
        </ChartCard>
      </div>

      <ChartCard wide title="Теплокарта разделов" subtitle="Средний % по последней сессии раздела">
        <HeatTable
          rows={charts.heatmap.teachers}
          cols={charts.heatmap.sections.map((s) => ({ key: s.code, title: s.title }))}
          cells={charts.heatmap.cells}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      </ChartCard>

      <div className="ea-analytics-split">
        <ChartCard title="Радар разделов" subtitle="Кафедра и до шести лидеров индекса">
          {radarRows.some((r) => Object.keys(r).length > 1) ? (
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={radarRows} cx="50%" cy="50%" outerRadius="68%">
                <PolarGrid stroke={GRID} />
                <PolarAngleAxis dataKey="section" tick={{ fontSize: 11, fill: MUTED }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: MUTED }} />
                <Radar name="Кафедра" dataKey="Кафедра" stroke={AMBER} fill={AMBER} fillOpacity={0.08} />
                {charts.radar.map((t, i) => (
                  <Radar
                    key={String(t.teacher_id)}
                    name={String(t.name)}
                    dataKey={String(t.name)}
                    stroke={SERIES[i % SERIES.length]}
                    fill={SERIES[i % SERIES.length]}
                    fillOpacity={String(t.teacher_id) === String(selectedId) ? 0.18 : 0.04}
                    strokeWidth={String(t.teacher_id) === String(selectedId) ? 2.5 : 1.5}
                  />
                ))}
                <Legend />
                <Tooltip contentStyle={tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Разделы ещё не заполнены.</p>
          )}
        </ChartCard>
        <ChartCard title="Динамика" subtitle="Среднее по датам проведения, не только последняя сессия">
          {trendRows.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={trendRows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} stroke={GRID} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} width={40} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                {charts.trends.series.map((s, i) => (
                  <Line
                    key={s.teacher_id}
                    type="monotone"
                    dataKey={s.name}
                    stroke={SERIES[i % SERIES.length]}
                    strokeWidth={s.teacher_id === selectedId ? 3 : 1.75}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нужны несколько дат проведения.</p>
          )}
        </ChartCard>
      </div>

      <div className="ea-analytics-split">
        <ChartCard bodyHeight={quartilesH} title="Медиана и размах" subtitle="Квартили полных баллов">
          {charts.quartiles.length ? (
            <ResponsiveContainer width="100%" height={quartilesH}>
              <BarChart data={charts.quartiles} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11, fill: MUTED }} stroke={GRID} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, name) => [formatPct(Number(v)), String(name)]}
                />
                <Bar dataKey="median" name="Медиана" fill={NAVY} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Нет квартилей.</p>
          )}
        </ChartCard>
        <ChartCard bodyHeight={levelsH} title="Состав по уровням" subtitle="Число полных баллов в группах CEFR">
          {charts.levels.length && charts.level_keys.length ? (
            <ResponsiveContainer width="100%" height={levelsH}>
              <BarChart data={charts.levels} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11, fill: MUTED }} stroke={GRID} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                {charts.level_keys.map((code, i) => (
                  <Bar key={code} dataKey={code} stackId="lv" fill={SERIES[i % SERIES.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ea-note">Уровни не размечены.</p>
          )}
        </ChartCard>
      </div>

      <ChartCard wide title="Параллели" subtitle="Средний % педагога в каждой параллели">
        <HeatTable
          rows={charts.parallels.teachers}
          cols={charts.parallels.parallels.map((p) => ({ key: p, title: p === '—' ? '—' : `${p} кл.` }))}
          cells={charts.parallels.cells}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      </ChartCard>
    </div>
  );
}