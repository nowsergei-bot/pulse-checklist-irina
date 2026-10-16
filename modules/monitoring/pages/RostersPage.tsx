import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, useApi } from './api';
import Dialog from './Dialog';
import RosterImport from './RosterImport';
import './rosters.css';

type Group = { id: number; title: string; parallel: number | null; digital: boolean; base_count?: number; from_file?: boolean; overrides?: number };
type Kind = 'fix' | 'transfer';
type Override = { id: number; action: 'add' | 'remove'; kind: Kind; from_date: string | null };
type Student = { id: number; full_name: string; in_base: boolean; override: Override | null; pulse_groups?: Group[] };
type HistoryRow = { action: 'add' | 'remove' | 'cancel'; kind: Kind; from_date: string | null; changed_by_name: string; changed_at: string; student: string };
type Roster = { group: Group; students: Student[]; history: HistoryRow[] };
type Found = { id: number; full_name: string; groups: Group[] };

// Даты на экране в виде ДД.ММ.ГГГГ, на сервер уходят как ГГГГ-ММ-ДД.
function toDisplay(iso: string | null | undefined) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

function typeDate(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('.');
}

function toIso(text: string): string | undefined {
  const m = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return undefined;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) ? iso : undefined;
}

function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Поправка уже действует сегодня или вступит в силу позже. «Исправить состав» действует всегда.
function inForce(o: Override | null) {
  return Boolean(o && (o.kind === 'fix' || (o.from_date && o.from_date <= todayIso())));
}

// «исправлением состава» или «с ДД.ММ.ГГГГ».
function sinceText(o: { kind: Kind; from_date: string | null }) {
  return o.kind === 'fix' ? 'исправлением состава' : `с ${toDisplay(o.from_date)}`;
}

