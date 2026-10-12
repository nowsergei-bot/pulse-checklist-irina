
import { API_BASE, apiFetch, eaHeaders, parseJson } from './http';

function throwEa(data: { error?: string; message?: string }, fallback: string): never {
  throw new Error(data.message || data.error || fallback);
}

export async function eaMe(filters?: { year_id?: string | number | null }) {
  const q = new URLSearchParams();
  if (filters?.year_id != null && String(filters.year_id) !== '') q.set('year_id', String(filters.year_id));
  const suffix = q.toString() ? `?${q}` : '';
  const res = await apiFetch(`${API_BASE}/api/english-assessment/me${suffix}`, { headers: eaHeaders() });
  const data = await parseJson<import('../lib/englishAssessment/types').EaMe & { error?: string; message?: string }>(
    res,
  );
  if (!res.ok) throwEa(data, 'Не удалось проверить доступ к мониторингу английского');
  return data;
}

export async function eaSetAnalyticsScope(mode: 'teachers' | 'three') {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/analytics-scope`, {
    method: 'PUT',
    headers: { ...eaHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  const data = await parseJson<{ ok?: boolean; mode?: 'teachers' | 'three'; error?: string; message?: string }>(res);
  if (!res.ok) throwEa(data, 'Не удалось сохранить доступ к аналитике');
  return data;
}

export async function eaActivity() {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/activity`, { headers: eaHeaders() });
  const data = await parseJson<{
    events?: import('../lib/englishAssessment/types').EaActivityEvent[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throwEa(data, 'Не удалось загрузить действия коллег');
  return data.events || [];
}

export async function eaDirectory() {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/directory`, { headers: eaHeaders() });
  const data = await parseJson<{
    year?: { id: number; label: string } | null;
    classes?: import('../lib/englishAssessment/types').EaDirectoryClass[];
    students?: import('../lib/englishAssessment/types').EaDirectoryStudent[];
    groups?: import('../lib/englishAssessment/types').EaDirectoryGroup[];
    teachers?: import('../lib/englishAssessment/types').EaTeacherListItem[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throwEa(data, 'Не удалось загрузить справочник');
  return data;
}

export async function eaStudentCard(id: string | number) {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/students/${encodeURIComponent(String(id))}`, {
    headers: eaHeaders(),
  });
  const data = await parseJson<import('../lib/englishAssessment/types').EaStudentCard & { error?: string; message?: string }>(
    res,
  );
  if (!res.ok) throwEa(data, 'Не удалось открыть карточку учащегося');
  return data;
}

