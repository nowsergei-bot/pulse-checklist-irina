import { isRatingMatrixComplete } from './ratingMatrix/grid';
import type { RatingMatrixAnswers } from './ratingMatrix/types';
import { isTeacherAvailabilityMatrix } from './teacherAvailability/grid';
import type { AvailabilityMatrix } from './teacherAvailability/types';
import type { Question } from '../types';
import { isLetterCheckQuestion } from './corporateLetterVisibility';
import { isEmailTextQuestion, questionOptionsIncludeTime } from './surveyQuestionOptions';
import { isRequiredWhenVisible } from './surveyShowIf';
import { isOtherChoiceValue } from './surveyI18n';
import {
  isLessonVisitOtherOption,
  isLessonVisitOtherSelected,
} from './lessonVisitChecklist/otherOption';
import type { LessonVisitChecklistConfig, LessonVisitQuestion } from './lessonVisitChecklist/types';

export interface PublicFormMissingField {
  id: string;
  label: string;
}

type SurveyAnswerValue =
  | string
  | number
  | string[]
  | AvailabilityMatrix
  | RatingMatrixAnswers
  | { batch_id?: string | null; files?: unknown[] }
  | { mode?: string; roommate?: string }
  | { table?: number; seat?: number }
  | { picks?: string[] }
  | { rounds?: Array<{ topicId?: string; practicalValue?: number; techniques?: string; recommend?: string }> };

export function isEmptySurveyAnswer(
  q: Question,
  value: SurveyAnswerValue,
  otherText?: string,
): boolean {
  if (q.type === 'checkbox') {
    const arr = Array.isArray(value) ? value : [];
    if (!arr.length) return true;
    if (arr.some((x) => isOtherChoiceValue(String(x)))) return !(otherText || '').trim();
    return false;
  }
  if (q.type === 'radio') {
    const s = String(value ?? '').trim();
    if (!s) return true;
    if (isOtherChoiceValue(s)) return !(otherText || '').trim();
    return false;
  }
  if (q.type === 'person_select') {
    const s = String(value ?? '').trim();
    if (!s) return true;
    const opts =
      q.options && typeof q.options === 'object' && !Array.isArray(q.options)
        ? (q.options as { allowManualEntry?: boolean; choices?: unknown[]; notInListLabel?: string })
        : {};
    const choices = Array.isArray(opts.choices) ? opts.choices.map(String) : [];
    const notInList = String(opts.notInListLabel || 'Моей фамилии нет в списке').trim();
    if (s === notInList) return true;
    if (!opts.allowManualEntry && choices.length) return !choices.includes(s);
    if (opts.allowManualEntry && choices.length && !choices.includes(s)) {
      const n = String(s || '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const tokens = n.split(' ').filter(Boolean);
      return n.length < 5 || tokens.length < 2 || tokens.length > 3;
    }
    return false;
  }
  if (q.type === 'text' || q.type === 'date') {
    const s = String(value ?? '').trim();
    if (!s) return true;
    if (q.type === 'text' && isEmailTextQuestion(q.options, q.text)) {
      return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(s);
    }
    if (q.type === 'date') {
      if (questionOptionsIncludeTime(q.options)) {
        return !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
      }
      return !/^\d{4}-\d{2}-\d{2}$/.test(s);
    }
    return false;
  }
  if (q.type === 'scale' || q.type === 'rating') {
    if (value === '' || value === undefined || value === null) return true;
    const n = Number(value);
    return !Number.isFinite(n);
  }
  if (q.type === 'teacher_availability') {
    // Пустая сетка {} допустима: все слоты «можно» по умолчанию.
    return value == null || !isTeacherAvailabilityMatrix(value);
  }
  if (q.type === 'rating_matrix') {
    return !isRatingMatrixComplete(value, q.options, q.required !== false);
  }
  if (q.type === 'file_upload') {
    const files = value && typeof value === 'object' && Array.isArray((value as { files?: unknown[] }).files)
      ? (value as { files: unknown[] }).files
      : [];
    const minFiles = Math.max(1, Number((q.options as { minFiles?: number })?.minFiles) || 1);
    return files.length < minFiles;
  }
  if (q.type === 'roommate_pair') {
    if (!value || typeof value !== 'object') return true;
    const mode = String((value as { mode?: string }).mode || '');
    if (mode === 'solo') return false;
    if (mode === 'request' || mode === 'confirm') {
      return !String((value as { roommate?: string }).roommate || '').trim();
    }
    return true;
  }
  if (q.type === 'table_seat') {
    if (value && typeof value === 'object') {
      const table = Number((value as { table?: number }).table);
      const seat = Number((value as { seat?: number }).seat);
      return !Number.isFinite(table) || table < 1 || !Number.isFinite(seat) || seat < 1;
    }
    return true;
  }
  if (q.type === 'topic_slots') {
    const opts =
      q.options && typeof q.options === 'object' && !Array.isArray(q.options)
        ? (q.options as {
            pickCount?: number;
            onePerGroup?: boolean;
            uniqueThemes?: boolean;
            mode?: string;
            groups?: Array<{ id: string }>;
            slots?: Array<{ id: string; group?: string; theme?: string }>;
          })
        : {};
    const need = Math.max(1, Number(opts.pickCount) || (opts.mode === 'rotation_table' ? 1 : 3));
    const picks =
      value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as { picks?: unknown[] }).picks)
        ? (value as { picks: unknown[] }).picks.map(String)
        : value && typeof value === 'object' && !Array.isArray(value) && (value as { groupId?: string }).groupId
          ? [String((value as { groupId: string }).groupId)]
          : [];
    if (picks.length !== need) return true;
    if (opts.mode === 'rotation_table') return false;
    const slots = Array.isArray(opts.slots) ? opts.slots : [];
    if (opts.uniqueThemes || opts.mode === 'vertical_slots') {
      const themeById = new Map(slots.map((s) => [String(s.id), String(s.theme || '')]));
      const themes = picks.map((id) => themeById.get(String(id)) || '').filter(Boolean);
      if (themes.length && new Set(themes).size !== themes.length) return true;
    }
    if (opts.onePerGroup && Array.isArray(opts.groups) && opts.groups.length) {
      const byId = new Map(slots.map((s) => [String(s.id), String(s.group || '')]));
      const groups = picks.map((id) => byId.get(String(id)) || '');
      if (new Set(groups).size !== picks.length) return true;
      for (const g of opts.groups) {
        if (!groups.includes(String(g.id))) return true;
      }
    }
    return false;
  }
  if (q.type === 'topic_feedback_rounds') {
    const opts =
      q.options && typeof q.options === 'object' && !Array.isArray(q.options)
        ? (q.options as { roundCount?: number; themes?: Array<{ id: string }> })
        : {};
    const roundCount = Math.max(1, Number(opts.roundCount) || 3);
    const themeIds = new Set(
      (Array.isArray(opts.themes) ? opts.themes : []).map((theme) => String(theme.id || '')).filter(Boolean),
    );
    const rounds =
      value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as { rounds?: unknown[] }).rounds)
        ? (value as { rounds: Array<{ topicId?: string; practicalValue?: number; recommend?: string }> }).rounds
        : [];
    if (rounds.length !== roundCount) return true;
    const seen = new Set<string>();
    for (const round of rounds) {
      const topicId = String(round.topicId || '').trim();
      if (!topicId || !themeIds.has(topicId) || seen.has(topicId)) return true;
      seen.add(topicId);
      const practicalValue = Number(round.practicalValue);
      if (!Number.isFinite(practicalValue) || practicalValue < 1 || practicalValue > 5) return true;
      if (!String(round.recommend || '').trim()) return true;
    }
    return false;
  }
  return false;
}

