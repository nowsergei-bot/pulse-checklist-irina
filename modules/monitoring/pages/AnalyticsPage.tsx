import { useState } from 'react';
import { useApi } from './api';

// Обезличенная аналитика для data_admin: только коды групп и числа.
// Таблицы на экране и листы Excel строятся из одних и тех же описаний.

type Kind = 'group' | 'left' | 'parallel' | 'parallel_left' | 'total' | 'total_left';
type Row = {
  parallel: number | null; row: string; kind: Kind; gentle_on?: boolean;
  students: number; complete: number; absent: number; not_entered: number;
  avg_total: number | null; avg_percent: number | null; marks: Record<string, number>;
  sections: Record<string, number | null>;
  gentle: { students: number; complete: number; raised: number; moves: Record<string, number>; avg_percent: number | null };
};
type Data = {
  year: string | null; titles: string[]; title: string | null;
  module: { works: { id: number; parallel: number; status: string; max_points: number }[]; rows: Row[]; section_keys: { key: string; section: string; level: string; level_name: string }[] } | null;
  placement: { missing: string[]; rows: { parallel: number | string; spec_id: string | null; field_id: string; students: number; scores: number; avg: number | null; min: number | null; max: number | null }[]; parallels: { parallel: number | string; students: number }[] } | null;
  overlap: { parallel: number; placement: number; module_any: number; module_complete: number; both: number; both_complete: number }[];
  percent_difference: null;
};
type Cell = string | number | null;
type Table = { key: string; title: string; note: string; head: string[]; rows: Cell[][]; kinds: string[] };

const NO_PERCENT = 'нет: входное ещё не переведено в проценты';
const MOVES = ['2→3', '3→4', '4→5'];
const LEVEL = { basic: 'баз.', advanced: 'пов.' } as Record<string, string>;

function tables(d: Data): Table[] {
  const rows = d.module?.rows || [];
  const keys = d.module?.section_keys || [];
  const title = d.title || 'работа';
  const kinds = rows.map(r => r.kind);
  const bySection = rows.filter(r => r.kind !== 'total' && r.kind !== 'total_left');
  const gentle = rows.filter(r => r.gentle.students > 0);
  const out: Table[] = [
    {
      key: 'groups', title: `${title}: группы и параллели`,
      note: 'Учеников по текущему составу. Средний итог, средний % и отметки по полным работам; отметки фактически поставленные, в щадящем режиме по щадящим порогам. Отсутствовали: хотя бы на одной части. Не внесено: работа заполнена не полностью.',
      head: ['Параллель', 'Группа', 'Учеников', 'Полных работ', 'Отсутствовали', 'Не внесено', 'Средний итог', 'Средний %', '«5»', '«4»', '«3»', '«2»'],
      rows: rows.map(r => [r.parallel, r.row, r.students, r.complete, r.absent, r.not_entered, r.avg_total, r.avg_percent, r.marks[5], r.marks[4], r.marks[3], r.marks[2]]),
      kinds,
    },
    {
      key: 'sections', title: `${title}: разделы и уровни, средний %`,
      note: 'Баз.: базовый уровень, пов.: повышенный. Процент раздела: сумма баллов за задания раздела этого уровня, делённая на сумму максимумов, по полным работам. Для строки «Все параллели» не считается: у параллелей разные спецификации.',
      head: ['Параллель', 'Группа', ...keys.map(k => `${k.section} ${LEVEL[k.level] || k.level_name}`)],
      rows: bySection.map(r => [r.parallel, r.row, ...keys.map(k => r.sections[k.key] ?? null)]),
      kinds: bySection.map(r => r.kind),
    },
    {
      key: 'gentle', title: `${title}: щадящий режим`,
      note: 'Только полные работы учеников в щадящем режиме: режим берётся из группы, где внесены баллы ученика, поэтому ученик из двух групп виден и в строке второй группы. Процент один для обоих режимов. «Отметка выше»: по щадящим порогам отметка выше, чем по обычным. Группы без таких учеников не показаны.',
      head: ['Параллель', 'Группа', 'Учеников в режиме', 'Полных работ', 'Средний %', 'Отметка выше', ...MOVES.map(m => `Из «${m[0]}» в «${m[2]}»`)],
      rows: gentle.map(r => [r.parallel, r.row, r.gentle.students, r.gentle.complete, r.gentle.avg_percent, r.gentle.raised, ...MOVES.map(m => r.gentle.moves[m] || 0)]),
      kinds: gentle.map(r => r.kind),
    },
    {
      key: 'placement', title: 'Входное тестирование: по параллелям и полям',
      note: 'Текущий учебный год, только заполненные баллы. Параллель ученика по текущему составу; кого нет ни в одной текущей группе, в строке «выбыли».',
      head: ['Параллель', 'Спецификация', 'Поле (field_id)', 'Учеников', 'Баллов', 'Средний балл', 'Мин.', 'Макс.'],
      rows: (d.placement?.rows || []).map(r => [r.parallel, r.spec_id, r.field_id, r.students, r.scores, r.avg, r.min, r.max]),
      kinds: (d.placement?.rows || []).map(r => (r.parallel === 'выбыли' ? 'left' : 'group')),
    },
    {
      key: 'overlap', title: `Входное тестирование и ${title}`,
      note: 'Ученики текущего состава. «Есть в работе»: внесён хотя бы один балл или отметка «отсутствовал».',
      head: ['Параллель', 'Во входном', 'Есть в работе', 'Полная работа', 'И там, и там', 'И там, и там, полная работа', 'Разница в %'],
      rows: d.overlap.map(o => [o.parallel, o.placement, o.module_any, o.module_complete, o.both, o.both_complete, NO_PERCENT]),
      kinds: d.overlap.map(() => 'group'),
    },
  ];
  return out;
}

