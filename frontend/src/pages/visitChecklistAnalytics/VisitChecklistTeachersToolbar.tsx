import { memo } from 'react';
import { useVisitChecklistAnalytics } from './VisitChecklistAnalyticsContext';

function VisitChecklistTeachersToolbar() {
  const ws = useVisitChecklistAnalytics();

  return (
    <>
      {ws.aiProgress.running ? (
        <>
          <button type="button" className="btn btn-sm danger" onClick={() => ws.stopAiBatchForAllTeachers()}>
            Остановить ИИ
          </button>
          <button
            type="button"
            className="btn btn-sm primary"
            disabled={!ws.teacherFilterKey || ws.aiQueueSelectedCount === 0}
            onClick={() => ws.startAiQueueSelected()}
          >
            Добавить в очередь ({ws.aiQueueSelectedCount})
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={ws.displayTeacherBlocks.length === 0}
            onClick={ws.selectAllVisibleForAiQueue}
          >
            Выбрать всех видимых
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={ws.aiQueueSelectedCount === 0}
            onClick={ws.clearAiQueueSelection}
          >
            Снять выбор
          </button>
        </>
      ) : (
        <>
          {ws.aiCardsMissingCount > 0 ? (
            <button
              type="button"
              className="btn btn-sm primary"
              disabled={!ws.teacherFilterKey || ws.analysisBusy}
              onClick={() => ws.startAiBatchForAllTeachers()}
            >
              ИИ для всех без текста ({ws.aiCardsMissingCount})
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm"
            disabled={!ws.teacherFilterKey || ws.analysisBusy || ws.displayTeacherBlocks.length === 0}
            onClick={() => ws.startAiRerunAllVisible()}
          >
            Переанализировать видимых ({ws.displayTeacherBlocks.length})
          </button>
          <button
            type="button"
            className="btn btn-sm primary"
            disabled={!ws.teacherFilterKey || ws.analysisBusy || ws.aiQueueSelectedCount === 0}
            onClick={() => ws.startAiQueueSelected()}
          >
            В очередь: выбранные ({ws.aiQueueSelectedCount})
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={ws.displayTeacherBlocks.length === 0}
            onClick={ws.selectAllVisibleForAiQueue}
          >
            Выбрать всех видимых
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={ws.aiQueueSelectedCount === 0}
            onClick={ws.clearAiQueueSelection}
          >
            Снять выбор
          </button>
        </>
      )}
      <button
        type="button"
        className="btn btn-sm"
        disabled={ws.cardArchiveHydrateBusy || !ws.teacherFilterKey || ws.analysisBusy}
        onClick={() => void ws.hydrateCardsFromArchive()}
      >
        {ws.cardArchiveHydrateBusy ? 'Архив ИИ…' : 'Подгрузить ИИ из архива'}
      </button>
      <button
        type="button"
        className="btn btn-sm primary"
        disabled={ws.zipBusy || !ws.activeTeacherBlocks.some((b) => b.status === 'agreed')}
        onClick={() => void ws.downloadAgreedZip()}
      >
        {ws.zipBusy ? 'Архив…' : 'Скачать ZIP (согласованные PDF)'}
      </button>
      <button
        type="button"
        className="btn btn-sm"
        disabled={ws.cardArchiveBusy}
        onClick={() => void ws.refreshCardArchiveList()}
      >
        {ws.cardArchiveBusy ? 'Архив карточек…' : 'Архив карточек (JSON)'}
      </button>
    </>
  );
}

export default memo(VisitChecklistTeachersToolbar);
