import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  directLessonScore,
  lessonObservations,
  type ReportVisit,
} from "./visitChecklistReport.ts";
import {
  attentionTeachers,
  COMPACT_LIST_SIZE,
  observerLevel,
  TEACHER_SORTS,
  compactRows,
  discrepancies,
  displayScore,
  fullLessonCount,
  lessonsRu,
  LEVELS,
  levelIndex,
  losses,
  pageRows,
  parseTeacherSort,
  pluralRu,
  schoolAverage,
  shortName,
  teacherResultGroups,
  scorePercent,
  selectReportRows,
  signalItems,
  sortTeachers,
  teacherMetrics,
  veryHighTeachers,
} from "./reportPresentation.ts";
const seed = JSON.parse(
  readFileSync(new URL("./defaultSeed.json", import.meta.url), "utf8"),
);
const make = (
  id: number,
  total: number,
  max = 100,
  key = "a",
  pair = String(id),
): ReportVisit => ({
  id,
  teacher: "Иванова Анна Ивановна",
  teacherKey: key,
  department: "Кафедра",
  date: "2026-09-21",
  subject: "Математика",
  className: "5А",
  visitor: "Петров Пётр Петрович",
  format: "Наблюдение",
  self: false,
  rating: 4,
  ratingOriginal: "высокий",
  ratingMapped: "Высокий",
  score: { items: [], subtotal: total, max, total, missing: [] },
  feedback: "",
  practice: "",
  pairKey: pair,
});
test("A103/A117/A135: formatting does not cross exact level boundaries", () => {
  assert.equal(displayScore(78.17), "78");
  assert.equal(displayScore(69.96), "69,9");
  assert.deepEqual([39.999, 40, 50, 70, 85].map(levelIndex), [0, 1, 2, 3, 4]);
  assert.equal(shortName("Иванова Анна Ивановна"), "Иванова А.И.");
  assert.equal(shortName("Иванова Анна Ивановна; Петров Пётр Петрович"), "Иванова А.И. / Петров П.П.");
});
test("short names keep the part in brackets whole", () => {
  assert.equal(shortName("Иванова (Петрова) Анна Сергеевна"), "Иванова (Петрова) А.С.");
  assert.equal(shortName("Иванова  (Петрова-Сидорова)  Анна  Сергеевна"), "Иванова (Петрова-Сидорова) А.С.");
  assert.equal(shortName("Иванова (Петрова Сидорова) Анна Сергеевна"), "Иванова (Петрова Сидорова) А.С.");
  assert.equal(shortName("Иванова Анна Сергеевна (Петрова)"), "Иванова (Петрова) А.С.");
  assert.equal(shortName("Иванова (Петрова)"), "Иванова (Петрова)");
  assert.equal(shortName("Иванова Анна"), "Иванова А.");
  assert.equal(shortName("Иванова"), "Иванова");
  assert.equal(shortName(""), "Наблюдатель не указан");
});
test("number and level always come from the exact value: 69.7 is Средний, never 70", () => {
  const level = (exact: number) => LEVELS[levelIndex(exact)];
  const shown = (exact: number) => `${displayScore(exact)} ${level(exact)}`;
  // перед границей уровня: одна цифра после запятой, округление вниз, уровень нижний
  assert.equal(shown(69.7), "69,7 Средний");
  assert.equal(shown(69.96), "69,9 Средний");
  assert.equal(shown(69.99999), "69,9 Средний");
  assert.equal(shown(84.96), "84,9 Высокий");
  assert.equal(shown(49.99), "49,9 Низкий");
  assert.equal(shown(39.95), "39,9 Очень низкий");
  // на границе и дальше от неё: целое число, уровень верхний
  assert.equal(shown(70), "70 Высокий");
  assert.equal(shown(70.2), "70 Высокий");
  assert.equal(shown(85), "85 Очень высокий");
  assert.equal(shown(40), "40 Низкий");
  // далеко от границы округление обычное и уровень не меняется
  assert.equal(shown(69.4), "69 Средний");
  assert.equal(shown(78.17), "78 Высокий");
  // для итога с меньшим максимумом правило то же, в долях максимума
  assert.equal(displayScore(62.9, 90), "62,9");
  assert.equal(displayScore(63, 90), "63");
});
test("A109/A110: all definitive homework combinations, including o1 and o2", () => {
  const options = [
    "дается инструктаж по выполнению (возможно по ходу урока)",
    "задание дано в достаточном объеме",
    "задание соответствует содержанию и целям урока",
    "домашнее задание не соответствует содержанию и целям урока",
    "домашнее задание избыточно",
    "домашнее задание не задано (в соответствии с типом урока)",
  ];
  const cases: [number[], number | null, string][] = [
    [[0], 1, "scored"],
    [[1], 1, "scored"],
    [[0, 1], 1, "scored"],
    [[2], 2, "scored"],
    [[2, 4], 1, "scored"],
    [[3], 0, "scored"],
    [[2, 3], 0, "scored"],
    [[5], null, "not_applicable"],
    [[5, 0], null, "contradiction"],
    [[4], 1, "scored"],
    [[], null, "missing_answer"],
  ];
  for (const [ids, value, status] of cases) {
    const score = directLessonScore(seed, {
      "3.8": ids.map((i) => options[i]),
    });
    const item = score.items.find((i) => i.code === "3.8")!;
    assert.equal(item.value, value, JSON.stringify(ids));
    assert.equal(item.status, status);
  }
});
test("A112/A113: mixed maxima and equal teacher weights match 2015/28", () => {
  const rows = [
    make(1, 80, 100, "a"),
    make(2, 61, 98, "b"),
    make(3, 70, 100, "b", "mixed"),
    make(4, 60, 98, "b", "mixed"),
  ];
  const lessons = lessonObservations(rows);
  assert.equal(lessons.length, 3);
  assert.equal(lessons[2].score.total, ((70 / 100 + 60 / 98) / 2) * 100);
  assert.equal(lessons[2].score.mixedApplicability, true);
  assert.ok(Math.abs(schoolAverage(rows)! - 2015 / 28) < 1e-12);
  const preliminary = make(5, 20, 100, "c");
  preliminary.score.total = null;
  assert.equal(schoolAverage([...rows, preliminary]), schoolAverage(rows));
  const self = { ...make(6, 100), self: true };
  assert.equal(schoolAverage([...rows, self]), schoolAverage(rows));
  assert.equal(schoolAverage([]), null);
});
test("A118/A119/A120: A and B thresholds, pairs and linked self only", () => {
  const a = make(1, 69),
    b = make(2, 54, 100, "a", "1");
  a.ratingMapped = "Очень высокий";
  assert.equal(discrepancies([a]).filter((f) => f.type === "А").length, 1);
  a.ratingMapped = "Высокий";
  assert.equal(discrepancies([a]).filter((f) => f.type === "А").length, 0);
  assert.equal(discrepancies([a, b]).filter((f) => f.type === "Б").length, 1);
  b.score.total = 54.001;
  assert.equal(discrepancies([a, b]).filter((f) => f.type === "Б").length, 0);
  const self = { ...make(3, 90, 100, "a", "1"), self: true };
  assert.equal(
    discrepancies([a, self]).filter((f) => f.type === "В").length,
    1,
  );
  self.pairKey = "other";
  assert.equal(
    discrepancies([a, self]).filter((f) => f.type === "В").length,
    0,
  );
});
test("A121/A122: G uses own engagement or feedback, never differentiation; losses ignore minima", () => {
  const a = make(1, 80);
  const item = (code: string, value: number, max: number, method = "form") => ({
    code,
    value,
    max,
    method,
    title: code,
    na: false,
    status: "scored",
    reason: "",
    answer: "",
    sourceId: code,
    optionIds: [],
    ruleId: code,
    version: "test",
  });
  a.score.items = [item("3.6", 0, 6), item("6.2", 6, 9), item("5.1", 4, 6)];
  assert.equal(discrepancies([a]).filter((f) => f.type === "Г").length, 0);
  a.score.items[1].value = 3;
  a.score.items[2].value = 0;
  const flags = discrepancies([a]).filter((f) => f.type === "Г");
  assert.equal(flags.length, 1);
  assert.match(flags[0].description, /вовлечённость 3 из 9/);
  assert.doesNotMatch(flags[0].description, /#|6\.2/);
  a.score.items.push(item("5.3", 3, 9, "form_minimum"));
  assert.deepEqual(
    losses(a).map((i) => i.code),
    ["3.6", "5.1", "6.2"],
  );
  a.ratingMapped = "Низкий";
  assert.equal(discrepancies([a]).filter((f) => f.type === "Г").length, 0);
});
test("A117/A123/A125: annotations do not mutate totals, support threshold remains below 70", () => {
  const rows = [make(1, 40), make(2, 50), make(3, 70), make(4, 85)];
  const before = JSON.stringify(rows);
  discrepancies(rows);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(rows.filter((v) => scorePercent(v)! < 70).length, 2);
});
test("pagination keeps all-row export input intact and offers 20/50/all", () => {
  const rows = Array.from({ length: 61 }, (_, i) => i);
  assert.deepEqual(pageRows(rows, 2, 20), rows.slice(20, 40));
  assert.equal(pageRows(rows, 2, 50).length, 11);
  assert.equal(pageRows(rows, 3, "all").length, 61);
  assert.equal(rows.length, 61);
});

test("A108: Russian full-lesson counts include teens and 21/22/25", () => {
  assert.deepEqual([1, 2, 5, 11, 12, 14, 21, 22, 25].map(fullLessonCount), [
    "1 полный урок",
    "2 полных урока",
    "5 полных уроков",
    "11 полных уроков",
    "12 полных уроков",
    "14 полных уроков",
    "21 полный урок",
    "22 полных урока",
    "25 полных уроков",
  ]);
});

test("lesson counts agree with the number: 1, 2, 5, 11, 21, 72", () => {
  assert.deepEqual([0, 1, 2, 5, 11, 21, 72, 111].map(lessonsRu), [
    "0 уроков",
    "1 урок",
    "2 урока",
    "5 уроков",
    "11 уроков",
    "21 урок",
    "72 урока",
    "111 уроков",
  ]);
});

test("A105/A113: reduced maxima share one ranking by exact ratios", () => {
  const teachers = [
    { key: "a", name: "А", department: "d", rows: [make(1, 67, 95, "a")] },
    { key: "b", name: "Б", department: "d", rows: [make(2, 68, 98, "b")] },
  ];
  const groups = teacherResultGroups(teachers);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "reduced");
  assert.deepEqual(
    groups[0].rows.map((row) => row.key),
    ["a", "b"],
  );
  assert.deepEqual(
    groups[0].rows.map((row) => row.rank),
    [1, 2],
  );
});

