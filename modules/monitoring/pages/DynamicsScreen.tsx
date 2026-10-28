import { useState } from 'react';
import { ProgressBars, type DynRow } from './Dynamics';
import { BAND_LEGEND, percentBand } from './palette';

// Экран «Динамика» по макету 28.10: одна выбранная работа параллели, блоки сверху вниз.
// Графики на HTML и CSS (полосы, клетки, точки), без библиотек. Все числа видны сразу, не только при наведении.

export type Screen = {
  key: string; title: string; type_code: string; max_points: number | null;
  coverage: { groups_total: number; groups_with: number; students_total: number; students_with: number; with: string[]; without: string[] };
  cards: { avg_total: number | null; avg_percent: number | null; complete: number; groups_with: number; groups_total: number };
  sections: { code: string; name: string }[];
  groups: { group_id: number; title: string; n: number; percent: number; percent_int: number; avg_total: number | null; sections: Record<string, number | null> }[];
  parallel_row: { n: number; percent: number | null; percent_int: number | null; sections: Record<string, number | null> };
  blocks: { label: string; multi: boolean; max: number; section: string }[];
  blocks_parallel: (number | null)[];
  blocks_by_group: Record<string, (number | null)[]>;
  weak: number[];
  position: { complete: boolean; rows: { group_id: number; title: string; n: number; before: number | null; after: number | null }[] } | null;
  group: number | null;
  students: {
    id: number; full_name: string; start: number | null; wrote: boolean; total: number | null; percent: number | null;
    place: string | null; position: { diff: number; kind: 'same' | 'up' | 'down' } | null; risk: boolean;
  }[];
};

const num = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const sign = (v: number) => (v > 0 ? `+${num(v)}` : v < 0 ? `−${num(-v)}` : '0');
const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};
const isEge = (s: Screen) => s.type_code === 'ege_mock';
const entered = (title: string) => (/^Входное/.test(title) ? 'внесено' : 'внесён');
// Название работы внутри фразы, как в макете: «в пробном ЕГЭ 1», «пробного ЕГЭ 1», «цветная: пробный ЕГЭ 1».
const lower = (t: string) => (/^(Пробный|Модуль|Входное)/.test(t) ? t[0].toLowerCase() + t.slice(1) : `«${t}»`);
function inWork(t: string) {
  if (/^Входное/.test(t)) return 'во входном';
  if (/^Пробный ЕГЭ/.test(t)) return `в пробном ЕГЭ${t.slice('Пробный ЕГЭ'.length)}`;
  if (/^Модуль/.test(t)) return `в модуле${t.slice('Модуль'.length)}`;
  return `в «${t}»`;
}
function ofWork(t: string) {
  if (/^Входное/.test(t)) return 'входного';
  if (/^Пробный ЕГЭ/.test(t)) return `пробного ЕГЭ${t.slice('Пробный ЕГЭ'.length)}`;
  if (/^Модуль/.test(t)) return `модуля${t.slice('Модуль'.length)}`;
  return `«${t}»`;
}
const WEAK_BELOW = 85;

// Цвет клетки, полосы и столбика: одна шкала палитры, 90 и выше, 85-89, 70-84, ниже 70.
export function band(v: number | null) {
  if (v === null || v === undefined) return 'mon-band--empty';
  return `mon-band--${percentBand(v)}`;
}
const fill = band;

function weakOf(values: (number | null)[]) {
  return values.map((percent, index) => ({ percent, index }))
    .filter((b): b is { percent: number; index: number } => b.percent !== null && b.percent < WEAK_BELOW)
    .sort((a, b) => a.percent - b.percent || a.index - b.index).slice(0, 3).map(b => b.index);
}

function Block({ title, note, children, side }: { title: string; note: string; children: React.ReactNode; side?: React.ReactNode }) {
  return (
    <section className="mon-dyn__block">
      <div className="mon-dyn__block-head">
        <div>
          <h3 className="mon-dyn__title">{title}</h3>
          <p className="mon-dyn__note">{note}</p>
        </div>
        {side}
      </div>
      {children}
    </section>
  );
}

function Coverage({ s }: { s: Screen }) {
  const c = s.coverage;
  if (!c.groups_total || c.groups_with >= c.groups_total) return null;
  return (
    <div className="mon-dyn__banner" role="status">
      <b>{s.title} {entered(s.title)} в {c.groups_with} {plural(c.groups_with, 'группе', 'группах', 'группах')} из {c.groups_total}</b>
      {' '}({c.students_with} {plural(c.students_with, 'ученик', 'ученика', 'учеников')} из {c.students_total}){c.with.length ? `: ${c.with.join(', ')}` : ''}.
      {' '}Средние по параллели пока неполные.{c.without.length ? ` Нет результатов: ${c.without.join(', ')}.` : ''}
    </div>
  );
}

