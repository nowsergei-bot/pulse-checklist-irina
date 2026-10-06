import defaultSeed from './defaultSeed.json' with { type: 'json' };
import type { LessonVisitChecklistConfig } from './types';

export const VISIT_CHECKLIST_TITLE = 'Чек-лист посещения урока';
export const VISIT_FORMAT_SELF_ANALYSIS = 'Самоанализ';

/** Убирает «4.0» / «4.0.0» из пользовательских названий; внутренние id не трогает. */
export function displayVisitChecklistTitle(raw?: string | null): string {
  const cleaned = String(raw || '')
    .replace(/\s*\d+\.\d+\.\d+\b/g, '')
    .replace(/\s*4\.0\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!cleaned || /^чек-лист$/i.test(cleaned)) return VISIT_CHECKLIST_TITLE;
  return cleaned;
}

/** В «Формат посещения урока» всегда есть «Самоанализ», даже у старых сохранённых черновиков. */
export function ensureVisitFormatSelfAnalysis(checklist: LessonVisitChecklistConfig): LessonVisitChecklistConfig;
export function ensureVisitFormatSelfAnalysis(
  checklist: LessonVisitChecklistConfig | null | undefined,
): LessonVisitChecklistConfig | null | undefined;
export function ensureVisitFormatSelfAnalysis(
  checklist: LessonVisitChecklistConfig | null | undefined,
): LessonVisitChecklistConfig | null | undefined {
  if (!checklist || !Array.isArray(checklist.generalFields)) return checklist;
  return {
    ...checklist,
    generalFields: checklist.generalFields.map((field) => {
      if (field.id !== 'visit_format') return field;
      const options = Array.isArray(field.options) ? [...field.options] : [];
      if (!options.includes(VISIT_FORMAT_SELF_ANALYSIS)) options.push(VISIT_FORMAT_SELF_ANALYSIS);
      return { ...field, options };
    }),
  };
}

const seedSubjectField = (defaultSeed as LessonVisitChecklistConfig).generalFields.find((f) => f.id === 'subject');

/** Старые черновики в БД хранят «Предмет» как text; актуальный seed — select с опциями из Excel. */
export function ensureSubjectSelectFromSeed(checklist: LessonVisitChecklistConfig): LessonVisitChecklistConfig;
export function ensureSubjectSelectFromSeed(
  checklist: LessonVisitChecklistConfig | null | undefined,
): LessonVisitChecklistConfig | null | undefined;
export function ensureSubjectSelectFromSeed(
  checklist: LessonVisitChecklistConfig | null | undefined,
): LessonVisitChecklistConfig | null | undefined {
  if (!checklist || !Array.isArray(checklist.generalFields)) return checklist;
  if (
    !seedSubjectField ||
    seedSubjectField.type !== 'select' ||
    !Array.isArray(seedSubjectField.options) ||
    !seedSubjectField.options.length
  ) {
    return checklist;
  }
  return {
    ...checklist,
    generalFields: checklist.generalFields.map((field) => {
      if (field.id !== 'subject') return field;
      return {
        ...field,
        type: 'select',
        label: seedSubjectField.label || field.label,
        required: seedSubjectField.required ?? field.required,
        options: [...(seedSubjectField.options ?? [])],
      };
    }),
  };
}

/** Нормализация сохранённого чек-листа при загрузке (публичная форма, редактор, API). */
export function normalizeSavedChecklist(checklist: LessonVisitChecklistConfig): LessonVisitChecklistConfig;
export function normalizeSavedChecklist(
  checklist: LessonVisitChecklistConfig | null | undefined,
): LessonVisitChecklistConfig | null | undefined;
export function normalizeSavedChecklist(
  checklist: LessonVisitChecklistConfig | null | undefined,
): LessonVisitChecklistConfig | null | undefined {
  if (!checklist) return checklist;
  return ensureSubjectSelectFromSeed(ensureVisitFormatSelfAnalysis(checklist));
}