test("A107: observer search selects the lesson, preserving every observation and its original mean", () => {
  const first = make(1, 40, 100, "a", "same"),
    second = make(2, 80, 100, "a", "same");
  first.visitor = "Сидорова Ольга Ивановна";
  const selected = selectReportRows([first, second], {
    search: "Сидорова",
    group: "full",
  });
  assert.equal(selected.length, 2);
  assert.equal(lessonObservations(selected)[0].score.total, 60);
  assert.equal(
    selectReportRows([first, second], { group: "reduced" }).length,
    0,
  );
});

test("A112: previously adjusted observation totals are averaged without a second deduction", () => {
  const lessons = lessonObservations([
    make(1, 69, 100, "a", "same"),
    make(2, 59, 98, "a", "same"),
  ]);
  assert.equal(lessons[0].score.total, 6331 / 98);
  assert.deepEqual(lessons[0].score.exactTotal, { numerator: "6331", denominator: "98" });
});

test("A114/A115/A122: observer minima are excluded before signal averages in either source order", () => {
 const zero = {...make(1,60,100,"a","same"), score:{...make(1,60).score,items:[{code:"3.5",title:"Связи",max:3,value:0,na:false,status:"scored",method:"form"}]}} as ReportVisit;
 const minimum = {...make(2,61,100,"a","same"), score:{...make(2,61).score,items:[{...zero.score.items[0],value:1,method:"form_minimum"}]}} as ReportVisit;
 for(const rows of [[zero,minimum],[minimum,zero]]) {
  const lesson=lessonObservations(rows)[0];
  assert.equal(lesson.score.items[0].value,0.5);
  assert.equal(lesson.score.total,60.5);
  assert.equal(signalItems(lesson.score.items)[0].value,0);
  assert.equal(losses(lesson)[0].value,0);
 }
 assert.deepEqual(signalItems(lessonObservations([minimum])[0].score.items),[]);
});

