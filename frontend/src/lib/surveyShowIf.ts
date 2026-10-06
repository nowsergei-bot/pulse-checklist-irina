import type { Question } from '../types';
import { getChoicesFromOptions, isOptionsRecord } from './surveyQuestionOptions';
import { choicesEqual } from './surveyChoiceDecor';

export type SurveyShowIf =
  | { fieldKey: string; equals: string }
  | { fieldKey: string; includes: string }
  | { fieldKey: string; includesAny: string[] }
  | { all: SurveyShowIf[] }
  | { any: SurveyShowIf[] }
  | { selectedCountFromFieldKeys: string[]; gt?: number; gte?: number };

export function optionsRecord(options: unknown): Record<string, unknown> {
  return isOptionsRecord(options) ? (options as Record<string, unknown>) : {};
}

export function getQuestionFieldKey(q: { options?: unknown }): string {
  const key = optionsRecord(q.options).fieldKey;
  return typeof key === 'string' ? key.trim() : '';
}

export function answerValues(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  const s = String(value).trim();
  return s ? [s] : [];
}

function answersMap(
  answers: Record<number, unknown> | Map<number, unknown>,
): Map<number, unknown> {
  if (answers instanceof Map) return answers;
  const map = new Map<number, unknown>();
  for (const [k, v] of Object.entries(answers)) {
    const id = Number(k);
    if (Number.isFinite(id)) map.set(id, v);
  }
  return map;
}

function questionByFieldKey(questions: Question[], fieldKey: string): Question | undefined {
  const want = fieldKey.trim().toLowerCase();
  if (!want) return undefined;
  return questions.find((q) => getQuestionFieldKey(q).toLowerCase() === want);
}

function valuesForFieldKey(
  questions: Question[],
  answers: Map<number, unknown>,
  fieldKey: string,
): string[] {
  const q = questionByFieldKey(questions, fieldKey);
  if (!q) return [];
  return answerValues(answers.get(Number(q.id)));
}

export function evaluateShowIf(
  rule: SurveyShowIf | null | undefined,
  questions: Question[],
  answers: Record<number, unknown> | Map<number, unknown>,
): boolean {
  if (!rule || typeof rule !== 'object') return true;
  const map = answersMap(answers);

  if ('all' in rule && Array.isArray(rule.all)) {
    return rule.all.every((r) => evaluateShowIf(r, questions, map));
  }
  if ('any' in rule && Array.isArray(rule.any)) {
    return rule.any.some((r) => evaluateShowIf(r, questions, map));
  }
  if ('selectedCountFromFieldKeys' in rule && Array.isArray(rule.selectedCountFromFieldKeys)) {
    const count = rule.selectedCountFromFieldKeys.reduce((sum, key) => {
      return sum + valuesForFieldKey(questions, map, String(key)).length;
    }, 0);
    if (typeof rule.gt === 'number') return count > rule.gt;
    if (typeof rule.gte === 'number') return count >= rule.gte;
    return count > 0;
  }
  if ('fieldKey' in rule && typeof rule.fieldKey === 'string') {
    const values = valuesForFieldKey(questions, map, rule.fieldKey);
    if ('equals' in rule) return values.length === 1 && choicesEqual(values[0], rule.equals);
    if ('includes' in rule) return values.some((v) => choicesEqual(v, rule.includes));
    if ('includesAny' in rule && Array.isArray(rule.includesAny)) {
      return rule.includesAny.some((v) => values.some((item) => choicesEqual(item, v)));
    }
  }
  return true;
}

export function getShowIfFromOptions(options: unknown): SurveyShowIf | null {
  const raw = optionsRecord(options).showIf;
  if (!raw || typeof raw !== 'object') return null;
  return raw as SurveyShowIf;
}

export function isQuestionVisibleByShowIf(
  q: Question,
  questions: Question[],
  answers: Record<number, unknown> | Map<number, unknown>,
): boolean {
  return evaluateShowIf(getShowIfFromOptions(q.options), questions, answers);
}

export function isRequiredWhenVisible(q: { required?: boolean; options?: unknown }): boolean {
  if (q.required !== false) return true;
  return optionsRecord(q.options).requiredWhenVisible === true;
}

export function getMaxChoices(options: unknown): number | null {
  const n = Number(optionsRecord(options).maxChoices);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function choicesFromPreviousAnswers(
  q: { options?: unknown },
  questions: Question[],
  answers: Record<number, unknown> | Map<number, unknown>,
): string[] | null {
  const keys = optionsRecord(q.options).choicesFromFieldKeys;
  if (!Array.isArray(keys) || !keys.length) return null;
  const map = answersMap(answers);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    for (const v of valuesForFieldKey(questions, map, String(key))) {
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function filterChoicesByChoiceVisibleIf(
  q: { options?: unknown },
  questions: Question[],
  answers: Record<number, unknown> | Map<number, unknown>,
  choices: string[],
): string[] {
  const rules = optionsRecord(q.options).choiceVisibleIf;
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return choices;
  const rec = rules as Record<string, SurveyShowIf>;
  return choices.filter((choice) => {
    const rule = rec[choice];
    if (!rule) return true;
    return evaluateShowIf(rule, questions, answers);
  });
}

export function getEffectiveChoiceValues(
  q: Question,
  questions: Question[],
  answers: Record<number, unknown> | Map<number, unknown>,
): string[] {
  const fromPrev = choicesFromPreviousAnswers(q, questions, answers);
  const base = fromPrev ?? getChoicesFromOptions(q.options);
  return filterChoicesByChoiceVisibleIf(q, questions, answers, base);
}
