import { getChoicesFromOptions, isOptionsRecord } from './surveyQuestionOptions';
import { findOtherChoiceLabel, isOtherChoiceValue } from './surveyI18n';
import { isQuestionVisibleByShowIf } from './surveyShowIf';
import type { Question, QuestionType } from '../types';

export type SurveyBranchRule =
  | { action: 'next' }
  | { action: 'goto'; questionId?: number; questionIndex?: number }
  | { action: 'end' };

export type SurveyBranchRules = Record<string, SurveyBranchRule>;

const BRANCHING_TYPES = new Set<QuestionType>(['radio', 'checkbox']);

export function questionSupportsBranching(type: QuestionType): boolean {
  return BRANCHING_TYPES.has(type);
}

export function getBranchRulesFromOptions(options: unknown): SurveyBranchRules {
  if (!isOptionsRecord(options) || !options.branchRules) return {};
  const raw = options.branchRules;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: SurveyBranchRules = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!val || typeof val !== 'object') continue;
    const action = (val as SurveyBranchRule).action;
    if (action === 'next' || action === 'end') {
      out[key] = { action };
      continue;
    }
    if (action === 'goto') {
      const questionId = Number((val as { questionId?: number }).questionId);
      const questionIndex = Number((val as { questionIndex?: number }).questionIndex);
      out[key] = {
        action: 'goto',
        ...(Number.isFinite(questionId) && questionId > 0 ? { questionId } : {}),
        ...(Number.isFinite(questionIndex) && questionIndex >= 0 ? { questionIndex } : {}),
      };
    }
  }
  return out;
}

export function hasBranchRules(options: unknown): boolean {
  return Object.keys(getBranchRulesFromOptions(options)).length > 0;
}

export function setBranchRuleOnOptions(
  options: unknown,
  choice: string,
  rule: SurveyBranchRule | null,
  _type: QuestionType,
): unknown {
  const choices = getChoicesFromOptions(options);
  const rec = isOptionsRecord(options) ? { ...options } : { choices };
  if (!rec.choices?.length) rec.choices = choices;
  const branchRules = { ...getBranchRulesFromOptions(rec) };
  if (!rule || rule.action === 'next') {
    delete branchRules[choice];
  } else {
    branchRules[choice] = rule;
  }
  if (Object.keys(branchRules).length) rec.branchRules = branchRules;
  else delete rec.branchRules;
  return rec;
}

