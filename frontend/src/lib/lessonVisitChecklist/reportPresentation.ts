import {
  differenceAtLeast,
  exactMean,
  exactNumber,
  exactSum,
  numberOf,
  scaleFraction,
  type Fraction,
} from "./exactReportMath.ts";
import {
  lessonObservations,
  mean,
  pairedSelf,
  reportPersonKey,
  type DirectItem,
  type ReportVisit,
} from "./visitChecklistReport.ts";
import type { LessonVisitDirectory } from "./types.ts";

export const LEVELS = [
  "Очень низкий",
  "Низкий",
  "Средний",
  "Высокий",
  "Очень высокий",
];
export const LEVEL_COLORS = [
  "#CA4638",
  "#E98932",
  "#E7B522",
  "#79AF54",
  "#2C7D55",
];
export const DISCREPANCY_NAMES = {
  А: "Общая оценка не совпадает с чек-листом",
  Б: "Наблюдатели разошлись",
  В: "Самоанализ не совпадает с оценкой наблюдателей",
  Г: "Высокая оценка при пассивном классе или без обратной связи",
};
export const SHORT_TITLES: Record<string, string> = {
  "1.1": "Готовность к уроку",
  "2.1": "Кто сформулировал цели",
  "2.2": "Соответствие целей теме",
  "2.3": "Понятность целей ученикам",
  "3.1": "Соответствие содержания целям и программе",
  "3.2": "Структура урока",
  "3.3": "Темп урока",
  "3.5": "Межпредметные связи",
  "3.6": "Дифференциация",
  "3.8": "Домашнее задание",
  "4.1": "Доступность материала",
  "4.2": "Владение предметным содержанием",
  "5.1": "Обратная связь",
  "5.2": "Рефлексия",
  "5.3": "Контроль усвоения",
  "6.2": "Вовлечённость",
  "7.1": "Воспитательный потенциал",
  "8.2": "Наглядные материалы",
  "9.1": "Характер педагогического общения",
  "9.3": "Психологический климат",
};
export function shortName(name: string): string {
  if (name.includes(";")) return name.split(";").map(part => shortName(part.trim())).join(" / ");
  const words = name.trim().split(/\s+/);
  return words.length > 1
    ? `${words[0]} ${words
        .slice(1)
        .map((w) => `${w[0]}.`)
        .join("")}`
    : name || "Наблюдатель не указан";
}
function exactPercent(visit: ReportVisit): Fraction | null {
  if (visit.score.total != null && visit.score.max > 0)
    return scaleFraction(
      exactNumber(visit.score.exactTotal ?? visit.score.total),
      100,
      visit.score.max,
    );
  if (
    visit.score.items.some(
      (i) =>
        !i.na &&
        i.value == null &&
        !["missing_answer", "contradiction"].includes(i.status),
    )
  )
    return null;
  const items = visit.score.items.filter((i) => i.value != null && !i.na),
    maximum = items.reduce((n, i) => n + i.max, 0);
  return maximum
    ? scaleFraction(
        exactSum(items.map((i) => exactNumber(i.exactValue ?? i.value!))),
        100,
        maximum,
      )
    : null;
}
export function scorePercent(visit: ReportVisit) {
  const value = visit.score.total != null ? exactPercent(visit) : null;
  return value ? numberOf(value) : null;
}
export function preliminaryPercent(visit: ReportVisit) {
  const value = exactPercent(visit);
  return value ? numberOf(value) : null;
}
export function levelIndex(percent: number | null) {
  return percent == null
    ? -1
    : percent < 40
      ? 0
      : percent < 50
        ? 1
        : percent < 70
          ? 2
          : percent < 85
            ? 3
            : 4;
}
export function displayScore(value: number, maximum = 100) {
  const rounded = Math.round(value);
  return String(
    levelIndex((rounded / maximum) * 100) ===
      levelIndex((value / maximum) * 100)
      ? rounded
      : Math.floor(value * 10) / 10,
  ).replace(".", ",");
}
/** Equal teacher weights, retaining each full lesson's own available maximum. */
export function schoolAverage(rows: ReportVisit[]) {
  const teachers = new Map<string, Fraction[]>();
  for (const row of lessonObservations(rows)) {
    const p = row.score.total != null ? exactPercent(row) : null;
    if (p)
      teachers.set(row.teacherKey, [
        ...(teachers.get(row.teacherKey) || []),
        p,
      ]);
  }
  const value = exactMean([...teachers.values()].map((v) => exactMean(v)!));
  return value ? numberOf(value) : null;
}
export function eligibleItem(item: DirectItem) {
  return !item.na && (item.signalValue !== undefined
    ? item.signalValue != null
    : item.value != null && item.method !== "form_minimum");
}
export function signalItems(items: DirectItem[]): DirectItem[] {
  return items.filter(eligibleItem).map(item => item.signalValue !== undefined ? {...item, value: item.signalValue} : item);
}
export function losses(visit: ReportVisit) {
  return signalItems(visit.score.items)
    .filter((i) => i.value! < i.max)
    .sort(
      (a, b) =>
        b.max - b.value! - (a.max - a.value!) ||
        a.code.localeCompare(b.code, "ru", { numeric: true }),
    )
    .slice(0, 3);
}
export function itemText(item: DirectItem) {
  return `${item.code} ${SHORT_TITLES[item.code] || item.title}: ${item.value?.toLocaleString("ru")} из ${item.max}`;
}
export type Discrepancy = {
  key: string;
  type: keyof typeof DISCREPANCY_NAMES;
  lesson: ReportVisit;
  participants: ReportVisit[];
  description: string;
  preliminary: boolean;
  direction?: "выше" | "ниже";
};
function describe(v: ReportVisit) {
  const p = scorePercent(v) ?? preliminaryPercent(v),
    label = LEVELS[levelIndex(p)];
  const value = v.score.total ?? v.score.subtotal;
  return `${v.self ? "Самоанализ" : shortName(v.visitor)}: ${displayScore(value, v.score.max)}, ${label?.toLocaleLowerCase("ru") || "уровень не определён"} (общая оценка: ${v.ratingMapped.toLocaleLowerCase("ru") || "не выбрана"})`;
}
/** Flags are annotations; they never mutate scores or the support selection. */
export function discrepancies(
  rows: ReportVisit[],
  allRows = rows,
): Discrepancy[] {
  const output: Discrepancy[] = [];
  for (const lesson of lessonObservations(rows)) {
    const observations = rows.filter(
      (v) =>
        !v.self &&
        (lesson.pairKey ? v.pairKey === lesson.pairKey : v.id === lesson.id),
    );
    const add = (
      type: Discrepancy["type"],
      participants: ReportVisit[],
      description = participants.map(describe).join(" / "),
      direction?: Discrepancy["direction"],
    ) =>
      output.push({
        key: `${lesson.id}:${type}:${participants.map((v) => v.id).join(":")}`,
        type,
        lesson,
        participants,
        description,
        preliminary: participants.some((v) => v.score.total == null),
        direction,
      });
    for (const v of observations) {
      const calculated = levelIndex(scorePercent(v) ?? preliminaryPercent(v)),
        selected = LEVELS.indexOf(v.ratingMapped);
      if (
        selected >= 0 &&
        calculated >= 0 &&
        Math.abs(selected - calculated) >= 2
      )
        add("А", [v], undefined, selected > calculated ? "выше" : "ниже");
      if (selected >= 3) {
        const grounds = v.score.items.filter(
          (i) =>
            i.status === "scored" &&
            i.value != null &&
            ((i.code === "6.2" && i.value <= 3) ||
              (i.code === "5.1" && i.value === 0)),
        );
        if (grounds.length)
          add(
            "Г",
            [v],
            `${shortName(v.visitor)}: общая оценка ${v.ratingMapped.toLocaleLowerCase("ru")}; ${grounds.map((i) => `${(SHORT_TITLES[i.code] || i.title).toLocaleLowerCase("ru")} ${i.value} из ${i.max}`).join("; ")}`,
          );
      }
    }
    for (let a = 0; a < observations.length; a++)
      for (let b = a + 1; b < observations.length; b++) {
        const left = observations[a],
          right = observations[b],
          p = scorePercent(left) ?? preliminaryPercent(left),
          q = scorePercent(right) ?? preliminaryPercent(right);
        const x = LEVELS.indexOf(left.ratingMapped),
          y = LEVELS.indexOf(right.ratingMapped);
        if (
          (p != null &&
            q != null &&
            differenceAtLeast(exactPercent(left)!, exactPercent(right)!, 15)) ||
          (x >= 0 && y >= 0 && Math.abs(x - y) >= 2)
        )
          add("Б", [left, right]);
      }
    const self = pairedSelf(lesson, allRows);
    if (self) {
      const a = levelIndex(scorePercent(self) ?? preliminaryPercent(self)),
        b = levelIndex(scorePercent(lesson) ?? preliminaryPercent(lesson));
      if (a >= 0 && b >= 0 && Math.abs(a - b) >= 2)
        add("В", [self, { ...lesson, visitor: "Наблюдатели" }]);
    }
  }
  return output.sort(
    (a, b) =>
      Number(!["А", "Г"].includes(a.type)) -
        Number(!["А", "Г"].includes(b.type)) ||
      b.lesson.date.localeCompare(a.lesson.date) ||
      a.key.localeCompare(b.key),
  );
}
export function pageRows<T>(rows: T[], page: number, size: number | "all") {
  return size === "all" ? rows : rows.slice((page - 1) * size, page * size);
}