test("pluralRu: 1 строка, 2 строки, 9 строк, 11 строк, 61 строка", () => {
  const f: [string, string, string] = ["строка", "строки", "строк"];
  const word = (n: number) => pluralRu(n, f);
  assert.equal(word(1), "строка");
  assert.equal(word(2), "строки");
  assert.equal(word(4), "строки");
  assert.equal(word(5), "строк");
  assert.equal(word(9), "строк");
  assert.equal(word(11), "строк");
  assert.equal(word(12), "строк");
  assert.equal(word(14), "строк");
  assert.equal(word(21), "строка");
  assert.equal(word(22), "строки");
  assert.equal(word(61), "строка");
  assert.equal(word(100), "строк");
  assert.equal(word(111), "строк");
  assert.equal(word(0), "строк");
});

const person = (
  key: string,
  name: string,
  department: string,
  lessons: [number, string][],
  extra: Partial<ReportVisit> = {},
) => ({
  key,
  name,
  department,
  rows: lessons.map(([total, date], i) => ({
    ...make(Number(`${key.charCodeAt(0)}${i}`), total, 100, key, `${key}${i}`),
    date,
    ...extra,
  })),
});
const roster = [
  person("a", "Алексеев", "Кафедра Б", [[90, "2026-09-10"], [60, "2026-09-20"]]),
  person("b", "Борисов", "Кафедра А", [[40, "2026-09-05"], [80, "2026-10-01"], [66, "2026-09-25"]]),
  person("c", "Васильев", "Кафедра Б", [[88, "2026-10-03"]]),
  person("d", "Григорьев", "", []),
];
const order = (list: { name: string }[]) => list.map((t) => t.name).join(" ");
const sorted = (sort: Parameters<typeof sortTeachers>[1], isNew: (t: { key: string }) => boolean = () => false) =>
  order(
    sortTeachers(
      roster,
      sort,
      (t) => teacherMetrics(t.rows),
      isNew,
    ),
  );
