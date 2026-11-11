import { useState } from 'react';
import { useApi } from './api';
import { shares100 } from './Dynamics';
import { band } from './DynamicsScreen';
import { BAND_LEGEND, PALETTE, xlsxNote, xlsxPercent } from './palette';
import { DEFAULT_SORT, effectiveSort, GroupSort, nextSort, SORT_LABEL, SortKey, sortGroups, sortNote } from './groupSort';
import ShortList, { LIST_LIMIT, ListWindow, type ListCol } from './ListDialog';

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
type LowStudent = {
  id: number; full_name: string; parallel: number; class_label: string | null; group_id: number; group: string; teacher: string;
  total: number | null; max: number | null; percent: number; mark: string | null; weak: { name: string; percent: number } | null;
};
type TopStudent = { id: number; full_name: string; group: string; parallel: number; percent: number; mark: string | null };
type Rated = { group_id: number; title: string; parallel: number; teacher: string; avg_percent: number; avg_mark: number | null; n: number; m: number };
type Data = {
  year: string | null;
  works: { key: string; title: string; type_code: string; graded: boolean; has_results: boolean }[];
  work: { key: string; title: string; type_code: string; graded: boolean; max_points: number | null } | null;
  settings: { threshold: number; drop_to_start: number; group_avg_below: number; group_twos_from: number };
  top_percent: number;
  low?: { kind: 'two' | 'below'; below: number; students: LowStudent[] };
  school?: Sum; parallels?: ParallelRow[]; groups?: GroupRow[];
  columns?: Record<Mode, Column[]>;
  risk?: {
    groups: { group_id: number; title: string; parallel: number; teacher: string; avg_percent: number; twos: number | null; marked: number; reasons: Reason[] }[];
    students: RiskStudent[]; counts: Record<'two' | 'drop' | 'two_drops', number>; points: { key: string; title: string }[];
  };
  top?: {
    parallels: { parallel: number; avg_percent: number; avg_mark: number | null; n: number }[];
    groups: Rated[]; best_by_parallel: Rated[]; excluded: string[];
    students: TopStudent[];
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

// Блок «Получили «2»» (Ира, 11.11): самый верх дашборда, по работе из общего выбора. У работ без отметок «Ниже 50%».
function Low({ d }: { d: Data }) {
  const [parallel, setParallel] = useState<number | null>(null);
  const low = d.low!;
  const two = low.kind === 'two';
  const parallels = (d.parallels || []).map(p => p.parallel);
  const rows = parallel === null ? low.students : low.students.filter(s => s.parallel === parallel);
  const withScore = rows.some(s => s.total !== null);
  const name = two ? 'Получили «2»' : `Ниже ${low.below}%`;
  const title = `${name}: ${rows.length} ${plural(rows.length, 'ученик', 'ученика', 'учеников')}`;
  const where = parallel === null ? '' : ` в ${parallel} параллели`;
  const cols: ListCol<LowStudent>[] = [
    { key: 'name', label: 'Ученик', left: true, cell: s => s.full_name, sort: s => s.full_name },
    {
      key: 'group', label: 'Класс и группа', left: true,
      cell: s => (s.class_label
        ? <span className="mon-low__class">{s.class_label}<small>группа {s.group}</small></span>
        : <span className="mon-low__class">{s.group}<small>{s.parallel} параллель</small></span>),
      sort: s => `${String(s.parallel).padStart(2, '0')} ${s.class_label || ''} ${s.group}`,
      excel: s => (s.class_label ? `${s.class_label}, группа ${s.group}` : s.group),
    },
    { key: 'teacher', label: 'Учитель', left: true, cell: s => <span className="mon-dash__teacher">{s.teacher}</span>, sort: s => s.teacher },
    ...(withScore ? [{ key: 'total', label: 'Балл', cell: (s: LowStudent) => (s.total === null ? '' : `${num(s.total)} из ${s.max}`), sort: (s: LowStudent) => s.total, excel: (s: LowStudent) => s.total } as ListCol<LowStudent>] : []),
    { key: 'percent', label: '%', cell: s => s.percent, cls: s => band(s.percent), sort: s => s.percent, heat: true },
    { key: 'weak', label: 'Самый слабый раздел', left: true, cell: s => (s.weak ? <span className="mon-low__weak">{s.weak.name}, <b>{s.weak.percent}&nbsp;%</b></span> : ''), sort: s => s.weak?.percent ?? null, excel: s => (s.weak ? `${s.weak.name}, ${s.weak.percent} %` : null) },
  ];
  return (
    <Block
      title={title}
      note={two
        ? `${d.work?.title || ''}: ученики с отметкой «2» по действующей шкале (ниже 50 %). Порядок: параллель, группа, процент от низкого к высокому.`
        : `${d.work?.title || ''}: у работы нет отметок, поэтому здесь ученики с результатом ниже ${low.below} %. Порядок: параллель, группа, процент от низкого к высокому.`}
      side={(
        <label className="mon-field">
          <span className="mon-label">Параллель</span>
          <select className="mon-input mon-select" value={parallel ?? ''} onChange={e => setParallel(e.target.value ? Number(e.target.value) : null)}>
            <option value="">все</option>
            {parallels.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      )}
    >
      {rows.length ? (
        <ShortList
          rows={rows} cols={cols} rowKey={s => s.id} search={s => `${s.full_name} ${s.group} ${s.class_label || ''}`}
          title={`${name}${where}: ${d.work?.title || ''}`} fileName={`${two ? 'poluchili-2' : `nizhe-${low.below}`}_${d.work?.title || ''}${parallel === null ? '' : `_${parallel}`}`}
          tableClass="mon-dash__table mon-dash__list"
        />
      ) : <p className="mon-low__empty">{two ? `Нет учеников с «2»${where} по этой работе` : `Нет учеников ниже ${low.below}%${where} по этой работе`}</p>}
    </Block>
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

function SortTh({ k, sort, onSort, left }: { k: SortKey; sort: GroupSort; onSort: (k: SortKey) => void; left?: boolean }) {
  const active = sort.key === k;
  const arrow = active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕';
  return (
    <th className={left ? 'is-l' : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`mon-dash__sort${active ? ' is-active' : ''}${left ? ' is-l' : ''}`} onClick={() => onSort(k)} title="Нажмите, чтобы отсортировать">
        {SORT_LABEL[k]}<span className="mon-dash__sort-arrow" aria-hidden="true">{arrow}</span>
      </button>
    </th>
  );
}

function Groups({ d, parallel, onGroup, open }: { d: Data; parallel: number; onGroup: (id: number) => void; open: number | null }) {
  const graded = Boolean(d.work?.graded);
  const [picked, setSort] = useState<GroupSort>(DEFAULT_SORT);
  const sort = effectiveSort(picked, graded);
  const onSort = (k: SortKey) => setSort(nextSort(sort, k));
  const list = sortGroups((d.groups || []).filter(g => g.parallel === parallel), sort);
  const par = (d.parallels || []).find(p => p.parallel === parallel);
  const row = (g: Sum, title: React.ReactNode, teacher: string, key: string, isPar: boolean, id?: number) => (
    <tr key={key} className={isPar ? 'is-par mon-dash__par' : `mon-dash__click${id === open ? ' is-picked' : ''}`} onClick={id ? () => onGroup(id) : undefined} tabIndex={id ? 0 : undefined} onKeyDown={id ? e => { if (e.key === 'Enter') onGroup(id); } : undefined}>
      <td className="is-l">{title}</td>
      <td className="is-l mon-dash__teacher">{teacher}</td>
      {graded ? <td className={g.n ? markBand(g.avg_mark) : 'mon-band--empty'}>{mark2(g.avg_mark)}</td> : null}
      <td className={g.n ? band(g.avg_percent) : 'mon-band--empty'}>{g.avg_percent ?? 'нет данных'}</td>
      {graded ? (
        <>
          <td className={(g.twos || 0) > 0 ? 'mon-dash__bad' : g.n ? undefined : 'mon-dash__dash'}>{g.n ? g.twos : '–'}</td>
          <td>{pct(g.quality)}</td>
          <td>{pct(g.success)}</td>
        </>
      ) : null}
      <td className={g.n < g.m ? 'mon-dash__bad' : undefined}>{g.n} из {g.m}</td>
    </tr>
  );
  const th = (k: SortKey, left?: boolean) => <SortTh k={k} sort={sort} onSort={onSort} left={left} />;
  return (
    <Block title={`Группы ${parallel} параллели`} note={`${sortNote(sort)} Нажмите на заголовок столбца, чтобы изменить порядок, или на группу, чтобы открыть таблицу учеников.`}>
      <div className="mon-dyn__scroll">
        <table className="mon-dyn__table mon-dash__table">
          <thead>
            <tr>
              {th('title', true)}{th('teacher', true)}{graded ? th('avg_mark') : null}{th('avg_percent')}
              {graded ? <>{th('twos')}{th('quality')}{th('success')}</> : null}{th('entered')}
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

type GroupStudent = GroupTable['students'][number];
// Столбцы таблицы учеников группы. Кто не писал: состояние в столбце балла (или процента), остальное пусто.
function studentCols(data: GroupTable): ListCol<GroupStudent>[] {
  const graded = data.work.graded;
  const placement = data.work.key === 'placement';
  const withTotal = !placement && Boolean(data.work.max_points);
  const cols: ListCol<GroupStudent>[] = [{ key: 'name', label: 'Ученик', left: true, cell: s => s.full_name, sort: s => s.full_name }];
  if (!placement) cols.push({ key: 'start', label: 'Входное, %', cell: s => s.start ?? '', sort: s => s.start, heat: true });
  if (withTotal) cols.push({ key: 'total', label: `Балл из ${data.work.max_points}`, cell: s => (s.wrote ? num(s.total as number) : s.state), cls: s => (s.wrote ? undefined : 'mon-dyn__none'), sort: s => s.total, excel: s => (s.wrote ? s.total : s.state) });
  cols.push({ key: 'percent', label: '%', cell: s => (s.wrote ? s.percent : withTotal ? '' : s.state), cls: s => (s.wrote ? band(s.percent) : withTotal ? undefined : 'mon-dyn__none'), sort: s => s.percent, excel: s => (s.wrote ? s.percent : withTotal ? null : s.state), heat: true });
  if (graded) cols.push({ key: 'mark', label: 'Отметка', cell: s => s.mark ?? '', cls: s => (s.mark ? `mon-dash__mark mon-dash__mark--${s.mark}` : undefined), sort: s => (s.mark ? Number(s.mark) : null) });
  return cols;
}

function Students({ work, groupId, onClose }: { work: string; groupId: number; onClose: () => void }) {
  const { data, error } = useApi<GroupTable>(`/dashboard/group?work=${encodeURIComponent(work)}&group=${groupId}`);
  const graded = Boolean(data?.work.graded);
  return (
    <Block
      title={`Ученики: ${data?.group.title || ''}`}
      note={data ? `${data.work.title}. Входное для сравнения.${graded ? ' Отметка по действующей шкале.' : ''}` : undefined}
      side={<button type="button" className="mon-btn" onClick={onClose}>Закрыть</button>}
    >
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {!data && !error ? <p className="mon-note">Загружаем…</p> : null}
      {data ? (
        <ShortList
          rows={data.students} cols={studentCols(data)} rowKey={x => x.id} search={x => x.full_name}
          title={`Ученики ${data.group.title}: ${data.work.title}`} fileName={`ucheniki_${data.group.title}_${data.work.title}`}
          tableClass="mon-dyn__students"
        />
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

type RiskGroup = NonNullable<Data['risk']>['groups'][number];
function riskGroupCols(graded: boolean): ListCol<RiskGroup>[] {
  const cols: ListCol<RiskGroup>[] = [
    { key: 'title', label: 'Группа', left: true, cell: g => g.title, sort: g => g.title },
    { key: 'teacher', label: 'Учитель', left: true, cell: g => g.teacher, sort: g => g.teacher },
    { key: 'avg', label: 'Средний %', cell: g => g.avg_percent, cls: g => band(g.avg_percent), sort: g => g.avg_percent, heat: true },
  ];
  if (graded) cols.push({ key: 'twos', label: '«2»', cell: g => `«2» у ${g.twos} из ${g.marked}`, cls: g => ((g.twos || 0) > 0 ? 'mon-dash__bad' : undefined), sort: g => g.twos });
  cols.push({ key: 'reason', label: 'Причина', left: true, cell: g => g.reasons.map(x => x.text).join('; '), sort: g => g.reasons.map(x => x.text).join('; ') });
  return cols;
}
// На странице столбцы группы риска как раньше (группа с учителем, %, «2»); в окне и Excel учитель и причина отдельно.
function riskGroupPageCols(graded: boolean): ListCol<RiskGroup>[] {
  const keep = riskGroupCols(graded).filter(c => c.key === 'avg' || c.key === 'twos');
  return [{ key: 'title', label: 'Группа', left: true, cell: g => <>{g.title}<span className="mon-dash__teacher"> · {g.teacher}</span></> }, ...keep];
}

function riskStudentCols(points: { key: string; title: string }[]): ListCol<RiskStudent>[] {
  return [
    { key: 'name', label: 'Ученик', left: true, cell: s => s.full_name, sort: s => s.full_name },
    { key: 'group', label: 'Группа', left: true, cell: s => s.group, sort: s => s.group },
    { key: 'teacher', label: 'Учитель', left: true, cell: s => <span className="mon-dash__teacher">{s.teacher}</span>, sort: s => s.teacher },
    ...points.map((p): ListCol<RiskStudent> => ({ key: `p:${p.key}`, label: `${p.title}, %`, cell: s => s.values[p.key] ?? '', sort: s => s.values[p.key] ?? null, heat: true })),
    { key: 'reason', label: 'Причина', left: true, cell: s => s.reasons.map(x => x.text).join('; '), sort: s => s.reasons.map(x => x.text).join('; ') },
  ];
}

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
            <ShortList
              rows={r.groups} cols={riskGroupCols(graded)} pageCols={riskGroupPageCols(graded)} rowKey={g => g.group_id} search={g => `${g.title} ${g.teacher}`}
              title={`Группы в зоне риска: ${d.work?.title || ''}`} fileName={`risk-gruppy_${d.work?.title || ''}`} tableClass="mon-dash__table"
            />
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
        <ShortList
          key={reason} rows={list} cols={riskStudentCols(r.points)} rowKey={x => x.id} search={x => `${x.full_name} ${x.group}`}
          title={`Ученики в зоне риска: ${REASONS.find(x => x.code === reason)!.label(d)}`} note={d.work?.title || ''}
          fileName={`risk-ucheniki_${d.work?.title || ''}`} tableClass="mon-dash__table mon-dash__list"
        />
      ) : null}
    </Block>
  );
}

type RankedGroup = Rated & { place: number };
function ratedCols(graded: boolean, withPlace: boolean): ListCol<RankedGroup>[] {
  const cols: ListCol<RankedGroup>[] = [];
  if (withPlace) cols.push({ key: 'place', label: 'Место', cell: g => g.place, sort: g => g.place });
  cols.push(
    { key: 'parallel', label: 'Параллель', cell: g => g.parallel, sort: g => g.parallel },
    { key: 'title', label: 'Группа', left: true, cell: g => g.title, sort: g => g.title },
    { key: 'teacher', label: 'Учитель', left: true, cell: g => <span className="mon-dash__teacher">{g.teacher}</span>, sort: g => g.teacher },
    { key: 'avg', label: 'Средний %', cell: g => g.avg_percent, cls: g => band(g.avg_percent), sort: g => g.avg_percent, heat: true },
  );
  if (graded) cols.push({ key: 'mark', label: 'Средняя отметка', cell: g => mark2(g.avg_mark), cls: g => markBand(g.avg_mark), sort: g => g.avg_mark });
  cols.push({ key: 'n', label: 'Внесено', cell: g => `${g.n} из ${g.m}`, sort: g => g.n, excel: g => `${g.n} из ${g.m}` });
  return cols;
}

// Рейтинг списком на странице: первые 5 строк, остальные в окне.
function RankList({ list, render, title, fileName, cols, ordered }: { list: RankedGroup[]; render: (g: RankedGroup) => React.ReactNode; title: string; fileName: string; cols: ListCol<RankedGroup>[]; ordered: boolean }) {
  const [open, setOpen] = useState(false);
  const items = list.slice(0, LIST_LIMIT).map(render);
  return (
    <>
      {ordered ? <ol className="mon-dash__rank">{items}</ol> : <ul className="mon-dash__rank">{items}</ul>}
      {list.length > LIST_LIMIT ? <button type="button" className="mon-btn mon-list__more" onClick={() => setOpen(true)}>Показать всех ({list.length})</button> : null}
      {open ? <ListWindow rows={list} cols={cols} rowKey={g => `${g.group_id}-${g.place}`} search={g => `${g.title} ${g.teacher}`} title={title} fileName={fileName} tableClass="mon-dash__table" onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Top({ d }: { d: Data }) {
  const t = d.top!;
  const graded = Boolean(d.work?.graded);
  const w = d.work?.title || '';
  const rated = (g: RankedGroup, numbered: boolean) => (
    <li key={`${g.group_id}-${g.place}`}>
      {numbered ? <span className="mon-dash__place">{g.place}</span> : <span className="mon-dash__place mon-dash__place--p">{g.parallel}</span>}
      <span className="mon-dash__who">{g.title}<span className="mon-dash__teacher">{g.teacher ? ` · ${g.teacher}` : ''}</span></span>
      <span className={`mon-dash__val ${band(g.avg_percent)}`}>{g.avg_percent}&nbsp;%</span>
    </li>
  );
  const ranked = t.groups.map((g, i) => ({ ...g, place: i + 1 }));
  const best = t.best_by_parallel.map(g => ({ ...g, place: 1 }));
  const studentCols: ListCol<TopStudent>[] = [
    { key: 'name', label: 'Ученик', left: true, cell: s => s.full_name, sort: s => s.full_name },
    { key: 'group', label: 'Группа', left: true, cell: s => s.group, sort: s => s.group },
    { key: 'percent', label: '%', cell: s => s.percent, cls: s => band(s.percent), sort: s => s.percent, heat: true },
  ];
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
          <RankList list={ranked} render={g => rated(g, true)} ordered cols={ratedCols(graded, true)} title={`Рейтинг групп школы: ${w}`} fileName={`reyting-grupp_${w}`} />
          <h4 className="mon-dash__sub">Лучшая в параллели</h4>
          <RankList list={best} render={g => rated(g, false)} ordered={false} cols={ratedCols(graded, false)} title={`Лучшая группа в каждой параллели: ${w}`} fileName={`luchshie-v-paralleli_${w}`} />
        </div>
        <div>
          <h4 className="mon-dash__sub">Ученики с результатом {d.top_percent}&nbsp;% и выше: {t.students.length}</h4>
          {t.students.length ? (
            <ShortList
              rows={t.students} cols={studentCols} rowKey={s => s.id} search={s => `${s.full_name} ${s.group}`}
              title={`Ученики с результатом ${d.top_percent} % и выше: ${w}`} fileName={`ucheniki-${d.top_percent}_${w}`} tableClass="mon-dash__table mon-dash__list"
            />
          ) : <p className="mon-note">Таких учеников нет</p>}
        </div>
      </div>
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
  if (d.low) {
    const two = d.low.kind === 'two';
    out.push({
      name: two ? 'Получили 2' : `Ниже ${d.low.below}`, title: `${w.title}: ${two ? 'получили «2»' : `ниже ${d.low.below} %`}`,
      note: `Всего: ${d.low.students.length}. Порядок: параллель, группа, процент от низкого к высокому.`,
      head: ['Ученик', 'Параллель', 'Класс', 'Группа', 'Учитель', 'Балл', 'Из', '%', 'Самый слабый раздел', 'Раздел, %'],
      rows: d.low.students.map(x => [x.full_name, x.parallel, x.class_label, x.group, x.teacher, x.total, x.max, x.percent, x.weak?.name ?? null, x.weak?.percent ?? null]),
      heat: [7, 9],
    });
  }
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
          {data.low ? <Low key={`low-${data.work.key}`} d={data} /> : null}
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
