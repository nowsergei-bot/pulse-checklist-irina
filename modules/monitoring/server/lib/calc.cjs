// Итог, процент и отметка не хранятся, а считаются здесь.
// Процент один: итог / максимум работы × 100, округление до целого.
// Обычная шкала по Положению о системе оценивания берётся из базы (grade_scale_rows).
// Щадящий режим: тот же процент, но отметка по щадящим порогам GENTLE_SCALE.
// Пометка «щадящий» (gentle_used), только если по щадящим порогам отметка выше обычной.

// Щадящие пороги: единственное место, где они заданы. Экран получает их от сервера.
const GENTLE_SCALE = Object.freeze([
  { mark: '5', min_percent: 90 },
  { mark: '4', min_percent: 75 },
  { mark: '3', min_percent: 45 },
  { mark: '2', min_percent: 0 },
]);

// Процент в целых числах, половина вверх: round(100 × баллы / максимум).
function percentOf(total, maxPoints) {
  return Math.floor((200 * total + maxPoints) / (2 * maxPoints));
}

// scale: [{ mark, min_percent }]; строка шкалы с самым высоким подходящим порогом.
function scaleRow(percent, scale) {
  const rows = [...scale].sort((a, b) => Number(b.min_percent) - Number(a.min_percent));
  return rows.find(r => percent >= Number(r.min_percent)) || null;
}

function markFor(percent, scale) {
  const row = scaleRow(percent, scale);
  return row ? row.mark : null;
}

// Отметка по щадящим порогам выше обычной.
function higherMark(gentleMark, normalMark) {
  return gentleMark !== null && (normalMark === null || Number(gentleMark) > Number(normalMark));
}

// parts: [{ id, name }]; tasks: [{ id, part_id, max_points }];
// absentPartIds: Set части со статусом «отсутствовал»; scores: Map task_id -> целое или null.
// gentle: щадящий режим включён для группы.
function studentResult({ parts, tasks, maxPoints, scale, absentPartIds, scores, gentle = false, gentleScale = GENTLE_SCALE }) {
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
  const normalMark = complete ? markFor(percent, scale) : null;
  const mark = complete && gentle ? markFor(percent, gentleScale) : normalMark;
  return {
    total,
    percent,
    gentle: Boolean(gentle),
    gentle_used: Boolean(gentle) && complete && higherMark(mark, normalMark),
    mark,
    complete,
    missing,
    state,
  };
}

module.exports = { GENTLE_SCALE, percentOf, markFor, studentResult };
