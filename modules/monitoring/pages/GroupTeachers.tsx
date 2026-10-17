import { useEffect, useMemo, useState } from 'react';
import { api, useApi } from './api';
import Dialog from './Dialog';
import type { TeacherRow } from './rosterFile';

// Учителя групп в модуле: пробный прогон по столбцу «Учитель» файла составов,
// ручной выбор учётной записи и таблица «группа → учитель» на вкладке «Составы групп».
// Только data_admin; права проверяет сервер.

type Account = { id: number; full_name: string; english?: boolean; no_role: boolean; groups: string[] };
type Assigned = Account & { source: 'file' | 'manual' };
type Entry = { text: string; status: 'found' | 'not_found' | 'ambiguous'; user: Account | null; candidates: Account[] };
type PreviewGroup = {
  group_id: number; title: string; parallel: number | null;
  pulse: { full_name: string; has_account: boolean }[];
  module: Assigned[];
  entries: Entry[];
  status: 'same' | 'differs' | 'not_found' | 'ambiguous';
};
export type TeacherReport = {
  token: string;
  summary: { groups: number; same: number; differs: number; not_found: number; ambiguous: number; no_role: number; unknown_group_rows: number };
  groups: PreviewGroup[];
  unknown_groups: { group: string; rows: number }[];
};
type Found = { id: number; full_name: string; roles: string[]; groups: { id: number; title: string; digital: boolean }[] };
type ListGroup = {
  group_id: number; title: string; parallel: number | null;
  pulse: { full_name: string; has_account: boolean; no_role: boolean }[];
  module: { user_id: number; full_name: string; source: 'file' | 'manual'; no_role: boolean }[];
};
type History = { action: 'assign' | 'remove'; how: 'file' | 'manual' | 'pulse'; changed_by_name: string; changed_at: string; group: string; teacher: string };

const SOURCE = { file: 'из файла', manual: 'вручную', pulse: 'Пульс' } as const;

