import { API_BASE, apiErrText, apiFetch, adminHeaders, parseJson } from './http.ts';
import type { CardPdfTemplate } from '../pages/visitChecklistCloud/pdfBuilder/types.ts';

export type VisitChecklistPdfTemplateRecord = {
  id: number;
  name: string;
  documentType: string;
  schemaVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  template: CardPdfTemplate;
  incompatible?: boolean;
};

type ErrBody = { error?: string; message?: string; revision?: number };

export async function listVisitChecklistPdfTemplates(): Promise<{
  templates: VisitChecklistPdfTemplateRecord[];
  defaultId: number | null;
}> {
  const res = await apiFetch(`${API_BASE}/api/visit-checklist-pdf/templates`, { headers: adminHeaders() });
  const data = await parseJson<{ templates?: VisitChecklistPdfTemplateRecord[]; defaultId?: number | null } & ErrBody>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return { templates: data.templates || [], defaultId: data.defaultId ?? null };
}

export async function createVisitChecklistPdfTemplate(body: {
  name: string;
  template: CardPdfTemplate;
  setDefault?: boolean;
}): Promise<VisitChecklistPdfTemplateRecord> {
  const res = await apiFetch(`${API_BASE}/api/visit-checklist-pdf/templates`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ template?: VisitChecklistPdfTemplateRecord } & ErrBody>(res);
  if (!res.ok || !data.template) throw new Error(apiErrText(data, res.statusText));
  return data.template;
}

export async function updateVisitChecklistPdfTemplate(
  id: number,
  body: { name?: string; template: CardPdfTemplate; revision: number; setDefault?: boolean },
): Promise<VisitChecklistPdfTemplateRecord> {
  const res = await apiFetch(`${API_BASE}/api/visit-checklist-pdf/templates/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ template?: VisitChecklistPdfTemplateRecord } & ErrBody>(res);
  if (res.status === 409) {
    const err = new Error(apiErrText(data, 'Шаблон изменили в другой вкладке'));
    (err as Error & { code?: string; revision?: number }).code = 'revision_conflict';
    (err as Error & { revision?: number }).revision = data.revision;
    throw err;
  }
  if (!res.ok || !data.template) throw new Error(apiErrText(data, res.statusText));
  return data.template;
}

export async function deleteVisitChecklistPdfTemplate(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/visit-checklist-pdf/templates/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  const data = await parseJson<ErrBody>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
}

export async function putVisitChecklistPdfDefault(templateId: number | null): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/visit-checklist-pdf/default`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ templateId }),
  });
  const data = await parseJson<ErrBody>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
}
