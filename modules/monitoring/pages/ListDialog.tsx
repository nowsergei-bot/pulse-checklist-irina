import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { xlsxNote, xlsxPercent } from './palette';
import './listDialog.css';

// Длинные списки дашборда и «Динамики» (Ира, 11.11): на странице не больше 5 строк, под ними кнопка «Показать всех (N)».
// Окно поверх страницы: поиск по ФИО и группе, сортировка по нажатию на заголовок, «Скачать Excel» только этого списка.
// Закрывается крестиком, клавишей Esc и нажатием вне окна. Цвета ячеек: классы band()/mon-dash__mark--N, как на странице.

export const LIST_LIMIT = 5;

export type ListCol<R> = {
  key: string;
  label: string;
  left?: boolean;
  cell: (r: R) => ReactNode;
  cls?: (r: R) => string | undefined;
  // Значение для сортировки и Excel. Без sort столбец не сортируется.
  sort?: (r: R) => number | string | null;
  excel?: (r: R) => number | string | null;
  // Окрасить ячейку Excel по шкале процента.
  heat?: boolean;
};

type Props<R> = {
  rows: R[];
  cols: ListCol<R>[];
  rowKey: (r: R) => string | number;
  title: string;
  fileName: string;
  search: (r: R) => string;
  rowClass?: (r: R) => string | undefined;
  tableClass?: string;
  note?: string;
  // Столбцы на странице, если в узком месте их меньше, чем в окне и Excel.
  pageCols?: ListCol<R>[];
};

