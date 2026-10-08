import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  buildLessonReport,
  withSelfAnalysisLinks,
  lessonObservations,
  selfMatchReport,
  ratingText,
  reportClassKey,
  DIRECT_MAXIMA,
  directLessonScore,
  pairedSelf,
  previousCompletedWeek,
  ratingValue,
  scoreGroups,
  sortReportTeachers,
  validLessonDate,
  type ReportVisit,
} from "./visitChecklistReport.ts";
import {
  UNIT_FILTER_NOT_DEFINED,
  coverageUnits,
  visitCoverage,
} from "./reportPresentation.ts";
import type {
  LessonVisitChecklistConfig,
  LessonVisitDirectory,
  LessonVisitResponseRow,
} from "./types.ts";
const seed = JSON.parse(
  readFileSync(new URL("./defaultSeed.json", import.meta.url), "utf8"),
) as LessonVisitChecklistConfig;
const directory: LessonVisitDirectory = {
  departments: [{ id: "d", name: "Математика" }],
  teachers: [
    { id: "a", name: "Иванова Анна Ивановна", departmentId: "d" },
    { id: "b", name: "Петров Пётр Петрович", departmentId: "d" },
  ],
};
const row = (
  id: number,
  date: string,
  self = false,
): LessonVisitResponseRow => ({
  id,
  created_at: "2026-09-23",
  general: {
    teacher_id: "a",
    visit_date: date,
    subject: "Математика",
    class_name: "5А",
    visit_format: self ? "Самоанализ" : "Наблюдение",
  },
  answers: { "10.1": "высокий" },
});
const now = new Date("2026-09-23T12:00:00Z");

test("legacy teacher names in teacher_id remain distinct without rewriting sources", () => {
  const sources = [
    [199, "2026-09-18", "Жукова Анна Игоревна"],
    [425, "2026-10-01", "Anthony Smith"],
    [426, "2026-10-01", "teacher_999"],
  ].map(([id, date, name]) => {
    const source = row(Number(id), String(date));
    source.general.teacher_id = String(name);
    return source;
  });
  const before = JSON.stringify(sources);
  const report = buildLessonReport(
    sources, seed, directory, new Date("2026-10-06T12:00:00Z"),
  );
  assert.equal(report.visits[0].teacher, "Жукова Анна Игоревна");
  assert.equal(report.visits[1].teacher, "Энтони Смит");
  assert.notEqual(report.visits[0].teacherKey, report.visits[1].teacherKey);
  assert.equal(report.visits[2].teacher, "Педагог не указан");
  assert.equal(JSON.stringify(sources), before);
});

test("legacy names resolve to the teacher roster and its department", () => {
  const source = row(199, "2026-09-18");
  source.general.teacher_id = "Иванова Анна Ивановна";
  const visit = buildLessonReport([source], seed, directory, now).visits[0];
  assert.equal(visit.teacher, "Иванова Анна Ивановна");
  assert.equal(visit.department, "Математика");
});

