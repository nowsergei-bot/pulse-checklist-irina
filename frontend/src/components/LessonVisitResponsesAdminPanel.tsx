import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteLessonVisitResponse, listLessonVisitResponses } from '../api/visitChecklist';
import type {
  LessonVisitChecklistConfig,
  LessonVisitDirectory,
  LessonVisitResponseRow,
} from '../lib/lessonVisitChecklist/types';

const CONFIRM_TEXT = 'Удалить этот ответ? Действие необратимо.';

type Props = {
  projectId: number;
  checklist?: LessonVisitChecklistConfig | null;
  directory?: LessonVisitDirectory | null;
  /** Вызывается после успешного удаления — обновить счётчик и аналитику. */
  onChanged?: () => void | Promise<void>;
  /** Заголовок уже в <summary> родительского блока. */
  hideHeading?: boolean;
};

function formatRuDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolveLabel(id: string, checklist: LessonVisitChecklistConfig | null | undefined): string {
  const gf = checklist?.generalFields?.find((f) => f.id === id);
  return gf?.label || id;
}

function resolveTeacherName(
  teacherId: string,
  directory: LessonVisitDirectory | null | undefined,
): string {
  return directory?.teachers?.find((t) => t.id === teacherId)?.name || teacherId;
}

function resolveDepartmentName(
  deptId: string,
  directory: LessonVisitDirectory | null | undefined,
): string {
  return directory?.departments?.find((d) => d.id === deptId)?.name || deptId;
}

function rowSummary(
  row: LessonVisitResponseRow,
  checklist: LessonVisitChecklistConfig | null | undefined,
  directory: LessonVisitDirectory | null | undefined,
): string {
  const parts: string[] = [];
  const general = row.general || {};
  for (const [key, val] of Object.entries(general)) {
    if (!val) continue;
    const label = resolveLabel(key, checklist);
    let display = val;
    const field = checklist?.generalFields?.find((f) => f.id === key);
    if (field?.type === 'teacher') display = resolveTeacherName(val, directory);
    if (field?.type === 'department') display = resolveDepartmentName(val, directory);
    parts.push(`${label}: ${display}`);
    if (parts.join(' · ').length > 140) break;
  }
  if (!parts.length) {
    const ansCount = Object.keys(row.answers || {}).length;
    return ansCount ? `Ответов по чек-листу: ${ansCount}` : '—';
  }
  const joined = parts.join(' · ');
  return joined.length > 160 ? `${joined.slice(0, 159)}…` : joined;
}

export default function LessonVisitResponsesAdminPanel({
  projectId,
  checklist,
  directory,
  onChanged,
  hideHeading = false,
}: Props) {
  const [rows, setRows] = useState<LessonVisitResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(projectId)) return;
    setLoading(true);
    setErr(null);
    try {
      const list = await listLessonVisitResponses(projectId);
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось загрузить ответы');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
        return b.id - a.id;
      }),
    [rows],
  );

  const onDelete = async (responseId: number) => {
    if (!window.confirm(CONFIRM_TEXT)) return;
    setDeletingId(responseId);
    setErr(null);
    try {
      await deleteLessonVisitResponse(projectId, responseId);
      await load();
      await onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось удалить ответ');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section
      className={hideHeading ? 'admin-responses-panel' : 'card glass-surface admin-responses-panel'}
      aria-label="Список ответов чек-листа"
      style={hideHeading ? { marginTop: '0.75rem' } : undefined}
    >
      {hideHeading ? null : (
        <>
          <h2 className="results-fill-analytics-title" style={{ marginTop: 0 }}>
            Ответы чек-листа
          </h2>
          <p className="muted results-fill-analytics-lead">
            Удаление ответа обновит счётчик и аналитику уроков (после синхронизации).
          </p>
        </>
      )}
      {hideHeading ? (
        <p className="muted results-fill-analytics-lead" style={{ marginTop: 0 }}>
          Удаление ответа обновит счётчик и аналитику уроков (после синхронизации).
        </p>
      ) : null}
      {loading ? <p className="muted">Загрузка списка…</p> : null}
      {err ? <p className="err">{err}</p> : null}
      {!loading && sortedRows.length === 0 ? <p className="muted">Пока нет ответов.</p> : null}
      {sortedRows.length > 0 ? (
        <div className="admin-responses-table-wrap">
          <table className="admin-responses-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Дата</th>
                <th>Кратко</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{formatRuDate(row.created_at)}</td>
                  <td className="admin-responses-preview">{rowSummary(row, checklist, directory)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm danger"
                      disabled={deletingId === row.id}
                      onClick={() => void onDelete(row.id)}
                    >
                      {deletingId === row.id ? '…' : 'Удалить ответ'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