function when(stamp: string) {
  const d = new Date(stamp);
  return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

function Source({ source }: { source: 'file' | 'manual' | 'pulse' }) {
  return <span className={`mon-gt__src mon-gt__src--${source}`}>{source === 'pulse' ? 'Пульс' : SOURCE[source]}</span>;
}

function NoRole({ show }: { show: boolean }) {
  return show ? <span className="mon-gt__norole" title="Без этой роли учитель не откроет модуль. Роль назначается на вкладке «Роли».">нет роли «Учитель»</span> : null;
}

function Fact({ value, label, tone }: { value: number; label: string; tone?: 'ok' | 'warn' | 'err' }) {
  return (
    <div className={`mon-imp__fact${tone ? ` mon-imp__fact--${tone}` : ''}`}>
      <span className="mon-imp__num">{value}</span>
      <span className="mon-imp__label">{label}</span>
    </div>
  );
}

// Выбор учётной записи Пульса по ФИО. mode: вместо назначенных или добавить к ним.
export function AccountDialog({ title, note, allowAdd, busy, error, onPick, onCancel }: {
  title: string; note?: string; allowAdd?: boolean; busy?: boolean; error?: string;
  onPick: (account: Account, mode: 'set' | 'add') => void; onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<Found | null>(null);
  const [mode, setMode] = useState<'set' | 'add'>('set');
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setFound(null); return undefined; }
    let active = true;
    const timer = window.setTimeout(() => {
      api<{ users: Found[] }>(`/roles?q=${encodeURIComponent(text)}`)
        .then(r => { if (active) { setFound(r.users); setSearchError(''); } })
        .catch((e: Error) => { if (active) setSearchError(e.message); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [q]);

  const confirm = () => {
    if (picked) onPick({ id: picked.id, full_name: picked.full_name, no_role: !picked.roles.includes('teacher'), groups: picked.groups.map(g => (g.digital ? `${g.title} (ЦГ)` : g.title)) }, mode);
  };

  return (
    <Dialog title={title} confirmLabel="Назначить" busy={busy || !picked} onConfirm={confirm} onCancel={onCancel}>
      {note ? <p className="mon-note">{note}</p> : null}
      <span className="mon-search mon-rost__search">
        <input className="mon-input" type="text" autoFocus value={q} onChange={e => { setQ(e.target.value); setPicked(null); }} placeholder="ФИО учителя" aria-label="Поиск учётной записи по ФИО" />
      </span>
      {found && !found.length ? <p className="mon-note">Никого не нашли</p> : null}
      {found && found.length ? (
        <ul className="mon-rost__found" role="listbox" aria-label="Найденные учётные записи">
          {found.map(u => (
            <li key={u.id}>
              <button type="button" role="option" aria-selected={picked?.id === u.id} className={`mon-rost__pick${picked?.id === u.id ? ' is-picked' : ''}`} onClick={() => setPicked(u)}>
                <span className="mon-person">{u.full_name}</span> <NoRole show={!u.roles.includes('teacher')} />
                <span className="mon-rost__from">{u.groups.length ? `группы сейчас: ${u.groups.map(g => (g.digital ? `${g.title} (ЦГ)` : g.title)).join(', ')}` : 'групп сейчас нет'}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {allowAdd ? (
        <span className="mon-segmented mon-gt__mode" role="group" aria-label="Как назначить">
          <button type="button" className={mode === 'set' ? 'is-current' : undefined} aria-pressed={mode === 'set'} onClick={() => setMode('set')}>Вместо назначенных</button>
          <button type="button" className={mode === 'add' ? 'is-current' : undefined} aria-pressed={mode === 'add'} onClick={() => setMode('add')}>Добавить к назначенным</button>
        </span>
      ) : null}
      {searchError || error ? <p className="mon-err" role="alert">{searchError || error}</p> : null}
    </Dialog>
  );
}

const keyOf = (groupId: number, index: number) => `${groupId}:${index}`;

// Пробный прогон по столбцу «Учитель»: ничего не записывает до «Применить».
export function TeacherPreview({ rows, report, fileName, onApplied, onClose }: {
  rows: TeacherRow[]; report: TeacherReport; fileName: string; onApplied: (message: string) => void; onClose: () => void;
}) {
  const [manual, setManual] = useState<Map<string, Account>>(new Map());
  const [choosing, setChoosing] = useState<{ group: PreviewGroup; index: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chosen = (g: PreviewGroup, i: number) => manual.get(keyOf(g.group_id, i)) || g.entries[i].user;
  const ready = report.groups.filter(g => g.entries.every((_, i) => chosen(g, i)));
  const waiting = report.groups.length - ready.length;
  const noRole = new Set(ready.flatMap(g => g.entries.map((_, i) => chosen(g, i)!).filter(a => a.no_role).map(a => a.id))).size;
  const notFound = report.groups.flatMap(g => g.entries.map((e, i) => ({ g, e, i })).filter(x => x.e.status === 'not_found'));
  const ambiguous = report.groups.flatMap(g => g.entries.map((e, i) => ({ g, e, i })).filter(x => x.e.status === 'ambiguous'));
  const s = report.summary;

  function pick(group: PreviewGroup, index: number, account: Account | null) {
    setManual(prev => {
      const next = new Map(prev);
      if (account) next.set(keyOf(group.group_id, index), account);
      else next.delete(keyOf(group.group_id, index));
      return next;
    });
  }

  async function apply() {
    setBusy(true); setError('');
    try {
      const body = { rows, token: report.token, manual: [...manual.entries()].map(([k, a]) => [...k.split(':').map(Number), a.id]) };
      const r = await api<{ groups: number; skipped: number }>('/rosters/teachers/apply', { method: 'POST', body });
      onApplied(`Учителя групп из файла назначены: групп ${r.groups}${r.skipped ? `, без изменений из-за невыбранных учётных записей: ${r.skipped}` : ''}`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); setConfirm(false); }
  }

  const accountCell = (g: PreviewGroup, e: Entry, i: number) => {
    const m = manual.get(keyOf(g.group_id, i));
    if (m) return <><span className="mon-person">{m.full_name}</span> <Source source="manual" /> <NoRole show={m.no_role} /></>;
    if (e.user) return <><span className="mon-person">{e.user.full_name}</span> <NoRole show={e.user.no_role} /></>;
    return <span className="mon-imp__bad">{e.status === 'not_found' ? 'не найдена' : `найдено ${e.candidates.length}`}</span>;
  };

  const choice = (g: PreviewGroup, e: Entry, i: number) => (
    <span className="mon-gt__choice">
      {e.status === 'ambiguous' ? (
        <select className="mon-input mon-select" aria-label={`Учётная запись для ${e.text}`} value={manual.get(keyOf(g.group_id, i))?.id ?? ''}
          onChange={ev => pick(g, i, e.candidates.find(c => c.id === Number(ev.target.value)) || null)}>
          <option value="">Выберите учётную запись</option>
          {e.candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.groups.length ? ` · ${c.groups.join(', ')}` : ''}{c.no_role ? ' · нет роли «Учитель»' : ''}</option>)}
        </select>
      ) : null}
      <button type="button" className="mon-link" onClick={() => setChoosing({ group: g, index: i })}>{e.status === 'ambiguous' ? 'Другая учётная запись' : manual.has(keyOf(g.group_id, i)) ? 'Изменить' : 'Выбрать учётную запись'}</button>
      {manual.has(keyOf(g.group_id, i)) ? <button type="button" className="mon-link mon-link--muted" onClick={() => pick(g, i, null)}>Сбросить</button> : null}
    </span>
  );

  const statusTag = (g: PreviewGroup) => {
    const resolved = g.entries.every((_, i) => chosen(g, i));
    if (!resolved) return <span className="mon-gt__st mon-gt__st--err">{g.status === 'not_found' ? 'не найден' : 'несколько'}</span>;
    if (g.entries.some((_, i) => manual.has(keyOf(g.group_id, i)))) return <span className="mon-gt__st mon-gt__st--warn">выбрано вручную</span>;
    return g.status === 'same' ? <span className="mon-gt__st">как сейчас</span> : <span className="mon-gt__st mon-gt__st--warn">меняется</span>;
  };

  return (
    <div className="mon-imp__report mon-gt__preview">
      <p className="mon-imp__kicker">Учителя групп · пробный прогон · {fileName} · ничего не записано</p>
      <div className="mon-imp__facts">
        <Fact value={s.groups} label="групп с учителем в файле" />
        <Fact value={s.same} label="учитель как сейчас" tone="ok" />
        <Fact value={s.differs} label="учитель меняется" tone={s.differs ? 'warn' : undefined} />
        <Fact value={s.not_found} label="групп, где учётная запись не найдена" tone={s.not_found ? 'err' : undefined} />
        <Fact value={s.ambiguous} label="групп, где найдено несколько" tone={s.ambiguous ? 'err' : undefined} />
        {s.no_role ? <Fact value={s.no_role} label="учётных записей без роли «Учитель» в модуле" tone="warn" /> : null}
        {s.unknown_group_rows ? <Fact value={s.unknown_group_rows} label="строк с группой, которой нет в Пульсе" tone="err" /> : null}
      </div>

      {notFound.length ? (
        <details className="mon-imp__list" open>
          <summary>Не найдены ({notFound.length})</summary>
          <table className="mon-table">
            <thead><tr><th>Группа</th><th>По файлу</th><th>Учётная запись</th><th aria-label="Выбор" /></tr></thead>
            <tbody>{notFound.map(({ g, e, i }) => <tr key={keyOf(g.group_id, i)}><td>{g.title}</td><td>{e.text}</td><td>{accountCell(g, e, i)}</td><td>{choice(g, e, i)}</td></tr>)}</tbody>
          </table>
        </details>
      ) : null}
      {ambiguous.length ? (
        <details className="mon-imp__list" open>
          <summary>Найдено несколько ({ambiguous.length})</summary>
          <table className="mon-table">
            <thead><tr><th>Группа</th><th>По файлу</th><th>Учётная запись</th><th aria-label="Выбор" /></tr></thead>
            <tbody>{ambiguous.map(({ g, e, i }) => <tr key={keyOf(g.group_id, i)}><td>{g.title}</td><td>{e.text}</td><td>{accountCell(g, e, i)}</td><td>{choice(g, e, i)}</td></tr>)}</tbody>
          </table>
        </details>
      ) : null}

      <table className="mon-table mon-imp__groups mon-gt__table">
        <thead><tr><th>Группа</th><th>Учитель по Пульсу</th><th>Учитель по файлу</th><th>Найденная учётная запись</th><th>Итог</th><th aria-label="Действия" /></tr></thead>
        <tbody>
          {report.groups.map(g => g.entries.map((e, i) => (
            <tr key={keyOf(g.group_id, i)} className={i ? 'is-cont' : undefined}>
              {i ? <td /> : <td>{g.title}</td>}
              {i ? <td /> : (
                <td>
                  {g.pulse.length ? g.pulse.map(p => <span key={p.full_name} className="mon-imp__cand">{p.full_name}{p.has_account ? '' : <span className="mon-rost__from">нет учётной записи</span>}</span>) : <span className="mon-muted">нет</span>}
                  {g.module.length ? <span className="mon-rost__from">в модуле сейчас: {g.module.map(m => `${m.full_name} (${SOURCE[m.source]})`).join(', ')}</span> : null}
                </td>
              )}
              <td>{e.text}</td>
              <td>{accountCell(g, e, i)}</td>
              {i ? <td /> : <td>{statusTag(g)}</td>}
              <td className="mon-rost__act"><button type="button" className="mon-link" onClick={() => setChoosing({ group: g, index: i })}>Выбрать вручную</button></td>
            </tr>
          )))}
        </tbody>
      </table>
      {report.unknown_groups.length ? (
        <p className="mon-note">Группы из файла, которых нет в Пульсе: {report.unknown_groups.map(u => `${u.group} (строк: ${u.rows})`).join(', ')}.</p>
      ) : null}

      <div className="mon-imp__apply">
        <button type="button" className="mon-btn mon-btn--primary" disabled={busy || !ready.length} onClick={() => setConfirm(true)}>Применить учителей групп</button>
        <button type="button" className="mon-btn" disabled={busy} onClick={onClose}>Отменить</button>
        <span className="mon-note">{waiting ? `Без выбранной учётной записи: ${waiting}, эти группы останутся как сейчас.` : 'Учётная запись определена для всех групп из файла.'}</span>
      </div>
      {error ? <p className="mon-err" role="alert">{error}</p> : null}

      {choosing ? (
        <AccountDialog
          title={`Учитель группы ${choosing.group.title}`}
          note={`По файлу: «${choosing.group.entries[choosing.index].text}». Найдите учётную запись по ФИО, например по прежней фамилии.`}
          onPick={a => { pick(choosing.group, choosing.index, a); setChoosing(null); }}
          onCancel={() => setChoosing(null)}
        />
      ) : null}
      {confirm ? (
        <Dialog title="Применить учителей групп из файла?" confirmLabel="Применить" busy={busy} onConfirm={apply} onCancel={() => setConfirm(false)}>
          <p>Групп: {ready.length}. Эти группы в модуле увидят и смогут вносить баллы только назначенные учителя. Учитель по Пульсу, которого нет в файле, перестанет видеть такую группу.</p>
          {waiting ? <p>Без выбранной учётной записи: {waiting}. Эти группы, как и группы, которых нет в файле, остаются как сейчас.</p> : <p>Группы, которых нет в файле, остаются как сейчас.</p>}
          {noRole ? <p>У {noRole} назначенных учётных записей нет роли «Учитель» в модуле: без неё модуль не откроется. Роль назначается на вкладке «Роли».</p> : null}
          <p>Заведующая и завуч, как и раньше, видят все группы. В самом Пульсе учителя групп не меняются.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

// Таблица «группа → учитель» на вкладке «Составы групп»: откуда назначение, ручная правка, история.
export default function GroupTeachers() {
  const { data, error, reload } = useApi<{ groups: ListGroup[]; history: History[] }>('/rosters/teachers');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<ListGroup | null>(null);
  const [resetting, setResetting] = useState<ListGroup | null>(null);
  const [removing, setRemoving] = useState<{ group: ListGroup; user_id: number; full_name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [message, setMessage] = useState('');

  const groups = useMemo(() => {
    const text = filter.trim().toLowerCase().replace(/ё/g, 'е');
    const all = data?.groups || [];
    if (!text) return all;
    return all.filter(g => [g.title, ...g.pulse.map(p => p.full_name), ...g.module.map(m => m.full_name)].join(' ').toLowerCase().replace(/ё/g, 'е').includes(text));
  }, [data, filter]);
  const assigned = (data?.groups || []).filter(g => g.module.length).length;

  async function run(work: () => Promise<unknown>, text: string) {
    setBusy(true); setDialogError('');
    try {
      await work();
      setMessage(text);
      setEditing(null); setResetting(null); setRemoving(null);
      reload();
    } catch (e) { setDialogError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <details className="mon-imp mon-gt" open>
      <summary className="mon-gt__summary">
        <span className="mon-imp__title">Учителя групп</span>
        <span className="mon-note">{data ? `Групп: ${data.groups.length}, назначено в модуле: ${assigned}, остальные по Пульсу.` : 'Загружаем…'}</span>
      </summary>
      <p className="mon-note">Если у группы есть назначение в модуле, группу видят только назначенные учителя. Без назначения учитель берётся из Пульса. Заведующая и завуч видят все группы.</p>
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {message ? <p className="mon-alert mon-alert--ok" role="status">{message}</p> : null}
      <span className="mon-search mon-gt__filter">
        <input className="mon-input" type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Группа или ФИО учителя" aria-label="Найти группу или учителя" />
      </span>
      {data ? (
        <table className="mon-table mon-gt__table">
          <thead><tr><th>Группа</th><th>Учитель в модуле</th><th>Откуда</th><th aria-label="Действия" /></tr></thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.group_id}>
                <td>{g.title}</td>
                <td>
                  {g.module.length ? g.module.map(m => (
                    <span key={m.user_id} className="mon-imp__cand">
                      <span className="mon-person">{m.full_name}</span> <NoRole show={m.no_role} />
                      {g.module.length > 1 ? <> <button type="button" className="mon-link mon-link--muted" onClick={() => { setDialogError(''); setRemoving({ group: g, user_id: m.user_id, full_name: m.full_name }); }}>снять</button></> : null}
                    </span>
                  )) : g.pulse.length ? g.pulse.map(p => (
                    <span key={p.full_name} className="mon-imp__cand">
                      <span className="mon-person">{p.full_name}</span> {p.has_account ? <NoRole show={p.no_role} /> : <span className="mon-gt__norole">нет учётной записи</span>}
                    </span>
                  )) : <span className="mon-muted">нет учителя</span>}
                  {g.module.length && g.pulse.some(p => !g.module.some(m => m.full_name === p.full_name)) ? <span className="mon-rost__from">в Пульсе: {g.pulse.map(p => p.full_name).join(', ')}</span> : null}
                </td>
                <td>{g.module.length ? [...new Set(g.module.map(m => m.source))].map(s => <Source key={s} source={s} />) : <Source source="pulse" />}</td>
                <td className="mon-rost__act">
                  <button type="button" className="mon-link" onClick={() => { setDialogError(''); setEditing(g); }}>Изменить</button>
                  {g.module.length ? <> · <button type="button" className="mon-link mon-link--muted" onClick={() => { setDialogError(''); setResetting(g); }}>Вернуть как в Пульсе</button></> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {data && !groups.length ? <p className="mon-note">Ничего не нашли</p> : null}

      <details className="mon-rost__history">
        <summary>История назначений ({data?.history.length ?? 0})</summary>
        {data?.history.length ? (
          <ul>
            {data.history.map((h, i) => (
              <li key={i}>
                {when(h.changed_at)} · {h.changed_by_name || 'Автор не определён'} · {h.group}: {h.action === 'assign' ? `назначен учитель ${h.teacher} (${SOURCE[h.how]})` : `снят учитель ${h.teacher} (${h.how === 'pulse' ? 'группа снова по Пульсу' : h.how === 'file' ? 'по файлу' : 'вручную'})`}
              </li>
            ))}
          </ul>
        ) : <p className="mon-note">Назначений ещё не было</p>}
      </details>

      {editing ? (
        <AccountDialog
          title={`Учитель группы ${editing.title}`}
          note={editing.module.length ? undefined : 'После назначения группу увидит только выбранный учитель, учитель по Пульсу перестанет её видеть.'}
          allowAdd={editing.module.length > 0}
          busy={busy}
          error={dialogError}
          onPick={(a, mode) => run(() => api(`/rosters/teachers/${editing.group_id}`, { method: 'POST', body: { action: mode, user_id: a.id } }),
            `Группа ${editing.title}: ${mode === 'add' ? 'добавлен учитель' : 'назначен учитель'} ${a.full_name}`)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {resetting ? (
        <Dialog title={`Вернуть учителя группы ${resetting.title} как в Пульсе?`} confirmLabel="Вернуть" busy={busy}
          onConfirm={() => run(() => api(`/rosters/teachers/${resetting.group_id}/reset`, { method: 'POST', body: {} }), `Группа ${resetting.title}: учитель снова по Пульсу`)}
          onCancel={() => setResetting(null)}>
          <p>Назначение в модуле снимется. Группу будет видеть {resetting.pulse.length ? `учитель по Пульсу: ${resetting.pulse.map(p => p.full_name).join(', ')}` : 'учитель по Пульсу, сейчас его нет'}. Баллы не меняются.</p>
          {dialogError ? <p className="mon-err" role="alert">{dialogError}</p> : null}
        </Dialog>
      ) : null}
      {removing ? (
        <Dialog title={`Снять ${removing.full_name} с группы ${removing.group.title}?`} confirmLabel="Снять" busy={busy}
          onConfirm={() => run(() => api(`/rosters/teachers/${removing.group.group_id}`, { method: 'POST', body: { action: 'remove', user_id: removing.user_id } }), `Группа ${removing.group.title}: снят учитель ${removing.full_name}`)}
          onCancel={() => setRemoving(null)}>
          <p>Учитель перестанет видеть группу в модуле. Остальные назначенные учителя остаются. Баллы не меняются.</p>
          {dialogError ? <p className="mon-err" role="alert">{dialogError}</p> : null}
        </Dialog>
      ) : null}
    </details>
  );
}
