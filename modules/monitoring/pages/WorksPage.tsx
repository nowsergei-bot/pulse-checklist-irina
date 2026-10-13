import { Link, useNavigate } from 'react-router-dom';
import { useApi } from './api';

type Group = { id: number; title: string; digital: boolean };
type Work = {
  id: number; title: string; parallel: number; status: 'draft' | 'open' | 'closed'; is_test: boolean; type_name: string;
  spec: string; version: number; max_points: number; parts: { name: string; held_on: string | null }[]; groups: Group[];
};

export const STATUS_NAMES: Record<string, string> = { draft: 'Черновик', open: 'Открыта', closed: 'Закрыта' };

export function GroupName({ group }: { group: Group }) {
  return <span className="mon-group-name">{group.title}<span className={`mon-gtype${group.digital ? ' mon-gtype--digital' : ''}`}>{group.digital ? 'ЦГ' : 'Основной'}</span></span>;
}

function date(value: string | null) {
  if (!value) return 'дата не задана';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export default function WorksPage({ manage, base, message }: { manage: boolean; base: string; message?: string }) {
  const { data, error } = useApi<{ works: Work[] }>('/works');
  const navigate = useNavigate();
  return (
    <div>
      {manage ? (
        <div className="mon-toolbar">
          <span />
          <Link className="mon-btn mon-btn--primary" to={`${base}/works/new`}>+ Новая работа</Link>
        </div>
      ) : null}
      {message ? <p className="mon-note" role="status">{message}</p> : null}
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {!data && !error ? <p className="mon-note">Загружаем…</p> : null}
      {data && !data.works.length ? <p className="mon-note">Работ пока нет</p> : null}
      {data && data.works.length ? (
        <table className="mon-table mon-works">
          <thead><tr><th>Работа</th><th className="mon-num">Параллель</th><th>Спецификация</th><th>Части</th><th>Группы</th><th>Статус</th></tr></thead>
          <tbody>
            {data.works.map(w => (
              <tr key={w.id} className={manage ? 'mon-clickable' : undefined} onClick={manage ? () => navigate(`${base}/works/${w.id}`) : undefined}>
                <td>
                  <span className="mon-person">{w.title}</span>
                  {w.is_test ? <span className="mon-flag">тестовая</span> : null}
                  <div className="mon-muted">{w.type_name}</div>
                </td>
                <td className="mon-num">{w.parallel}</td>
                <td>{w.spec}<div className="mon-muted">версия {w.version}, итого {w.max_points}</div></td>
                <td>{w.parts.map(p => <div key={p.name}>{p.name}: <span className="mon-muted">{date(p.held_on)}</span></div>)}</td>
                <td><span className="mon-group-list">{w.groups.map(g => <GroupName key={g.id} group={g} />)}</span></td>
                <td><span className={`mon-status mon-status--${w.status}`}>{STATUS_NAMES[w.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