test("20 scored items sum to 100 and no legacy percentage conversion", () => {
  assert.equal(Object.keys(DIRECT_MAXIMA).length, 20);
  assert.equal(
    Object.values(DIRECT_MAXIMA).reduce((a, b) => a + b),
    100,
  );
  const score = directLessonScore(seed, {
    "1.1": "готов",
    "2.1": "учителем",
    "10.1": "очень высокий",
    "1.2": "неудовлетворительное",
  });
  assert.equal(score.subtotal, 6);
  assert.equal(score.total, null);
  assert.equal(score.items.find((i) => i.code === "1.1")?.value, 3);
  assert.equal(score.max, 100);
  assert.equal(score.missing.length, 18);
});
test("known scales distinguish zero, absence and unknown quality", () => {
  const options = seed.sections
    .flatMap((s) => s.questions)
    .find((q) => q.code === "6.2")!.options;
  options.forEach((option, index) =>
    assert.equal(
      directLessonScore(seed, { "6.2": option }).subtotal,
      [9, 6, 3, 0][index],
    ),
  );
  assert.equal(
    directLessonScore(seed, {
      "3.5": "присутствуют",
      "5.2": "присутствует",
      "5.3": ["тестирование", "фронтальный опрос"],
    }).subtotal,
    5,
  );
  const result = directLessonScore(seed, {
    "3.5": "отсутствуют",
    "5.2": "отсутствует",
  });
  assert.equal(result.items.find((i) => i.code === "3.5")?.value, 0);
  assert.equal(result.missing.length, 18);
  assert.equal(
    directLessonScore(seed, { "2.1": ["учителем", "обучающимися"] }).items.find(
      (i) => i.code === "2.1",
    )?.value,
    null,
  );
});
test("only allowed non-applicability reduces the maximum, without normalization", () => {
  const score = directLessonScore(seed, {
    "3.8": "домашнее задание не задано (в соответствии с типом урока)",
    "8.2": "не использовались ввиду специфики урока",
  });
  assert.equal(score.max, 95);
  assert.equal(score.total, null);
  assert.equal(score.missing.length, 18);
  const contradictory = directLessonScore(seed, {
    "3.8": [
      "домашнее задание не задано (в соответствии с типом урока)",
      "домашнее задание избыточно",
    ],
  });
  assert.equal(contradictory.max, 100);
});
test("A111: goal answers retain independent 0, 5, 5 scores", () => {
  const score = directLessonScore(seed, {
    "2.1": "не сформулированы",
    "2.2": "да",
    "2.3": "да",
  });
  assert.deepEqual(
    ["2.1", "2.2", "2.3"].map(
      (code) => score.items.find((i) => i.code === code)?.value,
    ),
    [0, 5, 5],
  );
});
test("previous completed Monday–Sunday week uses Moscow date including Sunday and year boundary", () => {
  assert.deepEqual(previousCompletedWeek(now), {
    start: "2026-09-14",
    end: "2026-09-20",
    today: "2026-09-23",
  });
  assert.equal(
    previousCompletedWeek(new Date("2026-09-20T12:00Z")).start,
    "2026-09-07",
  );
  assert.equal(
    previousCompletedWeek(new Date("2026-09-20T21:30Z")).start,
    "2026-09-14",
  );
  assert.deepEqual(previousCompletedWeek(new Date("2026-01-01T12:00Z")), {
    start: "2025-12-22",
    end: "2025-12-28",
    today: "2026-01-01",
  });
});
test("weekly and year reports exclude future dates and keep unvisited roster teachers", () => {
  const report = buildLessonReport(
    [
      row(1, "2026-09-14"),
      row(2, "2026-09-20", true),
      row(3, "2026-09-21"),
      row(4, "2026-08-31"),
      row(5, "2026-09-24"),
      row(6, ""),
    ],
    seed,
    directory,
    now,
  );
  assert.equal(report.weekly.length, 2);
  assert.equal(report.visits.length, 3);
  assert.equal(report.teachers.length, 2);
  assert.equal(report.teachers[1].visits.length, 0);
  assert.equal(report.undated, 1);
  assert.equal(report.visits[0].teacher, "Иванова Анна Ивановна");
});
test("self analysis pairs only with a unique complete lesson identity", () => {
  const report = buildLessonReport(
    [row(1, "2026-09-14"), row(2, "2026-09-14", true)],
    seed,
    directory,
    now,
  );
  assert.equal(pairedSelf(report.visits[0], report.visits)?.id, 2);
  const duplicate = buildLessonReport(
    [
      row(1, "2026-09-14"),
      row(2, "2026-09-14", true),
      row(3, "2026-09-14", true),
    ],
    seed,
    directory,
    now,
  );
  assert.equal(pairedSelf(duplicate.visits[0], duplicate.visits), undefined);
  const missing = row(4, "2026-09-14");
  missing.general.subject = "";
  const incomplete = buildLessonReport([missing], seed, directory, now);
  assert.equal(incomplete.visits[0].pairKey, null);
});
test("score aggregates never mix denominators or include incomplete totals", () => {
  const r = buildLessonReport([row(1, "2026-09-14")], seed, directory, now)
    .visits[0];
  const make = (total: number | null, max: number): ReportVisit => ({
    ...r,
    score: { ...r.score, total, max },
  });
  assert.deepEqual(
    scoreGroups([make(94, 97), make(90, 100), make(80, 100), make(null, 100)]),
    [
      { max: 100, mean: 85, count: 2 },
      { max: 97, mean: 94, count: 1 },
    ],
  );
  const sorted = sortReportTeachers([
    { key: "a", name: "А", department: "d", visits: [make(80, 100)] },
    { key: "b", name: "Б", department: "d", visits: [make(90, 100)] },
  ]);
  assert.equal(sorted[0].key, "b");
  assert.equal(ratingValue("Очень высокий"), 5);
  assert.equal(ratingValue(""), null);
});

