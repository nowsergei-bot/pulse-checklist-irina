import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  LessonVisitChecklistConfig,
  LessonVisitDirectory,
  LessonVisitResponseRow,
} from "../lib/lessonVisitChecklist/types";
import {
  buildLessonReport,
  withSelfAnalysisLinks,
  type SavedSelfLink,
  lessonObservations,
  mean,
  pairedSelf,
  selfMatchReport,
  SECTION_NAMES,
  type ReportVisit,
} from "../lib/lessonVisitChecklist/visitChecklistReport";
import {
  DISCREPANCY_NAMES,
  LEVEL_COLORS,
  LEVELS,
  discrepancies,
  displayScore,
  fullLessonCount,
  signalItems,
  itemText,
  levelIndex,
  losses,
  pageRows,
  preliminaryPercent,
  schoolAverage,
  scorePercent,
  selectReportRows,
  shortName,
  teacherResultGroups,
} from "../lib/lessonVisitChecklist/reportPresentation";
import {
  getLessonVisitSelfLinks,
  saveLessonVisitSelfLink,
} from "../api/visitChecklist";
import "./VisitChecklistReportDashboard.css";

type Props = {
  projectId?: number;
  responses: LessonVisitResponseRow[];
  checklist: LessonVisitChecklistConfig;
  directory: LessonVisitDirectory;
  now?: Date;
};
const dateText = (date: string) =>
  date ? date.split("-").reverse().join(".") : "Дата не указана";
const lessonText = (v: ReportVisit) =>
  `${shortName(v.teacher)} · ${dateText(v.date)} · ${v.subject} · ${v.className}`;
