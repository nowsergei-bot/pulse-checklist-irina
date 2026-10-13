import { useEffect, useRef, useState } from 'react';
import { api, useApi } from './api';
import Dialog from './Dialog';

type Group = { id: number; title: string; digital: boolean };
type RoleUser = { id: number; full_name: string; roles: string[]; groups: Group[] };
type RolesData = { users: RoleUser[]; names: Record<string, string> };
type Preview = { to_add: number; already: number; without_account: string[] };

const ROLE_ORDER = ['teacher', 'department_head', 'deputy', 'data_admin'];
const FILTERS: { role: string; label: string }[] = [
  { role: '', label: 'Все' },
  { role: 'teacher', label: 'Учителя' },
  { role: 'department_head', label: 'Заведующая' },
  { role: 'deputy', label: 'Завуч' },
  { role: 'data_admin', label: 'Администраторы данных' },
];

// 1 учитель, 2 учителя, 5 учителей.
function teachers(n: number) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return 'учитель';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'учителя';
  return 'учителей';
}

function RoleMenu({ roles, names, disabled, onPick }: { roles: string[]; names: Record<string, string>; disabled: boolean; onPick: (role: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);
  if (!roles.length) return null;
  return (
    <span className="mon-menu" ref={ref}>
      <button type="button" className="mon-add" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>+ роль</button>
      {open ? (
        <span className="mon-menu__list" role="menu">
          {roles.map(r => (
            <button type="button" role="menuitem" key={r} className="mon-menu__item" onClick={() => { setOpen(false); onPick(r); }}>
              <span className={`mon-dot mon-role--${r}`} aria-hidden="true" />
              {names[r] || r}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

export default function RolesPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const { data, error, reload, setData } = useApi<RolesData>(search ? `/roles?q=${encodeURIComponent(search)}` : '/roles');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<{ user: RoleUser; role: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  // Поиск по мере ввода: от двух букв, с короткой паузой.
  useEffect(() => {
    const text = q.trim();
    const timer = window.setTimeout(() => setSearch(text.length >= 2 ? text : ''), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  async function change(user: RoleUser, role: string, action: 'add' | 'remove') {
    setBusy(true); setMessage('');
    try {
      const r = await api<{ user_id: number; roles: string[] }>('/roles', { method: 'POST', body: { user_id: user.id, role, action } });
      const roles = ROLE_ORDER.filter(x => r.roles.includes(x));
      setData(d => d && { ...d, users: d.users.map(u => (u.id === r.user_id ? { ...u, roles } : u)) });
    } catch (e) {
      setMessage((e as Error).message);
    } finally { setBusy(false); setRemoving(null); }
  }

  async function openTeachersAll() {
    setBusy(true); setMessage('');
    try {
      setPreview(await api<Preview>('/roles/teachers-all'));
    } catch (e) {
      setMessage((e as Error).message);
    } finally { setBusy(false); }
  }

  async function teachersAll() {
    setBusy(true); setMessage('');
    try {
      const r = await api<{ added: number }>('/roles/teachers-all', { method: 'POST' });
      setMessage(`Роль учителя назначена: ${r.added}`);
      reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally { setBusy(false); setPreview(null); }
  }

  const names = data?.names || {};
  const users = data?.users || [];
  const count = (role: string) => (role ? users.filter(u => u.roles.includes(role)).length : users.length);
  const shown = filter ? users.filter(u => u.roles.includes(filter)) : users;

  return (
    <div className="mon-roles">
      <div className="mon-toolbar">
        <span className="mon-search">
          <input className="mon-input" type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по ФИО" aria-label="Поиск по ФИО" />
          {q ? <button type="button" className="mon-search__clear" aria-label="Очистить поиск" onClick={() => setQ('')}>×</button> : null}
        </span>
        <button type="button" className="mon-btn mon-btn--ghost" disabled={busy} onClick={openTeachersAll}>Назначить роль учителя всем учителям английского</button>
      </div>
      <p className="mon-note mon-hint">{search ? `Результаты поиска «${search}»` : 'Показаны все, у кого есть роли модуля. Чтобы назначить роль, найдите сотрудника по ФИО.'}</p>

      <div className="mon-filters" role="group" aria-label="Фильтр по ролям">
        {FILTERS.map(f => (
          <button type="button" key={f.role || 'all'} className={`mon-filter${filter === f.role ? ' is-current' : ''}`} aria-pressed={filter === f.role} onClick={() => setFilter(f.role)}>
            {f.role ? <span className={`mon-dot mon-role--${f.role}`} aria-hidden="true" /> : null}
            {f.label}
            <span className="mon-filter__count">{count(f.role)}</span>
          </button>
        ))}
      </div>

      {message ? <p className="mon-note" role="status">{message}</p> : null}
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {!data && !error ? <p className="mon-note">Загружаем…</p> : null}
      {data && !shown.length ? <p className="mon-note">{search ? 'Никого не нашли' : filter ? 'С этой ролью пока никого нет' : 'Ролей пока нет'}</p> : null}
      {shown.length ? (
        <table className="mon-table mon-roles__table">
          <thead><tr><th>Сотрудник</th><th>Роли</th></tr></thead>
          <tbody>
            {shown.map(u => (
              <tr key={u.id}>
                <td>
                  <span className="mon-person">{u.full_name}</span>
                  {u.groups.length ? (
                    <span className="mon-groups">
                      {u.groups.map(g => (
                        <span key={g.id} className="mon-group">{g.title}{g.digital ? <span className="mon-group__type">ЦГ</span> : null}</span>
                      ))}
                    </span>
                  ) : null}
                </td>
                <td>
                  <span className="mon-tags">
                    {u.roles.map(r => (
                      <span className={`mon-tag mon-role--${r}`} key={r}>
                        {names[r] || r}
                        <button type="button" className="mon-tag__x" disabled={busy} title="Снять роль" aria-label={`Снять роль ${names[r] || r}`} onClick={() => setRemoving({ user: u, role: r })}>×</button>
                      </span>
                    ))}
                    <RoleMenu roles={ROLE_ORDER.filter(r => !u.roles.includes(r))} names={names} disabled={busy} onPick={r => change(u, r, 'add')} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {removing ? (
        <Dialog
          title={`Снять роль «${names[removing.role] || removing.role}» у ${removing.user.full_name}?`}
          confirmLabel="Снять роль"
          busy={busy}
          onConfirm={() => change(removing.user, removing.role, 'remove')}
          onCancel={() => setRemoving(null)}
        />
      ) : null}

      {preview ? (
        <Dialog
          title="Назначить роль учителя всем учителям английского"
          confirmLabel="Назначить"
          busy={busy}
          onConfirm={preview.to_add ? teachersAll : undefined}
          onCancel={() => setPreview(null)}
        >
          <p>
            {preview.to_add
              ? `Роль получ${preview.to_add % 10 === 1 && preview.to_add % 100 !== 11 ? 'и' : 'а'}т ${preview.to_add} ${teachers(preview.to_add)}. У ${preview.already} она уже есть.`
              : `Назначать некому: роль уже есть у всех учителей английского (${preview.already}).`}
          </p>
          <p>В список входят все действующие учителя английского, в том числе учителя групп ЦГ.</p>
          {preview.without_account.length ? (
            <>
              <p>Без учётной записи Пульса, им роль назначить нельзя:</p>
              <ul className="mon-dialog__list">
                {preview.without_account.map(name => <li key={name}>{name}</li>)}
              </ul>
            </>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}
