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
  REPORT_START,
  SECTION_NAMES,
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
/** Сигнальные оценки для приоритетов и подсветки: без пунктов с баллом по отметке формы. */
export function attentionSignalItems(items: DirectItem[]): DirectItem[] {
  return signalItems(items).filter((i) => !FORM_BASELINE_CODES.includes(i.code));
}
/** «Приоритеты»: критерии со средним ниже 50% от максимума, от слабых к сильным. */
export function priorityCriteria<
  T extends { code: string; percent: number | null; priority: number | null },
>(criteria: T[]): T[] {
  return criteria
    .filter(
      (c) =>
        !FORM_BASELINE_CODES.includes(c.code) && c.percent != null && c.percent < 50,
    )
    .sort((a, b) => a.priority! - b.priority!);
}
/** Подсветка блока: % от максимума по сигнальным оценкам уроков; null, если оценивать нечего. */
export function blockAttentionPercent(blocks: DirectItem[][]): number | null {
  const items = blocks.flatMap(attentionSignalItems);
  const maximum = items.reduce((n, i) => n + i.max, 0);
  return maximum ? (items.reduce((n, i) => n + i.value!, 0) / maximum) * 100 : null;
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

/* ---------- Сводка для директора ---------- */

export type DirectorPeriod = "week" | "month" | "year";
export const DIRECTOR_PERIODS: { id: DirectorPeriod; label: string }[] = [
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "year", label: "Учебный год" },
];

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function mondayOf(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}

/**
 * Границы периода: неделя — последняя завершённая, месяц — последний завершённый календарный
 * месяц (не раньше начала отчёта), год — с начала учебного года по сегодня.
 * Для месяца, который целиком раньше начала отчёта, возвращает null.
 */
export function directorPeriodRange(
  period: DirectorPeriod,
  week: { start: string; end: string; today: string },
): { from: string; to: string } | null {
  if (period === "week") return { from: week.start, to: week.end };
  if (period === "year") return { from: REPORT_START, to: week.today };
  const firstOfThisMonth = `${week.today.slice(0, 7)}-01`;
  const to = shiftDate(firstOfThisMonth, -1);
  const from = `${to.slice(0, 7)}-01`;
  if (to < REPORT_START) return null;
  return { from: from < REPORT_START ? REPORT_START : from, to };
}

/** Недели (пн–вс), по которым стрелками показывается динамика итога; неделя, начавшаяся до начала отчёта, не показывается. */
export function directorWeeks(
  period: DirectorPeriod,
  range: { from: string; to: string },
  week: { start: string },
): { start: string; end: string }[] {
  const weeks: { start: string; end: string }[] = [];
  const first = period === "week" ? shiftDate(week.start, -21) : mondayOf(range.from);
  const last = period === "week" ? week.start : mondayOf(range.to);
  for (let start = first; start <= last; start = shiftDate(start, 7)) {
    const end = shiftDate(start, 6);
    if (start >= REPORT_START) weeks.push({ start, end });
  }
  return weeks;
}

/** Средний итог (учителя поровну) по каждой неделе; период обрезает крайние недели. */
export function weeklyAverages(
  visits: ReportVisit[],
  weeks: { start: string; end: string }[],
  clip?: { from: string; to: string },
): { start: string; end: string; value: number | null }[] {
  return weeks.map(({ start, end }) => {
    const from = clip && clip.from > start ? clip.from : start;
    const to = clip && clip.to < end ? clip.to : end;
    return {
      start,
      end,
      value: schoolAverage(visits.filter((v) => v.date >= from && v.date <= to)),
    };
  });
}
/** «07.09: 72 → 14.09: 69,9»: пары «понедельник: итог» через стрелку. */
export function weeklyArrows(
  series: { start: string; value: number | null }[],
): string {
  return series
    .map(
      (w) =>
        `${w.start.slice(8, 10)}.${w.start.slice(5, 7)}: ${w.value == null ? "нет данных" : displayScore(w.value)}`,
    )
    .join(" → ");
}

/** Круглые деления шкалы 0…top: шаг 1, 2, 5, 10, 20, 25, 50… не более пяти делений. */
export function niceAxis(max: number): { top: number; ticks: number[] } {
  const target = Math.max(1, Math.ceil(max));
  let step = 1;
  for (const base of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) {
    step = base;
    if (Math.ceil(target / base) <= 5) break;
  }
  const count = Math.max(1, Math.ceil(target / step));
  return {
    top: count * step,
    ticks: Array.from({ length: count + 1 }, (_, i) => i * step),
  };
}

