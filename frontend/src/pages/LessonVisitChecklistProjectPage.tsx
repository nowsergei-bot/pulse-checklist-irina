import '../styles/lessonAnalytics.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { getLessonVisitProject, lessonVisitDirectorPublicUrl, lessonVisitFormPublicUrl, putLessonVisitProject } from '../api/visitChecklist';
import DirectorShareLinkRow from '../components/DirectorShareLinkRow';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usePrefetchVisitAnalyticsPage } from '../hooks/usePrefetchVisitAnalyticsPage';
import { prefetchVisitAnalyticsFromVisitProjectId } from '../lib/lessonVisitChecklist/prefetchAnalyticsProject';
import type {
  LessonVisitChecklistConfig,
  LessonVisitDepartment,
  LessonVisitDraft,
  LessonVisitGeneralField,
  LessonVisitMediaPhoto,
  LessonVisitQuestion,
  LessonVisitSection,
  LessonVisitTeacher,
} from '../lib/lessonVisitChecklist/types';
import { defaultLessonVisitDirectory } from '../lib/lessonVisitChecklist/types';
import { resolvePublicLessonVisitDirectory } from '../lib/lessonVisitChecklist/resolvePublicDirectory';
import { displayVisitChecklistTitle, normalizeSavedChecklist } from '../lib/lessonVisitChecklist/normalizeChecklist';
import { prefetchAnalyticsProjectById } from '../lib/lessonVisitChecklist/prefetchAnalyticsProject';
import { syncLessonVisitToAnalytics } from '../lib/lessonVisitChecklist/syncLessonVisitToAnalytics';

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function LessonVisitChecklistProjectPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectIdRaw = searchParams.get('project');
  const projectId = projectIdRaw && /^\d+$/.test(projectIdRaw) ? Number(projectIdRaw) : NaN;

  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [title, setTitle] = useState('Чек-лист посещения урока');
  useDocumentTitle(title);
  const [draft, setDraft] = useState<LessonVisitDraft | null>(null);
  const [formToken, setFormToken] = useState('');
  const [directorToken, setDirectorToken] = useState<string | null>(null);
  const [responseCount, setResponseCount] = useState(0);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const tabParam = searchParams.get('tab');
  const tab: 'checklist' | 'directory' | 'analytics' =
    tabParam === 'directory' || tabParam === 'analytics' ? tabParam : 'checklist';
  const setTab = (next: 'checklist' | 'directory' | 'analytics') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'checklist') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    if (!Number.isFinite(projectId)) return;
    prefetchVisitAnalyticsFromVisitProjectId(projectId);
  }, [projectId]);

  const analyticsPrefetch = usePrefetchVisitAnalyticsPage(Number.isFinite(projectId) ? projectId : null);

  useEffect(() => {
    if (!Number.isFinite(projectId)) {
      setLoadErr('Укажите ?project=ID в адресе.');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { project, draft: d } = await getLessonVisitProject(projectId);
        if (cancelled) return;
        setTitle(displayVisitChecklistTitle(project.title || d.title));
        const withSeedDirectory = {
          ...d,
          title: displayVisitChecklistTitle(d.title),
          directory: resolvePublicLessonVisitDirectory(d.directory, defaultLessonVisitDirectory()),
        };
        setDraft(
          withSeedDirectory.checklist
            ? {
                ...withSeedDirectory,
                checklist: normalizeSavedChecklist(withSeedDirectory.checklist) ?? withSeedDirectory.checklist,
              }
            : withSeedDirectory,
        );
        setFormToken(project.form_token);
        setDirectorToken(project.director_share_token ?? null);
        setResponseCount(project.response_count ?? 0);
        setLoadErr(null);
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : 'Не удалось загрузить');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    const laId = draft?.lessonAnalyticsProjectId;
    if (Number.isFinite(laId ?? NaN)) prefetchAnalyticsProjectById(laId);
  }, [draft?.lessonAnalyticsProjectId]);

  const formUrl = useMemo(() => (formToken ? lessonVisitFormPublicUrl(formToken) : ''), [formToken]);
  const directorUrl = useMemo(() => {
    const tok = draft?.lessonAnalyticsDirectorToken || directorToken;
    return tok ? lessonVisitDirectorPublicUrl(tok) : null;
  }, [draft?.lessonAnalyticsDirectorToken, directorToken]);

  const persist = useCallback(
    async (next: LessonVisitDraft, nextTitle: string) => {
      if (!Number.isFinite(projectId)) return;
      setSaveBusy(true);
      setSaveMsg(null);
      try {
        const { project, draft: saved } = await putLessonVisitProject(projectId, {
          title: nextTitle,
          draft: { ...next, updatedAt: new Date().toISOString() },
        });
        setDraft(
          saved.checklist
            ? {
                ...saved,
                title: displayVisitChecklistTitle(saved.title),
                checklist: normalizeSavedChecklist(saved.checklist) ?? saved.checklist,
              }
            : { ...saved, title: displayVisitChecklistTitle(saved.title) },
        );
        setTitle(displayVisitChecklistTitle(project.title));
        setResponseCount(project.response_count ?? 0);
        setSaveMsg('Сохранено');
        setTimeout(() => setSaveMsg(null), 2200);
      } catch (e) {
        setSaveMsg(e instanceof Error ? e.message : 'Ошибка сохранения');
      } finally {
        setSaveBusy(false);
      }
    },
    [projectId],
  );

  const onSyncAnalytics = async () => {
    if (!draft) return;
    setSyncBusy(true);
    setSaveMsg(null);
    try {
      const { responseCount: cnt } = await syncLessonVisitToAnalytics(projectId, draft);
      setResponseCount(cnt);
      setSaveMsg(`Аналитика обновлена (${cnt} ответов)`);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Не удалось синхронизировать');
    } finally {
      setSyncBusy(false);
    }
  };

  const updateChecklist = (checklist: LessonVisitChecklistConfig) => {
    if (!draft) return;
    setDraft({ ...draft, checklist });
  };

  const updateDirectory = (directory: { departments: LessonVisitDepartment[]; teachers: LessonVisitTeacher[] }) => {
    if (!draft) return;
    setDraft({ ...draft, directory });
  };

  const updatePhotos = (photos: LessonVisitMediaPhoto[]) => {
    if (!draft) return;
    setDraft({ ...draft, media: photos.length ? { photos } : undefined });
  };

  if (!Number.isFinite(projectId)) {
    return (
      <div className="page">
        <div className="card glass-surface" style={{ marginTop: '1rem' }}>
          <p className="err">{loadErr}</p>
          <Link to="/analytics/lesson-visit" className="btn">
            К списку
          </Link>
        </div>
      </div>
    );
  }

  if (loadErr || !draft) {
    return (
      <div className="page">
        <div className="card glass-surface" style={{ marginTop: '1rem' }}>
          <p className="err">{loadErr || 'Загрузка…'}</p>
        </div>
      </div>
    );
  }

  if (tab === 'analytics') {
    return <Navigate to={`/analytics/lesson-visit/dashboard?project=${projectId}`} replace />;
  }

  return (
    <div className="page lesson-visit-project-page">
      <section className="card glass-surface">
        <p className="admin-dash-kicker">Чек-лист посещения урока</p>
        <h1 className="admin-dash-title">{title}</h1>
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          Ответов: {responseCount}. После изменений нажмите «Сохранить», затем «Обновить аналитику» перед открытием
          Чек-лист 2.0.
        </p>
        <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <Link to="/analytics/lesson-visit" className="btn btn-sm">
            ← К списку
          </Link>
          <Link
            ref={analyticsPrefetch.ref}
            to={`/analytics/lesson-visit/dashboard?project=${projectId}`}
            className="btn btn-sm primary"
            title="Облачный дашборд чек-листа"
            onMouseEnter={analyticsPrefetch.onMouseEnter}
            onFocus={analyticsPrefetch.onFocus}
            onTouchStart={analyticsPrefetch.onTouchStart}
          >
            Чек-лист 2.0
          </Link>
          <Link
            to="/cabinet/visit-checklist"
            className="btn btn-sm"
            title="Лёгкий просмотр аналитики Чек-лист 3.0"
          >
            Чек-лист 3.0
          </Link>
          <button type="button" className="btn btn-sm" disabled={syncBusy} onClick={() => void onSyncAnalytics()}>
            {syncBusy ? 'Синхронизация…' : 'Обновить аналитику'}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={saveBusy}
            onClick={() => void persist(draft, title)}
          >
            {saveBusy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
        {saveMsg ? (
          <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            {saveMsg}
          </p>
        ) : null}
      </section>

      <section className="card glass-surface" style={{ marginTop: '1rem' }}>
        <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Название проекта
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </section>

      <section className="card glass-surface" style={{ marginTop: '1rem' }}>
        <h2 className="admin-dash-title" style={{ fontSize: '1.1rem' }}>
          Ссылки
        </h2>
        {formUrl ? (
          <DirectorShareLinkRow label="Публичная форма чек-листа" url={formUrl} />
        ) : null}
        {directorUrl ? (
          <DirectorShareLinkRow label="Сводка для руководителя (чек-лист)" url={directorUrl} />
        ) : null}
        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          <input
            type="checkbox"
            checked={draft.allowMultipleResponses !== false}
            onChange={(e) => setDraft({ ...draft, allowMultipleResponses: e.target.checked })}
            style={{ marginRight: 8 }}
          />
          Разрешить повторное заполнение с одного устройства
        </label>
        <p className="muted" style={{ marginTop: '0.35rem', marginBottom: 0, fontSize: '0.88rem' }}>
          {draft.allowMultipleResponses !== false
            ? 'После отправки на форме будет кнопка «Заполнить ещё раз» — каждая отправка сохраняется отдельным ответом.'
            : 'Повторная отправка с этого браузера будет недоступна после первого прохождения.'}
        </p>
      </section>

      <section className="card glass-surface" style={{ marginTop: '1rem' }}>
        <MediaPhotosEditor photos={draft.media?.photos || []} onChange={updatePhotos} />
      </section>

      <section className="card glass-surface" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn-sm${tab === 'checklist' ? ' primary' : ''}`}
            onClick={() => setTab('checklist')}
          >
            Структура чек-листа
          </button>
          <button
            type="button"
            className={`btn btn-sm${tab === 'directory' ? ' primary' : ''}`}
            onClick={() => setTab('directory')}
          >
            Кафедры и педагоги
          </button>
          <Link
            ref={analyticsPrefetch.ref}
            to="/cabinet/visit-checklist"
            className="btn btn-sm"
            onMouseEnter={analyticsPrefetch.onMouseEnter}
            onFocus={analyticsPrefetch.onFocus}
            onTouchStart={analyticsPrefetch.onTouchStart}
          >
            Готовые карточки
          </Link>
        </div>

        {tab === 'checklist' ? (
          <ChecklistEditor checklist={draft.checklist} onChange={updateChecklist} />
        ) : (
          <DirectoryEditor directory={draft.directory} onChange={updateDirectory} />
        )}
      </section>
    </div>
  );
}

const GENERAL_FIELD_TYPE_LABEL: Record<LessonVisitGeneralField['type'], string> = {
  text: 'Текст',
  date: 'Дата',
  radio: 'Один вариант',
  select: 'Список (select)',
  department: 'Кафедра (справочник)',
  teacher: 'Педагог (справочник)',
};

const QUESTION_TYPE_LABEL: Record<LessonVisitQuestion['type'], string> = {
  radio: 'Один вариант',
  checkbox: 'Несколько',
  text: 'Текст',
};

function swapItems<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function ChecklistEditor({
  checklist,
  onChange,
}: {
  checklist: LessonVisitChecklistConfig;
  onChange: (c: LessonVisitChecklistConfig) => void;
}) {
  const patchGeneral = (idx: number, patch: Partial<LessonVisitGeneralField>) => {
    const generalFields = checklist.generalFields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onChange({ ...checklist, generalFields });
  };

  const removeGeneral = (idx: number) => {
    const f = checklist.generalFields[idx];
    if (!window.confirm(`Удалить поле «${f.label}»?`)) return;
    onChange({ ...checklist, generalFields: checklist.generalFields.filter((_, i) => i !== idx) });
  };

  const addGeneral = () => {
    onChange({
      ...checklist,
      generalFields: [
        ...checklist.generalFields,
        { id: newId('gf'), label: 'Новое поле', type: 'text', required: false },
      ],
    });
  };

  const moveGeneral = (idx: number, dir: -1 | 1) => {
    onChange({ ...checklist, generalFields: swapItems(checklist.generalFields, idx, idx + dir) });
  };

  const patchSection = (sIdx: number, patch: Partial<LessonVisitSection>) => {
    const sections = checklist.sections.map((s, i) => (i === sIdx ? { ...s, ...patch } : s));
    onChange({ ...checklist, sections });
  };

  const removeSection = (sIdx: number) => {
    const sec = checklist.sections[sIdx];
    if (!window.confirm(`Удалить блок «${sec.title}» и все его вопросы (${sec.questions.length})?`)) return;
    onChange({ ...checklist, sections: checklist.sections.filter((_, i) => i !== sIdx) });
  };

  const addSection = () => {
    onChange({
      ...checklist,
      sections: [
        ...checklist.sections,
        {
          id: newId('sec'),
          code: String(checklist.sections.length + 1),
          title: 'Новый блок',
          questions: [],
        },
      ],
    });
  };

  const moveSection = (sIdx: number, dir: -1 | 1) => {
    onChange({ ...checklist, sections: swapItems(checklist.sections, sIdx, sIdx + dir) });
  };

  const patchQuestion = (sIdx: number, qIdx: number, patch: Partial<LessonVisitQuestion>) => {
    const sections = checklist.sections.map((s, si) => {
      if (si !== sIdx) return s;
      return {
        ...s,
        questions: s.questions.map((q, qi) => (qi === qIdx ? { ...q, ...patch } : q)),
      };
    });
    onChange({ ...checklist, sections });
  };

  const removeQuestion = (sIdx: number, qIdx: number) => {
    const q = checklist.sections[sIdx].questions[qIdx];
    if (!window.confirm(`Удалить вопрос «${q.text.slice(0, 80)}»?`)) return;
    patchSection(sIdx, {
      questions: checklist.sections[sIdx].questions.filter((_, i) => i !== qIdx),
    });
  };

  const moveQuestion = (sIdx: number, qIdx: number, dir: -1 | 1) => {
    const sec = checklist.sections[sIdx];
    patchSection(sIdx, { questions: swapItems(sec.questions, qIdx, qIdx + dir) });
  };

  const addQuestion = (sIdx: number) => {
    const sec = checklist.sections[sIdx];
    patchSection(sIdx, {
      questions: [
        ...sec.questions,
        {
          id: newId('q'),
          code: '',
          text: 'Новый вопрос',
          type: 'radio',
          required: false,
          options: [],
          allowMultiple: false,
        },
      ],
    });
  };

  return (
    <div className="lesson-visit-checklist-editor">
      <p className="muted" style={{ fontSize: '0.88rem', marginTop: 0 }}>
        Редактируйте блоки и вопросы, удаляйте лишнее, меняйте порядок. Не забудьте нажать «Сохранить» вверху страницы.
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem' }}>Общая информация</h3>
        <button type="button" className="btn btn-sm" onClick={addGeneral}>
          + Поле
        </button>
      </div>
      {checklist.generalFields.map((f, idx) => (
        <div
          key={f.id}
          style={{
            marginBottom: '0.65rem',
            padding: '0.5rem',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <strong style={{ fontSize: '0.88rem' }}>#{idx + 1}</strong>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm" disabled={idx === 0} onClick={() => moveGeneral(idx, -1)} title="Поднять">
                ↑
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={idx === checklist.generalFields.length - 1}
                onClick={() => moveGeneral(idx, 1)}
                title="Опустить"
              >
                ↓
              </button>
              <button type="button" className="btn btn-sm danger" onClick={() => removeGeneral(idx)}>
                Удалить
              </button>
            </div>
          </div>
          <input
            className="input"
            value={f.label}
            onChange={(e) => patchGeneral(idx, { label: e.target.value })}
            placeholder="Подпись поля"
            style={{ width: '100%', marginBottom: '0.35rem' }}
          />
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="input"
              value={f.type}
              onChange={(e) =>
                patchGeneral(idx, {
                  type: e.target.value as LessonVisitGeneralField['type'],
                  options:
                    e.target.value === 'radio' || e.target.value === 'select' ? f.options || [] : undefined,
                })
              }
            >
              {(Object.keys(GENERAL_FIELD_TYPE_LABEL) as LessonVisitGeneralField['type'][]).map((t) => (
                <option key={t} value={t}>
                  {GENERAL_FIELD_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.88rem' }}>
              <input
                type="checkbox"
                checked={f.required !== false}
                onChange={(e) => patchGeneral(idx, { required: e.target.checked })}
              />
              Обязательное
            </label>
          </div>
          {f.type === 'radio' || f.type === 'select' ? (
            <textarea
              className="input"
              rows={2}
              value={(f.options || []).join('\n')}
              onChange={(e) =>
                patchGeneral(idx, {
                  options: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean),
                })
              }
              placeholder="Варианты ответа (по одному в строке)"
              style={{ width: '100%', marginTop: '0.35rem' }}
            />
          ) : null}
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: '1rem', margin: '1.25rem 0 0.5rem' }}>Блоки анализа урока</h3>
        <button type="button" className="btn btn-sm" onClick={addSection}>
          + Блок
        </button>
      </div>
      {checklist.sections.map((sec, sIdx) => (
        <details key={sec.id} open style={{ marginBottom: '0.65rem', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '0.5rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
            {sec.code ? `${sec.code}. ` : ''}
            {sec.title}
            <span className="muted" style={{ fontWeight: 400, fontSize: '0.82rem', marginLeft: '0.5rem' }}>
              ({sec.questions.length} вопр.)
            </span>
          </summary>
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem', alignItems: 'center' }}>
              <input
                className="input"
                value={sec.code}
                onChange={(e) => patchSection(sIdx, { code: e.target.value })}
                style={{ width: 56 }}
                placeholder="№"
                title="Номер блока"
              />
              <input
                className="input"
                value={sec.title}
                onChange={(e) => patchSection(sIdx, { title: e.target.value })}
                style={{ flex: '1 1 200px' }}
                placeholder="Название блока"
              />
              <button type="button" className="btn btn-sm" disabled={sIdx === 0} onClick={() => moveSection(sIdx, -1)} title="Поднять блок">
                ↑
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={sIdx === checklist.sections.length - 1}
                onClick={() => moveSection(sIdx, 1)}
                title="Опустить блок"
              >
                ↓
              </button>
              <button type="button" className="btn btn-sm danger" onClick={() => removeSection(sIdx)}>
                Удалить блок
              </button>
            </div>

            {sec.questions.map((q, qIdx) => (
              <div
                key={q.id}
                style={{
                  marginBottom: '0.5rem',
                  padding: '0.45rem',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>
                    {q.code || `#${qIdx + 1}`} — {QUESTION_TYPE_LABEL[q.type]}
                  </strong>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={qIdx === 0}
                      onClick={() => moveQuestion(sIdx, qIdx, -1)}
                      title="Поднять"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={qIdx === sec.questions.length - 1}
                      onClick={() => moveQuestion(sIdx, qIdx, 1)}
                      title="Опустить"
                    >
                      ↓
                    </button>
                    <button type="button" className="btn btn-sm danger" onClick={() => removeQuestion(sIdx, qIdx)}>
                      Удалить
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    value={q.code}
                    onChange={(e) => patchQuestion(sIdx, qIdx, { code: e.target.value })}
                    style={{ width: 56 }}
                    placeholder="№"
                  />
                  <input
                    className="input"
                    value={q.text}
                    onChange={(e) => patchQuestion(sIdx, qIdx, { text: e.target.value })}
                    style={{ flex: '1 1 200px' }}
                    placeholder="Текст вопроса"
                  />
                  <select
                    className="input"
                    value={q.type}
                    onChange={(e) => {
                      const type = e.target.value as LessonVisitQuestion['type'];
                      patchQuestion(sIdx, qIdx, {
                        type,
                        allowMultiple: type === 'checkbox',
                        options: type === 'text' ? [] : q.options,
                      });
                    }}
                  >
                    {(Object.keys(QUESTION_TYPE_LABEL) as LessonVisitQuestion['type'][]).map((t) => (
                      <option key={t} value={t}>
                        {QUESTION_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                  <input
                    type="checkbox"
                    checked={q.required !== false}
                    onChange={(e) => patchQuestion(sIdx, qIdx, { required: e.target.checked })}
                  />
                  Обязательный ответ
                </label>
                <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: '0.35rem', fontSize: '0.85rem' }}>
                  Подсказка под вопросом (серый текст)
                  <textarea
                    className="input"
                    rows={2}
                    value={q.hint ?? ''}
                    onChange={(e) => patchQuestion(sIdx, qIdx, { hint: e.target.value })}
                    placeholder="Например: «Если ответ „да“ — следующий блок…» (необязательно)"
                    style={{ width: '100%' }}
                  />
                </label>
                {q.type !== 'text' ? (
                  <textarea
                    className="input"
                    rows={3}
                    value={q.options.join('\n')}
                    onChange={(e) =>
                      patchQuestion(sIdx, qIdx, {
                        options: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean),
                      })
                    }
                    placeholder="Варианты ответа (по одному в строке)"
                    style={{ width: '100%', marginTop: '0.35rem' }}
                  />
                ) : null}
              </div>
            ))}
            <button type="button" className="btn btn-sm" onClick={() => addQuestion(sIdx)}>
              + Вопрос
            </button>
          </div>
        </details>
      ))}
      {checklist.sections.length === 0 ? (
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          Блоков пока нет. Нажмите «+ Блок», чтобы добавить первый.
        </p>
      ) : null}
    </div>
  );
}

