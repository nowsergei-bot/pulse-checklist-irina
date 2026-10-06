const { isQuestionVisibleByShowIf } = require('./survey-show-if');
const BRANCHING_TYPES = new Set(['radio', 'checkbox']);

function isOptionsRecord(options) {
  return Boolean(options) && typeof options === 'object' && !Array.isArray(options);
}

function getBranchRulesFromOptions(options) {
  if (!isOptionsRecord(options) || !options.branchRules) return {};
  const raw = options.branchRules;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!val || typeof val !== 'object') continue;
    const action = val.action;
    if (action === 'next' || action === 'end') {
      out[key] = { action };
      continue;
    }
    if (action === 'goto') {
      const questionId = Number(val.questionId);
      const questionIndex = Number(val.questionIndex);
      out[key] = {
        action: 'goto',
        ...(Number.isFinite(questionId) && questionId > 0 ? { questionId } : {}),
        ...(Number.isFinite(questionIndex) && questionIndex >= 0 ? { questionIndex } : {}),
      };
    }
  }
  return out;
}

function orderedSurveyQuestions(questions) {
  return [...questions].sort((a, b) => a.sort_order - b.sort_order || Number(a.id) - Number(b.id));
}

function indexByQuestionId(ordered) {
  const map = new Map();
  ordered.forEach((q, i) => map.set(Number(q.id), i));
  return map;
}

function resolveGotoIndex(ordered, rule) {
  if (rule.action !== 'goto') return null;
  const byId = indexByQuestionId(ordered);
  if (rule.questionId != null && byId.has(Number(rule.questionId))) {
    return byId.get(Number(rule.questionId));
  }
  if (rule.questionIndex != null && rule.questionIndex >= 0 && rule.questionIndex < ordered.length) {
    return rule.questionIndex;
  }
  return null;
}

function normalizeChoiceValue(value) {
  const s = String(value);
  if (/^(другое|другими(?:\s*\([^)]*\))?)\s*:/i.test(s.trim())) {
    return s.replace(/\s*:[\s\S]*$/, '').trim();
  }
  return s;
}

function isEmptyBranchAnswer(type, value) {
  if (type === 'checkbox') return !Array.isArray(value) || value.length === 0;
  if (type === 'radio') return value == null || String(value).trim() === '';
  return true;
}

function ruleForChoice(rules, choice) {
  const key = normalizeChoiceValue(choice);
  const rule = rules[key];
  if (!rule || rule.action === 'next') return null;
  return rule;
}

function resolveCheckboxBranchAction(rules, values, ordered) {
  let gotoRule = null;
  let gotoIndex = -1;
  for (const v of values) {
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

function resolveBranchActionForQuestion(q, answer, ordered) {
  if (isOptionsRecord(q.options) && q.options.endAfterQuestion === true) return { action: 'end' };
  if (!BRANCHING_TYPES.has(q.type)) return null;
  const rules = getBranchRulesFromOptions(q.options);
  if (!Object.keys(rules).length) return null;
  if (isEmptyBranchAnswer(q.type, answer)) return null;

  if (q.type === 'radio') {
    return ruleForChoice(rules, String(answer));
  }
  if (q.type === 'checkbox' && Array.isArray(answer)) {
    return resolveCheckboxBranchAction(
      rules,
      answer.map((x) => String(x)),
      ordered,
    );
  }
  return null;
}

function getVisibleSurveyQuestions(questions, answersById) {
  const ordered = orderedSurveyQuestions(questions);
  const visible = [];
  let idx = 0;

  while (idx < ordered.length) {
    const q = ordered[idx];
    visible.push(q);
    if (isOptionsRecord(q.options) && q.options.endAfterQuestion === true
      && isQuestionVisibleByShowIf(q, questions, answersById)) break;
    const rules = getBranchRulesFromOptions(q.options);
    if (BRANCHING_TYPES.has(q.type) && Object.keys(rules).length) {
      const answer = answersById.get(Number(q.id));
      if (isEmptyBranchAnswer(q.type, answer)) break;
      const action = resolveBranchActionForQuestion(q, answer, ordered);
      if (action && action.action === 'end') break;
      if (action && action.action === 'goto') {
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

  return visible;
}

function getVisibleQuestionIds(questions, answersById) {
  return new Set(getVisibleSurveyQuestions(questions, answersById).map((q) => Number(q.id)));
}

module.exports = {
  getBranchRulesFromOptions,
  getVisibleQuestionIds,
  getVisibleSurveyQuestions,
};
