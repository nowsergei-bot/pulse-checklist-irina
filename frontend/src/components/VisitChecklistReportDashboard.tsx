import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
  reportPersonKey,
  SECTION_NAMES,
  type ReportVisit,
} from "../lib/lessonVisitChecklist/visitChecklistReport";
import {
  COMPACT_LIST_SIZE,
  DISCREPANCY_NAMES,
  LEVEL_COLORS,
  LEVELS,
  discrepancies,
  displayScore,
  fullLessonCount,
  signalItems,
  blockAttentionPercent,
  growthCriteria,
  itemScoreText,
  itemText,
  levelIndex,
  pluralRu,
  losses,
  pageRows,
  preliminaryPercent,
  schoolAverage,
  scorePercent,
  selectReportRows,
  shortName,
  teacherResultGroups,
  UNIT_FILTER_NOT_DEFINED,
  UNIT_NOT_DEFINED,
  ATTENTION_GROUP_NAMES,
  COVERAGE_EXCLUDED_DEPARTMENT_IDS,
  DIRECTOR_PERIODS,
  attentionTeachers,
  blockPercents,
  coverageUnits,
  departmentRanking,
  directorPeriodRange,
  directorWeeks,
  isDirectorSummaryShown,
  growthZones,
  newTeacherStats,
  visitCoverage,
  weeklyArrows,
  weeklyHint,
  trimTrailingEmptyWeeks,
  weeklyScoreLine,
  lessonsWithLowItem,
  niceAxis,
  weeklyAverages,
  compactRows,
  parseTeacherSort,
  sortTeachers,
  teacherMetrics,
  TEACHER_SORTS,
  veryHighTeachers,
  type DirectorPeriod,
  type TeacherSort,
} from "../lib/lessonVisitChecklist/reportPresentation";
import {
  VCD_PDF_HIDE_CLASS,
  downloadVisitChecklistPdf,
} from "../lib/lessonVisitChecklist/visitChecklistCloudPdf";
import { PDF_CARD_KEEP_TOGETHER_CLASS } from "../lib/pdf/captureElementToPdfA4";
import {
  getLessonVisitSelfLinks,
  saveLessonVisitSelfLink,
} from "../api/visitChecklist";
import { useCabinetProfile } from "../lib/cabinet/profile";
import "./VisitChecklistReportDashboard.css";

