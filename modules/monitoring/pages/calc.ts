// Расчёт на экране по введённым значениям, ещё до сохранения.
// Повторяет server/lib/calc.cjs; после сохранения сервер считает так же.
// Щадящий режим: повышенные задания с коэффициентом 0,5, отметка только по этому проценту.

export type ScaleRow = { mark: string; min_percent: number | string };
export type Result = { total: number; percent: number; gentle: boolean; gentle_percent: number | null; mark: string | null; complete: boolean; missing: number; state: string };

// Процент в целых числах, половина вверх: round(100 × баллы / максимум).
const percentOf = (total: number, maxPoints: number) => Math.floor((200 * total + maxPoints) / (2 * maxPoints));

function markFor(percent: number, scale: ScaleRow[]) {
  const rows = [...scale].sort((a, b) => Number(b.min_percent) - Number(a.min_percent));
  const row = rows.find(r => percent >= Number(r.min_percent));
  return row ? row.mark : null;
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
  const mark = complete ? markFor(gentlePercent ?? percent, scale) : null;
  return { total, percent, gentle, gentle_percent: gentlePercent, mark, complete, missing, state };
}
