import type { FileCollectionConfig } from '../lib/fileCollectionSurvey';

import { resolveStaffBearer } from '../lib/staffSession';
import { API_BASE, apiFetch, adminHeaders, parseJson, apiErrText, normalizeApiBase } from './http';

const FILE_COLLECTION_UPLOAD_STALL_MS = 120_000;

function adminHeadersNoContentType(): HeadersInit {
  const token = resolveStaffBearer();
  const h: Record<string, string> = {};
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function putBytesWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  totalBytes: number,
  onChunk: (loadedInBody: number) => void,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    let lastLoaded = 0;
    let lastProgressAt = Date.now();
    const stallTimer = window.setInterval(() => {
      if (Date.now() - lastProgressAt < FILE_COLLECTION_UPLOAD_STALL_MS) return;
      if (lastLoaded >= totalBytes) return;
      xhr.abort();
      reject(
        new Error(
          'Загрузка в Object Storage остановилась (нет прогресса более 2 минут). Проверьте интернет и CORS бакета (PUT с Origin сайта), затем повторите.',
        ),
      );
    }, 15_000);
    const clearStall = () => window.clearInterval(stallTimer);
    xhr.upload.onprogress = (e) => {
      const loaded = Math.min(totalBytes, e.loaded > 0 ? e.loaded : lastLoaded);
      lastLoaded = loaded;
      lastProgressAt = Date.now();
      onChunk(loaded);
    };
    xhr.onload = () => {
      clearStall();
      onChunk(totalBytes);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader('ETag'));
        return;
      }
      const msg =
        xhr.status === 0
          ? 'Сеть или CORS: не удалось завершить загрузку в Object Storage.'
          : `Object Storage ответил ${xhr.status}`;
      reject(new Error(msg));
    };
    xhr.onerror = () => {
      clearStall();
      reject(new Error('Ошибка сети при загрузке в Object Storage (проверьте CORS бакета).'));
    };
    xhr.onabort = () => {
      clearStall();
      reject(new Error('Загрузка в Object Storage прервана.'));
    };
    xhr.send(body);
  });
}

function putFileWithProgress(
  url: string,
  file: File,
  contentType: string,
  onChunk: (loadedInFile: number) => void,
): Promise<void> {
  return putBytesWithProgress(url, file, contentType, file.size, onChunk).then(() => undefined);
}

export type FileCollectionSurveyListItem = {
  id: number;
  public_token: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type FileCollectionSurveySaved = FileCollectionSurveyListItem & { config: FileCollectionConfig };

/** Публичная выдача конфига по токену (?token= на /view/file-collection). */

export async function fetchPublicFileCollectionConfigByToken(token: string): Promise<FileCollectionConfig> {
  const t = String(token || '').trim();
  if (!t) throw new Error('Пустой token');
  const res = await apiFetch(`${API_BASE}/api/public/file-collection/survey?token=${encodeURIComponent(t)}`);
  const data = await parseJson<{ config?: FileCollectionConfig; error?: string; message?: string }>(res);
  if (!res.ok) {
    throw new Error(apiErrText(data as { error?: string; message?: string }, res.statusText));
  }
  if (!data.config) throw new Error('Нет данных опроса');
  return data.config;
}

export async function listFileCollectionSurveys(): Promise<FileCollectionSurveyListItem[]> {
  const res = await apiFetch(`${API_BASE}/api/file-collection/surveys`, { headers: adminHeaders() });
  const data = await parseJson<{ surveys?: FileCollectionSurveyListItem[]; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data as { error?: string; message?: string }, res.statusText));
  return data.surveys || [];
}

export async function getFileCollectionSurvey(id: number): Promise<FileCollectionSurveySaved> {
  const res = await apiFetch(`${API_BASE}/api/file-collection/surveys/${id}`, { headers: adminHeaders() });
  const data = await parseJson<{ survey?: FileCollectionSurveySaved; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data as { error?: string; message?: string }, res.statusText));
  if (!data.survey) throw new Error('Нет данных');
  return data.survey;
}

export async function createFileCollectionSurvey(config: FileCollectionConfig): Promise<FileCollectionSurveySaved> {
  const res = await apiFetch(`${API_BASE}/api/file-collection/surveys`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ config }),
  });
  const data = await parseJson<{ survey?: FileCollectionSurveySaved; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data as { error?: string; message?: string }, res.statusText));
  if (!data.survey) throw new Error('Нет данных');
  return data.survey;
}

