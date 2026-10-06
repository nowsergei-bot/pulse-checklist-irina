import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  directLessonScore,
  lessonObservations,
  type ReportVisit,
} from "./visitChecklistReport.ts";
import {
  discrepancies,
  displayScore,
  fullLessonCount,
  levelIndex,
  losses,
  pageRows,
  schoolAverage,
  shortName,
  teacherResultGroups,
  scorePercent,
  selectReportRows,
  signalItems,
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
