
import { API_BASE, apiFetch, audioProtocolHeaders, parseJson, apiErrText } from './http';
import { FileCollectionMultipartCompletion, FileCollectionPresignedUpload } from './fileCollection';

export async function postPulseAiPresignUpload(
  files: File[],
  opts?: { audioProtocol?: boolean },
): Promise<{
  batch_id: string;
  uploads: FileCollectionPresignedUpload[];
  keys: string[];
}> {
  const res = await apiFetch(`${API_BASE}/api/pulse-ai/presign-upload`, {
    method: 'POST',
    headers: audioProtocolHeaders(),
    body: JSON.stringify({
      audio_protocol: opts?.audioProtocol === true,
      files: files.map((f) => ({
        filename: f.name,
        content_type: f.type && f.type.trim() ? f.type : 'application/octet-stream',
        size: f.size,
      })),
    }),
  });
  const data = await parseJson<{
    batch_id?: string;
    uploads?: FileCollectionPresignedUpload[];
    keys?: string[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.batch_id || !data.uploads?.length) {
    if (res.status === 401) {
      throw new Error(
        'Сервер не принял загрузку аудио без входа. Обновите страницу; если повторяется — администратору нужно обновить API.',
      );
    }
    if (res.status === 403 && data.error === 'audio_upload_requires_auth') {
      throw new Error(
        opts?.audioProtocol
          ? 'Не удалось загрузить аудио для расшифровки. Обновите страницу; если повторяется — обновите Cloud Function (audio_protocol в presign-upload).'
          : 'Не удалось загрузить аудио для диктовки. Обновите страницу и повторите; вход в аккаунт для формы визита не нужен.',
      );
    }
    throw new Error(apiErrText(data, res.statusText));
  }
  return {
    batch_id: data.batch_id,
    uploads: data.uploads,
    keys: data.keys ?? data.uploads.map((u) => u.key),
  };
}

export async function postPulseAiFinalizeUpload(body: {
  batch_id: string;
  keys: string[];
  note?: string;
  multipart_completions?: FileCollectionMultipartCompletion[];
}): Promise<{ ok: boolean; batch_id: string }> {
  const res = await apiFetch(`${API_BASE}/api/pulse-ai/finalize-upload`, {
    method: 'POST',
    headers: audioProtocolHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ ok?: boolean; batch_id?: string; error?: string; message?: string }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return { ok: Boolean(data.ok), batch_id: String(data.batch_id || body.batch_id) };
}

export async function postPulseAiTranscribe(s3Key: string): Promise<{
  text: string;
  transcript_s3_key: string;
  source_s3_key: string;
  segments?: number;
  chunked?: boolean;
}> {
  const res = await apiFetch(`${API_BASE}/api/pulse-ai/transcribe`, {
    method: 'POST',
    headers: audioProtocolHeaders(),
    body: JSON.stringify({ s3_key: s3Key }),
  });
  const data = await parseJson<{
    text?: string;
    transcript_s3_key?: string;
    source_s3_key?: string;
    segments?: number;
    chunked?: boolean;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        'Сервер не принял расшифровку без входа. Обновите страницу; если повторяется — администратору нужно обновить API.',
      );
    }
    if (res.status === 403 && data.error === 'transcribe_requires_auth') {
      throw new Error(
        'Не удалось расшифровать запись. Обновите страницу и повторите; вход в аккаунт для формы визита не нужен.',
      );
    }
    throw new Error(apiErrText(data, res.statusText));
  }
  return {
    text: String(data.text ?? ''),
    transcript_s3_key: String(data.transcript_s3_key ?? ''),
    source_s3_key: String(data.source_s3_key ?? s3Key),
    segments: data.segments,
    chunked: data.chunked,
  };
}
