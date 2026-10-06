import { memo } from 'react';
import LessonVisitChecklistDashboardPanel from '../../components/LessonVisitChecklistDashboardPanel';
import { cacheKeyForAnalyticsProject } from '../../lib/lessonVisitChecklist/prefetchVisitDashboardNarrative';
import { useVisitChecklistAnalytics } from './VisitChecklistAnalyticsContext';

function VisitChecklistSummaryTab() {
  const ws = useVisitChecklistAnalytics();

  if (!ws.teacherFilterKey || ws.analyticRows.length === 0) {
    return (
      <p className="muted card glass-surface" style={{ padding: '1rem' }}>
        Сводка появится после загрузки данных чек-листа.
      </p>
    );
  }

  return (
    <LessonVisitChecklistDashboardPanel
      embedded
      filteredRows={ws.sliceFilters.filteredRows}
      dashboardRows={ws.sliceFilters.dashboardRows}
      roles={ws.rolesForLessonMatrix}
      headers={ws.headers}
      rawRows={ws.rawRows}
      customLabels={ws.customLabels}
      ordinalLevels={ws.ordinalLevels}
      teacherFilterKey={ws.teacherFilterKey}
      filterSummary={ws.visitFilterSummaryRu}
      dashboardNarrative={ws.dashboardNarrative}
      dashboardNarrativeSource={ws.dashboardNarrativeSource}
      narrativeDraft={ws.makeDraftForBlocks(ws.activeTeacherBlocks)}
      narrativeCacheKey={`${cacheKeyForAnalyticsProject(ws.projectId)}:${ws.llmProvider}`}
      llmProvider={ws.llmProvider}
      disabled={ws.saveBusy}
      onDashboardNarrativeChange={(text, source) => {
        ws.setDashboardNarrative(text);
        ws.setDashboardNarrativeSource(source);
      }}
      onPersist={() => ws.scheduleNarrativePersist()}
    />
  );
}

export default memo(VisitChecklistSummaryTab);