type Props = {
  projectId?: number;
  responses: LessonVisitResponseRow[];
  checklist: LessonVisitChecklistConfig;
  directory: LessonVisitDirectory;
  /** ID учителя анкеты → подразделения из справочника сотрудников. Без него подразделения не показываются. */
  staffUnits?: Record<string, string[]>;
  /** Сервер разрешил экран «Сводка для директора» (?screen=summary); без этого признака экран не открывается. */
  directorScreen?: boolean;
  /** ID учителей справочника, отмеченных администратором как новые. */
  newTeacherIds?: string[];
  /** Узкое сохранение списка новых учителей; без него список только читается. */
  onSaveNewTeachers?: (ids: string[]) => Promise<string[]>;
  /** Адрес общей «Сводки» для ссылок из цифр; null, если у пользователя нет к ней доступа. */
  analyticsPath?: string | null;
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
/** Число и плашка уровня в одну строку с промежутком; на узком месте плашка переносится целиком под число. */
function ScoreLevel({
  text,
  percent,
  preliminary = false,
}: {
  text: string;
  percent: number | null;
  preliminary?: boolean;
}) {
  return (
    <span className="vcr-scorecell">
      <span className="vcr-scorecell__value">{text}</span>
      <Badge percent={percent} preliminary={preliminary} />
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
      <ScoreLevel
        text={`${displayScore(value, maximum)} из ${maximum}`}
        percent={scorePercent(visit) ?? preliminaryPercent(visit)}
        preliminary={!full}
      />
      {!full && <small>Предварительно</small>}
      {visit.score.mixedApplicability && <small>Разная применимость</small>}
    </>
  );
}
function Empty() {
  return <p className="vcr-empty">В выбранном отборе данных нет.</p>;
}
/** Кнопка под списком, где строк больше пяти: раскрывает остальные на месте и сворачивает обратно. */
function ListToggle({
  total,
  open,
  onToggle,
}: {
  total: number;
  open: boolean;
  onToggle: () => void;
}) {
  if (total <= COMPACT_LIST_SIZE) return null;
  return (
    <button
      type="button"
      className={`vcr-link vcr-toggle ${VCD_PDF_HIDE_CLASS}`}
      aria-expanded={open}
      onClick={onToggle}
    >
      {open ? "Свернуть" : `Показать всех (${total})`}
    </button>
  );
}
function SortSelect({
  value,
  onChange,
}: {
  value: TeacherSort;
  onChange: (value: TeacherSort) => void;
}) {
  const selected = TEACHER_SORTS.find((s) => s.id === value)?.label ?? "";
  return (
    <label className={`vcr-sort ${VCD_PDF_HIDE_CLASS}`}>
      <span>Сортировка</span>
      <span className="vcr-sort__box" data-value={selected}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as TeacherSort)}
        >
          {TEACHER_SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
function Table({
  headers,
  children,
  stack = false,
  fit = false,
}: {
  headers: string[];
  children: React.ReactNode;
  /** Таблица помещается в карточку целиком: колонки сжимаются, текст переносится. */
  fit?: boolean;
  /** На узком экране каждая строка превращается в карточку «подпись: значение» (в ячейках нужен data-label). */
  stack?: boolean;
}) {
  return (
    <div
      className={`vcr-table-scroll${fit ? " vcr-table-scroll--fit" : ""}`}
      tabIndex={0}
    >
      <table className={stack ? "vcr-stack" : undefined}>
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
  const { top, ticks } = niceAxis(
      Math.max(1, ...series.map((s) => s.full + s.partial)),
    ),
    without = lessons.filter(
      (v) => levelIndex(scorePercent(v) ?? preliminaryPercent(v)) < 0,
    ).length;
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
          <div className="vcr-chart-ticks">
            {ticks.map((n) => (
              <span key={n} style={{ bottom: `${(n / top) * 100}%` }}>
                {n}
              </span>
            ))}
          </div>
        </div>
        {series.map((s) => (
          <button
            key={s.label}
            className="vcr-chart-column"
            onClick={() => onOpen(s.label)}
            aria-label={`${s.label}: ${s.full} полных и ${s.partial} предварительных уроков`}
          >
            <span>
              {s.partial > 0 ? `${s.full} + ${s.partial}` : s.full}
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

type DirectorProps = {
  report: ReturnType<typeof withSelfAnalysisLinks>;
  directory: LessonVisitDirectory;
  staffUnits?: Record<string, string[]>;
  newTeacherIds?: string[];
  onSaveNewTeachers?: (ids: string[]) => Promise<string[]>;
  analyticsPath?: string | null;
};
const generatedText = (date: Date) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
function PercentBar({
  percent,
  label,
}: {
  percent: number | null;
  label: string;
}) {
  const index = levelIndex(percent);
  return (
    <div className="vcr-bar" role="img" aria-label={label}>
      <div
        className="vcr-bar__fill"
        style={{
          width: `${Math.max(0, Math.min(100, percent ?? 0))}%`,
          backgroundColor: index >= 0 ? LEVEL_COLORS[index] : "#c8d3cf",
        }}
      />
    </div>
  );
}
function DirectorSummary({
  report,
  directory,
  staffUnits,
  newTeacherIds,
  onSaveNewTeachers,
  analyticsPath,
}: DirectorProps) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pdfRef = useRef<HTMLDivElement>(null);
  const [generatedAt, setGeneratedAt] = useState(() => new Date());
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedIds, setSavedIds] = useState<string[] | null>(null);
  const listedIds = savedIds ?? newTeacherIds;
  const period: DirectorPeriod =
    DIRECTOR_PERIODS.find((p) => p.id === params.get("directorPeriod"))?.id ??
    "week";
  const range = directorPeriodRange(period, report.week);
  const data = useMemo(() => {
    const rows = range
      ? report.visits.filter((v) => v.date >= range.from && v.date <= range.to)
      : [];
    const teachers = report.teachers.map((t) => ({
      ...t,
      rows: rows.filter((v) => v.teacherKey === t.key),
    }));
    const attention = attentionTeachers(teachers);
    const newIds = new Set(listedIds || []);
    const newKeys = new Set(
      directory.teachers
        .filter((t) => newIds.has(t.id))
        .map((t) => reportPersonKey(t.name)),
    );
    const weeks = directorWeeks(
      period,
      range ?? { from: report.week.start, to: report.week.end },
      report.week,
    );
    return {
      rows,
      teachers,
      newKeys,
      lessons: lessonObservations(rows),
      average: schoolAverage(rows),
      series: trimTrailingEmptyWeeks(
        weeklyAverages(report.visits, weeks, period === "week" ? undefined : range ?? undefined),
      ),
      attention,
      coverage: visitCoverage(report.teachers, directory, {
        from: range?.from,
        to: range?.to,
        staffUnits,
      }),
      blocks: blockPercents(rows),
      zones: growthZones(rows),
      departments: departmentRanking(teachers, attention),
      news: newTeacherStats(report.teachers, directory, listedIds, rows, attention, {
        from: range?.from,
        to: range?.to,
      }),
    };
  }, [report, directory, staffUnits, listedIds, period, range?.from, range?.to]);
  const groupA = data.attention.filter((t) => t.group === "A");
  const groupB = data.attention.filter((t) => t.group === "B");
  const metricsByKey = useMemo(
    () => new Map(data.teachers.map((t) => [t.key, teacherMetrics(t.rows)])),
    [data.teachers],
  );
  const metricsOf = (t: { key: string; rows: ReportVisit[] }) =>
    metricsByKey.get(t.key) ?? teacherMetrics(t.rows);
  const isNewTeacher = (t: { key: string }) => data.newKeys.has(t.key);
  const veryHigh = veryHighTeachers(data.teachers);
  const newRows = data.teachers.filter((t) => data.newKeys.has(t.key));
  // Сортировка живёт в адресе страницы, поэтому не сбрасывается при смене периода.
  const sortOf = (name: string, fallback: TeacherSort) =>
    parseTeacherSort(params.get(name), fallback);
  const setSort = (name: string, fallback: TeacherSort) => (value: TeacherSort) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(name);
    else next.set(name, value);
    setParams(next);
  };
  const sortAttention = sortOf("directorSortAttention", "worst"),
    sortTop = sortOf("directorSortTop", "best"),
    sortNew = sortOf("directorSortNew", "alpha");
  const attentionList = sortTeachers(groupA, sortAttention, metricsOf, isNewTeacher);
  const topList = sortTeachers(veryHigh, sortTop, metricsOf, isNewTeacher);
  const newList = sortTeachers(newRows, sortNew, metricsOf, isNewTeacher);
  // Списки длиннее пяти строк раскрываются на месте; в PDF всегда выводятся полностью.
  const [openLists, setOpenLists] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => pdfBusy || Boolean(openLists[id]);
  const toggleList = (id: string) =>
    setOpenLists((current) => ({ ...current, [id]: !current[id] }));
  const href = (view: string) =>
    analyticsPath && range
      ? `${analyticsPath}?reportPeriod=custom&reportFrom=${range.from}&reportTo=${range.to}&reportView=${view}`
      : null;
  /**
   * Куда ведёт строка: подробности в полной аналитике за тот же период. Без права на отдельную страницу аналитики
   * открывается полная аналитика этой же страницы (адрес без ?screen=summary).
   */
  const detailTo = (extra: Record<string, string>) => {
    if (!range) return null;
    const query = new URLSearchParams({
      reportPeriod: "custom",
      reportFrom: range.from,
      reportTo: range.to,
      ...extra,
    });
    return `${analyticsPath ?? pathname}?${query.toString()}`;
  };
  /**
   * Куда ведёт строка учителя: единичный результат открывает сразу полный чек-лист этого урока, иначе карточка учителя.
   * Учитель без посещений ссылки не имеет: открывать нечего.
   */
  const teacherTo = (t: { key: string; rows: ReportVisit[] }) => {
    const lessons = lessonObservations(t.rows);
    if (!lessons.length) return null;
    const full = lessons.filter((v) => scorePercent(v) != null);
    return detailTo(
      full.length === 1
        ? { reportLesson: String(full[0].id) }
        : { reportTeacher: t.key },
    );
  };
  /** Строка целиком кликабельна (подсветка при наведении); ссылка внутри нужна для клавиатуры и открытия в новой вкладке. */
  const clickable = (to: string | null) =>
    to
      ? {
          className: "vcr-row-link",
          onClick: (e: React.MouseEvent) => {
            if (!(e.target as HTMLElement).closest("a,button")) navigate(to);
          },
        }
      : {};
  const rowName = (to: string | null, children: React.ReactNode) =>
    to ? (
      <Link className="vcr-rowlink" to={to}>
        {children}
      </Link>
    ) : (
      <>{children}</>
    );
  const linked = (
    view: string,
    children: React.ReactNode,
    button = false,
  ) => {
    const to = href(view);
    return to ? (
      <Link
        className={`${button ? "vcr-action vcr-metric__button" : "vcr-link"} ${VCD_PDF_HIDE_CLASS}`}
        to={to}
      >
        {children}
      </Link>
    ) : button ? null : (
      <>{children}</>
    );
  };
  const selectable = directory.teachers
    .filter((t) => !COVERAGE_EXCLUDED_DEPARTMENT_IDS.includes(t.departmentId))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const matching = selectable.filter(
    (t) =>
      !query ||
      t.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")),
  );
  const shown = matching.slice(0, 40);
  const nameById = new Map(directory.teachers.map((t) => [t.id, t.name]));
  async function downloadPdf() {
    if (!pdfRef.current || !range) return;
    setPdfBusy(true);
    setPdfError("");
    setGeneratedAt(new Date());
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      await downloadVisitChecklistPdf(
        pdfRef.current,
        `Сводка_для_директора_${range.from}_${range.to}.pdf`,
      );
    } catch (error) {
      setPdfError(
        error instanceof Error ? error.message : "Не удалось сформировать PDF",
      );
    } finally {
      setPdfBusy(false);
    }
  }
  async function exportDirectorExcel() {
    if (!range) return;
    setPdfError("");
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      const sheet = (name: string, rows: Record<string, unknown>[]) =>
        XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), name);
      sheet("Сводка", [
        { Показатель: "Период", Значение: `${dateText(range.from)}-${dateText(range.to)}` },
        { Показатель: "Средний итог гимназии", Значение: data.average },
        { Показатель: "Итоги по неделям", Значение: weeklyArrows(data.series) },
        { Показатель: "Посещено учителей", Значение: data.coverage.visited },
        { Показатель: "Всего учителей в охвате", Значение: data.coverage.total },
        { Показатель: "Посещено уроков", Значение: data.lessons.length },
        { Показатель: "Наблюдений", Значение: data.rows.filter((v) => !v.self).length },
        { Показатель: ATTENTION_GROUP_NAMES.A, Значение: groupA.length },
        { Показатель: ATTENTION_GROUP_NAMES.B, Значение: groupB.length },
      ]);
      sheet(
        "Блоки",
        data.blocks.map((b) => ({ Блок: b.name, "% от максимума": b.percent, Занижен: b.understated ? "да" : "" })),
      );
      sheet(
        "Кафедры",
        data.departments.map((d) => ({
          Кафедра: d.department,
          Учителей: d.teachers,
          Уроков: d.lessons,
          "Средний итог": d.average,
          [ATTENTION_GROUP_NAMES.A]: d.a,
          [ATTENTION_GROUP_NAMES.B]: d.b,
        })),
      );
      sheet(
        "Зоны роста",
        data.zones.map((z) => ({ Пункт: z.code, Название: z.title, "% от максимума": z.percent, Пояснение: [z.note, z.noteExtra].filter(Boolean).join(". ") })),
      );
      sheet(
        "Группы А и Б",
        data.attention.map((t) => ({
          Группа: ATTENTION_GROUP_NAMES[t.group],
          Учитель: t.name,
          Кафедра: t.department,
          "Средний итог": t.average,
          "Полных уроков": t.fullLessons,
          "Ниже 70": t.below70,
          Повторяемость: t.repeat,
        })),
      );
      sheet("Новые учителя", [
        { Показатель: "Список задан", Значение: news.configured ? "да" : "нет" },
        { Показатель: "Посещено", Значение: news.visited },
        { Показатель: "Всего", Значение: news.total },
        { Показатель: "Средний итог новых", Значение: news.averageNew },
        { Показатель: "Средний итог остальных", Значение: news.averageOthers },
        { Показатель: "С уроками ниже 70", Значение: news.below70 },
        { Показатель: "Не посещены", Значение: news.notVisited.map((t) => t.name).join(", ") },
      ]);
      XLSX.writeFile(book, `Сводка_для_директора_${range.from}_${range.to}.xlsx`);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Не удалось сформировать Excel");
    }
  }
  async function saveNew() {
    if (!onSaveNewTeachers) return;
    setSaveBusy(true);
    setSaveMessage("");
    try {
      setSavedIds(await onSaveNewTeachers(chosen));
      setSaveMessage("Сохранено");
      setEditing(false);
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : "Не удалось сохранить список",
      );
    } finally {
      setSaveBusy(false);
    }
  }
  const keep = `vcr-panel ${PDF_CARD_KEEP_TOGETHER_CLASS}`;
  const { news } = data;
  return (
    <div
      className={`vcr-dashboard vcr-director${pdfBusy ? " vcr-director--pdf" : ""}`}
      ref={pdfRef}
    >
      <header className={`vcr-header vcr-header--director ${PDF_CARD_KEEP_TOGETHER_CLASS}`}>
        <div>
          <h2>Сводка для директора</h2>
          <p>
            {range
              ? `${dateText(range.from)}-${dateText(range.to)}`
              : "Период ещё не завершён"}{" "}
            · сформировано {generatedText(generatedAt)}
          </p>
        </div>
        <div className={`vcr-director__controls ${VCD_PDF_HIDE_CLASS}`}>
          <div className="vcr-segment" role="group" aria-label="Период">
            {DIRECTOR_PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === period}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  if (p.id === "week") next.delete("directorPeriod");
                  else next.set("directorPeriod", p.id);
                  setParams(next);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            className="vcr-action"
            type="button"
            disabled={pdfBusy || !range}
            onClick={() => void downloadPdf()}
          >
            {pdfBusy ? "Готовим PDF…" : "Скачать PDF"}
          </button>
          <button
            className="vcr-action"
            type="button"
            disabled={!range}
            onClick={() => void exportDirectorExcel()}
          >
            Скачать Excel
          </button>
        </div>
      </header>
      {pdfError && <p role="alert">{pdfError}</p>}
      {!range ? (
        <section className="vcr-panel">
          <p className="vcr-empty">
            Календарный месяц после начала учебного года ещё не завершён. Выберите «Неделя» или «Учебный год».
          </p>
        </section>
      ) : (
        <>
          <div className="vcr-metrics">
            <div className="vcr-metric">
              <strong>
                {data.average == null
                  ? "Нет полных итогов"
                  : `${displayScore(data.average)} из 100`}
              </strong>
              <span>Средний итог гимназии</span>
              <Badge percent={data.average} />
              {data.series.length ? (
                <span
                  className={`vcr-arrows${data.series.length > 4 ? " vcr-arrows--long" : ""}`}
                  title={weeklyHint(data.series)}
                >
                  {weeklyScoreLine(data.series)}
                </span>
              ) : null}
            </div>
            <div className="vcr-metric">
              <strong className="vcr-metric__nowrap">
                {data.coverage.visited} из {data.coverage.total}
              </strong>
              <span>Посещено учителей</span>
              {linked("not_visited", "Кто не посещён", true)}
            </div>
            <div className="vcr-metric">
              <strong>{data.lessons.length}</strong>
              <span>Посещено уроков</span>
              {linked("lessons", "Все уроки", true)}
            </div>
            <div className="vcr-metric">
              <strong>{data.rows.filter((v) => !v.self).length}</strong>
              <span>Наблюдений</span>
            </div>
            <div className="vcr-metric">
              <strong>{groupA.length}</strong>
              <span>Требуют внимания</span>
              {groupB.length ? (
                <span>
                  и ещё {groupB.length}{" "}
                  {pluralRu(groupB.length, ["учитель", "учителя", "учителей"])}{" "}
                  с отдельными уроками ниже 70
                </span>
              ) : null}
              {linked("support", "Список", true)}
            </div>
          </div>
          <section className={keep}>
            <div className="vcr-head">
              <h3>
                Требуют внимания: {groupA.length}{" "}
                {pluralRu(groupA.length, ["учитель", "учителя", "учителей"])}
              </h3>
              {groupA.length ? (
                <SortSelect
                  value={sortAttention}
                  onChange={setSort("directorSortAttention", "worst")}
                />
              ) : null}
            </div>
            {groupA.length ? (
              <>
                <Table
                  stack
                  headers={["Учитель", "Кафедра", "Средний итог", "Повторяемость"]}
                >
                  {compactRows(attentionList, isOpen("attention")).map((t) => {
                    const to = teacherTo(t);
                    return (
                      <tr key={t.key} {...clickable(to)}>
                        <td className="vcr-stack__title">
                          {rowName(to, shortName(t.name))}
                        </td>
                        <td data-label="Кафедра">{t.department}</td>
                        <td data-label="Средний итог">
                          {t.average != null && (
                            <ScoreLevel
                              text={`${displayScore(t.average)} из 100`}
                              percent={t.average}
                            />
                          )}
                        </td>
                        <td data-label="Повторяемость">{t.repeat}</td>
                      </tr>
                    );
                  })}
                </Table>
                <ListToggle
                  total={attentionList.length}
                  open={isOpen("attention")}
                  onToggle={() => toggleList("attention")}
                />
              </>
            ) : (
              <Empty />
            )}
            {linked(
              "support",
              groupB.length
                ? `Все ${groupA.length} и ещё ${groupB.length} ${pluralRu(groupB.length, ["учитель", "учителя", "учителей"])} с отдельными уроками ниже 70 →`
                : `Все ${groupA.length} →`,
            )}
          </section>
          <section className={keep}>
            <div className="vcr-head">
              <h3>
                Очень высокий уровень: {veryHigh.length}{" "}
                {pluralRu(veryHigh.length, ["учитель", "учителя", "учителей"])}
              </h3>
              {veryHigh.length ? (
                <SortSelect
                  value={sortTop}
                  onChange={setSort("directorSortTop", "best")}
                />
              ) : null}
            </div>
            <p className="vcr-note">
              средний итог по полным урокам от 85% доступного максимума
            </p>
            {veryHigh.length ? (
              <>
                <Table
                  stack
                  headers={["Учитель", "Кафедра", "Средний итог", "Полных уроков"]}
                >
                  {compactRows(topList, isOpen("top")).map((t) => {
                    const to = teacherTo(t);
                    return (
                      <tr key={t.key} {...clickable(to)}>
                        <td className="vcr-stack__title">
                          {rowName(to, shortName(t.name))}
                        </td>
                        <td data-label="Кафедра">{t.department}</td>
                        <td data-label="Средний итог">
                          <ScoreLevel
                            text={`${displayScore(t.average)} из 100`}
                            percent={t.average}
                          />
                        </td>
                        <td data-label="Полных уроков">
                          {t.fullLessons}
                          {t.single && <small>единичный результат</small>}
                        </td>
                      </tr>
                    );
                  })}
                </Table>
                <ListToggle
                  total={topList.length}
                  open={isOpen("top")}
                  onToggle={() => toggleList("top")}
                />
              </>
            ) : (
              <Empty />
            )}
          </section>
          <section className={keep}>
            <div className="vcr-head">
              <h3>Новые учителя</h3>
              {newList.length > 0 ? (
                <SortSelect
                  value={sortNew}
                  onChange={setSort("directorSortNew", "alpha")}
                />
              ) : null}
            </div>
            {news.configured ? (
              <>
                <p>
                  Посещено {news.visited} из {news.total}
                </p>
                <p>
                  Средний итог новых:{" "}
                  {news.averageNew == null ? (
                    "нет полных итогов"
                  ) : (
                    <ScoreLevel
                      text={`${displayScore(news.averageNew)} из 100`}
                      percent={news.averageNew}
                    />
                  )}
                </p>
                <p>
                  Средний итог остальных:{" "}
                  {news.averageOthers == null ? (
                    "нет полных итогов"
                  ) : (
                    <ScoreLevel
                      text={`${displayScore(news.averageOthers)} из 100`}
                      percent={news.averageOthers}
                    />
                  )}
                </p>
                <p>С уроками ниже 70: {news.below70}</p>
                <p>
                  Не посещены:{" "}
                  {news.notVisited.length
                    ? news.notVisited.map((t) => shortName(t.name)).join(", ")
                    : "все посещены"}
                </p>
                {newList.length > 0 && (
                  <>
                    <Table
                      stack
                      headers={["Учитель", "Кафедра", "Средний итог", "Уроков"]}
                    >
                      {compactRows(newList, isOpen("new")).map((t) => {
                        const to = teacherTo(t);
                        const metrics = metricsOf(t);
                        return (
                          <tr key={t.key} {...clickable(to)}>
                            <td className="vcr-stack__title">
                              {rowName(to, shortName(t.name))}
                            </td>
                            <td data-label="Кафедра">{t.department}</td>
                            <td data-label="Средний итог">
                              {metrics.average != null ? (
                                <ScoreLevel
                                  text={`${displayScore(metrics.average)} из 100`}
                                  percent={metrics.average}
                                />
                              ) : metrics.visits ? (
                                "Итог не сформирован"
                              ) : (
                                "Не посещён"
                              )}
                            </td>
                            <td data-label="Уроков">{metrics.visits}</td>
                          </tr>
                        );
                      })}
                    </Table>
                    <ListToggle
                      total={newList.length}
                      open={isOpen("new")}
                      onToggle={() => toggleList("new")}
                    />
                  </>
                )}
              </>
            ) : (
              <p className="vcr-empty">Список новых учителей не задан.</p>
            )}
            {onSaveNewTeachers && (
              <div className={VCD_PDF_HIDE_CLASS}>
                {!editing ? (
                  <button
                    className="vcr-action"
                    type="button"
                    onClick={() => {
                      setChosen([...(listedIds || [])]);
                      setSaveMessage("");
                      setEditing(true);
                    }}
                  >
                    Изменить список
                  </button>
                ) : (
                  <div className="vcr-editor">
                    <label>
                      Поиск по ФИО{" "}
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <ul className="vcr-editor__list">
                      {shown.map((t) => (
                        <li key={t.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={chosen.includes(t.id)}
                              onChange={(e) =>
                                setChosen(
                                  e.target.checked
                                    ? [...chosen, t.id]
                                    : chosen.filter((id) => id !== t.id),
                                )
                              }
                            />{" "}
                            {t.name}
                          </label>
                        </li>
                      ))}
                    </ul>
                    {matching.length > shown.length && (
                      <small>Показаны первые 40, уточните поиск.</small>
                    )}
                    <p>
                      Выбрано: {chosen.length}
                      {chosen.length > 0 &&
                        ` · ${chosen
                          .map((id) => shortName(nameById.get(id) || ""))
                          .filter(Boolean)
                          .join(", ")}`}
                    </p>
                    <div className="vcr-editor__actions">
                    <button
                      className="vcr-action vcr-action--primary"
                      type="button"
                      disabled={saveBusy}
                      onClick={() => void saveNew()}
                    >
                      {saveBusy ? "Сохраняем…" : "Сохранить"}
                    </button>
                    <button
                      className="vcr-action"
                      type="button"
                      disabled={saveBusy}
                      onClick={() => setEditing(false)}
                    >
                      Отмена
                    </button>
                    </div>
                  </div>
                )}
                {saveMessage && <p role="status">{saveMessage}</p>}
              </div>
            )}
          </section>
          <div className={PDF_CARD_KEEP_TOGETHER_CLASS}>
            <LevelChart
              title="Уроки по уровням"
              rows={data.rows}
              dates={`${dateText(range.from)}-${dateText(range.to)}`}
              onOpen={(label) => {
                const to = href("lessons");
                if (to) navigate(`${to}&reportLevel=${encodeURIComponent(label)}`);
              }}
            />
          </div>
          <section className={keep}>
            <h3>Блоки чек-листа</h3>
            <p className="vcr-note">% от максимума по гимназии, цвет по уровню</p>
            <div className="vcr-bars">
              {compactRows(data.blocks, isOpen("blocks")).map((block) => (
                <div className="vcr-bars__row" key={block.name}>
                  <div className="vcr-bars__name">
                    {block.name}
                    {block.understated && <sup>*</sup>}
                    {block.understated && (
                      <small>
                        * занижен пунктами, которые пока оцениваются по минимальному уровню
                      </small>
                    )}
                  </div>
                  <PercentBar
                    percent={block.percent}
                    label={`${block.name}: ${block.percent == null ? "нет данных" : displayScore(block.percent) + "%"}`}
                  />
                  <strong>
                    {block.percent == null ? "нет данных" : `${displayScore(block.percent)}%`}
                  </strong>
                </div>
              ))}
            </div>
            <ListToggle
              total={data.blocks.length}
              open={isOpen("blocks")}
              onToggle={() => toggleList("blocks")}
            />
          </section>
          <section className={keep}>
            <h3>Кафедры</h3>
            {data.departments.length ? (
              <Table
                stack
                headers={[
                  "Кафедра",
                  "Учителей",
                  "Уроков",
                  "Средний итог",
                  ATTENTION_GROUP_NAMES.A,
                  ATTENTION_GROUP_NAMES.B,
                ]}
              >
                {compactRows(data.departments, isOpen("departments")).map((d) => {
                  const to = detailTo({
                    reportView: "teachers",
                    reportDepartment: d.department,
                  });
                  return (
                    <tr key={d.department} {...clickable(to)}>
                      <th scope="row" className="vcr-stack__title">
                        {rowName(to, d.department)}
                      </th>
                      <td data-label="Учителей">{d.teachers}</td>
                      <td data-label="Уроков">{d.lessons}</td>
                      <td data-label="Средний итог">
                        {d.average == null ? (
                          "нет данных"
                        ) : (
                          <ScoreLevel
                            text={`${displayScore(d.average)} из 100`}
                            percent={d.average}
                          />
                        )}
                      </td>
                      <td data-label={ATTENTION_GROUP_NAMES.A}>{d.a || "—"}</td>
                      <td data-label={ATTENTION_GROUP_NAMES.B}>{d.b || "—"}</td>
                    </tr>
                  );
                })}
              </Table>
            ) : (
              <Empty />
            )}
            <ListToggle
              total={data.departments.length}
              open={isOpen("departments")}
              onToggle={() => toggleList("departments")}
            />
          </section>
          <section className={keep}>
            <h3>Зоны роста</h3>
            {data.zones.length ? (
              <div className="vcr-bars">
                {compactRows(data.zones, isOpen("zones")).map((zone) => {
                  const to = detailTo({
                    reportView: "lessons",
                    reportCriterion: zone.code,
                  });
                  return (
                  <div
                    className={`vcr-bars__row${to ? " vcr-bars__row--link" : ""}`}
                    key={zone.code}
                    {...(to
                      ? {
                          onClick: (e: React.MouseEvent) => {
                            if (!(e.target as HTMLElement).closest("a")) navigate(to);
                          },
                        }
                      : {})}
                  >
                    <div className="vcr-bars__name">
                      {rowName(to, `${zone.code} ${zone.title}`)}
                      {zone.note && <small>{zone.note}</small>}
                      {zone.noteExtra && <small>{zone.noteExtra}</small>}
                    </div>
                    <PercentBar
                      percent={zone.percent}
                      label={`${zone.code} ${zone.title}: ${displayScore(zone.percent)}%`}
                    />
                    <strong>{displayScore(zone.percent)}%</strong>
                  </div>
                  );
                })}
              </div>
            ) : (
              <Empty />
            )}
            <ListToggle
              total={data.zones.length}
              open={isOpen("zones")}
              onToggle={() => toggleList("zones")}
            />
          </section>
        </>
      )}
    </div>
  );
}

