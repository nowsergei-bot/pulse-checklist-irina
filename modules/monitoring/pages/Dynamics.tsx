import type { ReactNode } from 'react';

// Графики и таблицы вкладки «Динамика»: SVG и CSS без сторонних библиотек.
// Все значения: проценты выполнения (работы разные, максимумы разные). Разница: процентные пункты.

export type Section = { code: string; name: string };
export type Point = { key: string; title: string; type_code: string; held_on: string | null };
export type Avg = { avg: number; n: number } | null;
export type Progress = { up: number; same: number; down: number; no_data: number; students: number };
export type Band = { code: string; name: string; n: number; up: number; same: number; down: number; avg_gain: number | null };
export type DynRow = {
  kind: 'group' | 'parallel'; row: string; group_id?: number; digital?: boolean; students: number;
  lines: Record<string, Record<string, Avg>>; progress: Record<string, Progress>; bands: Record<string, Band[]>;
};
export type Student = { id: number; full_name: string; values: Record<string, Record<string, number | null>>; to_start: number | null };
export type RiskStudent = { group: string; full_name: string; values: (number | null)[]; reasons: { code: string; text: string }[] };
export type Ege = {
  work: string; max_points: number;
  blocks: { title: string; section: string; level: string; level_name: string; max: number }[];
  rows: { kind: 'group' | 'parallel'; row: string; students: number; complete: number; avg_total: number | null; avg_percent: number | null; blocks: (number | null)[]; basic: number | null; high: number | null }[];
};