test("teacher metrics: visits, last date, lessons below 70 and dynamics from full lessons", () => {
  const b = teacherMetrics(roster[1].rows);
  assert.equal(b.visits, 3);
  assert.equal(b.lastDate, "2026-10-01");
  assert.equal(b.below70, 2);
  // первый полный урок 40 (05.09), последний 80 (01.10)
  assert.equal(b.dynamics, 40);
  assert.equal(teacherMetrics(roster[2].rows).dynamics, null);
  assert.deepEqual(teacherMetrics([]), {
    average: null,
    visits: 0,
    lastDate: null,
    below70: 0,
    dynamics: null,
  });
});
test("teacher sorting: all nine variants, no-data teachers stay at the end", () => {
  assert.deepEqual(
    TEACHER_SORTS.map((s) => s.label),
    [
      "Средний итог: от высокого к низкому",
      "Средний итог: от низкого к высокому",
      "ФИО: по алфавиту",
      "По кафедрам, внутри кафедры по алфавиту",
      "Сначала учителя с меньшим числом посещений",
      "Сначала учителя, которых давно не посещали",
      "Сначала учителя с большим числом уроков, требующих методической поддержки",
      "Сначала учителя со снижением результатов",
      "Сначала новые учителя",
    ],
  );
  // средние: Алексеев 75, Борисов 62, Васильев 88, Григорьев нет данных
  assert.equal(sorted("best"), "Васильев Алексеев Борисов Григорьев");
  assert.equal(sorted("worst"), "Борисов Алексеев Васильев Григорьев");
  assert.equal(sorted("alpha"), "Алексеев Борисов Васильев Григорьев");
  assert.equal(sorted("department"), "Борисов Алексеев Васильев Григорьев");
  assert.equal(sorted("visits"), "Григорьев Васильев Алексеев Борисов");
  assert.equal(sorted("last_visit"), "Алексеев Борисов Васильев Григорьев");
  assert.equal(sorted("below70"), "Борисов Алексеев Васильев Григорьев");
  // динамика: Алексеев 60-90=-30, Борисов +40, у остальных динамики нет
  assert.equal(sorted("dynamics"), "Алексеев Борисов Васильев Григорьев");
  assert.equal(sorted("new_first", (t) => t.key === "c" || t.key === "d"), "Васильев Григорьев Алексеев Борисов");
});
test("teacher sorting compares exact values, not rounded ones", () => {
  const near = [
    person("x", "Яковлев", "К", [[69.96, "2026-09-10"]]),
    person("y", "Андреев", "К", [[69.94, "2026-09-10"]]),
  ];
  const run = (sort: "best" | "worst") =>
    order(sortTeachers(near, sort, (t) => teacherMetrics(t.rows), () => false));
  // оба показываются как 69,9, но порядок определяет точное значение
  assert.equal(displayScore(69.96), displayScore(69.94));
  assert.equal(run("best"), "Яковлев Андреев");
  assert.equal(run("worst"), "Андреев Яковлев");
});
test("group average override lets preliminary groups sort by their own result", () => {
  const list = [
    { key: "p", name: "Первый", department: "К", percent: 30 },
    { key: "q", name: "Второй", department: "К", percent: 55 },
    { key: "r", name: "Третий", department: "К", percent: null },
  ];
  const out = sortTeachers(
    list,
    "best",
    () => teacherMetrics([]),
    () => false,
    (t) => t.percent,
  );
  assert.equal(order(out), "Второй Первый Третий");
});
test("very high level: from 85% of the available maximum, one lesson counts, preliminary results do not", () => {
  const reduced = {
    ...make(900, 42.5, 50, "e", "e0"),
    score: { items: [], subtotal: 42.5, max: 50, total: 42.5, missing: [] },
  } as ReportVisit;
  const preliminary = {
    ...make(901, 95, 100, "f", "f0"),
    score: { items: [], subtotal: 95, max: 100, total: null, missing: [] },
  } as ReportVisit;
  const teachers = [
    ...roster,
    { key: "e", name: "Дмитриев", department: "К", rows: [reduced] },
    { key: "f", name: "Егоров", department: "К", rows: [preliminary] },
    person("g", "Жуков", "К", [[84.99, "2026-09-10"]]),
    person("h", "Зайцев", "К", [[85, "2026-09-10"], [90, "2026-09-12"]]),
  ];
  const top = veryHighTeachers(teachers);
  assert.equal(order(top), "Васильев Дмитриев Зайцев");
  assert.deepEqual(
    top.map((t) => [t.fullLessons, t.single]),
    [[1, true], [1, true], [2, false]],
  );
  assert.equal(levelIndex(top[1].average), 4);
});
test("compact lists show five rows and expand to all", () => {
  assert.equal(COMPACT_LIST_SIZE, 5);
  const list = [1, 2, 3, 4, 5, 6, 7];
  assert.deepEqual(compactRows(list, false), [1, 2, 3, 4, 5]);
  assert.deepEqual(compactRows(list, true), list);
  assert.deepEqual(compactRows([1, 2], false), [1, 2]);
});
test("parseTeacherSort falls back for unknown values", () => {
  assert.equal(parseTeacherSort("alpha", "best"), "alpha");
  assert.equal(parseTeacherSort("nope", "worst"), "worst");
  assert.equal(parseTeacherSort(null, "best"), "best");
});

