import type { ResultQuestion, SurveyExportRowsPayload } from '../types';

export const METHOD_HELP_ACCESS_LINK = 'anketa-professionalnyh-zaprosov-pedagoga';
export const METHOD_HELP_ACCESS_LINK_PREFIX = 'anketa-professionalnyh-zaprosov';

export function isMethodHelpAccessLink(accessLink: string | null | undefined): boolean {
  if (!accessLink) return false;
  const s = accessLink.toLowerCase();
  return s === METHOD_HELP_ACCESS_LINK || s.startsWith(METHOD_HELP_ACCESS_LINK_PREFIX);
}

export type MethodHelpFieldKey =
  | 'fio'
  | 'experience'
  | 'subject'
  | 'grades'
  | 'is_class_teacher'
  | 'directions'
  | 'tasks'
  | 'priorities'
  | 'help_formats'
  | 'help_formats_other'
  | 'extra_request';

export type MethodHelpBar = { label: string; count: number };

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function inferMethodHelpFieldKey(text: string): MethodHelpFieldKey | null {
  const t = normalizeText(text);
  if (/фамили|фио/.test(t)) return 'fio';
  if (/педагогический стаж/.test(t)) return 'experience';
  if (/какой предмет/.test(t)) return 'subject';
  if (/какими классами/.test(t)) return 'grades';
  if (/классным руководителем/.test(t)) return 'is_class_teacher';
  if (/направления методической работы/.test(t)) return 'directions';
  if (/задач/.test(t) && /актуальн/.test(t)) return 'tasks';
  if (/с каких из выбранных задач/.test(t)) return 'priorities';
  if (/укажите другой формат/.test(t)) return 'help_formats_other';
  if (/форматы методической работы/.test(t)) return 'help_formats';
  if (/не вошёл в опрос|не вошел в опрос|добавить к этому опросу/.test(t)) return 'extra_request';
  return null;
}

export function mergeBars(questions: ResultQuestion[], fieldKey: MethodHelpFieldKey): MethodHelpBar[] {
  const counts = new Map<string, number>();
  for (const q of questions) {
    if (inferMethodHelpFieldKey(q.text) !== fieldKey) continue;
    for (const row of q.distribution || []) {
      const label = String(row.label || '').trim();
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + Number(row.count || 0));
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
}

export function countClassTeachers(questions: ResultQuestion[]): number {
  return mergeBars(questions, 'is_class_teacher').find((b) => b.label === 'Да')?.count ?? 0;
}

export function topBar(questions: ResultQuestion[], fieldKey: MethodHelpFieldKey): MethodHelpBar | null {
  return mergeBars(questions, fieldKey)[0] ?? null;
}

export type MethodHelpParticipant = {
  id: number;
  name: string;
  submittedAt: string;
  experience: string;
  subject: string;
  grades: string[];
  classTeacher: string;
  directions: string[];
  tasks: string[];
  priorities: string[];
  formats: string[];
  extra: string;
};

function asList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  const s = String(value).trim();
  return s ? [s] : [];
}

export function buildMethodHelpParticipants(payload: SurveyExportRowsPayload | null): MethodHelpParticipant[] {
  if (!payload) return [];
  const byKey = new Map<MethodHelpFieldKey, number[]>();
  for (const q of payload.questions) {
    const key = inferMethodHelpFieldKey(q.text);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(q.id);
    byKey.set(key, list);
  }
  const pick = (row: SurveyExportRowsPayload['rows'][number], key: MethodHelpFieldKey) => {
    const ids = byKey.get(key) ?? [];
    return ids.flatMap((id) => asList(row.answers[id]));
  };

  return [...payload.rows]
    .sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      return a.id - b.id;
    })
    .map((row) => ({
      id: row.id,
      name: pick(row, 'fio')[0] || `Участник #${row.id}`,
      submittedAt: row.created_at,
      experience: pick(row, 'experience')[0] || '—',
      subject: pick(row, 'subject')[0] || '—',
      grades: pick(row, 'grades'),
      classTeacher: pick(row, 'is_class_teacher')[0] || '—',
      directions: pick(row, 'directions'),
      tasks: pick(row, 'tasks'),
      priorities: pick(row, 'priorities'),
      formats: [...pick(row, 'help_formats'), ...pick(row, 'help_formats_other')],
      extra: pick(row, 'extra_request')[0] || '',
    }));
}
