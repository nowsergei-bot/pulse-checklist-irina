/**
 * Группировка карточек по коду кафедры в начале значения колонки «Педагог»
 * (например, «ЕН-12 …» → ЕН). Если в колонке только ФИО без префикса — блок «Прочие».
 */

/** Известные двух–четырёхбуквенные коды кафедр (дополняйте под вашу шкалу). */
export const TEACHER_DEPARTMENT_TITLES_RU: Record<string, string> = {
  ЕН: 'Естественные науки',
  ИН: 'Иностранные языки и литература',
  МА: 'Математика',
  ФИ: 'Физика',
  ХИ: 'Химия',
  БИ: 'Биология',
  РЯ: 'Русский язык и литература',
  ОБ: 'Обществознание',
  ИС: 'История',
  ГЕ: 'География',
  ИК: 'Информатика',
  АН: 'Английский язык',
  НМ: 'Начальная математика',
  ЛИ: 'Литература',
  ИЗ: 'ИЗО',
  МУ: 'Музыка',
  ФК: 'Физическая культура',
};

const CODE_RE = /^([А-ЯЁ]{2,4})(?=[\s\-–—_/\\.,:;№\d]|$)/u;

export function extractTeacherDepartmentCode(teacherLabel: string): string {
  const raw = String(teacherLabel ?? '').trim();
  if (!raw) return 'ПРОЧИЕ';
  const head = raw.replace(/^\s+/, '');
  const m = head.match(CODE_RE);
  if (m?.[1]) return m[1].toUpperCase();
  const token = head.split(/[\s\-–—_/\\]+/)[0]?.trim() ?? '';
  if (/^[А-ЯЁ]{2,4}$/u.test(token)) return token.toUpperCase();
  return 'ПРОЧИЕ';
}

export function teacherDepartmentTitleRu(code: string): string {
  const c = code.toUpperCase();
  return (
    TEACHER_DEPARTMENT_TITLES_RU[c] ??
    (c === 'ПРОЧИЕ' || c === 'ПРОЧЕЕ' ? 'Прочие (кафедра не распознана)' : `Код «${c}»`)
  );
}

export type TeacherDepartmentGroup<T> = {
  code: string;
  title: string;
  items: T[];
  withAiCount: number;
};

/** Плоский список педагогов по ФИО (без группировки по шифру кафедры). */
export function sortTeachersByLabel<T>(items: T[], labelOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => labelOf(a).localeCompare(labelOf(b), 'ru'));
}

export function groupByTeacherDepartment<T>(
  items: T[],
  labelOf: (item: T) => string,
): TeacherDepartmentGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const code = extractTeacherDepartmentCode(labelOf(item));
    if (!map.has(code)) map.set(code, []);
    map.get(code)!.push(item);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === 'ПРОЧИЕ' || a === 'ПРОЧЕЕ') return 1;
      if (b === 'ПРОЧИЕ' || b === 'ПРОЧЕЕ') return -1;
      return teacherDepartmentTitleRu(a).localeCompare(teacherDepartmentTitleRu(b), 'ru');
    })
    .map(([code, groupItems]) => ({
      code,
      title: teacherDepartmentTitleRu(code),
      items: groupItems.sort((x, y) => labelOf(x).localeCompare(labelOf(y), 'ru')),
      withAiCount: 0,
    }));
}