export async function updateFileCollectionSurvey(
  id: number,
  config: FileCollectionConfig,
): Promise<FileCollectionSurveySaved> {
  const res = await apiFetch(`${API_BASE}/api/file-collection/surveys/${id}`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify({ config }),
  });
  const data = await parseJson<{ survey?: FileCollectionSurveySaved; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data as { error?: string; message?: string }, res.statusText));
  if (!data.survey) throw new Error('Нет данных');
  return data.survey;
}

export async function deleteFileCollectionSurvey(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/file-collection/surveys/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!res.ok) {
    const data = await parseJson<{ error?: string; message?: string }>(res);
    throw new Error(apiErrText(data, res.statusText));
  }
}

export type FileCollectionBatchFile = {
  key: string;
  name: string;
  size: number;
  last_modified: string | null;
};

export type FileCollectionBatchRow = {
  batch_id: string;
  meta: Record<string, unknown> | null;
  files: FileCollectionBatchFile[];
};

export type FileCollectionSurveyBatchGroup = {
  survey_title: string;
  survey_key: string;
  batches: FileCollectionBatchRow[];
};

/** Загрузки опросов «Сбор файлов» в бакете (без Pulse AI и служебных префиксов). Только сессия сотрудника. */

export async function fetchFileCollectionBatches(): Promise<{
  batches: FileCollectionBatchRow[];
  groups: FileCollectionSurveyBatchGroup[];
}> {
  if (!API_BASE) {
    throw new Error('Не задан адрес API при сборке (VITE_API_BASE).');
  }
  const res = await apiFetch(`${API_BASE}/api/file-collection/batches`, { headers: adminHeaders() });
  const data = await parseJson<{
    batches?: FileCollectionBatchRow[];
    groups?: FileCollectionSurveyBatchGroup[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data as { error?: string; message?: string }, res.statusText));
  return { batches: data.batches || [], groups: data.groups || [] };
}

/** Временная presigned-ссылка на один объект в бакете сбора (обход лимита шлюза на большие файлы). */

export async function fetchFileCollectionSignedDownloadUrl(key: string): Promise<string> {
  if (!API_BASE) {
    throw new Error('Не задан адрес API при сборке (VITE_API_BASE).');
  }
  const res = await apiFetch(
    `${API_BASE}/api/file-collection/signed-url?key=${encodeURIComponent(key)}`,
    { headers: adminHeadersNoContentType() },
  );
  const data = await parseJson<{ url?: string; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data as { error?: string; message?: string }, res.statusText));
  if (!data.url) throw new Error('Сервер не вернул ссылку на скачивание');
  return data.url;
}

/**
 * Куда слать multipart из /view/file-collection: явный URL или тот же шлюз, что и админка
 * (`…/api/public/file-collection/upload`). Материалы на бэкенде пишутся в `FILE_COLLECTION_BUCKET`, не в бакет статики.
 */

export function resolveFileCollectionUploadUrl(): string | undefined {
  const explicit = String(import.meta.env.VITE_FILE_COLLECTION_UPLOAD_URL || '').trim();
  if (explicit) return explicit;
  if (!API_BASE) return undefined;
  return `${API_BASE}/api/public/file-collection/upload`;
}

/** Корень API для presign/finalize (малый JSON через шлюз; большие файлы — PUT в бакет). */

export function resolveFileCollectionApiBaseForUpload(): string | undefined {
  const explicit = String(import.meta.env.VITE_FILE_COLLECTION_UPLOAD_URL || '').trim();
  if (explicit) {
    try {
      const u = new URL(explicit);
      const stripped = u.pathname.replace(/\/api\/public\/file-collection\/upload\/?$/i, '');
      const joined = `${u.origin}${stripped}`.replace(/\/+$/, '') || u.origin;
      return normalizeApiBase(joined);
    } catch {
      return undefined;
    }
  }
  return API_BASE || undefined;
}

export function resolveFileCollectionPresignUploadUrl(): string | undefined {
  const b = resolveFileCollectionApiBaseForUpload();
  return b ? `${b}/api/public/file-collection/presign-upload` : undefined;
}

export function resolveFileCollectionFinalizeUploadUrl(): string | undefined {
  const b = resolveFileCollectionApiBaseForUpload();
  return b ? `${b}/api/public/file-collection/finalize-upload` : undefined;
}

