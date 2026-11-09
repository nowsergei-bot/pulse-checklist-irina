// Сортировка таблицы групп на дашборде (задание Иры 09.11): по нажатию на заголовок любого столбца.
// По умолчанию средний процент по убыванию. Первое нажатие на числовой столбец сортирует по убыванию,
// на «Группа» и «Учитель» по алфавиту; повторное нажатие меняет направление.
// Группы без данных по выбранному столбцу всегда внизу. При равенстве порядок по названию группы.

export type SortKey = 'title' | 'teacher' | 'avg_mark' | 'avg_percent' | 'twos' | 'quality' | 'success' | 'entered';
export type SortDir = 'asc' | 'desc';
export type GroupSort = { key: SortKey; dir: SortDir };

export type SortableGroup = {
  title: string; teacher: string; n: number; m: number;
  avg_mark: number | null; avg_percent: number | null; twos: number | null; quality: number | null; success: number | null;
};

export const DEFAULT_SORT: GroupSort = { key: 'avg_percent', dir: 'desc' };
export const TEXT_KEYS: SortKey[] = ['title', 'teacher'];
// Столбцы, которых нет у работ без отметок (входное, пробный ЕГЭ).
export const GRADED_KEYS: SortKey[] = ['avg_mark', 'twos', 'quality', 'success'];

export const SORT_LABEL: Record<SortKey, string> = {
  title: 'Группа', teacher: 'Учитель', avg_mark: 'Средняя отметка', avg_percent: 'Средний %',
  twos: '«2»', quality: 'Качество', success: 'Успеваемость', entered: 'Внесено',
};

// Названия групп: латиница раньше кириллицы (9 A1, 9 B2, затем 9 ЦГ1), числа по значению.
const titleCmp = (x: string, y: string) => x.localeCompare(y, 'en', { numeric: true });
const byTitle = (a: SortableGroup, b: SortableGroup) => titleCmp(a.title, b.title);

function numeric(g: SortableGroup, key: SortKey): number | null {
  if (key === 'entered') return g.m > 0 ? g.n / g.m : null;
  if (g.n === 0) return null;
  const v = g[key as 'avg_mark' | 'avg_percent' | 'twos' | 'quality' | 'success'];
  return v === null || v === undefined ? null : v;
}

export function nextSort(current: GroupSort, key: SortKey): GroupSort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: TEXT_KEYS.includes(key) ? 'asc' : 'desc' };
}

// Если выбранного столбца у работы нет (работа без отметок), действует сортировка по умолчанию.
export function effectiveSort(sort: GroupSort, graded: boolean): GroupSort {
  return !graded && GRADED_KEYS.includes(sort.key) ? DEFAULT_SORT : sort;
}

export function sortGroups<T extends SortableGroup>(list: T[], sort: GroupSort): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (TEXT_KEYS.includes(sort.key)) {
      const x = sort.key === 'teacher' ? a.teacher : a.title;
      const y = sort.key === 'teacher' ? b.teacher : b.title;
      if (!x !== !y) return x ? -1 : 1;
      return sign * (sort.key === 'title' ? titleCmp(x, y) : x.localeCompare(y, 'ru', { numeric: true })) || byTitle(a, b);
    }
    const x = numeric(a, sort.key);
    const y = numeric(b, sort.key);
    if (x === null || y === null) return x === y ? byTitle(a, b) : x === null ? 1 : -1;
    if (sort.key === 'entered' && x === y) return sign * (a.n - b.n) || byTitle(a, b);
    return sign * (x - y) || byTitle(a, b);
  });
}

export function sortNote(sort: GroupSort): string {
  const how = TEXT_KEYS.includes(sort.key)
    ? (sort.dir === 'asc' ? 'по алфавиту' : 'по алфавиту в обратном порядке')
    : (sort.dir === 'desc' ? 'по убыванию' : 'по возрастанию');
  return `Сортировка: «${SORT_LABEL[sort.key]}», ${how}.`;
}
