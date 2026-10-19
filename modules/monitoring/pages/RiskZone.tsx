import { useState } from 'react';
import type { Risk, Row } from './AnalyticsCharts';

// Блок Б: группы в зоне риска по всем параллелям и ученики выбранной группы.
// Пороги приходят от сервера (RISK в server/lib/calc.cjs).

export type RiskStudent = {
  group_id: number; group: string; parallel: number; full_name: string;
  total: number; max_points: number; percent: number; mark: string | null;
  reasons: { code: string; text: string }[];
};
export type Thresholds = {
  edge_from: number; edge_to: number; basic_below: number;
  group_twos_from: number; group_avg_below: number; group_risk_share: number;
  gentle_three_from: number | null; normal_three_from: number | null;
};

const num = (v: number | null) => (v === null ? '' : v.toLocaleString('ru-RU'));
const shareText = (x: number) => (Math.abs(x - 1 / 3) < 1e-9 ? 'больше трети' : `больше ${Math.round(x * 100)} %`);

export function riskNotes(t: Thresholds) {
  const gentle = t.gentle_three_from !== null && t.normal_three_from !== null ? ` (${t.gentle_three_from}–${t.normal_three_from - 1}\u00a0%)` : '';
  return {
    student: `Ученик в зоне риска, если работа полная и есть хотя бы одна причина: отметка «2»; «3» только благодаря щадящему режиму${gentle}; на грани двойки (${t.edge_from}–${t.edge_to}\u00a0%); базовый уровень хотя бы одного раздела ниже ${t.basic_below}\u00a0%.`,
    group: `Группа в зоне риска, если среди полных работ доля «2» от ${t.group_twos_from}\u00a0%, или средний\u00a0% ниже ${t.group_avg_below}, или в зоне риска ${shareText(t.group_risk_share)} учеников.`,
  };
}

export default function RiskZone({ rows, students, thresholds, error }: { rows: Row[]; students: RiskStudent[] | null; thresholds: Thresholds; error: string }) {
  const groups = rows.filter(r => r.kind === 'group' && r.group_id !== undefined);
  const risky = groups.filter(r => (r.risk as Risk | undefined)?.at_risk);
  const [chosen, setChosen] = useState<number | null>(null);
  const firstWithStudents = groups.find(g => ((g.risk as Risk | undefined)?.students || 0) > 0);
  const groupId = chosen ?? risky[0]?.group_id ?? firstWithStudents?.group_id ?? groups[0]?.group_id ?? null;
  const list = (students || []).filter(s => s.group_id === groupId);
  const chosenRow = groups.find(g => g.group_id === groupId);
  const notes = riskNotes(thresholds);

  function pick(id: number) {
    setChosen(id);
    window.setTimeout(() => document.getElementById('mon-risk-students')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  return (
    <div className="mon-risk">
      <h3 className="mon-viz__section">Зона риска</h3>
      <section className="mon-viz__card mon-risk__card">
        <h4 className="mon-viz__title">Группы в зоне риска: {risky.length} из {groups.length}</h4>
        <p className="mon-viz__note">{notes.group}</p>
        {risky.length ? (
          <div className="mon-an__scroll">
            <table className="mon-table mon-risk__table">
              <thead><tr><th>Параллель</th><th>Группа</th><th className="mon-num">Полных работ</th><th className="mon-num">Доля «2»</th><th className="mon-num">Средний %</th><th className="mon-num">Учеников в зоне риска</th><th>Почему</th></tr></thead>
              <tbody>
                {risky.map(g => {
                  const r = g.risk as Risk;
                  return (
                    <tr key={g.group_id} className={g.group_id === groupId ? 'is-chosen' : undefined}>
                      <td className="mon-num">{g.parallel}</td>
                      <td className="mon-risk__group"><button type="button" className="mon-link" onClick={() => pick(g.group_id!)}>{g.row}</button></td>
                      <td className="mon-num">{g.complete}</td>
                      <td className="mon-num">{r.twos_share === null ? '' : `${num(r.twos_share)} %`}</td>
                      <td className="mon-num">{num(g.avg_percent)}</td>
                      <td className="mon-num">{r.students}</td>
                      <td><span className="mon-risk__reasons">{r.reasons.map(x => <span key={x.code} className={`mon-risk__reason is-${x.code}`}>{x.text}</span>)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="mon-note">Групп в зоне риска нет.</p>}
      </section>

      <section className="mon-viz__card mon-risk__card" id="mon-risk-students">
        <div className="mon-risk__head">
          <h4 className="mon-viz__title">Ученики в зоне риска</h4>
          <label className="mon-field">
            <span className="mon-label">Группа</span>
            <select className="mon-input mon-select" value={groupId ?? ''} onChange={e => setChosen(Number(e.target.value))}>
              {groups.map(g => <option key={g.group_id} value={g.group_id}>{`${g.row}: в зоне риска ${(g.risk as Risk | undefined)?.students || 0}`}</option>)}
            </select>
          </label>
        </div>
        <p className="mon-viz__note">{notes.student}</p>
        {error ? <p className="mon-err" role="alert">{error}</p> : null}
        {!students && !error ? <p className="mon-note">Загружаем список…</p> : null}
        {students && chosenRow ? (
          list.length ? (
            <div className="mon-an__scroll">
              <table className="mon-table mon-risk__table">
                <thead><tr><th>Ученик</th><th className="mon-num">Итог</th><th className="mon-num">%</th><th className="mon-sheet__mark-head">Отметка</th><th>Причина</th></tr></thead>
                <tbody>
                  {list.map((s, i) => (
                    <tr key={`${s.full_name}-${i}`}>
                      <td>{s.full_name}</td>
                      <td className="mon-num">{s.total} из {s.max_points}</td>
                      <td className="mon-num">{s.percent}</td>
                      <td className="mon-sheet__mark">{s.mark ? <span className={`mon-mark mon-mark--${s.mark}`}>{s.mark}</span> : null}</td>
                      <td><span className="mon-risk__reasons">{s.reasons.map(x => <span key={x.code} className={`mon-risk__reason is-${x.code}`}>{x.text}</span>)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="mon-note">В группе {chosenRow.row} учеников в зоне риска нет (полных работ: {chosenRow.complete}).</p>
        ) : null}
      </section>
    </div>
  );
}
