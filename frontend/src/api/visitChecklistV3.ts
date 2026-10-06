import { API_BASE, adminHeaders, apiErrText, apiFetch, parseJson } from './http';
import type { Dashboard } from '../pages/visitChecklistV3/types';
export async function getVisitChecklistV3(params: URLSearchParams, signal?: AbortSignal): Promise<Dashboard> {
 const response = await apiFetch(`${API_BASE}/api/visit-checklist-dashboard?${params}`, { headers: adminHeaders(), signal });
 const payload = await parseJson<Dashboard & { error?: string; message?: string }>(response);
 if (!response.ok) throw new Error(response.status===401?'Нужен вход в Пульс.':response.status===403?'Нет доступа к выбранной аналитике.':response.status>=500?'Ошибка загрузки аналитики. '+apiErrText(payload,'Повторите попытку позже.'):apiErrText(payload, response.statusText));
 if (!payload.aggregation_version || !payload.counts) throw new Error('Сервер не вернул согласованную версию аналитики.');
 return payload;
}
export type InterfaceSettings = {revision:number;names:typeof import('../pages/visitChecklistV3/names.json');hidden:string[];history:{revision:number;labels:Record<string,Record<string,string>>;hidden:string[];actor_id:string;changed_at:string;action:string}[]};
export type DepartmentAssignments = {access:{id:number;user_id:number;label:string;kind:string;reason:string;revoked_at:string|null}[];interface:InterfaceSettings;form_token:string;calendar:{quarters:{from:string;to:string}[]};active_policy:string;policies:{id:string}[];lessons:{lesson_id:string;teacher_user_id:number;department_id:string;metadata:Record<string,string>}[];project_id:number;users:{id:string;label:string}[];departments:{id:string;label:string}[];leaders:{assignment_id:string;user_id:string;department_id:string;label:string;valid_from:string;valid_until:string|null}[];roster:{id:string;label:string;departments:{id:string;label:string;assignment_id:string;valid_from:string;valid_until:string|null}[]}[];history:{action:string;target:string;changed_at:string;actor_id:string;entry:Record<string,unknown>}[];grants:{id:number;user_id:number;department_id:string;action:string;label:string;valid_from:string;valid_until:string|null}[]};
export async function getDepartmentAssignments(projectId?:number):Promise<DepartmentAssignments> {
 const response=await apiFetch(`${API_BASE}/api/visit-checklist-dashboard/teachers/__department_assignments__?version=pulse-v3&project=${projectId||''}`,{headers:adminHeaders()});
 const data=await parseJson<DepartmentAssignments & {error?:string;message?:string}>(response);if(!response.ok)throw new Error(apiErrText(data,response.statusText));return data;
}
export async function patchDepartmentAssignment(projectId:number,body:Record<string,unknown>):Promise<void> {
 const response=await apiFetch(`${API_BASE}/api/visit-checklist-dashboard/teachers/__department_assignments__?version=pulse-v3&project=${projectId||''}`,{method:'PATCH',headers:adminHeaders(),body:JSON.stringify(body)});
 const data=await parseJson<{error?:string;message?:string}>(response);if(!response.ok)throw new Error(apiErrText(data,response.statusText));
}
export type SourceRecord = {assessment_id:string|null;checklist:{checklist_id:string;lesson_id:string;revision:number;source:string;author_id:string;answers:import('./visitReportDelivery').VisitReportRecord['checklist']['answers']}};
export async function sourceRequest<T>(projectId:number,path:string,body?:Record<string,unknown>,method?:string):Promise<T>{
 const response=await apiFetch(`${API_BASE}/api/lesson-visit-projects/${projectId}/pulse-v3/${path}`,{method:method||(body?'POST':'GET'),headers:adminHeaders(),...(body?{body:JSON.stringify(body)}:{})});
 const data=await parseJson<T & {error?:string;message?:string}>(response);if(!response.ok)throw new Error(apiErrText(data,response.statusText));return data;
}
