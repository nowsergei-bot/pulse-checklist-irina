import { useEffect, useState } from 'react';
import { api } from './api';

type Account = {
  user_id: number; account_email: string | null; platform_role: string | null;
  monitoring_roles: string[];
  english_links: { teacher_id: number; teacher_email: string | null; group_id: number | null; class_id: number | null; academic_year_id: number | null }[];
};
type Page = { accounts: Account[]; next_after: number | null; routes: { key: string; path: string; identity: string }[] };

export default function CabinetDirectoryPage() {
  const [rows, setRows] = useState<Account[]>([]);
  const [routes, setRoutes] = useState<Page['routes']>([]);
  const [after, setAfter] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  async function load(cursor: number, reset = false) {
    setBusy(true); setError('');
    try {
      const page = await api<Page>('/directory/cabinets?limit=100&after=' + cursor);
      setRows(old => reset ? page.accounts : [...old, ...page.accounts.filter(r => !old.some(o => o.user_id === r.user_id))]);
      setAfter(page.next_after); setRoutes(page.routes);
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить справочник'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(0, true); }, []);
  const q = filter.trim().toLowerCase();
  const visible = rows.filter(r => !q || String(r.user_id) === q || (r.account_email || '').toLowerCase().includes(q) || r.english_links.some(l => (l.teacher_email || '').toLowerCase().includes(q)));
  return <div>
    <h1>Существующие кабинеты</h1>
    <p>Учётные записи, почты и связи для чек-листов и мониторинга английского. Данные обновляются из базы по кнопке «Обновить».</p>
    <p>Загружено: {rows.length}. {after === null ? 'Все записи загружены.' : 'Есть следующие страницы.'}</p>
    <label>Поиск по загруженным почтам или точному ID <input type="search" value={filter} onChange={e => setFilter(e.target.value)} /></label>
    <button type="button" disabled={busy} onClick={() => void load(0, true)}>Обновить</button>
    {error && <p role="alert" className="mon-err">{error}</p>}
    <div style={{ overflowX: 'auto' }}><table>
      <thead><tr><th>ID пользователя</th><th>Почта аккаунта</th><th>Роль платформы</th><th>Роли мониторинга</th><th>Связи английского</th></tr></thead>
      <tbody>{visible.map(r => <tr key={r.user_id}>
        <td>{r.user_id}</td><td>{r.account_email || 'Не указана'}</td><td>{r.platform_role || '—'}</td>
        <td>{r.monitoring_roles.join(', ') || '—'}</td>
        <td>{r.english_links.map((l, i) => <div key={i}>Преподаватель {l.teacher_id}; почта {l.teacher_email || '—'}; группа {l.group_id ?? '—'}; класс {l.class_id ?? '—'}; год {l.academic_year_id ?? '—'}</div>)}</td>
      </tr>)}</tbody>
    </table></div>
    {after !== null && <button type="button" disabled={busy} onClick={() => void load(after)}>Загрузить ещё 100</button>}
    {busy && <p role="status">Загружаем…</p>}
    <p>Поиск применяется к загруженным страницам. Для полного поиска загрузите все страницы. Отсутствие явной связи преподавателя не означает отсутствие доступа.</p>
    <h2>Маршруты кабинетов</h2>
    <ul>{routes.map(r => <li key={r.key}><code>{r.path}</code> — {r.identity}</li>)}</ul>
    <p>Назначенные роли не являются полным расчётом прав. Доступ проверяется сервером соответствующего раздела. Почты и ID не публиковать в исходниках и задачах.</p>
  </div>;
}
