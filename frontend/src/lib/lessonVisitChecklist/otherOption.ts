import type { LessonVisitChecklistConfig, LessonVisitQuestion } from './types';

export function isLessonVisitOtherOption(option: string): boolean {
  const t = option.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  return t === 'другое' || t.startsWith('другое');
}

export function questionHasOtherOption(q: LessonVisitQuestion): boolean {
  return q.options.some(isLessonVisitOtherOption);
}

export function getOtherOptionLabel(q: LessonVisitQuestion): string | null {
  return q.options.find(isLessonVisitOtherOption) ?? null;
}

export function isLessonVisitOtherSelected(
  value: string | string[] | undefined,
  q: LessonVisitQuestion,
): boolean {
  const otherLabel = getOtherOptionLabel(q);
  if (!otherLabel) return false;
  if (Array.isArray(value)) return value.includes(otherLabel);
  return value === otherLabel;
}

export function formatLessonVisitAnswerForSubmit(
  q: LessonVisitQuestion,
  value: string | string[] | undefined,
  otherText: string | undefined,
): string | string[] | undefined {
  const otherLabel = getOtherOptionLabel(q);
  if (!otherLabel || value == null) return value;

  const trimmed = (otherText || '').trim();
  const withOther = (label: string) => (trimmed ? `${label}: ${trimmed}` : label);

  if (q.type === 'checkbox' || q.allowMultiple) {
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((x) => (x === otherLabel ? withOther(x) : x));
  }

  if (value === otherLabel) return withOther(otherLabel);
  return value;
}

export function prepareLessonVisitAnswersForSubmit(
  checklist: LessonVisitChecklistConfig,
  answers: Record<string, string | string[]>,
  otherTexts: Record<string, string>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = { ...answers };
  for (const sec of checklist.sections) {
    for (const q of sec.questions) {
      if (!questionHasOtherOption(q)) continue;
      const formatted = formatLessonVisitAnswerForSubmit(q, answers[q.id], otherTexts[q.id]);
      if (formatted !== undefined) out[q.id] = formatted;
    }
  }
  return out;
}