export const fmt = (v: number) => v.toLocaleString('ru-RU');
export const signed = (v: number) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(-v)}` : '0');
export const diffClass = (v: number) => (v > 0 ? 'is-up' : v < 0 ? 'is-down' : 'is-same');
// Доли в процентах, в сумме ровно 100: целые части, затем по единице долям с наибольшим остатком
// (при равенстве остатков раньше та, что левее).
export function shares100(counts: number[]): number[] {
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n) return counts.map(() => 0);
  const raw = counts.map(c => (100 * c) / n);
  const out = raw.map(Math.floor);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const rest = 100 - out.reduce((a, b) => a + b, 0);
  for (let k = 0; k < rest; k += 1) out[order[k][1]] += 1;
  return out;
}
const COLORS = ['#50708f', '#3f8f5f', '#c27c0e', '#8a5aa8', '#c4473a', '#2f8f9a', '#6b6b6b'];

export function Card({ title, note, legend, children, caption }: { title: string; note?: string; legend?: ReactNode; children: ReactNode; caption?: string }) {
  return (
    <figure className="mon-viz__card">
      <figcaption>
        <h4 className="mon-viz__title">{title}</h4>
        {note ? <p className="mon-viz__note">{note}</p> : null}
        {legend}
      </figcaption>
      {children}
      {caption ? <p className="mon-prog__caption">{caption}</p> : null}
    </figure>
  );
}

// Линии: x по работам (входное первым), y процент 0-100. Группы цветом, параллель пунктиром.
export function LineChart({ points, series, height = 300, width = 820 }: {
  points: Point[];
  series: { label: string; values: (number | null)[]; dashed?: boolean; color?: string }[];
  height?: number;
  width?: number;
}) {
  const left = 40;
  const right = 120;
  const top = 14;
  const h = height - top - 40;
  const step = points.length > 1 ? (width - left - right) / (points.length - 1) : 0;
  const x = (i: number) => left + (points.length > 1 ? i * step : (width - left - right) / 2);
  const y = (v: number) => top + h - (h * v) / 100;
  // Подписи в конце линий раздвигаются по вертикали, чтобы не налезали друг на друга.
  const ends = series.map((s, k) => {
    const i = s.values.map((v, j) => (v === null ? -1 : j)).filter(j => j >= 0).pop();
    return i === undefined ? null : { k, x: x(i), y: y(s.values[i] as number) + 4, v: s.values[i] as number };
  }).filter((e): e is { k: number; x: number; y: number; v: number } => Boolean(e)).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i += 1) if (ends[i].x === ends[i - 1].x && ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  const labelY = new Map(ends.map(e => [e.k, e.y]));
  return (
    <svg className="mon-viz__svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Динамика по работам">
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line className="mon-viz__gridline" x1={left} x2={width - right + 10} y1={y(v)} y2={y(v)} />
          <text className="mon-viz__axis" x={left - 8} y={y(v) + 4} textAnchor="end">{v}</text>
        </g>
      ))}
      {points.map((p, i) => (
        <text key={p.key} className="mon-viz__xlabel" x={x(i)} y={top + h + 24} textAnchor="middle">{p.title}</text>
      ))}
      {series.map((s, k) => {
        const color = s.color || COLORS[k % COLORS.length];
        const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v), v] as const));
        const segs: string[] = [];
        let cur = '';
        pts.forEach(p => {
          if (!p) return;
          cur += `${cur ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
        });
        if (cur) segs.push(cur);
        const last = [...pts].reverse().find(Boolean);
        return (
          <g key={s.label}>
            {segs.map((d, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth={s.dashed ? 2.5 : 2.2} strokeDasharray={s.dashed ? '7 5' : undefined} />)}
            {pts.map((p, i) => (p ? (
              <circle key={i} cx={p[0]} cy={p[1]} r={s.dashed ? 3 : 4} fill={s.dashed ? '#fff' : color} stroke={color} strokeWidth={2}>
                <title>{`${s.label}, ${points[i].title}: ${fmt(p[2])} %`}</title>
              </circle>
            ) : null))}
            {last ? <text x={last[0] + 10} y={labelY.get(k) ?? last[1] + 4} className="mon-prog__line-label" fill={color}>{s.label} {fmt(last[2])}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

export function seriesColor(i: number) {
  return COLORS[i % COLORS.length];
}

// Прогресс к старту: доли роста, без изменений и снижения, 100 % полоса.
// labels="all": проценты на всех частях полосы, даже узких (экран по макету: всё видно без наведения).
export function ProgressBars({ rows, section, threshold, labels }: { rows: DynRow[]; section: string; threshold: number; labels?: 'all' }) {
  return (
    <div className="mon-prog__chart">
      {rows.map(r => {
        const p = r.progress[section];
        const n = p.up + p.same + p.down;
        const pc = shares100([p.up, p.same, p.down]);
        const share = (k: 'up' | 'same' | 'down') => pc[k === 'up' ? 0 : k === 'same' ? 1 : 2];
        return (
          <div key={r.row} className={`mon-prog__row is-${r.kind}`}>
            <span className="mon-viz__bar-label">{r.row}</span>
            {n ? (
              <span className="mon-viz__track">
                {(['up', 'same', 'down'] as const).map(k => (p[k] ? (
                  <span key={k} className={`mon-viz__seg mon-prog--${k}`} style={{ width: `${(100 * p[k]) / n}%` }}
                    title={`${k === 'up' ? `рост (+${threshold} и больше)` : k === 'down' ? `снижение (−${threshold} и больше)` : 'без изменений'}: ${p[k]} уч., ${share(k)} %`}>
                    {labels === 'all' || share(k) >= 9 ? `${share(k)} %` : ''}
                  </span>
                ) : null))}
              </span>
            ) : <span className="mon-viz__track is-empty">нет данных для сравнения</span>}
            <span className="mon-viz__bar-n">{n} уч. · нет данных: {p.no_data}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ProgressLegend({ threshold }: { threshold: number }) {
  return (
    <div className="mon-viz__legend">
      <span><i className="mon-viz__swatch mon-prog--up" />рост: +{threshold} и больше</span>
      <span><i className="mon-viz__swatch mon-prog--same" />без изменений: от {'−'}{threshold - 1} до +{threshold - 1}</span>
      <span><i className="mon-viz__swatch mon-prog--down" />снижение: {'−'}{threshold} и больше</span>
    </div>
  );
}

// Фон клетки по проценту: те же границы, что у стартовых групп.
export function heat(v: number | null) {
  if (v === null) return undefined;
  if (v >= 75) return 'mon-prog__heat--high';
  if (v >= 50) return 'mon-prog__heat--mid';
  return 'mon-prog__heat--low';
}

export function Arrow({ diff, threshold }: { diff: number | null; threshold: number }) {
  if (diff === null) return null;
  const k = diff >= threshold ? 'up' : diff <= -threshold ? 'down' : 'same';
  const sign = k === 'up' ? '▲' : k === 'down' ? '▼' : '●';
  return <span className={`mon-prog__arrow is-${k}`} title={`к предыдущей: ${signed(diff)}`}>{sign}</span>;
}