test("invalid calendar dates are not included in period totals", () => {
  assert.equal(validLessonDate("2026-02-30"), false);
  assert.equal(validLessonDate("2026-09-20"), true);
  assert.equal(
    buildLessonReport([row(1, "2026-09-99")], seed, directory, now).undated,
    1,
  );
});

test("v5 baseline distinguishes selected presence from missing answers", () => {
  const score = directLessonScore(seed, {
    "3.5": "присутствуют",
    "5.2": "присутствует",
    "5.3": ["фронтальный опрос"],
  });
  assert.equal(score.items.find((i) => i.code === "3.5")?.value, 1);
  assert.equal(score.items.find((i) => i.code === "5.2")?.value, 1);
  assert.equal(score.items.find((i) => i.code === "5.3")?.value, 3);
  assert.equal(
    directLessonScore(seed, {}).items.find((i) => i.code === "3.5")?.value,
    null,
  );
});
test("one lesson can have multiple observations and one self analysis", () => {
  const visits = buildLessonReport(
    [row(1, "2026-09-14"), row(2, "2026-09-14"), row(3, "2026-09-14", true)],
    seed,
    directory,
    now,
  ).visits;
  assert.equal(lessonObservations(visits).length, 1);
  assert.equal(pairedSelf(visits[0], visits)?.id, 3);
  assert.equal(selfMatchReport(visits)[0].reason, "Сопоставлен");
  const mismatch = { ...row(4, "2026-09-15", true) };
  const other = buildLessonReport(
    [row(1, "2026-09-14"), mismatch],
    seed,
    directory,
    now,
  ).visits;
  assert.equal(selfMatchReport(other)[0].reason, "Расхождение: дата");
  assert.doesNotMatch(ratingText(3.5), /Высокий/);
});
test("v5 multi-choice baseline priorities preserve absence, conflicts and timing-only feedback", () => {
  assert.equal(
    directLessonScore(seed, {
      "5.1": [
        "обратная связь конкретная, развивающая",
        "обратная связь дается формально",
      ],
    }).items.find((i) => i.code === "5.1")?.value,
    4,
  );
  const na = directLessonScore(seed, {
    "3.8": [
      "домашнее задание не задано (в соответствии с типом урока)",
      "задание соответствует содержанию и целям урока",
    ],
  });
  assert.equal(na.items.find((i) => i.code === "3.8")?.status, "contradiction");
  assert.equal(na.max, 100);
});

test("class identity normalizes spaces and parallel letters without merging different groups", () => {
  assert.equal(reportClassKey("1 А"), reportClassKey("1А"));
  assert.equal(reportClassKey("6AH"), reportClassKey("6АН"));
  assert.equal(reportClassKey("4 Д"), reportClassKey("4D"));
  assert.notEqual(reportClassKey("5ABE"), reportClassKey("5 (Superior)"));
  assert.notEqual(reportClassKey("3D"), reportClassKey("3C"));
});

