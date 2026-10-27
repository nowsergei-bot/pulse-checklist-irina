import { useState } from 'react';
import { api, useApi } from './api';
import {
  Arrow, Card, LineChart, ProgressBars, ProgressLegend, diffClass, fmt, heat, seriesColor, shares100, signed,
  type Band, type DynRow, type Ege, type Point, type RiskStudent, type Student,
} from './Dynamics';

// Вкладка «Динамика»: от входного тестирования через модули к пробному ЕГЭ, только проценты выполнения.
// Линия по работам, прогресс к старту по порогу, стартовые группы, разделы по работам, ученики группы,
// пробный ЕГЭ, сравнение с входным по разделам. Заведующая кафедрой и data_admin видят все группы и зону риска,
// учитель свои группы; отбор групп делает сервер. manage (data_admin): ещё порог и сопоставление полей входного.

type Section = { code: string; name: string };
type Pair = { start: number; work: number; diff: number; n: number } | null;
type CompareRow = { kind: 'group' | 'parallel'; row: string; parallel: number | null; digital: boolean; students: number; compared: number; no_data: number; sections: Record<string, Pair> };
type Field = {
  field_id: string; source_section: string | null; section_name: string | null; excel_label: string | null; max: number | null; max_approved: boolean;
  suggested: string | null; saved: string | null; saved_by: string | null; section: string | null; usable: boolean; reason: string | null; not_in_spec: boolean;
};
type MapData = { year: string | null; sections: Section[]; notes: string[]; specs: { spec_id: string; found: boolean; parallels: number[]; fields: Field[] }[] };
type Data = {
  year: string | null; sections: Section[]; works: { key: string; title: string; held_on: string | null }[]; work: string | null;
  rows: CompareRow[]; caption: string;
};

const TOTAL: Section = { code: 'total', name: 'Итог' };
type Dyn = {
  year: string | null; sections: Section[]; threshold: number; drop_to_start: number; bands: { code: string; name: string }[];
  parallels: number[]; parallel: number | null; points: Point[]; work: string | null;
  rows: DynRow[]; groups: { id: number; title: string; digital: boolean }[]; group: number | null;
  students: Student[]; risk: RiskStudent[] | null; ege: Ege | null; caption: string;
};
type Cell = string | number | null;
type Table = { key: string; sheet: string; title: string; note: string; head: string[]; rows: Cell[][]; bold: boolean[] };