export type AttentionGroup = "A" | "B";
export const ATTENTION_GROUP_NAMES: Record<AttentionGroup, string> = {
  A: "Требуют внимания",
  B: "Есть уроки ниже 70",
};
export function lessonsGenitive(count: number): string {
  const last = count % 10,
    two = count % 100;
  return `${count} ${last === 1 && two !== 11 ? "урока" : "уроков"}`;
}
export function repeatText(fullLessons: number, below70: number): string {
  return fullLessons <= 1
    ? "единичный результат"
    : `ниже порога ${below70} из ${lessonsGenitive(fullLessons)}`;
}

export type AttentionInfo = {
  group: AttentionGroup;
  average: number | null;
  fullLessons: number;
  below70: number;
  repeat: string;
};
/**
 * Учителя с полным уроком ниже 70 (это и есть «Нужна методическая поддержка») в двух группах.
 * А: средний итог по полным урокам ниже 70 или хотя бы один полный урок ниже 50.
 * Б: остальные. Сравнение точное, без округления. Сначала А, внутри по возрастанию среднего итога.
 */
export function attentionTeachers<
  T extends { key: string; name: string; rows: ReportVisit[] },
>(teachers: T[]): (T & AttentionInfo)[] {
  const out: (T & AttentionInfo)[] = [];
  for (const teacher of teachers) {
    const percents = lessonObservations(teacher.rows)
      .map((lesson) => scorePercent(lesson))
      .filter((p): p is number => p != null);
    const below70 = percents.filter((p) => p < 70).length;
    if (!below70) continue;
    const average = schoolAverage(teacher.rows);
    const group: AttentionGroup =
      (average != null && average < 70) || percents.some((p) => p < 50)
        ? "A"
        : "B";
    out.push({
      ...teacher,
      group,
      average,
      fullLessons: percents.length,
      below70,
      repeat: repeatText(percents.length, below70),
    });
  }
  return out.sort(
    (a, b) =>
      Number(a.group === "B") - Number(b.group === "B") ||
      (a.average ?? Infinity) - (b.average ?? Infinity) ||
      a.name.localeCompare(b.name, "ru"),
  );
}

const meanOf = (values: (number | null)[]) => {
  const own = values.filter((v): v is number => v != null);
  return own.length ? own.reduce((n, v) => n + v, 0) / own.length : null;
};

export type BlockPercent = {
  name: string;
  percent: number | null;
  /** Пункты блока оцениваются по минимальному уровню, итог блока занижен. */
  understated: boolean;
};
/**
 * % от максимума по 9 блокам. Для наблюдения: сумма баллов блока / сумма максимумов (без «не применимо»);
 * внутри урока усредняется по наблюдениям, затем по урокам учителя, затем по учителям поровну.
 * Учитываются только полные уроки.
 */
export function blockPercents(rows: ReportVisit[]): BlockPercent[] {
  const lessons = new Map<string, ReportVisit[]>();
  for (const row of rows) {
    if (row.self) continue;
    const key = row.pairKey || `unidentified:${row.id}`;
    lessons.set(key, [...(lessons.get(key) || []), row]);
  }
  const perTeacher = new Map<string, (number | null)[][]>();
  for (const group of lessons.values()) {
    if (!group.every((v) => v.score.total != null)) continue;
    const blocks = SECTION_NAMES.map((_, index) =>
      meanOf(
        group.map((v) => {
          const items = v.score.items.filter(
            (i) => i.code.startsWith(`${index + 1}.`) && !i.na && i.value != null,
          );
          const max = items.reduce((n, i) => n + i.max, 0);
          return max ? (items.reduce((n, i) => n + i.value!, 0) / max) * 100 : null;
        }),
      ),
    );
    const key = group[0].teacherKey;
    perTeacher.set(key, [...(perTeacher.get(key) || []), blocks]);
  }
  return SECTION_NAMES.map((name, index) => ({
    name,
    percent: meanOf(
      [...perTeacher.values()].map((lessonBlocks) =>
        meanOf(lessonBlocks.map((b) => b[index])),
      ),
    ),
    understated: index === 4,
  }));
}

/**
 * Пункты, балл которых пока берётся по отметке формы (минимальный уровень): 3.5, 5.2, 5.3.
 * В «Приоритеты», подсветку блоков и «Главные зоны роста» они не входят; на вкладке
 * «Критерии урока» их баллы остаются.
 */
/** Экран «Сводка для директора» открыт, только если его разрешил сервер и в адресе выбран этот экран. */
export function isDirectorSummaryShown(allowedByServer: boolean | undefined, screenParam: string | null): boolean {
  return allowedByServer === true && screenParam === "summary";
}

