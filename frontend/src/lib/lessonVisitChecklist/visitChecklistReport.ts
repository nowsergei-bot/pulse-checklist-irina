import {
  exactNumber,
  exactMean,
  numberOf,
  scaleFraction,
  serializeFraction,
  type ExactValue,
} from "./exactReportMath.ts";
import rubric from "./pulseV6Rubric.json" with { type: "json" };
import rubricV41 from "./pulseV41Rubric.json" with { type: "json" };
import type {
  LessonVisitChecklistConfig,
  LessonVisitDirectory,
  LessonVisitResponseRow,
} from "./types";

export const REPORT_START = "2026-09-01";
export const RATING_LABELS = [
  "Низкий",
  "Ниже среднего",
  "Средний",
  "Высокий",
  "Очень высокий",
];
export const DIRECT_MAXIMA: Record<string, number> = {
  "1.1": 3,
  "2.1": 5,
  "2.2": 5,
  "2.3": 5,
  "3.1": 5,
  "3.2": 3,
  "3.3": 3,
  "3.5": 3,
  "3.6": 6,
  "3.8": 2,
  "4.1": 5,
  "4.2": 10,
  "5.1": 6,
  "5.2": 3,
  "5.3": 9,
  "6.2": 9,
  "7.1": 5,
  "8.2": 3,
  "9.1": 6,
  "9.3": 4,
};
export const SECTION_NAMES = [
  "Организация",
  "Целеполагание",
  "Методика",
  "Предметное содержание",
  "Результативность",
  "Вовлечённость",
  "Воспитательный потенциал",
  "Инструменты",
  "Коммуникация",
];
const norm = (s: string) =>
  s.trim().toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ");
// Confirmed by the observer: this is the same teacher in both alphabets.
function canonicalTeacherName(name: string): string {
  return norm(name) === "anthony smith" ? "Энтони Смит" : name;
}
export function reportPersonKey(s: string): string {
  return norm(canonicalTeacherName(s)).replace(/[.,]/g, "");
}
/** The form uses both alphabets for parallel letters; keep source spelling in the report. */
export function reportClassKey(value: string): string {
  const letters: Record<string, string> = {
    а: "a",
    в: "b",
    с: "c",
    д: "d",
    е: "e",
    н: "h",
  };
  return norm(value)
    .replace(/\s+/g, "")
    .replace(/[авсден]/g, (letter) => letters[letter]);
}
const pick = (raw: string | string[] | undefined) =>
  Array.isArray(raw) ? raw.join("; ") : raw || "";
export type DirectItem = {
  /** Only substantive observer values feed attention signals; assigned scores stay intact. */
  signalValue?: number | null;
  exactValue?: ExactValue;
  code: string;
  title: string;
  max: number;
  value: number | null;
  na: boolean;
  reason: string;
  answer: string;
  sourceId: string;
  optionIds: string[];
  ruleId: string;
  version: string;
  status: string;
  method: string;
};
export type DirectScore = {
  exactTotal?: ExactValue;
  items: DirectItem[];
  subtotal: number;
  max: number;
  total: number | null;
  missing: string[];
  mixedApplicability?: boolean;
};

export const ACTIVE_RUBRIC_VERSION = rubric.rubric_version;
/** Правила 4.1 действуют для чек-листов с датой посещения с 09.11.2026. */
export const RUBRIC_V41_VERSION = rubricV41.rubric_version;
export const RUBRIC_V41_START = rubricV41.effective_from_visit_date;
type FormRule = {
  rule_id: string;
  score?: number;
  status?: string;
  otherwise?: boolean;
  exact_options?: string[];
  all_options?: string[];
  any_options?: string[];
  without_options?: string[];
};
const ruleMatches = (rule: FormRule, ids: string[]) =>
  (!rule.exact_options ||
    (ids.length === rule.exact_options.length &&
      rule.exact_options.every((id) => ids.includes(id)))) &&
  (!rule.all_options || rule.all_options.every((id) => ids.includes(id))) &&
  (!rule.any_options || rule.any_options.some((id) => ids.includes(id))) &&
  (!rule.without_options ||
    rule.without_options.every((id) => !ids.includes(id)));

