// Сравнение прежнего и нового правила щадящего режима на внесённых баллах: сколько отметок изменилось.
// Только числа по группам, без ФИО. Обе отметки считаются здесь из баллов.
// Прежнее правило (до 19.10.2026): отметка лучшая из двух, по обычному проценту и по
//   (2 × базовые + повышенные) / (2 × макс. базовых + макс. повышенных).
// Новое правило: процент один (итог / максимум), отметка по щадящим порогам GENTLE_SCALE (lib/calc.cjs).

const { GENTLE_SCALE, percentOf, markFor } = require('./lib/calc.cjs');

const better = (a, b) => (b !== null && (a === null || Number(b) > Number(a)) ? b : a);

// Отметки ученика по двум правилам; null, если ученик не в щадящем режиме или работа не полная.
// r: строка buildStudents (gentle, result, scores по task_id); tasks: задания с level и max_points.
function ruleMarks(r, tasks, maxPoints, scale) {
  if (!r.gentle || !r.result.complete) return { rule_old: null, rule_new: null };
  let advanced = 0;
  let maxAdvanced = 0;
  for (const t of tasks) {
    if (t.level !== 'advanced') continue;
    maxAdvanced += t.max_points;
    advanced += Number(r.scores[t.id] || 0);
  }
  const total = r.result.total;
  const percent = percentOf(total, maxPoints);
  const oldGentle = percentOf(2 * total - advanced, 2 * maxPoints - maxAdvanced);
  return {
    rule_old: better(markFor(percent, scale), markFor(oldGentle, scale)),
    rule_new: markFor(percent, GENTLE_SCALE),
  };
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