export function fullLessonCount(count: number) {
  const last = count % 10,
    two = count % 100;
  return `${count} ${two >= 11 && two <= 14 ? "полных уроков" : last === 1 ? "полный урок" : last >= 2 && last <= 4 ? "полных урока" : "полных уроков"}`;
}

export function teacherResultGroups(
  teachers: {
    key: string;
    name: string;
    department: string;
    rows: ReportVisit[];
  }[],
) {
  const groups = new Map<
    string,
    {
      title: string;
      preliminary: boolean;
      rows: {
        key: string;
        name: string;
        department: string;
        percent: number | null;
        value: number | null;
        maximum: number;
        count: number;
        rank: number | null;
      }[];
    }
  >();
  for (const teacher of teachers) {
    const byGroup = new Map<string, ReportVisit[]>();
    for (const visit of lessonObservations(teacher.rows)) {
      const partial = visit.score.total == null;
      const applicable = visit.score.items.filter(
        (i) => eligibleItem(i) || (i.value != null && !i.na),
      );
      const partialMaximum = applicable.reduce((n, i) => n + i.max, 0);
      const key = !partial
        ? visit.score.max === 100 && !visit.score.mixedApplicability
          ? "full"
          : "reduced"
        : preliminaryPercent(visit) == null
          ? "unfinished"
          : `partial:${partialMaximum}:${applicable
              .map((i) => i.code)
              .sort()
              .join(",")}`;
      byGroup.set(key, [...(byGroup.get(key) || []), visit]);
    }
    if (!teacher.rows.length) byGroup.set("unvisited", []);
    for (const [key, visits] of byGroup) {
      const preliminary = key.startsWith("partial:");
      const percent = mean(
        visits.map((v) =>
          preliminary ? preliminaryPercent(v) : scorePercent(v),
        ),
      );
      const sameMaximum =
        visits.length &&
        visits.every(
          (v) =>
            v.score.max === visits[0].score.max && !v.score.mixedApplicability,
        );
      const maximum = preliminary
        ? visits[0].score.items
            .filter((i) => i.value != null && !i.na)
            .reduce((n, i) => n + i.max, 0)
        : sameMaximum
          ? visits[0].score.max
          : 100;
      const value = percent == null ? null : (percent / 100) * maximum;
      const title =
        key === "full"
          ? "Полные итоги из 100"
          : key === "reduced"
            ? "Итоги с уменьшенным максимумом"
            : key === "unfinished"
              ? "Итог не сформирован"
              : key === "unvisited"
                ? "Уроки не посещены"
                : `Предварительные итоги · ${maximum} баллов оценённой части · пункты ${key.split(":")[2]}`;
      if (!groups.has(key)) groups.set(key, { title, preliminary, rows: [] });
      groups.get(key)!.rows.push({
        key: teacher.key,
        name: teacher.name,
        department: teacher.department,
        percent,
        value,
        maximum,
        count: visits.length,
        rank: null,
      });
    }
  }
  for (const group of groups.values()) {
    group.rows.sort(
      (a, b) =>
        (b.percent ?? -Infinity) - (a.percent ?? -Infinity) ||
        a.name.localeCompare(b.name, "ru"),
    );
    group.rows.forEach((row, i) => {
      if (row.percent != null) row.rank = i + 1;
    });
  }
  return [...groups]
    .sort(([a], [b]) => {
      const order = (key: string) =>
        key === "full"
          ? 0
          : key === "reduced"
            ? 1
            : key.startsWith("partial:")
              ? 2
              : key === "unfinished"
                ? 3
                : 4;
      return order(a) - order(b) || a.localeCompare(b, "ru", { numeric: true });
    })
    .map(([key, group]) => ({ key, ...group }));
}