test("complete v5 baseline resolves all 20 source question IDs and gives 82 of 100", () => {
  const answersByCode: Record<string, string | string[]> = {
    "1.1": "готов",
    "2.1": "учителем",
    "2.2": "да",
    "2.3": "да",
    "3.1": "да",
    "3.2": "четкая",
    "3.3": "да",
    "3.5": "присутствуют",
    "3.6": "дифференцированность заданий предусмотрена",
    "3.8": "задание соответствует содержанию и целям урока",
    "4.1":
      "доступен и понятен обучающимся, соответствует их индивидуальным и возрастным особенностям",
    "4.2": "обладает глубокими знаниями по теме урока",
    "5.1": ["обратная связь конкретная, развивающая", "в конце урока"],
    "5.2": "присутствует",
    "5.3": [
      "фронтальный опрос",
      "решение задач, упражнений",
      "индивидуальный опрос",
    ],
    "6.2":
      "Вовлечены большинство обучающихся (не менее ¾ класса), но некоторые остаются пассивными",
    "7.1": "да",
    "8.2": "высокое, уместны",
    "9.1": "Общение строится в уважительном, доброжелательном и деловом тоне",
    "9.3":
      "комфортная атмосфера урока (позитивный настрой на работу у обучающихся)",
  };
  const expected = {
    "1.1": 3,
    "2.1": 3,
    "2.2": 5,
    "2.3": 5,
    "3.1": 5,
    "3.2": 3,
    "3.3": 3,
    "3.5": 1,
    "3.6": 6,
    "3.8": 2,
    "4.1": 5,
    "4.2": 10,
    "5.1": 6,
    "5.2": 1,
    "5.3": 3,
    "6.2": 6,
    "7.1": 5,
    "8.2": 3,
    "9.1": 3,
    "9.3": 4,
  };
  const questions = seed.sections.flatMap((s) => s.questions);
  const bySource = Object.fromEntries(
    Object.entries(answersByCode).map(([code, answer]) => [
      questions.find((q) => q.code === code)!.id,
      answer,
    ]),
  );
  const score = directLessonScore(seed, bySource);
  assert.equal(score.total, 82);
  assert.equal(score.max, 100);
  assert.deepEqual(score.missing, []);
  assert.deepEqual(
    Object.fromEntries(score.items.map((i) => [i.code, i.value])),
    expected,
  );
  for (const item of score.items) {
    assert.equal(item.status, "scored");
    assert.equal(item.version, "pulse-100-v4-2026-10-05");
    assert.ok(item.optionIds.length && item.ruleId);
  }
});

test("a lesson preserves original 10.1 answers from every observer", () => {
  const first = row(1, "2026-09-21"),
    second = row(2, "2026-09-21");
  second.answers["10.1"] = "ниже среднего";
  const report = buildLessonReport(
    [first, second],
    seed,
    directory,
    new Date("2026-10-04T12:00Z"),
  );
  const lesson = lessonObservations(report.visits)[0];
  assert.equal(lesson.ratingOriginal, "высокий; ниже среднего");
  assert.equal(lesson.ratingMapped, "Высокий; Низкий");
  assert.equal(lesson.rating, 3);
});

test("A127/A131: confirmed links survive different dates without changing scores or original dates", () => {
  const original = buildLessonReport(
    [row(1, "2026-09-14"), row(2, "2026-09-15", true)],
    seed,
    directory,
    now,
  );
  const before = JSON.stringify(original);
  const linked = withSelfAnalysisLinks(original, [
    {
      self_response_id: 2,
      lesson_response_id: 1,
      method: "manual",
      confirmed_at: "2026-10-06",
    },
  ]);
  assert.equal(pairedSelf(linked.visits[0], linked.visits)?.id, 2);
  assert.equal(selfMatchReport(linked.visits)[0].lesson?.id, 1);
  assert.equal(selfMatchReport(linked.visits)[0].reason, "Связь подтверждена");
  assert.equal(linked.visits[1].date, "2026-09-15");
  assert.equal(linked.visits.length, original.visits.length);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(linked.visits[0].score, original.visits[0].score);
});

 test("confirmed Anthony Smith alias groups observations under the roster teacher", () => {
 const latin = row(425, "2026-10-01"); latin.general.teacher_id = "Anthony Smith";
 const cyrillic = row(429, "2026-10-01"); cyrillic.general.teacher_id = "teacher_144";
 const roster = {...directory, teachers: [...directory.teachers, {id: "teacher_144", name: "Энтони Смит", departmentId: directory.departments[0].id}]};
 const sources = [latin, cyrillic]; const before = JSON.stringify(sources);
 const report = buildLessonReport(sources, seed, roster, new Date("2026-10-06T12:00:00Z"));
 assert.equal(report.visits[0].teacher, "Энтони Смит");
 assert.equal(report.visits[0].teacherKey, report.visits[1].teacherKey);
 assert.equal(report.visits[0].department, report.visits[1].department);
 assert.equal(lessonObservations(report.visits).length, 1);
 assert.equal(JSON.stringify(sources), before);
 });

