
import { API_BASE, apiFetch, audioProtocolHeaders, parseJson, apiErrText } from './http';

function meetingRecorderQuery(clientSessionId: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ client_session_id: clientSessionId });
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  return `?${params.toString()}`;
}

export type AudioProtocolJobStatus = {
  job_id: string;
  event_group_id?: string;
  status: 'queued' | 'transcribing' | 'done' | 'error';
  source_s3_key: string;
  source_filename: string;
  file_index?: number;
  transcript_s3_key?: string | null;
  transcript_doc_s3_key?: string | null;
  protocol_doc_s3_key?: string | null;
  group_merged_transcript_s3_key?: string | null;
  group_transcript_doc_s3_key?: string | null;
  group_protocol_doc_s3_key?: string | null;
  sample_protocol_s3_key?: string | null;
  event_date?: string | null;
  event_title?: string;
  protocol_text?: string;
  upload_folder?: string | null;
  audio_expires_at?: string | null;
  audio_deleted_at?: string | null;
  segments_total: number;
  segments_done: number;
  segment_sec?: number;
  duration_sec?: number;
  progress_pct: number;
  partial_text: string;
  error_message?: string | null;
  /** director | table — двухмикрофонная расшифровка */
  source_mic_role?: 'director' | 'table' | null;
  updated_at?: string;
  created_at?: string;
};

export type AudioProtocolEvent = {
  event_group_id: string;
  event_date?: string | null;
  event_title?: string;
  protocol_text?: string;
  /** Список проектов: признак протокола без тяжёлого protocol_text */
  has_protocol?: boolean;
  status: string;
  progress_pct: number;
  merged_text?: string;
  transcript_full?: string;
  jobs_count: number;
  transcribed_count: number;
  sample_protocol_s3_key?: string | null;
  group_merged_transcript_s3_key?: string | null;
  group_transcript_doc_s3_key?: string | null;
  group_protocol_doc_s3_key?: string | null;
  final_protocol_s3_key?: string | null;
  protocol_status?: 'draft' | 'final';
  brief_approval_status?: 'draft' | 'approved';
  brief_approved_at?: string | null;
  audio_files: AudioProtocolJobStatus[];
  updated_at?: string | null;
  created_at?: string | null;
};

export type AudioProtocolCalendarDay = {
  event_date: string;
  events_count: number;
  transcribed_count: number;
  protocol_count: number;
  audio_files_count?: number;
};

export type AudioProtocolMicRole = 'director' | 'table';

