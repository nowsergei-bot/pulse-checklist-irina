const FILTER_KEYS = ['period', 'week_start', 'from', 'to', 'department', 'teacher_filter', 'class', 'subject', 'format', 'level', 'selected_level', 'selection', 'calculation', 'observer', 'search', 'sort', 'policy', 'maximum', 'criterion', 'criterion_mode'] as const;
export function dashboardQuery(params: URLSearchParams): URLSearchParams {
 const next = new URLSearchParams({ version: 'pulse-v3' });
 for (const key of [...FILTER_KEYS, 'project', 'view', 'teacher', 'teacher_tab', 'lesson', 'page']) {
  const value = params.get(key); if (value) next.set(key, value);
 }
 if (!next.has('period')) next.set('period', 'week');
 return next;
}
/** Drill-down changes presentation keys, preserving the complete selection context. */
export function navigateContext(params: URLSearchParams, updates: Record<string, string | null>): URLSearchParams {
 const next = new URLSearchParams(params);
 for (const [key, value] of Object.entries(updates)) value ? next.set(key, value) : next.delete(key);
 if (!Object.hasOwn(updates, 'page')) next.delete('page');
 return next;
}
export function exactText(value: import('./types').Exact | null | undefined): string {
 if (value == null) return '—';
 if (typeof value === 'number') return String(value).replace('.', ',');
 return `${value.numerator}/${value.denominator}`;
}

export function shiftedWeek(from:string,weeks:number):string { return new Date(new Date(`${from}T00:00:00Z`).getTime()+weeks*7*86400000).toISOString().slice(0,10); }
