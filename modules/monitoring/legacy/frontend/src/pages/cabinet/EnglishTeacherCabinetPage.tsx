import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { eaActivity } from '../../api/englishAssessment';
import { collectClassOptions, formatHeldOnDmy, formatTeachersLabel, groupMatchesClass } from '../../lib/englishAssessment/analyticsUi';
import { loadEaMe, peekCachedEaMe } from '../../lib/englishAssessment/sharedMe';
import { prefetchCabinetPath } from '../../lib/cabinet/prefetchRoutes';
import { prefetchEaGroupCard } from '../../lib/englishAssessment/sharedResources';
import { useEaPaths } from '../../lib/englishAssessment/paths';
import { useCabinetPreview } from '../../lib/cabinet/preview';
import { useEaLive } from '../../lib/englishAssessment/liveRefresh';
import { seesEaDepartmentAnalytics, type EaAcademicYear, type EaActivityEvent, type EaMe } from '../../lib/englishAssessment/types';
import YearClassGroupBar from '../englishAssessment/YearClassGroupBar';

type GroupRow = EaMe['groups'][number];

function groupByParallel(groups: GroupRow[]) {
  const map = new Map<string, { key: string; label: string; parallel: number | null; groups: GroupRow[] }>();
  for (const g of groups) {
    const parallel = g.parallel == null ? null : Number(g.parallel);
    const key = parallel == null ? 'none' : String(parallel);
    const label = parallel == null ? 'Без параллели' : `${parallel} параллель`;
    const bucket = map.get(key) || { key, label, parallel, groups: [] };
    bucket.groups.push(g);
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => {
    if (a.parallel == null && b.parallel == null) return 0;
    if (a.parallel == null) return 1;
    if (b.parallel == null) return -1;
    return a.parallel - b.parallel;
  });
}