type RubricCriterion = {
  code: string;
  label: string;
  kind: string;
  max_score: number | null;
  answer_mode?: string;
  scoring_mode?: string;
  analytics_code?: string;
  options?: { id: string; label: string }[];
};
type Rubric = { rubric_version: string; criteria: RubricCriterion[] };

/** Сведения об уроке для выбора правил и автоматических исключений версии 4.1. */
export type LessonScoreContext = {
  date?: string;
  subject?: string;
  className?: string;
  /** Кафедра учителя. */
  teacherDepartment?: string;
  /** Кафедра наблюдателя, только если он однозначно найден в справочнике. */
  observerDepartment?: string | null;
};

type ChecklistQuestion = LessonVisitChecklistConfig["sections"][number]["questions"][number];
const allQuestions = (checklist: LessonVisitChecklistConfig): ChecklistQuestion[] => [
  ...checklist.sections.flatMap((s) => s.questions || []),
  ...(checklist.legacyQuestions || []),
];
/** Вопрос по коду формы до 4.1: в форме 4.1 у перенесённых вопросов он записан в legacyCode. */
export function questionByLegacyCode(
  checklist: LessonVisitChecklistConfig,
  code: string,
): ChecklistQuestion | undefined {
  return allQuestions(checklist).find((q) => (q.legacyCode ?? q.code) === code);
}
/** Ответ по коду формы до 4.1 (3.8, 10.1, 10.2, 10.3 и т.д.) для старых и новых чек-листов. */
export function answerByLegacyCode(
  checklist: LessonVisitChecklistConfig,
  answers: LessonVisitResponseRow["answers"],
  code: string,
): string | string[] | undefined {
  const q = questionByLegacyCode(checklist, code);
  return answers[q?.id || code] ?? answers[code];
}

const isOtherOption = (label: string) => norm(label).startsWith("другое");
const optionMatches = (option: string, answer: string) =>
  norm(option) === norm(answer) ||
  (isOtherOption(option) && norm(answer).startsWith(`${norm(option)}:`));

/** Ответ на вопрос, который есть только в форме 4.1 (дисциплина 11.1), значит чек-лист заполнен по форме 4.1. */
function filledWithFormV41(
  checklist: LessonVisitChecklistConfig,
  answers: LessonVisitResponseRow["answers"],
): boolean {
  if (checklist.formVersion !== "4.1") return false;
  const q = checklist.sections
    .flatMap((s) => s.questions || [])
    .find((x) => x.code === "11.1" && !x.legacyCode);
  const raw = q ? answers[q.id] : undefined;
  return Array.isArray(raw) ? raw.length > 0 : Boolean(raw && String(raw).trim());
}

/** Версия правил: по дате посещения; без даты действуют прежние правила. */
export function rubricVersionFor(
  checklist: LessonVisitChecklistConfig,
  answers: LessonVisitResponseRow["answers"],
  date?: string,
): string {
  if (date && validLessonDate(date) && date >= RUBRIC_V41_START) return RUBRIC_V41_VERSION;
  return filledWithFormV41(checklist, answers) ? RUBRIC_V41_VERSION : ACTIVE_RUBRIC_VERSION;
}

const LEADERSHIP_DEPARTMENT = "кафедра лидерства";
const NOT_A_DEPARTMENT = new Set(["администрация", "учебная часть", "кафедра не указана"]);
/** Номер класса из начала поля «Класс» («1А», «2 Б»); null, если не распознан. */
export function classGrade(className?: string): number | null {
  const m = /^\s*(\d{1,2})(?!\d)/.exec(className || "");
  return m ? Number(m[1]) : null;
}
/** Пункты, которые Пульс в версии 4.1 не учитывает сам, с причиной (лист «Исключения»). */
export function autoExceptionsV41(context: LessonScoreContext = {}): Map<string, string> {
  const out = new Map<string, string>();
  const add = (code: string, reason: string) => {
    if (!out.has(code)) out.set(code, reason);
  };
  if (norm(context.subject || "") === "физическая культура")
    add("3.6", "Не учитывается: физическая культура");
  const grade = classGrade(context.className);
  if (grade === 1 || grade === 2) add("3.6", `Не учитывается: ${grade} класс`);
  const teacherDept = norm(context.teacherDepartment || "");
  if (teacherDept === LEADERSHIP_DEPARTMENT) {
    add("3.6", "Не учитывается: кафедра лидерства");
    add("10.1", "Не учитывается: кафедра лидерства");
  }
  const observerDept = norm(context.observerDepartment || "");
  if (
    observerDept &&
    teacherDept &&
    !NOT_A_DEPARTMENT.has(observerDept) &&
    !NOT_A_DEPARTMENT.has(teacherDept) &&
    observerDept !== teacherDept
  )
    add("4.2", "Не учитывается: наблюдатель с другой кафедры");
  return out;
}