// Оценка наблюдателя (10.1): вымышленные учителя и наблюдатели.
const observed = (
  id: number,
  total: number,
  rating: number | null,
  key = "a",
  pair = String(id),
  date = "2026-09-21",
): ReportVisit => ({ ...make(id, total, 100, key, pair), rating, date, visitor: `Наблюдатель ${id}` });
const teacherOf = (key: string, rows: ReportVisit[]) => ({ key, name: `Учитель ${key}`, rows });

test("observer level: mean per lesson, then per teacher, rounded; arrow when one observer is lower", () => {
  // Урок 1: 4 и 2 → 3; урок 2: 5 → 5; среднее 4 → «Высокий», один наблюдатель ниже.
  const rows = [
    observed(1, 80, 4, "a", "L1", "2026-09-10"),
    observed(2, 80, 2, "a", "L1", "2026-09-10"),
    observed(3, 90, 5, "a", "L2", "2026-09-17"),
  ];
  assert.deepEqual(observerLevel(rows), {
    value: 4,
    label: "Высокий",
    lowest: 2,
    lowestDate: "2026-09-10",
  });
  // 3 и 4 → 3,5 округляется до 4; ниже 4 есть оценка 3.
  const half = observerLevel([observed(4, 80, 3, "b", "L3"), observed(5, 80, 4, "b", "L4")]);
  assert.equal(half?.value, 4);
  assert.equal(half?.lowest, 3);
  // Все наблюдатели согласны: стрелки нет (самая низкая оценка не ниже уровня).
  const same = observerLevel([observed(6, 80, 4, "c", "L5"), observed(7, 80, 4, "c", "L5")]);
  assert.equal(same?.value, 4);
  assert.equal(same!.lowest < same!.value, false);
  // Самоанализ не учитывается.
  const withSelf = observerLevel([observed(8, 80, 5, "d", "L6"), { ...observed(9, 80, 1, "d", "L6"), self: true }]);
  assert.deepEqual([withSelf?.value, withSelf?.lowest], [5, 5]);
});

