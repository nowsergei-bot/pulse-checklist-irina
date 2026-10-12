import { Suspense, useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { eaSetAnalyticsScope } from '../../api/englishAssessment';
import { EA_CABINET_BASE, EaPathsProvider } from '../../lib/englishAssessment/paths';
import { invalidateSharedEaMe, loadEaMe, peekCachedEaMe } from '../../lib/englishAssessment/sharedMe';
import { prefetchPointerHandlers } from '../../lib/cabinet/prefetchRoutes';
import { cabinetPreviewQuery, useCabinetPreview } from '../../lib/cabinet/preview';
import { seesEaDepartmentAnalytics, type EaCapabilities, type EaMe } from '../../lib/englishAssessment/types';
import '../englishAssessment/englishAssessment.css';
import { useCabinetLoadOverlay } from '../../hooks/useCabinetLoadOverlay';
import CabinetLoadProgress from '../../components/CabinetLoadProgress';
import PulseCabinetShell from './PulseCabinetShell';
import './pulseCabinet.css';

function EnglishSectionFallback() {
  useCabinetLoadOverlay({ active: true, kind: 'english', immediate: true });
  return (
    <div className="ea-leader" aria-busy="true" aria-label="Загрузка раздела">
      <CabinetLoadProgress label="Загрузка английского…" />
      <div className="ea-skel ea-skel--bar" />
      <div className="ea-group-tiles">
        <div className="ea-group-tile ea-skel ea-skel--tile" />
        <div className="ea-group-tile ea-skel ea-skel--tile" />
        <div className="ea-group-tile ea-skel ea-skel--tile" />
      </div>
    </div>
  );
}

export default function EnglishTeacherCabinetLayout() {
  const { pathname } = useLocation();
  const preview = useCabinetPreview();
  const cached = peekCachedEaMe();
  const [caps, setCaps] = useState<EaCapabilities | null>(cached?.capabilities || null);
  const [hasTeacher, setHasTeacher] = useState(Boolean(cached?.teacher));
  const [ready, setReady] = useState(Boolean(cached));
  const [analyticsScope, setAnalyticsScope] = useState<EaMe['analytics_scope'] | null>(cached?.analytics_scope || null);
  const [scopeBusy, setScopeBusy] = useState(false);
  useCabinetLoadOverlay({
    active: !ready && !cached,
    kind: 'english',
  });
  const eaBase = preview.isPreview ? `${preview.basePath}/english` : EA_CABINET_BASE;
  const eaSearch = preview.isPreview
    ? cabinetPreviewQuery(preview.previewEmail, preview.previewStaffId)
    : '';

  useEffect(() => {
    const hit = peekCachedEaMe();
    if (hit) {
      setCaps(hit.capabilities || null);
      setHasTeacher(Boolean(hit.teacher));
      setAnalyticsScope(hit.analytics_scope || null);
      setReady(true);
    }
    void loadEaMe()
      .then((me) => {
        setCaps(me.capabilities || null);
        setHasTeacher(Boolean(me.teacher));
        setAnalyticsScope(me.analytics_scope || null);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [preview.isPreview, preview.previewStaffId, preview.previewEmail]);

  const deptAnalytics = seesEaDepartmentAnalytics(caps);
  const showAnalytics = Boolean(deptAnalytics || hasTeacher);
  const showContingent = Boolean(caps?.contingent);
  const showImport = Boolean(caps?.import && !preview.isPreview);
  const showSpecs = Boolean(caps?.viewAll || caps?.manage);
  const showRating = Boolean(caps?.teacherRatingView);
  const analyticsTo = deptAnalytics ? `${eaBase}/leader${eaSearch}` : `${eaBase}/analytics${eaSearch}`;
  const homeTo = `${eaBase}${eaSearch}`;
  const onEnglishDesk =
    /\/english\/?$/.test(pathname) || /\/english\/(groups|students)\//.test(pathname);
  const onAnalytics = /\/english\/(analytics|leader)\/?$/.test(pathname);
  const onDirectory = /\/english\/directory\/?$/.test(pathname);
  const onLeader = /\/english\/leader\/?$/.test(pathname);
  const onImport = /\/english\/import\/?$/.test(pathname);
  const onSpecs = /\/english\/specs\/?$/.test(pathname);
  const onRating = /\/english\/rating\/?$/.test(pathname);

  if (!ready && !hasTeacher && !deptAnalytics) {
    return (
      <PulseCabinetShell>
        <EnglishSectionFallback />
      </PulseCabinetShell>
    );
  }
  if (ready && !hasTeacher && !deptAnalytics) {
    return <Navigate to={preview.path('')} replace />;
  }
  if (ready && onDirectory && !showContingent) {
    return <Navigate to={homeTo} replace />;
  }
  if (ready && onLeader && !deptAnalytics) {
    return <Navigate to={`${eaBase}/analytics${eaSearch}`} replace />;
  }
  if (ready && onImport && !showImport) {
    return <Navigate to={homeTo} replace />;
  }
  if (ready && onRating && !showRating) {
    return <Navigate to={homeTo} replace />;
  }

  return (
    <EaPathsProvider base={eaBase} cabinet search={eaSearch}>
      <PulseCabinetShell>
        <div className="ea-page ea-page--desk">
          <header className="ea-desk-head">
            <h1>Результаты тестов по английскому</h1>
            {preview.isPreview ? <span className="ea-preview-badge">Просмотр</span> : null}
            {caps?.canManageAnalyticsScope && !preview.isPreview ? (
              <div className="ea-scope-toggle" role="group" aria-label="Кому открыта аналитика кафедры">
                <button
                  type="button"
                  className={analyticsScope?.mode !== 'three' ? 'active' : ''}
                  disabled={scopeBusy}
                  onClick={() => {
                    if (analyticsScope?.mode === 'teachers' || scopeBusy) return;
                    setScopeBusy(true);
                    void eaSetAnalyticsScope('teachers')
                      .then(() => {
                        invalidateSharedEaMe();
                        return loadEaMe(undefined, true);
                      })
                      .then((me) => {
                        setCaps(me.capabilities || null);
                        setHasTeacher(Boolean(me.teacher));
                        setAnalyticsScope(me.analytics_scope || { mode: 'teachers', can_manage: true });
                      })
                      .finally(() => setScopeBusy(false));
                  }}
                >
                  Всем учителям
                </button>
                <button
                  type="button"
                  className={analyticsScope?.mode === 'three' ? 'active' : ''}
                  disabled={scopeBusy}
                  onClick={() => {
                    if (analyticsScope?.mode === 'three' || scopeBusy) return;
                    setScopeBusy(true);
                    void eaSetAnalyticsScope('three')
                      .then(() => {
                        invalidateSharedEaMe();
                        return loadEaMe(undefined, true);
                      })
                      .then((me) => {
                        setCaps(me.capabilities || null);
                        setHasTeacher(Boolean(me.teacher));
                        setAnalyticsScope(me.analytics_scope || { mode: 'three', can_manage: true });
                      })
                      .finally(() => setScopeBusy(false));
                  }}
                >
                  Только троим
                </button>
              </div>
            ) : null}
          </header>
          <nav className="ea-nav" aria-label="Рабочий стол английского">
            <NavLink
              to={homeTo}
              end
              className={({ isActive }) => (isActive || onEnglishDesk ? 'active' : '')}
              {...prefetchPointerHandlers(homeTo)}
            >
              Группы
            </NavLink>
            {showAnalytics ? (
              <NavLink
                to={analyticsTo}
                className={({ isActive }) => (isActive || onAnalytics ? 'active' : '')}
                {...prefetchPointerHandlers(analyticsTo)}
              >
                Аналитика
              </NavLink>
            ) : null}
            {showContingent ? (
              <NavLink to={`${eaBase}/directory${eaSearch}`} {...prefetchPointerHandlers(`${eaBase}/directory`)}>
                Контингент
              </NavLink>
            ) : null}
            {showSpecs ? (
              <NavLink
                to={`${eaBase}/specs${eaSearch}`}
                className={({ isActive }) => (isActive || onSpecs ? 'active' : '')}
                {...prefetchPointerHandlers(`${eaBase}/specs`)}
              >
                Спецификации
              </NavLink>
            ) : null}
            {showImport ? (
              <NavLink to={`${eaBase}/import${eaSearch}`} {...prefetchPointerHandlers(`${eaBase}/import`)}>
                Импорт
              </NavLink>
            ) : null}
            {showRating ? (
              <NavLink
                to={`${eaBase}/rating${eaSearch}`}
                className={({ isActive }) => (isActive || onRating ? 'active' : '')}
                {...prefetchPointerHandlers(`${eaBase}/rating`)}
              >
                Рейтинг
              </NavLink>
            ) : null}
          </nav>
          <Suspense fallback={<EnglishSectionFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </PulseCabinetShell>
    </EaPathsProvider>
  );
}
