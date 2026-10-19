import { useState, type MouseEvent, type ReactNode } from 'react';

// Графики вкладки «Аналитика»: SVG и CSS без сторонних библиотек.
// Цвета отметок те же, что у плашек на экране ввода, только насыщеннее для полос.

export type Risk = { at_risk: boolean; students: number; twos_share: number | null; reasons: { code: string; text: string }[] };
export type Row = {
  parallel: number | null; row: string; kind: 'group' | 'left' | 'parallel' | 'parallel_left' | 'total' | 'total_left';
  group_id?: number; gentle_on?: boolean;
  students: number; complete: number; absent: number; not_entered: number;
  avg_total: number | null; avg_percent: number | null; marks: Record<string, number>;
  sections: Record<string, number | null>;
  gentle?: { students: number; complete: number; raised: number; moves: Record<string, number>; avg_percent: number | null };
  rule?: { compared: number; changed: number; higher: number; lower: number; moves: Record<string, number> };
  risk?: Risk | { students: number; groups: number; groups_at_risk: number };
};
export type SectionKey = { key: string; section: string; level: string; level_name: string };

const MARKS = ['5', '4', '3', '2'] as const;
const PARALLELS = Array.from({ length: 11 }, (_, i) => i + 1);
const LEVEL: Record<string, string> = { basic: 'базовый', advanced: 'повышенный' };
const num = (v: number) => v.toLocaleString('ru-RU');

// Всплывающая подсказка над графиком.
type Tip = { x: number; y: number; lines: string[] } | null;
function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const bind = (lines: string[]) => {
    const move = (e: MouseEvent) => {
      const box = (e.currentTarget as Element).closest('.mon-viz__card')?.getBoundingClientRect();
      if (box) setTip({ x: e.clientX - box.left, y: e.clientY - box.top, lines });
    };
    return { onMouseEnter: move, onMouseMove: move, onMouseLeave: () => setTip(null), 'aria-label': lines.join(', ') };
  };
  const view = tip ? (
    <div className="mon-viz__tip" style={{ left: tip.x, top: tip.y }} role="presentation">
      {tip.lines.map((l, i) => <div key={i} className={i === 0 ? 'mon-viz__tip-head' : undefined}>{l}</div>)}
    </div>
  ) : null;
  return { bind, view };
}

function Card({ title, note, children, legend }: { title: string; note?: string; children: ReactNode; legend?: ReactNode }) {
  return (
    <figure className="mon-viz__card">
      <figcaption>
        <h4 className="mon-viz__title">{title}</h4>
        {note ? <p className="mon-viz__note">{note}</p> : null}
        {legend}
      </figcaption>
      {children}
    </figure>
  );
}

function MarkLegend() {
  return (
    <div className="mon-viz__legend">
      {MARKS.map(m => <span key={m}><i className={`mon-viz__swatch mon-viz--m${m}`} />«{m}»</span>)}
    </div>
  );
}

// Отметки «5/4/3/2»: горизонтальные полосы со 100 % накоплением.
export function MarkBars({ title, items }: { title: string; items: { label: string; row: Row | null }[] }) {
  const { bind, view } = useTip();
  return (
    <Card title={title} note="Доля отметок среди полных работ." legend={<MarkLegend />}>
      <div className="mon-viz__bars">
        {items.map(({ label, row }) => {
          const n = row ? MARKS.reduce((s, m) => s + (row.marks[m] || 0), 0) : 0;
          return (
            <div key={label} className="mon-viz__bar-row">
              <span className="mon-viz__bar-label">{label}</span>
              {n ? (
                <span className="mon-viz__track">
                  {MARKS.map(m => {
                    const count = row?.marks[m] || 0;
                    if (!count) return null;
                    const share = (100 * count) / n;
                    return (
                      <span key={m} className={`mon-viz__seg mon-viz--m${m}`} style={{ flexBasis: `${share}%` }}
                        {...bind([label, `«${m}»: ${count} из ${n}, ${Math.round(share)} %`])}>
                        {share >= 10 ? `${Math.round(share)} %` : ''}
                      </span>
                    );
                  })}
                </span>
              ) : <span className="mon-viz__track is-empty">{row ? 'полных работ нет' : 'работы нет'}</span>}
              <span className="mon-viz__bar-n">{n ? `${num(n)} раб.` : ''}</span>
            </div>
          );
        })}
      </div>
      {view}
    </Card>
  );
}

