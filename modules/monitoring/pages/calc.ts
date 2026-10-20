// Расчёт на экране по введённым значениям, ещё до сохранения.
// Повторяет server/lib/calc.cjs; после сохранения сервер считает так же.
// Процент один: итог / максимум. Щадящий режим меняет отметку, только если сервер прислал
// gentle_changes_mark (сейчас нет: отметка всегда по обычной шкале); тогда отметка по gentle_scale,
// пометка «щадящий» (gentle_used), только если отметка выше обычной.

export type ScaleRow = { mark: string; min_percent: number | string };
export type Result = { total: number; percent: number; gentle: boolean; gentle_used: boolean; mark: string | null; complete: boolean; missing: number; state: string };

// Процент в целых числах, половина вверх: round(100 × баллы / максимум).
const percentOf = (total: number, maxPoints: number) => Math.floor((200 * total + maxPoints) / (2 * maxPoints));

function markFor(percent: number, scale: ScaleRow[]) {
  const rows = [...scale].sort((a, b) => Number(b.min_percent) - Number(a.min_percent));
  const row = rows.find(r => percent >= Number(r.min_percent));
  return row ? row.mark : null;
}

// Отметка по щадящим порогам выше обычной.
const higherMark = (gentleMark: string | null, normalMark: string | null) =>
  gentleMark !== null && (normalMark === null || Number(gentleMark) > Number(normalMark));

export function studentResult({ parts, tasks, maxPoints, scale, gentleScale, gentleChangesMark, absentPartIds, scoreOf, gentle = false }: {
  parts: { id: number; name: string }[];
  tasks: { id: number; part_id: number; max_points: number }[];
  maxPoints: number;
  scale: ScaleRow[];
  gentleScale: ScaleRow[];
  gentleChangesMark: boolean;
  absentPartIds: Set<number>;
  scoreOf: (taskId: number) => number | null;
  gentle?: boolean;
}): Result {
  let total = 0;
  let missing = 0;
  for (const task of tasks) {
    if (absentPartIds.has(task.part_id)) continue;
    const score = scoreOf(task.id);
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
  const mark = complete && gentle && gentleChangesMark ? markFor(percent, gentleScale) : normalMark;
  return { total, percent, gentle, gentle_used: gentle && complete && higherMark(mark, normalMark), mark, complete, missing, state };
}
