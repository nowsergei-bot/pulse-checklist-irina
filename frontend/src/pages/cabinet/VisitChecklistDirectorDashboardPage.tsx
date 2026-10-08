import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  getLessonVisitProject,
  getVisitChecklistDashboard,
  listLessonVisitResponses,
  saveNewTeacherIds,
  type VisitChecklistDashPayload,
} from '../../api/visitChecklist';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useCabinetLoadOverlay } from '../../hooks/useCabinetLoadOverlay';
import { loadJdMe } from '../../lib/cabinet/sharedResources';
import { useCabinetPreview } from '../../lib/cabinet/preview';
import { useCabinetProfile } from '../../lib/cabinet/profile';
import defaultSeed from '../../lib/lessonVisitChecklist/defaultSeed.json';
import type {
  LessonVisitChecklistConfig,
  LessonVisitDirectory,
  LessonVisitResponseRow,
} from '../../lib/lessonVisitChecklist/types';
import { humanizeVisitChecklistCloudError } from '../../lib/lessonVisitChecklist/visitChecklistCloudUi';
import {
  displayVisitChecklistTitle,
  VISIT_CHECKLIST_TITLE,
} from '../../lib/lessonVisitChecklist/normalizeChecklist';
import {
  VISIT_CHECKLIST_ANALYTICS_PATH,
  canSeeVisitChecklistAnalyticsNav,
  isVisitChecklistDirectorPerson,
  visitChecklistAnalyticsNavPath,
} from '../../lib/visitChecklistAnalyticsAccess';
import { useIsAuthenticated } from '../../lib/isAuthenticated';
import VisitChecklistReportDashboard from '../../components/VisitChecklistReportDashboard';
import '../visitChecklistCloud/visitChecklistCloud.css';
import '../valuesSpace/valuesSpace.css';
import './pulseCabinet.css';

