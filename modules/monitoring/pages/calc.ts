// Расчёт на экране по введённым значениям, ещё до сохранения.
// Повторяет server/lib/calc.cjs; после сохранения сервер считает так же.

export type ScaleRow = { mark: string; min_equivalent: number | string };
export type Result = { total: number; percent: number; equivalent: number; mark: string | null; complete: boolean; missing: number; state: string };

const round2 = (value: number) => Math.round(value * 100 + 1e-9) / 100;

function markFor(equivalent: number, scale: ScaleRow[]) {
  const rows = [...scale].sort((a, b) => Number(b.min_equivalent) - Number(a.min_equivalent));
  const row = rows.find(r => equivalent >= Number(r.min_equivalent));
  return row ? row.mark : null;
}

export function studentResult({ parts, tasks, maxPoints, scale, absentPartIds, scoreOf }: {
  parts: { id: number; name: string }[];
  tasks: { id: number; part_id: number }[];
  maxPoints: number;
  scale: ScaleRow[];
  absentPartIds: Set<number>;
  scoreOf: (taskId: number) => number | null;
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
  const equivalent = round2((total / maxPoints) * 5);
  let state;
  if (absentParts.length) state = 'отсутствовал: ' + absentParts.map(p => p.name.toLowerCase()).join(' и ');
  else if (missing) state = 'не внесено баллов: ' + missing;
  else state = 'полная работа';
  return { total, percent: (total / maxPoints) * 100, equivalent, mark: complete ? markFor(equivalent, scale) : null, complete, missing, state };
}