function CompareChart({ rows, section, work, caption }: { rows: CompareRow[]; section: Section; work: string; caption: string }) {
  return (
    <figure className="mon-viz__card">
      <figcaption>
        <h4 className="mon-viz__title">Входное и {work}: {section.name.toLowerCase()}</h4>
        <p className="mon-viz__note">Средний процент выполнения у учеников, у которых есть и входное, и полная работа.</p>
        <div className="mon-viz__legend">
          <span><i className="mon-viz__swatch mon-prog--start" />Входное</span>
          <span><i className="mon-viz__swatch mon-prog--work" />{work}</span>
        </div>
      </figcaption>
      <div className="mon-prog__chart">
        {rows.map(r => {
          const p = r.sections[section.code];
          return (
            <div key={r.row} className={`mon-prog__row is-${r.kind}`}>
              <span className="mon-viz__bar-label">{r.row}</span>
              {p ? (
                <span className="mon-prog__pair">
                  <span className="mon-prog__bar mon-prog--start" style={{ width: `${p.start}%` }} title={`Входное: ${fmt(p.start)} %`}><b>{fmt(p.start)}</b></span>
                  <span className="mon-prog__bar mon-prog--work" style={{ width: `${p.work}%` }} title={`${work}: ${fmt(p.work)} %`}><b>{fmt(p.work)}</b></span>
                </span>
              ) : <span className="mon-viz__track is-empty">нет данных для сравнения</span>}
              <span className="mon-viz__bar-n">
                {p ? <><span className={`mon-prog__diff ${diffClass(p.diff)}`}>{signed(p.diff)}</span> · {p.n} уч.</> : null}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mon-prog__caption">{caption}</p>
    </figure>
  );
}

function MapEditor({ onSaved }: { onSaved: () => void }) {
  const { data, error, reload } = useApi<MapData>('/progress/placement-map');
  const [busy, setBusy] = useState('');
  const [saveError, setSaveError] = useState('');
  async function choose(specId: string, field: Field, value: string) {
    setBusy(`${specId}/${field.field_id}`); setSaveError('');
    try {
      await api('/progress/placement-map', { method: 'POST', body: { spec_id: specId, field_id: field.field_id, section: value === '' ? null : value } });
      reload();
      onSaved();
    } catch (e) { setSaveError((e as Error).message); } finally { setBusy(''); }
  }
  const name = (code: string | null) => (code ? data?.sections.find(s => s.code === code)?.name || code : null);
  return (
    <details className="mon-an__block mon-prog__map">
      <summary className="mon-an__title">Поля входного: с каким разделом сравнивать</summary>
      <p className="mon-note">
        Пока значение не выбрано, действует предложение по названию раздела поля. «Не сравнивать»: поле показывается здесь и в итог сравнения не входит.
        Поле без утверждённого максимума тоже не входит. Изменение сразу меняет таблицы на этой вкладке.
      </p>
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {saveError ? <p className="mon-err" role="alert">{saveError}</p> : null}
      {data?.notes.length ? <p className="mon-err">Не прочитано: {data.notes.join('; ')}</p> : null}
      {data && !data.specs.length ? <p className="mon-note">Во входном текущего года баллов пока нет</p> : null}
      {data?.specs.map(s => (
        <div key={s.spec_id} className="mon-an__scroll">
          <h4 className="mon-prog__spec">{s.parallels.length ? s.parallels.map(p => `${p} параллель`).join(', ') : 'Параллель не определена'} · спецификация {s.spec_id}{s.found ? '' : ' (не найдена)'}</h4>
          <table className="mon-table mon-an__table">
            <thead><tr><th>Поле</th><th>Раздел во входном</th><th>Подпись столбца</th><th className="mon-num">Макс.</th><th>Сравнивать как</th><th>В сравнении</th></tr></thead>
            <tbody>
              {s.fields.map(f => (
                <tr key={f.field_id}>
                  <td>{f.field_id}</td>
                  <td>{f.not_in_spec ? 'нет в спецификации' : f.source_section || f.section_name || ''}</td>
                  <td>{f.excel_label || ''}</td>
                  <td className="mon-num">{f.max === null ? '' : `${fmt(f.max)}${f.max_approved ? '' : ' (предложен)'}`}</td>
                  <td>
                    <select className="mon-input mon-select" value={f.saved ?? ''} disabled={busy === `${s.spec_id}/${f.field_id}`} onChange={e => choose(s.spec_id, f, e.target.value)} aria-label={`Раздел для поля ${f.field_id}`}>
                      <option value="">{f.suggested ? `Предложение: ${name(f.suggested)}` : 'Предложения нет'}</option>
                      {data.sections.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}
                      <option value="none">Не сравнивать</option>
                    </select>
                  </td>
                  <td className={f.usable ? 'mon-prog__ok' : 'mon-prog__off'}>{f.usable ? name(f.section) : f.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </details>
  );
}

function Settings({ threshold, onSaved }: { threshold: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(threshold));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function save() {
    setBusy(true); setMsg('');
    try {
      await api('/progress/settings', { method: 'POST', body: { threshold: Number(value) } });
      setMsg('Сохранено');
      onSaved();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <section className="mon-an__block">
      <h3 className="mon-an__title">Порог роста и снижения</h3>
      <p className="mon-note">Рост: разница с входным не меньше порога, снижение: не больше минус порога, остальное без изменений. Те же стрелки в таблице разделов. Сейчас {threshold} пунктов.</p>
      <div className="mon-toolbar">
        <label className="mon-field">
          <span className="mon-label">Порог, пунктов</span>
          <input className="mon-input mon-prog__num" type="number" min={1} max={30} value={value} onChange={e => setValue(e.target.value)} />
        </label>
        <button type="button" className="mon-btn mon-btn--primary" disabled={busy || Number(value) === threshold} onClick={save}>Сохранить</button>
        {msg ? <span className="mon-note">{msg}</span> : null}
      </div>
    </section>
  );
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : v);
const bandShares = (b: Band) => (b.n ? shares100([b.up, b.same, b.down]).join(' / ') : '');

// Таблицы вкладки: одни и те же описания для экрана и для Excel.
function tables(d: Dyn, cmp: Data | undefined, section: Section, sections: Section[]): Table[] {
  const work = d.points.find(p => p.key === d.work);
  const workTitle = work ? work.title : 'работа';
  const group = d.groups.find(g => g.id === d.group);
  const groupRow = d.rows.find(r => r.group_id === d.group);
  const out: Table[] = [
    {
      key: 'lines', sheet: 'Динамика', title: `Динамика по работам: ${d.parallel} параллель`,
      note: 'Средний процент выполнения у учеников группы с результатом (полная работа, во входном все поля раздела). В скобках сколько учеников.',
      head: ['Группа', 'Раздел', ...d.points.map(p => p.title)],
      rows: d.rows.flatMap(r => sections.map(s => [r.row, s.name, ...d.points.map(p => { const a = r.lines[p.key][s.code]; return a ? `${fmt(a.avg)} (${a.n})` : null; })])),
      bold: d.rows.flatMap(r => sections.map(() => r.kind === 'parallel')),
    },
    {
      key: 'progress', sheet: 'Прогресс', title: `Прогресс от входного до работы «${workTitle}»`,
      note: `Рост: +${d.threshold} пунктов и больше, снижение: −${d.threshold} и больше, иначе без изменений. Доли считаются среди учеников с входным и полной работой; остальные в столбце «Нет данных».`,
      head: ['Группа', 'Раздел', 'Учеников', 'Рост', 'Без изменений', 'Снижение', 'Рост, %', 'Без изменений, %', 'Снижение, %', 'Нет данных'],
      rows: d.rows.flatMap(r => sections.map(s => {
        const p = r.progress[s.code];
        const n = p.up + p.same + p.down;
        const pc = n ? shares100([p.up, p.same, p.down]) : [null, null, null];
        return [r.row, s.name, p.students, p.up, p.same, p.down, ...pc, p.no_data];
      })),
      bold: d.rows.flatMap(r => sections.map(() => r.kind === 'parallel')),
    },
    {
      key: 'bands', sheet: 'Стартовые группы', title: `Стартовые группы: ${section.name.toLowerCase()}, входное и «${workTitle}»`,
      note: 'Ученики по проценту входного. Средний прирост в процентных пунктах; доли: рост / без изменений / снижение, %.',
      head: ['Группа', ...d.bands.flatMap(b => [`${b.name}: учеников`, `${b.name}: прирост`, `${b.name}: доли, %`])],
      rows: d.rows.map(r => [r.row, ...r.bands[section.code].flatMap(b => [b.n, b.avg_gain, bandShares(b)])]),
      bold: d.rows.map(r => r.kind === 'parallel'),
    },
  ];
  if (groupRow && group) {
    out.push({
      key: 'heat', sheet: 'Разделы и работы', title: `Разделы и работы: ${group.title}`,
      note: `Средний процент выполнения. Стрелка к предыдущей работе с результатом: ▲ рост на ${d.threshold} пунктов и больше, ▼ снижение, ● без изменений.`,
      head: ['Раздел', ...d.points.map(p => p.title)],
      rows: sections.map(s => [s.name, ...d.points.map(p => pct(groupRow.lines[p.key][s.code]?.avg))]),
      bold: sections.map(s => s.code === 'total'),
    });
    out.push({
      key: 'students', sheet: 'Ученики', title: `Ученики: ${group.title}, ${section.name.toLowerCase()}`,
      note: 'Процент выполнения по каждой работе (полные работы). «К старту»: итог последней работы с результатом минус итог входного.',
      head: ['Ученик', ...d.points.map(p => p.title), 'К старту, пунктов'],
      rows: d.students.map(s => [s.full_name, ...d.points.map(p => s.values[p.key][section.code]), s.to_start]),
      bold: d.students.map(() => false),
    });
  }
  if (d.risk) {
    out.push({
      key: 'risk', sheet: 'Зона риска', title: `Зона риска по динамике: ${d.parallel} параллель`,
      note: `Итог: ниже входного на ${d.drop_to_start} пунктов и больше; два снижения подряд (каждое на ${d.threshold} пунктов и больше) между соседними работами.`,
      head: ['Группа', 'Ученик', ...d.points.map(p => p.title), 'Причина'],
      rows: d.risk.map(r => [r.group, r.full_name, ...r.values, r.reasons.map(x => x.text).join('; ')]),
      bold: d.risk.map(() => false),
    });
  }
  if (d.ege) {
    out.push({
      key: 'ege', sheet: 'Пробный ЕГЭ', title: `${workTitle}: первичный балл и блоки`,
      note: `Только полные работы. Средний первичный балл из ${d.ege.max_points} и процент; процент выполнения каждого блока, базового и высокого уровня. Отметок нет.`,
      head: ['Группа', 'Полных работ', `Средний балл из ${d.ege.max_points}`, 'Средний %', 'Базовый, %', 'Высокий, %', ...d.ege.blocks.map(b => `${b.title} (${b.max})`)],
      rows: d.ege.rows.map(r => [r.row, r.complete, r.avg_total, r.avg_percent, r.basic, r.high, ...r.blocks]),
      bold: d.ege.rows.map(r => r.kind === 'parallel'),
    });
  }
  if (cmp && cmp.work) {
    const cs = [TOTAL, ...cmp.sections];
    out.push({
      key: 'compare', sheet: 'Сравнение с входным', title: `Входное и «${cmp.works.find(w => w.key === cmp.work)?.title || ''}»: по разделам`,
      note: `${cmp.caption}. Средний процент входного, работы и разница у учеников, у которых есть оба результата.`,
      head: ['Группа', 'Учеников', 'Сравнено', 'Нет данных', ...cs.flatMap(s => [`${s.name}: входное`, `${s.name}: работа`, `${s.name}: разница`])],
      rows: cmp.rows.filter(r => r.parallel === d.parallel).map(r => [r.row, r.students, r.compared, r.no_data, ...cs.flatMap(s => { const p = r.sections[s.code]; return p ? [p.start, p.work, p.diff] : [null, null, null]; })]),
      bold: cmp.rows.filter(r => r.parallel === d.parallel).map(r => r.kind === 'parallel'),
    });
  }
  return out;
}

const LAT: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
const latin = (text: string) => text.toLowerCase().split('').map(c => LAT[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function download(d: Dyn, list: Table[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  for (const t of list) {
    const ws = wb.addWorksheet(t.sheet);
    ws.addRow([t.title]).font = { bold: true, size: 12 };
    ws.addRow([t.note]).font = { italic: true, color: { argb: 'FF6B5D52' } };
    ws.addRow([]);
    ws.addRow(t.head).font = { bold: true };
    t.rows.forEach((r, i) => { const row = ws.addRow(r.map(c => (c === null ? '' : c))); if (t.bold[i]) row.font = { bold: true }; });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    t.head.forEach((h, i) => { ws.getColumn(i + 1).width = Math.max(10, Math.min(26, h.length + 2)); });
    ws.getColumn(1).width = t.key === 'students' || t.key === 'risk' ? 30 : 18;
  }
  const info = wb.addWorksheet('Пояснения');
  [
    ['Работы разные, сравниваются проценты выполнения. Разница в процентных пунктах.'],
    ['Ученики в нынешних группах: текущий состав (Пульс или файл, с поправками модуля). Ученик сравнивается сам с собой по всем работам.'],
    ['ФИО только на листах «Ученики» и «Зона риска».'],
    [`Учебный год: ${d.year || ''}. Параллель: ${d.parallel ?? ''}. Порог: ${d.threshold} пунктов.`],
    [`Выгружено: ${new Date().toLocaleString('ru-RU')}.`],
  ].forEach(r => info.addRow(r));
  info.getColumn(1).width = 100;
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `dinamika_${d.parallel ?? ''}_${latin(d.points.find(p => p.key === d.work)?.title || '')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Значение с предыдущим непустым в ряду: для стрелки.
function withPrev(values: (number | null)[]) {
  let prev: number | null = null;
  return values.map(v => { const out = { v, diff: v !== null && prev !== null ? Math.round((v - prev) * 10) / 10 : null }; if (v !== null) prev = v; return out; });
}

function CompareBlock({ data }: { data: Data }) {
  const [code, setCode] = useState('total');
  const sections = [TOTAL, ...data.sections];
  const section = sections.find(s => s.code === code) || TOTAL;
  const title = data.works.find(w => w.key === data.work)?.title || '';
  return (
    <>
      <div className="mon-viz__head">
        <h3 className="mon-viz__section">Сравнение с входным по разделам: {title}</h3>
        <div className="mon-segmented" role="group" aria-label="Раздел сравнения">
          {sections.map(s => <button key={s.code} type="button" className={s.code === section.code ? 'is-current' : undefined} onClick={() => setCode(s.code)}>{s.name}</button>)}
        </div>
      </div>
      <div className="mon-viz__grid mon-viz__grid--one">
        <CompareChart rows={data.rows} section={section} work={title} caption={data.caption} />
      </div>
      <section className="mon-an__block">
        <p className="mon-note">
          В клетке средний процент входного, затем работы и разница в процентных пунктах. Сравнено: есть итог входного и полная работа.
          Раздел считается, если во входном внесены все поля этого раздела. Нет данных: нет входного, нет полной работы или не хватает полей.
        </p>
        <div className="mon-an__scroll">
          <table className="mon-table mon-an__table mon-prog__table">
            <thead><tr><th>Группа</th><th className="mon-num">Учеников</th><th className="mon-num">Сравнено</th><th className="mon-num">Нет данных</th>{sections.map(s => <th key={s.code} className="mon-num">{s.name}</th>)}</tr></thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.row} className={`is-${r.kind}`}>
                  <td>{r.row}</td>
                  <td className="mon-num">{r.students}</td>
                  <td className="mon-num">{r.compared}</td>
                  <td className="mon-num">{r.no_data}</td>
                  {sections.map(s => {
                    const p = r.sections[s.code];
                    return <td key={s.code} className="mon-num">{p ? <>{fmt(p.start)} → {fmt(p.work)} <span className={`mon-prog__diff ${diffClass(p.diff)}`}>{signed(p.diff)}</span></> : ''}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mon-prog__caption">{data.caption}</p>
      </section>
    </>
  );
}

export default function ProgressPage({ manage }: { manage: boolean }) {
  const [parallel, setParallel] = useState('');
  const [work, setWork] = useState('');
  const [group, setGroup] = useState('');
  const [code, setCode] = useState('total');
  const [student, setStudent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const params = new URLSearchParams();
  if (parallel) params.set('parallel', parallel);
  if (work) params.set('work', work);
  if (group) params.set('group', group);
  const qs = params.toString();
  const { data, error, reload } = useApi<Dyn>(`/progress/dynamics${qs ? `?${qs}` : ''}`);
  const cmpWork = data?.work || '';
  const { data: cmp, reload: reloadCmp } = useApi<Data>(data ? `/progress/compare${cmpWork ? `?work=${encodeURIComponent(cmpWork)}` : ''}` : null);
  const loading = !data || (parallel && String(data.parallel) !== parallel) || (work && data.work !== work) || (group && String(data.group) !== group);
  const sections = data ? data.sections : [TOTAL];
  const section = sections.find(s => s.code === code) || sections[0];
  const works = data ? data.points.filter(p => p.key !== 'placement') : [];
  const workTitle = works.find(p => p.key === data?.work)?.title || '';
  const lineSeries = data ? data.rows.map((r, i) => ({
    label: r.kind === 'parallel' ? 'параллель' : r.row, dashed: r.kind === 'parallel', color: r.kind === 'parallel' ? '#1a1512' : seriesColor(i),
    values: data.points.map(p => r.lines[p.key][section.code]?.avg ?? null),
  })) : [];
  const egePoints = data ? data.points.filter(p => p.type_code === 'ege_mock') : [];
  const groupRow = data?.rows.find(r => r.group_id === data.group);
  const picked = data?.students.find(s => s.id === student) || null;
  const list = data && !loading ? tables(data, cmp, section, sections) : [];

  async function save() {
    if (!data) return;
    setBusy(true); setSaveError('');
    try { await download(data, list); } catch (e) { setSaveError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mon-an mon-viz">
      <p className="mon-note mon-hint">
        От входного тестирования через модули к пробному ЕГЭ: каждый ученик сравнивается сам с собой. Ученики в нынешних группах (текущий состав с поправками модуля).
        {data && !data.risk ? ' Видны только твои группы и средние по их параллели.' : ''}
      </p>
      <div className="mon-toolbar">
        <label className="mon-field">
          <span className="mon-label">Параллель</span>
          <select className="mon-input mon-select" value={data?.parallel ?? ''} disabled={!data} onChange={e => { setParallel(e.target.value); setWork(''); setGroup(''); setStudent(null); }}>
            {(data?.parallels || []).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="mon-field">
          <span className="mon-label">Работа для прогресса</span>
          <select className="mon-input mon-select" value={data?.work || ''} disabled={!data || !works.length} onChange={e => setWork(e.target.value)}>
            {works.map(w => <option key={w.key} value={w.key}>{w.title}</option>)}
          </select>
        </label>
        <div className="mon-segmented" role="group" aria-label="Раздел">
          {sections.map(s => <button key={s.code} type="button" className={s.code === section.code ? 'is-current' : undefined} onClick={() => setCode(s.code)}>{s.name}</button>)}
        </div>
        <button type="button" className="mon-btn mon-btn--primary" disabled={!data || Boolean(loading) || busy} onClick={save}>{busy ? 'Готовим файл…' : 'Скачать Excel'}</button>
      </div>
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {saveError ? <p className="mon-err" role="alert">{saveError}</p> : null}
      {loading && !error ? <p className="mon-note">Считаем…</p> : null}
      {data && !loading && !data.parallel ? <p className="mon-note">Групп пока нет</p> : null}
      {data && !loading && data.parallel ? (
        <>
          <div className="mon-viz__grid mon-viz__grid--one">
            <Card title={`Динамика: ${section.name.toLowerCase()}, ${data.parallel} параллель`} note="Средний процент выполнения по работам у учеников группы с результатом. Пунктир: вся параллель. Наведи на точку, чтобы увидеть число." caption={data.caption}>
              {works.length ? <LineChart points={data.points} series={lineSeries} /> : <p className="mon-note">Работ этой параллели пока нет</p>}
            </Card>
            {data.work ? (
              <Card title={`Прогресс от входного: ${section.name.toLowerCase()}, «${workTitle}»`} note="Разница каждого ученика с его входным. Доли среди учеников, у которых есть и входное, и полная работа." legend={<ProgressLegend threshold={data.threshold} />} caption={data.caption}>
                <ProgressBars rows={data.rows} section={section.code} threshold={data.threshold} />
              </Card>
            ) : null}
          </div>

          {data.work ? (
            <section className="mon-an__block">
              <h3 className="mon-an__title">Стартовые группы: {section.name.toLowerCase()}, «{workTitle}»</h3>
              <p className="mon-note">Ученики по проценту входного. В клетке: учеников, средний прирост в пунктах и доли рост / без изменений / снижение, %.</p>
              <div className="mon-an__scroll">
                <table className="mon-table mon-an__table mon-prog__table">
                  <thead><tr><th>Группа</th>{data.bands.map(b => <th key={b.code} className="mon-num">Входное {b.name}</th>)}</tr></thead>
                  <tbody>
                    {data.rows.map(r => (
                      <tr key={r.row} className={`is-${r.kind}`}>
                        <td>{r.row}</td>
                        {r.bands[section.code].map(b => (
                          <td key={b.code} className="mon-num">
                            {b.n ? <>{b.n} уч. · <span className={`mon-prog__diff ${diffClass(b.avg_gain ?? 0)}`}>{signed(b.avg_gain ?? 0)}</span> · {bandShares(b)}</> : <span className="mon-note">нет</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {data.ege ? (
            <>
              <h3 className="mon-viz__section">{workTitle}: первичный балл и блоки</h3>
              {egePoints.length > 1 ? (
                <div className="mon-viz__grid mon-viz__grid--one">
                  <Card title="Пробники: средний процент" note="Только пробные ЕГЭ этой параллели. Пунктир: вся параллель.">
                    <LineChart points={egePoints} series={data.rows.map((r, i) => ({ label: r.kind === 'parallel' ? 'параллель' : r.row, dashed: r.kind === 'parallel', color: r.kind === 'parallel' ? '#1a1512' : seriesColor(i), values: egePoints.map(p => r.lines[p.key].total?.avg ?? null) }))} height={240} />
                  </Card>
                </div>
              ) : null}
              <section className="mon-an__block">
                <p className="mon-note">Только полные работы. Отметок нет. Уровни по ФИПИ: базовый и высокий.</p>
                <div className="mon-an__scroll">
                  <table className="mon-table mon-an__table mon-prog__table">
                    <thead>
                      <tr>
                        <th>Группа</th><th className="mon-num">Полных</th><th className="mon-num">Балл из {data.ege.max_points}</th><th className="mon-num">%</th><th className="mon-num">Базовый</th><th className="mon-num">Высокий</th>
                        {data.ege.blocks.map(b => <th key={b.title} className="mon-num" title={`${b.section}, ${b.level_name.toLowerCase()}, максимум ${b.max}`}>{b.title.replace('Задания ', '').replace('Задание ', '')}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {data.ege.rows.map(r => (
                        <tr key={r.row} className={`is-${r.kind}`}>
                          <td>{r.row}</td><td className="mon-num">{r.complete}</td>
                          <td className="mon-num">{r.avg_total === null ? '' : fmt(r.avg_total)}</td>
                          <td className="mon-num">{r.avg_percent === null ? '' : fmt(r.avg_percent)}</td>
                          <td className="mon-num">{r.basic === null ? '' : fmt(r.basic)}</td>
                          <td className="mon-num">{r.high === null ? '' : fmt(r.high)}</td>
                          {r.blocks.map((v, i) => <td key={i} className={`mon-num ${heat(v) || ''}`}>{v === null ? '' : fmt(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mon-note">Столбцы блоков: номера заданий, процент выполнения блока. Наведи на заголовок, чтобы увидеть раздел, уровень и максимум.</p>
              </section>
            </>
          ) : null}

          <div className="mon-viz__head">
            <h3 className="mon-viz__section">Группа</h3>
            <div className="mon-segmented" role="group" aria-label="Группа">
              {data.groups.map(g => <button key={g.id} type="button" className={g.id === data.group ? 'is-current' : undefined} onClick={() => { setGroup(String(g.id)); setStudent(null); }}>{g.title}</button>)}
            </div>
          </div>
          {groupRow ? (
            <section className="mon-an__block">
              <h3 className="mon-an__title">Разделы и работы: {groupRow.row}</h3>
              <p className="mon-note">Средний процент выполнения. Стрелка к предыдущей работе с результатом: ▲ рост на {data.threshold} пунктов и больше, ▼ снижение, ● без изменений.</p>
              <div className="mon-an__scroll">
                <table className="mon-table mon-an__table mon-prog__table">
                  <thead><tr><th>Раздел</th>{data.points.map(p => <th key={p.key} className="mon-num">{p.title}</th>)}</tr></thead>
                  <tbody>
                    {sections.map(s => (
                      <tr key={s.code} className={s.code === 'total' ? 'is-parallel' : 'is-group'}>
                        <td>{s.name}</td>
                        {withPrev(data.points.map(p => groupRow.lines[p.key][s.code]?.avg ?? null)).map((c, i) => (
                          <td key={i} className={`mon-num ${heat(c.v) || ''}`}>{c.v === null ? '' : <>{fmt(c.v)} <Arrow diff={c.diff} threshold={data.threshold} /></>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="mon-an__block">
            <h3 className="mon-an__title">Ученики: {groupRow?.row}, {section.name.toLowerCase()}</h3>
            <p className="mon-note">Нажми на ученика, чтобы открыть карточку. «К старту»: итог последней работы с результатом минус итог входного.</p>
            <div className="mon-prog__students">
              <div className="mon-an__scroll">
                <table className="mon-table mon-an__table mon-prog__table">
                  <thead><tr><th>Ученик</th>{data.points.map(p => <th key={p.key} className="mon-num">{p.title}</th>)}<th className="mon-num">К старту</th></tr></thead>
                  <tbody>
                    {data.students.map(s => (
                      <tr key={s.id} className={`is-group mon-prog__pick${s.id === student ? ' is-picked' : ''}`} onClick={() => setStudent(s.id)}>
                        <td>{s.full_name}</td>
                        {data.points.map(p => { const v = s.values[p.key][section.code]; return <td key={p.key} className={`mon-num ${heat(v) || ''}`}>{v === null ? '' : fmt(v)}</td>; })}
                        <td className="mon-num">{s.to_start === null ? '' : <span className={`mon-prog__diff ${diffClass(s.to_start)}`}>{signed(s.to_start)}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {picked ? (
                <Card title={picked.full_name} note={picked.to_start === null ? 'К старту: нет входного или работы с результатом' : `К старту: ${signed(picked.to_start)} пунктов`}>
                  <LineChart points={data.points} height={300} width={560} series={[
                    { label: section.name, color: '#50708f', values: data.points.map(p => picked.values[p.key][section.code]) },
                    ...(section.code === 'total' ? [] : [{ label: 'итог', color: '#1a1512', dashed: true, values: data.points.map(p => picked.values[p.key].total) }]),
                  ]} />
                </Card>
              ) : null}
            </div>
          </section>

          {data.risk ? (
            <section className="mon-an__block">
              <h3 className="mon-an__title">Зона риска по динамике: {data.parallel} параллель</h3>
              <p className="mon-note">Итог ниже входного на {data.drop_to_start} пунктов и больше или два снижения подряд (каждое на {data.threshold} пунктов и больше). Видят заведующие кафедрой и администраторы данных.</p>
              {data.risk.length ? (
                <div className="mon-an__scroll">
                  <table className="mon-table mon-an__table mon-prog__table">
                    <thead><tr><th>Группа</th><th>Ученик</th>{data.points.map(p => <th key={p.key} className="mon-num">{p.title}</th>)}<th>Причина</th></tr></thead>
                    <tbody>
                      {data.risk.map(r => (
                        <tr key={`${r.group}/${r.full_name}`} className="is-group">
                          <td>{r.group}</td><td>{r.full_name}</td>
                          {r.values.map((v, i) => <td key={i} className="mon-num">{v === null ? '' : fmt(v)}</td>)}
                          <td>{r.reasons.map(x => x.text).join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="mon-note">Таких учеников нет</p>}
            </section>
          ) : null}

          {cmp && cmp.work ? <CompareBlock key={cmp.work} data={{ ...cmp, rows: cmp.rows.filter(r => r.parallel === data.parallel) }} /> : null}
        </>
      ) : null}
      {manage && data ? <Settings key={data.threshold} threshold={data.threshold} onSaved={reload} /> : null}
      {manage ? <MapEditor onSaved={() => { reload(); reloadCmp(); }} /> : null}
    </div>
  );
}
