export type FileCollectionFormat = 'text' | 'any' | 'video' | 'photo';

/** Поле анкеты перед загрузкой файлов (ФИО, класс и т.д.). */
export interface FileCollectionParticipantField {
  id: string;
  label: string;
  required: boolean;
  multiline?: boolean;
  placeholder?: string;
}

export interface FileCollectionConfig {
  v: 1;
  title: string;
  description: string;
  format: FileCollectionFormat;
  maxFiles: number;
  maxMbPerFile: number;
  /** Ограничение длительности видео, секунды; null — без ограничения (только для формата «видео»). */
  maxVideoDurationSec: number | null;
  /** Дополнительные вопросы участнику (пустой массив — только файлы). */
  participantFields: FileCollectionParticipantField[];
}

export function fileCollectionFormatLabelsRu(): Record<FileCollectionFormat, string> {
  return {
    text: 'Текстовые файлы',
    any: 'Любые файлы',
    video: 'Любые видеофайлы',
    photo: 'Фотографии',
  };
}

export function acceptForFormat(format: FileCollectionFormat): string {
  switch (format) {
    case 'text':
      return 'text/plain,text/csv,.txt,.csv,.md,.json,.log,.xml,.rtf,text/markdown,application/json';
    case 'video':
      return 'video/*,.mp4,.webm,.mov,.mkv,.avi,.mpeg,.mpg,.m4v';
    case 'photo':
      return 'image/*';
    case 'any':
    default:
      return '';
  }
}

export function defaultFileCollectionConfig(): FileCollectionConfig {
  return {
    v: 1,
    title: '',
    description: '',
    format: 'photo',
    maxFiles: 5,
    maxMbPerFile: 25,
    maxVideoDurationSec: null,
    participantFields: [],
  };
}

function utf8ToBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeFileCollectionPayload(c: FileCollectionConfig): string {
  return utf8ToBase64Url(JSON.stringify(c));
}

export function decodeFileCollectionPayload(raw: string): FileCollectionConfig | null {
  try {
    const s = decodeURIComponent(String(raw || '').trim());
    const obj = JSON.parse(base64UrlToUtf8(s)) as FileCollectionConfig;
    if (obj.v !== 1) return null;
    if (!obj.title || typeof obj.title !== 'string') return null;
    if (typeof obj.description !== 'string') return null;
    if (!isFormat(obj.format)) return null;
    if (!Number.isFinite(obj.maxFiles) || obj.maxFiles < 1 || obj.maxFiles > 200) return null;
    if (!Number.isFinite(obj.maxMbPerFile) || obj.maxMbPerFile < 1 || obj.maxMbPerFile > 2000) return null;

    let maxVideoDurationSec: number | null = null;
    const rawDur = (obj as { maxVideoDurationSec?: unknown }).maxVideoDurationSec;
    if (rawDur != null && rawDur !== '') {
      if (typeof rawDur !== 'number' || !Number.isFinite(rawDur)) return null;
      const dur = Math.floor(rawDur);
      if (dur < 1 || dur > 86_400) return null;
      maxVideoDurationSec = dur;
    }

    const participantFields: FileCollectionParticipantField[] = [];
    const rawPf = (obj as { participantFields?: unknown }).participantFields;
    if (rawPf != null && rawPf !== '') {
      if (!Array.isArray(rawPf)) return null;
      const seen = new Set<string>();
      for (const item of rawPf.slice(0, 20)) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const id = String(rec.id ?? '').trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 64);
        const label = String(rec.label ?? '').trim().slice(0, 200);
        if (!id || !label || seen.has(id)) continue;
        seen.add(id);
        participantFields.push({
          id,
          label,
          required: Boolean(rec.required),
          multiline: Boolean(rec.multiline),
          placeholder: String(rec.placeholder ?? '').trim().slice(0, 200),
        });
      }
    }

    return {
      v: 1,
      title: obj.title.slice(0, 500),
      description: obj.description.slice(0, 8000),
      format: obj.format,
      maxFiles: Math.floor(obj.maxFiles),
      maxMbPerFile: Math.floor(obj.maxMbPerFile),
      maxVideoDurationSec,
      participantFields,
    };
  } catch {
    return null;
  }
}

function isFormat(x: unknown): x is FileCollectionFormat {
  return x === 'text' || x === 'any' || x === 'video' || x === 'photo';
}

/** Поле для ФИО в пути бакета: по подписи «ФИО», id `fio`, иначе первое поле анкеты. */
export function resolveFioFieldIdForUpload(participantFields: FileCollectionParticipantField[]): string {
  const byLabel = participantFields.find((f) => /\bфио\b/i.test(f.label));
  if (byLabel?.id) return byLabel.id;
  const byId = participantFields.find((f) => /^fio$/i.test(f.id));
  if (byId?.id) return byId.id;
  const first = participantFields.find((f) => f.label.trim());
  return first?.id ?? '';
}

export function fileMatchesCollectionFormat(file: File, format: FileCollectionFormat): boolean {
  const name = file.name.toLowerCase();
  const t = (file.type || '').toLowerCase();
  switch (format) {
    case 'any':
      return true;
    case 'text':
      if (t.startsWith('text/')) return true;
      if (t === 'application/json' || t === 'application/xml' || t === 'application/rtf') return true;
      return /\.(txt|csv|md|log|json|xml|rtf|tsv)$/i.test(name);
    case 'video':
      if (t.startsWith('video/')) return true;
      return /\.(mp4|webm|mov|mkv|avi|mpeg|mpg|m4v|3gp)$/i.test(name);
    case 'photo':
      if (t.startsWith('image/')) return true;
      return /\.(jpg|jpeg|png|gif|webp|heic|bmp|tif|tiff)$/i.test(name);
    default:
      return false;
  }
}

/** Длительность в секундах из метаданных браузера; null — не удалось считать. */
export function probeVideoDurationSec(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    const finish = (sec: number | null) => {
      URL.revokeObjectURL(url);
      v.removeAttribute('src');
      v.load();
      resolve(sec);
    };
    const t = window.setTimeout(() => finish(null), 25_000);
    v.onloadedmetadata = () => {
      window.clearTimeout(t);
      const d = v.duration;
      if (!Number.isFinite(d) || d <= 0) finish(null);
      else finish(d);
    };
    v.onerror = () => {
      window.clearTimeout(t);
      finish(null);
    };
    v.src = url;
  });
}
