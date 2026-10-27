import { useState } from 'react';
import { api, useApi } from './api';

// Вкладка «Динамика»: сравнение работ с входным тестированием по общим разделам, только проценты выполнения.
// Заведующая кафедрой и data_admin видят все группы, учитель свои; отбор групп делает сервер.
// manage (data_admin): ещё сопоставление полей входного с разделами (таблица модуля, без кода).

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
const fmt = (v: number) => v.toLocaleString('ru-RU');
const signed = (v: number) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(-v)}` : '0');
const diffClass = (v: number) => (v > 0 ? 'is-up' : v < 0 ? 'is-down' : 'is-same');

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

export default function ProgressPage({ manage }: { manage: boolean }) {
  const [work, setWork] = useState('');
  const query = work ? `?work=${encodeURIComponent(work)}` : '';
  const { data, error, reload } = useApi<Data>(`/progress/compare${query}`);
  const [code, setCode] = useState('total');
  const loading = !data || (work && data.work !== work);
  const sections = data ? [TOTAL, ...data.sections] : [TOTAL];
  const section = sections.find(s => s.code === code) || TOTAL;
  const title = data?.works.find(w => w.key === data.work)?.title || '';

  return (
    <div className="mon-an mon-viz">
      <p className="mon-note mon-hint">
        Сравнение с входным тестированием по общим разделам. Ученики в нынешних группах (текущий состав с поправками модуля).
        {manage ? '' : ' Видны только твои группы и средние по их параллелям.'}
      </p>
      <div className="mon-toolbar">
        <label className="mon-field">
          <span className="mon-label">Работа</span>
          <select className="mon-input mon-select" value={data?.work || ''} onChange={e => setWork(e.target.value)} disabled={!data || !data.works.length}>
            {(data?.works || []).map(w => <option key={w.key} value={w.key}>{w.title}</option>)}
          </select>
        </label>
        <div className="mon-segmented" role="group" aria-label="Раздел">
          {sections.map(s => <button key={s.code} type="button" className={s.code === section.code ? 'is-current' : undefined} onClick={() => setCode(s.code)}>{s.name}</button>)}
        </div>
      </div>
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {loading && !error ? <p className="mon-note">Считаем…</p> : null}
      {data && !loading && !data.works.length ? <p className="mon-note">Работ этого года пока нет</p> : null}
      {data && !loading && data.work ? (
        <>
          <div className="mon-viz__grid mon-viz__grid--one">
            <CompareChart rows={data.rows} section={section} work={title} caption={data.caption} />
          </div>
          <section className="mon-an__block">
            <h3 className="mon-an__title">Входное и {title}: по разделам</h3>
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
                        return (
                          <td key={s.code} className="mon-num">
                            {p ? <>{fmt(p.start)} → {fmt(p.work)} <span className={`mon-prog__diff ${diffClass(p.diff)}`}>{signed(p.diff)}</span></> : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mon-prog__caption">{data.caption}</p>
          </section>
        </>
      ) : null}
      {manage ? <MapEditor onSaved={reload} /> : null}
    </div>
  );
}
