import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApi } from './api';
import Dialog from './Dialog';
import { GroupName, STATUS_NAMES, versionLabel } from './labels';

type Group = { id: number; title: string; parallel: number | null; digital: boolean };
type Version = { id: number; title: string; type_id: number; version: number; max_points: number; class_hint: string | null; parts: { code: string; name: string }[] };
type Options = {
  types: { id: number; code: string; name: string; graded: boolean }[];
  years: { id: number; label: string; is_current: boolean }[];
  year_id: number | null;
  groups: Group[];
  versions: Version[];
  scales: { id: number; name: string; is_default: boolean }[];
  // Сколько разных названий работ каждого вида уже есть в году.
  titles_by_type?: Record<string, number>;
};
type Work = {
  id: number; type_id: number; title: string; academic_year_id: number; parallel: number; spec_version_id: number;
  scale_id: number | null; status: string; is_test: boolean; dates: Record<string, string> | null; groups: number[]; has_results: boolean;
};

// Даты в форме в виде ДД.ММ.ГГГГ, на сервер уходят как ГГГГ-ММ-ДД.
function toDisplay(iso: string | null | undefined) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

function typeDate(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('.');
}

function toIso(text: string): string | null | undefined {
  if (!text) return null;
  const m = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return undefined;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) ? iso : undefined;
}

