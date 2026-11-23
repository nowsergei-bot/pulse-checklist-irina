import {API_BASE,apiFetch,eaHeaders,parseJson} from './http';
import type {Bootstrap,Spec,Observation} from '../pages/primarySchool/model';
import type {PrimaryMaterial} from '../pages/primarySchool/materialsModel';
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const res=await apiFetch(`${API_BASE}/api/primary-school/${path}`,{method,headers:eaHeaders(),...(body?{body:JSON.stringify(body)}:{})});
 const data=await parseJson<T & {message?:string;error?:string}>(res);
 if(!res.ok)throw new Error(data.message||data.error||'Не удалось загрузить аналитику начальной школы.');return data;
}
export const primaryMe=()=>request<{capabilities:{access:boolean}}>('me');
export const primaryBootstrap=(year?:number)=>request<Bootstrap>('bootstrap'+(year?`?year_id=${year}`:''));
export const primaryMaterials=()=>request<{materials:PrimaryMaterial[]}>('materials');
export async function primaryMaterialBytes(id:string,signal?:AbortSignal,range?:{begin:number;end:number}):Promise<Uint8Array> {
 if(range&&range.end-range.begin>1024*1024){
  const bytes=new Uint8Array(range.end-range.begin);
  for(let begin=range.begin;begin<range.end;begin+=1024*1024){const end=Math.min(begin+1024*1024,range.end);bytes.set(await primaryMaterialBytes(id,signal,{begin,end}),begin-range.begin);}
  return bytes;
 }
 const part=range?`?from=${range.begin}&to=${range.end}`:'?download=1';
 const res=await apiFetch(`${API_BASE}/api/primary-school/materials/${encodeURIComponent(id)}/file${part}`,{headers:eaHeaders(),signal});
 if(!res.ok){const error=await parseJson<{message?:string}>(res);throw new Error(error.message||'Не удалось открыть материал. Обновите страницу и попробуйте снова.');}
 const bytes=new Uint8Array(await res.arrayBuffer());
 if(range&&(res.status!==206||bytes.length!==range.end-range.begin))throw new Error('Не удалось загрузить страницы PDF. Попробуйте открыть материал ещё раз.');
 return bytes;
}
export const primaryCreateWork=(body:{title:string;subject:string;grade:number;held_on:string;kind:string;teacher_staff_id:number;academic_year_id:number;class_ids:number[];spec:Spec})=>request<{work:{id:string}}>('works','POST',body);
export const primarySaveObservations=(id:string,revision:number,rows:Omit<Observation,'work_id'>[],comment?:string)=>request<{revision:number}>(`works/${id}/observations`,'PUT',{revision,rows,comment});
export const primarySuggest=(pages:PrimaryPageInput[],grade:number,subject='Математика',sourceKind='control')=>request<PrimarySuggestion>('suggest','POST',{pages,grade,subject,sourceKind});
export type PrimaryPageInput={page:number;file:string;text:string;imageBase64?:string};
export type PrimarySuggestion={provider?:string;suggestions:{number?:string;skill_id:string;topic:string;criterion:string;optional?:boolean;source:{file:string;pdf_page:number;excerpt:string};reviewed:boolean}[];skills?:import('../pages/primarySchool/model').Skill[];warning:string};
export type PrimaryInsight={provider:string|null;status?:string;message?:string;generated_at?:string;cached?:boolean;draft?:boolean;conclusion?:InsightItem;strengths?:InsightItem[];attention?:InsightItem[];dynamics?:InsightItem[];next_steps?:InsightItem[];limitations?:string;evidence?:{ref:string;work_id:string;skill_id:string;skill:string;percent:number;date:string;checked:number;planned:number}[]};
export type InsightItem={text:string;evidence_refs:string[]};
export const primaryStudentInsight=(studentId:number,filters:{year_id:number;subject?:string;from?:string;to?:string;teacher_id?:string;class_id?:string})=>request<PrimaryInsight>(`students/${studentId}/insight`,'POST',filters);
export type PrimaryPreviewServices={suggest:typeof primarySuggest;insight:typeof primaryStudentInsight};

export const primarySettings=(thresholds:{redBelow:number;greenFrom:number})=>request<{ok:boolean}>('settings','PUT',thresholds);
export const primaryLinkSkill=(body:{source_id:string;target_id:string|null;revision:number;confirmed:boolean})=>request<{skill_links:Record<string,string>;revision:number}>('skill-links','PUT',body);
export const primaryCreateSkill=(body:Omit<import('../pages/primarySchool/model').Skill,'id'>)=>request<{skill:import('../pages/primarySchool/model').Skill}>('skills','POST',body);
export const primarySaveTemplate=(body:{title:string;subject:string;grade:number;spec:Spec;revision?:number},id?:string)=>request<{template:import('../pages/primarySchool/model').Template}>(id?`templates/${id}`:'templates',id?'PUT':'POST',body);
export type PrimaryGroupInsight=Omit<PrimaryInsight,'evidence'> & {conclusion?:InsightItem;summary?:{omitted_skills:number;skills_in_report:number;skills_with_results:number};evidence?:{ref:string;skill:string;work_ids:string[]}[]};
export const primaryGroupInsight=(body:{entity:string;year_id:number;class_ids:number[];grade?:string;subject?:string;teacher_id?:string;from?:string;to?:string;work_id?:string;skill_id?:string})=>request<PrimaryGroupInsight>('insights','POST',body);
export const primaryAddStudent=(body:{year_id:number;class_id:number;full_name:string;confirmed:boolean})=>request<{student:import('../pages/primarySchool/model').Student}>('students','POST',body);
export const primaryMoveStudent=(id:number,body:{year_id:number;class_id:number;from_class_id:number;confirmed:boolean})=>request<{student:import('../pages/primarySchool/model').Student}>(`students/${id}/class`,'PUT',body);

export const primaryArchiveStudent=(id:number,body:{year_id:number;from_class_id:number;full_name:string;confirmed:boolean})=>request<{archived:boolean;student_id:number}>(`students/${id}/archive`,'POST',body);

export const primaryExcludeTask=(id:string,revision:number,taskId:string)=>request<{spec:Spec;revision:number}>(`works/${id}/exclude-task`,'POST',{revision,task_id:taskId,confirmed:true});
