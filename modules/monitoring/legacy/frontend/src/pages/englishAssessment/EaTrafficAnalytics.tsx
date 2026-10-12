import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCount, formatPct, formatTeachersLabel, studentScoreDisplay, zoneBadgeClass, zoneLabel } from '../../lib/englishAssessment/analyticsUi';
import { useEaPaths } from '../../lib/englishAssessment/paths';
import type { EaDashboard, EaDashboardStudent, EaTaskStat, EaTrafficZone } from '../../lib/englishAssessment/types';

type Scope = 'groups' | 'parallels';

function ZoneLegend() {
  const items: { zone: EaTrafficZone; text: string }[] = [
    { zone: 'green', text: '≥85% высокий' },
    { zone: 'yellow', text: '75–85% средний' },
    { zone: 'red', text: '60–75% ниже среднего' },
    { zone: 'risk', text: '<60% зона риска' },
  ];
  return (
    <ul className="ea-zone-legend" aria-label="Светофор результатов">
      {items.map((it) => (
        <li key={it.zone}>
          <span className={zoneBadgeClass(it.zone)}>{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

function ZoneStrip({
  counts,
}: {
  counts?: { green: number; yellow: number; red: number; risk: number; empty?: number } | null;
}) {
  if (!counts) return null;
  const total = counts.green + counts.yellow + counts.red + counts.risk + (counts.empty || 0);
  if (!total) return <p className="ea-note">Пока нет оценок для светофора.</p>;
  return (
    <div className="ea-zone-strip" role="list">
      {(
        [
          ['green', counts.green],
          ['yellow', counts.yellow],
          ['red', counts.red],
          ['risk', counts.risk],
        ] as const
      ).map(([zone, n]) => (
        <div key={zone} className={`ea-zone-strip__cell ea-zone-strip__cell--${zone}`} role="listitem">
          <strong>{formatCount(n)}</strong>
          <span>{zoneLabel(zone)}</span>
        </div>
      ))}
    </div>
  );
}

function StudentRankTable({
  students,
  placeKey,
  showGroup,
}: {
  students: EaDashboardStudent[];
  placeKey: 'place' | 'place_in_group' | 'place_in_parallel';
  showGroup?: boolean;
}) {
  const { href } = useEaPaths();
  if (!students.length) return <p className="ea-note">Нет учащихся с баллами в этом срезе.</p>;
  return (
    <div className="ea-heat-wrap">
      <table className="ea-table ea-heat-table ea-card-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Учащийся</th>
            {showGroup ? <th>Группа</th> : null}
            <th>Учитель</th>
            <th>Баллы</th>
            <th>Оценка</th>
            <th>Зона</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const place = s[placeKey] ?? s.place;
            const shown = studentScoreDisplay(s);
            return (
              <tr key={`${s.group_id}-${s.student_id}`} className={s.zone ? `ea-row-zone--${s.zone}` : undefined}>
                <td data-label="#">{place != null ? place : '—'}</td>
                <td data-label="Учащийся">
                  <Link to={href(`/students/${s.student_id}`)}>{s.full_name}</Link>
                </td>
                {showGroup ? <td data-label="Группа">{s.group_title}</td> : null}
                <td data-label="Учитель">{formatTeachersLabel(s.teachers, s.teacher_label)}</td>
                <td data-label="Баллы">
                  <span className={zoneBadgeClass(s.zone, shown.percent)}>{shown.slash}</span>
                </td>
                <td data-label="Оценка">
                  <span className="ea-grade">{shown.grade}</span>
                </td>
                <td data-label="Зона">{zoneLabel(s.zone)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SectionMatrixTable({
  rows,
}: {
  rows: {
    key: string;
    title: string;
    mean: number | null;
    zone?: EaTrafficZone | null;
    sections: { code: string; title?: string; title_en?: string; mean?: number | null; zone?: EaTrafficZone | null }[];
  }[];
}) {
  const sectionCodes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      for (const s of row.sections || []) {
        if (!seen.has(s.code)) seen.set(s.code, s.title_en || s.title || s.code);
      }
    }
    return [...seen.entries()];
  }, [rows]);

  if (!rows.length) return <p className="ea-note">Нет данных по разделам.</p>;

  return (
    <div className="ea-heat-wrap">
      <table className="ea-table ea-heat-table ea-card-table">
        <thead>
          <tr>
            <th>Срез</th>
            <th>Среднее</th>
            {sectionCodes.map(([code, label]) => (
              <th key={code}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const byCode = new Map((row.sections || []).map((s) => [s.code, s]));
            return (
              <tr key={row.key} className={row.zone ? `ea-row-zone--${row.zone}` : undefined}>
                <td data-label="Срез">{row.title}</td>
                <td data-label="Среднее">
                  <span className={zoneBadgeClass(row.zone, row.mean)}>{formatPct(row.mean)}</span>
                </td>
                {sectionCodes.map(([code]) => {
                  const s = byCode.get(code);
                  return (
                    <td key={code} data-label={code}>
                      <span className={zoneBadgeClass(s?.zone, s?.mean ?? null)}>{formatPct(s?.mean ?? null)}</span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TaskExtremes({ highest, lowest, title }: { highest: EaTaskStat[]; lowest: EaTaskStat[]; title: string }) {
  if (!highest.length && !lowest.length) {
    return (
      <article className="ea-chart-card">
        <h3 className="ea-chart-card__title">{title}</h3>
        <p className="ea-note">Задания появятся после входного теста или разделов с баллами.</p>
      </article>
    );
  }
  return (
    <article className="ea-chart-card">
      <h3 className="ea-chart-card__title">{title}</h3>
      <div className="ea-analytics-split">
        <div>
          <p className="ea-kicker">Самый высокий %</p>
          <ul className="ea-task-extremes">
            {highest.map((t) => (
              <li key={`h-${t.field_id}-${t.group_id ?? ''}-${t.parallel ?? ''}`}>
                <span className={zoneBadgeClass(t.zone, t.mean)}>{formatPct(t.mean)}</span>
                <span>
                  {t.label}
                  {t.section ? <span className="ea-note"> · {t.section}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="ea-kicker">Самый низкий %</p>
          <ul className="ea-task-extremes">
            {lowest.map((t) => (
              <li key={`l-${t.field_id}-${t.group_id ?? ''}-${t.parallel ?? ''}`}>
                <span className={zoneBadgeClass(t.zone, t.mean)}>{formatPct(t.mean)}</span>
                <span>
                  {t.label}
                  {t.section ? <span className="ea-note"> · {t.section}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

/** Рейтинг учащихся + светофор разделов/заданий для учителя и заведующей. */
export default function EaTrafficAnalytics({
  dash,
  groupFilterId,
  parallelFilter,
  allowedGroupIds,
}: {
  dash: EaDashboard | null;
  groupFilterId?: string;
  parallelFilter?: string | number | null;
  allowedGroupIds?: Array<string | number> | null;
}) {
  const [scope, setScope] = useState<Scope>('groups');
  const [showEmpty, setShowEmpty] = useState(false);
  const ranking = dash?.ranking;
  const matrix = dash?.section_matrix;
  const tasks = dash?.tasks;
  const allowed = useMemo(() => {
    if (!allowedGroupIds?.length) return null;
    return new Set(allowedGroupIds.map(String));
  }, [allowedGroupIds]);

  /** Backend may omit nested ranking.students on large slices; rebuild from flat dash.students. */
  const flatStudents = useMemo(() => {
    let list = dash?.students || [];
    if (allowed) list = list.filter((s) => allowed.has(String(s.group_id)));
    return list;
  }, [dash?.students, allowed]);

  const groupBlocks = useMemo(() => {
    let list = ranking?.by_group || [];
    if (allowed) list = list.filter((g) => allowed.has(String(g.group_id)));
    if (groupFilterId) list = list.filter((g) => String(g.group_id) === String(groupFilterId));
    if (parallelFilter != null && String(parallelFilter) !== '' && String(parallelFilter) !== 'all') {
      list = list.filter((g) => Number(g.parallel) === Number(parallelFilter));
    }
    const needHydrate = list.some((g) => !(g.students || []).length) && flatStudents.length > 0;
    if (!needHydrate) return list;
    return list.map((g) => {
      if ((g.students || []).length) return g;
      const students = flatStudents
        .filter((s) => Number(s.group_id) === Number(g.group_id))
        .sort((a, b) => (a.place_in_group ?? a.place ?? 9999) - (b.place_in_group ?? b.place ?? 9999));
      return { ...g, students };
    });
  }, [ranking, groupFilterId, parallelFilter, allowed, flatStudents]);

  const parallelBlocks = useMemo(() => {
    let list = ranking?.by_parallel || [];
    if (allowed) {
      const allowedParallels = new Set(
        (ranking?.by_group || [])
          .filter((g) => allowed.has(String(g.group_id)))
          .map((g) => (g.parallel == null ? 'null' : String(g.parallel))),
      );
      list = list
        .map((p) => ({
          ...p,
          students: p.students.filter((s) => allowed.has(String(s.group_id))),
        }))
        .filter((p) => allowedParallels.has(p.parallel == null ? 'null' : String(p.parallel)) && (p.students.length || flatStudents.length));
    }
    if (parallelFilter != null && String(parallelFilter) !== '' && String(parallelFilter) !== 'all') {
      list = list.filter((p) => Number(p.parallel) === Number(parallelFilter));
    }
    if (groupFilterId) {
      const allowedKeys = new Set(
        (ranking?.by_group || [])
          .filter((g) => String(g.group_id) === String(groupFilterId))
          .map((g) => (g.parallel == null ? 'null' : String(g.parallel))),
      );
      list = list.filter((p) => allowedKeys.has(p.parallel == null ? 'null' : String(p.parallel)));
    }
    const needHydrate = list.some((p) => !(p.students || []).length) && flatStudents.length > 0;
    if (!needHydrate) return list;
    return list.map((p) => {
      if ((p.students || []).length) return p;
      const students = flatStudents
        .filter((s) =>
          p.parallel == null ? s.parallel == null : Number(s.parallel) === Number(p.parallel),
        )
        .sort((a, b) => (a.place_in_parallel ?? a.place ?? 9999) - (b.place_in_parallel ?? b.place ?? 9999));
      return { ...p, students };
    });
  }, [ranking, groupFilterId, parallelFilter, allowed, flatStudents]);

  const sectionRows = useMemo(() => {
    if (scope === 'parallels') {
      let list = matrix?.by_parallel || [];
      if (parallelFilter != null && String(parallelFilter) !== '' && String(parallelFilter) !== 'all') {
        list = list.filter((p) => Number(p.parallel) === Number(parallelFilter));
      }
      if (allowed) {
        const allowedParallels = new Set(
          (matrix?.by_group || [])
            .filter((g) => allowed.has(String(g.group_id)))
            .map((g) => (g.parallel == null ? 'null' : String(g.parallel))),
        );
        list = list.filter((p) => allowedParallels.has(p.parallel == null ? 'null' : String(p.parallel)));
      }
      return list.map((p) => ({
        key: `p-${p.parallel ?? 'x'}`,
        title: p.parallel != null ? `${p.parallel} параллель` : 'Без параллели',
        mean: p.mean,
        zone: p.zone,
        sections: p.sections || [],
      }));
    }
    let list = matrix?.by_group || [];
    if (allowed) list = list.filter((g) => allowed.has(String(g.group_id)));
    if (groupFilterId) list = list.filter((g) => String(g.group_id) === String(groupFilterId));
    if (parallelFilter != null && String(parallelFilter) !== '' && String(parallelFilter) !== 'all') {
      list = list.filter((g) => Number(g.parallel) === Number(parallelFilter));
    }
    return list.map((g) => ({
      key: `g-${g.group_id}`,
      title: g.group_title,
      mean: g.mean,
      zone: g.zone,
      sections: g.sections || [],
    }));
  }, [matrix, scope, groupFilterId, parallelFilter, allowed]);

  const scopedTasks = useMemo(() => {
    if (groupFilterId) {
      const hit = (tasks?.by_group || []).find((g) => String((g as { group_id?: number }).group_id) === String(groupFilterId));
      if (hit) {
        return {
          highest: hit.highest || [],
          lowest: hit.lowest || [],
          title: `Задания · ${(hit as { group_title?: string }).group_title || 'группа'}`,
        };
      }
    }
    if (parallelFilter != null && String(parallelFilter) !== '' && String(parallelFilter) !== 'all') {
      const hit = (tasks?.by_parallel || []).find((p) => Number(p.parallel) === Number(parallelFilter));
      if (hit) {
        return {
          highest: hit.highest || [],
          lowest: hit.lowest || [],
          title: `Задания · ${parallelFilter} параллель`,
        };
      }
    }
    return {
      highest: tasks?.highest || [],
      lowest: tasks?.lowest || [],
      title: tasks?.source === 'sections' ? 'Разделы (макс / мин %)' : 'Задания (макс / мин %)',
    };
  }, [tasks, groupFilterId, parallelFilter]);

  if (!dash) return null;

  return (
    <section className="ea-traffic" aria-label="Рейтинг и светофор">
      <header className="ea-traffic__head">
        <h3>Рейтинг учащихся и зоны риска</h3>
        <ZoneLegend />
      </header>
      <ZoneStrip counts={ranking?.zone_counts} />

      <div className="ea-tabs" role="tablist">
        <button type="button" className={`ea-tab${scope === 'groups' ? ' is-active' : ''}`} onClick={() => setScope('groups')}>
          По группам
        </button>
        <button
          type="button"
          className={`ea-tab${scope === 'parallels' ? ' is-active' : ''}`}
          onClick={() => setScope('parallels')}
        >
          По параллелям
        </button>
      </div>

      {scope === 'groups'
        ? (() => {
            const scored = groupBlocks.filter((g) => (g.students || []).some((s) => s.mean != null) || (g.zone_counts.green + g.zone_counts.yellow + g.zone_counts.red + g.zone_counts.risk) > 0);
            const empty = groupBlocks.filter((g) => !scored.includes(g));
            const visible = showEmpty ? groupBlocks : scored;
            return (
              <>
                {empty.length ? (
                  <p className="ea-note">
                    Без баллов: {empty.length} групп.{' '}
                    <button type="button" className="ea-linkish" onClick={() => setShowEmpty((v) => !v)}>
                      {showEmpty ? 'Скрыть пустые' : 'Показать пустые'}
                    </button>
                  </p>
                ) : null}
                {visible.map((g) => (
            <article key={g.group_id} className="ea-chart-card ea-traffic-block">
              <h4 className="ea-chart-card__title">
                {g.group_title}
                {g.parallel != null ? <span className="ea-note"> · {g.parallel} кл.</span> : null}
              </h4>
              <p className="ea-note">{formatTeachersLabel(undefined, (g as { teacher_label?: string }).teacher_label)}</p>
              <ZoneStrip counts={g.zone_counts} />
              {g.students?.length ? (
                <StudentRankTable students={g.students} placeKey="place_in_group" />
              ) : (
                <p className="ea-note">Рейтинг учащихся откроется после выбора группы или списка учащихся.</p>
              )}
            </article>
                ))}
              </>
            );
          })()
        : parallelBlocks.map((p) => (
            <article key={`p-${p.parallel ?? 'x'}`} className="ea-chart-card ea-traffic-block">
              <h4 className="ea-chart-card__title">{p.parallel != null ? `${p.parallel} параллель` : 'Без параллели'}</h4>
              <ZoneStrip counts={p.zone_counts} />
              {p.students?.length ? (
                <StudentRankTable students={p.students} placeKey="place_in_parallel" showGroup />
              ) : (
                <p className="ea-note">Рейтинг по параллели — после выбора среза или списка учащихся.</p>
              )}
            </article>
          ))}

      {!groupBlocks.length && scope === 'groups' ? <p className="ea-note">Нет групп в выбранном срезе.</p> : null}
      {!parallelBlocks.length && scope === 'parallels' ? <p className="ea-note">Нет параллелей в выбранном срезе.</p> : null}

      <article className="ea-chart-card">
        <h3 className="ea-chart-card__title">Разделы · светофор</h3>
        <p className="ea-note">Listening, Reading и др. — средний % по срезу</p>
        <SectionMatrixTable rows={sectionRows} />
      </article>

      <TaskExtremes highest={scopedTasks.highest} lowest={scopedTasks.lowest} title={scopedTasks.title} />
    </section>
  );
}
