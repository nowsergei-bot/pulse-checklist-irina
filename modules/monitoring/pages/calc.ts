// Расчёт на экране по введённым значениям, ещё до сохранения.
// Повторяет server/lib/calc.cjs; после сохранения сервер считает так же.
// Щадящий режим: повышенные задания с коэффициентом 0,5; отметка лучшая из двух процентов,
// щадящий срабатывает (gentle_used), только если по нему отметка выше.

export type ScaleRow = { mark: string; min_percent: number | string };
export type Result = { total: number; percent: number; gentle: boolean; gentle_percent: number | null; gentle_used: boolean; mark: string | null; complete: boolean; missing: number; state: string };

// Процент в целых числах, половина вверх: round(100 × баллы / максимум).
const percentOf = (total: number, maxPoints: number) => Math.floor((200 * total + maxPoints) / (2 * maxPoints));

function scaleRow(percent: number, scale: ScaleRow[]) {
  const rows = [...scale].sort((a, b) => Number(b.min_percent) - Number(a.min_percent));
  return rows.find(r => percent >= Number(r.min_percent)) || null;
}

function markFor(percent: number, scale: ScaleRow[]) {
  const row = scaleRow(percent, scale);
  return row ? row.mark : null;
}

// Щадящий процент даёт отметку выше обычной: его порог по шкале выше.
function gentleWins(percent: number, gentlePercent: number | null, scale: ScaleRow[]) {
  if (gentlePercent === null) return false;
  const normal = scaleRow(percent, scale);
  const gentle = scaleRow(gentlePercent, scale);
  return Boolean(gentle) && (!normal || Number(gentle!.min_percent) > Number(normal.min_percent));
}

export function studentResult({ parts, tasks, maxPoints, scale, absentPartIds, scoreOf, gentle = false }: {
  parts: { id: number; name: string }[];
  tasks: { id: number; part_id: number; level: string; max_points: number }[];
  maxPoints: number;
  scale: ScaleRow[];
  absentPartIds: Set<number>;
  scoreOf: (taskId: number) => number | null;
  gentle?: boolean;
}): Result {
  let total = 0;
  let missing = 0;
  let advanced = 0;
  let maxAdvanced = 0;
  for (const task of tasks) {
    if (task.level === 'advanced') maxAdvanced += task.max_points;
    if (absentPartIds.has(task.part_id)) continue;
    const score = scoreOf(task.id);
    if (score === null || score === undefined) missing += 1;
    else {
      total += score;
      if (task.level === 'advanced') advanced += score;
    }
  }
  const absentParts = parts.filter(p => absentPartIds.has(p.id));
  const complete = absentParts.length === 0 && missing === 0;
  const percent = percentOf(total, maxPoints);
  const gentlePercent = gentle ? percentOf(2 * total - advanced, 2 * maxPoints - maxAdvanced) : null;
  let state;
  if (absentParts.length) state = 'отсутствовал: ' + absentParts.map(p => p.name.toLowerCase()).join(' и ');
  else if (missing) state = 'не внесено баллов: ' + missing;
  else state = 'полная работа';
  const gentleUsed = complete && gentleWins(percent, gentlePercent, scale);
  const mark = complete ? markFor(gentleUsed ? gentlePercent as number : percent, scale) : null;
  return { total, percent, gentle, gentle_percent: gentlePercent, gentle_used: gentleUsed, mark, complete, missing, state };
}