// Класс спецификации из C4: «1» или «1 класс».
function specClass(hint: string | null) {
  const m = (hint || '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

export default function WorkForm({ base, workId }: { base: string; workId?: number }) {
  const navigate = useNavigate();
  const existing = useApi<{ work: Work }>(workId ? `/works/${workId}` : null);
  const work = existing.data?.work;
  const [yearId, setYearId] = useState<number | null>(null);
  const opts = useApi<Options>(yearId ? `/works/options?year=${yearId}` : workId && !work ? null : '/works/options');
  const o = opts.data;

  const [typeId, setTypeId] = useState<number>();
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [parallels, setParallels] = useState<number[]>([]);
  const [versionId, setVersionId] = useState<number>();
  const [scaleId, setScaleId] = useState<number>();
  const [dates, setDates] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<number[]>([]);
  const [status, setStatus] = useState('draft');
  const [isTest, setIsTest] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mismatch, setMismatch] = useState('');

  // Начальные значения: из работы при правке, иначе по умолчанию.
  useEffect(() => {
    if (!o || ready) return;
    if (workId) {
      if (!work) return;
      if (yearId === null && work.academic_year_id !== o.year_id) { setYearId(work.academic_year_id); return; }
      setTypeId(work.type_id); setTitle(work.title); setTitleTouched(true); setParallels([work.parallel]);
      setVersionId(work.spec_version_id); setScaleId(work.scale_id ?? o.scales.find(s => s.is_default)?.id); setDates(Object.fromEntries(Object.entries(work.dates || {}).map(([k, v]) => [k, toDisplay(v)])));
      setGroups(work.groups.map(Number)); setStatus(work.status); setIsTest(work.is_test);
    } else {
      setTypeId(o.types.find(t => t.code === 'module')?.id || o.types[0]?.id);
      setScaleId(o.scales.find(s => s.is_default)?.id || o.scales[0]?.id);
    }
    setReady(true);
  }, [o, work, workId, ready, yearId]);

  const type = o?.types.find(t => t.id === typeId);
  // Вид работы без отметки (пробный ЕГЭ): шкалы нет.
  const graded = type ? type.graded !== false : true;
  const allParallels = useMemo(() => [...new Set((o?.groups || []).map(g => g.parallel).filter((p): p is number => p !== null))].sort((a, b) => a - b), [o]);
  const versions = (o?.versions || []).filter(v => v.type_id === typeId);
  const version = versions.find(v => v.id === versionId);
  const groupsOf = (p: number) => (o?.groups || []).filter(g => g.parallel === p);

  function toggleParallel(p: number) {
    const on = parallels.includes(p);
    setParallels(on ? parallels.filter(x => x !== p) : [...parallels, p].sort((a, b) => a - b));
    const ids = groupsOf(p).map(g => g.id);
    // По умолчанию выбираются все текущие группы параллели, основные и ЦГ.
    setGroups(on ? groups.filter(id => !ids.includes(id)) : [...new Set([...groups, ...ids])]);
  }

  function chooseVersion(id: number) {
    setVersionId(id);
    const v = versions.find(x => x.id === id);
    if (v && !titleTouched) setTitle(v.title.split(',')[0]);
  }

  // Пробный ЕГЭ: единственная спецификация, название «Пробный ЕГЭ N», по умолчанию 11 параллель со всеми группами.
  // Параллель можно сменить на любую, например 10.
  function chooseType(id: number) {
    setTypeId(id);
    const t = o?.types.find(x => x.id === id);
    const own = (o?.versions || []).filter(v => v.type_id === id);
    setVersionId(own.length === 1 ? own[0].id : undefined);
    if (workId || !t || t.code !== 'ege_mock') return;
    if (!titleTouched) setTitle(`Пробный ЕГЭ ${(o?.titles_by_type?.[String(id)] || 0) + 1}`);
    if (!parallels.length && allParallels.includes(11)) {
      setParallels([11]);
      setGroups(groupsOf(11).map(g => g.id));
    }
  }

  function changeYear(id: number) {
    setYearId(id); setParallels([]); setGroups([]);
  }

  // Спецификация для одного класса, а выбрана другая параллель: спросить перед сохранением.
  function datesIso() {
    const parts = version?.parts || [];
    const iso = Object.fromEntries(parts.map(p => [p.code, toIso(dates[p.code] || '')]));
    const wrong = parts.find(p => iso[p.code] === undefined);
    if (wrong) { setError(`Дата «${wrong.name.toLowerCase()}» в формате ДД.ММ.ГГГГ, например 20.10.2026`); return null; }
    return iso;
  }

  function trySave() {
    setError('');
    if (!datesIso()) return;
    const cls = specClass(version?.class_hint ?? null);
    const changed = !work || work.spec_version_id !== versionId;
    const other = cls === null || !changed ? [] : parallels.filter(p => p !== cls);
    if (other.length) {
      setMismatch(`Спецификация для ${cls} класса, а ${other.length > 1 ? `выбраны параллели ${other.join(', ')}` : `выбрана параллель ${other[0]}`}. Продолжить?`);
      return;
    }
    save();
  }

  async function save() {
    setMismatch('');
    const iso = datesIso();
    if (!iso) return;
    setBusy(true); setError('');
    const body = {
      type_id: typeId, title, academic_year_id: yearId ?? o?.year_id, parallels, spec_version_id: versionId, scale_id: graded ? scaleId : null,
      status, is_test: isTest, groups, dates: iso,
    };
    try {
      if (workId) {
        await api(`/works/${workId}`, { method: 'POST', body });
        navigate(base, { state: { message: 'Работа сохранена' } });
      } else {
        const r = await api<{ created: number[] }>('/works', { method: 'POST', body });
        navigate(base, { state: { message: r.created.length > 1 ? `Создано работ: ${r.created.length}` : 'Работа создана' } });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  if (existing.error || opts.error) return <p className="mon-err" role="alert">{existing.error || opts.error}</p>;
  if (!o || !ready) return <p className="mon-note">Загружаем…</p>;
  const locked = Boolean(work?.has_results);
  const count = parallels.length;

  return (
    <div className="mon-form">
      <h2 className="mon-h2">{work ? `Работа «${work.title}», ${work.parallel} параллель` : 'Новая работа'}</h2>

      <div className="mon-field">
        <span className="mon-label">Вид работы</span>
        <span className="mon-segmented" role="group">
          {o.types.map(t => (
            <button type="button" key={t.id} className={t.id === typeId ? 'is-current' : undefined} aria-pressed={t.id === typeId} disabled={locked} onClick={() => chooseType(t.id)}>{t.name}</button>
          ))}
        </span>
      </div>

      <label className="mon-field">
        <span className="mon-label">Спецификация</span>
        <select className="mon-input mon-select" value={versionId ?? ''} disabled={locked} onChange={e => chooseVersion(Number(e.target.value))}>
          <option value="" disabled>Выберите утверждённую версию</option>
          {versions.map(v => <option key={v.id} value={v.id}>{versionLabel(v)}</option>)}
        </select>
        {locked ? <span className="mon-muted">Версию спецификации нельзя сменить: по работе уже есть результаты.</span> : null}
        {!versions.length ? <span className="mon-muted">Нет утверждённых спецификаций этого вида. Утвердите версию на вкладке «Спецификации».</span> : null}
      </label>

      <label className="mon-field">
        <span className="mon-label">Название</span>
        <input className="mon-input" value={title} onChange={e => { setTitle(e.target.value); setTitleTouched(true); }} placeholder="Например, Модуль 1" />
      </label>

      <div className="mon-field-row">
        <label className="mon-field">
          <span className="mon-label">Учебный год</span>
          <select className="mon-input mon-select" value={yearId ?? o.year_id ?? ''} disabled={Boolean(workId)} onChange={e => changeYear(Number(e.target.value))}>
            {o.years.map(y => <option key={y.id} value={y.id}>{y.label}{y.is_current ? ' (текущий)' : ''}</option>)}
          </select>
        </label>
        {graded ? (
          <label className="mon-field">
            <span className="mon-label">Шкала отметок</span>
            <select className="mon-input mon-select" value={scaleId ?? ''} onChange={e => setScaleId(Number(e.target.value))}>
              {o.scales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        ) : (
          <div className="mon-field">
            <span className="mon-label">Отметка</span>
            <span className="mon-muted mon-field__text">Без отметки: только первичный балл и процент выполнения</span>
          </div>
        )}
      </div>

      {version ? (
        <div className="mon-field-row">
          {version.parts.map(p => (
            <label className="mon-field" key={p.code}>
              <span className="mon-label">Дата: {p.name.toLowerCase()}</span>
              <input className="mon-input mon-input--date" inputMode="numeric" placeholder="ДД.ММ.ГГГГ" value={dates[p.code] || ''} onChange={e => setDates({ ...dates, [p.code]: typeDate(e.target.value) })} />
            </label>
          ))}
        </div>
      ) : null}

      <div className="mon-field">
        <span className="mon-label">{workId ? 'Параллель' : 'Параллели (по одной работе на каждую)'}</span>
        <span className="mon-chips">
          {(workId ? parallels : allParallels).map(p => (
            <button type="button" key={p} className={`mon-filter${parallels.includes(p) ? ' is-current' : ''}`} aria-pressed={parallels.includes(p)} disabled={Boolean(workId)} onClick={() => toggleParallel(p)}>{p}</button>
          ))}
        </span>
      </div>

      {parallels.map(p => {
        const list = groupsOf(p);
        const all = list.every(g => groups.includes(g.id));
        return (
          <div className="mon-field" key={p}>
            <span className="mon-label">
              Группы {p} параллели
              <button type="button" className="mon-link" onClick={() => setGroups(all ? groups.filter(id => !list.some(g => g.id === id)) : [...new Set([...groups, ...list.map(g => g.id)])])}>{all ? 'снять все' : 'выбрать все'}</button>
            </span>
            <span className="mon-checks">
              {list.map(g => (
                <label key={g.id} className="mon-check">
                  <input type="checkbox" checked={groups.includes(g.id)} onChange={() => setGroups(groups.includes(g.id) ? groups.filter(id => id !== g.id) : [...groups, g.id])} />
                  <GroupName group={g} />
                </label>
              ))}
              {!list.length ? <span className="mon-muted">Нет текущих групп</span> : null}
            </span>
          </div>
        );
      })}

      <div className="mon-field">
        <span className="mon-label">Статус</span>
        <span className="mon-segmented" role="group">
          {Object.entries(STATUS_NAMES).map(([code, name]) => (
            <button type="button" key={code} className={status === code ? 'is-current' : undefined} aria-pressed={status === code} onClick={() => setStatus(code)}>{code === 'open' ? 'Открыта для ввода' : name}</button>
          ))}
        </span>
      </div>

      <label className="mon-check">
        <input type="checkbox" checked={isTest} onChange={e => setIsTest(e.target.checked)} />
        <span>Тестовая работа, на вымышленных данных</span>
      </label>

      {error ? <p className="mon-alert mon-alert--err" role="alert">{error}</p> : null}
      <div className="mon-actions">
        <button type="button" className="mon-btn mon-btn--primary" disabled={busy || !versionId || !count || !title.trim()} onClick={trySave}>
          {workId ? 'Сохранить' : count > 1 ? `Создать работы: ${count}` : 'Создать работу'}
        </button>
        <button type="button" className="mon-btn" onClick={() => navigate(base)}>Отмена</button>
      </div>
      {mismatch ? <Dialog title={mismatch} confirmLabel="Продолжить" busy={busy} onConfirm={save} onCancel={() => setMismatch('')} /> : null}
    </div>
  );
}
