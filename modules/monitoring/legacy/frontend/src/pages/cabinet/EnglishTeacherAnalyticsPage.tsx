import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { eaDashboard } from '../../api/englishAssessment';
import {
  attentionGroups,
  buildTakeaway,
  collectClassOptions,
  formatCount,
  formatDeltaPp,
  formatHeldOn,
  formatHeldOnLong,
  formatPct,
  formatTeachersLabel,
  groupCompletenessLabel,
  groupMatchesClass,
  latestHeldOn,
  schoolGradeFromPercent,
  formatSchoolGrade,
  trendDeltaPp,
  zoneBadgeClass,
} from '../../lib/englishAssessment/analyticsUi';
import { useEaPaths } from '../../lib/englishAssessment/paths';
import { useCabinetPreview } from '../../lib/cabinet/preview';
import { useEaLive } from '../../lib/englishAssessment/liveRefresh';
import { loadEaMe, peekCachedEaMe } from '../../lib/englishAssessment/sharedMe';
import { seesEaDepartmentAnalytics, type EaAcademicYear, type EaDashboard, type EaMe } from '../../lib/englishAssessment/types';
import YearClassGroupBar from '../englishAssessment/YearClassGroupBar';
import EaTrafficAnalytics from '../englishAssessment/EaTrafficAnalytics';
import { EaAnalyticsExportButtons } from '../englishAssessment/EaAnalyticsExport';
import { useCabinetLoadOverlay } from '../../hooks/useCabinetLoadOverlay';
import CabinetLoadProgress from '../../components/CabinetLoadProgress';

const TeacherOwnCharts = lazy(() =>
  import('../englishAssessment/EnglishAssessmentCharts').then((m) => ({ default: m.TeacherOwnCharts })),
);

