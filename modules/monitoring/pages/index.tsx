import { Link, useLocation } from 'react-router-dom';
import { useApi } from './api';
import CabinetDirectoryPage from './CabinetDirectoryPage';
import RolesPage from './RolesPage';
import RostersPage from './RostersPage';
import SchemaPage from './SchemaPage';
import SheetPage from './SheetPage';
import SpecsPage from './SpecsPage';
import WorkForm from './WorkForm';
import WorksPage from './WorksPage';
import './monitoring.css';

const BASE = '/cabinet/monitoring';

type Me = { full_name?: string; roles: string[]; capabilities: { manage: boolean } };

// Все /cabinet/monitoring/* обслуживаются здесь.
export default function MonitoringPage() {
  const location = useLocation();
  const sub = (location.pathname.split('/monitoring')[1] || '/').replace(/\/+$/, '') || '/';
  const { data: me, error } = useApi<Me>('/me');

  const manage = Boolean(me?.capabilities.manage);
  const message = (location.state as { message?: string } | null)?.message;
  const tabs: { path: string; label: string }[] = [{ path: '/', label: 'Работы' }];
  if (manage) tabs.push({ path: '/specs', label: 'Спецификации' }, { path: '/rosters', label: 'Составы групп' }, { path: '/roles', label: 'Роли' }, { path: '/directory', label: 'Кабинеты' });
  const workMatch = sub.match(/^\/works\/(\d+)$/);
  const sheetMatch = sub.match(/^\/works\/(\d+)\/groups\/(\d+)$/);
  const current = sub.startsWith('/works') ? '/' : sub;

  let content;
  if (error) content = <p className="mon-err" role="alert">{error}</p>;
  else if (!me) content = <p className="mon-note">Проверяем доступ…</p>;
  else if (sub === '/directory' && manage) content = <CabinetDirectoryPage />;
  else if (sub === '/roles' && manage) content = <RolesPage />;
  else if (sub === '/rosters' && manage) content = <RostersPage />;
  else if (sub === '/schema' && manage) content = <SchemaPage />;
  else if (sub === '/specs' && manage) content = <SpecsPage />;
  else if (sub === '/works/new' && manage) content = <WorkForm base={BASE} />;
  else if (workMatch && manage) content = <WorkForm key={workMatch[1]} base={BASE} workId={Number(workMatch[1])} />;
  else if (sheetMatch) content = <SheetPage key={sub} base={BASE} workId={Number(sheetMatch[1])} groupId={Number(sheetMatch[2])} />;
  else if (sub === '/') content = <WorksPage manage={manage} base={BASE} message={message} />;
  else content = <p className="mon-note">Страница не найдена</p>;

  return (
    <section className="mon-page">
      <p className="mon-kicker">Мониторинг результатов</p>
      <nav className="mon-nav">
        {tabs.map(t => (
          <Link key={t.path} to={BASE + (t.path === '/' ? '' : t.path)} className={current === t.path ? 'is-current' : undefined}>{t.label}</Link>
        ))}
      </nav>
      {content}
    </section>
  );
}
