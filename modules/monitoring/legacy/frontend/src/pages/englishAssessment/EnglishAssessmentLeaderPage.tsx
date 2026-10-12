import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { eaLeaderDashboard } from '../../api/englishAssessment';
import { studentsFromAnalyticsDash } from '../../lib/englishAssessment/analyticsExport';
import {
  attentionGroups,
  buildTakeaway,
  classKeyToLeaderFilters,
  classOptionKey,
  collectClassOptions,
  formatCount,
  formatDeltaPp,
  formatHeldOn,
  formatHeldOnLong,
  formatPct,
  formatTeachersLabel,
  groupCompletenessLabel,
  groupMatchesClass,
  isAttentionGroup,
  isEmptyGroup,
  latestHeldOn,
  sessionDeltaPp,
  trendDeltaPp,
  zoneBadgeClass,
  formatSchoolGrade,
  schoolGradeFromPercent,
  studentScoreDisplay,
} from '../../lib/englishAssessment/analyticsUi';
import { useEaPaths } from '../../lib/englishAssessment/paths';
import { useEaLive } from '../../lib/englishAssessment/liveRefresh';
import { useCabinetPreview } from '../../lib/cabinet/preview';
import { loadEaMe, peekCachedEaMe } from '../../lib/englishAssessment/sharedMe';
import type { EaAcademicYear, EaDashboard, EaDashboardGroup, EaMe } from '../../lib/englishAssessment/types';
import YearClassGroupBar from './YearClassGroupBar';
import EaTrafficAnalytics from './EaTrafficAnalytics';
import { EaAnalyticsExportButtons } from './EaAnalyticsExport';
import type { ExtraTab } from './EnglishAssessmentCharts';

const EnglishAssessmentCharts = lazy(() => import('./EnglishAssessmentCharts'));

type TableFilter = 'all' | 'data' | 'empty' | 'attention';

type DrillState = {
  year: string;
  classKey: string;
  parallel: string;
  level: string;
  group: string;
  bucket: string;
  students: boolean;
};

function readDrill(params: URLSearchParams): DrillState {
  return {
    year: params.get('year') || '',
    classKey: params.get('class') || 'all',
    parallel: params.get('parallel') || 'all',
    level: params.get('level') || 'all',
    group: params.get('group') || '',
    bucket: params.get('bucket') || '',
    students: params.get('students') === '1',
  };
}

function meanBadge(n: number | null | undefined) {
  return zoneBadgeClass(undefined, n);
}