export default function VisitChecklistReportDashboard({
  responses,
  projectId,
  checklist,
  directory,
  staffUnits,
  directorScreen,
  newTeacherIds,
  onSaveNewTeachers,
  analyticsPath,
  now,
}: Props) {
  const [params, setParams] = useSearchParams();
  const { user: profileUser } = useCabinetProfile();
  const canLinkAll = Boolean(profileUser?.permissions?.includes("*"));
  const currentParams = useRef(params);
  currentParams.current = params;
  const [exportError, setExportError] = useState("");
  const [links, setLinks] = useState<SavedSelfLink[]>([]);
  const [linkError, setLinkError] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [openLists, setOpenLists] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => Boolean(openLists[id]);
  const toggleList = (id: string) =>
    setOpenLists((current) => ({ ...current, [id]: !current[id] }));
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
    level = params.get("reportLevel") || "",
    criterionCode = params.get("reportCriterion") || "";
  const page = Math.max(
      1,
      Number.parseInt(params.get("reportPage") || "1", 10) || 1,
    ),
    size =
      params.get("reportSize") === "all"
        ? "all"
        : params.get("reportSize") === "100"
          ? 100
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
  // Нужна методическая поддержка = «Требуют внимания» (А) + «Есть уроки ниже 70» (Б).
  const support = attentionTeachers(teachers);
  // Сортировка живёт в адресе страницы, поэтому не сбрасывается при смене периода и фильтров.
  const sortOf = (name: string, fallback: TeacherSort) =>
    parseTeacherSort(params.get(name), fallback);
  const setSort = (name: string, fallback: TeacherSort) => (value: TeacherSort) =>
    update({ [name]: value === fallback ? null : value });
  const sortSupport = sortOf("reportSortSupport", "worst"),
    sortTop = sortOf("reportSortTop", "best"),
    sortResults = sortOf("reportSortTeachers", "best");
  const metricsByKey = new Map(
    report.teachers.map((t) => [t.key, teacherMetrics(rows.filter((v) => v.teacherKey === t.key))]),
  );
  const metricsOf = (t: { key: string }) =>
    metricsByKey.get(t.key) ?? teacherMetrics([]);
  const newKeys = new Set(
    directory.teachers
      .filter((t) => (newTeacherIds || []).includes(t.id))
      .map((t) => reportPersonKey(t.name)),
  );
  const isNewTeacher = (t: { key: string }) => newKeys.has(t.key);
  // «Нужна методическая поддержка»: группы А и Б остаются на своих местах, сортировка идёт внутри группы.
  const supportList = (["A", "B"] as const).flatMap((group) =>
    sortTeachers(
      support.filter((t) => t.group === group),
      sortSupport,
      metricsOf,
      isNewTeacher,
    ),
  );
  // Группы итогов (в том числе предварительные) остаются как есть, сортировка идёт внутри группы по итогу группы.
  const sortedResultGroups = resultGroups.map((group) => ({
    ...group,
    rows: sortTeachers(
      group.rows,
      sortResults,
      metricsOf,
      isNewTeacher,
      (row) => row.percent,
    ),
  }));
  const shownResultRows = sortedResultGroups.flatMap((group) =>
    group.rows.map((row) => ({ ...row, groupKey: group.key })),
  );
  // «Критерии, требующие внимания»: блоки от самого низкого результата к высокому, без данных в конце.
  const attentionBlocks = blockPercents(rows)
    .map((block, index) => ({ name: block.name, index, percent: block.percent }))
    .sort(
      (a, b) =>
        (a.percent ?? Infinity) - (b.percent ?? Infinity) || a.index - b.index,
    );
  const veryHigh = veryHighTeachers(teachers);
  const topList = sortTeachers(veryHigh, sortTop, metricsOf, isNewTeacher);
  const allLessonsForLinks = lessonObservations(report.visits);
  const selfMatches = selfMatchReport(report.visits);
  const unlinked = selfMatches
    .filter((m) => rows.some((v) => v.id === m.self.id) && !m.lesson)
    .sort((a, b) => a.self.date.localeCompare(b.self.date));
  // Сколько самоанализов однозначно привязываются к уроку того же учителя в тот же день.
  const sameDayLinkable = selfMatches.filter(
    (m) =>
      !m.lesson &&
      m.self.linkedLessonId == null &&
      allLessonsForLinks.filter(
        (o) => o.teacherKey === m.self.teacherKey && o.date === m.self.date,
      ).length === 1,
  ).length;
  const confirmLinkAll = () => {
    if (!sameDayLinkable) return;
    const words =
      sameDayLinkable % 10 === 1 && sameDayLinkable % 100 !== 11
        ? ["самоанализ", "уроку"]
        : sameDayLinkable % 10 >= 2 &&
            sameDayLinkable % 10 <= 4 &&
            (sameDayLinkable % 100 < 12 || sameDayLinkable % 100 > 14)
          ? ["самоанализа", "урокам"]
          : ["самоанализов", "урокам"];
    if (
      window.confirm(
        `Привязать ${sameDayLinkable} ${words[0]} к ${words[1]} того же учителя в тот же день?`,
      )
    )
      void saveLink({ mode: "automatic" });
  };
  const linkAllButton =
    projectId && canLinkAll ? (
      <div className={`vcr-selflink ${VCD_PDF_HIDE_CLASS}`}>
        <button
          type="button"
          disabled={linkBusy || !sameDayLinkable}
          className="vcr-action"
          onClick={confirmLinkAll}
        >
          Привязать однозначные самоанализы по учителю и дате
        </button>
      </div>
    ) : null;
  const departments = [
    ...new Set(report.teachers.map((t) => t.department)),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  const unit = params.get("reportUnit") || "";
  const unitOptions = coverageUnits(directory, staffUnits);
  const showUnits = unitOptions.length > 0;
  const coverage = visitCoverage(report.teachers, directory, {
    from: period === "all" ? null : from,
    to: period === "all" ? null : to,
    department,
    unit,
    staffUnits,
  });
  const notVisited = coverage.notVisited.filter(
    (t) =>
      !search ||
      t.name.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")),
  );
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
  const priorities = growthCriteria(criteria);
  // Переход из «Зон роста» сводки директора: уроки, где пункт набран не полностью, сначала самые слабые.
  const criterionQuestion = criterionCode
    ? checklist.sections
        .flatMap((s) => s.questions)
        .find((q) => q.code === criterionCode)
    : undefined;
  const byLevel = (list: ReportVisit[]) =>
    list.filter(
      (v) =>
        !level ||
        LEVELS[levelIndex(scorePercent(v) ?? preliminaryPercent(v))] === level,
    );
  const filteredLessons = criterionCode
    ? byLevel(lessonsWithLowItem(lessons, criterionCode))
    : byLevel(lessons).sort((a, b) => b.date.localeCompare(a.date));
  const observers = [
    ...new Set(rows.filter((v) => !v.self).map((v) => v.visitor)),
  ].map((name) => ({
    name,
    rows: rows.filter((v) => !v.self && v.visitor === name),
  }));
  const detail = Boolean(teacher || lessonId);
  const needsSupport = lessons.some(
    (v) => scorePercent(v) != null && scorePercent(v)! < 70,
  );
  const needsPreliminarySupport = lessons.some(
    (v) =>
      v.score.total == null &&
      preliminaryPercent(v) != null &&
      preliminaryPercent(v)! < 70,
  );
  const heading = selectedLesson
    ? lessonText(selectedLesson)
    : teacher
      ? teachers.find((t) => t.key === teacher)?.name || "Карточка учителя"
      : view === "lessons" && criterionCode
        ? `Уроки с низким баллом по пункту ${criterionCode}`
        : (
          {
            summary: "Сводка",
            teachers: "Результаты учителей",
            departments: "Кафедры",
            observers: "Наблюдатели",
            criteria: "Критерии урока",
            priorities: "Зоны роста",
            support: "Нужна методическая поддержка",
            discrepancies: "Расхождения в оценках",
            unlinked: "Самоанализы без урока",
            not_visited: "Не посещены за период",
            lessons: "Уроки",
          } as Record<string, string>
        )[view] || "Сводка";
  const lessonLink = (v: ReportVisit) => (
    <button className="vcr-link" onClick={() => openLesson(v)}>
      {lessonText(v)}
    </button>
  );
  const renderLessons = (
    visits: ReportVisit[],
    itemCode = "",
    withSelf = true,
  ) => (
    <Table
      headers={[
        "Урок",
        "Кафедра",
        "Наблюдатель",
        ...(itemCode ? [`Балл по пункту ${itemCode}`] : []),
        "Итог",
        ...(withSelf ? ["Самоанализ"] : []),
      ]}
    >
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
            {itemCode && <td>{itemScoreText(v, itemCode)}</td>}
            <td>
              <Score visit={v} />
            </td>
            {withSelf && (
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
            )}
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
    <Table
      headers={
        priorityOnly
          ? ["Пункт", "Средний балл", "% от максимума", "Оценённых уроков"]
          : ["Пункт", "Средний балл", "Оценённых уроков"]
      }
    >
      {list.map((c) => (
        <tr key={c.code}>
          <td>
            {c.code} {c.title.replace(/\.$/, "")}
          </td>
          <td>
            {(priorityOnly ? c.priority : c.value) == null
              ? "Не оценено"
              : `${(priorityOnly ? c.priority : c.value)!.toLocaleString("ru", { maximumFractionDigits: 2 })} из ${c.max}`}
          </td>
          {priorityOnly && (
            <td>{c.percent == null ? "Не оценено" : `${displayScore(c.percent)}%`}</td>
          )}
          <td>{priorityOnly ? c.eligibleCount : c.count}</td>
        </tr>
      ))}
    </Table>
  );
  const renderSupport = (list: typeof support) => (
    <Table
      fit
      headers={[
        "Учитель",
        "Кафедра",
        "Средний итог",
        "Повторяемость",
        "Уроки, требующие поддержки",
      ]}
    >
      {list.map((t, index) => (
        <Fragment key={t.key}>
          {(index === 0 || list[index - 1].group !== t.group) && (
            <tr className="vcr-group-row">
              <th colSpan={5} scope="colgroup">
                {ATTENTION_GROUP_NAMES[t.group]} ·{" "}
                {support.filter((s) => s.group === t.group).length}
              </th>
            </tr>
          )}
          <tr>
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
                <ScoreLevel
                  text={`${displayScore(t.average)} из 100`}
                  percent={t.average}
                />
              )}
            </td>
            <td>{t.repeat}</td>
            <td>
              {lessonObservations(t.rows)
                .filter((v) => scorePercent(v) != null && scorePercent(v)! < 70)
                .slice(0, 1)
                .map((v) => (
                  <p key={v.id}>
                    <button className="vcr-link" onClick={() => openLesson(v)}>
                      {dateText(v.date)} · {v.subject} · {v.className}
                    </button>
                  </p>
                ))}
              {t.below70 > 1 && (
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
        </Fragment>
      ))}
    </Table>
  );
  const renderTop = (list: typeof topList) => (
    <Table
      fit
      headers={["Учитель", "Кафедра", "Средний итог", "Полных уроков"]}
    >
      {list.map((t) => (
        <tr key={t.key}>
          <td>
            <button
              className="vcr-link"
              onClick={() => update({ reportTeacher: t.key, reportLesson: null })}
            >
              {shortName(t.name)}
            </button>
          </td>
          <td>{t.department}</td>
          <td>
            <ScoreLevel
              text={`${displayScore(t.average)} из 100`}
              percent={t.average}
            />
          </td>
          <td>
            {t.fullLessons}
            {t.single && <small>единичный результат</small>}
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
            <div>{m.reason}</div>
            {projectId && (
              <label className="vcr-reason__pick">
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
  const renderNotVisited = (list: typeof notVisited) => (
    <>
      <p>
        Посещено {coverage.visited} из {coverage.total} · не посещены{" "}
        {coverage.notVisited.length}
      </p>
      {list.length ? (
        <Table
          headers={[
            "Учитель",
            "Кафедра",
            ...(showUnits ? ["Подразделение"] : []),
          ]}
        >
          {list.map((t) => (
            <tr key={t.key}>
              <td>
                {t.name}
                {t.selfOnly && <small>есть самоанализ, посещения нет</small>}
              </td>
              <td>{t.department}</td>
              {showUnits && (
                <td>{t.units.length ? t.units.join(", ") : UNIT_NOT_DEFINED}</td>
              )}
            </tr>
          ))}
        </Table>
      ) : (
        <Empty />
      )}
    </>
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
                    : view === "not_visited"
                      ? notVisited.length
                      : filteredLessons.length;
  const pages = size === "all" ? 1 : Math.max(1, Math.ceil(total / size)),
    currentPage = Math.min(page, pages);
  const paged = <T,>(list: T[]) => pageRows(list, currentPage, size);
  const firstResultGroupKey = sortedResultGroups.find((group) =>
    paged(shownResultRows).some((row) => row.groupKey === group.key),
  )?.key;
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
            <option value="100">100</option>
            {size === "all" && <option value="all">Все</option>}
          </select>
        </label>
        <span>
          {total} {pluralRu(total, ["строка", "строки", "строк"])}
        </span>
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
          Группа: ATTENTION_GROUP_NAMES[t.group],
          Повторяемость: t.repeat,
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
  if (isDirectorSummaryShown(directorScreen, params.get("screen")))
    return (
      <DirectorSummary
        report={report}
        directory={directory}
        staffUnits={staffUnits}
        newTeacherIds={newTeacherIds}
        onSaveNewTeachers={onSaveNewTeachers}
        analyticsPath={analyticsPath}
      />
    );
  const excelButton = (
    <button
      type="button"
      className="vcr-action vcr-action--primary"
      onClick={() => void exportExcel()}
    >
      Скачать Excel · все строки
    </button>
  );
  return (
    <div className="vcr-dashboard">
      <header className={`vcr-header${detail ? "" : " vcr-header--compact"}`}>
        <div className="vcr-header__title">
          <h2>{heading}</h2>
          {detail && needsSupport && (
            <span className="vcr-chip vcr-chip--support">
              Нужна методическая поддержка
            </span>
          )}
          {detail && needsPreliminarySupport && (
            <span className="vcr-chip vcr-chip--preliminary">
              Предварительно: нужна поддержка
            </span>
          )}
        </div>
        {detail && (
          <div className="vcr-header__actions">
            {excelButton}
            <button
              type="button"
              className="vcr-action"
              onClick={() => update({ reportTeacher: null, reportLesson: null })}
            >
              ← К списку
            </button>
          </div>
        )}
      </header>
      {exportError && <p role="alert">{exportError}</p>}
      {linkError && <p role="alert">{linkError}</p>}
      {!detail && (
        <>
          <div className="vcr-navbar">
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
                  onClick={() =>
                    update({ reportView: id, reportLevel: null, reportCriterion: null })
                  }
                >
                  {name}
                </button>
              ))}
            </nav>
            {excelButton}
          </div>
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
            {showUnits && (
              <label>
                Подразделение{" "}
                <select
                  value={unit}
                  onChange={(e) => update({ reportUnit: e.target.value })}
                >
                  <option value="">Все подразделения</option>
                  {unitOptions.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                  <option value={UNIT_FILTER_NOT_DEFINED}>
                    {UNIT_NOT_DEFINED}
                  </option>
                </select>
              </label>
            )}
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
            <span className="vcr-contents__label">Перейти к разделу:</span>
            {(
              [
                ["support", "Нужна методическая поддержка", support.length],
                ["top", "Очень высокий уровень", veryHigh.length],
                ["charts", "Уроки по уровням", null],
                ["attention", "Критерии, требующие внимания", SECTION_NAMES.length],
                ["priorities", "Зоны роста", null],
                [
                  "discrepancies",
                  "Расхождения в оценках",
                  new Set(flags.map((f) => f.lesson.id)).size,
                ],
                ["unlinked", "Самоанализы без урока", unlinked.length],
              ] as [string, string, number | null][]
            ).map(([id, name, count]) => (
              <a key={id} href={`#vcr-${id}`}>
                <span>{name}</span>
                {count != null && (
                  <span
                    className={`vcr-contents__count${count === 0 ? " vcr-contents__count--zero" : id === "support" ? " vcr-contents__count--warn" : ""}`}
                  >
                    {count}
                  </span>
                )}
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
            <button
              type="button"
              className="vcr-metric vcr-metric--link"
              onClick={() =>
                update({
                  reportView: "not_visited",
                  reportTeacher: null,
                  reportLesson: null,
                })
              }
            >
              <strong className="vcr-metric__nowrap">
                {coverage.visited} из {coverage.total}
              </strong>
              <span>Посещено учителей</span>
            </button>
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
          <section id="vcr-support" className="vcr-panel vcr-compact">
            <div className="vcr-head">
              <h3>Нужна методическая поддержка</h3>
              {support.length ? (
                <SortSelect
                  value={sortSupport}
                  onChange={setSort("reportSortSupport", "worst")}
                />
              ) : null}
            </div>
            {support.length ? (
              <>
                {renderSupport(compactRows(supportList, isOpen("support")))}
                <ListToggle
                  total={supportList.length}
                  open={isOpen("support")}
                  onToggle={() => toggleList("support")}
                />
              </>
            ) : (
              <Empty />
            )}
          </section>
          <section id="vcr-top" className="vcr-panel vcr-compact">
            <div className="vcr-head">
              <h3>Очень высокий уровень</h3>
              {veryHigh.length ? (
                <SortSelect
                  value={sortTop}
                  onChange={setSort("reportSortTop", "best")}
                />
              ) : null}
            </div>
            <p className="vcr-note">
              средний итог по полным урокам от 85% доступного максимума
            </p>
            {veryHigh.length ? (
              <>
                {renderTop(compactRows(topList, isOpen("top")))}
                <ListToggle
                  total={topList.length}
                  open={isOpen("top")}
                  onToggle={() => toggleList("top")}
                />
              </>
            ) : (
              <Empty />
            )}
          </section>
          <div id="vcr-charts" className="vcr-chart-grid">
            <LevelChart
              title="Уроки по уровням: неделя"
              rows={rows}
              dates={
                period === "all"
                  ? "За всё время"
                  : `${dateText(from)}-${dateText(to)}`
              }
              onOpen={(label) =>
                update({ reportView: "lessons", reportLevel: label })
              }
            />
            <LevelChart
              title="Уроки по уровням: весь период"
              rows={scoped}
              dates={`${dateText("2026-09-01")}-${dateText(report.week.today)}`}
              onOpen={(label) =>
                update({
                  reportView: "lessons",
                  reportLevel: label,
                  reportPeriod: "all",
                })
              }
            />
          </div>
          <section id="vcr-attention" className="vcr-panel vcr-compact">
            <h3>Критерии, требующие внимания</h3>
            <p className="vcr-note">
              блоки от самого низкого результата к высокому, % от максимума по
              гимназии
            </p>
            <Table headers={["Блок", ...departments]}>
              {compactRows(attentionBlocks, isOpen("attention")).map(({ name, index }) => (
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
                    const attention = blockAttentionPercent(blocks);
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
            <ListToggle
              total={SECTION_NAMES.length}
              open={isOpen("attention")}
              onToggle={() => toggleList("attention")}
            />
          </section>
          <section id="vcr-priorities" className="vcr-panel vcr-compact">
            <h3>Зоны роста</h3>
            <p className="vcr-note">
              пункты чек-листа с самым низким средним баллом по гимназии
            </p>
            {priorities.length ? (
              renderCriteria(compactRows(priorities, isOpen("priorities")), true)
            ) : (
              <Empty />
            )}
            <ListToggle
              total={priorities.length}
              open={isOpen("priorities")}
              onToggle={() => toggleList("priorities")}
            />
            <small className="vcr-fine">
              3.5, 5.2, 5.3 не учитываются, пока оцениваются по минимальному уровню
            </small>
          </section>
          <section id="vcr-discrepancies" className="vcr-panel vcr-compact">
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
            {flags.length ? (
              renderFlags(compactRows(flags, isOpen("discrepancies")))
            ) : (
              <Empty />
            )}
            <ListToggle
              total={flags.length}
              open={isOpen("discrepancies")}
              onToggle={() => toggleList("discrepancies")}
            />
          </section>
          <section id="vcr-unlinked" className="vcr-panel vcr-compact">
            <h3>Самоанализы без урока</h3>
            {linkAllButton}
            {unlinked.length ? (
              renderUnlinked(compactRows(unlinked, isOpen("unlinked")))
            ) : (
              <Empty />
            )}
            <ListToggle
              total={unlinked.length}
              open={isOpen("unlinked")}
              onToggle={() => toggleList("unlinked")}
            />
          </section>
        </>
      ) : detail ? (
        <>
          {/* В карточке учителя самоанализов нет: они остаются в карточке урока, на основной странице и в Excel. */}
          {renderLessons(lessons, "", Boolean(selectedLesson))}
          {flags.length > 0 && (
            <section className="vcr-panel">
              <h3>Расхождения в оценках</h3>
              {renderFlags(flags)}
            </section>
          )}
          <section className="vcr-panel">
            <h3>Исходные ответы</h3>
            {rows.map((v) => (
              <details key={v.id} open={lessons.length <= 1}>
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
{sortedResultGroups.map((group) => {
                const displayed = paged(shownResultRows).filter(
                  (row) => row.groupKey === group.key,
                );
                if (!displayed.length) return null;
                return (
                  <section className="vcr-panel" key={group.key}>
                    <div className="vcr-head">
                      <h3>{group.title}</h3>
                      {group.key === firstResultGroupKey ? (
                        <SortSelect
                          value={sortResults}
                          onChange={setSort("reportSortTeachers", "best")}
                        />
                      ) : null}
                    </div>
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
                              <ScoreLevel
                                text={`${displayScore(row.value, row.maximum)} из ${row.maximum}`}
                                percent={row.percent}
                                preliminary={group.preliminary}
                              />
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
                        <ScoreLevel
                          text={`${displayScore(average)} из 100`}
                          percent={average}
                        />
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
            <>
              {renderCriteria(paged(priorities), true)}
              <small className="vcr-fine">
                3.5, 5.2, 5.3 не учитываются, пока оцениваются по минимальному уровню
              </small>
            </>
          ) : view === "support" ? (
            <>
<div className="vcr-head vcr-head--end">
  <SortSelect
    value={sortSupport}
    onChange={setSort("reportSortSupport", "worst")}
  />
</div>
              {renderSupport(paged(supportList))}
            </>
          ) : view === "discrepancies" ? (
            renderFlags(paged(flags))
          ) : view === "unlinked" ? (
            <>
              {linkAllButton}
              {renderUnlinked(paged(unlinked))}
            </>
          ) : view === "not_visited" ? (
            renderNotVisited(paged(notVisited))
          ) : (
            <>
              {criterionCode && (
                <p className="vcr-note">
                  Пункт {criterionCode}
                  {criterionQuestion
                    ? ` «${criterionQuestion.text.replace(/\.$/, "")}»`
                    : ""}
                  : уроки, где пункт набран не полностью, сначала самые слабые.{" "}
                  <button
                    className="vcr-link"
                    onClick={() => update({ reportCriterion: null })}
                  >
                    Показать все уроки
                  </button>
                </p>
              )}
              {renderLessons(paged(filteredLessons), criterionCode)}
            </>
          )}
          {pagination}
        </>
      )}
    </div>
  );
}
