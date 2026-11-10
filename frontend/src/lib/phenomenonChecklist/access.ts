/**
 * Доступ к чек-листу феноменального урока, пока он не открыт для всех.
 * Список участников хранится только на сервере: интерфейс узнаёт ответ, запросив результаты формы
 * (сервер отдаёт их только участникам пробного доступа). Ответ запоминается в sessionStorage,
 * чтобы меню кабинета, которое строится без запросов, могло показать пункт.
 */
import { getPublicLessonVisitForm, listLessonVisitResponses } from '../../api/visitChecklist';
import { API_BASE, parseJson, sessionHeaders } from '../../api/http';
import {
  PHENOMENON_FORM_TOKEN,
  PHENOMENON_OPEN_FOR_ALL,
  cachePhenomenonAccess as cacheAccess,
  type PhenomenonSubmission,
} from './form';

export { phenomenonMenuVisible, readCachedPhenomenonAccess } from './form';

export type PhenomenonAccess = 'open' | 'allowed' | 'denied';

let pending: Promise<{ access: PhenomenonAccess; projectId: number | null }> | null = null;

export function checkPhenomenonAccess(): Promise<{ access: PhenomenonAccess; projectId: number | null }> {
  if (pending) return pending;
  pending = (async () => {
    let projectId: number | null = null;
    try {
      projectId = (await getPublicLessonVisitForm(PHENOMENON_FORM_TOKEN)).project.id;
    } catch {
      projectId = null;
    }
    if (PHENOMENON_OPEN_FOR_ALL) return { access: 'open' as const, projectId };
    if (projectId == null) return { access: 'denied' as const, projectId };
    try {
      await listLessonVisitResponses(projectId);
      cacheAccess(true);
      return { access: 'allowed' as const, projectId };
    } catch {
      cacheAccess(false);
      return { access: 'denied' as const, projectId };
    }
  })();
  const result = pending;
  void result.finally(() => {
    pending = null;
  });
  return result;
}

/**
 * Отправка ответа. Пока форма закрыта, сервер проверяет сессию, поэтому запрос идёт с ней
 * (общий apiFetch для /api/public/ сессию убирает).
 */
export async function postPhenomenonResponse(payload: PhenomenonSubmission): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/api/public/lesson-visit-form/${encodeURIComponent(PHENOMENON_FORM_TOKEN)}/responses`, {
    method: 'POST',
    headers: sessionHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ response?: { id: number }; error?: string; message?: string }>(res);
  if (!res.ok || !data.response) throw new Error(data.message || data.error || res.statusText);
  return { id: data.response.id };
}
