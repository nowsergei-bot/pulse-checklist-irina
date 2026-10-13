// Итог, процент, эквивалент и отметка не хранятся, а считаются здесь.

function round2(value) {
  return Math.round(value * 100 + 1e-9) / 100;
}

// scale: [{ mark, min_equivalent }]; отметка с самым высоким подходящим порогом.
function markFor(equivalent, scale) {
  const rows = [...scale].sort((a, b) => Number(b.min_equivalent) - Number(a.min_equivalent));
  const row = rows.find(r => equivalent >= Number(r.min_equivalent));
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
  const equivalent = round2((total / maxPoints) * 5);
  let state;
  if (absentParts.length) state = 'отсутствовал: ' + absentParts.map(p => p.name.toLowerCase()).join(' и ');
  else if (missing) state = 'не внесено баллов: ' + missing;
  else state = 'полная работа';
  return {
    total,
    percent: (total / maxPoints) * 100,
    equivalent,
    mark: complete ? markFor(equivalent, scale) : null,
    complete,
    missing,
    state,
  };
}

module.exports = { round2, markFor, studentResult };