export async function eaTeacherCard(id: string | number) {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/teachers/${encodeURIComponent(String(id))}`, {
    headers: eaHeaders(),
  });
  const data = await parseJson<import('../lib/englishAssessment/types').EaTeacherCard & { error?: string; message?: string }>(
    res,
  );
  if (!res.ok) throwEa(data, 'Не удалось открыть карточку преподавателя');
  return data;
}

export async function eaImportPreview(payload: {
  filename: string;
  headers: string[];
  rows: unknown[][];
  confirm_large_classes?: boolean;
}) {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/import/preview`, {
    method: 'POST',
    headers: eaHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{
    preview?: import('../lib/englishAssessment/types').EaImportPreview;
    commit?: { ok: boolean; reason?: string };
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throwEa(data, 'Не удалось проверить файл');
  return data;
}

export async function eaImportCommit(payload: {
  filename: string;
  headers: string[];
  rows: unknown[][];
  confirm_large_classes?: boolean;
}) {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/import/commit`, {
    method: 'POST',
    headers: eaHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{
    batch_id?: number;
    created?: number;
    updated?: number;
    skipped?: number;
    error_count?: number;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throwEa(data, 'Не удалось сохранить импорт');
  return data;
}

export async function eaDashboard(filters?: { year_id?: string | number | null }) {
  const q = new URLSearchParams();
  if (filters?.year_id != null && String(filters.year_id) !== '') q.set('year_id', String(filters.year_id));
  const suffix = q.toString() ? `?${q}` : '';
  const res = await apiFetch(`${API_BASE}/api/english-assessment/dashboard${suffix}`, { headers: eaHeaders() });
  const data = await parseJson<import('../lib/englishAssessment/types').EaDashboard & { error?: string; message?: string }>(
    res,
  );
  if (!res.ok) throwEa(data, 'Не удалось открыть сводку групп');
  return data;
}

export async function eaTeacherRating(filters?: { year_id?: string | number | null }) {
  const q = new URLSearchParams();
  if (filters?.year_id != null && String(filters.year_id) !== '') q.set('year_id', String(filters.year_id));
  const suffix = q.toString() ? `?${q}` : '';
  const res = await apiFetch(`${API_BASE}/api/english-assessment/rating${suffix}`, { headers: eaHeaders() });
  const data = await parseJson<
    import('../lib/englishAssessment/types').EaTeacherRating & { error?: string; message?: string }
  >(res);
  if (!res.ok) throwEa(data, 'Рейтинг кафедры недоступен');
  return data;
}

export async function eaTeacherRatingExport(filters?: { year_id?: string | number | null }) {
  const q = new URLSearchParams();
  if (filters?.year_id != null && String(filters.year_id) !== '') q.set('year_id', String(filters.year_id));
  const suffix = q.toString() ? `?${q}` : '';
  const res = await apiFetch(`${API_BASE}/api/english-assessment/rating/export${suffix}`, {
    method: 'POST',
    headers: { ...eaHeaders(), 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await parseJson<{
    error?: string;
    message?: string;
    exported?: boolean;
    methodology_approved?: boolean;
    places_published?: boolean;
    filename?: string;
    csv?: string;
  }>(res);
  if (!res.ok) throwEa(data, 'Экспорт рейтинга недоступен');
  return data;
}

export async function eaLeaderDashboard(filters?: {
  year_id?: string | number | null;
  parallel?: string | number | null;
  class_id?: string | number | null;
  level?: string | null;
  group_id?: string | number | null;
  bucket?: string | null;
  students?: boolean;
}) {
  const q = new URLSearchParams();
  if (filters?.year_id != null && String(filters.year_id) !== '') q.set('year_id', String(filters.year_id));
  if (filters?.parallel != null && String(filters.parallel) !== '' && String(filters.parallel) !== 'all') {
    q.set('parallel', String(filters.parallel));
  }
  if (filters?.class_id != null && String(filters.class_id) !== '') q.set('class_id', String(filters.class_id));
  if (filters?.level && filters.level !== 'all') q.set('level', String(filters.level));
  if (filters?.group_id != null && String(filters.group_id) !== '') q.set('group_id', String(filters.group_id));
  if (filters?.bucket) q.set('bucket', String(filters.bucket));
  if (filters?.students) q.set('students', '1');
  const suffix = q.toString() ? `?${q}` : '';
  const res = await apiFetch(`${API_BASE}/api/english-assessment/leader${suffix}`, { headers: eaHeaders() });
  const data = await parseJson<import('../lib/englishAssessment/types').EaDashboard & { error?: string; message?: string }>(
    res,
  );
  if (!res.ok) throwEa(data, 'Не удалось открыть свод кафедры');
  return data;
}

export async function eaGroupCard(groupId: number) {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/groups/${encodeURIComponent(String(groupId))}`, {
    headers: eaHeaders(),
  });
  const data = await parseJson<import('../lib/englishAssessment/types').EaGroupCard & { error?: string; message?: string }>(
    res,
  );
  if (!res.ok) throwEa(data, 'Не удалось открыть группу');
  return data;
}

export async function eaGroupScores(groupId: number, heldOn: string, sectionCode: string) {
  const q = new URLSearchParams({ held_on: heldOn, section_code: sectionCode });
  const res = await apiFetch(
    `${API_BASE}/api/english-assessment/groups/${encodeURIComponent(String(groupId))}/scores?${q}`,
    { headers: eaHeaders() },
  );
  const data = await parseJson<import('../lib/englishAssessment/types').EaGroupScores & { error?: string; message?: string }>(
    res,
  );
  if (!res.ok) throwEa(data, 'Не удалось загрузить баллы');
  return data;
}

export async function eaSaveGroupScores(
  groupId: number,
  payload: {
    held_on: string;
    section_code: string;
    work_type?: string;
    max_score?: number;
    rows: { student_id: number; score: number | null; status: string }[];
  },
) {
  const res = await apiFetch(
    `${API_BASE}/api/english-assessment/groups/${encodeURIComponent(String(groupId))}/scores`,
    {
      method: 'PUT',
      headers: eaHeaders(),
      body: JSON.stringify(payload),
    },
  );
  const data = await parseJson<import('../lib/englishAssessment/types').EaGroupScores & { error?: string; message?: string }>(
    res,
  );
  if (!res.ok) throwEa(data, 'Не удалось сохранить баллы');
  return data;
}

export async function eaMoveGroupScoresDate(
  groupId: number,
  payload: { held_on: string; new_held_on: string; section_code: string },
) {
  const res = await apiFetch(
    `${API_BASE}/api/english-assessment/groups/${encodeURIComponent(String(groupId))}/scores`,
    {
      method: 'PATCH',
      headers: eaHeaders(),
      body: JSON.stringify(payload),
    },
  );
  const data = await parseJson<import('../lib/englishAssessment/types').EaGroupScores & { error?: string; message?: string }>(
    res,
  );
  if (!res.ok) throwEa(data, 'Не удалось перенести дату работы');
  return data;
}

type EaSpecsList = {
  catalog?: import('../lib/englishAssessment/types').EaPlacementCatalog;
  tests?: import('../lib/englishAssessment/types').EaPlacementSpec[];
  uploaded?: import('../lib/englishAssessment/types').EaPlacementSpec[];
  can_approve?: boolean;
  can_upload?: boolean;
  can_edit?: boolean;
  section_options?: string[];
  errors?: { code?: string; message?: string }[];
  error?: string;
  message?: string;
};

export async function eaSpecs() {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/specs`, { headers: eaHeaders() });
  const data = await parseJson<EaSpecsList>(res);
  if (!res.ok) throwEa(data, 'Не удалось загрузить спецификации входных тестов');
  return data;
}

export async function eaUploadSpecs(payload: { filename: string; spec: unknown }) {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/specs`, {
    method: 'POST',
    headers: eaHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<EaSpecsList>(res);
  if (!res.ok) throwEa(data, 'Не удалось добавить спецификацию');
  return data;
}

export async function eaCreateSpec(payload: { grade: number; variant?: string | null }) {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/specs`, {
    method: 'POST',
    headers: eaHeaders(),
    body: JSON.stringify({ create: true, ...payload }),
  });
  const data = await parseJson<EaSpecsList>(res);
  if (!res.ok) throwEa(data, 'Не удалось создать спецификацию');
  return data;
}

export async function eaSaveSpec(
  specId: string,
  payload: {
    grade?: number;
    variant?: string | null;
    group_scope?: string | null;
    source_total_max?: number | null;
    variant_basis?: string | null;
    fields: {
      id?: string;
      section: string;
      excel_label: string;
      max_score?: number | null;
      proposed_max_score?: number | null;
      focus?: string | null;
    }[];
  },
) {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/specs/${encodeURIComponent(specId)}`, {
    method: 'PUT',
    headers: eaHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJson<EaSpecsList>(res);
  if (!res.ok) throwEa(data, 'Не удалось сохранить спецификацию');
  return data;
}

export async function eaDeleteSpec(specId: string) {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/specs/${encodeURIComponent(specId)}`, {
    method: 'DELETE',
    headers: eaHeaders(),
  });
  const data = await parseJson<EaSpecsList>(res);
  if (!res.ok) throwEa(data, 'Не удалось удалить спецификацию');
  return data;
}

export async function eaApproveSpec(
  specId: string,
  payload: { confirm_proposed_max?: boolean; note?: string } = {},
) {
  const res = await apiFetch(
    `${API_BASE}/api/english-assessment/specs/${encodeURIComponent(specId)}/approve`,
    {
      method: 'POST',
      headers: eaHeaders(),
      body: JSON.stringify(payload),
    },
  );
  const data = await parseJson<{
    test?: import('../lib/englishAssessment/types').EaPlacementSpec;
    can_approve?: boolean;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throwEa(data, 'Не удалось утвердить спецификацию');
  return data;
}

export async function eaGroupPlacement(groupId: number, heldOn: string) {
  const q = new URLSearchParams({ held_on: heldOn });
  const res = await apiFetch(
    `${API_BASE}/api/english-assessment/groups/${encodeURIComponent(String(groupId))}/placement?${q}`,
    { headers: eaHeaders() },
  );
  const data = await parseJson<
    import('../lib/englishAssessment/types').EaPlacementSheet & { error?: string; message?: string }
  >(res);
  if (!res.ok) throwEa(data, 'Не удалось загрузить входной тест');
  return data;
}

export async function eaSaveGroupPlacement(
  groupId: number,
  payload: {
    held_on: string;
    confirm_group_scope?: boolean;
    rows: {
      student_id: number;
      status: string;
      fields: { field_id: string; score: number | null; status?: string }[];
    }[];
  },
) {
  const res = await apiFetch(
    `${API_BASE}/api/english-assessment/groups/${encodeURIComponent(String(groupId))}/placement`,
    {
      method: 'PUT',
      headers: eaHeaders(),
      body: JSON.stringify(payload),
    },
  );
  const data = await parseJson<
    import('../lib/englishAssessment/types').EaPlacementSheet & { error?: string; message?: string }
  >(res);
  if (!res.ok) throwEa(data, 'Не удалось сохранить баллы входного теста');
  return data;
}

export async function eaMoveGroupPlacementDate(groupId: number, payload: { held_on: string; new_held_on: string }) {
  const res = await apiFetch(
    `${API_BASE}/api/english-assessment/groups/${encodeURIComponent(String(groupId))}/placement`,
    {
      method: 'PATCH',
      headers: eaHeaders(),
      body: JSON.stringify(payload),
    },
  );
  const data = await parseJson<
    import('../lib/englishAssessment/types').EaPlacementSheet & { error?: string; message?: string }
  >(res);
  if (!res.ok) throwEa(data, 'Не удалось перенести дату входного теста');
  return data;
}

export async function eaDownloadPlacementExcel(groupId: number) {
  const res = await apiFetch(
    `${API_BASE}/api/english-assessment/groups/${encodeURIComponent(String(groupId))}/placement.xlsx`,
    { headers: eaHeaders() },
  );
  if (!res.ok) {
    const data = await parseJson<{ error?: string; message?: string }>(res);
    throwEa(data, 'Не удалось сформировать Excel');
  }
  const blob = await res.blob();
  const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
  return { blob, filename: match?.[1] || `placement-group-${groupId}.xlsx` };
}

export async function eaAddGroupStudent(
  groupId: number,
  payload: { full_name: string; class_label?: string },
) {
  const res = await apiFetch(
    `${API_BASE}/api/english-assessment/groups/${encodeURIComponent(String(groupId))}/students`,
    {
      method: 'POST',
      headers: eaHeaders(),
      body: JSON.stringify(payload),
    },
  );
  const data = await parseJson<{
    ok?: boolean;
    student?: import('../lib/englishAssessment/types').EaDirectoryStudent;
    students?: import('../lib/englishAssessment/types').EaDirectoryStudent[];
    student_count?: number;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throwEa(data, 'Не удалось добавить учащегося');
  return data;
}

export async function eaRemoveGroupStudent(groupId: number, studentId: number) {
  const res = await apiFetch(
    `${API_BASE}/api/english-assessment/groups/${encodeURIComponent(String(groupId))}/students/${encodeURIComponent(String(studentId))}`,
    {
      method: 'DELETE',
      headers: eaHeaders(),
    },
  );
  const data = await parseJson<{
    ok?: boolean;
    students?: import('../lib/englishAssessment/types').EaDirectoryStudent[];
    student_count?: number;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throwEa(data, 'Не удалось убрать учащегося из группы');
  return data;
}

export async function eaImportBatches() {
  const res = await apiFetch(`${API_BASE}/api/english-assessment/import/batches`, { headers: eaHeaders() });
  const data = await parseJson<{
    batches?: {
      id: number;
      filename: string;
      author_email: string | null;
      created_count: number;
      updated_count: number;
      skipped_count: number;
      error_count: number;
      created_at: string;
    }[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throwEa(data, 'Не удалось загрузить журнал импорта');
  return data;
}