function when(stamp: string) {
  const d = new Date(stamp);
  return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

function groupName(g: Group) {
  return g.digital ? `${g.title} (ЦГ)` : g.title;
}

const HISTORY_TEXT = { add: 'добавлен', remove: 'убран', cancel: 'отменена поправка: было' } as const;
const KINDS: { kind: Kind; label: string }[] = [{ kind: 'fix', label: 'Исправить состав' }, { kind: 'transfer', label: 'Перевод с даты' }];

// Вид поправки и дата перевода. По умолчанию «Исправить состав».
function KindField({ kind, onKind, date, onDate, action }: { kind: Kind; onKind: (k: Kind) => void; date: string; onDate: (v: string) => void; action: 'add' | 'remove' }) {
  return (
    <div className="mon-rost__kind">
      <span className="mon-segmented" role="group" aria-label="Вид поправки">
        {KINDS.map(k => (
          <button type="button" key={k.kind} className={kind === k.kind ? 'is-current' : undefined} aria-pressed={kind === k.kind} onClick={() => onKind(k.kind)}>{k.label}</button>
        ))}
      </span>
      {kind === 'fix' ? (
        <p className="mon-note">Ошибка в составе Пульса. Поправка действует на все работы текущего учебного года, включая уже проведённые.</p>
      ) : (
        <>
          <label className="mon-field mon-rost__date">
            <span className="mon-label">С какой даты</span>
            <input className="mon-input mon-input--date" inputMode="numeric" placeholder="ДД.ММ.ГГГГ" value={date} onChange={e => onDate(typeDate(e.target.value))} />
          </label>
          <p className="mon-note">{action === 'add' ? 'Ученик появится в этой группе в работах, которые проходят с этой даты.' : 'Ученика не будет в работах, которые проходят с этой даты.'}</p>
        </>
      )}
    </div>
  );
}

function AddDialog({ group, members, onDone, onCancel }: { group: Group; members: Set<number>; onDone: (message: string) => void; onCancel: () => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<Found | null>(null);
  const [kind, setKind] = useState<Kind>('fix');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Поиск по мере ввода: от двух букв, с короткой паузой.
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setFound(null); return undefined; }
    let active = true;
    const timer = window.setTimeout(() => {
      api<{ students: Found[] }>(`/rosters/search?q=${encodeURIComponent(text)}`)
        .then(r => { if (active) setFound(r.students); })
        .catch((e: Error) => { if (active) setError(e.message); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [q]);

  async function save() {
    const iso = kind === 'transfer' ? toIso(date) : null;
    if (!picked) { setError('Выберите ученика'); return; }
    if (kind === 'transfer' && !iso) { setError('Укажите дату в формате ДД.ММ.ГГГГ'); return; }
    setBusy(true); setError('');
    try {
      await api(`/rosters/${group.id}`, { method: 'POST', body: { action: 'add', kind, student_id: picked.id, from_date: iso } });
      onDone(`${picked.full_name} добавлен в группу ${groupName(group)}${kind === 'transfer' ? ` с ${date}` : ''}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Добавить ученика в группу ${groupName(group)}`} confirmLabel="Добавить" busy={busy || !picked} onConfirm={save} onCancel={onCancel}>
      <span className="mon-search mon-rost__search">
        <input className="mon-input" type="text" autoFocus value={q} onChange={e => { setQ(e.target.value); setPicked(null); }} placeholder="ФИО ученика" aria-label="Поиск ученика по ФИО" />
      </span>
      {found && !found.length ? <p className="mon-note">Никого не нашли</p> : null}
      {found && found.length ? (
        <ul className="mon-rost__found" role="listbox" aria-label="Найденные ученики">
          {found.map(s => (
            <li key={s.id}>
              <button type="button" role="option" aria-selected={picked?.id === s.id} disabled={members.has(s.id)} className={`mon-rost__pick${picked?.id === s.id ? ' is-picked' : ''}`} onClick={() => setPicked(s)}>
                <span className="mon-person">{s.full_name}</span>
                <span className="mon-rost__from">
                  {s.groups.length ? s.groups.map(groupName).join(', ') : 'нет текущей группы'}
                  {members.has(s.id) ? ' · уже в этой группе' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <KindField kind={kind} onKind={setKind} date={date} onDate={setDate} action="add" />
      <p className="mon-note">В Пульсе ученик остаётся в своей группе, меняется только состав в модуле.</p>
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
    </Dialog>
  );
}

export default function RostersPage() {
  const [params, setParams] = useSearchParams();
  const groupId = Number(params.get('group')) || null;
  const { data: list, error: listError, reload: reloadList } = useApi<{ groups: Group[] }>('/rosters');
  const { data, error, reload } = useApi<Roster>(groupId ? `/rosters/${groupId}` : null);
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Student | null>(null);
  const [cancelling, setCancelling] = useState<Student | null>(null);
  const [kind, setKind] = useState<Kind>('fix');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const byParallel = useMemo(() => {
    const map = new Map<string, Group[]>();
    for (const g of list?.groups || []) {
      const key = g.parallel === null ? 'Без параллели' : `${g.parallel} параллель`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return [...map.entries()];
  }, [list]);

  const roster = data && data.group.id === groupId ? data : null;
  // Состав на сегодня: поправки с будущей даты ещё не действуют.
  const inModule = roster ? roster.students.filter(s => (s.override && inForce(s.override) ? s.override.action === 'add' : s.in_base)).length : 0;
  const inBase = roster ? roster.students.filter(s => s.in_base).length : 0;
  const source = roster?.group.from_file ? 'из файла' : 'из Пульса';

  function done(text: string) {
    setMessage(text);
    setAdding(false); setRemoving(null); setCancelling(null); setBusy(false);
    reload(); reloadList();
  }

  async function remove() {
    if (!removing || !roster) return;
    const iso = kind === 'transfer' ? toIso(date) : null;
    if (kind === 'transfer' && !iso) { setDialogError('Укажите дату в формате ДД.ММ.ГГГГ'); return; }
    setBusy(true); setDialogError('');
    try {
      await api(`/rosters/${roster.group.id}`, { method: 'POST', body: { action: 'remove', kind, student_id: removing.id, from_date: iso } });
      done(`${removing.full_name} убран из группы ${groupName(roster.group)}${kind === 'transfer' ? ` с ${date}` : ''}`);
    } catch (e) { setDialogError((e as Error).message); setBusy(false); }
  }

  async function cancel() {
    if (!cancelling?.override) return;
    setBusy(true); setDialogError('');
    try {
      await api(`/rosters/overrides/${cancelling.override.id}/cancel`, { method: 'POST', body: {} });
      done(`Поправка для ${cancelling.full_name} отменена`);
    } catch (e) { setDialogError((e as Error).message); setBusy(false); }
  }

  return (
    <div className="mon-rost">
      <p className="mon-note mon-hint">Состав берётся из Пульса или из загруженного файла. Здесь можно поправить его для модуля: в Пульсе составы не меняются. Поправки и загрузки видны только администраторам данных.</p>
      <RosterImport onApplied={() => { reload(); reloadList(); }} />
      <div className="mon-toolbar">
        <label className="mon-field">
          <span className="mon-label">Группа</span>
          <select className="mon-input mon-select" value={groupId ?? ''} onChange={e => { setMessage(''); setParams(e.target.value ? { group: e.target.value } : {}); }}>
            <option value="">Выберите группу</option>
            {byParallel.map(([label, groups]) => (
              <optgroup key={label} label={label}>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{groupName(g)} · {g.base_count} уч.{g.from_file ? ' · из файла' : ''}{g.overrides ? ` · поправок: ${g.overrides}` : ''}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {roster ? <button type="button" className="mon-btn mon-btn--ghost" onClick={() => { setMessage(''); setAdding(true); }}>+ Добавить ученика</button> : null}
      </div>

      {listError ? <p className="mon-err" role="alert">{listError}</p> : null}
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {message ? <p className="mon-alert mon-alert--ok" role="status">{message}</p> : null}
      {groupId && !roster && !error ? <p className="mon-note">Загружаем…</p> : null}

      {roster ? (
        <>
          <p className="mon-rost__summary">
            Основной состав {source}: {inBase}. В модуле сегодня: {inModule}.
            {roster.students.some(s => s.override?.kind === 'transfer') ? ' Переводы с даты учитываются по дате проведения каждой работы.' : ''}
            {roster.students.some(s => s.override) ? '' : ` Поправок нет, состав ${source === 'из файла' ? 'как в файле' : 'как в Пульсе'}.`}
          </p>
          {roster.students.length ? (
            <table className="mon-table mon-rost__table">
              <thead><tr><th>Ученик</th><th>Состав</th><th aria-label="Действия" /></tr></thead>
              <tbody>
                {roster.students.map(s => (
                  <tr key={s.id} className={s.override?.action === 'remove' && inForce(s.override) ? 'is-removed' : undefined}>
                    <td><span className="mon-person">{s.full_name}</span></td>
                    <td>
                      {!s.override ? <span className="mon-muted">{source}</span> : null}
                      {s.override?.action === 'remove' ? <span className="mon-rost__tag mon-rost__tag--removed">{inForce(s.override) ? 'убран' : 'будет убран'} {sinceText(s.override)}</span> : null}
                      {s.override?.action === 'add' ? (
                        <>
                          <span className="mon-rost__tag mon-rost__tag--added">{inForce(s.override) ? 'добавлен' : 'будет добавлен'} {sinceText(s.override)}</span>
                          <span className="mon-rost__from">в Пульсе: {s.pulse_groups?.length ? s.pulse_groups.map(groupName).join(', ') : 'нет текущей группы'}</span>
                        </>
                      ) : null}
                    </td>
                    <td className="mon-rost__act">
                      {s.override
                        ? <button type="button" className="mon-link" onClick={() => { setDialogError(''); setCancelling(s); }}>Отменить поправку</button>
                        : <button type="button" className="mon-link" onClick={() => { setDialogError(''); setKind('fix'); setDate(today()); setRemoving(s); }}>Убрать из группы</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="mon-note">В группе нет учеников</p>}

          <details className="mon-rost__history">
            <summary>История поправок группы ({roster.history.length})</summary>
            {roster.history.length ? (
              <ul>
                {roster.history.map((h, i) => (
                  <li key={i}>{when(h.changed_at)} · {h.changed_by_name || 'Автор не определён'} · {h.student}: {HISTORY_TEXT[h.action]} {sinceText(h)}</li>
                ))}
              </ul>
            ) : <p className="mon-note">Поправок ещё не было</p>}
          </details>
        </>
      ) : null}

      {adding && roster ? <AddDialog group={roster.group} members={new Set(roster.students.map(s => s.id))} onDone={done} onCancel={() => setAdding(false)} /> : null}

      {removing && roster ? (
        <Dialog title={`Убрать ${removing.full_name} из группы ${groupName(roster.group)}?`} confirmLabel="Убрать" busy={busy} onConfirm={remove} onCancel={() => setRemoving(null)}>
          <KindField kind={kind} onKind={setKind} date={date} onDate={setDate} action="remove" />
          <p className="mon-note">В Пульсе ученик остаётся в группе. Баллы, уже внесённые в этой группе, останутся за ней.</p>
          {dialogError ? <p className="mon-err" role="alert">{dialogError}</p> : null}
        </Dialog>
      ) : null}

      {cancelling?.override && roster ? (
        <Dialog title={`Отменить поправку для ${cancelling.full_name}?`} confirmLabel="Отменить поправку" cancelLabel="Не отменять" busy={busy} onConfirm={cancel} onCancel={() => setCancelling(null)}>
          <p>
            {cancelling.override.action === 'add'
              ? `Ученик больше не будет в группе ${groupName(roster.group)} в модуле.`
              : `Ученик снова будет в группе ${groupName(roster.group)} в модуле, как в Пульсе.`}
            {' '}Баллы, уже внесённые в группе, не меняются.
          </p>
          {dialogError ? <p className="mon-err" role="alert">{dialogError}</p> : null}
        </Dialog>
      ) : null}
    </div>
  );
}