// Имя файла латиницей: некоторые браузеры отбрасывают имя с кириллицей.
const LAT: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
const latin = (text: string) => text.toLowerCase().split('').map(c => LAT[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const show = (v: Cell) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toLocaleString('ru-RU') : v);

async function download(d: Data, list: Table[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const sheetNames = { groups: 'Группы', sections: 'Разделы', gentle: 'Щадящий', placement: 'Входное', overlap: 'Входное и работа' } as Record<string, string>;
  for (const t of list) {
    const ws = wb.addWorksheet(sheetNames[t.key]);
    ws.addRow([t.title]).font = { bold: true, size: 12 };
    ws.addRow([t.note]).font = { italic: true, color: { argb: 'FF6B5D52' } };
    ws.addRow([]);
    const head = ws.addRow(t.head);
    head.font = { bold: true };
    t.rows.forEach((r, i) => {
      const row = ws.addRow(r.map(c => (c === null ? '' : c)));
      if (t.kinds[i] === 'parallel' || t.kinds[i] === 'total') row.font = { bold: true };
      if (t.kinds[i].includes('left')) row.font = { italic: true, color: { argb: 'FF8A8079' } };
    });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    t.head.forEach((h, i) => { ws.getColumn(i + 1).width = Math.max(10, Math.min(28, h.length + 2)); });
    ws.getColumn(2).width = 22;
  }
  const info = wb.addWorksheet('Пояснения');
  [
    ['Обезличенная выгрузка: только коды групп и числа, без ФИО учеников и учителей.'],
    [`Учебный год: ${d.year || ''}. Работа: ${d.title || ''}.`],
    ['Составы текущие: из Пульса или из загруженного файла, с поправками модуля.'],
    ['Строки «выбыли»: баллы внесены в группе, но ученика в текущем составе нет.'],
    ['Ученик в двух группах одной параллели в строке параллели считается один раз.'],
    [`Разница в процентах между входным и работой: ${NO_PERCENT}.`],
    [`Выгружено: ${new Date().toLocaleString('ru-RU')}.`],
  ].forEach(r => info.addRow(r));
  info.getColumn(1).width = 100;
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `analitika_${latin(d.title || '')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AnalyticsPage() {
  const [title, setTitle] = useState('');
  const { data, error } = useApi<Data>(`/analytics${title ? `?title=${encodeURIComponent(title)}` : ''}`);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const list = data ? tables(data) : [];
  const loading = !data || (title && data.title !== title);

  async function save() {
    if (!data) return;
    setBusy(true); setSaveError('');
    try { await download(data, list); } catch (e) { setSaveError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mon-an">
      <p className="mon-note mon-hint">Обезличенные данные для аналитики: только коды групп и числа. Составы текущие (Пульс или файл, с поправками модуля); баллы выбывших учеников отдельной строкой «выбыли». Видно только администраторам данных.</p>
      <div className="mon-toolbar">
        <label className="mon-field">
          <span className="mon-label">Работа</span>
          <select className="mon-input mon-select" value={data?.title || ''} onChange={e => setTitle(e.target.value)} disabled={!data}>
            {(data?.titles || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <button type="button" className="mon-btn mon-btn--primary" disabled={!data || busy || Boolean(loading)} onClick={save}>{busy ? 'Готовим файл…' : 'Скачать Excel'}</button>
        {data?.module ? <span className="mon-note mon-an__meta">{data.year} · параллелей: {data.module.works.length}</span> : null}
      </div>
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {saveError ? <p className="mon-err" role="alert">{saveError}</p> : null}
      {loading && !error ? <p className="mon-note">Считаем…</p> : null}
      {data && !loading ? list.map(t => (
        <section key={t.key} className="mon-an__block">
          <h3 className="mon-an__title">{t.title}</h3>
          <p className="mon-note">{t.note}</p>
          {t.key === 'placement' && data.placement?.missing.length ? <p className="mon-err">Не посчитано: {data.placement.missing.join('; ')}</p> : null}
          {t.rows.length ? (
            <div className="mon-an__scroll">
              <table className="mon-table mon-an__table">
                <thead><tr>{t.head.map((h, i) => <th key={h} className={i > 0 && t.rows.some(r => typeof r[i] === 'number') ? 'mon-num' : undefined}>{h}</th>)}</tr></thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={i} className={`is-${t.kinds[i]}`}>
                      {r.map((c, j) => <td key={j} className={typeof c === 'number' && j > 0 ? 'mon-num' : undefined}>{show(c)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="mon-note">Данных пока нет</p>}
          {t.key === 'placement' && data.placement?.parallels.length ? (
            <p className="mon-note">Учеников во входном: {data.placement.parallels.map(p => `${p.parallel === 'выбыли' ? 'выбыли' : `${p.parallel} параллель`} ${p.students}`).join(', ')}.</p>
          ) : null}
        </section>
      )) : null}
    </div>
  );
}
