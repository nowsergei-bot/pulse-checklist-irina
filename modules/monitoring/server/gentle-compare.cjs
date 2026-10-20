// Сравнение прежнего и нового правила щадящего режима на внесённых баллах: сколько отметок изменилось.
// Только числа по группам, без ФИО.
// Прежнее правило (19–20.10.2026): в группах с режимом отметка по щадящим порогам GENTLE_SCALE (90 / 75 / 45).
// Новое правило (с 20.10.2026): режим на отметку не влияет, отметка по обычной шкале работы (90 / 74 / 50).

const { GENTLE_SCALE, percentOf, markFor } = require('./lib/calc.cjs');

// Отметки ученика по двум правилам; null, если ученик не в щадящем режиме или работа не полная.
// r: строка buildStudents (gentle, result); scale: обычная шкала работы.
function ruleMarks(r, tasks, maxPoints, scale) {
  if (!r.gentle || !r.result.complete) return { rule_old: null, rule_new: null };
  const percent = percentOf(r.result.total, maxPoints);
  return { rule_old: markFor(percent, GENTLE_SCALE), rule_new: markFor(percent, scale) };
}

// Сводка по строкам с rule_old / rule_new: сколько сравнено, изменится, выше, ниже и переходы «было → станет».
function compareRules(rows) {
  const out = { compared: 0, changed: 0, higher: 0, lower: 0, moves: {} };
  for (const r of rows) {
    if (r.rule_old === null || r.rule_old === undefined) continue;
    out.compared += 1;
    if (r.rule_new === r.rule_old) continue;
    out.changed += 1;
    if (Number(r.rule_new) > Number(r.rule_old)) out.higher += 1;
    else out.lower += 1;
    const key = `${r.rule_old}→${r.rule_new}`;
    out.moves[key] = (out.moves[key] || 0) + 1;
  }
  return out;
}

module.exports = { ruleMarks, compareRules };