// Средний %: столбцы, пунктирные линии 75 % и 50 %.
export function PercentColumns({ title, items }: { title: string; items: { label: string; value: number | null; note?: string }[] }) {
  const { bind, view } = useTip();
  const band = 64;
  const left = 44;
  const top = 22;
  const h = 220;
  const width = left + items.length * band + 46;
  const y = (v: number) => top + h - (h * v) / 100;
  const bw = Math.min(40, band * 0.6);
  return (
    <Card title={title} note="Средний процент по полным работам.">
      <svg className="mon-viz__svg" viewBox={`0 0 ${width} ${top + h + 34}`} style={{ maxWidth: width }} role="img" aria-label={title}>
        {[0, 25, 100].map(v => (
          <g key={v}>
            <line x1={left} x2={width - 40} y1={y(v)} y2={y(v)} className="mon-viz__gridline" />
            <text x={left - 8} y={y(v) + 4} className="mon-viz__axis" textAnchor="end">{v}</text>
          </g>
        ))}
        {items.map((it, i) => {
          const cx = left + i * band + band / 2;
          if (it.value === null) {
            return (
              <g key={it.label}>
                <text x={cx} y={y(0) - 6} className="mon-viz__axis" textAnchor="middle">—</text>
                <text x={cx} y={top + h + 22} className="mon-viz__xlabel" textAnchor="middle">{it.label}</text>
              </g>
            );
          }
          const v = Math.max(0, Math.min(100, it.value));
          const r = Math.min(4, (h * v) / 100);
          const x0 = cx - bw / 2;
          const y0 = y(v);
          const base = y(0);
          const d = `M${x0},${base} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${base} Z`;
          return (
            <g key={it.label}>
              <rect x={cx - band / 2} y={top} width={band} height={h} fill="transparent" {...bind([it.label, `средний ${num(it.value)} %`, ...(it.note ? [it.note] : [])])} />
              <path d={d} className="mon-viz__col" pointerEvents="none" />
              <text x={cx} y={y0 - 7} className="mon-viz__value" textAnchor="middle" pointerEvents="none">{num(Math.round(it.value))}</text>
              <text x={cx} y={top + h + 22} className="mon-viz__xlabel" textAnchor="middle" pointerEvents="none">{it.label}</text>
            </g>
          );
        })}
        {[75, 50].map(v => (
          <g key={v} pointerEvents="none">
            <line x1={left} x2={width - 40} y1={y(v)} y2={y(v)} className={`mon-viz__ref mon-viz__ref--${v}`} />
            <text x={width - 36} y={y(v) + 4} className="mon-viz__ref-label">{v} %</text>
          </g>
        ))}
        <line x1={left} x2={width - 40} y1={y(0)} y2={y(0)} className="mon-viz__base" />
      </svg>
      {view}
    </Card>
  );
}

const heatClass = (v: number) => (v < 50 ? 'is-low' : v < 75 ? 'is-mid' : 'is-high');

