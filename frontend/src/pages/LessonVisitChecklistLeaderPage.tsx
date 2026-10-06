import '../styles/lessonAnalytics.css';
import '../styles/excelAnalytics.css';
import { startTransition, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { type LessonAnalyticsDraft } from '../api/lessonAnalytics';
import LessonVisitChecklistDirectorView from '../components/LessonVisitChecklistDirectorView';
import {
  fetchPublicLeaderProject,
  peekCachedLeaderProject,
} from '../lib/lessonVisitChecklist/leaderProjectCache';
import { cacheKeyForLeaderToken } from '../lib/lessonVisitChecklist/prefetchVisitDashboardNarrative';
import { prefetchLeaderPageModule } from '../lib/lessonVisitChecklist/prefetchLeaderPage';
import { yieldToMain } from '../lib/yieldToMain';
import { displayVisitChecklistTitle, VISIT_CHECKLIST_TITLE } from '../lib/lessonVisitChecklist/normalizeChecklist';

function LeaderPageShell({ title, refreshing }: { title?: string; refreshing?: boolean }) {
  return (
    <div className="page lesson-visit-director-page">
      <div className="card glass-surface" style={{ marginTop: '1rem' }}>
        <p className="admin-dash-kicker">Просмотр для руководителя · Чек-лист посещения урока</p>
        <h1 className="admin-dash-title">{displayVisitChecklistTitle(title) || VISIT_CHECKLIST_TITLE}</h1>
        <p className="muted" style={{ marginTop: '0.65rem' }}>
          {refreshing ? 'Обновление данных…' : 'Подготовка сводки…'}
        </p>
      </div>
    </div>
  );
}

/** Публичная сводка по чек-листу посещения урока для руководителя (без входа в админку). */
export default function LessonVisitChecklistLeaderPage() {
  const { token: rawToken } = useParams();
  const token = rawToken ? decodeURIComponent(rawToken) : '';
  const cached = token ? peekCachedLeaderProject(token) : null;

  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<LessonAnalyticsDraft | null>(cached?.draft ?? null);
  const [projectTitle, setProjectTitle] = useState(displayVisitChecklistTitle(cached?.project.title));
  const [updatedAt, setUpdatedAt] = useState<string | null>(cached?.project.updated_at ?? null);
  const [viewReady, setViewReady] = useState(Boolean(cached?.draft));

  useEffect(() => {
    prefetchLeaderPageModule();
  }, []);

  useEffect(() => {
    if (!token) {
      setLoadErr('Некорректная ссылка.');
      return;
    }
    let cancelled = false;
    const hadCache = Boolean(peekCachedLeaderProject(token));
    void (async () => {
      if (hadCache) setRefreshing(true);
      setLoadErr(null);
      try {
        const { project, draft: d } = await fetchPublicLeaderProject(token);
        if (cancelled) return;
        setProjectTitle(displayVisitChecklistTitle(project.title));
        setUpdatedAt(project.updated_at);
        setDraft(d);
        await yieldToMain();
        if (!cancelled) startTransition(() => setViewReady(true));
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : 'Не удалось загрузить');
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!draft || viewReady) return;
    let cancelled = false;
    void (async () => {
      await yieldToMain();
      if (!cancelled) startTransition(() => setViewReady(true));
    })();
    return () => {
      cancelled = true;
    };
  }, [draft, viewReady]);

  if (loadErr && !draft) {
    return (
      <div className="page">
        <div className="card glass-surface" style={{ marginTop: '1rem' }}>
          <p className="err">{loadErr}</p>
        </div>
      </div>
    );
  }

  if (!draft || !viewReady) {
    return <LeaderPageShell title={projectTitle} refreshing={refreshing && Boolean(cached)} />;
  }

  return (
    <LessonVisitChecklistDirectorView
      projectTitle={projectTitle}
      updatedAt={updatedAt}
      draft={draft}
      narrativeCacheKey={token ? cacheKeyForLeaderToken(token) : null}
    />
  );
}