export const FORM_BASELINE_CODES = ["3.5", "5.2", "5.3"];
export const GROWTH_EXCLUDED_CODES = FORM_BASELINE_CODES;
/**
 * Пункты с несколькими вариантами ответа: пояснение называет, какой решающий вариант
 * чаще всего не отмечен в чек-листах с баллом ниже максимума.
 */
const GROWTH_MULTI_EXPECTED: Record<
  string,
  { id: string; prefix: string; text: string }[]
> = {
  "3.8": [
    { id: "o3", prefix: "задание соответствует содержанию", text: "задание соответствует содержанию и целям урока" },
  ],
  "5.1": [
    { id: "o3", prefix: "обратная связь конкретная", text: "обратная связь конкретная, развивающая" },
  ],
  "9.1": [
    { id: "o1", prefix: "общение строится в уважительном", text: "общение уважительное, доброжелательное и деловое" },
    { id: "o3", prefix: "учитель внимательно выслушивает", text: "учитель внимательно выслушивает ответы" },
  ],
};
const GROWTH_PHRASES: Record<string, string> = {
  "1.1|частично": "к уроку готовы лишь частично",
  "1.1|не готов": "к уроку не готовы",
  "2.1|учителем": "цели формулирует только учитель",
  "2.1|совместно с обучающимися": "цели формулируются совместно, но не самими учениками",
  "2.1|не сформулированы": "цели не сформулированы",
  "2.2|нет": "цели не соответствуют теме урока",
  "2.3|нет": "цели непонятны ученикам",
  "3.1|нет": "содержание не соответствует целям и программе",
  "3.2|структура": "структура урока не прослеживается",
  "3.3|нет": "темп урока не подходит классу",
  '3.6|фронтальные': "задания одинаковые для всех",
  "4.1|не соответствует": "материал не соответствует уровню учеников",
  "4.2|достаточный": "предметный уровень достаточный, но не высокий",
  "4.2|требует": "владение предметным содержанием требует улучшения",
  "6.2|вовлечены большинство": "вовлечено большинство класса, но не все",
  "6.2|вовлечена только часть": "вовлечена только часть класса",
  "6.2|массовое": "класс в целом пассивен",
  "7.1|нет": "воспитательный потенциал урока не проявлен",
  "8.2|среднее": "наглядные материалы не всегда уместны",
  "8.2|низкое": "наглядные материалы неуместны",
  "8.2|не использовались, что": "наглядность не использована, хотя была нужна",
  "9.3|атмосфера на уроке не создана": "рабочая атмосфера на уроке не создана",
  "9.3|психологический комфорт отсутствует": "психологического комфорта нет",
};
const normalizedAnswer = (answer: string) =>
  answer.trim().toLocaleLowerCase("ru").replace(/ё/g, "е");
function growthPhrase(code: string, answer: string): string {
  const text = normalizedAnswer(answer);
  for (const [key, phrase] of Object.entries(GROWTH_PHRASES)) {
    const [keyCode, prefix] = key.split("|");
    if (keyCode === code && text.startsWith(normalizedAnswer(prefix))) return phrase;
  }
  return answer.length > 70 ? `«${answer.slice(0, 67).trim()}…»` : `«${answer}»`;
}

function multiGrowthNote(
  code: string,
  scored: { value: number | null; max: number; answer: string; optionIds: string[] }[],
): string {
  const picked = (item: (typeof scored)[number], option: { id: string; prefix: string }) =>
    item.optionIds.includes(option.id) ||
    item.answer
      .split(";")
      .some((part) => normalizedAnswer(part).startsWith(normalizedAnswer(option.prefix)));
  const lacking = GROWTH_MULTI_EXPECTED[code]
    .map((option) => ({
      option,
      count: scored.filter(
        (i) =>
          i.value! < i.max && (i.answer || i.optionIds.length) && !picked(i, option),
      ).length,
    }))
    .sort((a, b) => b.count - a.count)[0];
  return lacking && lacking.count > 0
    ? `чаще всего не отмечено: «${lacking.option.text}» (в ${Math.round((lacking.count / scored.length) * 100)}% чек-листов)`
    : "";
}

export type GrowthZone = {
  code: string;
  title: string;
  percent: number;
  lessons: number;
  /** Одна строка пояснения по ответам; пустая, если ответов ниже максимума нет. */
  note: string;
};
/**
 * Пункты с самым низким средним % от максимума по сигнальным оценкам (как «Приоритеты»),
 * без пунктов, которые пока оцениваются по минимальному уровню. Пояснение берётся из ответов
 * наблюдателей: самый частый ответ с баллом ниже максимума и его доля среди оценённых чек-листов.
 */
