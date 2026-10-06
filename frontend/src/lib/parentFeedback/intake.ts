export type IntakeDayRow = { day: string; count: number };
export type CumulativeIntakeRow = { day: string; count: number; total: number };

export type ParentFeedbackDashboardAggregate = {
  schema_version: number;
  metric_version: string;
  data_version: string;
  survey_id: number;
  total_responses: number;
  group_question_id: number | null;
  group_slices: Record<string, import('../../types').ResultQuestion[]>;
  group_slice_errors: boolean;
  intake_by_day: IntakeDayRow[];
  cumulative_intake: CumulativeIntakeRow[];
  intake_unique_responses: number;
};

export function intakeFromOpenRows(
  rows: { responseId: number; submitted_at: string }[],
): { byDay: IntakeDayRow[]; cumulative: CumulativeIntakeRow[] } {
  const byDay = new Map<string, number>();
  const seen = new Set<number>();
  for (const row of rows) {
    if (!row.submitted_at || seen.has(row.responseId)) continue;
    seen.add(row.responseId);
    const day = row.submitted_at.slice(0, 10);
    if (!day) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  let total = 0;
  const cumulative = days.map(([day, count]) => {
    total += count;
    return { day, count, total };
  });
  return {
    byDay: days.map(([day, count]) => ({ day, count })),
    cumulative,
  };
}
