import { Link, useLocation } from 'react-router-dom';
import { useApi } from './api';
import RolesPage from './RolesPage';
import SchemaPage from './SchemaPage';
import './monitoring.css';

const BASE = '/cabinet/monitoring';

type Me = { full_name?: string; roles: string[]; capabilities: { manage: boolean } };

// Все /cabinet/monitoring/* обслуживаются здесь.
export default function MonitoringPage() {
  const location = useLocation();
  const sub = (location.pathname.split('/monitoring')[1] || '/').replace(/\/+$/, '') || '/';
  const { data: me, error } = useApi<Me>('/me');

  const tabs: { path: string; label: string }[] = [{ path: '/', label: 'Работы' }];
  if (me?.capabilities.manage) tabs.push({ path: '/roles', label: 'Роли' });

  let content;
  if (error) content = <p className="mon-err" role="alert">{error}</p>;
  else if (!me) content = <p className="mon-note">Проверяем доступ…</p>;
  else if (sub === '/roles' && me.capabilities.manage) content = <RolesPage />;
  else if (sub === '/schema' && me.capabilities.manage) content = <SchemaPage />;
  else if (sub === '/') content = <p className="mon-note">Работ пока нет</p>;
  else content = <p className="mon-note">Страница не найдена</p>;

  return (
    <section className="mon-page">
      <p className="mon-kicker">Мониторинг результатов</p>
      <nav className="mon-nav">
        {tabs.map(t => (
          <Link key={t.path} to={BASE + (t.path === '/' ? '' : t.path)} className={sub === t.path ? 'is-current' : undefined}>{t.label}</Link>
        ))}
      </nav>
      {content}
    </section>
  );
}
