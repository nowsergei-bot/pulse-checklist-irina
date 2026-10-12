import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { eaTeacherCard } from '../../api/englishAssessment';
import { useEaPaths } from '../../lib/englishAssessment/paths';
import { maskFullName } from '../../lib/englishAssessment/parseWorkbook';
import type { EaTeacherCard } from '../../lib/englishAssessment/types';

export default function EnglishAssessmentTeacherPage() {
  const { href } = useEaPaths();
  const { id } = useParams();
  const [data, setData] = useState<EaTeacherCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mask, setMask] = useState(false);

  useEffect(() => {
    if (!id) return;
    void eaTeacherCard(id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (error) return <p className="ea-err">{error}</p>;
  if (!data) {
    return (
      <div aria-busy="true">
        <h2 className="ea-card-title ea-skel ea-skel--title">&nbsp;</h2>
        <div className="ea-skel ea-skel--chart" />
      </div>
    );
  }

  const t = data.teacher;
  const name = mask ? maskFullName(t.full_name) : t.full_name;

  return (
    <div>
      <h2 className="ea-card-title">{name}</h2>
      {t.native_name ? <p className="ea-note">Носитель языка: {t.native_name}</p> : null}
      <label className="ea-note">
        <input type="checkbox" checked={mask} onChange={(e) => setMask(e.target.checked)} /> Скрыть ФИО на экране
      </label>
      <div className="ea-grid" style={{ margin: '1rem 0' }}>
        <div className="ea-stat">
          <span className="ea-kicker">Группы</span>
          <strong>{data.groups.length}</strong>
        </div>
        <div className="ea-stat">
          <span className="ea-kicker">Учащиеся</span>
          <strong>{data.groups.reduce((n, g) => n + (g.student_count || 0), 0)}</strong>
        </div>
      </div>
      <table className="ea-table">
        <thead>
          <tr>
            <th>Группа</th>
            <th>Параллель</th>
            <th>Учащихся</th>
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
              <td>{g.student_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