/** Лимит тела POST через Yandex API Gateway (устаревший multipart /upload). */

export const FILE_COLLECTION_GATEWAY_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

/** Прогресс загрузки «сбор файлов» (для полосы и ETA). */

export type FileCollectionUploadProgress = {
  phase: 'presign' | 'upload' | 'finalize' | 'done';
  loaded: number;
  total: number;
  fileIndex: number;
  fileName: string;
};

export type FileCollectionPresignedUpload =
  | { mode?: 'put'; key: string; url: string; content_type: string }
  | {
      mode: 'multipart';
      key: string;
      upload_id: string;
      content_type: string;
      part_size: number;
      parts: Array<{ part_number: number; url: string }>;
    };

export type FileCollectionMultipartCompletion = {
  key: string;
  upload_id: string;
  parts: Array<{ part_number: number; etag: string }>;
};

export async function uploadPresignedFileCollectionObject(
  spec: FileCollectionPresignedUpload,
  file: File,
  onChunk: (loadedInFile: number) => void,
): Promise<FileCollectionMultipartCompletion | null> {
  const ct =
    (spec.content_type && spec.content_type.trim()) || file.type || 'application/octet-stream';
  if (spec.mode === 'multipart' && spec.parts?.length) {
    const partSize = Math.max(1, spec.part_size || 16 * 1024 * 1024);
    const completed: Array<{ part_number: number; etag: string }> = [];
    let loadedInFile = 0;
    for (const part of spec.parts) {
      const start = (part.part_number - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const chunk = file.slice(start, end);
      const chunkLen = chunk.size;
      const etag = await putBytesWithProgress(part.url, chunk, ct, chunkLen, (partLoaded) => {
        onChunk(Math.min(file.size, loadedInFile + Math.min(partLoaded, chunkLen)));
      });
      if (!etag) {
        throw new Error(`Object Storage не вернул ETag для части ${part.part_number}`);
      }
      loadedInFile += chunkLen;
      onChunk(Math.min(file.size, loadedInFile));
      completed.push({ part_number: part.part_number, etag });
    }
    return { key: spec.key, upload_id: spec.upload_id, parts: completed };
  }
  const putUrl = 'url' in spec ? spec.url : '';
  if (!putUrl) throw new Error('Нет URL для загрузки файла');
  await putFileWithProgress(putUrl, file, ct, onChunk);
  return null;
}

/**
 * Multipart POST с прогрессом (мелкие файлы через шлюз).
 * Ошибки JSON из тела ответа по возможности.
 */

export async function uploadFileCollectionMultipartWithProgress(
  uploadUrl: string,
  formData: FormData,
  estimatedTotalBytes: number,
  onProgress?: (p: FileCollectionUploadProgress) => void,
): Promise<void> {
  const total = Math.max(1, estimatedTotalBytes);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.upload.onprogress = (e) => {
      const loaded = e.lengthComputable && e.total > 0 ? e.loaded : Math.min(e.loaded, total);
      const tot = e.lengthComputable && e.total > 0 ? e.total : total;
      onProgress?.({
        phase: 'upload',
        loaded,
        total: tot,
        fileIndex: 0,
        fileName: '',
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ phase: 'finalize', loaded: Math.max(0, total - 1), total, fileIndex: 0, fileName: '' });
        onProgress?.({ phase: 'done', loaded: total, total, fileIndex: 0, fileName: '' });
        resolve();
        return;
      }
      let msg = `Сервер ответил ${xhr.status}`;
      try {
        const j = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        if (typeof j.message === 'string' && j.message.trim()) msg = j.message.trim();
        else if (typeof j.error === 'string' && j.error.trim()) msg = j.error.trim();
      } catch {
        /* не JSON */
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => {
      reject(new Error('Не удалось отправить форму (сеть или CORS).'));
    };
    xhr.send(formData);
  });
}

/**
 * Загрузка файлов в бакет без multipart через API Gateway (лимит тела шлюза ~2,5 МБ).
 * Требует CORS на бакете для PUT с Origin сайта.
 */