function Cards({ s }: { s: Screen }) {
  const c = s.cards;
  return (
    <section className="mon-dyn__block">
    <h3 className="mon-dyn__title mon-dyn__title--kpi">Коротко</h3>
    <div className="mon-dyn__cards">
      {s.max_points && c.avg_total !== null ? (
        <div className="mon-dyn__card">
          <div className="mon-dyn__big">{num(c.avg_total)} из {s.max_points}</div>
          <div className="mon-dyn__small">{isEge(s) ? 'средний первичный балл, письменная часть' : 'средний балл'}</div>
        </div>
      ) : null}
      <div className="mon-dyn__card">
        <div className="mon-dyn__big">{c.avg_percent === null ? '' : `${num(c.avg_percent)} %`}</div>
        <div className="mon-dyn__small">средний процент выполнения</div>
      </div>
      <div className="mon-dyn__card">
        <div className="mon-dyn__big">{c.complete}</div>
        <div className="mon-dyn__small">{plural(c.complete, 'полная работа', 'полные работы', 'полных работ')}</div>
      </div>
      <div className="mon-dyn__card">
        <div className="mon-dyn__big">{c.groups_with} из {c.groups_total}</div>
        <div className="mon-dyn__small">{plural(c.groups_total, 'группы', 'групп', 'групп')} внесли результаты</div>
      </div>
    </div>
    </section>
  );
}

function GroupBars({ s }: { s: Screen }) {
  const par = s.parallel_row.percent;
  return (
    <Block title={`Группы ${inWork(s.title)}`} note={`Средний процент выполнения${isEge(s) ? ' письменной части' : ''}. Пунктир: среднее по параллели. Справа: сколько учеников.`}>
      {s.groups.length ? (
        <div className="mon-dyn__bars">
          {s.groups.map(g => (
            <div key={g.group_id} className="mon-dyn__bar-row">
              <b className="mon-dyn__bar-label">{g.title}</b>
              <span className="mon-dyn__track">
                <span className={`mon-dyn__fill ${fill(g.percent)}`} style={{ width: `${g.percent}%` }}>{num(g.percent)} %</span>
                {par !== null ? <i className="mon-dyn__par" style={{ left: `${par}%` }} /> : null}
              </span>
              <span className="mon-dyn__bar-n">{g.n} уч.</span>
            </div>
          ))}
          {par !== null ? <div className="mon-dyn__par-label">┆ параллель: {num(par)} %</div> : null}
        </div>
      ) : <p className="mon-note">Результатов пока нет</p>}
      {s.coverage.without.length ? <p className="mon-dyn__muted">Нет результатов: {s.coverage.without.join(', ')}</p> : null}
    </Block>
  );
}

function SectionTable({ s }: { s: Screen }) {
  const rows = [...s.groups.map(g => ({ key: String(g.group_id), title: g.title, sections: g.sections, total: g.percent_int, par: false })),
    { key: 'par', title: 'Параллель', sections: s.parallel_row.sections, total: s.parallel_row.percent_int, par: true }];
  const cell = (v: number | null | undefined, key?: string) => <td key={key} className={`mon-dyn__heat ${band(v ?? null)}`}>{v === null || v === undefined ? 'нет данных' : v}</td>;
  return (
    <Block title="Разделы по группам" note={`Процент выполнения каждого раздела ${inWork(s.title)}. По цвету сразу видно слабый раздел.`}>
      {s.groups.length ? (
        <>
          <div className="mon-dyn__scroll">
            <table className="mon-dyn__table">
              <thead><tr><th className="is-l">Группа</th>{s.sections.map(x => <th key={x.code}>{x.name}</th>)}<th>Итого</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key} className={r.par ? 'is-par' : undefined}>
                    <td className="is-l">{r.par ? <b>{r.title}</b> : r.title}</td>
                    {s.sections.map(x => cell(r.sections[x.code], x.code))}
                    {cell(r.total)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mon-dyn__legend">
            {BAND_LEGEND.map(b => <span key={b.band}><i className={`mon-band--${b.band}`} />{b.label}</span>)}
          </div>
        </>
      ) : <p className="mon-note">Результатов пока нет</p>}
    </Block>
  );
}