/** Базовый балл по форме. Более высокие уровни 3.5, 5.2, 5.3 требуют отдельного основания в тексте. */
export function directLessonScore(
  checklist: LessonVisitChecklistConfig,
  answers: LessonVisitResponseRow["answers"],
  context: LessonScoreContext = {},
): DirectScore {
  const version = rubricVersionFor(checklist, answers, context.date);
  const v41 = version === RUBRIC_V41_VERSION;
  const activeRubric = (v41 ? rubricV41 : rubric) as unknown as Rubric;
  const questions = checklist.sections.flatMap((s) => s.questions || []);
  const exceptions = v41 ? autoExceptionsV41(context) : new Map<string, string>();
  const items = activeRubric.criteria
    .filter((c) => c.kind === "scored")
    .map((criterion): DirectItem => {
      const formCode = criterion.code;
      const code = criterion.analytics_code || formCode;
      // Старые чек-листы ищут вопрос по коду формы до 4.1, новые по коду 4.1.
      const q = v41
        ? questions.find((x) => x.code === formCode)
        : questionByLegacyCode(checklist, formCode);
      const sourceId = q?.id || formCode,
        raw = answers[sourceId] ?? answers[formCode];
      const labels = (
        Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw]
      ).map(String);
      const options = criterion.options || [];
      const mapped = labels.map((label) =>
        options.find((o) => optionMatches(o.label, label)),
      );
      const ids = mapped
        .filter((o): o is { id: string; label: string } => Boolean(o))
        .map((o) => o.id);
      let status = "missing_answer",
        value: number | null = null,
        ruleId = `${code}/status/missing_answer`;
      let reason = "Нет ответа";
      const exception = exceptions.get(formCode);
      if (exception) {
        status = "not_applicable";
        reason = exception;
        ruleId = `${formCode}/exception/auto`;
      } else if (mapped.some((o) => !o)) {
        status = "unmapped_answer";
        reason = "Ответ отсутствует в справочнике v5";
      } else if (
        new Set(ids).size !== ids.length ||
        (criterion.answer_mode === "single" && ids.length > 1)
      ) {
        status = "contradiction";
        reason = "Несколько вариантов в одиночном пункте";
      } else if (ids.length) {
        if (criterion.scoring_mode === "direct") {
          const c = criterion as unknown as {
            answer_map: Record<string, number | string>;
            answer_rule_ids: Record<string, string>;
          };
          const score = c.answer_map[ids[0]];
          status = score === "not_applicable" ? "not_applicable" : "scored";
          value = typeof score === "number" ? score : null;
          ruleId = c.answer_rule_ids[ids[0]];
        } else {
          const rules = (criterion as unknown as { baseline_rules: FormRule[] })
            .baseline_rules;
          const rule = rules.find(
            (rule) => rule.otherwise || ruleMatches(rule, ids),
          );
          status =
            rule?.score != null ? "scored" : rule?.status || "missing_answer";
          value = rule?.score ?? null;
          ruleId = rule?.rule_id || ruleId;
        }
        reason =
          status === "scored"
            ? ""
            : status === "not_applicable"
              ? "Не применимо"
              : status === "contradiction"
                ? "Противоречивые варианты ответа"
                : code === "3.8"
                  ? "Соответствие домашнего задания целям не указано"
                  : "Нет достаточного ответа";
      }
      if (
        status !== "scored" &&
        status !== "not_applicable" &&
        !ruleId.includes("/form/")
      )
        ruleId = `${code}/status/${status}`;
      return {
        code,
        title: q?.text || criterion.label,
        max: criterion.max_score!,
        value,
        na: status === "not_applicable",
        reason,
        answer: labels.join("; "),
        sourceId,
        optionIds: ids,
        ruleId,
        version,
        status,
        method:
          ["3.5", "5.2", "5.3"].includes(code) && value != null && value > 0
            ? "form_minimum"
            : "form",
      };
    });
  const missing = items
    .filter((i) => !i.na && i.value == null)
    .map((i) => i.code);
  const subtotal = items.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const max = items
    .filter((i) => !i.na)
    .reduce((sum, item) => sum + item.max, 0);
  return {
    items,
    subtotal,
    max,
    total: missing.length ? null : subtotal,
    exactTotal: missing.length
      ? undefined
      : serializeFraction(exactNumber(subtotal)),
    missing,
  };
}

