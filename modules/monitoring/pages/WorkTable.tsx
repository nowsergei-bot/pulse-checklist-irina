import { useState } from 'react';
import type { Point } from './Dynamics';

// Таблица «группа × работа» над вкладками работ (Ира, 28.10): процент по каждой работе со значком к предыдущей
// работе группы, «К старту» в пунктах. Строка параллели посчитана сервером только по ученикам с входным.

type Cell = { percent: number; n: number; trend: 'up' | 'down' | 'same' | null } | null;
type ToStart = { diff: number; kind: 'up' | 'down' | 'same' } | { kind: 'one' } | { kind: 'no_start' } | null;
type Row = { cells: Cell[]; to_start: ToStart };
export type WorkTableData = {
  groups: ({ group_id: number; title: string } & Record<string, Row | number | string>)[];
  parallel: Record<string, Row>;
};

const heat = (v: number) => (v >= 85 ? 'is-h85' : v >= 75 ? 'is-h75' : v >= 60 ? 'is-h60' : v >= 50 ? 'is-h50' : 'is-hlow');
const ICON = { up: '▲', down: '▼', same: '●' } as const;
const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '+0');

function Td({ c, total, par }: { c: Cell; total: Cell; par: boolean }) {
  if (!c) {
    return <td><span className={`mon-wt__cell ${total ? 'is-nodata' : 'is-none'}`}>{total ? 'нет данных' : 'не внесено'}</span></td>;
  }
  return (
    <td>
      <span className={`mon-wt__cell ${heat(c.percent)}`} title={par ? `${c.n} ${c.n % 10 === 1 && c.n % 100 !== 11 ? 'ученик' : 'учеников'} с этой работой и входным` : `${c.n} уч.`}>
        {c.percent}%{c.trend ? <i>{ICON[c.trend]}</i> : null}
      </span>
    </td>
  );
}

function Start({ t }: { t: ToStart }) {
  if (!t) return <td className="mon-wt__start" />;
  if (t.kind === 'one') return <td className="mon-wt__start is-note">одна работа</td>;
  if (t.kind === 'no_start') return <td className="mon-wt__start is-note">нет входного</td>;
  const d = t as { diff: number; kind: string };
  return <td className={`mon-wt__start is-${d.kind}`}>{signed(d.diff)} п.</td>;
}

export default function WorkTable({ table, points, sections, parallel, threshold }: {
  table: WorkTableData; points: Point[]; sections: { code: string; name: string }[]; parallel: number; threshold: number;
}) {
  const [code, setCode] = useState('total');
  const section = sections.find(s => s.code === code) || sections[0];
  const rowOf = (g: WorkTableData['groups'][number], c: string) => g[c] as Row;
  // По входному выбранного раздела, от высокого к низкому; без входного внизу.
  const groups = [...table.groups].sort((a, b) => (rowOf(b, section.code).cells[0]?.percent ?? -1) - (rowOf(a, section.code).cells[0]?.percent ?? -1) || a.title.localeCompare(b.title, 'ru', { numeric: true }));
  const par = table.parallel[section.code];
  return (
    <section className="mon-dyn__block mon-wt">
      <div className="mon-dyn__block-head">
        <div>
          <h3 className="mon-dyn__title">Динамика: {section.name.toLowerCase()}, {parallel} параллель</h3>
          <p className="mon-dyn__note">Средний процент выполнения каждой работы и значок к предыдущей работе группы. «К старту»: последняя внесённая работа минус входное. Строка параллели: только ученики, у которых есть и работа, и входное.</p>
        </div>
        <div className="mon-segmented" role="group" aria-label="Раздел">
          {sections.map(s => <button key={s.code} type="button" className={s.code === section.code ? 'is-current' : undefined} onClick={() => setCode(s.code)}>{s.name}</button>)}
        </div>
      </div>
      <div className="mon-dyn__scroll">
        <table className="mon-wt__table">
          <thead>
            <tr><th className="is-l">Группа</th>{points.map(p => <th key={p.key}>{p.title}</th>)}<th>К старту</th></tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const r = rowOf(g, section.code);
              const t = rowOf(g, 'total');
              return (
                <tr key={g.group_id}>
                  <td className="is-l">{g.title}</td>
                  {r.cells.map((c, i) => <Td key={points[i].key} c={c} total={t.cells[i]} par={false} />)}
                  <Start t={r.to_start} />
                </tr>
              );
            })}
            <tr className="is-par">
              <td className="is-l">Параллель</td>
              {par.cells.map((c, i) => <Td key={points[i].key} c={c} total={table.parallel.total.cells[i]} par />)}
              <Start t={par.to_start} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mon-dyn__muted">▲ рост на {threshold} пунктов и больше к предыдущей работе, ▼ снижение, ● без изменений. Цвет: от 85 % тёмно-зелёный, 75-84 светло-зелёный, 60-74 жёлтый, 50-59 оранжевый, ниже 50 красный. Наведи на клетку параллели, чтобы увидеть число учеников.</p>
    </section>
  );
}