function BlockChart({ s }: { s: Screen }) {
  const [who, setWho] = useState<string>('par');
  const groupTitle = s.groups.find(g => String(g.group_id) === who)?.title;
  const values = who === 'par' || !s.blocks_by_group[who] ? s.blocks_parallel : s.blocks_by_group[who];
  const weak = who === 'par' ? s.weak : weakOf(values);
  // Подписи разделов под своими блоками: подряд идущие блоки одного раздела объединяются.
  const spans: { section: string; from: number; count: number }[] = [];
  s.blocks.forEach((b, i) => {
    const last = spans[spans.length - 1];
    if (last && last.section === b.section) last.count += 1; else spans.push({ section: b.section, from: i, count: 1 });
  });
  // Номер блока: «задание 2», «задания 19-24»; поле входного без номера называется как есть.
  const word = (i: number) => (/^\d/.test(s.blocks[i].label) ? `${s.blocks[i].multi ? 'задания' : 'задание'} ${s.blocks[i].label}` : s.blocks[i].label);
  const weakSorted = [...weak].sort((a, b) => (values[a] as number) - (values[b] as number) || a - b);
  return (
    <Block
      title="Выполнение по заданиям"
      note={`Средний процент выполнения каждого блока заданий по ${who === 'par' ? 'параллели' : 'группе'}. Тёмно-красным отмечены задания с самым низким результатом: их стоит разобрать в первую очередь.`}
      side={s.groups.length ? (
        <div className="mon-segmented" role="group" aria-label="Параллель или группа">
          <button type="button" className={who === 'par' ? 'is-current' : undefined} onClick={() => setWho('par')}>Параллель</button>
          {s.groups.map(g => <button key={g.group_id} type="button" className={String(g.group_id) === who ? 'is-current' : undefined} onClick={() => setWho(String(g.group_id))}>{g.title}</button>)}
        </div>
      ) : undefined}
    >
      <div className="mon-dyn__scroll">
        <div className="mon-dyn__cols" style={{ gridTemplateColumns: `repeat(${s.blocks.length}, minmax(2.6rem, 1fr))` }}>
          {s.blocks.map((b, i) => {
            const v = values[i];
            return (
              <div key={i} className={`mon-dyn__col${weak.includes(i) ? ' is-weak' : ''}`}>
                <span className="mon-dyn__col-v">{v === null || v === undefined ? '' : v}</span>
                <span className="mon-dyn__col-track"><span className={`mon-dyn__col-fill ${fill(v ?? null)}`} style={{ height: `${v ?? 0}%` }} /></span>
                <span className="mon-dyn__col-label">{b.label}</span>
              </div>
            );
          })}
          {spans.map(x => (
            <span key={x.from} className="mon-dyn__col-section" style={{ gridColumn: `${x.from + 1} / span ${x.count}` }}>{x.section === 'Письменная речь' ? 'Письмо' : x.section}</span>
          ))}
        </div>
      </div>
      {weakSorted.length ? (
        <p className="mon-dyn__weak">Слабые места {who === 'par' ? 'параллели' : `группы ${groupTitle}`}: {weakSorted.map(i => `${word(i)} (${values[i]} %)`).join(', ')}.</p>
      ) : null}
    </Block>
  );
}

function Position({ s }: { s: Screen }) {
  const rows = (s.position?.rows || []).filter(r => r.n > 0 && r.before !== null && r.after !== null);
  const span = Math.max(10, ...rows.flatMap(r => [Math.abs(r.before as number), Math.abs(r.after as number)]));
  const lim = Math.ceil(span / 5) * 5;
  const x = (v: number) => 50 + (50 * v) / lim;
  return (
    <Block
      title="Положение группы относительно параллели"
      note={`Работы разной трудности, поэтому сравниваем не проценты, а насколько группа выше или ниже среднего по параллели в каждой работе. Серая точка: входное, цветная: ${lower(s.title)}. Только ученики, у которых есть обе работы.`}
    >
      {rows.length ? (
        <div className="mon-dyn__scroll"><div className="mon-dyn__pos">
          {rows.map(r => {
            const a = r.before as number;
            const b = r.after as number;
            return (
              <div key={r.group_id} className="mon-dyn__pos-row">
                <b className="mon-dyn__bar-label">{r.title}</b>
                <span className="mon-dyn__pos-scale">
                  <i className="mon-dyn__pos-zero" />
                  <i className="mon-dyn__pos-line" style={{ left: `${Math.min(x(a), x(b))}%`, width: `${Math.abs(x(b) - x(a))}%` }}>
                    {Math.abs(x(b) - x(a)) > 3 ? <i className={`mon-dyn__pos-head ${b >= a ? 'is-right' : 'is-left'}`} /> : null}
                  </i>
                  <i className="mon-dyn__pos-dot is-before" style={{ left: `${x(a)}%` }} />
                  <i className={`mon-dyn__pos-dot ${b > 0 ? 'is-up' : b < 0 ? 'is-down' : 'is-zero'}`} style={{ left: `${x(b)}%` }} />
                </span>
                <span className="mon-dyn__pos-text">было {sign(a)} · стало {sign(b)}</span>
              </div>
            );
          })}
          <div className="mon-dyn__pos-row mon-dyn__pos-axis">
            <span />
            <span className="mon-dyn__pos-legend"><span>← ниже среднего по параллели</span><span>выше среднего →</span></span>
            <span />
          </div>
        </div></div>
      ) : <p className="mon-note">Нет групп, где есть и входное, и эта работа</p>}
      {s.position && !s.position.complete ? (
        <p className="mon-dyn__muted">Пока {lower(s.title).replace(/^«|»$/g, '')} {entered(s.title)} не во всех группах, среднее по параллели неполное: сравнение станет точным, когда внесут все группы.</p>
      ) : null}
    </Block>
  );
}