test("observer level: no 10.1 ratings gives null", () => {
  assert.equal(observerLevel([observed(1, 80, null)]), null);
  assert.equal(observerLevel([{ ...observed(2, 80, 4), self: true }]), null);
  assert.equal(observerLevel([]), null);
});

test("attention by observer rating: groups and reasons", () => {
  const result = attentionTeachers([
    teacherOf("t75", [observed(1, 75, 2, "t75")]), // баллы 75, «Ниже среднего»
    teacherOf("t80", [observed(2, 80, 3, "t80")]), // баллы 80, «Средний»
    teacherOf("t45", [observed(3, 45, 1, "t45")]), // урок 45, «Низкий»
    teacherOf("t90", [observed(4, 90, 4, "t90")]), // баллы 90, «Высокий»
  ]);
  const byKey = new Map(result.map((t) => [t.key, t]));
  assert.deepEqual(
    [byKey.get("t75")?.group, byKey.get("t75")?.reason],
    ["A", "observer"],
  );
  assert.deepEqual(
    [byKey.get("t80")?.group, byKey.get("t80")?.reason],
    ["B", "observer"],
  );
  assert.deepEqual(
    [byKey.get("t45")?.group, byKey.get("t45")?.reason],
    ["A", "both"],
  );
  assert.equal(byKey.has("t90"), false);
  assert.equal(byKey.get("t75")?.below70, 0);
  assert.equal(byKey.get("t75")?.repeat, "оценка наблюдателя: ниже среднего");
  assert.equal(byKey.get("t80")?.repeat, "оценка наблюдателя: средний");
  assert.equal(byKey.get("t45")?.repeat, "единичный результат");
});

test("attention: one observer of two decides, not the lesson mean", () => {
  // Наблюдатели поставили 2 и 5 (среднее 3,5), баллы 88: группа А по оценке отдельного наблюдателя.
  const [t] = attentionTeachers([
    teacherOf("x", [observed(1, 88, 2, "x", "L1"), observed(2, 88, 5, "x", "L1")]),
  ]);
  assert.deepEqual([t.group, t.reason], ["A", "observer"]);
  // «Средний» уроку ниже 70 не даёт отдельной причины по наблюдателю: только по баллам.
  const [s] = attentionTeachers([teacherOf("y", [observed(3, 65, 3, "y"), observed(4, 95, 4, "y")])]);
  assert.deepEqual([s.group, s.reason], ["B", "score"]);
  // «Средний» уроку с итогом 70 и выше плюс урок ниже 70: группа Б по обеим причинам.
  const [b] = attentionTeachers([teacherOf("z", [observed(5, 65, 4, "z"), observed(6, 90, 3, "z")])]);
  assert.deepEqual([b.group, b.reason], ["B", "both"]);
});
