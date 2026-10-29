import { useState } from 'react';
import { useApi } from './api';
import { shares100 } from './Dynamics';
import { band } from './DynamicsScreen';
import { BAND_LEGEND, PALETTE, xlsxNote, xlsxPercent } from './palette';

// Дашборд заместителей директора (задание Иры 29.10): вся школа по одной работе, только просмотр.
// Видят заместитель директора (первый экран раздела), заведующая кафедрой и data_admin; учителю вкладка не показывается,
// сервер отвечает ему 403. Все группы приходят сразу: смена параллели для групп и режима разделов без запроса.
// Цвета данных только из palette.ts.

type Sum = {
  n: number; m: number; entered: number | null; avg_percent: number | null; avg_mark: number | null;
  marks: Record<'5' | '4' | '3' | '2', number> | null; marked: number; quality: number | null; success: number | null; twos: number | null;
};
type Mode = 'sections' | 'levels' | 'tasks';
type Cells = Record<Mode, Record<string, number | null>>;
type Column = { key: string; label: string; hint?: string; level?: string; section?: string };
type ParallelRow = Sum & { parallel: number; cells: Cells };
type GroupRow = Sum & { group_id: number; title: string; parallel: number; teacher: string; cells: Cells };
type Reason = { code: string; text: string };
type RiskStudent = { id: number; full_name: string; group_id: number; group: string; parallel: number; teacher: string; values: Record<string, number | null>; percent: number; reasons: Reason[] };
type Rated = { group_id: number; title: string; parallel: number; teacher: string; avg_percent: number; avg_mark: number | null; n: number; m: number };
type Data = {
  year: string | null;
  works: { key: string; title: string; type_code: string; graded: boolean; has_results: boolean }[];
  work: { key: string; title: string; type_code: string; graded: boolean; max_points: number | null } | null;
  settings: { threshold: number; drop_to_start: number; group_avg_below: number; group_twos_from: number };
  top_percent: number;
  school?: Sum; parallels?: ParallelRow[]; groups?: GroupRow[];
  columns?: Record<Mode, Column[]>;
  risk?: {
    groups: { group_id: number; title: string; parallel: number; teacher: string; avg_percent: number; twos: number | null; marked: number; reasons: Reason[] }[];
    students: RiskStudent[]; counts: Record<'two' | 'drop' | 'two_drops', number>; points: { key: string; title: string }[];
  };
  top?: {
    parallels: { parallel: number; avg_percent: number; avg_mark: number | null; n: number }[];
    groups: Rated[]; best_by_parallel: Rated[]; excluded: string[];
    students: { id: number; full_name: string; group: string; parallel: number; percent: number; mark: string | null }[];
  };
};
type GroupTable = {
  group: { id: number; title: string };
  work: { key: string; title: string; graded: boolean; max_points: number | null };
  students: { id: number; full_name: string; start: number | null; wrote: boolean; total: number | null; percent: number | null; mark: string | null; state: string }[];
};

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'sections', label: 'Разделы' },
  { mode: 'levels', label: 'Разделы и уровни' },
  { mode: 'tasks', label: 'Задания' },
];
const NO_MARKS = 'отметок нет';
const mark2 = (v: number | null) => (v === null ? '' : v.toFixed(2).replace('.', ','));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '' : `${v} %`);
const num = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};

// Средняя отметка: от 4,50 морской, 3,50-4,49 серо-бирюзовый, 2,80-3,49 слоновая кость, ниже 2,80 винный.
export function markBand(v: number | null) {
  if (v === null || v === undefined) return 'mon-band--empty';
  if (v >= 4.5) return 'mon-band--p90';
  if (v >= 3.5) return 'mon-band--p85';
  if (v >= 2.8) return 'mon-band--p70';
  return 'mon-band--low';
}
// Те же ступени для Excel.
function markColor(v: number | null) {
  if (v === null) return null;
  return v >= 4.5 ? PALETTE.p90 : v >= 3.5 ? PALETTE.p85 : v >= 2.8 ? PALETTE.p70 : PALETTE.low;
}

function Block({ title, note, side, children, foot }: { title: string; note?: string; side?: React.ReactNode; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <section className="mon-dyn__block">
      <div className="mon-dyn__block-head">
        <div>
          <h3 className="mon-dyn__title">{title}</h3>
          {note ? <p className="mon-dyn__note">{note}</p> : null}
        </div>
        {side}
      </div>
      {children}
      {foot}
    </section>
  );
}