export function orderedSurveyQuestions<T extends { id: number; sort_order: number }>(questions: T[]): T[] {
  return [...questions].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

function indexByQuestionId<T extends { id: number }>(ordered: T[]): Map<number, number> {
  const map = new Map<number, number>();
  ordered.forEach((q, i) => map.set(q.id, i));
  return map;
}

export function resolveGotoIndex<T extends { id: number; sort_order: number }>(
  ordered: T[],
  rule: SurveyBranchRule,
): number | null {
  if (rule.action !== 'goto') return null;
  const byId = indexByQuestionId(ordered);
  if (rule.questionId != null && byId.has(rule.questionId)) {
    return byId.get(rule.questionId)!;
  }
  if (rule.questionIndex != null && rule.questionIndex >= 0 && rule.questionIndex < ordered.length) {
    return rule.questionIndex;
  }
  return null;
}

function normalizeChoiceValue(value: string, choices: string[] = []): string {
  if (!isOtherChoiceValue(value)) return value;
  return findOtherChoiceLabel(choices) || value.replace(/\s*:.*$/, '').trim();
}

function isEmptyBranchAnswer(type: QuestionType, value: unknown): boolean {
  if (type === 'checkbox') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (type === 'radio') {
    return value == null || String(value).trim() === '';
  }
  return true;
}

function ruleForChoice(rules: SurveyBranchRules, choice: string): SurveyBranchRule | null {
  const key = normalizeChoiceValue(choice);
  const rule = rules[key];
  if (!rule || rule.action === 'next') return null;
  return rule;
}

function resolveCheckboxBranchAction<T extends { id: number; sort_order: number }>(
  rules: SurveyBranchRules,
  values: string[],
  ordered: T[],
): SurveyBranchRule | null {
  const selected = values.map((value) => normalizeChoiceValue(value));
  let gotoRule: SurveyBranchRule | null = null;
  let gotoIndex = -1;
  for (const v of selected) {
    const rule = ruleForChoice(rules, v);
    if (!rule) continue;
    if (rule.action === 'end') return rule;
    if (rule.action === 'goto') {
      const idx = resolveGotoIndex(ordered, rule);
      if (idx != null && idx > gotoIndex) {
        gotoIndex = idx;
        gotoRule = rule;
      }
    }
  }
  return gotoRule;
}

export function resolveBranchActionForQuestion(
  q: Pick<Question, 'type' | 'options'>,
  answer: unknown,
  ordered?: Pick<Question, 'id' | 'sort_order'>[],
): SurveyBranchRule | null {
  if (isOptionsRecord(q.options) && q.options.endAfterQuestion === true) return { action: 'end' };
  if (!questionSupportsBranching(q.type)) return null;
  const rules = getBranchRulesFromOptions(q.options);
  if (!Object.keys(rules).length) return null;
  if (isEmptyBranchAnswer(q.type, answer)) return null;

  if (q.type === 'radio') {
    return ruleForChoice(rules, String(answer));
  }

  if (q.type === 'checkbox' && Array.isArray(answer)) {
    if (!ordered) return null;
    return resolveCheckboxBranchAction(
      rules,
      answer.map((x) => String(x)),
      ordered,
    );
  }

  return null;
}

export function getVisibleSurveyQuestions<T extends Question>(
  questions: T[],
  answers: Record<number, unknown>,
): T[] {
  const ordered = orderedSurveyQuestions(questions);
  const visible: T[] = [];
  let idx = 0;

  while (idx < ordered.length) {
    const q = ordered[idx]!;
    visible.push(q);
    if (isOptionsRecord(q.options) && q.options.endAfterQuestion === true
      && isQuestionVisibleByShowIf(q, questions, answers)) break;
    const rules = getBranchRulesFromOptions(q.options);
    if (questionSupportsBranching(q.type) && Object.keys(rules).length) {
      const answer = answers[q.id];
      if (isEmptyBranchAnswer(q.type, answer)) break;
      const action = resolveBranchActionForQuestion(q, answer, ordered);
      if (action?.action === 'end') break;
      if (action?.action === 'goto') {
        const gotoIdx = resolveGotoIndex(ordered, action);
        if (gotoIdx == null || gotoIdx <= idx) {
          idx += 1;
          continue;
        }
        idx = gotoIdx;
        continue;
      }
    }
    idx += 1;
  }

  return visible.filter((q) => isQuestionVisibleByShowIf(q, questions, answers));
}

export function getVisibleQuestionIds(questions: Question[], answers: Record<number, unknown>): Set<number> {
  return new Set(getVisibleSurveyQuestions(questions, answers).map((q) => q.id));
}

/** Builder save: resolve questionIndex → questionId for stable branching in DB. */
export function resolveBranchRulesForSave(
  options: unknown,
  ordered: { id?: number; sort_order: number }[],
): unknown {
  if (!isOptionsRecord(options) || !options.branchRules) return options;
  const rules = getBranchRulesFromOptions(options);
  if (!Object.keys(rules).length) return options;

  const sorted = [...ordered].sort((a, b) => a.sort_order - b.sort_order);
  const nextRules: SurveyBranchRules = {};

  for (const [choice, rule] of Object.entries(rules)) {
    if (rule.action !== 'goto') {
      nextRules[choice] = rule;
      continue;
    }
    let questionId = rule.questionId;
    if ((!questionId || questionId <= 0) && rule.questionIndex != null) {
      const target = sorted[rule.questionIndex];
      if (target?.id && target.id > 0) questionId = target.id;
    }
    if (questionId && questionId > 0) {
      nextRules[choice] = { action: 'goto', questionId };
    } else if (rule.questionIndex != null && rule.questionIndex >= 0) {
      nextRules[choice] = { action: 'goto', questionIndex: rule.questionIndex };
    }
  }

  const rec = { ...options };
  if (Object.keys(nextRules).length) rec.branchRules = nextRules;
  else delete rec.branchRules;
  return rec;
}

export type BranchTargetValue = 'next' | 'end' | `q:${number}` | `idx:${number}`;

export function branchTargetToValue(rule: SurveyBranchRule | null | undefined): BranchTargetValue {
  if (!rule || rule.action === 'next') return 'next';
  if (rule.action === 'end') return 'end';
  if (rule.questionId != null && rule.questionId > 0) return `q:${rule.questionId}`;
  if (rule.questionIndex != null && rule.questionIndex >= 0) return `idx:${rule.questionIndex}`;
  return 'next';
}

export function branchTargetFromValue(value: BranchTargetValue): SurveyBranchRule {
  if (value === 'next') return { action: 'next' };
  if (value === 'end') return { action: 'end' };
  if (value.startsWith('q:')) {
    const id = Number(value.slice(2));
    return Number.isFinite(id) && id > 0 ? { action: 'goto', questionId: id } : { action: 'next' };
  }
  if (value.startsWith('idx:')) {
    const idx = Number(value.slice(4));
    return Number.isFinite(idx) && idx >= 0 ? { action: 'goto', questionIndex: idx } : { action: 'next' };
  }
  return { action: 'next' };
}