function formatActivityWhen(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function EnglishActivityFeed({ events }: { events: EaActivityEvent[] }) {
  if (!events.length) return null;
  return (
    <section className="pulse-cabinet__notes card glass-surface" aria-label="Действия коллег">
      <div className="pulse-cabinet__dir-head">
        <h2>Действия коллег</h2>
      </div>
      <ul>
        {events.slice(0, 8).map((item, index) => (
          <li key={item.id ?? `${item.created_at}-${index}`}>
            <div>
              <strong>{item.title}</strong>
              {item.body ? <p>{item.body}</p> : null}
              {item.created_at ? <p>{formatActivityWhen(item.created_at)}</p> : null}
            </div>
            {item.href ? (
              <Link to={item.href} className="pulse-cabinet__go">
                Открыть
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

const GROUPS_FILTER_KEY = 'ea-cabinet-groups-filter';

function readStoredGroupsFilter(): { classKey?: string; groupId?: string } {
  try {
    const raw = sessionStorage.getItem(GROUPS_FILTER_KEY);
    return raw ? (JSON.parse(raw) as { classKey?: string; groupId?: string }) : {};
  } catch {
    return {};
  }
}

function groupScoreLink(
  hrefFn: (suffix?: string) => string,
  groupId: number,
  latest?: GroupRow['latest_result'],
) {
  const base = hrefFn(`/groups/${groupId}`);
  const qIndex = base.indexOf('?');
  const path = qIndex >= 0 ? base.slice(0, qIndex) : base;
  const q = new URLSearchParams(qIndex >= 0 ? base.slice(qIndex + 1) : '');
  if (latest?.held_on) q.set('date', latest.held_on);
  if (latest?.mode === 'section') {
    q.set('mode', 'section');
    if (latest.section_code) q.set('section', latest.section_code);
  } else if (latest) {
    q.set('mode', 'placement');
  }
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

export default function EnglishTeacherCabinetPage() {
  const { href } = useEaPaths();
  const preview = useCabinetPreview();
  const [params, setParams] = useSearchParams();
  const stored = readStoredGroupsFilter();
  const [data, setData] = useState<EaMe | null>(() => peekCachedEaMe());
  const [error, setError] = useState<string | null>(null);
  const [yearId, setYearId] = useState('');
  const [classKey, setClassKey] = useState(() => params.get('class') || stored.classKey || 'all');
  const [groupId, setGroupId] = useState(() => params.get('group') || stored.groupId || '');
  const [activity, setActivity] = useState<EaActivityEvent[]>(() => peekCachedEaMe()?.activity || []);
  const loadSeq = useRef(0);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (classKey && classKey !== 'all') next.set('class', classKey);
    else next.delete('class');
    if (groupId) next.set('group', groupId);
    else next.delete('group');
    const same = next.toString() === params.toString();
    if (!same) setParams(next, { replace: true });
    try {
      sessionStorage.setItem(GROUPS_FILTER_KEY, JSON.stringify({ classKey, groupId }));
    } catch {
      /* ignore */
    }
  }, [classKey, groupId]);

  useEffect(() => {
    const seq = ++loadSeq.current;
    const cached = peekCachedEaMe(yearId || undefined);
    if (cached) {
      setData(cached);
    } else {
      setData((prev) => {
        if (!prev || !yearId) return prev;
        if (prev.year?.id != null && String(prev.year.id) === String(yearId)) return prev;
        return { ...prev, groups: [] };
      });
    }
    void loadEaMe(yearId || undefined)
      .then((next) => {
        if (seq !== loadSeq.current) return;
        setData(next);
      })
      .catch((e) => {
        if (seq !== loadSeq.current) return;
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [preview.isPreview, preview.previewStaffId, preview.previewEmail, yearId]);

  useEffect(() => {
    if (!data?.capabilities?.audit) {
      setActivity([]);
      return;
    }
    let cancelled = false;
    void eaActivity()
      .then((events) => {
        if (!cancelled) setActivity(events);
      })
      .catch(() => {
        if (!cancelled) setActivity([]);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.capabilities?.audit, preview.isPreview, preview.previewStaffId, preview.previewEmail]);

  useEaLive((detail) => {
    if (detail.kind === 'roster') {
      setData((prev) =>
        prev
          ? {
              ...prev,
              groups: prev.groups.map((g) =>
                g.id === detail.groupId ? { ...g, student_count: detail.students.length } : g,
              ),
            }
          : prev,
      );
    }
    const seq = loadSeq.current;
    void loadEaMe(yearId || undefined, true)
      .then((next) => {
        if (seq !== loadSeq.current) return;
        setData(next);
      })
      .catch(() => {});
  });

  const classOptions = useMemo(() => collectClassOptions(data?.groups || []), [data]);
  const scopedGroups = useMemo(
    () => (data?.groups || []).filter((g) => groupMatchesClass(g, classKey)),
    [data, classKey],
  );
  const visibleGroups = useMemo(
    () => (groupId ? scopedGroups.filter((g) => String(g.id) === groupId) : scopedGroups),
    [scopedGroups, groupId],
  );
  const parallels = useMemo(() => groupByParallel(visibleGroups), [visibleGroups]);

  if (error) return <p className="ea-err">{error}</p>;
  if (!data) {
    return (
      <div aria-busy="true">
        <header className="ea-analytics-head">
          <h2 className="ea-card-title">Группы</h2>
          <p className="ea-freshness">Список групп ещё загружается</p>
        </header>
        <div className="ea-skel ea-skel--bar" />
        <div className="ea-group-tiles">
          <div className="ea-group-tile ea-skel ea-skel--tile" />
          <div className="ea-group-tile ea-skel ea-skel--tile" />
          <div className="ea-group-tile ea-skel ea-skel--tile" />
          <div className="ea-group-tile ea-skel ea-skel--tile" />
        </div>
      </div>
    );
  }

  const viewAll = seesEaDepartmentAnalytics(data.capabilities) || Boolean(data.capabilities?.scoreAll);
  const hasTeacher = Boolean(data.teacher);
  const students = visibleGroups.reduce((n, g) => n + (g.student_count || 0), 0);
  const feed = activity.length ? activity : data.activity || [];

  if (!hasTeacher && !viewAll) {
    return (
      <div className="ea-warn">
        <p>Раздел открыт преподавателям кафедры английского языка.</p>
        <p className="ea-note">Если вы ведёте группы, напишите администратору — привяжем карточку к входу.</p>
        <Link className="btn" to={preview.path('')}>
          В кабинет
        </Link>
      </div>
    );
  }

  if (!hasTeacher && viewAll && !visibleGroups.length && !data.groups.length) {
    return (
      <div>
        <EnglishActivityFeed events={feed} />
        <p className="ea-kicker">Обзор кафедры</p>
        <h2 className="ea-card-title">Группы кафедры</h2>
        <p className="ea-note">Свод и графики — во вкладке «Аналитика».</p>
        <div className="ea-actions">
          <Link className="btn primary" to={href('/leader')}>
            Открыть аналитику
          </Link>
        </div>
      </div>
    );
  }

  const years: EaAcademicYear[] = data.years?.length ? data.years : data.year ? [data.year] : [];
  const activeYearId = yearId || (data.year?.id != null ? String(data.year.id) : '');

  return (
    <div>
      <EnglishActivityFeed events={feed} />
      <header className="ea-analytics-head">
        <h2 className="ea-card-title">{data.teacher?.full_name || 'Все группы кафедры'}</h2>
        <p className="ea-freshness">
          {data.year?.label || 'Учебный год'} · {visibleGroups.length} групп · {students} уч.
        </p>
      </header>

      <YearClassGroupBar
        years={years}
        yearId={activeYearId}
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
      />

      {parallels.length ? (
        <div className="ea-parallel-stack">
          {parallels.map((block) => (
            <section key={block.key} className="ea-parallel-block">
              <header className="ea-parallel-block__head">
                <h3>{block.label}</h3>
                <span className="ea-note">
                  {block.groups.length}{' '}
                  {block.groups.length === 1 ? 'группа' : block.groups.length < 5 ? 'группы' : 'групп'}
                </span>
              </header>
              <div className="ea-group-tiles">
                {block.groups.map((g) => {
                  const latest = g.latest_result;
                  return (
                    <Link
                      key={g.id}
                      className="ea-group-tile"
                      to={groupScoreLink(href, g.id, latest)}
                      onMouseEnter={() => {
                        prefetchCabinetPath(href(`/groups/${g.id}`));
                        prefetchEaGroupCard(g.id);
                      }}
                      onFocus={() => {
                        prefetchCabinetPath(href(`/groups/${g.id}`));
                        prefetchEaGroupCard(g.id);
                      }}
                    >
                      <span className="ea-group-tile__title">{g.title}</span>
                      <span className="ea-group-tile__meta">
                        {g.campus === 'digital' ? 'ЦГ · ' : ''}
                        {g.student_count} уч.
                      </span>
                      <span className="ea-group-tile__teacher">{formatTeachersLabel(g.teachers, g.teacher_label)}</span>
                      {latest?.held_on ? (
                        <span className="ea-group-tile__result">
                          <strong>{formatHeldOnDmy(latest.held_on)}</strong>
                          {' · '}
                          {latest.label}
                          {' · '}
                          выставлено {latest.complete}
                          {latest.absent ? ` · Н ${latest.absent}` : ''}
                        </span>
                      ) : (
                        <span className="ea-group-tile__result">Баллов ещё нет</span>
                      )}
                      <span className="ea-group-tile__cta">
                        {latest?.held_on ? 'Открыть результаты →' : 'Ввести баллы →'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="ea-note">Группы на этот год ещё не назначены.</p>
      )}
    </div>
  );
}