/** Select whole lessons by a matching person, retaining all observations in their score. */
export function selectReportRows(
  rows: ReportVisit[],
  filters: {
    department?: string;
    teacher?: string | null;
    search?: string;
    group?: string;
  },
) {
  const base = rows.filter(
    (v) =>
      (!filters.department || v.department === filters.department) &&
      (!filters.teacher || v.teacherKey === filters.teacher),
  );
  const search = (filters.search || "").toLocaleLowerCase("ru");
  const matches = (v: ReportVisit) =>
    !search ||
    `${v.teacher} ${v.visitor}`.toLocaleLowerCase("ru").includes(search);
  const key = (v: ReportVisit) => v.pairKey || `response:${v.id}`;
  const selected = lessonObservations(base).filter((lesson) => {
    const observations = base.filter((v) => !v.self && key(v) === key(lesson));
    if (!observations.some(matches)) return false;
    if (filters.group === "full")
      return (
        lesson.score.total != null &&
        lesson.score.max === 100 &&
        !lesson.score.mixedApplicability
      );
    if (filters.group === "reduced")
      return (
        lesson.score.total != null &&
        (lesson.score.max !== 100 || lesson.score.mixedApplicability)
      );
    if (filters.group === "preliminary")
      return lesson.score.total == null && preliminaryPercent(lesson) != null;
    return true;
  });
  const keys = new Set(selected.map(key));
  const ids = new Set(
    base.filter((v) => !v.self && keys.has(key(v))).map((v) => v.id),
  );
  return base.filter((v) =>
    v.self
      ? (v.linkedLessonId != null
          ? ids.has(v.linkedLessonId)
          : keys.has(key(v))) ||
        ((!filters.group || filters.group === "all") && matches(v))
      : ids.has(v.id),
  );
}

