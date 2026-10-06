import { type LessonAnalyticsCardTemplate, type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';

export const CARD_ARCHIVE_SCHEMA_V = 1;

function stableJson(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
}

/** Детерминированный хеш входных данных карточки (без текста ИИ). */
export function buildTeacherCardContentHash(input: {
  projectId: number;
  block: LessonAnalyticsTeacherBlock;
  cardTemplate?: LessonAnalyticsCardTemplate | null;
  /** Подпись строк наблюдений педагога (idx через запятую). */
  rowIdxSignature?: string;
  visitChecklistMode?: boolean;
}): string {
  const { projectId, block, cardTemplate, rowIdxSignature, visitChecklistMode } = input;
  const payload = {
    v: CARD_ARCHIVE_SCHEMA_V,
    projectId,
    teacherLabel: String(block.teacherLabel ?? '').trim(),
    agreedAt: block.agreedAt ?? null,
    status: block.status,
    tplAt: cardTemplate?.updatedAt ?? null,
    tplV: cardTemplate?.v ?? null,
    tplFocus: String(cardTemplate?.aiUserFocus ?? '').trim().slice(0, 120),
    tplFast: cardTemplate?.aiFastMode !== false ? 1 : 0,
    membership: block.rowMembership ?? null,
    rows: rowIdxSignature ?? '',
    visit: visitChecklistMode ? 1 : 0,
  };
  return stableJson(payload);
}

/** @deprecated Используйте buildTeacherCardContentHash; PDF-ключ включает текст ИИ для экспорта. */
export function buildTeacherPdfArchiveCacheKey(input: {
  projectId: number;
  block: LessonAnalyticsTeacherBlock;
  aiNarrative: string;
  cardTemplate?: LessonAnalyticsCardTemplate | null;
  rowIdxSignature?: string;
  visitChecklistMode?: boolean;
}): string {
  const base = buildTeacherCardContentHash(input);
  const extra = {
    aiLen: String(input.aiNarrative ?? '').trim().length,
    aiHead: String(input.aiNarrative ?? '').trim().slice(0, 240),
  };
  return stableJson({ base: JSON.parse(base), ...extra });
}

export function teacherPdfArchiveFilename(teacherLabel: string): string {
  const raw = String(teacherLabel || 'pedagogue')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return raw ? `Analitika_urokov_${raw}.pdf` : 'Analitika_urokov.pdf';
}
