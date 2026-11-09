import defaultSeed from './defaultSeed.json' with { type: 'json' };
import type { LessonVisitChecklistConfig, LessonVisitQuestion } from './types';

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

export const VISIT_CHECKLIST_FORM_VERSION = '4.1';

/**
 * Форма 4.1 из seed поверх сохранённой формы проекта (без миграции).
 * Номера вопросов (id) сохраняются по старому коду, поэтому старые ответы остаются привязаны к своим вопросам.
 * Убранные вопросы уходят в legacyQuestions, поля регистрации, которых нет в seed, остаются.
 */
export function ensureChecklistFormV41(checklist: LessonVisitChecklistConfig): LessonVisitChecklistConfig {
  const seed = defaultSeed as LessonVisitChecklistConfig;
  if (!checklist || !Array.isArray(checklist.sections) || checklist.formVersion === VISIT_CHECKLIST_FORM_VERSION) return checklist;
  if (seed.formVersion !== VISIT_CHECKLIST_FORM_VERSION) return checklist;
  const saved = checklist.sections.flatMap((sec) => sec.questions || []);
  const savedByCode = new Map(saved.map((q) => [String(q.code || '').trim(), q]));
  const savedIds = new Set(saved.map((q) => q.id));
  const mapped = new Set<string>();
  const seedQuestions = seed.sections.flatMap((sec) => sec.questions);
  for (const q of seedQuestions) {
    const prev = q.legacyCode ? savedByCode.get(q.legacyCode) : undefined;
    if (prev) mapped.add(prev.id);
  }
  const taken = new Set<string>([...savedIds, ...(checklist.legacyQuestions || []).map((q) => q.id)]);
  const freshId = (id: string) => {
    let next = id;
    for (let n = 2; taken.has(next); n += 1) next = `${id}_v41_${n}`;
    taken.add(next);
    return next;
  };
  const sections = seed.sections.map((sec) => ({
    ...sec,
    questions: sec.questions.map((q): LessonVisitQuestion => {
      const prev = q.legacyCode ? savedByCode.get(q.legacyCode) : undefined;
      return { ...q, options: [...q.options], id: prev ? prev.id : freshId(q.id) };
    }),
  }));
  const legacyQuestions: LessonVisitQuestion[] = [...(checklist.legacyQuestions || [])];
  for (const q of saved) {
    if (mapped.has(q.id) || legacyQuestions.some((l) => l.id === q.id)) continue;
    legacyQuestions.push({ ...q, legacyCode: q.legacyCode || q.code });
  }
  const generalFields = [...checklist.generalFields];
  for (const field of seed.generalFields) {
    if (!generalFields.some((f) => f.id === field.id)) generalFields.push({ ...field });
  }
  return { ...checklist, formVersion: VISIT_CHECKLIST_FORM_VERSION, generalFields, sections, legacyQuestions };
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
  return ensureSubjectSelectFromSeed(ensureVisitFormatSelfAnalysis(ensureChecklistFormV41(checklist)));
}
