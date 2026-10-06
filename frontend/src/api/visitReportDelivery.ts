import { API_BASE, apiFetch, adminHeaders, parseJson, apiErrText } from './http';

export type VisitReportRecord = {
  checklist: { checklist_id: string; lesson_id: string; revision: number; source: string; form_version: string;
    answers: Record<string, { selected_options: { id: string; label: string }[]; text: string }> };
  author?: string; assessment_id?: string; assessment_policy_version?: string;
  result?: { value: unknown; display: string; maximum: number | null; status: string };
  results: { code: string; score: number | null; max_score: number | null; status: string; reason?: string }[];
};
export type VisitReportSnapshot = {
  snapshot_id: string; lesson_id: string; version?: number; sent_at?: string; opened_at?: string;
  aggregation_version: string; sender_user_id: number;
  snapshot: {
    lesson: Record<string, unknown>; recipient_name: string; teacher_user_id: number;
    aggregation_version: string; assessment_ids: string[];
    checklists: VisitReportRecord[]; manager_comment: string;
    result: { complete: boolean; final?: number | { numerator: number | string; denominator: number | string } | null;
      maximum?: number | null; status: string; display?: string };
    attention: { code: string; label?: string; title?: string; display?: string; maximum?: number | null; reason?: string }[];
  };
};
export type VisitReportListItem = Pick<VisitReportSnapshot,'snapshot_id'|'lesson_id'|'version'|'sent_at'|'opened_at'|'sender_user_id'> & {
  sender_name: string; historical: boolean; lesson: Record<string, unknown>;
};

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(`${API_BASE}/api/visit-reports${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: adminHeaders(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await parseJson<T & { error?: string; message?: string }>(response);
  if (!response.ok) throw new Error(apiErrText(payload,response.statusText));
  return payload;
}
export const previewVisitReport = (lessonId: string, comment: string) => request<VisitReportSnapshot>(`/lessons/${encodeURIComponent(lessonId)}/preview`, { comment });
export const sendVisitReport = (snapshotId: string, requestKey: string) => request<VisitReportSnapshot>('/send', { snapshot_id: snapshotId, request_key: requestKey });
export const visitReportStatus = (lessonId: string) => request<{ status: string; sent_at?: string; sender_user_id?: number; sender_name?: string; error?: string }>(`/lessons/${encodeURIComponent(lessonId)}/status`);
export const listMyVisitReports = () => request<{ reports: VisitReportListItem[] }>('/me');
export const getMyVisitReport = (snapshotId: string) => request<VisitReportSnapshot>(`/me/${encodeURIComponent(snapshotId)}`);
export const markMyVisitReportOpened = (snapshotId: string) => request<VisitReportSnapshot>(`/me/${encodeURIComponent(snapshotId)}/opened`, {});
export const getVisitReportStatuses = (params: URLSearchParams) => request<{statuses: {
  lesson_id: string; status: string; sent_at?: string; sender_name?: string; version?: number; action?: string; error?: string;
}[]}>(`/statuses?${params}`);

export async function downloadVisitReportExcel(params: URLSearchParams, kind: 'full'|'branded'|'table',expectedVersion?: string) {
  const query = new URLSearchParams(params);
  query.delete('page'); query.delete('page_size'); query.set('kind',kind);
  if (expectedVersion) query.set('expected_aggregation_version',expectedVersion);
  let response = await apiFetch(`${API_BASE}/api/visit-reports/export?${query}`, { headers: adminHeaders() });
  if (response.status === 202) {
    const queued = await parseJson<{job:{id:string;status:string}}>(response);
    const started = Date.now();
    while (Date.now()-started < 20*60*1000) {
      const job=await request<{id:string;status:string;error?:string}>(`/export-jobs/${queued.job.id}`);
      if (job.status==='failed') throw new Error(job.error || 'Ошибка фоновой выгрузки');
      if (job.status==='completed') {
        response=await apiFetch(`${API_BASE}/api/visit-reports/export-jobs/${job.id}/file`,{headers:adminHeaders()});
        break;
      }
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    if (response.status===202) throw new Error('Фоновая выгрузка ожидает обработки. Повторите скачивание позже.');
  }
  if (!response.ok) {
    const payload = await parseJson<{ error?: string; message?: string }>(response);
    throw new Error(apiErrText(payload,response.statusText));
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url; link.download = `Пульс-${kind}.xlsx`; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