/** Аналитика своих групп (для преподавателя без view_all). Заведующие идут на /leader. */
export default function EnglishTeacherAnalyticsPage() {
  const { href } = useEaPaths();
  const preview = useCabinetPreview();
  const [me, setMe] = useState<EaMe | null>(() => peekCachedEaMe());
  const [dash, setDash] = useState<EaDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearId, setYearId] = useState('');
  const [classKey, setClassKey] = useState('all');
  const [groupId, setGroupId] = useState('');
  const [liveTick, setLiveTick] = useState(0);
  const loadSeq = useRef(0);
  useEaLive(() => setLiveTick((n) => n + 1));
  const pageLoading = !error && (!me || (Boolean(me.teacher) && !seesEaDepartmentAnalytics(me.capabilities) && !dash));
  useCabinetLoadOverlay({
    active: pageLoading,
    kind: 'english',
    label: 'Загрузка аналитики английского…',
  });

  useEffect(() => {
    setDash(null);
  }, [yearId]);

  useEffect(() => {
    const seq = ++loadSeq.current;
    const year = yearId || undefined;
    const cached = peekCachedEaMe(year);
    if (cached) setMe(cached);
    const meP = loadEaMe(year);
    const dashP =
      cached?.teacher && !seesEaDepartmentAnalytics(cached.capabilities)
        ? eaDashboard(year ? { year_id: year } : undefined)
        : meP.then((data) => {
            if (seesEaDepartmentAnalytics(data.capabilities) || !data.teacher) return null;
            return eaDashboard(year ? { year_id: year } : undefined);
          });
    void Promise.all([meP, dashP])
      .then(([data, dash]) => {
        if (seq !== loadSeq.current) return;
        setMe(data);
        if (dash) setDash(dash);
      })
      .catch((e) => {
        if (seq !== loadSeq.current) return;
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [preview.isPreview, preview.previewStaffId, preview.previewEmail, yearId, liveTick]);

  const classOptions = useMemo(() => collectClassOptions(dash?.groups || me?.groups || []), [dash, me]);
  const scopedGroups = useMemo(
    () => (dash?.groups || []).filter((g) => groupMatchesClass(g, classKey)),
    [dash, classKey],
  );
  const visibleGroups = useMemo(
    () => (groupId ? scopedGroups.filter((g) => String(g.id) === groupId) : scopedGroups),
    [scopedGroups, groupId],
  );
  const attention = useMemo(() => attentionGroups(visibleGroups), [visibleGroups]);
  const delta = trendDeltaPp(dash?.trends);
  const asOf = latestHeldOn(dash?.trends);
  const years: EaAcademicYear[] = me?.years?.length ? me.years : me?.year ? [me.year] : [];
  const trendChart = useMemo(
    () =>
      (dash?.trends || []).map((t) => ({
        date: t.held_on || '',
        label: formatHeldOn(t.held_on),
        mean: t.mean ?? null,
        counted: t.counted,
      })),
    [dash],
  );
  const groupChart = useMemo(
    () =>
      visibleGroups
        .filter((g) => g.mean != null)
        .map((g) => ({ name: g.title, mean: Number(g.mean), counted: g.counted || 0 })),
    [visibleGroups],
  );
  const sectionChart = useMemo(
    () =>
      (dash?.sections || [])
        .filter((s) => s.mean != null && (s.counted || 0) > 0)
        .map((s) => ({ name: s.title_en || s.title || s.code, mean: Number(s.mean), counted: s.counted || 0 })),
    [dash],
  );
  const parallelChart = useMemo(() => {
    const allowed = new Set(visibleGroups.map((g) => g.parallel));
    return (dash?.parallels || [])
      .filter((p) => p.mean != null && (classKey === 'all' || allowed.has(p.parallel)))
      .map((p) => ({
        name: p.parallel == null ? '—' : String(p.parallel),
        mean: Number(p.mean),
        counted: p.counted || 0,
      }));
  }, [dash, visibleGroups, classKey]);
  const workTypeChart = useMemo(
    () =>
      (dash?.work_types || [])
        .filter((w) => w.mean != null && (w.counted || 0) > 0)
        .map((w) => ({ name: w.title || w.code, mean: Number(w.mean), counted: w.counted || 0 })),
    [dash],
  );
  const distributionChart = useMemo(
    () => (dash?.distribution || []).map((d) => ({ name: d.label || d.key, count: d.count || 0 })),
    [dash],
  );
  const levelChart = useMemo(
    () =>
      (dash?.levels || []).map((l) => ({
        name: l.level_label || l.level_code,
        mean: Number(l.mean || 0),
        counted: l.counted || 0,
        groups: l.group_count || 0,
      })),
    [dash],
  );
  const completenessChart = useMemo(
    () =>
      visibleGroups.map((g) => {
        const roster = Number(g.student_count || 0);
        const filled = Number(g.counted || 0);
        const pct = roster > 0 ? Math.min(100, (filled / roster) * 100) : filled > 0 ? 100 : 0;
        return { name: g.title, filled, roster, pct };
      }),
    [visibleGroups],
  );
  const sessionChart = useMemo(
    () =>
      (dash?.sessions || [])
        .filter((s) => s.mean != null)
        .slice(0, 12)
        .map((s) => ({
          name: `${formatHeldOn(s.held_on)} · ${(s.section_title || s.section_code || '').slice(0, 12)}`,
          mean: Number(s.mean),
          counted: s.counted || 0,
        })),
    [dash],
  );
  const activeGroup = visibleGroups.find((g) => String(g.id) === groupId);
  const takeaway = dash
    ? buildTakeaway({
        mean: dash.summary.mean,
        counted: dash.summary.counted,
        completePct: dash.completeness?.complete_pct,
        groupsWithScores: dash.completeness?.groups_with_scores,
        groupsTotal: dash.completeness?.groups_total,
        attentionCount: attention.length,
        yearLabel: dash.year?.label || me?.year?.label,
        classLabel: classKey === 'all' ? null : classOptions.find((c) => c.key === classKey)?.label,
        groupTitle: activeGroup?.title,
      })
    : '';

  if (error) return <p className="ea-err">{error}</p>;
  if (!me) {
    return (
      <div className="ea-leader">
        <CabinetLoadProgress label="Загрузка аналитики английского…" />
        <div className="ea-skel ea-skel--bar" />
        <div className="ea-kpi-grid" aria-hidden="true">
          <div className="ea-stat ea-skel ea-skel--kpi" />
          <div className="ea-stat ea-skel ea-skel--kpi" />
          <div className="ea-stat ea-skel ea-skel--kpi" />
          <div className="ea-stat ea-skel ea-skel--kpi" />
        </div>
        <div className="ea-skel ea-skel--chart" />
      </div>
    );
  }
  if (seesEaDepartmentAnalytics(me.capabilities)) {
    return <Navigate to={href('/leader')} replace />;
  }

  return (
    <div className="ea-leader">
      {!dash ? <CabinetLoadProgress label="Загрузка сводки по группам…" /> : null}
      <header className="ea-analytics-head">
        <p className="ea-freshness">
          {asOf ? `Данные на ${formatHeldOnLong(asOf)}` : me.year?.label || 'Учебный год'}
        </p>
        <p className="ea-takeaway">{takeaway || 'Сводка по вашим группам.'}</p>
      </header>

      <YearClassGroupBar
        years={years}
        yearId={yearId || (me.year?.id != null ? String(me.year.id) : '')}
        onYear={(id) => {
          setYearId(id);
          setClassKey('all');
          setGroupId('');
        }}
        classOptions={classOptions}
        classKey={classKey}
        onClass={(key) => {
          setClassKey(key);
          setGroupId('');
        }}
        groups={scopedGroups}
        groupId={groupId}
        onGroup={setGroupId}
        onReset={() => {
          setClassKey('all');
          setGroupId('');
        }}
        extra={
          <EaAnalyticsExportButtons
            dash={dash}
            allowedGroupIds={visibleGroups.map((g) => g.id)}
            scopeLabel={classKey === 'all' ? 'ваши группы' : classOptions.find((c) => c.key === classKey)?.label || 'срез'}
          />
        }
      />

      <div className="ea-kpi-grid">
        <div className="ea-stat">
          <span className="ea-kicker">Средний результат</span>
          <strong>{formatPct(dash?.summary.mean)}</strong>
          <span className="ea-note">{formatDeltaPp(delta)}</span>
        </div>
        <div className="ea-stat">
          <span className="ea-kicker">Заполненность отметок</span>
          <strong>{formatPct(dash?.completeness?.complete_pct)}</strong>
          <span className="ea-note">
            {dash?.completeness
              ? `${formatCount(dash.completeness.complete)} из ${formatCount(dash.completeness.total)} отметок · ${formatCount(dash.completeness.groups_with_scores)} из ${formatCount(dash.completeness.groups_total)} групп`
              : '—'}
          </span>
        </div>
        <div className="ea-stat">
          <span className="ea-kicker">Учащихся оценено</span>
          <strong>{formatCount(dash?.summary.students_scored ?? dash?.summary.counted)}</strong>
          <span className="ea-note">{formatCount(dash?.summary.counted)} оценок</span>
        </div>
        <div className="ea-stat">
          <span className="ea-kicker">Требуют внимания</span>
          <strong>{formatCount(attention.length)}</strong>
          <span className="ea-note">ваши группы ниже 50%</span>
        </div>
      </div>

      <Suspense fallback={<div className="ea-skel ea-skel--chart" aria-hidden="true" />}>
        <TeacherOwnCharts
          trendChart={trendChart}
          groupChart={groupChart}
          sectionChart={sectionChart}
          parallelChart={parallelChart}
          workTypeChart={workTypeChart}
          distributionChart={distributionChart}
          levelChart={levelChart}
          completenessChart={completenessChart}
          sessionChart={sessionChart}
        />
      </Suspense>

      <EaTrafficAnalytics
        dash={dash}
        groupFilterId={groupId}
        parallelFilter={classKey.startsWith('p:') ? classKey.slice(2) : null}
        allowedGroupIds={scopedGroups.map((g) => g.id)}
      />

      {attention.length ? (
        <article className="ea-attention" style={{ marginTop: '0.85rem', minHeight: 0 }}>
          <h3 className="ea-chart-card__title">Требуют внимания</h3>
          <ul className="ea-attention__list">
            {attention.map((g) => (
              <li key={g.id}>
                <Link to={href(`/groups/${g.id}`)}>{g.title}</Link>
                <span className="ea-badge ea-badge--low">{formatPct(g.mean)}</span>
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      <h3>Ваши группы</h3>
      {visibleGroups.length ? (
        <div className="ea-heat-wrap">
          <table className="ea-table ea-heat-table ea-card-table">
            <thead>
              <tr>
                <th>Группа</th>
                <th>Учитель</th>
                <th>Класс</th>
                <th>Среднее</th>
                <th>Оценка</th>
                <th>Полнота</th>
                <th>Уч.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((g) => (
                <tr key={g.id}>
                  <td data-label="Группа">{g.title}</td>
                  <td data-label="Учитель">{formatTeachersLabel(g.teachers, g.teacher_label)}</td>
                  <td data-label="Класс">{g.class_label || (g.parallel != null ? String(g.parallel) : '—')}</td>
                  <td data-label="Среднее">
                    <span className={zoneBadgeClass(g.zone, g.mean)}>{formatPct(g.mean)}</span>
                  </td>
                  <td data-label="Оценка">
                    <span className="ea-grade">{formatSchoolGrade(schoolGradeFromPercent(g.mean))}</span>
                  </td>
                  <td data-label="Полнота">{groupCompletenessLabel(g)}</td>
                  <td data-label="Учащихся">{g.student_count ?? '—'}</td>
                  <td data-label="">
                    <Link className="btn" to={href(`/groups/${g.id}`)}>
                      Открыть группу
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ea-note">Пока нет выставленных баллов — сводка появится после первых работ.</p>
      )}
    </div>
  );
}