// Раздел × уровень по группам: % от максимума.
export function SectionHeatmap({ title, groups, keys }: { title: string; groups: Row[]; keys: SectionKey[] }) {
  const { bind, view } = useTip();
  const used = keys.filter(k => groups.some(g => g.sections[k.key] !== null && g.sections[k.key] !== undefined));
  return (
    <Card title={title} note="Процент от максимума заданий раздела этого уровня, по полным работам."
      legend={<div className="mon-viz__legend"><span><i className="mon-viz__swatch mon-viz__heat is-low" />ниже 50 %</span><span><i className="mon-viz__swatch mon-viz__heat is-mid" />50–74 %</span><span><i className="mon-viz__swatch mon-viz__heat is-high" />от 75 %</span></div>}>
      {used.length ? (
        <div className="mon-an__scroll">
          <table className="mon-viz__heatmap">
            <thead>
              <tr><th rowSpan={2}>Группа</th>{[...new Set(used.map(k => k.section))].map(s => <th key={s} colSpan={used.filter(k => k.section === s).length}>{s}</th>)}</tr>
              <tr>{used.map(k => <th key={k.key} className="mon-viz__heat-level">{LEVEL[k.level] || k.level_name}</th>)}</tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.row}>
                  <th scope="row">{g.row}</th>
                  {used.map(k => {
                    const v = g.sections[k.key];
                    if (v === null || v === undefined) return <td key={k.key} className="mon-viz__heat is-none">—</td>;
                    return <td key={k.key} className={`mon-viz__heat ${heatClass(v)}`} {...bind([g.row, `${k.section}, ${LEVEL[k.level] || k.level_name} уровень`, `${num(v)} % от максимума`])}>{num(Math.round(v))}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mon-note">Полных работ пока нет</p>}
      {view}
    </Card>
  );
}

// Заполненность: внесено (полная работа или «отсутствовал») из всех учеников состава.
export function FillBars({ title, items }: { title: string; items: { label: string; row: Row | null }[] }) {
  const { bind, view } = useTip();
  return (
    <Card title={title} note="Внесено: полная работа или отметка «отсутствовал». Всего: ученики текущего состава."
      legend={<div className="mon-viz__legend"><span><i className="mon-viz__swatch mon-viz__fill-done" />полная работа</span><span><i className="mon-viz__swatch mon-viz__fill-absent" />отсутствовал</span><span><i className="mon-viz__swatch mon-viz__fill-rest" />не внесено</span></div>}>
      <div className="mon-viz__bars">
        {items.map(({ label, row }) => {
          const total = row?.students || 0;
          const done = row ? row.complete + row.absent : 0;
          const lines = row ? [label, `внесено ${done} из ${total}`, `полная работа: ${row.complete}`, `отсутствовал: ${row.absent}`, `не внесено: ${row.not_entered}`] : [label];
          return (
            <div key={label} className="mon-viz__bar-row">
              <span className="mon-viz__bar-label">{label}</span>
              {total ? (
                <span className="mon-viz__track mon-viz__fill" {...bind(lines)}>
                  {row!.complete ? <span className="mon-viz__seg mon-viz__fill-done" style={{ flexBasis: `${(100 * row!.complete) / total}%` }} /> : null}
                  {row!.absent ? <span className="mon-viz__seg mon-viz__fill-absent" style={{ flexBasis: `${(100 * row!.absent) / total}%` }} /> : null}
                </span>
              ) : <span className="mon-viz__track is-empty">{row ? 'учеников нет' : 'работы нет'}</span>}
              <span className="mon-viz__bar-n mon-viz__fill-n">{total ? `${num(done)} из ${num(total)} · ${Math.round((100 * done) / total)} %` : ''}</span>
            </div>
          );
        })}
      </div>
      {view}
    </Card>
  );
}

// Все графики блока А.
export default function AnalyticsCharts({ rows, keys }: { rows: Row[]; keys: SectionKey[] }) {
  const parallelRows = new Map(rows.filter(r => r.kind === 'parallel').map(r => [Number(r.parallel), r]));
  const present = PARALLELS.filter(p => parallelRows.has(p));
  const [chosen, setChosen] = useState<number | null>(null);
  const parallel = chosen !== null && present.includes(chosen) ? chosen : present[0] ?? null;
  const groups = rows.filter(r => r.kind === 'group' && Number(r.parallel) === parallel);
  const allItems = PARALLELS.map(p => ({ label: `${p} параллель`, row: parallelRows.get(p) || null }));
  return (
    <div className="mon-viz">
      <h3 className="mon-viz__section">Все параллели</h3>
      <div className="mon-viz__grid mon-viz__grid--one">
        <MarkBars title="Отметки по параллелям" items={allItems} />
        <PercentColumns title="Средний % по параллелям" items={PARALLELS.map(p => ({ label: String(p), value: parallelRows.get(p)?.avg_percent ?? null, note: parallelRows.has(p) ? `полных работ: ${parallelRows.get(p)!.complete}` : 'работы нет' }))} />
      </div>
      <div className="mon-viz__head">
        <h3 className="mon-viz__section">Параллель</h3>
        <div className="mon-segmented" role="group" aria-label="Параллель">
          {present.map(p => <button key={p} type="button" className={p === parallel ? 'is-current' : undefined} aria-pressed={p === parallel} onClick={() => setChosen(p)}>{p}</button>)}
        </div>
      </div>
      {parallel !== null ? (
        <div className="mon-viz__grid">
          <PercentColumns title={`Средний % по группам, ${parallel} параллель`} items={groups.map(g => ({ label: g.row, value: g.avg_percent, note: `полных работ: ${g.complete}` }))} />
          <MarkBars title={`Отметки по группам, ${parallel} параллель`} items={groups.map(g => ({ label: g.row, row: g }))} />
          <div className="mon-viz__wide"><SectionHeatmap title={`Разделы и уровни по группам, ${parallel} параллель`} groups={groups} keys={keys} /></div>
        </div>
      ) : <p className="mon-note">Работ пока нет</p>}
      <h3 className="mon-viz__section">Заполненность</h3>
      <div className="mon-viz__grid">
        <FillBars title="По параллелям" items={allItems} />
        {parallel !== null ? <FillBars title={`По группам, ${parallel} параллель`} items={groups.map(g => ({ label: g.row, row: g }))} /> : null}
      </div>
    </div>
  );
}