const LAT: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
export const latin = (text: string) => text.toLowerCase().split('').map(c => LAT[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

type Sort = { key: string; dir: 'asc' | 'desc' } | null;

// Порядок строк окна: пустые значения всегда внизу, текст по-русски с числами по значению.
export function sortRows<R>(rows: R[], cols: ListCol<R>[], sort: Sort): R[] {
  if (!sort) return rows;
  const col = cols.find(c => c.key === sort.key);
  if (!col || !col.sort) return rows;
  const get = col.sort;
  const k = sort.dir === 'asc' ? 1 : -1;
  return rows.map((r, i) => ({ r, i, v: get(r) })).sort((a, b) => {
    const ea = a.v === null || a.v === undefined || a.v === '';
    const eb = b.v === null || b.v === undefined || b.v === '';
    if (ea || eb) return ea === eb ? a.i - b.i : ea ? 1 : -1;
    const d = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'ru', { numeric: true });
    return d ? d * k : a.i - b.i;
  }).map(x => x.r);
}

// Поиск: все слова запроса есть в строке поиска (ФИО и группа), ё = е, регистр не важен.
export function filterRows<R>(rows: R[], search: (r: R) => string, query: string): R[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return rows;
  return rows.filter(r => { const s = norm(search(r)); return words.every(w => s.includes(w)); });
}

async function saveExcel<R>(title: string, note: string, fileName: string, cols: ListCol<R>[], rows: R[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Список');
  ws.addRow([title]).font = { bold: true, size: 12 };
  ws.addRow([note]).font = { italic: true, color: { argb: xlsxNote } };
  ws.addRow([]);
  ws.addRow(cols.map(c => c.label)).font = { bold: true };
  for (const r of rows) {
    const values = cols.map(c => (c.excel ? c.excel(r) : c.sort ? c.sort(r) : null));
    const row = ws.addRow(values.map(v => (v === null || v === undefined ? '' : v)));
    cols.forEach((c, j) => { if (c.heat) xlsxPercent(row.getCell(j + 1), values[j]); });
  }
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.left ? 30 : Math.max(10, Math.min(28, c.label.length + 2)); });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${latin(fileName) || 'spisok'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Table<R>({ rows, cols, rowKey, rowClass, tableClass, sort, onSort }: Pick<Props<R>, 'rows' | 'cols' | 'rowKey' | 'rowClass' | 'tableClass'> & { sort?: Sort; onSort?: (k: string) => void }) {
  return (
    <table className={`mon-dyn__table mon-list__table ${tableClass || ''}`}>
      <thead>
        <tr>
          {cols.map(c => {
            const active = sort?.key === c.key;
            if (!onSort || !c.sort) return <th key={c.key} className={c.left ? 'is-l' : undefined}>{c.label}</th>;
            return (
              <th key={c.key} className={c.left ? 'is-l' : undefined} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className={`mon-list__sort${active ? ' is-active' : ''}`} onClick={() => onSort(c.key)} title="Нажмите, чтобы отсортировать">
                  {c.label}<span aria-hidden="true">{active ? (sort!.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={rowKey(r)} className={rowClass?.(r)}>
            {cols.map(c => {
              const cls = [c.left ? 'is-l' : '', c.cls?.(r) || ''].filter(Boolean).join(' ');
              return <td key={c.key} className={cls || undefined}>{c.cell(r)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ListWindow<R>({ rows, cols, rowKey, title, fileName, search, rowClass, tableClass, note, onClose }: Props<R> & { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    input.current?.focus();
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, []);
  const shown = useMemo(() => sortRows(filterRows(rows, search, query), cols, sort), [rows, search, query, cols, sort]);
  const onSort = (k: string) => {
    const col = cols.find(c => c.key === k);
    const numeric = col?.sort && rows.some(r => typeof col.sort!(r) === 'number');
    if (sort?.key === k) setSort({ key: k, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    else setSort({ key: k, dir: numeric ? 'desc' : 'asc' });
  };
  async function excel() {
    setBusy(true); setErr('');
    const what = query.trim() ? `Поиск «${query.trim()}»: ${shown.length} из ${rows.length}.` : `Всего: ${rows.length}.`;
    try { await saveExcel(title, note ? `${note} ${what}` : what, fileName, cols, shown); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="mon-dialog mon-list" role="presentation">
      <button type="button" className="mon-dialog__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="mon-list__panel" role="dialog" aria-modal="true" aria-labelledby="mon-list-title">
        <div className="mon-list__head">
          <h3 id="mon-list-title" className="mon-list__title">{title} <span className="mon-list__count">{rows.length}</span></h3>
          <button type="button" className="mon-list__close" aria-label="Закрыть" title="Закрыть (Esc)" onClick={onClose}>×</button>
        </div>
        <div className="mon-list__bar">
          <input ref={input} type="search" className="mon-input mon-list__search" placeholder="Поиск по ФИО и группе" value={query} onChange={e => setQuery(e.target.value)} aria-label="Поиск по ФИО и группе" />
          {query.trim() ? <span className="mon-list__found">Найдено: {shown.length} из {rows.length}</span> : null}
          <button type="button" className="mon-btn mon-btn--primary mon-list__excel" disabled={busy || !shown.length} onClick={excel}>{busy ? 'Готовим файл…' : 'Скачать Excel'}</button>
        </div>
        {err ? <p className="mon-err" role="alert">{err}</p> : null}
        <div className="mon-list__body">
          {shown.length
            ? <Table rows={shown} cols={cols} rowKey={rowKey} rowClass={rowClass} tableClass={tableClass} sort={sort} onSort={onSort} />
            : <p className="mon-note">Никого не нашли</p>}
        </div>
      </div>
    </div>
  );
}

// Таблица на странице: первые 5 строк и кнопка «Показать всех (N)», если строк больше пяти.
export default function ShortList<R>(props: Props<R>) {
  const [open, setOpen] = useState(false);
  const { rows } = props;
  return (
    <>
      <div className="mon-dyn__scroll">
        <Table rows={rows.slice(0, LIST_LIMIT)} cols={props.pageCols || props.cols} rowKey={props.rowKey} rowClass={props.rowClass} tableClass={props.tableClass} />
      </div>
      {rows.length > LIST_LIMIT ? (
        <button type="button" className="mon-btn mon-list__more" onClick={() => setOpen(true)}>Показать всех ({rows.length})</button>
      ) : null}
      {open ? <ListWindow {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
