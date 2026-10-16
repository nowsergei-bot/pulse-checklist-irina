// Итог, процент и отметка не хранятся, а считаются здесь.
// Шкала по Положению о системе оценивания: отметка от процента, округлённого до целого.

// Процент в целых числах, половина вверх: round(100 × баллы / максимум).
function percentOf(total, maxPoints) {
  return Math.floor((200 * total + maxPoints) / (2 * maxPoints));
}

// scale: [{ mark, min_percent }]; отметка с самым высоким подходящим порогом.
function markFor(percent, scale) {
  const rows = [...scale].sort((a, b) => Number(b.min_percent) - Number(a.min_percent));
  const row = rows.find(r => percent >= Number(r.min_percent));
  return row ? row.mark : null;
}

// parts: [{ id, name }]; tasks: [{ id, part_id, max_points }];
// absentPartIds: Set части со статусом «отсутствовал»; scores: Map task_id -> целое или null.
function studentResult({ parts, tasks, maxPoints, scale, absentPartIds, scores }) {
  let total = 0;
  let missing = 0;
  for (const task of tasks) {
    if (absentPartIds.has(task.part_id)) continue;
    const score = scores.get(task.id);
    if (score === null || score === undefined) missing += 1;
    else total += score;
  }
  const absentParts = parts.filter(p => absentPartIds.has(p.id));
  const complete = absentParts.length === 0 && missing === 0;
  const percent = percentOf(total, maxPoints);
  let state;
  if (absentParts.length) state = 'отсутствовал: ' + absentParts.map(p => p.name.toLowerCase()).join(' и ');
  else if (missing) state = 'не внесено баллов: ' + missing;
  else state = 'полная работа';
  return {
    total,
    percent,
    mark: complete ? markFor(percent, scale) : null,
    complete,
    missing,
    state,
  };
}

module.exports = { percentOf, markFor, studentResult };
