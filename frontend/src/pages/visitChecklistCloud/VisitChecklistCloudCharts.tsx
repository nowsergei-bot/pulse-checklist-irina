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
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { type VisitChecklistDashCard, type VisitChecklistDashChartRow, type VisitChecklistDashKpis, type VisitChecklistDashTeacherListItem } from '../../api/visitChecklist';
import { VisitChecklistCategoryTick } from '../../components/VisitChecklistCategoryTick';
import type { LessonVisitChecklistConfig, LessonVisitDirectory, LessonVisitResponseRow } from '../../lib/lessonVisitChecklist/types';
import {
  VISIT_CHECKLIST_CHART_COPY as COPY,
  chartAxisWrapChars,
  chartPersonLabel,
  lessonCountLabel,
  scorePct,
  stripVisitChartVersionTokens,
  trafficColor,
  verticalCategoryChartHeight,
} from '../../lib/lessonVisitChecklist/visitChecklistCloudUi';
import type { CompareMode, CompareResult, ObserveSelfAggregate } from '../../lib/lessonVisitChecklist/visitChecklistCompare';
import { formatScoreDelta } from '../../lib/lessonVisitChecklist/visitChecklistCompare';
import {
  coverageRowHoverText,
  coverageRowVisibleLabel,
  preferChartRows,
  visitFormatChartRows,
  type CoverageGroups,
  type DeptHeatmap,
  type LiveDashboardCharts,
  type LiveVisitScore,
  type WatcherSummary,
  observeSelfSectionGaps,
} from '../../lib/lessonVisitChecklist/visitChecklistLiveCharts';
import { barColorForEngagementPct } from '../../lib/moEngagementAnalytics';
import { PDF_CARD_KEEP_TOGETHER_CLASS } from '../../lib/pdf/captureElementToPdfA4';

function colorFor(row: VisitChecklistDashChartRow): string {
  return barColorForEngagementPct(row.score_pct ?? Math.round((row.score_ratio || 0) * 100));
}

export function ChartCard({
  title,
  hint,
  children,
  tall,
  wide,
  toolbar,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  tall?: number;
  wide?: boolean;
  /** Controls above the chart body (compare pills) — kept out of SVG hit-testing. */
  toolbar?: ReactNode;
}) {
  return (
    <article className={`card glass-surface vcd-chart visit-checklist-chart ${wide ? 'vcd-chart--wide' : ''} ${PDF_CARD_KEEP_TOGETHER_CLASS}`}>
      <h3>{stripVisitChartVersionTokens(title)}</h3>
      {hint ? <p className="muted vcd-chart__hint">{stripVisitChartVersionTokens(hint)}</p> : null}
      {toolbar}
      <div className="vcd-chart__body" style={{ minHeight: tall ?? 260 }}>
        {children}
      </div>
    </article>
  );
}

