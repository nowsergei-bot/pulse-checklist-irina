import type { SavedExcelSession } from '../lib/excelAnalytics/excelSessionStorage';
import type { ExcelNarrativeSummaryResponse, ExcelDashboardAiResponse } from '../types';

import { API_BASE, apiFetch, adminHeaders, parseJson } from './http';

function mergeAbortSignals(signals: (AbortSignal | undefined)[]): AbortSignal {
  const active = signals.filter((s): s is AbortSignal => Boolean(s));
  if (active.length === 0) return new AbortController().signal;
  if (typeof AbortSignal !== 'undefined' && 'any' in AbortSignal) {
    return AbortSignal.any(active);
  }
  const ac = new AbortController();
  for (const s of active) {
    if (s.aborted) {
      ac.abort();
      break;
    }
    s.addEventListener('abort', () => ac.abort(), { once: true });
  }
  return ac.signal;
}
import { LessonAnalyticsLlmProvider } from './lessonAnalytics';

export async function postExcelDashboardAi(
  payload: { action: string } & Record<string, unknown>,
): Promise<ExcelDashboardAiResponse> {
  const res = await apiFetch(`${API_BASE}/api/excel-dashboard-ai`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<ExcelDashboardAiResponse & { error?: string }>(res);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

/** ИИ: сгруппировать «сырые» значения одного фильтра (классы, метки) по смыслу. */

export async function postExcelNarrativeSummary(
  payload: {
    context: {
      numericSummary: string;
      extraContext?: string;
      facetLabels?: Record<string, string>;
      meta?: {
        filteredRowCount?: number;
        /** @deprecated use uniqueImportRows */
        uniqueLessonCount?: number;
        uniqueImportRows?: number;
        semanticLessonCount?: number;
      };
      /** standard (по умолчанию) | deep — расширенный отчёт | teacher_critical — жёсткая оценка одного педагога | visit_checklist — срез методиста по чек-листу | visit_checklist_teacher — карточка педагога по чек-листу */
      analysisMode?: 'standard' | 'deep' | 'teacher_critical' | 'visit_checklist' | 'visit_checklist_teacher';
      /** Человекочитаемое описание активных фильтров (параметры среза). */
      filterSummary?: string;
      /** Доп. пожелания к акцентам анализа. */
      userFocus?: string;
      /** Карточка педагога: меньший промпт и короче ответ (быстрее и ровнее). */
      fastMode?: boolean;
      /** closed (по умолчанию) | open — открытый API вместо закрытого контура Пульса. */
      llmProvider?: LessonAnalyticsLlmProvider;
    };
  },
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<ExcelNarrativeSummaryResponse> {
  const timeoutMs = options?.timeoutMs != null && options.timeoutMs > 0 ? options.timeoutMs : 0;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutController: AbortController | undefined;
  if (timeoutMs > 0) {
    timeoutController = new AbortController();
    timeoutTimer = setTimeout(() => timeoutController?.abort(), timeoutMs);
  }
  const signal = mergeAbortSignals([options?.signal, timeoutController?.signal]);
  try {
    const res = await apiFetch(`${API_BASE}/api/excel-narrative-summary`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(payload),
      signal,
    });
    const data = await parseJson<ExcelNarrativeSummaryResponse & { error?: string; message?: string }>(res);
    if (!res.ok) {
      if (res.status === 400) {
        throw new Error(
          data.message ||
            data.error ||
            'Запрос к ИИ отклонён (HTTP 400). Часто это слишком большой контекст по срезу — сузьте фильтры или опубликуйте актуальную Cloud Function.',
        );
      }
      throw new Error(data.error || data.message || res.statusText);
    }
    return data;
  } catch (e) {
    if (signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
      const sec = timeoutMs > 0 ? Math.round(timeoutMs / 1000) : 120;
      throw new Error(
        `Сервер ИИ не ответил за ${sec} с. Нажмите «Остановить ИИ» и повторите для этой карточки или сузьте срез фильтрами.`,
      );
    }
    throw e;
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}

/** Пакет ИИ-записок для директора по нескольким педагогам (или парам педагог+предмет); до 8 сегментов за запрос. */

export type ExcelAnalyticsProjectListItem = {
  id: number;
  title: string;
  fingerprint: string;
  file_name: string;
  sheet: string | null;
  updated_at: string;
};

export async function listExcelAnalyticsProjects(): Promise<ExcelAnalyticsProjectListItem[]> {
  const res = await apiFetch(`${API_BASE}/api/excel-analytics-projects`, { headers: adminHeaders() });
  const data = await parseJson<{ projects?: ExcelAnalyticsProjectListItem[]; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || res.statusText);
  return data.projects || [];
}

export async function getExcelAnalyticsProject(id: number): Promise<{
  id: number;
  title: string;
  session: SavedExcelSession;
  file_name: string;
  fingerprint: string;
}> {
  const res = await apiFetch(`${API_BASE}/api/excel-analytics-projects/${id}`, { headers: adminHeaders() });
  const data = await parseJson<{
    project?: { id: number; title: string; session: SavedExcelSession; file_name: string; fingerprint: string };
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(data.message || data.error || res.statusText);
  if (!data.project?.session) throw new Error('Нет данных проекта');
  return {
    id: data.project.id,
    title: data.project.title,
    session: data.project.session,
    file_name: data.project.file_name,
    fingerprint: data.project.fingerprint,
  };
}
