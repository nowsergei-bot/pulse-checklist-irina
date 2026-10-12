import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { eaStudentCard } from '../../api/englishAssessment';
import { useEaPaths } from '../../lib/englishAssessment/paths';
import { formatBirthDate, formatHeldOn, scoreZone, zoneBadgeClass } from '../../lib/englishAssessment/analyticsUi';
import { maskFullName } from '../../lib/englishAssessment/parseWorkbook';
import type { EaStudentCard } from '../../lib/englishAssessment/types';

const StudentDynamicsCharts = lazy(() => import('./StudentDynamicsCharts'));

export default function EnglishAssessmentStudentPage() {
  const { href } = useEaPaths();
  const { id } = useParams();
  const [data, setData] = useState<EaStudentCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mask, setMask] = useState(false);

  useEffect(() => {
    if (!id) return;
    void eaStudentCard(id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (error) return <p className="ea-err">{error}</p>;
  if (!data) {
    return (
      <div aria-busy="true">
        <p className="ea-kicker">Карточка учащегося</p>
        <h2 className="ea-card-title ea-skel ea-skel--title">&nbsp;</h2>
        <div className="ea-skel ea-skel--chart" />
      </div>
    );
  }

  const s = data.student;
  const name = mask ? maskFullName(s.full_name) : s.full_name;

  return (
    <div>
      <p className="ea-kicker">
        <Link to={href()}>Группы</Link>
        {' · '}
        карточка учащегося
      </p>
      <h2 className="ea-card-title">{name}</h2>
      <label className="ea-note">
        <input type="checkbox" checked={mask} onChange={(e) => setMask(e.target.checked)} /> Скрыть ФИО на экране
      </label>
      <div className="ea-grid" style={{ margin: '1rem 0' }}>
        <div className="ea-stat">
          <span className="ea-kicker">Класс</span>
          <strong>{s.class?.code_display || '—'}</strong>
          <span className="ea-note">{s.class?.parallel ? `${s.class.parallel} параллель` : ''}</span>
        </div>
        {s.campus === 'digital' ? (
          <div className="ea-stat">
            <span className="ea-kicker">Кампус</span>
            <strong>ЦГ</strong>
          </div>
        ) : null}
        <div className="ea-stat">
          <span className="ea-kicker">Дата рождения</span>
          <strong>{formatBirthDate(s.birth_date)}</strong>
        </div>
      </div>
      <details className="ea-note" style={{ marginBottom: '1rem' }}>
        <summary>Дополнительные сведения</summary>
        <p>
          Постоянный ID: <span className="ea-mono">{s.public_id}</span>
        </p>
      </details>
      <h3>Группы английского</h3>
      {data.groups.length ? (
        <table className="ea-table">
          <thead>
            <tr>
              <th>Группа</th>
              <th>Параллель</th>
              <th>Преподаватели</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.map((g) => (
              <tr key={g.id}>
                <td>
                  <Link to={href(`/groups/${g.id}`)}>{g.title}</Link>
                  {g.campus === 'digital' ? <span className="ea-note"> · ЦГ</span> : null}
                </td>
                <td>{g.parallel || '—'}</td>
                <td>
                  {g.teachers.map((t) => (
                    <Link key={t.id} to={href(`/teachers/${t.id}`)} className="ea-chip">
                      {mask ? maskFullName(t.full_name) : t.full_name}
                    </Link>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="ea-note">Группа ещё не назначена.</p>
      )}

      <h3>Динамика</h3>
      <Suspense fallback={<div className="ea-skel ea-skel--chart" aria-hidden="true" />}>
        <StudentDynamicsCharts history={data.history || []} />
      </Suspense>

      <h3>История результатов</h3>
      {data.history?.length ? (
        <table className="ea-table ea-heat-table ea-card-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Раздел</th>
              <th>Группа</th>
              <th>Балл</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((row, i) => (
              <tr key={`${row.held_on}-${row.section_code}-${i}`} className={row.percent != null && scoreZone(row.percent) ? `ea-row-zone--${scoreZone(row.percent)}` : undefined}>
                <td>{formatHeldOn(row.held_on)}</td>
                <td>{row.section_title || row.section_code || '—'}</td>
                <td>{row.group_title || '—'}</td>
                <td>
                  {row.status === 'absent' ? 'Н' : row.status === 'incomplete' ? '—' : row.score}
                </td>
                <td>
                  {row.percent == null ? (
                    <span className="ea-badge ea-badge--empty">—</span>
                  ) : (
                    <span className={zoneBadgeClass(undefined, row.percent)}>
                      {row.percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="ea-note">
          Работы появятся после ввода баллов по разделам. Идентификатор сохраняется при смене группы. Speaking в
          мониторинг не входит.
        </p>
      )}
    </div>
  );
}
