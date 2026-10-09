import VisitChecklistV3Dashboard from '../visitChecklistV3/VisitChecklistV3Dashboard';
import VisitChecklistReportDashboard from '../../components/VisitChecklistReportDashboard';
import '../../styles/lessonAnalytics.css';
import { lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getLessonVisitProject, getVisitChecklistDashboard, getVisitChecklistDashboardTeacher, listLessonVisitResponses, patchVisitChecklistDashboardTeacher, postVisitChecklistDashboardRebuild, postVisitChecklistDashboardSchoolAi, postVisitChecklistDashboardTeacherAi } from '../../api/visitChecklist';
import { type VisitChecklistDashCard, type VisitChecklistDashPayload, type VisitChecklistDashTeacherListItem, type VisitChecklistPrepareProgress, type VisitChecklistSchoolAi, type VisitChecklistSchoolAiReport } from '../../api/visitChecklist';
import defaultSeed from '../../lib/lessonVisitChecklist/defaultSeed.json';
import type {
  LessonVisitChecklistConfig,
  LessonVisitDirectory,
  LessonVisitResponseRow,
} from '../../lib/lessonVisitChecklist/types';
import StaffAvatar from '../../components/StaffAvatar';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatPrepareWaitCopy } from '../../lib/cabinetWaitEta';
import { safePdfFileBase } from '../../lib/lessonAnalytics/safePdfFileBase';
import { staffPortraitUrl } from '../../lib/staffPhoto/portraitUrl';
import { isKnownVisitTeacher, resolveFullTeacherName } from '../../lib/lessonVisitChecklist/visitChecklistPeople';
import {
  buildMethodistInsights,
  buildTeacherCardInsights,
} from '../../lib/lessonVisitChecklist/visitChecklistCardInsights';
import { VCD_PDF_HIDE_CLASS, downloadVisitChecklistPdf } from '../../lib/lessonVisitChecklist/visitChecklistCloudPdf';
import {
  barFillColor,
  cardSendLabel,
  cardWorkflowLabel,
  countVisitKinds,
  displayTeacherTitle,
  formatVisitChecklistDate,
  humanizeVisitChecklistCloudError,
  isNarrativeLocked,
  isSelfAnalysisFormat,
  narrativeOriginLabel,
  AI_NARRATIVE_PROVIDER_LABEL,
  AI_UNAVAILABLE_WITH_SOURCE_DATA,
  NO_TEACHER_CHECKLISTS_MESSAGE,
  SELECT_TEACHER_MESSAGE,
  schoolAiFromKpis,
  teacherGreetingName,
  scorePct,
  scorePctLabel,
  trafficColor,
  trafficTone,
  visitCountLabel,
} from '../../lib/lessonVisitChecklist/visitChecklistCloudUi';
import { aggregateObserveVsSelf, buildCompareResult, type CompareMode } from '../../lib/lessonVisitChecklist/visitChecklistCompare';
import {
  buildCoverageTeacherList,
  buildDepartmentSectionMeans,
  buildLiveDashboardCharts,
  buildLiveTeacherBundles,
  liveVisitsFromCard,
  rankRubricItems,
  summarizeWatchers,
  visitTrendPoints,
} from '../../lib/lessonVisitChecklist/visitChecklistLiveCharts';
import '../../moEngagementDashboard.css';
import { VisitAnswerList } from './VisitChecklistAnswerList';
import { VisitChecklistCardIdentity } from './VisitChecklistCardIdentity';
import VisitChecklistCardInsightsPanel, { VisitChecklistDraftBlock } from './VisitChecklistCardInsightsPanel';
import VisitChecklistCloudCharts, { VisitChecklistTeacherCharts } from './VisitChecklistCloudCharts';
import VisitChecklistMethodistInsights from './VisitChecklistMethodistInsights';
import {
  VisitChecklistSchoolAiReportView,
  VisitChecklistTeacherAiReportView,
  schoolAiReportCopyText,
  teacherAiReportCopyText,
} from './VisitChecklistAiReport';
import './visitChecklistCloud.css';

const VisitChecklistPdfBuilderDialog = lazy(() => import('./pdfBuilder/VisitChecklistPdfBuilderDialog'));

const PAGE_SIZE = 30;

function pct(ratio: number | null | undefined): string {
  return `${scorePct(ratio)}%`;
}

function SectionScoreBars({
  sections,
  reference,
}: {
  sections: Array<{ code?: string | null; title?: string | null; fillRatio?: number | null }>;
  reference?: Array<{ code?: string | null; title?: string | null; fillRatio?: number | null }> | null;
}) {
  return (
    <div className="vcd-bars" aria-label="Баллы по разделам">
      {sections.map((sec) => {
        const color = barFillColor(sec.fillRatio);
        const ref = (reference || []).find(
          (row) => (sec.code && row.code === sec.code) || (sec.title && row.title === sec.title),
        );
        const refPct = ref ? scorePct(ref.fillRatio) : null;
        return (
          <div key={sec.code || sec.title || 'sec'} className="vcd-bar" style={{ ['--vcd-fill' as string]: color }}>
            <span className="vcd-bar__label">{sec.title}</span>
            <span className="vcd-bar__track">
              <span className="vcd-bar__fill" style={{ width: pct(sec.fillRatio) }} />
              {refPct != null ? (
                <span className="vcd-bar__ref" style={{ left: `${refPct}%` }} title={`Кафедра ${refPct}%`} />
              ) : null}
            </span>
            <span className="vcd-bar__val">{pct(sec.fillRatio)}</span>
          </div>
        );
      })}
    </div>
  );
}

function LegacyVisitChecklistCloudDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectParam = searchParams.get('project');
  const teacherParam = searchParams.get('teacher');
  const pageRaw = searchParams.get('page');
  const projectHint = projectParam && /^\d+$/.test(projectParam) ? Number(projectParam) : undefined;
  const page = pageRaw && /^\d+$/.test(pageRaw) ? Math.max(0, Number(pageRaw) - 1) : 0;

  const [dash, setDash] = useState<VisitChecklistDashPayload | null>(null);
  const [card, setCard] = useState<VisitChecklistDashCard | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [cardErr, setCardErr] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [teacherInsufficient, setTeacherInsufficient] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [schoolBusy, setSchoolBusy] = useState(false);
  const [schoolNote, setSchoolNote] = useState<string | null>(null);
  const [schoolInsufficient, setSchoolInsufficient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prepare] = useState<VisitChecklistPrepareProgress | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<'dash' | 'card' | null>(null);
  const [cardPdfOpen, setCardPdfOpen] = useState(false);
  const cardPdfBtnRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpublished' | 'published'>('all');
  const [narrative, setNarrative] = useState('');
  const [compareMode, setCompareMode] = useState<CompareMode>('department');
  const [narrativeEditing, setNarrativeEditing] = useState(false);
  const [liveResponses, setLiveResponses] = useState<LessonVisitResponseRow[]>([]);
  const [liveChecklist, setLiveChecklist] = useState<LessonVisitChecklistConfig>(
    defaultSeed as LessonVisitChecklistConfig,
  );
  const [liveDirectory, setLiveDirectory] = useState<LessonVisitDirectory | null>(null);
  const [liveStaffUnits, setLiveStaffUnits] = useState<Record<string, string[]>>({});
  const [liveReady, setLiveReady] = useState(false);
  const [liveLoadErr, setLiveLoadErr] = useState<string | null>(null);
  const [liveRetry, setLiveRetry] = useState(0);
  const dashPdfRef = useRef<HTMLDivElement>(null);
  const cardPdfRef = useRef<HTMLElement>(null);

  const projectId = dash?.project?.id ?? projectHint;
  useDocumentTitle('Аналитика уроков');

  const loadDash = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const data = await getVisitChecklistDashboard(projectHint);
      setDash(data);
    } catch (e) {
      setDash(null);
      setLoadErr(humanizeVisitChecklistCloudError(e, 'Не удалось загрузить дашборд'));
    } finally {
      setLoading(false);
    }
  }, [projectHint]);

  useEffect(() => {
    void loadDash();
  }, [loadDash]);

  useEffect(() => {
    if (!projectId) {
      setLiveResponses([]);
      setLiveReady(true);
      return;
    }
    let cancelled = false;
    setLiveReady(false);
    setLiveLoadErr(null);
    void Promise.all([
      listLessonVisitResponses(projectId),
      getLessonVisitProject(projectId),
    ]).then(([rows, pack]) => {
      if (cancelled) return;
      setLiveResponses(rows);
      if (pack?.draft?.checklist) setLiveChecklist(pack.draft.checklist);
      setLiveDirectory(pack?.draft?.directory ?? null);
      setLiveStaffUnits(pack?.staffUnits ?? {});
      setLiveReady(true);
    }).catch((error) => {
      if (!cancelled) {
        setLiveLoadErr(humanizeVisitChecklistCloudError(error, 'Не удалось загрузить ответы чеклиста'));
        setLiveReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, liveRetry]);

  const namedTeachers = useMemo(
    () =>
      (dash?.teachers ?? []).filter((row) => {
        const label = resolveFullTeacherName(row.teacher_label, liveDirectory) || row.teacher_label;
        return isKnownVisitTeacher(label, liveDirectory);
      }),
    [dash, liveDirectory],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru-RU');
    return namedTeachers.filter((row) => {
      const label = resolveFullTeacherName(row.teacher_label, liveDirectory) || displayTeacherTitle(row.teacher_label);
      if (statusFilter === 'published' && !row.published_at) return false;
      if (statusFilter === 'unpublished' && row.published_at) return false;
      if (!q) return true;
      return (
        label.toLocaleLowerCase('ru-RU').includes(q) ||
        (row.department || '').toLocaleLowerCase('ru-RU').includes(q)
      );
    });
  }, [namedTeachers, query, statusFilter, liveDirectory]);

  const coverageTeachers = useMemo(
    () => buildCoverageTeacherList(liveDirectory, namedTeachers),
    [liveDirectory, namedTeachers],
  );

  const liveCharts = useMemo(
    () =>
      liveReady
        ? buildLiveDashboardCharts(liveResponses, liveChecklist, coverageTeachers, liveDirectory)
        : null,
    [liveReady, liveResponses, liveChecklist, coverageTeachers, liveDirectory],
  );

  const teacherBundles = useMemo(
    () => buildLiveTeacherBundles(coverageTeachers, liveResponses, liveChecklist, liveDirectory),
    [coverageTeachers, liveResponses, liveChecklist, liveDirectory],
  );

  const methodistInsights = useMemo(
    () => buildMethodistInsights({ bundles: teacherBundles, liveCharts }),
    [teacherBundles, liveCharts],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const selectedKey = teacherParam?.trim() || pageRows[0]?.teacher_key || null;

  const setTeacher = useCallback(
    (key: string, nextPage?: number) => {
      const params = new URLSearchParams(searchParams);
      params.set('teacher', key);
      if (projectId) params.set('project', String(projectId));
      if (nextPage != null) {
        if (nextPage <= 0) params.delete('page');
        else params.set('page', String(nextPage + 1));
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams, projectId],
  );

  useEffect(() => {
    if (!pageRows.length) return;
    const valid = selectedKey && pageRows.some((r) => r.teacher_key === selectedKey);
    if (!valid && pageRows[0]) {
      startTransition(() => setTeacher(pageRows[0].teacher_key, safePage));
    }
  }, [pageRows, selectedKey, safePage, setTeacher]);

  useEffect(() => {
    if (!selectedKey || !projectId) {
      setCard(null);
      return;
    }
    let cancelled = false;
    setCardLoading(true);
    setCardErr(null);
    setAiNote(null);
    void getVisitChecklistDashboardTeacher(selectedKey, projectId)
      .then((data) => {
        if (cancelled) return;
        setCard(data.card);
        setNarrative(data.card.narrative || '');
        setNarrativeEditing(false);
        setTeacherInsufficient(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setCard(null);
        setCardErr(humanizeVisitChecklistCloudError(e, 'Не удалось загрузить карточку'));
      })
      .finally(() => {
        if (!cancelled) setCardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKey, projectId]);

  async function act(body: { narrative?: string; publish?: boolean }) {
    if (!selectedKey || !projectId) return;
    setBusy(true);
    setCardErr(null);
    try {
      const data = await patchVisitChecklistDashboardTeacher(
        selectedKey,
        { ...body, narrative_source: body.narrative != null ? 'manual' : undefined },
        projectId,
      );
      setCard(data.card);
      setNarrative(data.card.narrative || '');
      await loadDash();
    } catch (e) {
      setCardErr(humanizeVisitChecklistCloudError(e, 'Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  }

  const narrativeLocked = isNarrativeLocked({
    source: card?.narrative_source,
    savedNarrative: card?.narrative,
    draftNarrative: narrative,
  });

  async function generateAi(opts?: { force?: boolean }) {
    if (!selectedKey || !projectId) return;
    if (narrativeLocked) {
      setAiNote('Текст методиста не перезаписан. Чтобы получить новый черновик ИИ, очистите поле.');
      return;
    }
    setBusy(true);
    setCardErr(null);
    setAiNote(null);
    setTeacherInsufficient(false);
    try {
      const force =
        opts?.force ??
        Boolean(card?.narrative_source && card.narrative_source !== 'manual' && narrative.trim());
      const data = await postVisitChecklistDashboardTeacherAi(selectedKey, projectId, { force });
      if (data.card.narrative_source === 'manual') {
        setCard(data.card);
        setAiNote('Текст методиста не перезаписан.');
        return;
      }
      setCard(data.card);
      setNarrative(data.narrative || data.card.narrative || '');
      setTeacherInsufficient(Boolean(data.insufficient));
      if (data.insufficient) setAiNote(data.error || 'Недостаточно данных для методической справки.');
      else if (data.error) setAiNote(data.error);
    } catch {
      setAiNote(AI_UNAVAILABLE_WITH_SOURCE_DATA);
    } finally {
      setBusy(false);
    }
  }

  async function generateSchool(opts?: { force?: boolean }) {
    if (!projectId) return;
    setSchoolBusy(true);
    setSchoolNote(null);
    setSchoolInsufficient(false);
    try {
      const data = await postVisitChecklistDashboardSchoolAi(projectId, {
        force: opts?.force ?? true,
        filters: { status: statusFilter },
      });
      setDash((prev) =>
        prev
          ? {
              ...prev,
              kpis: { ...prev.kpis, school_ai: data.school_ai as VisitChecklistSchoolAi | null },
            }
          : prev,
      );
      setSchoolInsufficient(Boolean(data.insufficient));
      if (data.insufficient) setSchoolNote(data.error || 'Недостаточно данных для школьной аналитики.');
      else if (data.error) setSchoolNote(data.error);
    } catch (e) {
      setSchoolNote(e instanceof Error ? e.message : 'Не удалось получить AI-аналитику школы');
    } finally {
      setSchoolBusy(false);
    }
  }

  async function copyAiText(text: string) {
    const value = String(text || '').trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyNote('Скопировано');
      window.setTimeout(() => setCopyNote(null), 1600);
    } catch {
      setCopyNote('Не удалось скопировать');
    }
  }

  async function rebuild() {
    setBusy(true);
    setLoadErr(null);
    try {
      const data = await postVisitChecklistDashboardRebuild(projectId);
      setDash(data);
    } catch (e) {
      setLoadErr(humanizeVisitChecklistCloudError(e, 'Не удалось пересчитать снимок'));
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf(kind: 'dash' | 'card') {
    if (kind === 'card') {
      setCardPdfOpen(true);
      return;
    }
    const el = dashPdfRef.current;
    if (!el) {
      setLoadErr('Не удалось найти область для PDF — обновите страницу и попробуйте снова.');
      return;
    }
    setPdfBusy('dash');
    try {
      await downloadVisitChecklistPdf(el, `${safePdfFileBase(dash?.project?.title || 'chek-list-dashboard')}.pdf`);
    } catch (e) {
      setLoadErr(humanizeVisitChecklistCloudError(e, 'Не удалось собрать PDF'));
    } finally {
      setPdfBusy(null);
    }
  }

  const kpis = dash?.kpis;
  const heroReady = Boolean(dash) || loading;
  const liveSelfCount = useMemo(
    () => teacherBundles.reduce((sum, row) => sum + row.self, 0),
    [teacherBundles],
  );
  const shownSelfCount = kpis?.self_count != null ? kpis.self_count : liveReady ? liveSelfCount : null;

  return (
    <div className="page vcd-page mo-eng-dash-page">
      <div ref={dashPdfRef}>
        {liveLoadErr ? (
          <div className="card glass-surface" role="alert" style={{ padding: '1rem' }}>
            <p>{liveLoadErr}</p>
            <button type="button" onClick={() => setLiveRetry(value => value + 1)}>
              Повторить загрузку сводки
            </button>
          </div>
        ) : null}
        {projectId && !liveReady ? <p role="status">Загружаем ответы для сводки…</p> : null}
        {projectId && liveReady && !liveLoadErr ? <VisitChecklistReportDashboard projectId={projectId} responses={liveResponses} checklist={liveChecklist} directory={liveDirectory || defaultSeed.directory} staffUnits={liveStaffUnits} /> : null}
        <details className="card glass-surface" style={{ padding: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Архивная аналитика и отчёты по прежней шкале</summary>
        <header className="mo-eng-dash-hero vcd-hero">
          <p className="mo-eng-dash-kicker">Кабинет · аналитика уроков</p>
          <h1 className="mo-eng-dash-hero-title">Аналитика уроков</h1>
          <p className="vcd-hero__lead">
            Здесь собраны результаты наблюдений за уроками и самоанализа педагогов. На диаграммах показаны средние
            результаты в процентах от максимального балла.
          </p>
          {(prepare && !prepare.ready) || (loading && !dash) ? (
            <div className="vcd-prepare" role="status" aria-live="polite">
              <p className="vcd-prepare__text">
                {prepare?.message || 'Собираем сводку чек-листа'}
              </p>
              <div className="vcd-prepare__track" aria-hidden>
                <span
                  className="vcd-prepare__fill"
                  style={{
                    width: `${
                      prepare && prepare.total > 0
                        ? Math.min(100, Math.round((prepare.done / prepare.total) * 100))
                        : 8
                    }%`,
                  }}
                />
              </div>
              <p className="vcd-prepare__eta">
                {formatPrepareWaitCopy(prepare?.eta_sec ?? 8, prepare?.done ?? 0, prepare?.total ?? 0)}
              </p>
            </div>
          ) : null}
          {heroReady ? (
            <div className="mo-eng-dash-hero-grid" aria-label="Сводка">
              <div className="mo-eng-dash-index-plate">
                <span className="mo-eng-dash-index-label">Прежняя шкала · средний процент</span>
                <span className="mo-eng-dash-index-value" style={{ color: trafficColor(kpis?.avg_score_ratio) }}>
                  {loading ? '…' : pct(kpis?.avg_score_ratio)}
                </span>
              </div>
              <div className="mo-eng-dash-kpi-grid">
                <div className="mo-eng-dash-kpi">
                  <span className="mo-eng-dash-kpi-value">{loading ? '…' : kpis?.response_count ?? 0}</span>
                  <span className="mo-eng-dash-kpi-label">записей</span>
                </div>
                <div className="mo-eng-dash-kpi">
                  <span className="mo-eng-dash-kpi-value">{loading ? '…' : kpis?.observe_count ?? '—'}</span>
                  <span className="mo-eng-dash-kpi-label">наблюдений</span>
                </div>
                <div className="mo-eng-dash-kpi">
                  <span className="mo-eng-dash-kpi-value">
                    {loading || shownSelfCount == null ? '…' : shownSelfCount}
                  </span>
                  <span className="mo-eng-dash-kpi-label">самоанализов</span>
                </div>
                <div className="mo-eng-dash-kpi">
                  <span className="mo-eng-dash-kpi-value">{loading ? '…' : kpis?.teacher_count ?? 0}</span>
                  <span className="mo-eng-dash-kpi-label">педагогов</span>
                </div>
                <div className="mo-eng-dash-kpi">
                  <span className="mo-eng-dash-kpi-value">{loading ? '…' : kpis?.department_count ?? 0}</span>
                  <span className="mo-eng-dash-kpi-label">кафедр</span>
                </div>
                <div className="mo-eng-dash-kpi">
                  <span className="mo-eng-dash-kpi-value">{loading ? '…' : kpis?.published_count ?? 0}</span>
                  <span className="mo-eng-dash-kpi-label">в кабинетах</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="vcd-placeholder card glass-surface" aria-hidden />
          )}
          <div className={`vcd-hero__actions ${VCD_PDF_HIDE_CLASS}`}>
            <button type="button" className="btn btn-sm" disabled={busy || loading} onClick={() => void loadDash()}>
              Обновить
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void rebuild()}>
              Пересчитать показатели
            </button>
            <button
              type="button"
              className="btn btn-sm primary"
              disabled={pdfBusy != null || loading}
              onClick={() => void exportPdf('dash')}
            >
              {pdfBusy === 'dash' ? 'Собираем PDF…' : 'Скачать отчёт в PDF'}
            </button>
          </div>
        </header>
        {(() => {
          const schoolAi = schoolAiFromKpis(kpis);
          const schoolReport = (schoolAi?.report || null) as VisitChecklistSchoolAiReport | null;
          if (loading && !schoolAi) {
            return <section className="card glass-surface vcd-school-ai vcd-school-ai--ph" aria-hidden />;
          }
          return (
            <section className="card glass-surface vcd-school-ai" aria-label="Сводная аналитика">
              <h2>Архивная справка · устаревшая</h2>
              <p>Текст сформирован по прежней шкале и прежнему срезу данных. Для актуального количества уроков и баллов используйте «Сводку посещений уроков».</p>
              <div className={`vcd-school-ai__actions ${VCD_PDF_HIDE_CLASS}`}>
                <button
                  type="button"
                  className="btn btn-sm primary"
                  disabled={schoolBusy || loading || !projectId}
                  onClick={() => void generateSchool({ force: true })}
                >
                  {schoolBusy ? 'Формируем аналитику…' : schoolAi ? 'Обновить аналитику' : 'AI-аналитика'}
                </button>
                {schoolAi ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={schoolBusy}
                    onClick={() =>
                      void copyAiText(schoolAiReportCopyText(schoolReport, schoolAi.narrative))
                    }
                  >
                    Скопировать
                  </button>
                ) : null}
              </div>
              {schoolNote || schoolAi?.error ? (
                <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
                  {schoolInsufficient || schoolAi?.insufficient
                    ? schoolNote || schoolAi?.error
                    : schoolNote || schoolAi?.error}
                </p>
              ) : null}
              {schoolAi?.observer_warning && !schoolReport?.observerWarning ? (
                <p className="vcd-ai-report__warn">{schoolAi.observer_warning}</p>
              ) : null}
              {schoolReport ? (
                <VisitChecklistSchoolAiReportView report={schoolReport} />
              ) : schoolAi?.narrative ? (
                <p className="vcd-school-ai__body">{schoolAi.narrative}</p>
              ) : !loading ? (
                <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.86rem' }}>
                  Сводка по текущему срезу дашборда. Статистика считается заранее, в GigaChat уходят только агрегаты
                  без ФИО педагогов.
                </p>
              ) : null}
              {copyNote ? (
                <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.78rem' }}>
                  {copyNote}
                </p>
              ) : null}
            </section>
          );
        })()}
        <VisitChecklistCloudCharts
          kpis={kpis}
          teachers={namedTeachers}
          liveResponses={liveResponses}
          checklist={liveChecklist}
          directory={liveDirectory}
          liveCharts={liveCharts}
        />
        <VisitChecklistMethodistInsights insights={methodistInsights} pendingReady={liveReady && !loading} />
        </details>
      </div>

      {loadErr ? (
        <p className="err card glass-surface" style={{ marginTop: '1rem', padding: '0.85rem' }}>
          {loadErr}
        </p>
      ) : null}

      <details className="card glass-surface" style={{ padding: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Карточки, PDF и публикация · прежняя шкала</summary>
      <div className="vcd-layout">
        <aside className="card glass-surface vcd-sidebar" aria-label="Список педагогов">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Фамилия или кафедра"
            aria-label="Найти педагога"
          />
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Статус"
          >
            <option value="all">Все педагоги</option>
            <option value="unpublished">Отчёт не опубликован</option>
            <option value="published">Отчёт опубликован</option>
          </select>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
            Педагогов: {filtered.length}
          </p>
          <div className="vcd-sidebar__list" role="listbox">
            {pageRows.map((row) => (
              <TeacherPickRow
                key={row.teacher_key}
                row={row}
                directory={liveDirectory}
                selected={row.teacher_key === selectedKey}
                onSelect={() => setTeacher(row.teacher_key)}
              />
            ))}
            {!pageRows.length ? (
              <p className="muted" style={{ margin: '0.4rem 0', fontSize: '0.85rem' }}>
                {loading ? 'Загрузка списка…' : 'Нет педагогов по фильтру'}
              </p>
            ) : null}
          </div>
          {pageCount > 1 ? (
            <div className={VCD_PDF_HIDE_CLASS} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={safePage <= 0}
                onClick={() => selectedKey && setTeacher(selectedKey, safePage - 1)}
              >
                ←
              </button>
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                {safePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => selectedKey && setTeacher(selectedKey, safePage + 1)}
              >
                →
              </button>
            </div>
          ) : null}
        </aside>

        <article ref={cardPdfRef} className="card glass-surface vcd-card">
          {cardErr ? <p className="err">{cardErr}</p> : null}
          {cardLoading && !card ? <p className="muted">Загрузка карточки…</p> : null}
          {!card && !cardLoading ? (
            <p className="muted" style={{ margin: 0 }}>
              {selectedKey ? NO_TEACHER_CHECKLISTS_MESSAGE : SELECT_TEACHER_MESSAGE}
            </p>
          ) : null}
          {card ? (
            <>
              <VisitChecklistCardIdentity
                large
                name={resolveFullTeacherName(card.teacher_label, liveDirectory) || displayTeacherTitle(card.teacher_label)}
                photoUrl={staffPortraitUrl(card)}
                actionsClassName={`vcd-card__head-actions ${VCD_PDF_HIDE_CLASS}`}
                actions={
                  <button
                    type="button"
                    className="btn btn-sm primary"
                    ref={cardPdfBtnRef}
                    disabled={pdfBusy != null}
                    onClick={() => setCardPdfOpen(true)}
                  >
                    Скачать PDF
                  </button>
                }
                meta={
                  <>
                    {card.department || 'Кафедра не указана'} ·{' '}
                    <span style={{ color: trafficColor(card.stats.score_ratio), fontWeight: 700 }}>
                      {scorePctLabel(card.stats.score_ratio)}
                    </span>
                    {' · '}
                    {cardSendLabel(card)}
                  </>
                }
              >
                {(() => {
                  const mix = countVisitKinds(card.stats.visits);
                  const bundle = teacherBundles.find((row) => row.teacher_key === card.teacher_key);
                  const liveVisits = bundle?.visits.length ? bundle.visits : liveVisitsFromCard(card);
                  const insights = buildTeacherCardInsights({ card, liveVisits });
                  return (
                    <p className="vcd-chips" aria-label="Состав записей">
                      <span className="vcd-chip vcd-chip--observe">Наблюдение · {mix.observe}</span>
                      <span className="vcd-chip vcd-chip--self">Самоанализ · {mix.self}</span>
                      {insights.badges.gap ? <span className="vcd-badge vcd-badge--gap">расхождение</span> : null}
                      {insights.badges.repeat ? <span className="vcd-badge vcd-badge--repeat">повтор</span> : null}
                    </p>
                  );
                })()}
              </VisitChecklistCardIdentity>
              {(() => {
                const bundle = teacherBundles.find((row) => row.teacher_key === card.teacher_key);
                const liveVisits = bundle?.visits.length ? bundle.visits : liveVisitsFromCard(card);
                const insights = buildTeacherCardInsights({ card, liveVisits });
                const observeSelf = aggregateObserveVsSelf(liveVisits);
                const compare = buildCompareResult({
                  mode: compareMode,
                  teacherRatio: bundle?.score_ratio ?? card.stats.score_ratio,
                  teacherSections: bundle?.sections.length ? bundle.sections : card.stats.sections || [],
                  teachers: teacherBundles.map((row) => ({
                    teacher_key: row.teacher_key,
                    department: row.department,
                    score_ratio: row.score_ratio,
                    sections: row.sections,
                  })),
                  current: { teacher_key: card.teacher_key, department: card.department },
                  schoolSections: liveCharts?.sections.map((sec) => ({
                    code: sec.code,
                    title: sec.name,
                    fillRatio: sec.score_ratio,
                  })),
                  schoolRatio: kpis?.avg_score_ratio,
                });
                const deptMeans = buildDepartmentSectionMeans(teacherBundles, card.department, card.teacher_key);
                return (
                  <>
                    <VisitChecklistTeacherCharts
                      card={card}
                      compare={compare}
                      compareMode={compareMode}
                      onCompareMode={setCompareMode}
                      observeSelf={observeSelf}
                      trend={visitTrendPoints(liveVisits)}
                      watchers={summarizeWatchers(liveVisits)}
                      liveVisits={liveVisits}
                    />
                    <VisitChecklistCardInsightsPanel
                      insights={insights}
                      weakItems={rankRubricItems(liveVisits, { limit: 3, direction: 'weak' })}
                      strongItems={rankRubricItems(liveVisits, { limit: 3, direction: 'strong' })}
                    />
                    <SectionScoreBars
                      sections={bundle?.sections.length ? bundle.sections : card.stats.sections || []}
                      reference={
                        compareMode === 'none'
                          ? null
                          : compareMode === 'department'
                            ? deptMeans
                            : compare.sections.map((sec) => ({
                                code: sec.code,
                                title: sec.title,
                                fillRatio: sec.cohort / 100,
                              }))
                      }
                    />
                  </>
                );
              })()}
              <div className={`vcd-card__actions ${VCD_PDF_HIDE_CLASS}`} style={{ position: 'relative', zIndex: 6 }}>
                {card.ai_report ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ position: 'relative', zIndex: 6 }}
                    onClick={() => {
                      if (!narrative.trim() && card.ai_report) {
                        setNarrative(teacherAiReportCopyText(card.ai_report, '') || narrative);
                      }
                      setNarrativeEditing(true);
                    }}
                  >
                    Редактировать справку
                  </button>
                ) : null}
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void act({ narrative })}>
                  Сохранить изменения
                </button>
                <button
                  type="button"
                  className="btn btn-sm primary"
                  disabled={busy || narrativeLocked}
                  onClick={() => void generateAi({ force: Boolean(card.ai_report || narrative.trim()) })}
                >
                  {busy
                    ? 'Формируем справку…'
                    : card.ai_report || narrative.trim()
                      ? 'Обновить анализ'
                      : 'Сформировать методическую справку'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy || !(card.ai_report || narrative.trim())}
                  onClick={() => void copyAiText(teacherAiReportCopyText(card.ai_report, narrative))}
                >
                  Скопировать
                </button>
                <button
                  type="button"
                  className="btn btn-sm primary"
                  disabled={busy}
                  onClick={() => void act({ narrative, publish: true })}
                >
                  {card.published ? 'Отправить ещё раз' : 'Опубликовать в личном кабинете'}
                </button>
              </div>
              {teacherInsufficient ? (
                <p className="muted" style={{ margin: '0 0 0.4rem', fontSize: '0.82rem' }}>
                  {aiNote || 'Недостаточно данных: нет посещений уроков.'}
                </p>
              ) : aiNote ? (
                <p className="muted" style={{ margin: '0 0 0.4rem', fontSize: '0.82rem' }}>
                  {aiNote}
                </p>
              ) : null}
              {card.ai_report ? (
                <VisitChecklistTeacherAiReportView
                  report={card.ai_report}
                  greeting={teacherGreetingName(
                    resolveFullTeacherName(card.teacher_label, liveDirectory) || displayTeacherTitle(card.teacher_label),
                  )}
                />
              ) : null}
              {(() => {
                const bundle = teacherBundles.find((row) => row.teacher_key === card.teacher_key);
                const liveVisits = bundle?.visits.length ? bundle.visits : liveVisitsFromCard(card);
                if (card.ai_report) return null;
                return <VisitChecklistDraftBlock draft={buildTeacherCardInsights({ card, liveVisits }).draft} />;
              })()}
              {card.ai_report && !narrativeEditing ? (
                <div className={`vcd-methodist-narrative__toolbar ${VCD_PDF_HIDE_CLASS}`} style={{ marginTop: '0.65rem', position: 'relative', zIndex: 5 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      if (!narrative.trim() && card.ai_report) {
                        setNarrative(teacherAiReportCopyText(card.ai_report, '') || narrative);
                      }
                      setNarrativeEditing(true);
                    }}
                  >
                    Редактировать справку
                  </button>
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    Правка в том же оформлении, без второго блока текста
                  </span>
                </div>
              ) : null}
              {narrativeEditing || !card.ai_report ? (
              <section className="vcd-methodist-narrative" aria-label="Обратная связь методиста">
                <div className={`vcd-methodist-narrative__toolbar ${VCD_PDF_HIDE_CLASS}`}>
                  <p className="vcd-insight__label" style={{ margin: 0 }}>
                    {card.ai_report ? 'Правка методической справки' : 'Обратная связь методиста'}
                    {(() => {
                      const origin = narrativeOriginLabel({
                        source: card.narrative_source,
                        locked: narrativeLocked,
                        hasText: Boolean(narrative.trim()),
                      });
                      return origin && !card.ai_report ? (
                        <span className={`vcd-origin ${narrativeLocked ? 'vcd-origin--manual' : 'vcd-origin--ai'}`}>
                          {origin}
                        </span>
                      ) : null;
                    })()}
                  </p>
                </div>
                {narrativeEditing || (!card.ai_report && !narrativeLocked) ? (
                  <>
                    <textarea
                      className="input vcd-methodist-narrative__editor"
                      rows={8}
                      value={narrative}
                      disabled={busy}
                      onChange={(e) => setNarrative(e.target.value)}
                      style={{ fontSize: '0.92rem', lineHeight: 1.55, fontWeight: 400 }}
                    />
                    <div className={`${VCD_PDF_HIDE_CLASS}`} style={{ display: 'flex', gap: '0.4rem', marginTop: '0.45rem' }}>
                      <button
                        type="button"
                        className="btn btn-sm primary"
                        disabled={busy || !narrative.trim()}
                        onClick={() => {
                          setNarrativeEditing(false);
                          void act({ narrative });
                        }}
                      >
                        Сохранить текст
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => {
                          setNarrative(card.narrative || '');
                          setNarrativeEditing(false);
                        }}
                      >
                        Отмена
                      </button>
                    </div>
                  </>
                ) : narrative.trim() ? (
                  <article className="vcd-methodist-narrative__body phenomenal-public-prose">
                    {narrative.split(/\n\n+/).map((p, i) => (
                      <p key={i} style={{ margin: '0.35rem 0' }}>
                        {p.trim()}
                      </p>
                    ))}
                  </article>
                ) : null}
                {!card.ai_report ? (
                  <p className="muted" style={{ margin: '0.55rem 0 0', fontSize: '0.75rem' }}>
                    {AI_NARRATIVE_PROVIDER_LABEL}
                  </p>
                ) : null}
              </section>
              ) : null}
              <div className="vcd-visits">
                {(() => {
                  const bundle = teacherBundles.find((row) => row.teacher_key === card.teacher_key);
                  const liveVisits = bundle?.visits.length ? bundle.visits : liveVisitsFromCard(card);
                  const snapVisits = card.stats.visits || [];
                  // Prefer live responses so самоанализ is visible even if the snapshot is stale.
                  const visitRows =
                    liveVisits.length >= snapVisits.length
                      ? liveVisits.map((live, idx) => {
                          const snap =
                            snapVisits.find(
                              (row) =>
                                String(row.date || '').slice(0, 10) === live.date &&
                                (row.class_name || '') === live.class_name &&
                                (row.subject || '') === live.subject &&
                                Boolean(isSelfAnalysisFormat(row.format)) ===
                                  Boolean(isSelfAnalysisFormat(live.format)),
                            ) || snapVisits[idx];
                          return {
                            id: snap?.id ?? idx,
                            date: live.date || snap?.date || '',
                            class_name: live.class_name || snap?.class_name || '',
                            subject: live.subject || snap?.subject || '',
                            visitor: live.visitor || snap?.visitor || '',
                            format: live.format || snap?.format || '',
                            earned: snap?.earned ?? live.earned,
                            max: snap?.max ?? live.max,
                            summary: snap?.summary || '',
                            recommendations: snap?.recommendations || '',
                            sections: snap?.sections,
                            live,
                          };
                        })
                      : snapVisits.map((visit) => ({
                          ...visit,
                          live: liveVisits.find(
                            (row) =>
                              (!visit.date || row.date === String(visit.date).slice(0, 10)) &&
                              (!visit.class_name || row.class_name === visit.class_name) &&
                              (!visit.subject || row.subject === visit.subject),
                          ),
                        }));
                  return visitRows.map((visit) => (
                  <article
                    key={`${visit.id}-${visit.date}-${visit.format || ''}`}
                    className={isSelfAnalysisFormat(visit.format) ? 'vcd-visit vcd-visit--self' : 'vcd-visit'}
                  >
                    <p className="vcd-visit__meta">
                      <span
                        className={
                          isSelfAnalysisFormat(visit.format) ? 'vcd-chip vcd-chip--self' : 'vcd-chip vcd-chip--observe'
                        }
                      >
                        {isSelfAnalysisFormat(visit.format) ? 'Самоанализ' : 'Наблюдение'}
                      </span>
                      <span>
                        {formatVisitChecklistDate(visit.date)} · {visit.class_name || 'класс'} · {visit.subject || 'предмет'}
                        {!isSelfAnalysisFormat(visit.format) && visit.visitor
                          ? ` · ${resolveFullTeacherName(visit.visitor, liveDirectory) || visit.visitor}`
                          : ''}
                        {visit.format && !isSelfAnalysisFormat(visit.format) ? ` · ${visit.format}` : ''}
                      </span>
                    </p>
                    {visit.summary ? <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap' }}>{visit.summary}</p> : null}
                    {visit.recommendations ? (
                      <p className="muted" style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-wrap' }}>
                        Удачные приёмы: {visit.recommendations}
                      </p>
                    ) : null}
                    <VisitAnswerList
                      visit={visit}
                      teacherKey={card.teacher_key}
                      teacherLabel={card.teacher_label}
                      responses={liveResponses}
                      checklist={liveChecklist}
                      directory={liveDirectory}
                      liveVisit={visit.live}
                    />
                  </article>
                  ));
                })()}
              </div>
            </>
          ) : null}
        </article>
      </div>
      </details>
      {cardPdfOpen && card ? (
        <Suspense fallback={null}>
          <VisitChecklistPdfBuilderDialog
            open
            card={card}
            context={{
              projectTitle: dash?.project?.title,
              teacherName:
                resolveFullTeacherName(card.teacher_label, liveDirectory) || displayTeacherTitle(card.teacher_label),
              compareMode,
              teachers: (dash?.teachers || []).map((row) => ({
                teacher_key: row.teacher_key,
                department: row.department,
                score_ratio: row.score_ratio,
                sections: row.sections,
              })),
              schoolRatio: kpis?.avg_score_ratio ?? null,
            }}
            onClose={() => {
              setCardPdfOpen(false);
              cardPdfBtnRef.current?.focus();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function TeacherPickRow({
  row,
  directory,
  selected,
  onSelect,
}: {
  row: VisitChecklistDashTeacherListItem;
  directory?: LessonVisitDirectory | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = resolveFullTeacherName(row.teacher_label, directory) || displayTeacherTitle(row.teacher_label);
  const badge = cardWorkflowLabel(row);
  const tone = trafficTone(row.score_ratio);
  return (
    <button type="button" className="vcd-row" aria-selected={selected} onClick={onSelect}>
      <StaffAvatar
        className="vcd-row__photo"
        name={label}
        photoUrl={staffPortraitUrl(row)}
        size="md"
      />
      <span className="vcd-row__body">
        <span className="vcd-row__name">{label}</span>
        <span className="vcd-row__dept">{row.department || 'Кафедра не указана'}</span>
        <span className="vcd-row__meta">
          {visitCountLabel(row.visit_count)}
          <span className={`vcd-score vcd-score--${tone}`}>{scorePctLabel(row.score_ratio)}</span>
        </span>
        {badge ? <span className="vcd-badge vcd-badge--ok">{badge}</span> : null}
      </span>
    </button>
  );
}


export default function VisitChecklistCloudDashboardPage() {
  const [archiveOpen, setArchiveOpen] = useState(false);
  return <div className="page"><LegacyVisitChecklistCloudDashboardPage />
    <details onToggle={(event) => setArchiveOpen(event.currentTarget.open)}>
      <summary>Настройки версионного оценивания и доступа</summary>
      {archiveOpen ? <VisitChecklistV3Dashboard /> : null}
    </details>
  </div>;
}
