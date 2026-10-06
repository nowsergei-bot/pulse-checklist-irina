import '../styles/lessonAnalytics.css';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteLessonVisitProject, lessonVisitDirectorPublicUrl, lessonVisitFormPublicUrl, listLessonVisitProjects, postLessonVisitProject } from '../api/visitChecklist';
import { type LessonVisitProjectRow } from '../api/visitChecklist';
import { emptyLessonVisitDraft } from '../lib/lessonVisitChecklist/types';
import { displayVisitChecklistTitle } from '../lib/lessonVisitChecklist/normalizeChecklist';
import { prefetchAnalyticsPageModule } from '../lib/lessonVisitChecklist/prefetchAnalyticsProject';
import { prefetchLeaderPage } from '../lib/lessonVisitChecklist/prefetchLeaderPage';
import { usePrefetchLeaderPage } from '../hooks/usePrefetchLeaderPage';
import { usePrefetchVisitAnalyticsPage } from '../hooks/usePrefetchVisitAnalyticsPage';

function DirectorLeaderLink({ url }: { url: string }) {
  const prefetch = usePrefetchLeaderPage(url);
  return (
    <a
      ref={prefetch.ref}
      href={url}
      className="btn btn-sm"
      target="_blank"
      rel="noreferrer"
      onMouseEnter={prefetch.onMouseEnter}
      onFocus={prefetch.onFocus}
      onTouchStart={prefetch.onTouchStart}
    >
      Ссылка для руководителя
    </a>
  );
}

function VisitAnalyticsLink({
  visitProjectId,
  className,
  children,
}: {
  visitProjectId: number;
  className?: string;
  children: ReactNode;
}) {
  const prefetch = usePrefetchVisitAnalyticsPage(visitProjectId);
  return (
    <Link
      ref={prefetch.ref}
      to={`/analytics/lesson-visit/dashboard?project=${visitProjectId}`}
      className={className}
      onMouseEnter={prefetch.onMouseEnter}
      onFocus={prefetch.onFocus}
      onTouchStart={prefetch.onTouchStart}
    >
      {children}
    </Link>
  );
}

function formatRuDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function LessonVisitChecklistHubPage() {
  const nav = useNavigate();
  const [projects, setProjects] = useState<LessonVisitProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await listLessonVisitProjects();
      setProjects(list);
    } catch (e) {
      setProjects([]);
      setErr(e instanceof Error ? e.message : 'Не удалось загрузить проекты');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    prefetchAnalyticsPageModule();
  }, []);

  useEffect(() => {
    for (const p of projects) {
      const directorToken = p.la_director_token || p.director_share_token;
      if (directorToken) prefetchLeaderPage(directorToken);
    }
  }, [projects]);

  const onCreate = async () => {
    setCreating(true);
    setErr(null);
    try {
      const seed = emptyLessonVisitDraft();
      const { project } = await postLessonVisitProject({ title: seed.title, draft: seed });
      nav(`/analytics/lesson-visit/project?project=${project.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось создать проект');
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: number, title: string) => {
    if (!window.confirm(`Удалить проект «${title || `№${id}`}»?`)) return;
    setDeletingId(id);
    try {
      await deleteLessonVisitProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось удалить');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page lesson-visit-hub-page">
      <section className="card glass-surface">
        <p className="admin-dash-kicker">Модуль аналитики</p>
        <h1 className="admin-dash-title">Чек-лист посещения урока</h1>
        <p className="muted admin-dash-lead">
          Онлайн-форма чек-листа: регистрация, 10 блоков анализа урока, кафедра и педагог из справочника.
          Ответы автоматически попадают в связанный проект — PDF, срезы и ссылка для руководителя.
        </p>
        <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
          <button type="button" className="btn primary" disabled={creating} onClick={() => void onCreate()}>
            {creating ? 'Создание…' : 'Новый проект'}
          </button>
          <button type="button" className="btn" disabled={loading} onClick={() => void refresh()}>
            Обновить список
          </button>
        </div>
        {err ? <p className="err" style={{ marginTop: '0.75rem' }}>{err}</p> : null}
      </section>

      <section className="card glass-surface" style={{ marginTop: '1rem' }}>
        <h2 className="admin-dash-title" style={{ fontSize: '1.15rem' }}>
          Сохранённые проекты
        </h2>
        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : projects.length === 0 ? (
          <p className="muted">Пока нет проектов — создайте новый с шаблоном из Excel-чек-листа.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {projects.map((p) => {
              const formUrl = p.form_token ? lessonVisitFormPublicUrl(p.form_token) : null;
              const directorToken = p.la_director_token || p.director_share_token;
              const directorUrl = directorToken ? lessonVisitDirectorPublicUrl(directorToken) : null;
              return (
                <li
                  key={p.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    padding: '0.85rem 0',
                    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                  }}
                >
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{displayVisitChecklistTitle(p.title) || `Проект #${p.id}`}</div>
                    <div className="muted" style={{ fontSize: '0.86rem', marginTop: 4 }}>
                      id {p.id} · ответов {p.response_count ?? 0} · изменён {formatRuDate(p.updated_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                    <Link to={`/analytics/lesson-visit/project?project=${p.id}`} className="btn btn-sm">
                      Настройки
                    </Link>
                    <VisitAnalyticsLink visitProjectId={p.id} className="btn btn-sm primary">
                      Аналитика
                    </VisitAnalyticsLink>
                    {formUrl ? (
                      <a href={formUrl} className="btn btn-sm" target="_blank" rel="noreferrer">
                        Форма опроса
                      </a>
                    ) : null}
                    {directorUrl ? <DirectorLeaderLink url={directorUrl} /> : null}
                    <button
                      type="button"
                      className="btn btn-sm danger"
                      disabled={deletingId === p.id}
                      onClick={() => void onDelete(p.id, p.title)}
                    >
                      {deletingId === p.id ? 'Удаление…' : 'Удалить'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
