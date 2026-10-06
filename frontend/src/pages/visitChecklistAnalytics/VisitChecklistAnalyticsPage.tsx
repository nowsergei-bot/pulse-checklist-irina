import '../../styles/lessonAnalytics.css';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { displayLessonAnalyticsTitle } from '../../lib/documentTitle';
import type { LessonVisitChecklistConfig, LessonVisitDirectory } from '../../lib/lessonVisitChecklist/types';
import {
  VisitChecklistAnalyticsProvider,
  useVisitChecklistAnalytics,
} from './VisitChecklistAnalyticsContext';
import VisitChecklistPageHeader from './VisitChecklistPageHeader';
import VisitChecklistSaveDock from './VisitChecklistSaveDock';
import VisitChecklistTeachersTab from './VisitChecklistTeachersTab';
import './visitChecklistAnalytics.css';

const VisitChecklistSummaryTab = lazy(() => import('./VisitChecklistSummaryTab'));
const VisitChecklistSettingsTab = lazy(() => import('./VisitChecklistSettingsTab'));
const VisitChecklistPdfBuilderDialog = lazy(
  () => import('../visitChecklistCloud/pdfBuilder/VisitChecklistPdfBuilderDialog'),
);

export type VisitChecklistAnalyticsTab = 'teachers' | 'summary' | 'settings';

export type VisitChecklistAnalyticsPageProps = {
  projectId: number;
  visitProjectId: number;
  reloadToken?: number;
  visitTitle?: string;
  responseCount?: number;
  directorShareToken?: string | null;
  onResync?: () => Promise<void>;
  resyncBusy?: boolean;
  embedded?: boolean;
  checklist?: LessonVisitChecklistConfig | null;
  directory?: LessonVisitDirectory | null;
};

function VisitChecklistAnalyticsBody({
  embedded,
  checklist,
  directory,
}: Pick<VisitChecklistAnalyticsPageProps, 'embedded' | 'checklist' | 'directory'>) {
  const ws = useVisitChecklistAnalytics();
  useDocumentTitle(displayLessonAnalyticsTitle(ws.projectTitle));
  const [tab, setTab] = useState<VisitChecklistAnalyticsTab>('teachers');

  if (ws.loadErr) {
    return (
      <div className={embedded ? undefined : 'page'}>
        <div className="card glass-surface" style={{ marginTop: embedded ? 0 : '1rem' }}>
          <p className="err">{ws.loadErr}</p>
          <Link to={`/analytics/lesson-visit/project?project=${ws.visitProjectId}`} className="btn">
            Настройки проекта
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${embedded ? '' : 'page '}visit-checklist-analytics-page${ws.pdfCaptureBusy ? ' visit-checklist-analytics-page--busy' : ''}`}
    >
      {ws.pdfCaptureBusy ? (
        <div className="visit-checklist-analytics-busy-overlay" role="status" aria-live="polite">
          <p className="visit-checklist-analytics-busy-overlay__text">Формируем PDF…</p>
        </div>
      ) : null}

      <VisitChecklistPageHeader tab={tab} onTabChange={setTab} embedded={embedded} />

      <div className="visit-checklist-analytics-page__main card glass-surface" style={{ padding: '0.65rem 0.9rem' }}>
        {tab === 'teachers' ? <VisitChecklistTeachersTab /> : null}
        {tab === 'summary' ? (
          <Suspense
            fallback={
              <p className="muted" style={{ margin: 0 }}>
                Загрузка сводки…
              </p>
            }
          >
            <VisitChecklistSummaryTab />
          </Suspense>
        ) : null}
        {tab === 'settings' ? (
          <Suspense
            fallback={
              <p className="muted" style={{ margin: 0 }}>
                Загрузка настроек…
              </p>
            }
          >
            <VisitChecklistSettingsTab checklist={checklist} directory={directory} />
          </Suspense>
        ) : null}
      </div>

      <VisitChecklistSaveDock />

      {ws.pdfBuilderOpen && ws.pdfBuilderCard ? (
        <Suspense fallback={null}>
          <VisitChecklistPdfBuilderDialog
            open
            card={ws.pdfBuilderCard}
            context={ws.pdfBuilderContext ?? undefined}
            onClose={ws.closeTeacherPdfBuilder}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export default function VisitChecklistAnalyticsPage(props: VisitChecklistAnalyticsPageProps) {
  const { embedded, checklist, directory, ...providerArgs } = props;
  return (
    <VisitChecklistAnalyticsProvider {...providerArgs}>
      <VisitChecklistAnalyticsBody embedded={embedded} checklist={checklist} directory={directory} />
    </VisitChecklistAnalyticsProvider>
  );
}
