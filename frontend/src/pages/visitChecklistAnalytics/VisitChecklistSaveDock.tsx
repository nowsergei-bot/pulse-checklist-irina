import { memo, useMemo } from 'react';
import AiWaitIndicator from '../../components/AiWaitIndicator';
import ViewportBottomDock from '../../components/ViewportBottomDock';
import { useVisitChecklistAnalytics } from './VisitChecklistAnalyticsContext';

function VisitChecklistSaveDock() {
  const ws = useVisitChecklistAnalytics();

  const lessonAnalyticsBarPct = useMemo(() => {
    const total = ws.activeTeacherBlocks.length;
    if (total <= 0) return 0;
    return Math.min(100, Math.round((ws.teacherBlocksWithAiCount / total) * 100));
  }, [ws.activeTeacherBlocks.length, ws.teacherBlocksWithAiCount]);

  const lessonAiProgressIndeterminate = ws.narrativeBusyId != null && !ws.aiProgress.running;
  const lessonAiDockHighlight = ws.aiProgress.running || ws.narrativeBusyId != null;

  return (
    <ViewportBottomDock>
      <div
        className={`leadership-pipeline-bar leadership-pipeline-bar--lesson-analytics-dock${
          lessonAiDockHighlight ? ' leadership-pipeline-bar--lesson-ai-active' : ''
        }`}
        role="region"
        aria-label="Сохранение проекта и ИИ по карточкам"
      >
        <div className="leadership-pipeline-bar__inner">
          <div
            className="leadership-pipeline-bar__track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={lessonAiProgressIndeterminate ? undefined : lessonAnalyticsBarPct}
            aria-valuetext={
              lessonAiProgressIndeterminate
                ? 'Формируется ответ ИИ'
                : ws.aiProgress.running
                  ? `${ws.aiProgress.filled} из ${ws.activeTeacherBlocks.length} карточек с ИИ-текстом`
                  : `${ws.teacherBlocksWithAiCount} из ${ws.activeTeacherBlocks.length} карточек с ИИ-текстом`
            }
          >
            <div
              className={
                lessonAiProgressIndeterminate
                  ? 'leadership-pipeline-bar__fill leadership-pipeline-bar__fill--indeterminate'
                  : 'leadership-pipeline-bar__fill'
              }
              style={lessonAiProgressIndeterminate ? undefined : { width: `${lessonAnalyticsBarPct}%` }}
            />
          </div>
          <div className="leadership-pipeline-bar__text">
            {!ws.teacherFilterKey || ws.activeTeacherBlocks.length === 0 ? (
              <span className="muted">Загрузите данные и дождитесь карточек педагогов</span>
            ) : ws.aiBackgroundStatusLine ? (
              <span>{ws.aiBackgroundStatusLine}</span>
            ) : (
              <span>
                Карточек: {ws.activeTeacherBlocks.length}; с ИИ-текстом:{' '}
                <strong>{ws.teacherBlocksWithAiCount}</strong>
              </span>
            )}
          </div>
          <AiWaitIndicator
            active={ws.aiProgress.running || ws.narrativeBusyId != null}
            compact
            className="lesson-analytics-dock-ai-wait"
            label="Фоновая ИИ-аналитика карточек"
            typicalMinSec={20}
            typicalMaxSec={75}
            slowAfterSec={90}
          />
          <div className="lesson-analytics-floating-bar">
            <div
              className="lesson-analytics-floating-bar__inner"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}
            >
              <button type="button" className="btn primary" disabled={ws.saveBusy} onClick={() => void ws.saveProject()}>
                {ws.saveBusy ? 'Сохранение…' : 'Сохранить на сервер'}
              </button>
              {ws.aiProgress.running ? (
                <button type="button" className="btn danger" onClick={() => ws.stopAiBatchForAllTeachers()}>
                  Остановить ИИ
                </button>
              ) : ws.aiCardsMissingCount > 0 ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={!ws.teacherFilterKey || ws.analysisBusy}
                  onClick={() => ws.startAiBatchForAllTeachers()}
                >
                  ИИ без текста ({ws.aiCardsMissingCount})
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </ViewportBottomDock>
  );
}

export default memo(VisitChecklistSaveDock);