function Progress({ s, rows, threshold }: { s: Screen; rows: DynRow[]; threshold: number }) {
  const withData = rows.filter(r => { const p = r.progress.total; return p.up + p.same + p.down > 0; });
  return (
    <Block title={`Сравнение с входным: «${s.title}»`} note={`Разница каждого ученика с его входным: рост на ${threshold} пунктов и больше, снижение на ${threshold} и больше, иначе без изменений. Только группы с данными.`}>
      {withData.length ? <ProgressBars rows={withData} section="total" threshold={threshold} labels="all" /> : <p className="mon-note">Нет учеников, у которых есть и входное, и эта работа</p>}
    </Block>
  );
}

function Students({ s, onGroup, groups }: { s: Screen; onGroup: (id: number) => void; groups: { id: number; title: string }[] }) {
  const placement = s.key === 'placement';
  const title = groups.find(g => g.id === s.group)?.title || '';
  return (
    <Block
      title={`Ученики: ${title}`}
      note={placement
        ? 'Процент входного и место в параллели. Тёмно-красной полосой отмечены только те, кто в зоне риска по самой работе.'
        : `Балл и процент ${ofWork(s.title)}, место в параллели по этой работе и как изменилось положение относительно параллели по сравнению с входным. Тёмно-красной полосой отмечены только те, кто в зоне риска по самой работе.`}
      side={(
        <label className="mon-field">
          <span className="mon-label">Группа</span>
          <select className="mon-input mon-select" value={s.group ?? ''} onChange={e => onGroup(Number(e.target.value))}>
            {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
      )}
    >
      <div className="mon-dyn__scroll">
        <table className="mon-dyn__table mon-dyn__students">
          <thead>
            <tr>
              <th className="is-l">Ученик</th>
              {placement ? null : <th>Входное, %</th>}
              {placement ? <th>Входное, %</th> : <th>{s.title}, балл из {s.max_points}</th>}
              {placement ? null : <th>%</th>}
              <th>Место в параллели</th>
              {placement ? null : <th>Положение к параллели</th>}
            </tr>
          </thead>
          <tbody>
            {s.students.map(x => (
              <tr key={x.id} className={x.risk ? 'is-risk' : undefined}>
                <td className="is-l">{x.full_name}</td>
                {placement ? null : <td>{x.start === null ? '' : num(x.start)}</td>}
                {x.wrote ? (
                  <>
                    <td>{placement ? num(x.percent as number) : num(x.total as number)}</td>
                    {placement ? null : <td>{num(x.percent as number)}</td>}
                    <td>{x.place}</td>
                    {placement ? null : (
                      <td>
                        {x.position ? (
                          <span className={`mon-dyn__tag is-${x.position.kind}`}>
                            {x.position.kind === 'same' ? 'как было' : x.position.kind === 'up' ? `выше на ${x.position.diff}` : `ниже на ${-x.position.diff}`}
                          </span>
                        ) : ''}
                      </td>
                    )}
                  </>
                ) : (
                  <>
                    <td className="mon-dyn__none">не писал(а)</td>
                    {placement ? null : <td />}
                    <td />
                    {placement ? null : <td />}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

export default function DynamicsScreen({ s, rows, threshold, groups, onGroup }: {
  s: Screen; rows: DynRow[]; threshold: number; groups: { id: number; title: string }[]; onGroup: (id: number) => void;
}) {
  const compared = s.key !== 'placement';
  return (
    <div className="mon-dyn">
      <Coverage s={s} />
      <Cards s={s} />
      <GroupBars s={s} />
      <SectionTable s={s} />
      {s.blocks.length ? <BlockChart key={s.key} s={s} /> : null}
      {compared && s.type_code === 'module' ? <Progress s={s} rows={rows} threshold={threshold} /> : null}
      {compared && s.type_code !== 'module' ? <Position s={s} /> : null}
      <Students s={s} onGroup={onGroup} groups={groups} />
    </div>
  );
}
