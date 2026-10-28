import { useState } from 'react';
import { api, useApi } from './api';
import { fmt, shares100, type Band, type DynRow, type Ege, type Point, type RiskStudent, type Student } from './Dynamics';
import DynamicsScreen, { type Screen } from './DynamicsScreen';
import WorkTable, { type WorkTableData } from './WorkTable';

// Вкладка «Динамика» по макету 28.10: параллель, вкладки работ (входное первым), экран выбранной работы.
// Заведующая кафедрой, заместитель директора и data_admin видят все группы, учитель свои группы; отбор групп делает сервер.
// Excel: листы экрана и прежние таблицы динамики. manage (data_admin): ещё порог и сопоставление полей входного.

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
  tab?: string; screen?: Screen; table?: WorkTableData;
};
type Cell = string | number | null;
type Table = { key: string; sheet: string; title: string; note: string; head: string[]; rows: Cell[][]; bold: boolean[] };

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
function screenTables(d: Dyn, s: Screen): Table[] {
  const out: Table[] = [];
  const cov = s.coverage;
  out.push({
    key: 'groups', sheet: 'Группы', title: `${s.title}: группы, ${d.parallel} параллель`,
    note: `Средний процент выполнения у учеников с полной работой. Результаты внесены в ${cov.groups_with} из ${cov.groups_total} групп.${cov.without.length ? ` Нет результатов: ${cov.without.join(', ')}.` : ''}`,
    head: ['Группа', 'Учеников', ...(s.max_points ? [`Средний балл из ${s.max_points}`] : []), 'Средний %'],
    rows: [...s.groups.map(g => [g.title, g.n, ...(s.max_points ? [g.avg_total] : []), g.percent]),
      ['Параллель', s.parallel_row.n, ...(s.max_points ? [s.cards.avg_total] : []), s.parallel_row.percent]],
    bold: [...s.groups.map(() => false), true],
  });
  out.push({
    key: 'sections', sheet: 'Разделы', title: `${s.title}: разделы по группам`,
    note: 'Процент выполнения каждого раздела. Пусто: нет данных.',
    head: ['Группа', ...s.sections.map(x => x.name), 'Итого'],
    rows: [...s.groups.map(g => [g.title, ...s.sections.map(x => g.sections[x.code] ?? null), g.percent_int]),
      ['Параллель', ...s.sections.map(x => s.parallel_row.sections[x.code] ?? null), s.parallel_row.percent_int]],
    bold: [...s.groups.map(() => false), true],
  });
  if (s.blocks.length) {
    out.push({
      key: 'blocks', sheet: 'Задания', title: `${s.title}: выполнение по заданиям`,
      note: 'Средний процент выполнения блока заданий. «Слабое»: три самых низких блока ниже 85 % по параллели.',
      head: ['Задания', 'Раздел', 'Макс.', 'Параллель, %', ...s.groups.map(g => `${g.title}, %`), 'Слабое'],
      rows: s.blocks.map((b, i) => [b.label, b.section, b.max, s.blocks_parallel[i], ...s.groups.map(g => s.blocks_by_group[String(g.group_id)]?.[i] ?? null), s.weak.includes(i) ? 'да' : '']),
      bold: s.blocks.map(() => false),
    });
  }
  if (s.position) {
    out.push({
      key: 'position', sheet: 'Положение', title: `Положение группы относительно параллели: входное и «${s.title}»`,
      note: 'Среднее группы минус среднее параллели, процентные пункты. Только ученики, у которых есть обе работы.',
      head: ['Группа', 'Учеников с обеими работами', 'Входное', s.title],
      rows: s.position.rows.map(r => [r.title, r.n, r.before, r.after]),
      bold: s.position.rows.map(() => false),
    });
  }
  const placement = s.key === 'placement';
  const posText = (x: Screen['students'][number]) => (!x.position ? null : x.position.kind === 'same' ? 'как было' : x.position.kind === 'up' ? `выше на ${x.position.diff}` : `ниже на ${-x.position.diff}`);
  out.push({
    key: 'students', sheet: 'Ученики', title: `Ученики: ${d.groups.find(g => g.id === s.group)?.title || ''}, «${s.title}»`,
    note: 'Место в параллели по этой работе. Положение: как изменилось отклонение от среднего по параллели по сравнению с входным. Риск: ниже 50 % или нижняя четверть параллели.',
    head: placement ? ['Ученик', 'Входное, %', 'Место в параллели', 'Риск']
      : ['Ученик', 'Входное, %', `${s.title}, балл из ${s.max_points ?? ''}`, '%', 'Место в параллели', 'Положение к параллели', 'Риск'],
    rows: s.students.map(x => (placement
      ? [x.full_name, x.wrote ? x.percent : 'не писал(а)', x.place, x.risk ? 'да' : '']
      : [x.full_name, x.start, x.wrote ? x.total : 'не писал(а)', x.wrote ? x.percent : null, x.place, posText(x), x.risk ? 'да' : ''])),
    bold: s.students.map(() => false),
  });
  return out;
}