export async function uploadFileCollectionViaDirectStorage(opts: {
  presignUrl: string;
  finalizeUrl: string;
  title: string;
  description: string;
  format: string;
  maxVideoDurationSec: number | null | undefined;
  participantAnswers: Record<string, string>;
  /** id поля ФИО для папки в бакете; пусто — эвристика на бэкенде */
  fioFieldId?: string;
  files: File[];
  onProgress?: (p: FileCollectionUploadProgress) => void;
}): Promise<{
  batch_id: string;
  keys: string[];
  files: { key: string; name: string; size: number; contentType: string }[];
}> {
  const {
    presignUrl,
    finalizeUrl,
    title,
    description,
    format,
    maxVideoDurationSec,
    participantAnswers,
    fioFieldId,
    files,
    onProgress,
  } = opts;

  const totalBytes = Math.max(1, files.reduce((s, f) => s + f.size, 0));
  const report = (phase: FileCollectionUploadProgress['phase'], loaded: number, fileIndex: number, fileName: string) => {
    onProgress?.({
      phase,
      loaded: Math.min(totalBytes, Math.max(0, loaded)),
      total: totalBytes,
      fileIndex,
      fileName,
    });
  };

  report('presign', 0, -1, '');

  const presignPayload = {
    title,
    description,
    format,
    participant_answers: participantAnswers,
    fio_field_id: (fioFieldId && fioFieldId.trim()) || '',
    max_video_duration_sec:
      maxVideoDurationSec != null && Number.isFinite(maxVideoDurationSec) ? maxVideoDurationSec : '',
    files: files.map((f) => ({
      filename: f.name,
      content_type: f.type && f.type.trim() ? f.type : 'application/octet-stream',
      size: f.size,
    })),
  };

  const pr = await apiFetch(presignUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(presignPayload),
  });
  const pdata = await parseJson<{
    batch_id?: string;
    uploads?: FileCollectionPresignedUpload[];
    error?: string;
    message?: string;
  }>(pr);
  if (!pr.ok) {
    throw new Error(apiErrText(pdata as { error?: string; message?: string }, pr.statusText));
  }
  const batchId = pdata.batch_id;
  const uploads = pdata.uploads || [];
  if (!batchId || uploads.length !== files.length) {
    throw new Error('Некорректный ответ сервера при подготовке загрузки');
  }

  let carried = 0;
  const multipartCompletions: FileCollectionMultipartCompletion[] = [];
  for (let i = 0; i < uploads.length; i++) {
    const u = uploads[i];
    const file = files[i];
    try {
      const completion = await uploadPresignedFileCollectionObject(u, file, (loadedInFile) => {
        report('upload', carried + Math.min(loadedInFile, file.size), i, file.name);
      });
      if (completion) multipartCompletions.push(completion);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
    carried += file.size;
    report('upload', carried, i, file.name);
  }

  report('finalize', carried, files.length, '');

  const keys = uploads.map((x) => x.key);
  const fr = await apiFetch(finalizeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batch_id: batchId,
      keys,
      ...(multipartCompletions.length ? { multipart_completions: multipartCompletions } : {}),
      title,
      description,
      format,
      max_video_duration_sec:
        maxVideoDurationSec != null && Number.isFinite(maxVideoDurationSec) ? maxVideoDurationSec : '',
      participant_answers: participantAnswers,
    }),
  });
  const fdata = await parseJson<{ error?: string; message?: string }>(fr);
  if (!fr.ok) {
    throw new Error(apiErrText(fdata as { error?: string; message?: string }, fr.statusText));
  }
  report('done', totalBytes, files.length, '');
  return {
    batch_id: batchId,
    keys,
    files: files.map((f, i) => ({
      key: keys[i],
      name: f.name,
      size: f.size,
      contentType: f.type && f.type.trim() ? f.type : 'application/octet-stream',
    })),
  };
}

export async function downloadFileCollectionVideosZip(): Promise<void> {
  if (!API_BASE) {
    throw new Error(
      'Не задан адрес API при сборке (VITE_API_BASE). Без него выгрузка из облака недоступна.',
    );
  }
  const res = await apiFetch(`${API_BASE}/api/file-collection/videos-zip`, {
    method: 'GET',
    headers: adminHeadersNoContentType(),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text || res.statusText || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      if (typeof j.message === 'string' && j.message) msg = j.message;
      else if (typeof j.error === 'string' && j.error) msg = j.error;
    } catch {
      /* не JSON */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `file-collection-videos-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Публичная сводка для руководителя (без входа в админку). */
