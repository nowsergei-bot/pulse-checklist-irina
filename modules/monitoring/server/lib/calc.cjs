// Итог, процент и отметка не хранятся, а считаются здесь.
// Процент один: итог / максимум работы × 100, округление до целого.
// Обычная шкала по Положению о системе оценивания берётся из базы (grade_scale_rows):
// «5» от 90 %, «4» от 74 %, «3» от 50 % (миграции 004 и 010).
// Щадящий режим (решение кафедры 20.10.2026) на отметку не влияет: GENTLE_CHANGES_MARK = false,
// отметка всегда по обычной шкале, пометки «щадящий» нет. Где режим был включён, хранится по-прежнему.

// Меняет ли щадящий режим отметку. Чтобы режим снова ставил отметку по GENTLE_SCALE, поставьте true.
const GENTLE_CHANGES_MARK = false;

// Щадящие пороги, действовавшие 19–20.10.2026. Сейчас к отметке не применяются (GENTLE_CHANGES_MARK);
// нужны для сравнения «прежнее и новое правило» в аналитике.
const GENTLE_SCALE = Object.freeze([
  { mark: '5', min_percent: 90 },
  { mark: '4', min_percent: 75 },
  { mark: '3', min_percent: 45 },
  { mark: '2', min_percent: 0 },
]);

// Пороги зоны риска (вкладка «Аналитика»): единственное место, где они заданы. Экран получает их от сервера.
// Ученик: отметка «2»; процент от edge_from до edge_to; базовый уровень хотя бы одного раздела ниже basic_below %.
// Группа (по полным работам): доля «2» от group_twos_from %, или средний % ниже group_avg_below,
//   или в зоне риска больше group_risk_share учеников.
const RISK = Object.freeze({
  edge_from: 50,
  edge_to: 54,
  basic_below: 40,
  group_twos_from: 15,
  group_avg_below: 60,
  group_risk_share: 1 / 3,
});

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
// gentle: щадящий режим включён для группы; на отметку влияет, только если gentleChangesMark.
// graded = false (вид работы без отметки, например пробный ЕГЭ): только итог и процент,
// в результате нет ни отметки, ни щадящего режима.
function studentResult({ parts, tasks, maxPoints, scale, absentPartIds, scores, gentle = false, gentleScale = GENTLE_SCALE, gentleChangesMark = GENTLE_CHANGES_MARK, graded = true }) {
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
  if (!graded) return { total, percent, complete, missing, state };
  const normalMark = complete ? markFor(percent, scale) : null;
  const mark = complete && gentle && gentleChangesMark ? markFor(percent, gentleScale) : normalMark;
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

module.exports = { GENTLE_CHANGES_MARK, GENTLE_SCALE, RISK, percentOf, markFor, studentResult };