const coverageDirectory: LessonVisitDirectory = {
  departments: [
    { id: "d1", name: "Кафедра A" },
    { id: "d2", name: "Кафедра B" },
    { id: "dept_admin", name: "Администрация" },
  ],
  teachers: [
    { id: "t1", name: "Учитель Первый", departmentId: "d1" },
    { id: "t2", name: "Учитель Второй", departmentId: "d1" },
    { id: "t3", name: "Учитель Третий", departmentId: "d2" },
    { id: "t4", name: "Учитель Четвёртый", departmentId: "d2" },
    { id: "t5", name: "Учитель Пятый", departmentId: "d1" },
    { id: "t6", name: "Сотрудник Шестой", departmentId: "dept_admin" },
  ],
};
const staffUnits = {
  t1: ["Подразделение A"],
  t2: ["Подразделение A", "Подразделение B"],
  t3: [],
  t4: ["Подразделение A"],
  t5: ["Подразделение B"],
  t6: ["Подразделение A"],
};
function coverageReport() {
  const visit = (id: number, teacher: string, date: string, self = false) => {
    const source = row(id, date, self);
    source.general.teacher_id = teacher;
    return source;
  };
  return buildLessonReport(
    [
      visit(1, "t1", "2026-09-10"),
      visit(2, "t2", "2026-09-11", true),
      visit(3, "t3", "2026-10-02"),
      visit(4, "t5", "2026-09-20"),
      visit(5, "t5", "2026-09-21"),
      visit(6, "t6", "2026-09-12"),
    ],
    seed,
    coverageDirectory,
    new Date("2026-10-06T12:00:00Z"),
  );
}
const september = { from: "2026-09-01", to: "2026-09-30" };

test("coverage counts roster teachers with an observation in the period", () => {
  const report = coverageReport();
  const result = visitCoverage(report.teachers, coverageDirectory, {
    ...september,
    staffUnits,
  });
  assert.equal(result.total, 5);
  assert.equal(result.visited, 2);
  assert.deepEqual(
    result.notVisited.map((t) => [t.name, t.selfOnly]),
    [
      ["Учитель Второй", true],
      ["Учитель Третий", false],
      ["Учитель Четвёртый", false],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ru")),
  );
  assert.equal(
    result.notVisited.some((t) => t.name === "Сотрудник Шестой"),
    false,
  );
});

test("coverage without a period counts every dated observation", () => {
  const report = coverageReport();
  const result = visitCoverage(report.teachers, coverageDirectory, { staffUnits });
  assert.equal(result.visited, 3);
  assert.equal(result.total, 5);
});

test("coverage filters by unit, undefined unit and department", () => {
  const report = coverageReport();
  const base = { ...september, staffUnits };
  const unitA = visitCoverage(report.teachers, coverageDirectory, {
    ...base,
    unit: "Подразделение A",
  });
  assert.deepEqual([unitA.visited, unitA.total], [1, 3]);
  assert.deepEqual(
    unitA.notVisited.map((t) => t.units),
    [["Подразделение A", "Подразделение B"], ["Подразделение A"]],
  );
  const none = visitCoverage(report.teachers, coverageDirectory, {
    ...base,
    unit: UNIT_FILTER_NOT_DEFINED,
  });
  assert.deepEqual([none.visited, none.total, none.notVisited.length], [0, 1, 1]);
  const department = visitCoverage(report.teachers, coverageDirectory, {
    ...base,
    department: "Кафедра B",
  });
  assert.deepEqual([department.visited, department.total], [0, 2]);
});

test("coverage lists units from the roster only", () => {
  assert.deepEqual(coverageUnits(coverageDirectory, staffUnits), [
    "Подразделение A",
    "Подразделение B",
  ]);
  assert.deepEqual(coverageUnits(coverageDirectory, undefined), []);
});