export function TrafficBars({
  rows,
  height,
  limit,
  yAxisWidth,
  tooltipLabel = 'Средний балл',
  person,
}: {
  rows: VisitChecklistDashChartRow[];
  height?: number;
  /** Default 0 = every row. Positive number caps the list. */
  limit?: number;
  yAxisWidth?: number;
  tooltipLabel?: string;
  person?: boolean;
}) {
  const data = !limit ? rows : rows.slice(0, limit);
  if (!data.length) return null;
  const axisWidth = yAxisWidth ?? (person ? 236 : 208);
  const wrapWidth = chartAxisWrapChars(axisWidth);
  const chartHeight = Math.max(height ?? 0, verticalCategoryChartHeight(data.length));
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }} barCategoryGap={10}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 10, letterSpacing: 0 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={axisWidth}
          interval={0}
          tickLine={false}
          tick={(props) => (
            <VisitChecklistCategoryTick
              x={props.x}
              y={props.y}
              payload={props.payload}
              wrapWidth={wrapWidth}
              person={person}
            />
          )}
        />
        <Tooltip formatter={(value: number) => [`${Math.round(Number(value))}%`, tooltipLabel]} />
        <Bar dataKey="score_pct" name={tooltipLabel} radius={[0, 6, 6, 0]}>
          {data.map((row) => (
            <Cell key={row.name} fill={colorFor(row)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TeacherLevelBars({ rows }: { rows: VisitChecklistDashChartRow[] }) {
  if (!rows.length) return null;
  const byName = new Map(rows.map((row) => [row.name, row]));
  const axisWidth = 236;
  const wrapWidth = chartAxisWrapChars(axisWidth);
  return (
    <ResponsiveContainer width="100%" height={verticalCategoryChartHeight(rows.length, true)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }} barCategoryGap={12}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 10, letterSpacing: 0 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={axisWidth}
          interval={0}
          tickLine={false}
          tick={(props) => {
            const payload = (props as { payload?: { value?: string } }).payload;
            const row = byName.get(String(payload?.value || ''));
            return (
              <VisitChecklistCategoryTick
                x={props.x}
                y={props.y}
                payload={props.payload}
                extra={lessonCountLabel(row?.visits || 0)}
                wrapWidth={wrapWidth}
                person
              />
            );
          }}
        />
        <Tooltip
          formatter={(value: number, _name, item) => {
            const visits = Number((item?.payload as VisitChecklistDashChartRow | undefined)?.visits) || 0;
            return [`${Math.round(Number(value))}% · ${lessonCountLabel(visits)}`, 'Уровень'];
          }}
        />
        <Bar dataKey="score_pct" name="Уровень" radius={[0, 6, 6, 0]}>
          {rows.map((row) => (
            <Cell key={row.name} fill={colorFor(row)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VisitChecklistDirectorSchoolBlocks({ liveCharts }: { liveCharts?: LiveDashboardCharts | null }) {
  const weakest = liveCharts?.weakestItems || [];
  const sections = liveCharts?.sections || [];
  return (
    <>
      {weakest.length ? (
        <ChartCard title={COPY.attention.title} hint={COPY.attention.hint}>
          <TrafficBars
            rows={weakest.map((item) => ({
              name: item.title,
              visits: item.n,
              score_ratio: item.fillRatio,
              score_pct: item.score_pct,
              traffic: 'yellow',
            }))}
          />
        </ChartCard>
      ) : null}
      {sections.length ? (
        <ChartCard title={COPY.sections.title} hint={COPY.sections.hint}>
          <TrafficBars rows={sections} />
        </ChartCard>
      ) : null}
    </>
  );
}

function fallbackTeacherRows(
  teachers?: VisitChecklistDashTeacherListItem[] | null,
  directory?: LessonVisitDirectory | null,
): {
  byDept: VisitChecklistDashChartRow[];
  byTeacher: VisitChecklistDashChartRow[];
} {
  const list = teachers || [];
  const byTeacher = list.map((row) => ({
    name: chartPersonLabel(row.teacher_label, directory),
    visits: row.visit_count,
    score_ratio: row.score_ratio,
    score_pct: scorePct(row.score_ratio),
    traffic: 'yellow',
  }));
  const dep = new Map<string, { earned: number; n: number; visits: number }>();
  for (const row of list) {
    const name = row.department || 'Без кафедры';
    const cur = dep.get(name) || { earned: 0, n: 0, visits: 0 };
    cur.earned += Number(row.score_ratio) || 0;
    cur.n += 1;
    cur.visits += Number(row.visit_count) || 0;
    dep.set(name, cur);
  }
  const byDept = [...dep.entries()].map(([name, cur]) => ({
    name,
    visits: cur.visits,
    score_ratio: cur.n ? cur.earned / cur.n : 0,
    score_pct: scorePct(cur.n ? cur.earned / cur.n : 0),
    traffic: 'yellow',
  }));
  return { byDept, byTeacher };
}

function heatFill(ratio: number): string {
  if (ratio <= 0) return 'color-mix(in srgb, #94a3b8 28%, #fff)';
  return `color-mix(in srgb, ${trafficColor(ratio)} 70%, #fff)`;
}

function DeptHeatmapTable({ heatmap }: { heatmap: DeptHeatmap }) {
  if (!heatmap.departments.length || !heatmap.sections.length) return null;
  const cols = {
    gridTemplateColumns: `minmax(6.5rem, 11rem) repeat(${heatmap.sections.length}, minmax(0, 1fr))`,
  };
  return (
    <div className="vcd-heatmap" role="table" aria-label="Кафедры и разделы чек-листа">
      <div className="vcd-heatmap__row vcd-heatmap__row--head" role="row" style={cols}>
        <span className="vcd-heatmap__lab">Кафедра</span>
        {heatmap.sections.map((sec) => (
          <span key={sec.code} className="vcd-heatmap__col" title={sec.title}>
            {sec.code}
          </span>
        ))}
      </div>
      {heatmap.departments.map((department) => (
        <div key={department} className="vcd-heatmap__row" role="row" style={cols}>
          <span className="vcd-heatmap__lab">{department}</span>
          {heatmap.sections.map((sec) => {
            const cell = heatmap.cells.find((item) => item.department === department && item.code === sec.code);
            const ratio = cell?.fillRatio ?? 0;
            return (
              <span
                key={`${department}-${sec.code}`}
                className="vcd-heatmap__cell"
                style={{ background: heatFill(ratio), color: trafficColor(ratio) }}
                title={`${department} · ${sec.title}: ${scorePct(ratio)}%`}
              >
                {scorePct(ratio)}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CoverageLists({
  coverage,
  directory,
}: {
  coverage: CoverageGroups;
  directory?: LessonVisitDirectory | null;
}) {
  const blocks = [
    { title: 'Без посещений', rows: coverage.none, hint: 'В списке есть, живых записей нет' },
    { title: 'Только самоанализ', rows: coverage.selfOnly, hint: 'Наблюдения ещё не было' },
    { title: 'Только наблюдение', rows: coverage.observeOnly || [], hint: 'Самоанализа ещё не было' },
    { title: 'Мало наблюдений', rows: coverage.fewObserve, hint: 'Одно наблюдение или меньше' },
  ].filter((block) => block.rows.length);
  if (!blocks.length) return null;
  return (
    <div className="vcd-coverage">
      {blocks.map((block) => (
        <div key={block.title}>
          <p className="vcd-coverage__title">
            {block.title} · {block.rows.length}
          </p>
          <p className="muted vcd-chart__hint">{block.hint}</p>
          <ul>
            {block.rows.slice(0, 12).map((row) => (
              <li key={row.teacher_key} title={coverageRowHoverText(row)}>
                {chartPersonLabel(coverageRowVisibleLabel(row), directory)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function relabelPersonRows(
  rows: VisitChecklistDashChartRow[],
  directory?: LessonVisitDirectory | null,
): VisitChecklistDashChartRow[] {
  return rows.map((row) => ({ ...row, name: chartPersonLabel(row.name, directory) }));
}

export default function VisitChecklistCloudCharts({
  kpis,
  teachers,
  directory,
  liveCharts,
}: {
  kpis?: VisitChecklistDashKpis | null;
  teachers?: VisitChecklistDashTeacherListItem[] | null;
  liveResponses?: LessonVisitResponseRow[] | null;
  checklist?: LessonVisitChecklistConfig | null;
  directory?: LessonVisitDirectory | null;
  liveCharts?: LiveDashboardCharts | null;
}) {
  const charts = kpis?.charts;
  const fallback = fallbackTeacherRows(teachers, directory);
  const live = liveCharts || null;
  const byDept = preferChartRows(live?.by_department, preferChartRows(charts?.by_department, fallback.byDept));
  const byTeacher = relabelPersonRows(preferChartRows(charts?.by_teacher, fallback.byTeacher), directory);
  const bySubject = preferChartRows(live?.by_subject, charts?.by_subject);
  const byClass = preferChartRows(live?.by_class, charts?.by_class);
  const byFormat = visitFormatChartRows(preferChartRows(live?.by_format, charts?.by_format));
  const byVisitor = relabelPersonRows(preferChartRows(live?.by_visitor, charts?.by_visitor), directory);
  const byOrdinal = preferChartRows(live?.by_ordinal, charts?.by_ordinal);
  const trend = preferChartRows(live?.trend, charts?.trend);
  const kpiSections = (charts?.sections?.length ? charts.sections : null) ||
    (kpis?.sections || []).map((s) => ({
      name: s.title,
      visits: 0,
      score_ratio: s.fillRatio,
      score_pct: scorePct(s.fillRatio),
      traffic: 'yellow',
      code: s.code,
    }));
  const sections = preferChartRows(live?.sections, kpiSections);
  const observeSelf = live?.observeSelf;
  const kindRows = [
    observeSelf && observeSelf.observe.count
      ? { name: 'Наблюдение', score_pct: scorePct(observeSelf.observe.fillRatio), fill: '#c40b18' }
      : null,
    observeSelf && observeSelf.self.count
      ? { name: 'Самоанализ', score_pct: scorePct(observeSelf.self.fillRatio), fill: '#5b6b82' }
      : null,
  ].filter(Boolean) as Array<{ name: string; score_pct: number; fill: string }>;
  const heatmap = live?.heatmap;
  const weakest = live?.weakestItems || [];
  const coverage = live?.coverage;
  const radarReady = sections.some((row) => row.score_pct > 0);

  return (
    <section className="vcd-charts" aria-label="Диаграммы аналитики уроков">
      {heatmap && heatmap.departments.length ? (
        <ChartCard
          title={COPY.sectionsByDept.title}
          hint={COPY.sectionsByDept.hint}
          wide
          tall={Math.max(220, 64 + heatmap.departments.length * 36)}
        >
          <DeptHeatmapTable heatmap={heatmap} />
        </ChartCard>
      ) : null}
      {kindRows.length ? (
        <ChartCard title={COPY.observeSelf.title} hint={COPY.observeSelf.hint} tall={240}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={kindRows} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip formatter={(value: number) => [`${Math.round(Number(value))}%`, 'Доля баллов']} />
              <Bar dataKey="score_pct" name="Доля баллов" radius={[6, 6, 0, 0]}>
                {kindRows.map((row) => (
                  <Cell key={row.name} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
      {weakest.length ? (
        <ChartCard title={COPY.attention.title} hint={COPY.attention.hint}>
          <TrafficBars
            rows={weakest.map((item) => ({
              name: item.title,
              visits: item.n,
              score_ratio: item.fillRatio,
              score_pct: item.score_pct,
              traffic: 'yellow',
            }))}
          />
        </ChartCard>
      ) : null}
      {coverage && (coverage.none.length || coverage.selfOnly.length || coverage.observeOnly?.length || coverage.fewObserve.length) ? (
        <ChartCard title={COPY.coverage.title} hint={COPY.coverage.hint}>
          <CoverageLists coverage={coverage} directory={directory} />
        </ChartCard>
      ) : null}
      {byDept.length ? (
        <ChartCard title={COPY.departments.title} hint={COPY.departments.hint}>
          <TrafficBars rows={byDept} />
        </ChartCard>
      ) : null}
      {byTeacher.length ? (
        <ChartCard title={COPY.teachers.title} hint={COPY.teachers.hint}>
          <TrafficBars rows={byTeacher} person />
        </ChartCard>
      ) : null}
      {sections.length ? (
        <ChartCard title={COPY.sections.title} hint={COPY.sections.hint}>
          <TrafficBars rows={sections} />
        </ChartCard>
      ) : null}
      {radarReady ? (
        <ChartCard title={COPY.profile.title}>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={sections} cx="50%" cy="50%" outerRadius="68%">
              <PolarGrid stroke="rgba(26,21,18,0.12)" />
              <PolarAngleAxis dataKey="name" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar name="Средний балл" dataKey="score_pct" stroke="#c40b18" fill="#c40b18" fillOpacity={0.42} />
              <Tooltip formatter={(value: number) => [`${Math.round(Number(value))}%`, 'Средний балл']} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
      {bySubject.length ? (
        <ChartCard title={COPY.subjects.title} hint={COPY.subjects.hint}>
          <TrafficBars rows={bySubject} />
        </ChartCard>
      ) : null}
      {byClass.length ? (
        <ChartCard title={COPY.classes.title} hint={COPY.classes.hint}>
          <TrafficBars rows={byClass} />
        </ChartCard>
      ) : null}
      {byVisitor.length ? (
        <ChartCard title={COPY.visitors.title} hint={COPY.visitors.hint}>
          <TrafficBars rows={byVisitor} person />
        </ChartCard>
      ) : null}
      {byOrdinal.length ? (
        <ChartCard title={COPY.ordinal.title} hint={COPY.ordinal.hint}>
          <TrafficBars rows={byOrdinal} />
        </ChartCard>
      ) : null}
      {byFormat.length ? (
        <ChartCard title={COPY.format.title} hint={COPY.format.hint}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={byFormat} dataKey="visits" nameKey="name" outerRadius={96} label>
                {byFormat.map((row, i) => (
                  <Cell key={row.name} fill={colorFor(row) || ['#c40b18', '#1a1512', '#64748b'][i % 3]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
      {trend.length > 1 ? (
        <ChartCard title={COPY.trend.title} hint={COPY.trend.hint}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip />
              <Line type="monotone" dataKey="score_pct" name="Средний балл" stroke="#c40b18" />
              <Line type="monotone" dataKey="visits" name="Посещений" stroke="#1a1512" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
    </section>
  );
}

const SELF_FILL = '#334155';
const OBSERVE_FILL = '#c40b18';
const COHORT_FILL = '#1a1512';

function sectionPct(sec: { fillRatio?: number | null; earned?: number; max?: number }): number {
  if (sec.fillRatio != null && Number.isFinite(Number(sec.fillRatio))) return scorePct(sec.fillRatio);
  if (Number(sec.max) > 0) return scorePct(Number(sec.earned) / Number(sec.max));
  return 0;
}

export function VisitChecklistTeacherCharts({
  card,
  compare,
  compareMode,
  onCompareMode,
  observeSelf,
  trend,
  watchers,
}: {
  card: VisitChecklistDashCard;
  compare?: CompareResult | null;
  compareMode?: CompareMode;
  onCompareMode?: (mode: CompareMode) => void;
  observeSelf?: ObserveSelfAggregate | null;
  trend?: Array<{ date: string; score_pct: number; label?: string }>;
  watchers?: WatcherSummary | null;
  liveVisits?: LiveVisitScore[] | null;
}) {
  const sections = (card.stats.sections || []).map((sec) => ({
    name: String(sec.title || '').trim(),
    code: String(sec.code || ''),
    score_pct: sectionPct(sec),
    score_ratio: sectionPct(sec) / 100,
    visits: 0,
    traffic: 'yellow',
  }));
  const kind = observeSelf;
  const kindRows = [
    kind && kind.observe.count
      ? { name: 'Наблюдение', score_pct: scorePct(kind.observe.fillRatio), visits: kind.observe.count, fill: OBSERVE_FILL }
      : null,
    kind && kind.self.count
      ? { name: 'Самоанализ', score_pct: scorePct(kind.self.fillRatio), visits: kind.self.count, fill: SELF_FILL }
      : null,
  ].filter(Boolean) as Array<{ name: string; score_pct: number; visits: number; fill: string }>;

  const gapRows = observeSelfSectionGaps(kind);
  const compareOn = Boolean(compare && compare.mode !== 'none');
  const overlayRows = sections.map((sec) => {
    const hit = compare?.sections.find((row) => row.code === sec.code || row.title.startsWith(sec.name));
    return {
      name: sec.name,
      teacher: sec.score_pct,
      cohort: hit?.cohort ?? 0,
    };
  });
  const radarReady = sections.some((row) => row.score_pct > 0);
  const trendRows = trend && trend.length ? trend : [];
  if (!sections.length && !kindRows.length && !trendRows.length) return null;

  return (
    <section className="vcd-teacher-charts" aria-label="Диаграммы педагога">
      {radarReady ? (
        <ChartCard title={COPY.profile.title} tall={280}>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={sections} cx="50%" cy="50%" outerRadius="68%">
              <PolarGrid stroke="#64748b" />
              <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: '#1a1512' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#1a1512' }} />
              <Radar name="Балл" dataKey="score_pct" stroke={OBSERVE_FILL} fill={OBSERVE_FILL} fillOpacity={0.42} />
              <Tooltip formatter={(value: number) => [`${Math.round(Number(value))}%`, 'Доля баллов']} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
      {overlayRows.length ? (
        <ChartCard
          title={COPY.compare.title}
          hint={COPY.compare.hint}
          toolbar={
            onCompareMode ? (
              <div className="vcd-compare-toggle" role="group" aria-label="Сравнить с">
                {(
                  [
                    ['department', 'Кафедра'],
                    ['school', 'Гимназия'],
                    ['none', 'Скрыть сравнение'],
                  ] as Array<[CompareMode, string]>
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={`vcd-chip ${compareMode === mode ? 'vcd-chip--observe' : 'vcd-chip--ghost'}`}
                    onClick={() => onCompareMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null
          }
        >
          <ResponsiveContainer width="100%" height={verticalCategoryChartHeight(overlayRows.length)}>
            <BarChart data={overlayRows} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }} barCategoryGap={10}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 10, letterSpacing: 0 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={208}
                interval={0}
                tickLine={false}
                tick={(props) => (
                  <VisitChecklistCategoryTick x={props.x} y={props.y} payload={props.payload} wrapWidth={chartAxisWrapChars(208)} />
                )}
              />
              <Tooltip formatter={(value: number) => [`${Math.round(Number(value))}%`, '']} />
              {compareOn ? <Legend /> : null}
              <Bar dataKey="teacher" name="Педагог" fill={OBSERVE_FILL} radius={[0, 6, 6, 0]} barSize={12} />
              {compareOn ? <Bar dataKey="cohort" name={compare?.mode === 'department' ? 'Кафедра' : 'Гимназия'} fill={COHORT_FILL} radius={[0, 6, 6, 0]} barSize={6} /> : null}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
      {kindRows.length ? (
        <ChartCard title={COPY.teacherObserveSelf.title} hint={COPY.teacherObserveSelf.hint} tall={240}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={kindRows} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip formatter={(value: number) => [`${Math.round(Number(value))}%`, 'Доля баллов']} />
              <Bar dataKey="score_pct" name="Доля баллов" radius={[6, 6, 0, 0]}>
                {kindRows.map((row) => (
                  <Cell key={row.name} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
      {gapRows.length ? (
        <ChartCard title={COPY.sectionGap.title} hint={COPY.sectionGap.hint} tall={verticalCategoryChartHeight(gapRows.length)}>
          <ResponsiveContainer width="100%" height={verticalCategoryChartHeight(gapRows.length)}>
            <BarChart data={gapRows} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }} barCategoryGap={10}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 10, letterSpacing: 0 }} />
              <YAxis
                type="category"
                dataKey="title"
                width={208}
                interval={0}
                tickLine={false}
                tick={(props) => (
                  <VisitChecklistCategoryTick x={props.x} y={props.y} payload={props.payload} wrapWidth={chartAxisWrapChars(208)} />
                )}
              />
              <Tooltip formatter={(value: number) => [`${Math.round(Number(value))}%`, '']} />
              <Legend />
              <Bar dataKey="observe" name="Наблюдение" fill={OBSERVE_FILL} radius={[0, 6, 6, 0]} />
              <Bar dataKey="self" name="Самоанализ" fill={SELF_FILL} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {gapRows.some((row) => row.flagged) ? (
            <ul className="vcd-gap-flags">
              {gapRows
                .filter((row) => row.flagged)
                .map((row) => (
                  <li key={row.code}>
                    {row.title}: самоанализ {row.self}% · наблюдение {row.observe}% ({formatScoreDelta(row.gap)})
                  </li>
                ))}
            </ul>
          ) : null}
        </ChartCard>
      ) : null}
      {trendRows.length > 1 ? (
        <ChartCard title={COPY.recentVisits.title} hint={COPY.recentVisits.hint} tall={240}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip />
              <Line type="monotone" dataKey="score_pct" name="Балл визита" stroke={OBSERVE_FILL} />
              <ReferenceLine y={scorePct(card.stats.score_ratio)} stroke={COHORT_FILL} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
      {watchers && (watchers.offline || watchers.online || watchers.self) ? (
        <ChartCard title={COPY.watchers.title} hint={COPY.watchers.hint} tall={120}>
          <p className="vcd-chips">
            <span className="vcd-chip vcd-chip--observe">Очно · {watchers.offline}</span>
            <span className="vcd-chip vcd-chip--observe">Онлайн · {watchers.online}</span>
            <span className="vcd-chip vcd-chip--self">Самоанализ · {watchers.self}</span>
          </p>
          {watchers.visitors.length ? (
            <ul className="vcd-watchers">
              {watchers.visitors.map((row) => (
                <li key={row.name}>
                  {row.name} · {row.count}
                </li>
              ))}
            </ul>
          ) : null}
        </ChartCard>
      ) : null}
    </section>
  );
}