function DirectoryEditor({
  directory,
  onChange,
}: {
  directory: { departments: LessonVisitDepartment[]; teachers: LessonVisitTeacher[] };
  onChange: (d: { departments: LessonVisitDepartment[]; teachers: LessonVisitTeacher[] }) => void;
}) {
  const [deptFilter, setDeptFilter] = useState('');

  const filteredTeachers = useMemo(() => {
    if (!deptFilter) return directory.teachers;
    return directory.teachers.filter((t) => t.departmentId === deptFilter);
  }, [directory.teachers, deptFilter]);

  const removeTeacher = (realIdx: number) => {
    const t = directory.teachers[realIdx];
    if (!t) return;
    const label = t.name.trim() || 'пустую запись';
    if (!window.confirm(`Удалить педагога «${label}»?`)) return;
    onChange({ ...directory, teachers: directory.teachers.filter((_, i) => i !== realIdx) });
  };

  return (
    <div>
      <p className="muted" style={{ fontSize: '0.88rem' }}>
        Справочник из Excel «ФИО и кафедра» (лист «Уроки»). В форме: сначала кафедра, затем ФИО педагога.
      </p>
      <h3 style={{ fontSize: '1rem' }}>Кафедры ({directory.departments.length})</h3>
      <ul style={{ fontSize: '0.9rem', paddingLeft: '1.1rem' }}>
        {directory.departments.map((d, idx) => (
          <li key={d.id} style={{ marginBottom: '0.35rem' }}>
            <input
              className="input"
              value={d.name}
              onChange={(e) => {
                const departments = directory.departments.map((x, i) =>
                  i === idx ? { ...x, name: e.target.value } : x,
                );
                onChange({ ...directory, departments });
              }}
              style={{ width: 'min(100%, 420px)' }}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-sm"
        style={{ marginBottom: '1rem' }}
        onClick={() =>
          onChange({
            departments: [...directory.departments, { id: newId('dept'), name: 'Новая кафедра' }],
            teachers: directory.teachers,
          })
        }
      >
        + Кафедра
      </button>

      <h3 style={{ fontSize: '1rem' }}>Педагоги ({directory.teachers.length})</h3>
      <select className="input" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={{ marginBottom: '0.5rem' }}>
        <option value="">Все кафедры</option>
        {directory.departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '0.5rem' }}>
        {filteredTeachers.slice(0, 200).map((t) => {
          const realIdx = directory.teachers.indexOf(t);
          return (
            <div key={t.id} style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <input
                className="input"
                value={t.name}
                onChange={(e) => {
                  const teachers = directory.teachers.map((x, i) =>
                    i === realIdx ? { ...x, name: e.target.value } : x,
                  );
                  onChange({ ...directory, teachers });
                }}
                style={{ flex: '1 1 180px' }}
              />
              <select
                className="input"
                value={t.departmentId}
                onChange={(e) => {
                  const teachers = directory.teachers.map((x, i) =>
                    i === realIdx ? { ...x, departmentId: e.target.value } : x,
                  );
                  onChange({ ...directory, teachers });
                }}
              >
                {directory.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-sm danger"
                title="Удалить педагога"
                onClick={() => removeTeacher(realIdx)}
              >
                Удалить
              </button>
            </div>
          );
        })}
        {filteredTeachers.length > 200 ? (
          <p className="muted" style={{ fontSize: '0.82rem' }}>
            Показаны первые 200 записей. Отфильтруйте по кафедре.
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn-sm"
        style={{ marginTop: '0.5rem' }}
        onClick={() => {
          const deptId = directory.departments[0]?.id ?? newId('dept');
          onChange({
            ...directory,
            teachers: [...directory.teachers, { id: newId('teacher'), name: 'Новый педагог', departmentId: deptId }],
          });
        }}
      >
        + Педагог
      </button>
    </div>
  );
}

async function fileToResizedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxW = 1600;
  const maxH = 900;
  const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas не поддерживается');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
  bitmap.close?.();
  return dataUrl;
}

function MediaPhotosEditor({
  photos,
  onChange,
}: {
  photos: LessonVisitMediaPhoto[];
  onChange: (photos: LessonVisitMediaPhoto[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addPhotosFromFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const picked = Array.from(files).slice(0, 8);
      const mapped: LessonVisitMediaPhoto[] = [];
      for (const f of picked) {
        if (!f.type.startsWith('image/')) continue;
        const src = await fileToResizedDataUrl(f);
        mapped.push({ src, name: f.name });
      }
      onChange([...mapped, ...photos].slice(0, 12));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось обработать фото');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="admin-dash-title" style={{ fontSize: '1.1rem', marginTop: 0 }}>
        Фото на публичной форме
      </h2>
      <p className="muted" style={{ fontSize: '0.88rem', marginTop: '0.25rem' }}>
        Слайдшоу на странице чек-листа, как в опросах. Если фото не добавлены — показываются стандартные фото кампуса.
      </p>
      <div style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
        <label className="btn btn-sm">
          Добавить фото…
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => {
              void addPhotosFromFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <span className="muted">Добавлено: {photos.length}</span>
      </div>
      {err ? <p className="err" style={{ marginTop: '0.5rem' }}>{err}</p> : null}
      {photos.length > 0 ? (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          {photos.map((p, i) => (
            <div key={`${p.name || 'photo'}-${i}`} style={{ width: 140 }}>
              <img
                src={p.src}
                alt={p.name || ''}
                style={{
                  width: '100%',
                  height: 90,
                  objectFit: 'cover',
                  borderRadius: 12,
                  border: '1px solid rgba(17,24,39,0.10)',
                }}
              />
              <button
                type="button"
                className="btn btn-sm danger"
                style={{ marginTop: '0.35rem', width: '100%' }}
                onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