/** Кафедры справочника, которые не входят в охват посещений (администрация, учебная часть). */
export const COVERAGE_EXCLUDED_DEPARTMENT_IDS = ["dept_admin", "dept_academic"];
export const UNIT_NOT_DEFINED = "Подразделение не определено";
export const UNIT_FILTER_NOT_DEFINED = "__none__";

export type CoverageRow = {
  key: string;
  name: string;
  department: string;
  units: string[];
  /** Посещения нет, но за период есть самоанализ. */
  selfOnly: boolean;
};
export type VisitCoverage = {
  visited: number;
  total: number;
  notVisited: CoverageRow[];
};

/**
 * Охват посещений: учителя справочника проекта (без администрации и учебной части),
 * у которых за период есть хотя бы одно наблюдение. Самоанализ посещением не считается.
 * `staffUnits` (ID учителя анкеты → подразделения) может быть пустым: тогда фильтр по подразделению не действует.
 */
export function visitCoverage(
  teachers: { key: string; name: string; department: string; visits: ReportVisit[] }[],
  directory: Pick<LessonVisitDirectory, "teachers">,
  options: {
    from?: string | null;
    to?: string | null;
    department?: string;
    unit?: string;
    staffUnits?: Record<string, string[]>;
  } = {},
): VisitCoverage {
  const excluded = new Set(COVERAGE_EXCLUDED_DEPARTMENT_IDS);
  const unitsByKey = new Map<string, string[]>();
  const rosterKeys = new Set<string>();
  for (const t of directory.teachers) {
    const key = reportPersonKey(t.name);
    if (!key || excluded.has(t.departmentId)) continue;
    rosterKeys.add(key);
    unitsByKey.set(key, options.staffUnits?.[t.id] || []);
  }
  const inPeriod = (v: ReportVisit) =>
    (!options.from || v.date >= options.from) &&
    (!options.to || v.date <= options.to);
  let visited = 0;
  let total = 0;
  const notVisited: CoverageRow[] = [];
  for (const teacher of teachers) {
    if (!rosterKeys.has(teacher.key)) continue;
    if (options.department && teacher.department !== options.department)
      continue;
    const units = unitsByKey.get(teacher.key) || [];
    if (options.unit) {
      const match =
        options.unit === UNIT_FILTER_NOT_DEFINED
          ? units.length === 0
          : units.includes(options.unit);
      if (!match) continue;
    }
    total += 1;
    const own = teacher.visits.filter(inPeriod);
    if (own.some((v) => !v.self)) {
      visited += 1;
      continue;
    }
    notVisited.push({
      key: teacher.key,
      name: teacher.name,
      department: teacher.department,
      units,
      selfOnly: own.some((v) => v.self),
    });
  }
  notVisited.sort(
    (a, b) =>
      a.department.localeCompare(b.department, "ru") ||
      a.name.localeCompare(b.name, "ru"),
  );
  return { visited, total, notVisited };
}

/** Все подразделения, найденные у учителей охвата (для выпадающего списка). */
export function coverageUnits(
  directory: Pick<LessonVisitDirectory, "teachers">,
  staffUnits: Record<string, string[]> | undefined,
): string[] {
  const excluded = new Set(COVERAGE_EXCLUDED_DEPARTMENT_IDS);
  const units = new Set<string>();
  for (const t of directory.teachers)
    if (!excluded.has(t.departmentId))
      for (const unit of staffUnits?.[t.id] || []) units.add(unit);
  return [...units].sort((a, b) => a.localeCompare(b, "ru"));
}