export function previousCompletedWeek(now = new Date()): {
  start: string;
  end: string;
  today: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() - 1);
  date.setUTCDate(date.getUTCDate() - 7);
  return {
    start: date.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    today,
  };
}
export function validLessonDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function ratingValue(text: string): number | null {
  const index = RATING_LABELS.findIndex((x) => norm(x) === norm(text));
  return index < 0 ? null : index + 1;
}
export function mean(values: (number | null)[]): number | null {
  const nums = values.filter(
    (n): n is number => n != null && Number.isFinite(n),
  );
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
export function ratingText(value: number | null): string {
  return value == null
    ? "Нет оценки"
    : `${value.toLocaleString("ru", { maximumFractionDigits: 2 })} / 5 · индекс ответов 10.1`;
}
export function ratingTone(value: number | null): string {
  return value == null
    ? "none"
    : value >= 4
      ? "good"
      : value >= 3
        ? "middle"
        : "low";
}
export type SavedSelfLink = {
  self_response_id: number;
  lesson_response_id: number;
  method: "teacher_date" | "manual";
  confirmed_at?: string;
  confirmed_by?: number;
  confirmed_by_label?: string;
};
export type ReportVisit = {
  linkedLessonId?: number;
  linkMethod?: "teacher_date" | "manual";
  linkConfirmedAt?: string;
  linkConfirmedBy?: string;
  id: number;
  teacher: string;
  teacherKey: string;
  department: string;
  date: string;
  subject: string;
  className: string;
  visitor: string;
  format: string;
  self: boolean;
  rating: number | null;
  ratingOriginal: string;
  ratingMapped: string;
  score: DirectScore;
  feedback: string;
  practice: string;
  pairKey: string | null;
};
export type ReportTeacher = {
  key: string;
  name: string;
  department: string;
  visits: ReportVisit[];
};
export function buildLessonReport(
  rows: LessonVisitResponseRow[],
  checklist: LessonVisitChecklistConfig,
  directory: LessonVisitDirectory,
  now = new Date(),
) {
  const week = previousCompletedWeek(now);
  const roster = new Map<string, ReportTeacher>();
  const departmentName = (id: string) =>
    directory.departments.find((d) => d.id === id)?.name || "";
  for (const teacher of directory.teachers) {
    const key = reportPersonKey(teacher.name);
    if (key)
      roster.set(key, {
        key,
        name: teacher.name,
        department:
          departmentName(teacher.departmentId) || "Кафедра не указана",
        visits: [],
      });
  }
  const departmentIdsByPerson = new Map<string, Set<string>>();
  for (const teacher of directory.teachers) {
    const key = reportPersonKey(teacher.name);
    if (!key) continue;
    if (!departmentIdsByPerson.has(key)) departmentIdsByPerson.set(key, new Set());
    departmentIdsByPerson.get(key)!.add(teacher.departmentId || "");
  }
  /** Кафедра наблюдателя, только если ФИО однозначно найдено в справочнике и кафедра одна. */
  const observerDepartment = (name: string): string | null => {
    const ids = departmentIdsByPerson.get(reportPersonKey(name));
    if (!ids || ids.size !== 1) return null;
    return departmentName([...ids][0]) || null;
  };
  const visits: ReportVisit[] = rows.map((row) => {
    const g = row.general;
    const get = (...keys: string[]) =>
      keys.map((k) => g[k]?.trim()).find(Boolean) || "";
    const teacherIdentifier = get("teacher_id");
    // Older responses stored the teacher's full name in teacher_id.
    // Preserve those names, but do not expose unresolved technical IDs as names.
    const legacyTeacherName = /^[\p{L}\p{M}]+(?:[ .’'-]+[\p{L}\p{M}]+)+$/u.test(
      teacherIdentifier,
    )
      ? teacherIdentifier
      : "";
    const explicitTeacherName = get("teacher_name", "teacher");
    const teacherRow =
      directory.teachers.find((t) => t.id === teacherIdentifier) ||
      directory.teachers.find(
        (t) =>
          reportPersonKey(t.name) ===
          reportPersonKey(explicitTeacherName || legacyTeacherName),
      );
    const teacher = canonicalTeacherName(
      teacherRow?.name ||
      explicitTeacherName ||
      legacyTeacherName ||
      "Педагог не указан",
    );
    const teacherKey = reportPersonKey(teacher);
    const department =
      (teacherRow ? departmentName(teacherRow.departmentId) : "") ||
      departmentName(get("department_id")) ||
      get("department_name", "department") ||
      "Кафедра не указана";
    // Коды формы до 4.1: в форме 4.1 вопросы найдутся по legacyCode.
    const value = (code: string) =>
      pick(answerByLegacyCode(checklist, row.answers, code));
    const rawDate = get("visit_date", "date").slice(0, 10);
    const date = validLessonDate(rawDate) ? rawDate : "";
    const subject = get("subject", "lesson_subject", "discipline"),
      className = get("class_name", "class", "className");
    const format = get(
      "visit_format",
      "format",
      "visitFormat",
      "lesson_format",
    );
    const self =
      /само[\s-]?анализ|самооценка|^self(?:$|[ -])|^samoanaliz$/i.test(format);
    const visitor = get("visitor_name", "visitor", "observer");
    const score = directLessonScore(checklist, row.answers, {
      date,
      subject,
      className,
      teacherDepartment: department === "Кафедра не указана" ? "" : department,
      observerDepartment: visitor ? observerDepartment(visitor) : null,
    });
    const pairKey =
      teacher !== "Педагог не указан" && date && subject && className
        ? [teacherKey, date, norm(subject), reportClassKey(className)].join("|")
        : null;
    return {
      id: row.id,
      teacher,
      teacherKey,
      department,
      date,
      subject,
      className,
      visitor,
      format,
      self,
      rating: ratingValue(value("10.1")),
      ratingOriginal: value("10.1"),
      ratingMapped:
        (
          {
            низкий: "Очень низкий",
            "ниже среднего": "Низкий",
            средний: "Средний",
            высокий: "Высокий",
            "очень высокий": "Очень высокий",
          } as Record<string, string>
        )[norm(value("10.1"))] || "",
      score,
      feedback: value("10.2"),
      // В форме 4.1 поля «Что я возьму с собой» нет: берём «Общие выводы».
      practice:
        value("10.3") ||
        (score.items[0]?.version === RUBRIC_V41_VERSION ? value("10.2") : ""),
      pairKey,
    };
  });
  const year = visits.filter(
    (v) => v.date >= REPORT_START && v.date <= week.today,
  );
  for (const visit of year) {
    if (!roster.has(visit.teacherKey))
      roster.set(visit.teacherKey, {
        key: visit.teacherKey,
        name: visit.teacher,
        department: visit.department,
        visits: [],
      });
    roster.get(visit.teacherKey)!.visits.push(visit);
  }
  return {
    week,
    visits: year,
    weekly: year.filter((v) => v.date >= week.start && v.date <= week.end),
    teachers: [...roster.values()],
    undated: visits.filter((v) => !/^\d{4}-\d{2}-\d{2}$/.test(v.date)).length,
  };
}
/** Ambiguous repeats are never silently paired to an arbitrary lesson. */
export function pairedSelf(
  visit: ReportVisit,
  rows: ReportVisit[],
): ReportVisit | undefined {
  const observations = rows.filter(
    (v) =>
      !v.self &&
      (visit.pairKey ? v.pairKey === visit.pairKey : v.id === visit.id),
  );
  const ids = new Set(observations.map((v) => v.id));
  const selves = rows.filter(
    (v) =>
      v.self &&
      (v.linkedLessonId != null
        ? ids.has(v.linkedLessonId)
        : Boolean(visit.pairKey && v.pairKey === visit.pairKey)),
  );
  return selves.length === 1 && observations.length ? selves[0] : undefined;
}
export function scoreGroups(
  rows: ReportVisit[],
): { max: number; mean: number; count: number }[] {
  const groups = new Map<number, number[]>();
  for (const row of rows)
    if (row.score.total != null)
      groups.set(row.score.max, [
        ...(groups.get(row.score.max) || []),
        row.score.total,
      ]);
  return [...groups]
    .sort(([a], [b]) => b - a)
    .map(([max, values]) => ({
      max,
      mean: mean(values)!,
      count: values.length,
    }));
}
export function scoreGroupText(rows: ReportVisit[]): string {
  if (!rows.length) return "Нет данных";
  const groups = scoreGroups(rows);
  return groups.length
    ? groups
        .map(
          (g) =>
            `${g.mean.toLocaleString("ru", { maximumFractionDigits: 1 })} из ${g.max} (n=${g.count})`,
        )
        .join("; ")
    : "Итог не сформирован";
}
export function sortReportTeachers(rows: ReportTeacher[]): ReportTeacher[] {
  return [...rows].sort((a, b) => {
    const aa = scoreGroups(a.visits.filter((v) => !v.self)),
      bb = scoreGroups(b.visits.filter((v) => !v.self));
    if (aa.length === 1 && bb.length === 1)
      return (
        bb[0].max - aa[0].max ||
        bb[0].mean - aa[0].mean ||
        a.name.localeCompare(b.name, "ru")
      );
    if (aa.length !== bb.length) return bb.length - aa.length;
    return a.name.localeCompare(b.name, "ru");
  });
}

export function lessonObservations(rows: ReportVisit[]): ReportVisit[] {
  const groups = new Map<string, ReportVisit[]>();
  for (const row of rows.filter((r) => !r.self)) {
    const key = row.pairKey || `unidentified:${row.id}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()].map((group) => {
    const first = group[0],
      sameMax =
        group.every((v) => v.score.max === first.score.max) &&
        group.every((v) =>
          v.score.items.every(
            (i) =>
              i.na === first.score.items.find((f) => f.code === i.code)?.na,
          ),
        );
    const items = first.score.items.map((item) => {
      const matches = group.map(
        (v) => v.score.items.find((i) => i.code === item.code)!,
      );
      const consistentNA = matches.every((i) => i.na === item.na);
      const exactValue =
        consistentNA && matches.every((i) => i.value != null)
          ? exactMean(matches.map((i) => exactNumber(i.exactValue ?? i.value!)))
          : null;
      const value = exactValue ? numberOf(exactValue) : null;
      const signalValues = matches.filter(i => i.value != null && !i.na && i.method !== "form_minimum");
      const signalValue = mean(signalValues.map(i => i.value));
      return {
        ...item,
        value,
        signalValue,
        exactValue: exactValue ? serializeFraction(exactValue) : undefined,
        na: consistentNA && item.na,
        status:
          value == null && !item.na
            ? matches.find((i) => i.value == null && !i.na)?.status ||
              "missing_answer"
            : item.status,
        reason:
          value == null && !item.na
            ? "Не все наблюдения оценены одинаково применимым пунктом"
            : item.reason,
      };
    });
    const totalExact = group.every((v) => v.score.total != null)
      ? exactMean(
          group.map((v) => {
            const total = exactNumber(v.score.exactTotal ?? v.score.total!);
            return sameMax ? total : scaleFraction(total, 100, v.score.max);
          }),
        )
      : null;
    const missing = items
      .filter((i) => !i.na && i.value == null)
      .map((i) => i.code);
    return {
      ...first,
      visitor: [...new Set(group.map((v) => v.visitor))].join("; "),
      rating: mean(group.map((v) => v.rating)),
      ratingOriginal: [
        ...new Set(group.map((v) => v.ratingOriginal).filter(Boolean)),
      ].join("; "),
      ratingMapped: [
        ...new Set(group.map((v) => v.ratingMapped).filter(Boolean)),
      ].join("; "),
      score: {
        ...first.score,
        items,
        missing,
        subtotal: items.reduce((sum, i) => sum + (i.value ?? 0), 0),
        max: sameMax ? first.score.max : 100,
        mixedApplicability: !sameMax,
        total: totalExact ? numberOf(totalExact) : null,
        exactTotal: totalExact ? serializeFraction(totalExact) : undefined,
      },
    };
  });
}

export function selfMatchReport(rows: ReportVisit[]) {
  const observations = lessonObservations(rows);
  return rows
    .filter((r) => r.self)
    .map((self) => {
      const confirmed =
        self.linkedLessonId != null
          ? observations.find(
              (o) =>
                o.id === self.linkedLessonId ||
                Boolean(
                  o.pairKey &&
                    rows.some(
                      (v) =>
                        !v.self &&
                        v.id === self.linkedLessonId &&
                        v.pairKey === o.pairKey,
                    ),
                ),
            )
          : undefined;
      const exact = self.pairKey
        ? observations.filter((o) => o.pairKey === self.pairKey)
        : [];
      const duplicates = rows.filter(
        (r) => r.self && self.pairKey && r.pairKey === self.pairKey,
      );
      const teacher = observations.filter(
        (o) => o.teacherKey === self.teacherKey,
      );
      const closest = teacher
        .map((o) => ({
          id: o.id,
          date: o.date,
          className: o.className,
          subject: o.subject,
          mismatches: [
            o.date !== self.date ? "дата" : "",
            reportClassKey(o.className) !== reportClassKey(self.className)
              ? "класс"
              : "",
            norm(o.subject) !== norm(self.subject) ? "предмет" : "",
          ].filter(Boolean),
        }))
        .sort((a, b) => a.mismatches.length - b.mismatches.length);
      const min = closest[0]?.mismatches.length;
      const candidates = closest.filter((c) => c.mismatches.length === min);
      const reason = confirmed
        ? self.linkMethod === "teacher_date"
          ? "Привязан по учителю и дате"
          : "Связь подтверждена"
        : !self.pairKey
          ? "Не заполнены дата, учитель, класс или предмет"
          : duplicates.length > 1
            ? "Несколько самоанализов одного урока"
            : exact.length === 1
              ? "Сопоставлен"
              : !teacher.length
                ? "Нет урока этого учителя"
                : candidates.length > 1
                  ? `Несколько кандидатов; расхождение: ${[...new Set(candidates.flatMap((c) => c.mismatches))].join(", ")}`
                  : `Расхождение: ${candidates[0]?.mismatches.join(", ")}`;
      return {
        self,
        lesson:
          confirmed ||
          (reason === "Сопоставлен" && self.linkedLessonId == null
            ? exact[0]
            : undefined),
        reason,
        candidates,
      };
    });
}

/** Saved relationships add metadata only; source dates, answers and scores remain untouched. */
export function withSelfAnalysisLinks(
  report: ReturnType<typeof buildLessonReport>,
  links: SavedSelfLink[],
) {
  const visits = report.visits.map((v) => {
    const link = links.find((l) => l.self_response_id === v.id);
    const target =
      link &&
      report.visits.find(
        (t) =>
          t.id === link.lesson_response_id &&
          !t.self &&
          t.teacherKey === v.teacherKey,
      );
    return v.self && target
      ? {
          ...v,
          linkedLessonId: target.id,
          linkMethod: link!.method,
          linkConfirmedAt: link!.confirmed_at,
          linkConfirmedBy: link!.confirmed_by_label,
        }
      : v;
  });
  const byId = new Map(visits.map((v) => [v.id, v]));
  return {
    ...report,
    visits,
    weekly: report.weekly.map((v) => byId.get(v.id)!),
    teachers: report.teachers.map((t) => ({
      ...t,
      visits: t.visits.map((v) => byId.get(v.id)!),
    })),
  };
}