function Badge({
  percent,
  preliminary = false,
}: {
  percent: number | null;
  preliminary?: boolean;
}) {
  const i = levelIndex(percent);
  return i < 0 ? null : (
    <span
      className={`vcr-level${preliminary ? " vcr-level--preliminary" : ""}`}
      style={{
        backgroundColor: LEVEL_COLORS[i],
        color: !preliminary && (i === 0 || i === 4) ? "#fff" : "#152315",
      }}
    >
      {LEVELS[i]}
      {preliminary ? " · предварительно" : ""}
    </span>
  );
}
function Score({ visit }: { visit: ReportVisit }) {
  const full = visit.score.total != null,
    value = visit.score.total ?? visit.score.subtotal;
  const maximum = full
    ? visit.score.max
    : visit.score.items
        .filter((i) => i.value != null && !i.na)
        .reduce((n, i) => n + i.max, 0);
  if (!full && preliminaryPercent(visit) == null)
    return <span>Итог не сформирован</span>;
  return (
    <>
      <strong>
        {displayScore(value, maximum)} из {maximum}
      </strong>
      {!full && <small>Предварительно</small>}
      {visit.score.mixedApplicability && <small>Разная применимость</small>}
      <Badge
        percent={scorePercent(visit) ?? preliminaryPercent(visit)}
        preliminary={!full}
      />
    </>
  );
}
function Empty() {
  return <p className="vcr-empty">В выбранном отборе данных нет.</p>;
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="vcr-table-scroll" tabIndex={0}>
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function LevelChart({
  title,
  rows,
  dates,
  onOpen,
}: {
  title: string;
  rows: ReportVisit[];
  dates: string;
  onOpen: (level: string) => void;
}) {
  const lessons = lessonObservations(rows);
  const series = LEVELS.map((label, i) => ({
    label,
    i,
    full: lessons.filter(
      (v) => v.score.total != null && levelIndex(scorePercent(v)) === i,
    ).length,
    partial: lessons.filter(
      (v) => v.score.total == null && levelIndex(preliminaryPercent(v)) === i,
    ).length,
  }));
  const top = Math.max(1, ...series.map((s) => s.full + s.partial)),
    without = lessons.filter(
      (v) => levelIndex(scorePercent(v) ?? preliminaryPercent(v)) < 0,
    ).length;
  const ticks = Array.from({ length: Math.min(top, 5) + 1 }, (_, i) =>
    Math.round((top * i) / Math.min(top, 5)),
  );
  return (
    <section className="vcr-panel">
      <h3>{title}</h3>
      <p>
        {dates} · {lessons.length} уроков
      </p>
      <div
        className="vcr-level-chart"
        aria-label={`${title}. Число уникальных уроков`}
      >
        <div className="vcr-chart-axis">
          <small>Уроков</small>
          {ticks.reverse().map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        {series.map((s) => (
          <button
            key={s.label}
            className="vcr-chart-column"
            onClick={() => onOpen(s.label)}
            aria-label={`${s.label}: ${s.full} полных и ${s.partial} предварительных уроков`}
          >
            <span>
              {s.full} + {s.partial}
            </span>
            <div className="vcr-chart-track">
              <div className="vcr-chart-stack">
                <div
                  className="vcr-chart-partial"
                  style={{
                    height: `${(s.partial / top) * 180}px`,
                    backgroundColor: LEVEL_COLORS[s.i],
                  }}
                />
                <div
                  style={{
                    height: `${(s.full / top) * 180}px`,
                    backgroundColor: LEVEL_COLORS[s.i],
                  }}
                />
              </div>
            </div>
            <small>{s.label}</small>
          </button>
        ))}
      </div>
      <p className="vcr-chart-legend">
        <span>■ Полный итог</span>
        <span>▨ Предварительный итог</span>
      </p>
      {without > 0 && <p>Без определённого уровня: {without}</p>}
      {!lessons.length && <p>Нет уроков за этот период</p>}
    </section>
  );
}

export default function VisitChecklistReportDashboard({
  responses,
  projectId,
  checklist,
  directory,
  now,
}: Props) {
  const [params, setParams] = useSearchParams();
  const currentParams = useRef(params);
  currentParams.current = params;
  const [exportError, setExportError] = useState("");
  const [links, setLinks] = useState<SavedSelfLink[]>([]);
  const [linkError, setLinkError] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setLinks([]);
    if (projectId)
      void getLessonVisitSelfLinks(projectId)
        .then((value) => {
          if (active) {
            setLinks(value);
            setLinkError("");
          }
        })
        .catch((error) => {
          if (active)
            setLinkError(
              error instanceof Error
                ? error.message
                : "Не удалось загрузить связи",
            );
        });
    return () => {
      active = false;
    };
  }, [projectId]);
  async function saveLink(
    body:
      | { mode: "automatic" }
      | { self_response_id: number; lesson_response_id: number },
  ) {
    if (!projectId) return;
    setLinkBusy(true);
    setLinkError("");
    try {
      setLinks(await saveLessonVisitSelfLink(projectId, body));
    } catch (error) {
      setLinkError(
        error instanceof Error ? error.message : "Не удалось сохранить связь",
      );
    } finally {
      setLinkBusy(false);
    }
  }
  const baseReport = useMemo(
    () => buildLessonReport(responses, checklist, directory, now),
    [responses, checklist, directory, now],
  );
  const report = useMemo(
    () => withSelfAnalysisLinks(baseReport, links),
    [baseReport, links],
  );
  const view = params.get("reportView") || "summary",
    teacher = params.get("reportTeacher"),
    lessonId = params.get("reportLesson");
  const period = params.get("reportPeriod") || "week",
    from = params.get("reportFrom") || report.week.start,
    to = params.get("reportTo") || report.week.end;
  const department = params.get("reportDepartment") || "",
    search = params.get("reportSearch") || "",
    level = params.get("reportLevel") || "";
  const page = Math.max(
      1,
      Number.parseInt(params.get("reportPage") || "1", 10) || 1,
    ),
    size =
      params.get("reportSize") === "all"
        ? "all"
        : params.get("reportSize") === "50"
          ? 50
          : 20;
  const update = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(currentParams.current);
    for (const [k, v] of Object.entries(values))
      v ? next.set(k, v) : next.delete(k);
    if (!("reportPage" in values)) next.delete("reportPage");
    currentParams.current = next;
    setParams(next);
  };
  const openLesson = (v: ReportVisit) =>
    update({ reportLesson: String(v.id), reportTeacher: null });
  const matchesSearch = (v: ReportVisit) =>
    !search ||
    `${v.teacher} ${v.visitor}`
      .toLocaleLowerCase("ru")
      .includes(search.toLocaleLowerCase("ru"));
  const resultGroup = params.get("reportGroup") || "all";
  const scoped = selectReportRows(report.visits, {
    department,
    teacher,
    search,
    group: resultGroup,
  });
  const periodRows =
    period === "all"
      ? scoped
      : scoped.filter((v) => v.date >= from && v.date <= to);
  const selectedLesson = report.visits.find((v) => String(v.id) === lessonId);
  const rows = selectedLesson
    ? scoped.filter(
        (v) =>
          (v.pairKey && v.pairKey === selectedLesson.pairKey) ||
          v.id === selectedLesson.id ||
          v.linkedLessonId === selectedLesson.id,
      )
    : periodRows;
  const lessons = lessonObservations(rows),
    flags = discrepancies(rows, report.visits);
  const meanScore = schoolAverage(rows);
  const teachers = report.teachers
    .filter(
      (t) =>
        (!department || t.department === department) &&
        (!search ||
          t.name
            .toLocaleLowerCase("ru")
            .includes(search.toLocaleLowerCase("ru")) ||
          t.visits.some(matchesSearch)),
    )
    .map((t) => ({
      ...t,
      rows: rows.filter((v) => v.teacherKey === t.key),
      average: schoolAverage(rows.filter((v) => v.teacherKey === t.key)),
    }));
  const resultGroups = teacherResultGroups(teachers);
  const teacherResultRows = resultGroups.flatMap((group) =>
    group.rows.map((row) => ({ ...row, groupKey: group.key })),
  );
  const support = teachers
    .filter((t) =>
      lessonObservations(t.rows).some(
        (v) => scorePercent(v) != null && scorePercent(v)! < 70,
      ),
    )
    .sort((a, b) => (a.average ?? Infinity) - (b.average ?? Infinity));
  const allLessonsForLinks = lessonObservations(report.visits);
  const selfMatches = selfMatchReport(report.visits);
  const unlinked = selfMatches
    .filter((m) => rows.some((v) => v.id === m.self.id) && !m.lesson)
    .sort((a, b) => a.self.date.localeCompare(b.self.date));
  const departments = [
    ...new Set(report.teachers.map((t) => t.department)),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  const criteria = checklist.sections
    .flatMap((s) => s.questions)
    .filter((q) =>
      lessons.some((v) => v.score.items.some((i) => i.code === q.code)),
    )
    .map((q) => {
      const values = lessons.flatMap((v) =>
        v.score.items.filter(
          (i) => i.code === q.code && i.value != null && !i.na,
        ),
      );
      const eligible = signalItems(values);
      return {
        code: q.code!,
        title: q.text,
        max: values[0]?.max || 0,
        value: mean(values.map((i) => i.value)),
        priority: mean(eligible.map((i) => i.value)),
        percent: mean(eligible.map((i) => (i.value! / i.max) * 100)),
        count: values.length,
        eligibleCount: eligible.length,
      };
    });
  const priorities = criteria
    .filter((c) => c.percent != null && c.percent < 50)
    .sort((a, b) => a.priority! - b.priority!);
  const filteredLessons = lessons
    .filter(
      (v) =>
        !level ||
        LEVELS[levelIndex(scorePercent(v) ?? preliminaryPercent(v))] === level,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const observers = [
    ...new Set(rows.filter((v) => !v.self).map((v) => v.visitor)),
  ].map((name) => ({
    name,
    rows: rows.filter((v) => !v.self && v.visitor === name),
  }));
  const detail = Boolean(teacher || lessonId);
  const heading = selectedLesson
    ? lessonText(selectedLesson)
    : teacher
      ? teachers.find((t) => t.key === teacher)?.name || "Карточка учителя"
      : (
          {
            summary: "Сводка",
            teachers: "Результаты учителей",
            departments: "Кафедры",
            observers: "Наблюдатели",
            criteria: "Критерии урока",
            priorities: "Приоритеты",
            support: "Нужна методическая поддержка",
            discrepancies: "Расхождения в оценках",
            unlinked: "Самоанализы без урока",
            lessons: "Уроки",
          } as Record<string, string>
        )[view] || "Сводка";
  const fullList = (name: string, total: number) => (
    <button
      className="vcr-link"
      onClick={() =>
        update({ reportView: name, reportTeacher: null, reportLesson: null })
      }
    >
      Все {total} →
    </button>
  );
  const lessonLink = (v: ReportVisit) => (
    <button className="vcr-link" onClick={() => openLesson(v)}>
      {lessonText(v)}
    </button>
  );
  const renderLessons = (visits: ReportVisit[]) => (
    <Table headers={["Урок", "Кафедра", "Наблюдатель", "Итог", "Самоанализ"]}>
      {visits.map((v) => {
        const self = pairedSelf(v, report.visits);
        const candidates = selfMatches.some(
          (m) => !m.lesson && m.candidates.some((c) => c.id === v.id),
        );
        return (
          <tr key={v.id}>
            <td>{lessonLink(v)}</td>
            <td>{v.department}</td>
            <td>{shortName(v.visitor)}</td>
            <td>
              <Score visit={v} />
            </td>
            <td>
              {self ? (
                <>
                  <Score visit={self} />
                  {self.linkMethod && (
                    <small>
                      {self.linkMethod === "teacher_date"
                        ? "Привязан по учителю и дате"
                        : "Связь подтверждена"}
                      {self.linkConfirmedBy
                        ? ` · ${shortName(self.linkConfirmedBy)}`
                        : ""}
                      {self.linkConfirmedAt
                        ? ` · ${dateText(self.linkConfirmedAt.slice(0, 10))}`
                        : ""}
                    </small>
                  )}
                </>
              ) : candidates ? (
                "Самоанализ не привязан"
              ) : (
                "Самоанализа нет"
              )}
            </td>
          </tr>
        );
      })}
    </Table>
  );
  const renderFlags = (list: typeof flags) => (
    <Table
      headers={[
        "Тип",
        "Урок",
        "Что расходится",
        "Три пункта с наибольшей потерей баллов",
      ]}
    >
      {list.map((f) => (
        <tr key={f.key}>
          <td>
            {DISCREPANCY_NAMES[f.type]}
            {f.preliminary && <small>Предварительно</small>}
          </td>
          <td>{lessonLink(f.lesson)}</td>
          <td>
            {f.description}
            {f.direction && (
              <small>Общая оценка {f.direction} результата чек-листа</small>
            )}
          </td>
          <td>
            {f.participants.map((v) => (
              <p key={v.id}>
                {v.self ? "Самоанализ" : shortName(v.visitor)}:{" "}
                {losses(v).map(itemText).join("; ") || "Нет оценённых потерь"}
              </p>
            ))}
          </td>
        </tr>
      ))}
    </Table>
  );
  const renderCriteria = (list: typeof criteria, priorityOnly = false) => (
    <Table headers={["Пункт", "Средний балл", "Оценённых уроков"]}>
      {list.map((c) => (
        <tr key={c.code}>
          <td>
            {c.code} {c.title}
          </td>
          <td>
            {(priorityOnly ? c.priority : c.value) == null
              ? "Не оценено"
              : `${(priorityOnly ? c.priority : c.value)!.toLocaleString("ru", { maximumFractionDigits: 2 })} из ${c.max}`}
          </td>
          <td>{priorityOnly ? c.eligibleCount : c.count}</td>
        </tr>
      ))}
    </Table>
  );
  const renderSupport = (list: typeof support) => (
    <Table
      headers={[
        "Учитель",
        "Кафедра",
        "Средний итог",
        "Уроки, требующие поддержки",
      ]}
    >
      {list.map((t) => (
        <tr key={t.key}>
          <td>
            <button
              className="vcr-link"
              onClick={() =>
                update({ reportTeacher: t.key, reportLesson: null })
              }
            >
              {shortName(t.name)}
            </button>
          </td>
          <td>{t.department}</td>
          <td>
            {t.average != null && (
              <>
                {displayScore(t.average)} из 100
                <Badge percent={t.average} />
              </>
            )}
          </td>
          <td>
            {lessonObservations(t.rows)
              .filter((v) => scorePercent(v) != null && scorePercent(v)! < 70)
              .slice(0, 1)
              .map((v) => (
                <p key={v.id}>{lessonLink(v)}</p>
              ))}
            {lessonObservations(t.rows).filter(
              (v) => scorePercent(v) != null && scorePercent(v)! < 70,
            ).length > 1 && (
              <button
                className="vcr-link"
                onClick={() =>
                  update({ reportTeacher: t.key, reportLesson: null })
                }
              >
                Все уроки учителя →
              </button>
            )}
          </td>
        </tr>
      ))}
    </Table>
  );
  const renderUnlinked = (list: typeof unlinked) => (
    <Table
      headers={["Учитель", "Дата · класс · предмет", "Причина", "Кандидаты"]}
    >
      {list.map((m) => (
        <tr key={m.self.id}>
          <td>{shortName(m.self.teacher)}</td>
          <td>
            {dateText(m.self.date)} · {m.self.className} · {m.self.subject}
          </td>
          <td>
            {m.reason}
            {projectId && (
              <label>
                Выбрать урок{" "}
                <select
                  disabled={linkBusy}
                  value=""
                  onChange={(e) => {
                    if (e.target.value)
                      void saveLink({
                        self_response_id: m.self.id,
                        lesson_response_id: Number(e.target.value),
                      });
                  }}
                >
                  <option value="">Не выбран</option>
                  {allLessonsForLinks
                    .filter((v) => v.teacherKey === m.self.teacherKey)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {lessonText(v)}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </td>
          <td>
            {m.candidates.map((c) => {
              const v = report.visits.find((v) => v.id === c.id);
              return v ? <p key={c.id}>{lessonLink(v)}</p> : null;
            })}
          </td>
        </tr>
      ))}
    </Table>
  );
  const total = detail
    ? 0
    : view === "teachers"
      ? teacherResultRows.length
      : view === "departments"
        ? departments.length
        : view === "observers"
          ? observers.length
          : view === "criteria"
            ? criteria.length
            : view === "priorities"
              ? priorities.length
              : view === "support"
                ? support.length
                : view === "discrepancies"
                  ? flags.length
                  : view === "unlinked"
                    ? unlinked.length
                    : filteredLessons.length;
  const pages = size === "all" ? 1 : Math.max(1, Math.ceil(total / size)),
    currentPage = Math.min(page, pages);
  const paged = <T,>(list: T[]) => pageRows(list, currentPage, size);
  const pagination =
    !detail && view !== "summary" ? (
      <div className="vcr-pagination">
        <button
          disabled={currentPage <= 1}
          onClick={() => update({ reportPage: String(currentPage - 1) })}
        >
          ← Назад
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1)
          .filter(
            (n) => n === 1 || n === pages || Math.abs(n - currentPage) <= 2,
          )
          .map((n, i, ns) => (
            <span key={n}>
              {i > 0 && n - ns[i - 1] > 1 ? " … " : null}
              <button
                aria-current={n === currentPage ? "page" : undefined}
                onClick={() => update({ reportPage: String(n) })}
              >
                {n}
              </button>
            </span>
          ))}
        <button
          disabled={currentPage >= pages}
          onClick={() => update({ reportPage: String(currentPage + 1) })}
        >
          Далее →
        </button>
        <label>
          Строк на странице{" "}
          <select
            value={size}
            onChange={(e) => update({ reportSize: e.target.value })}
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="all">Все</option>
          </select>
        </label>
        <span>{total} строк</span>
      </div>
    ) : null;
  async function exportExcel() {
    setExportError("");
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      const sheet = (name: string, data: Record<string, unknown>[]) =>
        XLSX.utils.book_append_sheet(
          book,
          XLSX.utils.json_to_sheet(data),
          name,
        );
      sheet(
        "Уроки",
        lessons.map((v) => ({
          ID: v.id,
          Учитель: v.teacher,
          Дата: v.date,
          Предмет: v.subject,
          Класс: v.className,
          Итог: v.score.total,
          Максимум: v.score.max,
          Доля: scorePercent(v),
          Статус: v.score.total == null ? "Предварительно" : "Полный",
        })),
      );
      sheet(
        "Нужна методическая поддержка",
        support.map((t) => ({
          Учитель: t.name,
          Кафедра: t.department,
          Среднее: t.average,
        })),
      );
      sheet(
        "Расхождения",
        flags.map((f) => ({
          Тип: DISCREPANCY_NAMES[f.type],
          Урок: f.lesson.id,
          Записи: f.participants.map((v) => v.id).join(", "),
          Основание: f.description,
          Предварительно: f.preliminary,
        })),
      );
      sheet(
        "Сверка",
        rows.flatMap((v) =>
          v.score.items.map((i) => ({
            ID: v.id,
            Учитель: v.teacher,
            Наблюдатель: v.visitor,
            Самоанализ: v.self,
            Пункт: i.code,
            Балл: i.value,
            Максимум: i.max,
            Статус: i.status,
            Метод: i.method,
            Правило: i.ruleId,
          })),
        ),
      );
      sheet(
        "Критерии урока",
        criteria.map((c) => ({
          Пункт: c.code,
          Название: c.title,
          Среднее: c.value,
          Максимум: c.max,
          Уроков: c.count,
        })),
      );
      sheet(
        "Результаты учителей",
        teacherResultRows.map((t) => ({
          Учитель: t.name,
          Кафедра: t.department,
          Группа: t.groupKey,
          Место: t.rank,
          Среднее: t.value,
          Максимум: t.maximum,
          Доля: t.percent,
          Уроков: t.count,
        })),
      );
      sheet(
        "Связи самоанализов",
        links.map((l) => ({
          Самоанализ: l.self_response_id,
          Урок: l.lesson_response_id,
          Способ: l.method,
          Подтвердил: l.confirmed_by_label || l.confirmed_by,
          Дата: l.confirmed_at,
        })),
      );
      XLSX.writeFile(book, "Пульс_аналитика.xlsx");
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Не удалось сформировать Excel",
      );
    }
  }
  return (
    <div className="vcr-dashboard">
      <header className="vcr-header">
        <h2>{heading}</h2>
        <button className="btn" onClick={() => void exportExcel()}>
          Скачать Excel · все строки
        </button>
        {detail && (
          <button
            className="btn"
            onClick={() => update({ reportTeacher: null, reportLesson: null })}
          >
            ← К списку
          </button>
        )}
      </header>
      {exportError && <p role="alert">{exportError}</p>}
      {linkError && <p role="alert">{linkError}</p>}
      {projectId && (view === "unlinked" || view === "summary") && !detail && (
        <button
          disabled={linkBusy}
          className="vcr-link"
          onClick={() => void saveLink({ mode: "automatic" })}
        >
          Привязать однозначные самоанализы по учителю и дате
        </button>
      )}
      {!detail && (
        <>
          <nav className="vcr-navigation" aria-label="Разделы аналитики">
            {Object.entries({
              summary: "Сводка",
              teachers: "Результаты учителей",
              departments: "Кафедры",
              observers: "Наблюдатели",
              criteria: "Критерии урока",
            }).map(([id, name]) => (
              <button
                key={id}
                aria-current={view === id ? "page" : undefined}
                onClick={() => update({ reportView: id, reportLevel: null })}
              >
                {name}
              </button>
            ))}
          </nav>
          <div className="vcr-filters">
            <label>
              Период{" "}
              <select
                value={period}
                onChange={(e) =>
                  update({ reportPeriod: e.target.value, reportLevel: null })
                }
              >
                <option value="week">Последняя завершённая неделя</option>
                <option value="all">За всё время</option>
                <option value="custom">Выбрать даты</option>
              </select>
            </label>
            {period === "custom" && (
              <>
                <label>
                  С{" "}
                  <input
                    type="date"
                    value={from}
                    onInput={(e) =>
                      update({ reportFrom: e.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  По{" "}
                  <input
                    type="date"
                    value={to}
                    onInput={(e) => update({ reportTo: e.currentTarget.value })}
                  />
                </label>
              </>
            )}
            <label>
              Кафедра{" "}
              <select
                value={department}
                onChange={(e) => update({ reportDepartment: e.target.value })}
              >
                <option value="">Все кафедры</option>
                {departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Итоги{" "}
              <select
                value={resultGroup}
                onChange={(e) => update({ reportGroup: e.target.value })}
              >
                <option value="all">Все группы</option>
                <option value="full">Полные из 100</option>
                <option value="reduced">С уменьшенным максимумом</option>
                <option value="preliminary">Предварительные</option>
              </select>
            </label>
            <label>
              Поиск по ФИО{" "}
              <input
                type="search"
                value={search}
                onChange={(e) => update({ reportSearch: e.target.value })}
              />
            </label>
          </div>
        </>
      )}
      {!detail && view === "summary" ? (
        <>
          <nav className="vcr-contents" aria-label="Оглавление">
            {[
              ["charts", "Диаграммы"],
              ["attention", "Критерии, требующие внимания"],
              ["priorities", "Приоритеты"],
              ["support", "Нужна методическая поддержка"],
              ["discrepancies", "Расхождения в оценках"],
              ["unlinked", "Самоанализы без урока"],
            ].map(([id, name]) => (
              <a key={id} href={`#vcr-${id}`}>
                {name}
              </a>
            ))}
          </nav>
          <div className="vcr-metrics">
            <div className="vcr-metric">
              <strong>
                {meanScore == null
                  ? "Нет полных итогов"
                  : `${displayScore(meanScore)} из 100`}
              </strong>
              <span>Средний итог гимназии</span>
              <Badge percent={meanScore} />
            </div>
            <div className="vcr-metric">
              <strong>{lessons.length}</strong>
              <span>Уникальных уроков</span>
            </div>
            <div className="vcr-metric">
              <strong>{rows.filter((v) => !v.self).length}</strong>
              <span>Наблюдений</span>
            </div>
            <div className="vcr-metric">
              <strong>{rows.filter((v) => v.self).length}</strong>
              <span>Самоанализов</span>
            </div>
          </div>
          <p>
            {fullLessonCount(
              lessons.filter((v) => v.score.total != null).length,
            )}{" "}
            · Предварительных:{" "}
            {
              lessons.filter(
                (v) => v.score.total == null && preliminaryPercent(v) != null,
              ).length
            }{" "}
            · Итог не сформирован:{" "}
            {
              lessons.filter(
                (v) => v.score.total == null && preliminaryPercent(v) == null,
              ).length
            }
          </p>
          <div id="vcr-charts" className="vcr-chart-grid">
            <LevelChart
              title="Уроки по уровням: неделя"
              rows={rows}
              dates={
                period === "all"
                  ? "За всё время"
                  : `${dateText(from)} — ${dateText(to)}`
              }
              onOpen={(label) =>
                update({ reportView: "lessons", reportLevel: label })
              }
            />
            <LevelChart
              title="Уроки по уровням: весь период"
              rows={scoped}
              dates={`${dateText("2026-09-01")} — ${dateText(report.week.today)}`}
              onOpen={(label) =>
                update({
                  reportView: "lessons",
                  reportLevel: label,
                  reportPeriod: "all",
                })
              }
            />
          </div>
          <section id="vcr-attention" className="vcr-panel">
            <h3>Критерии, требующие внимания</h3>
            <Table headers={["Блок", ...departments]}>
              {SECTION_NAMES.map((name, index) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  {departments.map((d) => {
                    const visits = lessons.filter((v) => v.department === d);
                    const blocks = visits.map((v) =>
                      v.score.items.filter(
                        (i) => i.code.startsWith(`${index + 1}.`) && !i.na,
                      ),
                    );
                    const valid = blocks.filter(
                      (items) =>
                        items.length && items.every((i) => i.value != null),
                    );
                    const value = mean(
                      valid.map((items) =>
                        items.reduce((n, i) => n + i.value!, 0),
                      ),
                    );
                    const max = valid[0]?.reduce((n, i) => n + i.max, 0);
                    const attentionItems = blocks.flatMap(signalItems);
                    const attentionMaximum = attentionItems.reduce(
                      (n, i) => n + i.max,
                      0,
                    );
                    const attention = attentionMaximum
                      ? (attentionItems.reduce((n, i) => n + i.value!, 0) /
                          attentionMaximum) *
                        100
                      : null;
                    return (
                      <td
                        key={d}
                        className={
                          attention != null && attention < 50
                            ? "vcr-attention"
                            : ""
                        }
                      >
                        {value == null
                          ? "Не оценено"
                          : `${value.toLocaleString("ru", { maximumFractionDigits: 2 })} из ${max}`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Table>
          </section>
          <section id="vcr-priorities" className="vcr-panel">
            <h3>Приоритеты</h3>
            {priorities.length ? (
              renderCriteria(priorities.slice(0, 5), true)
            ) : (
              <Empty />
            )}
            {fullList("priorities", priorities.length)}
          </section>
          <section id="vcr-support" className="vcr-panel">
            <h3>Нужна методическая поддержка</h3>
            {support.length ? renderSupport(support.slice(0, 5)) : <Empty />}
            {fullList("support", support.length)}
          </section>
          <section id="vcr-discrepancies" className="vcr-panel">
            <h3>
              Расхождения в оценках ·{" "}
              {new Set(flags.map((f) => f.lesson.id)).size} уроков
            </h3>
            <p>
              {Object.keys(DISCREPANCY_NAMES)
                .map(
                  (type) =>
                    `${DISCREPANCY_NAMES[type as keyof typeof DISCREPANCY_NAMES]}: ${new Set(flags.filter((f) => f.type === type).map((f) => f.lesson.id)).size}`,
                )
                .join(" · ")}
            </p>
            {flags.length ? renderFlags(flags.slice(0, 5)) : <Empty />}
            {fullList("discrepancies", flags.length)}
          </section>
          <section id="vcr-unlinked" className="vcr-panel">
            <h3>Самоанализы без урока</h3>
            {unlinked.length ? renderUnlinked(unlinked.slice(0, 5)) : <Empty />}
            {fullList("unlinked", unlinked.length)}
          </section>
        </>
      ) : detail ? (
        <>
          {renderLessons(lessons)}
          {flags.length > 0 && (
            <section className="vcr-panel">
              <h3>Расхождения в оценках</h3>
              {renderFlags(flags)}
            </section>
          )}
          {lessons.some(
            (v) => scorePercent(v) != null && scorePercent(v)! < 70,
          ) && <p>Нужна методическая поддержка</p>}
          {lessons.some(
            (v) =>
              v.score.total == null &&
              preliminaryPercent(v) != null &&
              preliminaryPercent(v)! < 70,
          ) && <p>Предварительно: нужна поддержка</p>}
          <section className="vcr-panel">
            <h3>Исходные ответы</h3>
            {rows.map((v) => (
              <details key={v.id}>
                <summary>
                  {v.self ? "Самоанализ" : shortName(v.visitor)} ·{" "}
                  {dateText(v.date)} · {v.subject}
                </summary>
                <p>Общая оценка: {v.ratingMapped || "Не выбрана"}</p>
                {flags
                  .filter((f) => f.participants.some((p) => p.id === v.id))
                  .map((f) => (
                    <p key={f.key}>
                      {DISCREPANCY_NAMES[f.type]}
                      {f.preliminary ? " · предварительно" : ""}
                    </p>
                  ))}
                <Score visit={v} />
                <dl className="vcr-evidence">
                  {v.score.items.map((i) => (
                    <div key={i.code}>
                      <dt>
                        {i.code} {i.title}
                      </dt>
                      <dd>
                        {i.answer || "Нет ответа"}
                        <br />
                        {i.na
                          ? "Не применимо"
                          : i.value == null
                            ? "Не оценено"
                            : `${i.value} из ${i.max}`}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p>{v.feedback}</p>
                <p>{v.practice}</p>
              </details>
            ))}
          </section>
        </>
      ) : (
        <>
          {view === "teachers" ? (
            <>
              {resultGroups.map((group) => {
                const displayed = paged(teacherResultRows).filter(
                  (row) => row.groupKey === group.key,
                );
                if (!displayed.length) return null;
                return (
                  <section className="vcr-panel" key={group.key}>
                    <h3>{group.title}</h3>
                    <Table
                      headers={[
                        "Место",
                        "Учитель",
                        "Кафедра",
                        "Средний итог",
                        "Уроков",
                      ]}
                    >
                      {displayed.map((row) => (
                        <tr key={row.key}>
                          <td>{row.rank ?? "—"}</td>
                          <td>
                            <button
                              className="vcr-link"
                              onClick={() => update({ reportTeacher: row.key })}
                            >
                              {shortName(row.name)}
                            </button>
                          </td>
                          <td>{row.department}</td>
                          <td>
                            {row.value == null ? (
                              "—"
                            ) : (
                              <>
                                {displayScore(row.value, row.maximum)} из{" "}
                                {row.maximum}
                                <Badge
                                  percent={row.percent}
                                  preliminary={group.preliminary}
                                />
                              </>
                            )}
                          </td>
                          <td>
                            {group.preliminary
                              ? `${row.count} предварительных уроков`
                              : fullLessonCount(row.count)}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </section>
                );
              })}
            </>
          ) : view === "departments" ? (
            <Table headers={["Кафедра", "Уроков", "Средний итог"]}>
              {paged(departments).map((d) => {
                const average = schoolAverage(
                  rows.filter((v) => v.department === d),
                );
                return (
                  <tr key={d}>
                    <td>
                      <button
                        className="vcr-link"
                        onClick={() =>
                          update({
                            reportView: "teachers",
                            reportDepartment: d,
                          })
                        }
                      >
                        {d}
                      </button>
                    </td>
                    <td>{lessons.filter((v) => v.department === d).length}</td>
                    <td>
                      {average == null ? (
                        "—"
                      ) : (
                        <>
                          {displayScore(average)} из 100
                          <Badge percent={average} />
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          ) : view === "observers" ? (
            <Table
              headers={[
                "Наблюдатель",
                "Наблюдений",
                "Совпадает",
                "Отличается",
                "Итог не сформирован",
                "Общая оценка не выбрана",
                "Расхождений с общей оценкой",
                "Выше",
                "Ниже",
                "Предварительные расхождения",
              ]}
            >
              {paged(observers).map((o) => {
                const own = flags.filter(
                    (f) =>
                      f.type === "А" && f.participants[0].visitor === o.name,
                  ),
                  full = own.filter((f) => !f.preliminary);
                return (
                  <tr key={o.name}>
                    <td>{shortName(o.name)}</td>
                    <td>{o.rows.length}</td>
                    <td>
                      {
                        o.rows.filter(
                          (v) =>
                            v.score.total != null &&
                            v.ratingMapped ===
                              LEVELS[levelIndex(scorePercent(v))],
                        ).length
                      }
                    </td>
                    <td>
                      {
                        o.rows.filter(
                          (v) =>
                            v.score.total != null &&
                            v.ratingMapped &&
                            v.ratingMapped !==
                              LEVELS[levelIndex(scorePercent(v))],
                        ).length
                      }
                    </td>
                    <td>
                      {o.rows.filter((v) => v.score.total == null).length}
                    </td>
                    <td>
                      {
                        o.rows.filter(
                          (v) => v.score.total != null && !v.ratingMapped,
                        ).length
                      }
                    </td>
                    <td>{full.length}</td>
                    <td>{full.filter((f) => f.direction === "выше").length}</td>
                    <td>{full.filter((f) => f.direction === "ниже").length}</td>
                    <td>{own.length - full.length}</td>
                  </tr>
                );
              })}
            </Table>
          ) : view === "criteria" ? (
            renderCriteria(paged(criteria))
          ) : view === "priorities" ? (
            renderCriteria(paged(priorities), true)
          ) : view === "support" ? (
            renderSupport(paged(support))
          ) : view === "discrepancies" ? (
            renderFlags(paged(flags))
          ) : view === "unlinked" ? (
            renderUnlinked(paged(unlinked))
          ) : (
            renderLessons(paged(filteredLessons))
          )}
          {pagination}
        </>
      )}
    </div>
  );
}
