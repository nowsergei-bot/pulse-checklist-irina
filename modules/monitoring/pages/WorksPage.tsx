import { Link, useNavigate } from 'react-router-dom';
import { useApi } from './api';
import { GroupName, STATUS_NAMES, versionLabel } from './labels';

type Group = { id: number; title: string; digital: boolean; progress?: { done: number; total: number }; own_spec?: { title: string; version: number; max_points: number } };
type Work = {
  id: number; title: string; parallel: number; status: 'draft' | 'open' | 'closed'; is_test: boolean; type_name: string;
  spec: string; version: number; max_points: number; parts: { name: string; held_on: string | null }[]; groups: Group[];
};

function date(value: string | null) {
  if (!value) return 'дата не задана';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// «Модуль 1 · тест 14.10.2026»; у работы из двух частей обе даты.
function workLine(w: Work) {
  const parts = w.parts.map(p => `${p.name.toLowerCase()} ${p.held_on ? date(p.held_on) : 'дата не задана'}`);
  return [w.title, ...parts].join(' · ');
}

// Учитель видит свои группы карточками по параллелям; заведующая и data_admin видят таблицу.
function TeacherWorks({ works, base }: { works: Work[]; base: string }) {
  const cards = new Map<string, { parallel: number; group: Group; rows: { work: Work; progress: { done: number; total: number }; own?: Group['own_spec'] }[] }>();
  for (const w of works) {
    for (const g of w.groups) {
      const key = `${w.parallel}:${g.id}`;
      if (!cards.has(key)) cards.set(key, { parallel: w.parallel, group: g, rows: [] });
      cards.get(key)!.rows.push({ work: w, progress: g.progress || { done: 0, total: 0 }, own: g.own_spec });
    }
  }
  const list = [...cards.values()];
  const full = (c: (typeof list)[number]) => c.rows.every(r => r.progress.total > 0 && r.progress.done === r.progress.total);
  const groupCount = new Set(list.map(c => c.group.id)).size;
  const fullCount = new Set(list.filter(full).map(c => c.group.id)).size;
  const parallels = [...new Set(list.map(c => c.parallel))].sort((a, b) => a - b);
  return (
    <div className="mon-tcards">
      <p className="mon-tcards__summary">Ваши группы: {groupCount}. Баллы внесены полностью: {fullCount}</p>
      {parallels.map(par => (
        <section key={par} className="mon-tcards__parallel">
          <h3 className="mon-tcards__title">{par} параллель</h3>
          <div className="mon-tcards__grid">
            {list.filter(c => c.parallel === par)
              .sort((a, b) => Number(a.group.digital) - Number(b.group.digital) || a.group.title.localeCompare(b.group.title, 'ru'))
              .map(c => (
                <article key={`${c.parallel}:${c.group.id}`} className="mon-tcard">
                  <div className="mon-tcard__head"><GroupName group={c.group} /></div>
                  {c.rows.map(({ work: w, progress: p, own }) => {
                    const done = p.total > 0 && p.done === p.total;
                    const editable = w.status === 'open';
                    return (
                      <div key={w.id} className="mon-tcard__work">
                        <div className="mon-tcard__line">
                          <span>{workLine(w)}{own ? <span className="mon-flag" title={`${own.title}, итого ${own.max_points}`}>своя спецификация</span> : null}</span>
                          <span className={`mon-status mon-status--${w.status}`}>{STATUS_NAMES[w.status]}</span>
                        </div>
                        <div className="mon-tcard__progress">
                          {p.total === 0 ? <span className="mon-muted">В группе нет учеников</span>
                            : done ? <span className="mon-tcard__done">Все баллы внесены</span>
                              : <span>внесено {p.done} из {p.total} учеников</span>}
                          <Link className={`mon-btn${editable && !done ? ' mon-btn--primary' : ''}`} to={`${base}/works/${w.id}/groups/${c.group.id}`}>
                            {editable ? 'Внести баллы →' : 'Посмотреть баллы →'}
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </article>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function WorksPage({ manage, base, message }: { manage: boolean; base: string; message?: string }) {
  const { data, error } = useApi<{ view?: 'teacher' | 'table'; works: Work[] }>('/works');
  const navigate = useNavigate();
  const teacherView = data?.view === 'teacher';
  return (
    <div>
      {manage ? (
        <div className="mon-toolbar">
          <span />
          <Link className="mon-btn mon-btn--primary" to={`${base}/works/new`}>+ Новая работа</Link>
        </div>
      ) : null}
      {message ? <p className="mon-note" role="status">{message}</p> : null}
      {data && data.works.length && !teacherView ? <p className="mon-note mon-hint">Чтобы внести или посмотреть баллы, нажмите на группу.</p> : null}
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {!data && !error ? <p className="mon-note">Загружаем…</p> : null}
      {data && !data.works.length ? <p className="mon-note">Работ пока нет</p> : null}
      {data && data.works.length && teacherView ? <TeacherWorks works={data.works} base={base} /> : null}
      {data && data.works.length && !teacherView ? (
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
                <td>
                  {versionLabel({ title: w.spec, version: w.version, max_points: w.max_points })}
                  {w.groups.filter(g => g.own_spec).map(g => (
                    <div key={g.id} className="mon-muted">{g.title}: своя, {versionLabel(g.own_spec!)}</div>
                  ))}
                </td>
                <td>{w.parts.map(p => <div key={p.name}>{p.name}: <span className="mon-muted">{date(p.held_on)}</span></div>)}</td>
                <td>
                  <span className="mon-group-list">
                    {w.groups.map(g => (
                      <Link key={g.id} className="mon-group-link" to={`${base}/works/${w.id}/groups/${g.id}`} onClick={e => e.stopPropagation()} title="Открыть таблицу баллов">
                        <GroupName group={g} />
                      </Link>
                    ))}
                  </span>
                </td>
                <td><span className={`mon-status mon-status--${w.status}`}>{STATUS_NAMES[w.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