export default function VisitChecklistDirectorDashboardPage() {
  const authed = useIsAuthenticated();
  const preview = useCabinetPreview();
  const { user } = useCabinetProfile();
  const [gate, setGate] = useState<'loading' | 'director' | 'other' | 'deny'>(
    'loading',
  );
  const [otherPath, setOtherPath] = useState(VISIT_CHECKLIST_ANALYTICS_PATH);
  const [dash, setDash] = useState<VisitChecklistDashPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveResponses, setLiveResponses] = useState<LessonVisitResponseRow[]>(
    [],
  );
  const [liveChecklist, setLiveChecklist] =
    useState<LessonVisitChecklistConfig>(
      defaultSeed as LessonVisitChecklistConfig,
    );
  const [liveDirectory, setLiveDirectory] =
    useState<LessonVisitDirectory | null>(null);
  const [liveStaffUnits, setLiveStaffUnits] = useState<Record<string, string[]>>({});
  const [newTeacherIds, setNewTeacherIds] = useState<string[]>([]);
  const [canOpenAnalytics, setCanOpenAnalytics] = useState(false);
  const [liveReady, setLiveReady] = useState(false);
  const [params] = useSearchParams();
  const summaryScreen = params.get('screen') === 'summary';

  const projectId = dash?.project?.id;
  const shownTitle =
    displayVisitChecklistTitle(dash?.project?.title) || VISIT_CHECKLIST_TITLE;
  useDocumentTitle(shownTitle);
  const pageBusy =
    gate === 'loading' ||
    loading ||
    (gate === 'director' && Boolean(projectId) && !liveReady);
  useCabinetLoadOverlay({
    active: authed && pageBusy && !loadErr,
    kind: 'checklist',
    error: loadErr,
  });

  useEffect(() => {
    if (!authed || preview.isPreview) {
      setGate('deny');
      return;
    }
    let cancelled = false;
    void loadJdMe()
      .then((me) => {
        if (cancelled) return;
        const identity = {
          permissions:user?.permissions, role:user?.role,
          email: me.user?.email || me.staff?.email || user?.email || null,
          display_name: me.user?.display_name || user?.display_name || null,
          full_name: me.staff?.full_name || user?.display_name || null,
        };
        const staffName = me.staff?.full_name || null;
        if (isVisitChecklistDirectorPerson(identity, staffName)) {
          setCanOpenAnalytics(canSeeVisitChecklistAnalyticsNav(identity, staffName));
          setGate('director');
          return;
        }
        if (canSeeVisitChecklistAnalyticsNav(identity, staffName)) {
          setOtherPath(
            visitChecklistAnalyticsNavPath(identity, staffName) ||
              VISIT_CHECKLIST_ANALYTICS_PATH,
          );
          setGate('other');
          return;
        }
        setGate('deny');
      })
      .catch(() => {
        if (!cancelled) setGate('deny');
      });
    return () => {
      cancelled = true;
    };
  }, [
    authed,
    preview.isPreview,
    preview.previewStaffId,
    preview.previewEmail,
    user,
  ]);

  useEffect(() => {
    if (gate !== 'director') return;
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    void getVisitChecklistDashboard()
      .then((data) => {
        if (!cancelled) setDash(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setDash(null);
          setLoadErr(
            humanizeVisitChecklistCloudError(e, 'Не удалось загрузить дашборд'),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gate]);

  useEffect(() => {
    if (!projectId) {
      setLiveResponses([]);
      setLiveReady(true);
      return;
    }
    let cancelled = false;
    setLiveReady(false);
    void Promise.all([
      listLessonVisitResponses(projectId),
      getLessonVisitProject(projectId),
    ])
      .then(([rows, pack]) => {
        if (cancelled) return;
        setLiveResponses(rows);
        if (pack?.draft?.checklist) setLiveChecklist(pack.draft.checklist);
        setLiveDirectory(pack?.draft?.directory ?? null);
        setLiveStaffUnits(pack?.staffUnits ?? {});
        setNewTeacherIds(pack?.draft?.newTeacherIds ?? []);
        setLiveReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadErr(
            humanizeVisitChecklistCloudError(
              error,
              'Не удалось загрузить ответы чеклиста',
            ),
          );
          setLiveReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!authed)
    return (
      <Navigate
        to="/auth"
        replace
        state={{ from: '/cabinet/visit-checklist' }}
      />
    );
  if (gate === 'other') return <Navigate to={otherPath} replace />;
  if (gate === 'deny') return <Navigate to="/cabinet" replace />;

  return (
    <div className="page vcd-page vcd-page--director mo-eng-dash-page">
      <header className="vcd-hero vcd-hero--cabinet card glass-surface">
        <p className="admin-dash-kicker">Кабинет директора</p>
        <h1 className="admin-dash-title">{shownTitle}</h1>
        <p className="vcd-hero__lead muted">
          Посещения, оценки наблюдателей и самоанализ педагогов.
        </p>
      </header>
      {loadErr ? (
        <section className="card glass-surface" role="alert">
          {loadErr}
        </section>
      ) : pageBusy ? (
        <section
          className="card glass-surface vcd-placeholder"
          aria-busy="true"
        >
          Загружаем уроки…
        </section>
      ) : (
        <>
          <nav className="vcr-screens" aria-label="Экраны директора">
            <Link
              className="vcr-link"
              aria-current={summaryScreen ? 'page' : undefined}
              to="?screen=summary"
            >
              Сводка для директора
            </Link>
            <Link
              className="vcr-link"
              aria-current={summaryScreen ? undefined : 'page'}
              to="."
            >
              Полная аналитика
            </Link>
          </nav>
          <VisitChecklistReportDashboard
            responses={liveResponses}
            checklist={liveChecklist}
            directory={liveDirectory || defaultSeed.directory}
            staffUnits={liveStaffUnits}
            directorScreen
            newTeacherIds={newTeacherIds}
            onSaveNewTeachers={
              projectId
                ? async (ids) => {
                    const saved = await saveNewTeacherIds(projectId, ids);
                    setNewTeacherIds(saved);
                    return saved;
                  }
                : undefined
            }
            analyticsPath={canOpenAnalytics ? VISIT_CHECKLIST_ANALYTICS_PATH : null}
          />
        </>
      )}
    </div>
  );
}