export async function postAudioProtocolTranscribeStart(body: {
  s3_key: string;
  event_date?: string;
  event_title?: string;
  event_group_id?: string;
  sample_protocol_s3_key?: string;
  source_mic_role?: AudioProtocolMicRole;
  source_app?: 'audio_protocol' | 'meeting_recorder';
  client_session_id?: string;
}): Promise<{ job: AudioProtocolJobStatus; event?: AudioProtocolEvent }> {
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/transcribe/start`, {
    method: 'POST',
    headers: audioProtocolHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    job?: AudioProtocolJobStatus;
    event?: AudioProtocolEvent;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.job) {
    throw new Error(apiErrText(data, res.statusText));
  }
  return { job: data.job, event: data.event };
}

export async function getAudioProtocolProjects(
  limit = 40,
): Promise<{ projects: AudioProtocolEvent[] }> {
  const q = limit ? `?limit=${encodeURIComponent(String(limit))}` : '';
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/projects${q}`, {
    headers: audioProtocolHeaders(),
  });
  const data = await parseJson<{
    projects?: AudioProtocolEvent[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return { projects: data.projects ?? [] };
}

export async function putAudioProtocolEventMeta(
  eventId: string,
  body: { event_title?: string; event_date?: string },
): Promise<{ event: AudioProtocolEvent }> {
  const enc = encodeURIComponent(eventId);
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/events/${enc}/meta`, {
    method: 'PUT',
    headers: audioProtocolHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ event?: AudioProtocolEvent; error?: string; message?: string }>(res);
  if (!res.ok || !data.event) throw new Error(apiErrText(data, res.statusText));
  return { event: data.event };
}

export async function getAudioProtocolCalendar(month?: string): Promise<{
  days: AudioProtocolCalendarDay[];
  audio_retention_days: number;
}> {
  const q = month ? `?month=${encodeURIComponent(month)}` : '';
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/calendar${q}`, { headers: audioProtocolHeaders() });
  const data = await parseJson<{
    days?: AudioProtocolCalendarDay[];
    audio_retention_days?: number;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return { days: data.days ?? [], audio_retention_days: Number(data.audio_retention_days) || 30 };
}

export async function getMeetingRecorderCalendar(
  clientSessionId: string,
  month?: string,
): Promise<{ days: AudioProtocolCalendarDay[]; audio_retention_days: number; client_session_id: string }> {
  const q = meetingRecorderQuery(clientSessionId, month ? { month } : undefined);
  const res = await apiFetch(`${API_BASE}/api/meeting-recorder/calendar${q}`, { headers: audioProtocolHeaders() });
  const data = await parseJson<{
    days?: AudioProtocolCalendarDay[];
    audio_retention_days?: number;
    client_session_id?: string;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return {
    days: data.days ?? [],
    audio_retention_days: Number(data.audio_retention_days) || 30,
    client_session_id: data.client_session_id || clientSessionId,
  };
}

export async function getMeetingRecorderRecordings(
  clientSessionId: string,
  opts?: { date?: string; limit?: number },
): Promise<{
  recordings: Array<AudioProtocolEvent & { transcribed?: boolean; has_protocol?: boolean }>;
  client_session_id: string;
  event_date?: string | null;
}> {
  const extra: Record<string, string> = {};
  if (opts?.date) extra.date = opts.date;
  if (opts?.limit) extra.limit = String(opts.limit);
  const q = meetingRecorderQuery(clientSessionId, extra);
  const res = await apiFetch(`${API_BASE}/api/meeting-recorder/recordings${q}`, { headers: audioProtocolHeaders() });
  const data = await parseJson<{
    recordings?: Array<AudioProtocolEvent & { transcribed?: boolean; has_protocol?: boolean }>;
    client_session_id?: string;
    event_date?: string | null;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return {
    recordings: data.recordings ?? [],
    client_session_id: data.client_session_id || clientSessionId,
    event_date: data.event_date,
  };
}

export async function getMeetingRecorderEvent(
  clientSessionId: string,
  eventGroupId: string,
): Promise<{
  event: AudioProtocolEvent;
  downloads: Record<string, string>;
  jobs: AudioProtocolJobStatus[];
  transcript_text?: string;
}> {
  const enc = encodeURIComponent(eventGroupId);
  const q = meetingRecorderQuery(clientSessionId);
  const res = await apiFetch(`${API_BASE}/api/meeting-recorder/events/${enc}${q}`, {
    headers: audioProtocolHeaders(),
  });
  const data = await parseJson<{
    event?: AudioProtocolEvent;
    downloads?: Record<string, string>;
    jobs?: AudioProtocolJobStatus[];
    transcript_text?: string;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.event) throw new Error(apiErrText(data, res.statusText));
  return {
    event: data.event,
    downloads: data.downloads ?? {},
    jobs: data.jobs ?? [],
    transcript_text: data.transcript_text,
  };
}

export async function getMeetingRecorderEventTranscript(
  clientSessionId: string,
  eventGroupId: string,
): Promise<{
  event_group_id: string;
  transcript_text: string;
  has_text: boolean;
}> {
  const enc = encodeURIComponent(eventGroupId);
  const q = meetingRecorderQuery(clientSessionId);
  const res = await apiFetch(`${API_BASE}/api/meeting-recorder/events/${enc}/transcript${q}`, {
    headers: audioProtocolHeaders(),
    cache: 'no-store',
  });
  const data = await parseJson<{
    event_group_id?: string;
    transcript_text?: string;
    has_text?: boolean;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return {
    event_group_id: data.event_group_id || eventGroupId,
    transcript_text: String(data.transcript_text ?? ''),
    has_text: Boolean(data.has_text),
  };
}

export async function getAudioProtocolEventsByDate(
  date: string,
): Promise<{ event_date: string; events: AudioProtocolEvent[] }> {
  const enc = encodeURIComponent(date);
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/days/${enc}`, { headers: audioProtocolHeaders() });
  const data = await parseJson<{
    event_date?: string;
    events?: AudioProtocolEvent[];
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return { event_date: data.event_date || date, events: data.events ?? [] };
}

export async function deleteAudioProtocolEvent(
  eventId: string,
): Promise<{ deleted: boolean; event_group_id: string; jobs_deleted?: number }> {
  const enc = encodeURIComponent(eventId);
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/events/${enc}`, {
    method: 'DELETE',
    headers: audioProtocolHeaders(),
  });
  const data = await parseJson<{
    deleted?: boolean;
    event_group_id?: string;
    jobs_deleted?: number;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.deleted) throw new Error(apiErrText(data, res.statusText));
  return {
    deleted: true,
    event_group_id: data.event_group_id || eventId,
    jobs_deleted: data.jobs_deleted,
  };
}

export async function postAudioProtocolBulkDeleteEvents(
  eventGroupIds: string[],
): Promise<{
  deleted_count: number;
  jobs_deleted: number;
  requested_count: number;
  deleted_event_group_ids: string[];
  not_found_event_group_ids: string[];
  failed: Array<{ event_group_id: string; message: string }>;
}> {
  const ids = [...new Set((eventGroupIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/events/bulk-delete`, {
    method: 'POST',
    headers: audioProtocolHeaders(),
    body: JSON.stringify({ event_group_ids: ids }),
  });
  const data = await parseJson<{
    deleted_count?: number;
    jobs_deleted?: number;
    requested_count?: number;
    deleted_event_group_ids?: string[];
    not_found_event_group_ids?: string[];
    failed?: Array<{ event_group_id?: string; message?: string }>;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return {
    deleted_count: Number(data.deleted_count || 0),
    jobs_deleted: Number(data.jobs_deleted || 0),
    requested_count: Number(data.requested_count || ids.length),
    deleted_event_group_ids: Array.isArray(data.deleted_event_group_ids) ? data.deleted_event_group_ids : [],
    not_found_event_group_ids: Array.isArray(data.not_found_event_group_ids) ? data.not_found_event_group_ids : [],
    failed: Array.isArray(data.failed)
      ? data.failed.map((x) => ({
          event_group_id: String(x?.event_group_id || ''),
          message: String(x?.message || ''),
        }))
      : [],
  };
}

export async function getAudioProtocolEvent(eventId: string): Promise<{
  event: AudioProtocolEvent;
  downloads: Record<string, string>;
  jobs?: AudioProtocolJobStatus[];
  transcript_text?: string;
}> {
  const enc = encodeURIComponent(eventId);
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/events/${enc}`, {
    headers: audioProtocolHeaders(),
    cache: 'no-store',
  });
  const data = await parseJson<{
    event?: AudioProtocolEvent;
    downloads?: Record<string, string>;
    jobs?: AudioProtocolJobStatus[];
    transcript_text?: string;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.event) throw new Error(apiErrText(data, res.statusText));
  return {
    event: data.event,
    downloads: data.downloads ?? {},
    jobs: data.jobs,
    transcript_text: data.transcript_text,
  };
}

export async function getAudioProtocolEventTranscript(eventId: string): Promise<{
  event_group_id: string;
  transcript_text: string;
  has_text: boolean;
}> {
  const enc = encodeURIComponent(eventId);
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/events/${enc}/transcript`, {
    headers: audioProtocolHeaders(),
    cache: 'no-store',
  });
  const data = await parseJson<{
    event_group_id?: string;
    transcript_text?: string;
    has_text?: boolean;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(apiErrText(data, res.statusText));
  return {
    event_group_id: data.event_group_id || eventId,
    transcript_text: String(data.transcript_text ?? ''),
    has_text: Boolean(data.has_text),
  };
}

export async function putAudioProtocolEventProtocol(
  eventId: string,
  body: { protocol_text: string; event_title?: string },
): Promise<{ event: AudioProtocolEvent; downloads?: Record<string, string> }> {
  const enc = encodeURIComponent(eventId);
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/events/${enc}/protocol`, {
    method: 'PUT',
    headers: audioProtocolHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    event?: AudioProtocolEvent;
    downloads?: Record<string, string>;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.event) throw new Error(apiErrText(data, res.statusText));
  return { event: data.event, downloads: data.downloads };
}

export async function putAudioProtocolEventSample(
  eventId: string,
  body: { sample_protocol_s3_key?: string; sample_protocol_excerpt?: string },
): Promise<{ event: AudioProtocolEvent }> {
  const enc = encodeURIComponent(eventId);
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/events/${enc}/sample`, {
    method: 'PUT',
    headers: audioProtocolHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ event?: AudioProtocolEvent; error?: string; message?: string }>(res);
  if (!res.ok || !data.event) throw new Error(apiErrText(data, res.statusText));
  return { event: data.event };
}

export type AudioProtocolTask = {
  id: string;
  event_group_id: string;
  parent_id?: string | null;
  assignee_name: string;
  assignee_short_name?: string | null;
  assignee_staff_id?: number | null;
  task_text: string;
  details?: string | null;
  subtasks?: AudioProtocolTask[];
  task_number?: number | null;
  due_date?: string | null;
  status: 'open' | 'in_progress' | 'permanent' | 'done' | 'cancelled';
  sort_order: number;
  source: string;
  approval_status?: 'draft' | 'pending_director' | 'approved';
  approved_at?: string | null;
  assistant_approved_at?: string | null;
  director_approved_at?: string | null;
  director_review_note?: string | null;
  status_change_pending?: boolean;
  pending_status?: 'open' | 'in_progress' | 'permanent' | 'done' | 'cancelled' | null;
  pending_status_note?: string | null;
  pending_status_id?: number | null;
  pending_status_decision?: 'approved' | 'rejected' | null;
  completed_at?: string | null;
  event_title?: string;
  event_date?: string | null;
  protocol_status?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function getAudioProtocolJob(jobId: string): Promise<{
  job: AudioProtocolJobStatus;
  event?: AudioProtocolEvent;
  transcript_text?: string;
}> {
  const enc = encodeURIComponent(jobId);
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/jobs/${enc}`, {
    headers: audioProtocolHeaders(),
    cache: 'no-store',
  });
  const data = await parseJson<{
    job?: AudioProtocolJobStatus;
    event?: AudioProtocolEvent;
    transcript_text?: string;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.job) {
    throw new Error(apiErrText(data, res.statusText));
  }
  return { job: data.job, event: data.event, transcript_text: data.transcript_text };
}

export async function postAudioProtocolJobTick(jobId: string): Promise<{
  job: AudioProtocolJobStatus;
  event?: AudioProtocolEvent | null;
  transcript_text?: string;
}> {
  const enc = encodeURIComponent(jobId);
  const res = await apiFetch(`${API_BASE}/api/audio-protocol/jobs/${enc}/tick`, {
    method: 'POST',
    headers: audioProtocolHeaders(),
    cache: 'no-store',
  });
  const data = await parseJson<{
    job?: AudioProtocolJobStatus;
    event?: AudioProtocolEvent | null;
    transcript_text?: string;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.job) {
    throw new Error(apiErrText(data, res.statusText));
  }
  return { job: data.job, event: data.event, transcript_text: data.transcript_text };
}

export async function postAudioProtocolChat(body: {
  messages: { role: 'user' | 'assistant'; content: string }[];
  custom_instructions?: string;
  generate_protocol?: boolean;
  transcript_s3_key?: string;
  transcript_excerpt?: string;
  event_group_id?: string;
  sample_protocol_s3_key?: string;
  sample_protocol_excerpt?: string;
  event_title?: string;
  source_app?: 'meeting_recorder' | 'audio_protocol';
  skip_default_directive?: boolean;
  onRetry?: (attempt: number) => void;
  onRecovering?: () => void;
}): Promise<{
  reply: string;
  narrative?: string;
  pipeline?: string;
  tasks_extracted?: number;
  protocol_saved?: boolean;
  persist_error?: string;
  event?: AudioProtocolEvent;
  downloads?: Record<string, string>;
  chunked_transcript?: boolean;
  transcript_chars?: number;
  materials_chars?: number;
  custom_instructions_chars?: number;
  generation_mode?: string;
  recovered_from_server?: boolean;
}> {
  const { onRetry, onRecovering, ...requestBody } = body;
  const { withProtocolChatReliability } = await import('../lib/audioProtocol/protocolChatReliability');

  const startedAtIso = new Date().toISOString();
  return withProtocolChatReliability(
    () => postAudioProtocolChatOnce(requestBody),
    {
      eventGroupId: requestBody.event_group_id,
      startedAtIso,
      onRetry,
      onRecovering,
    },
  );
}

async function postAudioProtocolChatOnce(body: {
  messages: { role: 'user' | 'assistant'; content: string }[];
  custom_instructions?: string;
  generate_protocol?: boolean;
  transcript_s3_key?: string;
  transcript_excerpt?: string;
  event_group_id?: string;
  sample_protocol_s3_key?: string;
  sample_protocol_excerpt?: string;
  event_title?: string;
  source_app?: 'meeting_recorder' | 'audio_protocol';
  skip_default_directive?: boolean;
}): Promise<{
  reply: string;
  narrative?: string;
  pipeline?: string;
  tasks_extracted?: number;
  protocol_saved?: boolean;
  persist_error?: string;
  event?: AudioProtocolEvent;
  downloads?: Record<string, string>;
  chunked_transcript?: boolean;
  transcript_chars?: number;
  materials_chars?: number;
  custom_instructions_chars?: number;
  generation_mode?: string;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 580_000);
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE}/api/audio-protocol/chat`, {
      method: 'POST',
      headers: audioProtocolHeaders(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      const err = new Error(
        'Ответ ИИ слишком долгий (больше ~10 мин). Сервер может ещё дописывать протокол — подождите или обновите страницу.',
      );
      (err as Error & { httpStatus?: number }).httpStatus = 504;
      throw err;
    }
    if (e instanceof Error && /связаться с сервером/i.test(e.message)) {
      const err = new Error(
        `${e.message} Для протокола из длинного аудио часто виноват таймаут API Gateway (до 600 с) — администратору: ./scripts/update-api-gateway-timeout.sh и YC_FUNCTION_TIMEOUT=600s.`,
      );
      (err as Error & { httpStatus?: number }).httpStatus = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const data = await parseJson<{
    reply?: string;
    narrative?: string;
    pipeline?: string;
    tasks_extracted?: number;
    protocol_saved?: boolean;
    persist_error?: string;
    event?: AudioProtocolEvent;
    downloads?: Record<string, string>;
    chunked_transcript?: boolean;
    transcript_chars?: number;
    materials_chars?: number;
    custom_instructions_chars?: number;
    generation_mode?: string;
    error?: string;
    message?: string;
  }>(res);
  if (!res.ok) {
    const err = new Error(apiErrText(data, res.statusText));
    (err as Error & { httpStatus?: number }).httpStatus = res.status;
    throw err;
  }
  const reply = String(data.reply ?? '').trim();
  if (!reply) throw new Error('Пустой ответ ИИ.');
  return {
    reply,
    narrative: data.narrative,
    pipeline: data.pipeline,
    tasks_extracted: data.tasks_extracted,
    protocol_saved: data.protocol_saved,
    persist_error: data.persist_error,
    event: data.event,
    downloads: data.downloads,
    chunked_transcript: data.chunked_transcript,
    transcript_chars: data.transcript_chars,
    materials_chars: data.materials_chars,
    custom_instructions_chars: data.custom_instructions_chars,
    generation_mode: data.generation_mode,
  };
}

export type ProtocolCabinet = {
  id: number;
  name: string;
  email: string;
};

export type RbacRoleRef = {
  id: number;
  slug: string;
  name: string;
};