export default function EnglishAssessmentLeaderPage() {
  const { href } = useEaPaths();
  const preview = useCabinetPreview();
  const [params, setParams] = useSearchParams();
  const drill = readDrill(params);
  const [data, setData] = useState<EaDashboard | null>(null);
  const [me, setMe] = useState<EaMe | null>(() => peekCachedEaMe(drill.year || undefined));
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const [mask, setMask] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const [studentPage, setStudentPage] = useState(0);
  const [extraTab, setExtraTab] = useState<ExtraTab>('cefr');
  const [tableFilter, setTableFilter] = useState<TableFilter>('all');
  const [showSections, setShowSections] = useState(false);
  const [sortKey, setSortKey] = useState<'mean' | 'counted' | 'students' | 'delta'>('mean');
  const [liveTick, setLiveTick] = useState(0);
  const TABLE_PAGE = 20;

  function setDrill(patch: Partial<DrillState>, replace = false) {
    const next = { ...drill, ...patch };
    const q = new URLSearchParams();
    if (next.year) q.set('year', next.year);
    if (next.classKey !== 'all') q.set('class', next.classKey);
    if (next.parallel !== 'all') q.set('parallel', next.parallel);
    if (next.level !== 'all') q.set('level', next.level);
    if (next.group) q.set('group', next.group);
    if (next.bucket) q.set('bucket', next.bucket);
    if (next.students || next.group || next.bucket) q.set('students', '1');
    const previewQ = new URLSearchParams(window.location.search);
    const staff = previewQ.get('staff');
    const email = previewQ.get('email');
    if (staff) q.set('staff', staff);
    else if (email) q.set('email', email);
    setParams(q, { replace });
  }

  useEffect(() => {
    setData(null);
  }, [drill.year, drill.classKey, drill.parallel, drill.level, drill.group, drill.bucket]);

  useEaLive(() => setLiveTick((n) => n + 1));

  useEffect(() => {
    const seq = ++loadSeq.current;
    const year = drill.year || undefined;
    const cached = peekCachedEaMe(year);
    if (cached) setMe(cached);
    setError(null);
    void loadEaMe(year)
      .then((next) => {
        if (seq !== loadSeq.current) return;
        setMe(next);
      })
      .catch(() => {
        /* keep previous me — a failed year switch must not blank the page */
      });
    const classFilters = classKeyToLeaderFilters(drill.classKey);
    void eaLeaderDashboard({
      year_id: drill.year || null,
      parallel: classFilters.parallel || drill.parallel,
      class_id: classFilters.class_id || null,
      level: drill.level,
      group_id: drill.group || null,
      bucket: drill.bucket || null,
      students: Boolean(drill.students || drill.group || drill.bucket),
    })
      .then((dash) => {
        if (seq !== loadSeq.current) return;
        setData(dash);
        setError(null);
      })
      .catch((e) => {
        if (seq !== loadSeq.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        /* Keep prior KPIs when students=1 fails (gateway timeout / oversized body). */
      });
  }, [
    drill.year,
    drill.classKey,
    drill.parallel,
    drill.level,
    drill.group,
    drill.bucket,
    drill.students,
    liveTick,
    preview.isPreview,
    preview.previewStaffId,
    preview.previewEmail,
  ]);

  const allGroups = data?.groups || [];
  const classOptions = useMemo(() => collectClassOptions(allGroups), [allGroups]);

  const scopedGroups = useMemo(
    () => allGroups.filter((g) => groupMatchesClass(g, drill.classKey)),
    [allGroups, drill.classKey],
  );

  const groups = useMemo(() => {
    return scopedGroups.filter((g) => {
      if (tableFilter === 'data') return !isEmptyGroup(g);
      if (tableFilter === 'empty') return isEmptyGroup(g);
      if (tableFilter === 'attention') return isAttentionGroup(g);
      return true;
    });
  }, [scopedGroups, tableFilter]);

  const sortedGroups = useMemo(() => {
    const copy = [...groups];
    copy.sort((a, b) => {
      if (sortKey === 'students') return (b.student_count || 0) - (a.student_count || 0);
      if (sortKey === 'counted') return (b.counted || 0) - (a.counted || 0);
      if (sortKey === 'delta') {
        const da = sessionDeltaPp(data?.sessions, a.id);
        const db = sessionDeltaPp(data?.sessions, b.id);
        return (db ?? -999) - (da ?? -999);
      }
      return (b.mean ?? -1) - (a.mean ?? -1);
    });
    return copy;
  }, [groups, sortKey, data?.sessions]);

  useEffect(() => {
    setTablePage(0);
    setStudentPage(0);
  }, [drill.classKey, drill.parallel, drill.level, drill.group, drill.bucket, drill.students, tableFilter, sortKey]);

  const pagedGroups = sortedGroups.slice(tablePage * TABLE_PAGE, tablePage * TABLE_PAGE + TABLE_PAGE);
  const tablePages = Math.max(1, Math.ceil(sortedGroups.length / TABLE_PAGE));

  const myGroups = me?.groups || [];
  const myGroupIds = new Set(myGroups.map((g) => Number(g.id)));
  const students = data?.students || [];
  const pagedStudents = students.slice(studentPage * TABLE_PAGE, studentPage * TABLE_PAGE + TABLE_PAGE);
  const studentPages = Math.max(1, Math.ceil(students.length / TABLE_PAGE));
  const showStudents = Boolean(drill.students || drill.group || drill.bucket);
  const years: EaAcademicYear[] = me?.years?.length ? me.years : data?.year ? [data.year] : [];
  const yearId = drill.year || (data?.year?.id != null ? String(data.year.id) : years[0] ? String(years[0].id) : '');

  const attention = useMemo(() => attentionGroups(scopedGroups), [scopedGroups]);
  const emptyCount = scopedGroups.filter(isEmptyGroup).length;
  const delta = trendDeltaPp(data?.trends);
  const asOf = latestHeldOn(data?.trends);
  const activeGroup = scopedGroups.find((g) => String(g.id) === drill.group) || null;
  const classLabel = classOptions.find((c) => c.key === drill.classKey)?.label;

  const takeaway = data
    ? buildTakeaway({
        mean: data.summary.mean,
        counted: data.summary.counted,
        completePct: data.completeness?.complete_pct,
        groupsWithScores: data.completeness?.groups_with_scores,
        groupsTotal: data.completeness?.groups_total,
        attentionCount: attention.length,
        emptyCount,
        yearLabel: data.year?.label,
        classLabel: drill.classKey === 'all' ? null : classLabel,
        groupTitle: activeGroup?.title,
      })
    : '';

  const trendChart = useMemo(
    () =>
      (data?.trends || []).map((t) => ({
        date: t.held_on || '',
        label: formatHeldOn(t.held_on),
        mean: t.mean ?? null,
        counted: t.counted,
      })),
    [data],
  );

  const parallelChart = useMemo(
    () =>
      [...(data?.parallels || [])]
        .filter((p) => p.parallel != null)
        .sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0))
        .map((p) => ({
          name: String(p.parallel),
          parallel: String(p.parallel),
          mean: p.mean ?? 0,
          counted: p.counted,
          groups: p.group_count ?? 0,
        })),
    [data],
  );

  const sectionChart = useMemo(
    () =>
      (data?.sections || [])
        .filter((s) => s.counted > 0)
        .map((s) => ({
          code: s.code,
          name: s.title,
          mean: s.mean ?? 0,
          counted: s.counted,
        })),
    [data],
  );

  const levelChart = useMemo(
    () =>
      (data?.levels || [])
        .filter((l) => l.level_code !== 'unspecified')
        .map((l) => ({
          code: l.level_code,
          name: l.level_label,
          mean: l.mean ?? 0,
          counted: l.counted,
          groups: l.group_count,
        })),
    [data],
  );

  const workTypeChart = useMemo(
    () =>
      (data?.work_types || [])
        .filter((w) => w.counted > 0)
        .map((w) => ({
          name: w.title,
          mean: w.mean ?? 0,
          counted: w.counted,
        })),
    [data],
  );

  const distributionChart = useMemo(
    () =>
      (data?.distribution || []).map((d) => ({
        key: d.key,
        name: d.label,
        count: d.count,
      })),
    [data],
  );

  const completeness = data?.completeness;
  const completePct = completeness?.complete_pct ?? 0;

  if (error && !data) {
    return (
      <div className="ea-warn">
        <p className="ea-err">{error}</p>
        <Link className="btn" to={href()}>
          К своим группам
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="ea-leader">
        <div className="ea-skel ea-skel--bar" />
        <div className="ea-kpi-grid">
          <div className="ea-stat ea-skel ea-skel--kpi" />
          <div className="ea-stat ea-skel ea-skel--kpi" />
          <div className="ea-stat ea-skel ea-skel--kpi" />
          <div className="ea-stat ea-skel ea-skel--kpi" />
        </div>
        <div className="ea-skel ea-skel--chart" />
      </div>
    );
  }

  return (
    <div className="ea-leader">
      {error ? (
        <div className="ea-warn">
          <p className="ea-err">{error}</p>
          <p className="ea-note">
            Сводка на экране сохранена. Список учащихся не загрузился — сузьте параллель/группу или обновите страницу.
          </p>
        </div>
      ) : null}
      <header className="ea-analytics-head">
        <p className="ea-freshness">
          {asOf ? `Данные на ${formatHeldOnLong(asOf)}` : data.year?.label || 'Учебный год'}
          {completeness ? ` · ${formatCount(completeness.groups_with_scores)} из ${formatCount(completeness.groups_total)} групп с баллами` : ''}
        </p>
        <p className="ea-takeaway">{takeaway}</p>
      </header>

      <YearClassGroupBar
        years={years}
        yearId={yearId}
        onYear={(id) => setDrill({ year: id, group: '', students: false, bucket: '' })}
        classOptions={classOptions}
        classKey={drill.classKey}
        onClass={(key) => {
          setDrill({
            classKey: key,
            group: '',
            students: false,
            bucket: '',
          });
        }}
        groups={scopedGroups}
        groupId={drill.group}
        onGroup={(id) => setDrill({ group: id, students: Boolean(id), bucket: '' })}
        onReset={() =>
          setDrill({
            year: years.find((y) => y.is_current)?.id ? String(years.find((y) => y.is_current)!.id) : yearId,
            classKey: 'all',
            parallel: 'all',
            level: 'all',
            group: '',
            bucket: '',
            students: false,
          })
        }
        extra={
          <>
            <button type="button" className="btn" onClick={() => setDrill({ students: true })}>
              Учащиеся среза
            </button>
            <EaAnalyticsExportButtons
              dash={data}
              allowedGroupIds={scopedGroups.map((g) => g.id)}
              scopeLabel={
                drill.classKey === 'all'
                  ? 'кафедра'
                  : classOptions.find((c) => c.key === drill.classKey)?.label || 'срез'
              }
              loadStudents={async () => {
                const classFilters = classKeyToLeaderFilters(drill.classKey);
                const next = await eaLeaderDashboard({
                  year_id: yearId || null,
                  parallel: classFilters.parallel || drill.parallel,
                  class_id: classFilters.class_id || null,
                  group_id: drill.group || null,
                  students: true,
                });
                return studentsFromAnalyticsDash(
                  next,
                  scopedGroups.map((g) => g.id),
                );
              }}
            />
          </>
        }
      />

      <div className="ea-kpi-grid">
        <div className="ea-stat">
          <span className="ea-kicker">Средний результат</span>
          <strong>{formatPct(data.summary.mean)}</strong>
          <span className="ea-note">{formatDeltaPp(delta)}</span>
          <span className="ea-note">Медиана {formatPct(data.summary.median)}</span>
        </div>
        <div className="ea-stat">
          <span className="ea-kicker">Заполненность отметок</span>
          <strong>{formatPct(completeness?.complete_pct)}</strong>
          <div className="ea-progress" aria-hidden="true">
            <span className="ea-progress__ok" style={{ width: `${Math.min(100, completePct)}%` }} />
          </div>
          <span className="ea-note">
            {completeness
              ? `${formatCount(completeness.complete)} полных из ${formatCount(completeness.total)} отметок`
              : '—'}
          </span>
        </div>
        <div className="ea-stat">
          <span className="ea-kicker">Учащихся оценено</span>
          <strong>{formatCount(data.summary.students_scored ?? data.summary.counted)}</strong>
          <span className="ea-note">
            {formatCount(data.summary.counted)} оценок · {formatCount(completeness?.groups_with_scores)} из{' '}
            {formatCount(completeness?.groups_total)} групп с баллами
          </span>
        </div>
        <button
          type="button"
          className={`ea-stat ea-stat--btn${attention.length ? ' ea-stat--alert' : ''}`}
          onClick={() => setTableFilter('attention')}
        >
          <span className="ea-kicker">Требуют внимания</span>
          <strong>{formatCount(attention.length)}</strong>
          <span className="ea-note">группы ниже 50%</span>
        </button>
      </div>

      {!showStudents ? (
        <Suspense
          fallback={
            <div aria-hidden="true">
              <div className="ea-skel ea-skel--chart" />
              <div className="ea-skel ea-skel--chart" />
            </div>
          }
        >
          <EnglishAssessmentCharts
            trendChart={trendChart}
            parallelChart={parallelChart}
            sectionChart={sectionChart}
            levelChart={levelChart}
            workTypeChart={workTypeChart}
            distributionChart={distributionChart}
            attention={attention}
            emptyCount={emptyCount}
            extraTab={extraTab}
            onExtraTab={setExtraTab}
            onDrill={setDrill}
            onEmptyFilter={() => setTableFilter('empty')}
          />
        </Suspense>
      ) : null}

      <EaTrafficAnalytics
        dash={data}
        groupFilterId={drill.group || undefined}
        parallelFilter={drill.parallel !== 'all' ? drill.parallel : drill.classKey.startsWith('p:') ? drill.classKey.slice(2) : null}
      />

      <section className="ea-table-block">
        <div className="ea-table-head">
          <h3>{showStudents ? 'Учащиеся среза' : 'Группы'}</h3>
          {!showStudents ? (
            <div className="ea-tabs ea-tabs--compact" role="tablist" aria-label="Фильтр групп">
              {(
                [
                  ['all', 'Все'],
                  ['data', 'Есть данные'],
                  ['empty', 'Нет данных'],
                  ['attention', 'Требуют внимания'],
                ] as [TableFilter, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`ea-tab${tableFilter === id ? ' is-current' : ''}`}
                  onClick={() => setTableFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {showStudents ? (
          <>
            <label className="ea-note">
              <input type="checkbox" checked={mask} onChange={(e) => setMask(e.target.checked)} /> Скрыть ФИО на экране
            </label>
            {activeGroup ? (
              <p className="ea-actions">
                <Link className="btn primary" to={href(`/groups/${activeGroup.id}`)}>
                  Открыть группу
                </Link>
              </p>
            ) : null}
            {students.length ? (
              <div className="ea-heat-wrap">
                <table className="ea-table ea-heat-table ea-card-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Учащийся</th>
                      <th>Группа</th>
                      <th>Учитель</th>
                      <th>Класс</th>
                      <th>Ур.</th>
                      <th>Баллы</th>
                      <th>Оценка</th>
                      {data.sections.map((s) => (
                        <th key={s.code}>{s.title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStudents.map((s) => {
                      const shown = studentScoreDisplay(s);
                      return (
                      <tr key={`${s.group_id}-${s.student_id}`} className={s.zone ? `ea-row-zone--${s.zone}` : undefined}>
                        <td data-label="#">{s.place ?? s.place_in_parallel ?? s.place_in_group ?? '—'}</td>
                        <td data-label="Учащийся">
                          <Link to={href(`/students/${s.student_id}`)}>
                            {mask ? `ID ${String(s.public_id || s.student_id).slice(0, 8)}` : s.full_name}
                          </Link>
                        </td>
                        <td data-label="Группа">
                          <button type="button" className="ea-linkish" onClick={() => setDrill({ group: String(s.group_id), students: true })}>
                            {s.group_title}
                          </button>
                        </td>
                        <td data-label="Учитель">{formatTeachersLabel(s.teachers, s.teacher_label)}</td>
                        <td data-label="Класс">{s.parallel ?? '—'}</td>
                        <td data-label="Уровень">{s.level_code === 'unspecified' ? '—' : s.level_code}</td>
                        <td data-label="Баллы">
                          <span className={meanBadge(s.mean)}>{shown.slash}</span>
                        </td>
                        <td data-label="Оценка">
                          <span className="ea-grade">{shown.grade}</span>
                        </td>
                        {s.sections.map((sec) => (
                          <td key={sec.code} data-label={data.sections.find((x) => x.code === sec.code)?.title || sec.code}>
                            {sec.percent == null ? (
                              sec.status === 'absent' ? (
                                'Н'
                              ) : (
                                '—'
                              )
                            ) : (
                              <span className={meanBadge(sec.percent)}>{formatPct(sec.percent)}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {students.length > TABLE_PAGE ? (
                  <p className="ea-note ea-pager">
                    <button type="button" className="btn" disabled={studentPage <= 0} onClick={() => setStudentPage((p) => p - 1)}>
                      Назад
                    </button>{' '}
                    {studentPage + 1} / {studentPages}{' '}
                    <button
                      type="button"
                      className="btn"
                      disabled={studentPage >= studentPages - 1}
                      onClick={() => setStudentPage((p) => p + 1)}
                    >
                      Дальше
                    </button>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="ea-note">В этом срезе нет учащихся или нет баллов в выбранном интервале.</p>
            )}
          </>
        ) : (
          <>
            <div className="ea-table-tools">
              <label>
                Сортировка
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
                  <option value="mean">По результату</option>
                  <option value="delta">По динамике</option>
                  <option value="counted">По полноте</option>
                  <option value="students">По числу учащихся</option>
                </select>
              </label>
              <label className="ea-note">
                <input type="checkbox" checked={showSections} onChange={(e) => setShowSections(e.target.checked)} /> Разделы
              </label>
            </div>
            <div className="ea-heat-wrap">
              <table className="ea-table ea-heat-table ea-card-table">
                <thead>
                  <tr>
                    <th>Группа</th>
                    <th>Учитель</th>
                    <th>Класс</th>
                    <th>Ур.</th>
                    <th>Среднее</th>
                    <th>Оценка</th>
                    <th>Полнота</th>
                    <th>Динамика</th>
                    <th>Уч.</th>
                    {showSections
                      ? data.sections.map((s) => (
                          <th key={s.code}>{s.title}</th>
                        ))
                      : null}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedGroups.map((g) => (
                    <GroupRow
                      key={g.id}
                      g={g}
                      showSections={showSections}
                      mine={myGroupIds.has(Number(g.id))}
                      delta={sessionDeltaPp(data.sessions, g.id)}
                      href={href}
                      onOpen={() => setDrill({ group: String(g.id), students: true, bucket: '', classKey: classOptionKey(g) })}
                    />
                  ))}
                </tbody>
              </table>
              {sortedGroups.length > TABLE_PAGE ? (
                <p className="ea-note ea-pager">
                  <button type="button" className="btn" disabled={tablePage <= 0} onClick={() => setTablePage((p) => p - 1)}>
                    Назад
                  </button>{' '}
                  {tablePage + 1} / {tablePages}{' '}
                  <button
                    type="button"
                    className="btn"
                    disabled={tablePage >= tablePages - 1}
                    onClick={() => setTablePage((p) => p + 1)}
                  >
                    Дальше
                  </button>
                </p>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function GroupRow({
  g,
  showSections,
  mine,
  delta,
  href,
  onOpen,
}: {
  g: EaDashboardGroup;
  showSections: boolean;
  mine: boolean;
  delta: number | null;
  href: (suffix?: string) => string;
  onOpen: () => void;
}) {
  return (
    <tr>
      <td data-label="Группа">
        <button type="button" className="ea-linkish" onClick={onOpen}>
          {g.title}
        </button>
      </td>
      <td data-label="Учитель">{formatTeachersLabel(g.teachers, g.teacher_label)}</td>
      <td data-label="Класс">{g.class_label || (g.parallel != null ? String(g.parallel) : '—')}</td>
      <td data-label="Уровень">{g.level_code && g.level_code !== 'unspecified' ? g.level_code : '—'}</td>
      <td data-label="Среднее">
        <span className={meanBadge(g.mean)}>{formatPct(g.mean)}</span>
      </td>
      <td data-label="Оценка">
        <span className="ea-grade">{formatSchoolGrade(schoolGradeFromPercent(g.mean))}</span>
      </td>
      <td data-label="Полнота">{groupCompletenessLabel(g)}</td>
      <td data-label="Динамика">{delta == null ? '—' : formatDeltaPp(delta).replace(' к прошлому срезу', '')}</td>
      <td data-label="Учащихся">{g.student_count ?? '—'}</td>
      {showSections
        ? g.sections.map((s) => (
            <td key={s.code} data-label={s.title}>
              {s.counted ? formatPct(s.mean) : '—'}
            </td>
          ))
        : null}
      <td data-label="">
        <Link className="btn" to={href(`/groups/${g.id}`)} title="Открыть группу" aria-label="Открыть группу">
          {mine ? 'Баллы' : 'Открыть группу'}
        </Link>
      </td>
    </tr>
  );
}
