function optionsRecord(options) {
  return options && typeof options === 'object' && !Array.isArray(options) ? options : {};
}

function getQuestionFieldKey(q) {
  const key = optionsRecord(q && q.options).fieldKey;
  return typeof key === 'string' ? key.trim() : '';
}

function stripChoiceDecor(raw) {
  return String(raw || '')
    .replace(/[\uFE0F\u200D\u20E3]/g, '')
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{So}\s]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function choicesEqual(a, b) {
  return stripChoiceDecor(a).toLocaleLowerCase('ru') === stripChoiceDecor(b).toLocaleLowerCase('ru');
}

function answerValues(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  const s = String(value).trim();
  return s ? [s] : [];
}

function answersMap(answers) {
  if (answers instanceof Map) return answers;
  const map = new Map();
  if (!answers || typeof answers !== 'object') return map;
  for (const [k, v] of Object.entries(answers)) {
    const id = Number(k);
    if (Number.isFinite(id)) map.set(id, v);
  }
  return map;
}

function questionByFieldKey(questions, fieldKey) {
  const want = String(fieldKey || '')
    .trim()
    .toLowerCase();
  if (!want) return null;
  return questions.find((q) => getQuestionFieldKey(q).toLowerCase() === want) || null;
}

function valuesForFieldKey(questions, answers, fieldKey) {
  const q = questionByFieldKey(questions, fieldKey);
  if (!q) return [];
  return answerValues(answers.get(Number(q.id)));
}

function evaluateShowIf(rule, questions, answers) {
  if (!rule || typeof rule !== 'object') return true;
  const map = answersMap(answers);

  if (Array.isArray(rule.all)) {
    return rule.all.every((r) => evaluateShowIf(r, questions, map));
  }
  if (Array.isArray(rule.any)) {
    return rule.any.some((r) => evaluateShowIf(r, questions, map));
  }
  if (Array.isArray(rule.selectedCountFromFieldKeys)) {
    const count = rule.selectedCountFromFieldKeys.reduce(
      (sum, key) => sum + valuesForFieldKey(questions, map, String(key)).length,
      0,
    );
    if (typeof rule.gt === 'number') return count > rule.gt;
    if (typeof rule.gte === 'number') return count >= rule.gte;
    return count > 0;
  }
  if (typeof rule.fieldKey === 'string') {
    const values = valuesForFieldKey(questions, map, rule.fieldKey);
    if (Object.prototype.hasOwnProperty.call(rule, 'equals')) {
      return values.length === 1 && choicesEqual(values[0], rule.equals);
    }
    if (Object.prototype.hasOwnProperty.call(rule, 'includes')) {
      return values.some((v) => choicesEqual(v, rule.includes));
    }
    if (Array.isArray(rule.includesAny)) {
      return rule.includesAny.some((v) => values.some((item) => choicesEqual(item, v)));
    }
  }
  return true;
}

function getShowIfFromOptions(options) {
  const raw = optionsRecord(options).showIf;
  return raw && typeof raw === 'object' ? raw : null;
}

function isQuestionVisibleByShowIf(q, questions, answers) {
  return evaluateShowIf(getShowIfFromOptions(q.options), questions, answers);
}

function applyShowIfVisibility(questions, answersById, visibleIds) {
  for (const q of questions) {
    if (!isQuestionVisibleByShowIf(q, questions, answersById)) {
      visibleIds.delete(Number(q.id));
    }
  }
  return visibleIds;
}

function getMaxChoices(options) {
  const n = Number(optionsRecord(options).maxChoices);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function isRequiredWhenVisible(q) {
  if (q.required !== false) return true;
  return optionsRecord(q.options).requiredWhenVisible === true;
}

function allowedChoicesFromFieldKeys(q, questions) {
  const keys = optionsRecord(q.options).choicesFromFieldKeys;
  if (!Array.isArray(keys) || !keys.length) return null;
  const out = new Set();
  for (const key of keys) {
    const src = questionByFieldKey(questions, String(key));
    if (!src) continue;
    const opts = optionsRecord(src.options);
    const choices = Array.isArray(opts.choices) ? opts.choices : [];
    for (const c of choices) out.add(String(c));
  }
  return out;
}

module.exports = {
  applyShowIfVisibility,
  evaluateShowIf,
  getMaxChoices,
  getQuestionFieldKey,
  isQuestionVisibleByShowIf,
  isRequiredWhenVisible,
  allowedChoicesFromFieldKeys,
};
