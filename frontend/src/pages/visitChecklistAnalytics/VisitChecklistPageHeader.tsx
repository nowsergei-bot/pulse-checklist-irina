import { memo } from 'react';
import { Link } from 'react-router-dom';
import { lessonVisitDirectorPublicUrl } from '../../api/visitChecklist';
import LlmProviderToggle from '../../components/LlmProviderToggle';
import { useVisitChecklistAnalyticsChrome } from './VisitChecklistAnalyticsContext';
import type { VisitChecklistAnalyticsTab } from './VisitChecklistAnalyticsPage';

type Props = {
  tab: VisitChecklistAnalyticsTab;
  onTabChange: (tab: VisitChecklistAnalyticsTab) => void;
  embedded?: boolean;
};

function VisitChecklistPageHeader({ tab, onTabChange, embedded }: Props) {
  const ws = useVisitChecklistAnalyticsChrome();
  const directorPublicUrl = ws.directorShareToken
    ? lessonVisitDirectorPublicUrl(ws.directorShareToken)
    : null;
  const teacherCount = ws.teacherCount;

  return (
    <div className="card glass-surface" style={{ marginTop: embedded ? 0 : '1rem' }}>
      <p className="admin-dash-kicker">Чек-лист посещения урока · Аналитика</p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.65rem',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <Link
          to={`/analytics/lesson-visit/project?project=${ws.visitProjectId}`}
          className="btn btn-sm"
        >
          ← Настройки проекта
        </Link>
        <Link to="/analytics/lesson-visit" className="btn btn-sm">
          К списку
        </Link>
        <Link
          to="/cabinet/visit-checklist"
          className="btn btn-sm"
          title="Чек-лист директора"
        >
          Чек-лист 2.0
        </Link>
        {ws.onResync ? (
          <button
            type="button"
            className="btn btn-sm primary"
            disabled={ws.resyncBusy}
            onClick={() => void ws.onResync?.()}
          >
            {ws.resyncBusy ? 'Обновление…' : 'Обновить из ответов'}
          </button>
        ) : null}
        <button type="button" className="btn btn-sm primary" disabled={ws.saveBusy} onClick={() => void ws.saveProject()}>
          {ws.saveBusy ? 'Сохранение…' : 'Сохранить'}
        </button>
        {directorPublicUrl ? (
          <a href={directorPublicUrl} className="btn btn-sm" target="_blank" rel="noreferrer">
            Страница для руководителя
          </a>
        ) : null}
        <LlmProviderToggle value={ws.llmProvider} onToggle={ws.onToggleLlmProvider} />
        <input
          className="input"
          style={{ flex: '1 1 220px', minWidth: 180 }}
          value={ws.projectTitle}
          onChange={(e) => ws.setProjectTitle(e.target.value)}
          placeholder="Название проекта"
        />
      </div>

      <div
        className="visit-checklist-analytics-page__tabs"
        role="tablist"
        aria-label="Разделы аналитики чек-листа"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'teachers'}
          className={`btn btn-sm${tab === 'teachers' ? ' primary' : ''}`}
          onClick={() => onTabChange('teachers')}
        >
          Педагоги ({teacherCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'summary'}
          className={`btn btn-sm${tab === 'summary' ? ' primary' : ''}`}
          onClick={() => onTabChange('summary')}
        >
          Сводка
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'settings'}
          className={`btn btn-sm${tab === 'settings' ? ' primary' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          Настройки
        </button>
      </div>

      {ws.responseCount != null ? (
        <p className="muted" style={{ marginTop: '0.55rem', fontSize: '0.82rem', marginBottom: 0 }}>
          Ответов в чек-листе: {ws.responseCount}. Карточки и срезы сохраняются на сервер — для новых ответов нажмите
          «Обновить из ответов».
        </p>
      ) : null}
      {ws.saveMsg ? (
        <p className={ws.saveMsg.includes('Ошиб') ? 'err' : 'muted'} style={{ marginTop: '0.45rem', fontSize: '0.85rem' }}>
          {ws.saveMsg}
        </p>
      ) : null}
      {ws.err ? (
        <p className="err" style={{ marginTop: '0.45rem', fontSize: '0.85rem' }}>
          {ws.err}
        </p>
      ) : null}
    </div>
  );
}

export default memo(VisitChecklistPageHeader);