function Tiles({ d }: { d: Data }) {
  const s = d.school as Sum;
  const graded = Boolean(d.work?.graded);
  const tile = (big: string, small: string, extra?: string) => (
    <div className="mon-dyn__card">
      <div className={`mon-dyn__big${big === NO_MARKS ? ' mon-dash__none' : ''}`}>{big}</div>
      <div className="mon-dyn__small">{small}{extra ? <><br />{extra}</> : null}</div>
    </div>
  );
  return (
    <div className="mon-dyn__cards mon-dash__tiles">
      {tile(graded ? mark2(s.avg_mark) : NO_MARKS, 'средняя отметка')}
      {tile(pct(s.avg_percent), 'средний процент выполнения')}
      {tile(graded ? pct(s.quality) : NO_MARKS, 'качество знаний', graded ? 'доля «4» и «5»' : undefined)}
      {tile(graded ? pct(s.success) : NO_MARKS, 'успеваемость', graded ? 'доля без «2»' : undefined)}
      {tile(`${s.n} из ${s.m}`, `внесено${s.entered === null ? '' : `, ${s.entered} %`}`, 'полные работы, без отсутствовавших')}
    </div>
  );
}

// Полоса долей отметок «5 · 4 · 3 · 2» в процентах, числа внутри при доле от 8 %.
function MarkBar({ marks }: { marks: Sum['marks'] }) {
  if (!marks) return <span className="mon-dash__none">{NO_MARKS}</span>;
  const keys = ['5', '4', '3', '2'] as const;
  const counts = keys.map(k => marks[k]);
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const share = shares100(counts);
  return (
    <span className="mon-dash__bar" role="img" aria-label={keys.map((k, i) => `«${k}» ${share[i]} %`).join(', ')}>
      {keys.map((k, i) => (share[i] ? (
        <span key={k} className={`mon-dash__seg mon-dash__seg--${k}`} style={{ width: `${share[i]}%` }} title={`«${k}»: ${counts[i]} (${share[i]} %)`}>
          {share[i] >= 8 ? share[i] : ''}
        </span>
      ) : null))}
    </span>
  );
}