export function collectMissingSurveyQuestions(
  questions: Question[],
  answers: Record<number, SurveyAnswerValue>,
  otherTexts: Record<number, string>,
  getQuestionLabel?: (q: Question) => string,
  visibleQuestionIds?: Set<number>,
): PublicFormMissingField[] {
  const labelFor = getQuestionLabel ?? ((q: Question) => q.text);
  return questions
    .filter((q) => (visibleQuestionIds ? visibleQuestionIds.has(q.id) : true))
    .filter((q) => !isLetterCheckQuestion(q.options))
    .filter((q) => isRequiredWhenVisible(q) && isEmptySurveyAnswer(q, answers[q.id], otherTexts[q.id]))
    .map((q) => ({ id: `question-${q.id}`, label: labelFor(q) }));
}

function isEmptyLessonVisitAnswer(
  q: LessonVisitQuestion,
  value: string | string[] | undefined,
  otherText?: string,
): boolean {
  if (q.type === 'text') {
    return !value || !String(value).trim();
  }
  const isMulti = q.type === 'checkbox' || q.allowMultiple;
  if (isMulti) {
    const arr = Array.isArray(value) ? value : [];
    if (!arr.length) return true;
    if (arr.some((x) => isLessonVisitOtherOption(String(x)))) {
      return !(otherText || '').trim();
    }
    return false;
  }
  const s = String(value ?? '').trim();
  if (!s) return true;
  if (isLessonVisitOtherOption(s)) return !(otherText || '').trim();
  return false;
}

export function collectMissingLessonVisitFields(
  checklist: LessonVisitChecklistConfig,
  general: Record<string, string>,
  answers: Record<string, string | string[]>,
  otherTexts: Record<string, string> = {},
): PublicFormMissingField[] {
  const missing: PublicFormMissingField[] = [];

  for (const f of checklist.generalFields) {
    if (!f.required) continue;
    const v = general[f.id];
    if (!v || !String(v).trim()) {
      missing.push({ id: `general-${f.id}`, label: f.label });
    }
  }

  for (const sec of checklist.sections) {
    for (const q of sec.questions) {
      if (!q.required) continue;
      if (isEmptyLessonVisitAnswer(q, answers[q.id], otherTexts[q.id])) {
        const label = q.code ? `${q.code} ${q.text}` : q.text;
        const fieldId = isLessonVisitOtherSelected(answers[q.id], q)
          ? `question-${q.id}-other`
          : `question-${q.id}`;
        missing.push({ id: fieldId, label });
      }
    }
  }

  return missing;
}

export function scrollToFirstMissingField(missing: PublicFormMissingField[]) {
  const first = missing[0];
  if (!first) return;
  const el = document.getElementById(first.id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const focusable = el.querySelector<HTMLElement>(
    'input:not([type="hidden"]), select, textarea, button.public-choice-btn',
  );
  focusable?.focus({ preventScroll: true });
}