function tables(d: Dyn, cmp: Data | undefined, section: Section, sections: Section[]): Table[] {
  const work = d.points.find(p => p.key === d.work);
  const workTitle = work ? work.title : 'работа';
  const group = d.groups.find(g => g.id === d.group);
  const groupRow = d.rows.find(r => r.group_id === d.group);
  const out: Table[] = d.screen ? screenTables(d, d.screen) : [];
  out.push(
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
  );
  if (groupRow && group) {
    out.push({
      key: 'heat', sheet: 'Разделы и работы', title: `Разделы и работы: ${group.title}`,
      note: `Средний процент выполнения. Стрелка к предыдущей работе с результатом: ▲ рост на ${d.threshold} пунктов и больше, ▼ снижение, ● без изменений.`,
      head: ['Раздел', ...d.points.map(p => p.title)],
      rows: sections.map(s => [s.name, ...d.points.map(p => pct(groupRow.lines[p.key][s.code]?.avg))]),
      bold: sections.map(s => s.code === 'total'),
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
    ws.getColumn(1).width = t.key === 'students' ? 30 : 18;
    if (t.key === 'risk') ws.getColumn(2).width = 30;
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
  a.download = `dinamika_${d.parallel ?? ''}_${latin(d.screen?.title || d.points.find(p => p.key === d.work)?.title || '')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ProgressPage({ manage }: { manage: boolean }) {
  const [parallel, setParallel] = useState('');
  const [work, setWork] = useState('');
  const [group, setGroup] = useState('');
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
  const loading = !data || (parallel && String(data.parallel) !== parallel) || (work && data.tab !== work) || (group && String(data.screen?.group) !== group);
  const sections = data ? data.sections : [TOTAL];

  async function save() {
    if (!data) return;
    setBusy(true); setSaveError('');
    try { await download(data, tables(data, cmp, TOTAL, sections)); } catch (e) { setSaveError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mon-an mon-viz">
      <div className="mon-dyn__head">
        <h2 className="mon-dyn__h">Динамика{data?.parallel ? `: ${data.parallel} параллель` : ''}</h2>
        <div className="mon-toolbar">
          <label className="mon-field">
            <span className="mon-label">Параллель</span>
            <select className="mon-input mon-select" value={data?.parallel ?? ''} disabled={!data} onChange={e => { setParallel(e.target.value); setWork(''); setGroup(''); }}>
              {(data?.parallels || []).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button type="button" className="mon-btn mon-btn--primary" disabled={!data || Boolean(loading) || busy} onClick={save}>{busy ? 'Готовим файл…' : 'Скачать Excel'}</button>
        </div>
      </div>
      {data && data.parallel && data.table && data.points.length ? (
        <WorkTable table={data.table} points={data.points} sections={data.sections} parallel={data.parallel} threshold={data.threshold} />
      ) : null}
      {data && data.points.length ? (
        <div className="mon-dyn__tabs" role="tablist" aria-label="Работа">
          {data.points.map(p => (
            <button key={p.key} type="button" role="tab" aria-selected={p.key === data.tab} className={p.key === data.tab ? 'is-current' : undefined} onClick={() => { setWork(p.key); setGroup(''); }}>{p.title}</button>
          ))}
        </div>
      ) : null}
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {saveError ? <p className="mon-err" role="alert">{saveError}</p> : null}
      {loading && !error ? <p className="mon-note">Считаем…</p> : null}
      {data && !loading && !data.parallel ? <p className="mon-note">Групп пока нет</p> : null}
      {data && !loading && data.parallel && data.screen ? (
        <DynamicsScreen s={data.screen} rows={data.rows} threshold={data.threshold} groups={data.groups} onGroup={id => setGroup(String(id))} />
      ) : null}
      {manage && data ? <Settings key={data.threshold} threshold={data.threshold} onSaved={reload} /> : null}
      {manage ? <MapEditor onSaved={() => { reload(); reloadCmp(); }} /> : null}
    </div>
  );
}