function Parallels({ d, parallel, onPick }: { d: Data; parallel: number | null; onPick: (p: number) => void }) {
  const graded = Boolean(d.work?.graded);
  return (
    <Block title="По параллелям" note={`Нажмите на строку, чтобы ниже показать группы этой параллели.${graded ? '' : ' У этой работы отметок нет: качество, успеваемость и «2» не считаются.'}`}>
      <div className="mon-dyn__scroll">
        <table className="mon-dyn__table mon-dash__table">
          <thead>
            <tr>
              <th className="is-l">Параллель</th>{graded ? <th>Средняя отметка</th> : null}<th>Средний %</th>
              {graded ? <><th className="mon-dash__bar-h">Отметки 5 · 4 · 3 · 2, %</th><th>Качество</th><th>Успеваемость</th></> : null}
              <th>Внесено</th>
            </tr>
          </thead>
          <tbody>
            {(d.parallels || []).map(p => (
              <tr key={p.parallel} className={`mon-dash__click${p.parallel === parallel ? ' is-picked' : ''}`} onClick={() => onPick(p.parallel)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onPick(p.parallel); }}>
                <td className="is-l"><b>{p.parallel}</b></td>
                {graded ? <td className={markBand(p.avg_mark)}>{mark2(p.avg_mark)}</td> : null}
                <td className={band(p.avg_percent)}>{p.avg_percent ?? 'нет'}</td>
                {graded ? (
                  <>
                    <td className="mon-dash__bar-c"><MarkBar marks={p.marks} /></td>
                    <td>{pct(p.quality)}</td>
                    <td>{pct(p.success)}</td>
                  </>
                ) : null}
                <td>{p.n} из {p.m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function Groups({ d, parallel, onGroup, open }: { d: Data; parallel: number; onGroup: (id: number) => void; open: number | null }) {
  const graded = Boolean(d.work?.graded);
  const list = (d.groups || []).filter(g => g.parallel === parallel)
    .sort((a, b) => (b.avg_percent ?? -1) - (a.avg_percent ?? -1) || a.title.localeCompare(b.title, 'ru', { numeric: true }));
  const par = (d.parallels || []).find(p => p.parallel === parallel);
  const row = (g: Sum, title: React.ReactNode, teacher: string, key: string, isPar: boolean, id?: number) => (
    <tr key={key} className={isPar ? 'is-par mon-dash__par' : `mon-dash__click${id === open ? ' is-picked' : ''}`} onClick={id ? () => onGroup(id) : undefined} tabIndex={id ? 0 : undefined} onKeyDown={id ? e => { if (e.key === 'Enter') onGroup(id); } : undefined}>
      <td className="is-l">{title}</td>
      <td className="is-l mon-dash__teacher">{teacher}</td>
      {graded ? <td className={g.n ? markBand(g.avg_mark) : 'mon-band--empty'}>{mark2(g.avg_mark)}</td> : null}
      <td className={g.n ? band(g.avg_percent) : 'mon-band--empty'}>{g.avg_percent ?? 'нет данных'}</td>
      {graded ? (
        <>
          <td className={(g.twos || 0) > 0 ? 'mon-dash__bad' : undefined}>{g.twos}</td>
          <td>{pct(g.quality)}</td>
          <td>{pct(g.success)}</td>
        </>
      ) : null}
      <td className={g.n < g.m ? 'mon-dash__bad' : undefined}>{g.n} из {g.m}</td>
    </tr>
  );
  return (
    <Block title={`Группы ${parallel} параллели`} note="По убыванию среднего процента. Нажмите на группу, чтобы открыть таблицу учеников.">
      <div className="mon-dyn__scroll">
        <table className="mon-dyn__table mon-dash__table">
          <thead>
            <tr>
              <th className="is-l">Группа</th><th className="is-l">Учитель</th>{graded ? <th>Средняя отметка</th> : null}<th>Средний %</th>
              {graded ? <><th>«2»</th><th>Качество</th><th>Успеваемость</th></> : null}<th>Внесено</th>
            </tr>
          </thead>
          <tbody>
            {list.map(g => row(g, g.title, g.teacher, String(g.group_id), false, g.group_id))}
            {par ? row(par, <b>Параллель</b>, '', 'par', true) : null}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function Students({ work, groupId, onClose }: { work: string; groupId: number; onClose: () => void }) {
  const { data, error } = useApi<GroupTable>(`/dashboard/group?work=${encodeURIComponent(work)}&group=${groupId}`);
  const graded = Boolean(data?.work.graded);
  const placement = data?.work.key === 'placement';
  return (
    <Block
      title={`Ученики: ${data?.group.title || ''}`}
      note={data ? `${data.work.title}. Входное для сравнения.${graded ? ' Отметка по действующей шкале.' : ''}` : undefined}
      side={<button type="button" className="mon-btn" onClick={onClose}>Закрыть</button>}
    >
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {!data && !error ? <p className="mon-note">Загружаем…</p> : null}
      {data ? (
        <div className="mon-dyn__scroll">
          <table className="mon-dyn__table mon-dyn__students">
            <thead>
              <tr>
                <th className="is-l">Ученик</th>
                {placement ? null : <th>Входное, %</th>}
                {placement || !data.work.max_points ? null : <th>Балл из {data.work.max_points}</th>}
                <th>%</th>
                {graded ? <th>Отметка</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.students.map(s => (
                <tr key={s.id}>
                  <td className="is-l">{s.full_name}</td>
                  {placement ? null : <td>{s.start ?? ''}</td>}
                  {s.wrote ? (
                    <>
                      {placement || !data.work.max_points ? null : <td>{num(s.total as number)}</td>}
                      <td className={band(s.percent)}>{s.percent}</td>
                      {graded ? <td className={s.mark ? `mon-dash__mark mon-dash__mark--${s.mark}` : undefined}>{s.mark}</td> : null}
                    </>
                  ) : (
                    <td className="mon-dyn__none" colSpan={(placement || !data.work.max_points ? 1 : 2) + (graded ? 1 : 0)}>{s.state}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Block>
  );
}

// Самый слабый столбец строки параллели в выбранном режиме.
function weakest(cells: Record<string, number | null>, cols: Column[], mode: Mode) {
  const list = cols.map(c => ({ c, v: cells[c.key] })).filter((x): x is { c: Column; v: number } => x.v !== null && x.v !== undefined);
  if (!list.length) return null;
  const w = list.reduce((a, b) => (b.v < a.v ? b : a));
  if (mode === 'levels') return `${w.c.section}, ${String(w.c.level || '').toLowerCase()} уровень, ${w.v} %`;
  if (mode === 'tasks') return `${/^\d/.test(w.c.label) ? `задание ${w.c.label}` : w.c.label}${w.c.hint ? ` (${w.c.hint.replace(/, максимум.*$/, '')})` : ''}, ${w.v} %`;
  return `${w.c.label}, ${w.v} %`;
}

function Sections({ d, parallel, mode, setMode }: { d: Data; parallel: number; mode: Mode; setMode: (m: Mode) => void }) {
  const cols = d.columns?.[mode] || [];
  const levelsOk = Boolean(d.columns?.levels.length);
  const groups = (d.groups || []).filter(g => g.parallel === parallel && g.n > 0)
    .sort((a, b) => (b.avg_percent ?? -1) - (a.avg_percent ?? -1) || a.title.localeCompare(b.title, 'ru', { numeric: true }));
  const par = (d.parallels || []).find(p => p.parallel === parallel);
  const head = (
    <tr>
      <th className="is-l" />
      {cols.map(c => <th key={c.key} title={c.hint || undefined}>{c.label}</th>)}
      <th>Итого</th>
    </tr>
  );
  const cell = (v: number | null | undefined, key: string) => <td key={key} className={`mon-dyn__heat ${band(v ?? null)}`}>{v === null || v === undefined ? '' : v}</td>;
  const line = (key: string, title: React.ReactNode, cells: Cells, total: number | null, cls?: string) => (
    <tr key={key} className={cls}>
      <td className="is-l">{title}</td>
      {cols.map(c => cell(cells[mode][c.key], c.key))}
      {cell(total, 'total')}
    </tr>
  );
  const weak = par ? weakest(par.cells[mode], cols, mode) : null;
  return (
    <Block
      title="Выполнение по разделам и заданиям"
      note={`Средний процент выполнения: сумма баллов учеников с полной работой / сумма максимумов. ${d.work?.title || ''}.`}
      side={(
        <div className="mon-segmented" role="group" aria-label="Столбцы">
          {MODES.map(m => (
            <button key={m.mode} type="button" disabled={m.mode === 'levels' && !levelsOk} className={m.mode === mode ? 'is-current' : undefined} onClick={() => setMode(m.mode)}>{m.label}</button>
          ))}
        </div>
      )}
    >
      <h4 className="mon-dash__sub">Параллели</h4>
      <div className="mon-dyn__scroll">
        <table className="mon-dyn__table mon-dash__heat">
          <thead>{head}</thead>
          <tbody>{(d.parallels || []).filter(p => p.n > 0).map(p => line(String(p.parallel), <b>{p.parallel}</b>, p.cells, p.avg_percent, p.parallel === parallel ? 'is-picked' : undefined))}</tbody>
        </table>
      </div>
      <h4 className="mon-dash__sub">Группы {parallel} параллели</h4>
      <div className="mon-dyn__scroll">
        <table className="mon-dyn__table mon-dash__heat">
          <thead>{head}</thead>
          <tbody>
            {groups.map(g => line(String(g.group_id), g.title, g.cells, g.avg_percent))}
            {par && par.n ? line('par', <b>Параллель</b>, par.cells, par.avg_percent, 'is-par mon-dash__par') : null}
          </tbody>
        </table>
      </div>
      <div className="mon-dyn__legend">
        {BAND_LEGEND.map(b => <span key={b.band}><i className={`mon-band--${b.band}`} />{b.label}</span>)}
      </div>
      {weak ? <p className="mon-dash__weak">Слабее всего в {parallel} параллели: {weak}</p> : null}
    </Block>
  );
}

const REASONS: { code: 'two' | 'drop' | 'two_drops'; label: (d: Data) => string }[] = [
  { code: 'two', label: () => 'отметка «2» за работу' },
  { code: 'drop', label: d => `ниже входного на ${d.settings.drop_to_start} пунктов и больше` },
  { code: 'two_drops', label: d => `два снижения подряд по ${d.settings.threshold} пунктов и больше` },
];

function Risk({ d }: { d: Data }) {
  const [reason, setReason] = useState<string>('');
  const r = d.risk!;
  const graded = Boolean(d.work?.graded);
  const list = reason ? r.students.filter(s => s.reasons.some(x => x.code === reason)) : [];
  return (
    <Block
      title="Группа риска"
      note={`По выбранной работе и динамике к входному. Группа: средний процент ниже ${d.settings.group_avg_below}${graded ? ` или «2» у ${d.settings.group_twos_from} % учеников и больше` : ''}. Пороги меняет администратор данных на вкладке «Динамика».`}
    >
      <div className="mon-dash__two">
        <div>
          <h4 className="mon-dash__sub">Группы</h4>
          {r.groups.length ? (
            <table className="mon-dyn__table mon-dash__table">
              <thead><tr><th className="is-l">Группа</th><th>Средний %</th>{graded ? <th>«2»</th> : null}</tr></thead>
              <tbody>
                {r.groups.map(g => (
                  <tr key={g.group_id}>
                    <td className="is-l">{g.title}<span className="mon-dash__teacher"> · {g.teacher}</span></td>
                    <td className={band(g.avg_percent)}>{g.avg_percent}</td>
                    {graded ? <td className={(g.twos || 0) > 0 ? 'mon-dash__bad' : undefined}>«2» у {g.twos} из {g.marked}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="mon-note">Групп в зоне риска нет</p>}
        </div>
        <div>
          <h4 className="mon-dash__sub">Ученики</h4>
          <div className="mon-dash__counters">
            {REASONS.filter(x => x.code !== 'two' || graded).map(x => (
              <button key={x.code} type="button" className={`mon-dash__counter${reason === x.code ? ' is-current' : ''}`} disabled={!r.counts[x.code]} onClick={() => setReason(reason === x.code ? '' : x.code)}>
                <b>{r.counts[x.code]}</b><span>{x.label(d)}</span>
              </button>
            ))}
          </div>
          {!reason && r.students.length ? <p className="mon-dyn__muted">Нажмите на причину, чтобы увидеть список.</p> : null}
        </div>
      </div>
      {reason ? (
        <div className="mon-dyn__scroll">
          <table className="mon-dyn__table mon-dash__table mon-dash__list">
            <thead>
              <tr><th className="is-l">Ученик</th><th className="is-l">Группа</th><th className="is-l">Учитель</th>{r.points.map(p => <th key={p.key}>{p.title}, %</th>)}<th className="is-l">Причина</th></tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id}>
                  <td className="is-l">{s.full_name}</td>
                  <td className="is-l">{s.group}</td>
                  <td className="is-l mon-dash__teacher">{s.teacher}</td>
                  {r.points.map(p => <td key={p.key}>{s.values[p.key] ?? ''}</td>)}
                  <td className="is-l">{s.reasons.map(x => x.text).join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Block>
  );
}

function Top({ d }: { d: Data }) {
  const [open, setOpen] = useState(false);
  const t = d.top!;
  const graded = Boolean(d.work?.graded);
  const rated = (g: Rated, i?: number) => (
    <li key={`${g.group_id}-${i ?? ''}`}>
      {i !== undefined ? <span className="mon-dash__place">{i + 1}</span> : <span className="mon-dash__place mon-dash__place--p">{g.parallel}</span>}
      <span className="mon-dash__who">{g.title}<span className="mon-dash__teacher">{g.teacher ? ` · ${g.teacher}` : ''}</span></span>
      <span className={`mon-dash__val ${band(g.avg_percent)}`}>{g.avg_percent}&nbsp;%</span>
    </li>
  );
  return (
    <Block
      title="Самые высокие результаты"
      foot={t.excluded.length ? <p className="mon-dyn__muted">Не в рейтинге групп (внесено меньше половины учеников): {t.excluded.join(', ')}.</p> : <p className="mon-dyn__muted">Группы, где внесено меньше половины учеников, в рейтинг не берутся.</p>}
    >
      <div className="mon-dash__three">
        <div>
          <h4 className="mon-dash__sub">Параллели</h4>
          <ol className="mon-dash__rank">
            {t.parallels.map((p, i) => (
              <li key={p.parallel}>
                <span className="mon-dash__place">{i + 1}</span>
                <span className="mon-dash__who">{p.parallel} параллель{graded && p.avg_mark !== null ? <span className="mon-dash__teacher"> · отметка {mark2(p.avg_mark)}</span> : null}</span>
                <span className={`mon-dash__val ${band(p.avg_percent)}`}>{p.avg_percent}&nbsp;%</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h4 className="mon-dash__sub">Группы школы</h4>
          <ol className="mon-dash__rank">{t.groups.map((g, i) => rated(g, i))}</ol>
          <h4 className="mon-dash__sub">Лучшая в параллели</h4>
          <ul className="mon-dash__rank">{t.best_by_parallel.map(g => rated(g))}</ul>
        </div>
        <div>
          <h4 className="mon-dash__sub">Ученики с результатом {d.top_percent}&nbsp;% и выше</h4>
          <button type="button" className={`mon-dash__counter${open ? ' is-current' : ''}`} disabled={!t.students.length} onClick={() => setOpen(!open)}>
            <b>{t.students.length}</b><span>{plural(t.students.length, 'ученик', 'ученика', 'учеников')}{t.students.length ? (open ? ', скрыть список' : ', показать список') : ''}</span>
          </button>
        </div>
      </div>
      {open ? (
        <div className="mon-dyn__scroll">
          <table className="mon-dyn__table mon-dash__table mon-dash__list">
            <thead><tr><th className="is-l">Ученик</th><th className="is-l">Группа</th><th>%</th></tr></thead>
            <tbody>{t.students.map(s => <tr key={s.id}><td className="is-l">{s.full_name}</td><td className="is-l">{s.group}</td><td className={band(s.percent)}>{s.percent}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </Block>
  );
}

// ---------- Excel: все таблицы дашборда отдельными листами ----------

type Cell = string | number | null;
type Sheet = { name: string; title: string; note: string; head: string[]; rows: Cell[][]; heat?: number[]; marks?: number[]; bold?: boolean[] };
const markCell = (graded: boolean, v: number | null) => (graded ? v : null);

function sheets(d: Data): Sheet[] {
  const w = d.work!;
  const g = w.graded;
  const s = d.school!;
  const out: Sheet[] = [];
  out.push({
    name: 'Плитки', title: `${w.title}: по школе`, note: 'Только полные работы; отсутствовавшие не входят ни в числитель, ни в знаменатель.',
    head: ['Показатель', 'Значение'],
    rows: [
      ['Средняя отметка', g ? s.avg_mark : NO_MARKS], ['Средний процент выполнения', s.avg_percent],
      ['Качество знаний, %', g ? s.quality : NO_MARKS], ['Успеваемость, %', g ? s.success : NO_MARKS],
      ['Внесено, учеников', s.n], ['Из них должно быть', s.m], ['Внесено, %', s.entered],
    ],
  });
  const sumHead = ['Средняя отметка', 'Средний %', '«5»', '«4»', '«3»', '«2»', 'Качество, %', 'Успеваемость, %', 'Внесено', 'Из'];
  const sumRow = (x: Sum): Cell[] => [markCell(g, x.avg_mark), x.avg_percent, ...(['5', '4', '3', '2'] as const).map(k => (x.marks ? x.marks[k] : null)), g ? x.quality : null, g ? x.success : null, x.n, x.m];
  out.push({ name: 'Параллели', title: `${w.title}: по параллелям`, note: 'Параллель считается по всем ученикам с полной работой, не как среднее средних групп.', head: ['Параллель', ...sumHead], rows: (d.parallels || []).map(p => [p.parallel, ...sumRow(p)]), heat: [2], marks: [1] });
  const groupRows: Cell[][] = [];
  const bold: boolean[] = [];
  for (const p of d.parallels || []) {
    for (const x of (d.groups || []).filter(y => y.parallel === p.parallel).sort((a, b) => (b.avg_percent ?? -1) - (a.avg_percent ?? -1))) { groupRows.push([p.parallel, x.title, x.teacher, ...sumRow(x)]); bold.push(false); }
    groupRows.push([p.parallel, 'Параллель', '', ...sumRow(p)]); bold.push(true);
  }
  out.push({ name: 'Группы', title: `${w.title}: группы всех параллелей`, note: 'Внутри параллели по убыванию среднего процента.', head: ['Параллель', 'Группа', 'Учитель', ...sumHead], rows: groupRows, heat: [4], marks: [3], bold });
  for (const { mode: m } of MODES) {
    const cols = d.columns?.[m] || [];
    if (!cols.length) continue;
    const head = [...cols.map(c => c.label), 'Итого'];
    const name = m === 'sections' ? 'Разделы' : m === 'levels' ? 'Уровни' : 'Задания';
    out.push({
      name: `${name}, параллели`, title: `${w.title}: ${MODES.find(x => x.mode === m)!.label.toLowerCase()}, параллели`, note: 'Сумма баллов / сумма максимумов × 100, только полные работы.',
      head: ['Параллель', ...head], rows: (d.parallels || []).filter(p => p.n).map(p => [p.parallel, ...cols.map(c => p.cells[m][c.key] ?? null), p.avg_percent]),
      heat: head.map((_, i) => i + 1),
    });
    const rows: Cell[][] = [];
    const b: boolean[] = [];
    for (const p of (d.parallels || []).filter(x => x.n)) {
      for (const x of (d.groups || []).filter(y => y.parallel === p.parallel && y.n)) { rows.push([p.parallel, x.title, ...cols.map(c => x.cells[m][c.key] ?? null), x.avg_percent]); b.push(false); }
      rows.push([p.parallel, 'Параллель', ...cols.map(c => p.cells[m][c.key] ?? null), p.avg_percent]); b.push(true);
    }
    out.push({ name: `${name}, группы`, title: `${w.title}: ${MODES.find(x => x.mode === m)!.label.toLowerCase()}, группы`, note: 'Сумма баллов / сумма максимумов × 100, только полные работы.', head: ['Параллель', 'Группа', ...head], rows, heat: head.map((_, i) => i + 2), bold: b });
  }
  const r = d.risk!;
  out.push({
    name: 'Риск, группы', title: `${w.title}: группы в зоне риска`, note: `Средний процент ниже ${d.settings.group_avg_below}${g ? ` или «2» у ${d.settings.group_twos_from} % и больше` : ''}.`,
    head: ['Параллель', 'Группа', 'Учитель', 'Средний %', '«2»', 'С отметкой', 'Причина'],
    rows: r.groups.map(x => [x.parallel, x.title, x.teacher, x.avg_percent, g ? x.twos : null, g ? x.marked : null, x.reasons.map(y => y.text).join('; ')]), heat: [3],
  });
  out.push({
    name: 'Риск, ученики', title: `${w.title}: ученики в зоне риска`, note: REASONS.filter(x => x.code !== 'two' || g).map(x => `${x.label(d)}: ${r.counts[x.code]}`).join('; '),
    head: ['Ученик', 'Параллель', 'Группа', 'Учитель', ...r.points.map(p => `${p.title}, %`), 'Причина'],
    rows: r.students.map(x => [x.full_name, x.parallel, x.group, x.teacher, ...r.points.map(p => x.values[p.key] ?? null), x.reasons.map(y => y.text).join('; ')]),
    heat: r.points.map((_, i) => i + 4),
  });
  const t = d.top!;
  out.push({
    name: 'Лучшие', title: `${w.title}: самые высокие результаты`, note: t.excluded.length ? `Не в рейтинге групп (внесено меньше половины): ${t.excluded.join(', ')}.` : 'Группы, где внесено меньше половины учеников, в рейтинг не берутся.',
    head: ['Рейтинг', 'Место', 'Параллель', 'Группа', 'Учитель', 'Средний %', 'Средняя отметка'],
    rows: [
      ...t.parallels.map((p, i): Cell[] => ['Параллели', i + 1, p.parallel, '', '', p.avg_percent, markCell(g, p.avg_mark)]),
      ...t.groups.map((x, i): Cell[] => ['Группы школы', i + 1, x.parallel, x.title, x.teacher, x.avg_percent, markCell(g, x.avg_mark)]),
      ...t.best_by_parallel.map((x): Cell[] => ['Лучшая в параллели', 1, x.parallel, x.title, x.teacher, x.avg_percent, markCell(g, x.avg_mark)]),
    ],
    heat: [5], marks: [6],
  });
  out.push({ name: `Ученики ${d.top_percent}+`, title: `${w.title}: ученики с результатом ${d.top_percent} % и выше`, note: `Всего: ${t.students.length}.`, head: ['Ученик', 'Параллель', 'Группа', '%'], rows: t.students.map(x => [x.full_name, x.parallel, x.group, x.percent]), heat: [3] });
  return out;
}

const LAT: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
const latin = (text: string) => text.toLowerCase().split('').map(c => LAT[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;

async function download(d: Data) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  for (const t of sheets(d)) {
    const ws = wb.addWorksheet(t.name);
    ws.addRow([t.title]).font = { bold: true, size: 12 };
    ws.addRow([t.note]).font = { italic: true, color: { argb: xlsxNote } };
    ws.addRow([]);
    ws.addRow(t.head).font = { bold: true };
    t.rows.forEach((r, i) => {
      const row = ws.addRow(r.map(c => (c === null ? '' : c)));
      if (t.bold?.[i]) row.font = { bold: true };
      (t.heat || []).forEach(j => xlsxPercent(row.getCell(j + 1), r[j]));
      (t.marks || []).forEach(j => {
        const c = markColor(typeof r[j] === 'number' ? (r[j] as number) : null);
        if (!c) return;
        const cell = row.getCell(j + 1);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.bg) } };
        cell.font = { ...(cell.font || {}), color: { argb: argb(c.ink) } };
      });
    });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    t.head.forEach((h, i) => { ws.getColumn(i + 1).width = Math.max(10, Math.min(28, h.length + 2)); });
  }
  const info = wb.addWorksheet('Пояснения');
  [
    ['Только полные работы. Отсутствовавшие не входят ни в числитель, ни в знаменатель.'],
    ['Отметки по действующей шкале: «5» от 90 %, «4» от 74 %, «3» от 50 %; щадящий режим на отметку не влияет.'],
    ['Группа: среднее процентов её учеников. Параллель и школа: по всем ученикам с полной работой, не среднее средних.'],
    ['Качество знаний: доля «4» и «5» от учеников с отметкой. Успеваемость: доля учеников без «2».'],
    [`Учебный год: ${d.year || ''}. Работа: ${d.work?.title || ''}. Выгружено: ${new Date().toLocaleString('ru-RU')}.`],
  ].forEach(r => info.addRow(r));
  info.getColumn(1).width = 100;
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashboard_${latin(d.work?.title || '')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DashboardPage() {
  const [work, setWork] = useState('');
  const [parallel, setParallel] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('sections');
  const [group, setGroup] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const { data, error } = useApi<Data>(`/dashboard${work ? `?work=${encodeURIComponent(work)}` : ''}`);
  const loading = !data || (work && data.work?.key !== work);
  const withResults = (data?.parallels || []).filter(p => p.n > 0).map(p => p.parallel);
  const allParallels = (data?.parallels || []).map(p => p.parallel);
  // Параллель для групп: выбранная, если она есть у этой работы, иначе первая с результатами.
  const shown = parallel !== null && allParallels.includes(parallel) ? parallel : (withResults[0] ?? allParallels[0] ?? null);
  const effectiveMode: Mode = mode === 'levels' && !data?.columns?.levels.length ? 'sections' : mode;
  const groupVisible = group !== null && (data?.groups || []).some(g => g.group_id === group && g.parallel === shown);

  async function save() {
    if (!data) return;
    setBusy(true); setSaveError('');
    try { await download(data); } catch (e) { setSaveError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mon-an mon-viz mon-dash">
      <div className="mon-dyn__head">
        <h2 className="mon-dyn__h">Дашборд{data?.work ? `: ${data.work.title}` : ''}</h2>
        <div className="mon-toolbar">
          <label className="mon-field">
            <span className="mon-label">Работа</span>
            <select className="mon-input mon-select" value={data?.work?.key ?? ''} disabled={!data} onChange={e => { setWork(e.target.value); setGroup(null); }}>
              {(data?.works || []).map(w => <option key={w.key} value={w.key}>{w.title}{w.has_results ? '' : ' (нет результатов)'}</option>)}
            </select>
          </label>
          <label className="mon-field">
            <span className="mon-label">Параллель для групп</span>
            <select className="mon-input mon-select" value={shown ?? ''} disabled={!data || !allParallels.length} onChange={e => { setParallel(Number(e.target.value)); setGroup(null); }}>
              {allParallels.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button type="button" className="mon-btn mon-btn--primary" disabled={!data?.work || Boolean(loading) || busy} onClick={save}>{busy ? 'Готовим файл…' : 'Скачать Excel'}</button>
        </div>
      </div>
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {saveError ? <p className="mon-err" role="alert">{saveError}</p> : null}
      {loading && !error ? <p className="mon-note">Считаем…</p> : null}
      {data && !loading && !data.work ? <p className="mon-note">Работ с результатами пока нет</p> : null}
      {data && !loading && data.work && data.school ? (
        <div className="mon-dyn">
          <Tiles d={data} />
          <Parallels d={data} parallel={shown} onPick={p => { setParallel(p); setGroup(null); }} />
          {shown !== null ? <Groups d={data} parallel={shown} onGroup={id => setGroup(id === group ? null : id)} open={groupVisible ? group : null} /> : null}
          {groupVisible && data.work ? <Students key={`${data.work.key}/${group}`} work={data.work.key} groupId={group as number} onClose={() => setGroup(null)} /> : null}
          {shown !== null ? <Sections d={data} parallel={shown} mode={effectiveMode} setMode={setMode} /> : null}
          <Risk key={data.work.key} d={data} />
          <Top key={`top-${data.work.key}`} d={data} />
        </div>
      ) : null}
    </div>
  );
}