export function growthZones(rows: ReportVisit[], count = 3): GrowthZone[] {
  const lessons = lessonObservations(rows);
  const observations = rows.filter((v) => !v.self);
  const codes = new Set(lessons.flatMap((v) => v.score.items.map((i) => i.code)));
  const zones: GrowthZone[] = [];
  for (const code of codes) {
    if (GROWTH_EXCLUDED_CODES.includes(code)) continue;
    const eligible = lessons.flatMap((v) =>
      signalItems(v.score.items.filter((i) => i.code === code)),
    );
    const percent = meanOf(eligible.map((i) => (i.value! / i.max) * 100));
    if (percent == null) continue;
    const title =
      lessons[0].score.items.find((i) => i.code === code)?.title || code;
    const scored = observations.flatMap((v) =>
      v.score.items.filter(
        (i) =>
          i.code === code && !i.na && i.value != null && i.method !== "form_minimum",
      ),
    );
    const counts = new Map<string, number>();
    for (const item of scored)
      if (item.value! < item.max && item.answer)
        counts.set(item.answer, (counts.get(item.answer) || 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))[0];
    zones.push({
      code,
      title: SHORT_TITLES[code] || title,
      percent,
      lessons: eligible.length,
      note: !top
        ? ""
        : GROWTH_MULTI_EXPECTED[code]
          ? multiGrowthNote(code, scored)
          : `в ${Math.round((top[1] / scored.length) * 100)}% чек-листов: ${growthPhrase(code, top[0])}`,
    });
  }
  return zones
    .sort(
      (a, b) =>
        a.percent - b.percent ||
        a.code.localeCompare(b.code, "ru", { numeric: true }),
    )
    .slice(0, count);
}

export type DepartmentRow = {
  department: string;
  teachers: number;
  lessons: number;
  average: number | null;
  a: number;
  b: number;
};
/** Кафедры от низкого среднего итога к высокому; учителя поровну, как в «Среднем итоге». */
export function departmentRanking(
  teachers: { key: string; department: string; rows: ReportVisit[] }[],
  attention: { key: string; group: AttentionGroup }[],
): DepartmentRow[] {
  const groupByTeacher = new Map(attention.map((a) => [a.key, a.group]));
  const byDepartment = new Map<string, typeof teachers>();
  for (const teacher of teachers) {
    if (!lessonObservations(teacher.rows).length) continue;
    byDepartment.set(teacher.department, [
      ...(byDepartment.get(teacher.department) || []),
      teacher,
    ]);
  }
  return [...byDepartment]
    .map(([department, list]) => {
      const rows = list.flatMap((t) => t.rows);
      return {
        department,
        teachers: list.length,
        lessons: lessonObservations(rows).length,
        average: schoolAverage(rows),
        a: list.filter((t) => groupByTeacher.get(t.key) === "A").length,
        b: list.filter((t) => groupByTeacher.get(t.key) === "B").length,
      };
    })
    .sort(
      (x, y) =>
        (x.average ?? Infinity) - (y.average ?? Infinity) ||
        x.department.localeCompare(y.department, "ru"),
    );
}

export type NewTeacherStats = {
  configured: boolean;
  total: number;
  visited: number;
  notVisited: CoverageRow[];
  averageNew: number | null;
  averageOthers: number | null;
  below70: number;
};
/** Новые учителя задаются администратором списком ID справочника анкеты. */
export function newTeacherStats(
  teachers: { key: string; name: string; department: string; visits: ReportVisit[] }[],
  directory: Pick<LessonVisitDirectory, "teachers">,
  newTeacherIds: string[] | undefined,
  rows: ReportVisit[],
  attention: { key: string }[],
  options: { from?: string | null; to?: string | null } = {},
): NewTeacherStats {
  const ids = new Set(newTeacherIds || []);
  const listed = directory.teachers.filter((t) => ids.has(t.id));
  const keys = new Set(listed.map((t) => reportPersonKey(t.name)));
  const coverage = visitCoverage(teachers, { teachers: listed }, options);
  const own = rows.filter((v) => keys.has(v.teacherKey));
  const others = rows.filter((v) => !keys.has(v.teacherKey));
  return {
    configured: listed.length > 0,
    total: coverage.total,
    visited: coverage.visited,
    notVisited: coverage.notVisited,
    averageNew: schoolAverage(own),
    averageOthers: schoolAverage(others),
    below70: attention.filter((a) => keys.has(a.key)).length,
  };
}
