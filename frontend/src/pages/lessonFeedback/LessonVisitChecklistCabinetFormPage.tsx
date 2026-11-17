import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/publicForm.css';
import '../../corporateEvent.css';
import './lessonFeedback.css';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import {
  getPublicLatestLessonVisitForm,
  getPublicLessonVisitForm,
  listLessonVisitResponses,
  postPhenomenonWeekAi,
  savePhenomenonTeachers,
  type PhenomenonWeekAi,
} from '../../api/visitChecklist';
import { API_BASE, parseJson, sessionHeaders } from '../../api/http';
import PersonSelectField from '../../components/corporate/PersonSelectField';
import PublicCampusSlideshow from '../../components/PublicCampusSlideshow';
import { Badge, Empty, PercentBar, Table } from '../../components/VisitChecklistReportDashboard';
import { LEVEL_COLORS, LEVELS, displayScore, niceAxis } from '../../lib/lessonVisitChecklist/reportPresentation';
import { VCD_PDF_HIDE_CLASS, downloadVisitChecklistPdf } from '../../lib/lessonVisitChecklist/visitChecklistCloudPdf';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { loadJdMe } from '../../lib/cabinet/sharedResources';
import { useCabinetProfile } from '../../lib/cabinet/profile';
import { downloadAoaXlsx } from '../../lib/excelWorkbook';
import { resolvePublicLessonVisitDirectory } from '../../lib/lessonVisitChecklist/resolvePublicDirectory';
import { defaultLessonVisitDirectory, type LessonVisitDirectory } from '../../lib/lessonVisitChecklist/types';
import {
  visitChecklistObservedTeacherGroups,
  visitChecklistObservedTeachers,
  visitChecklistVisitorGroups,
  visitChecklistVisitorNames,
} from '../../lib/lessonVisitChecklist/visitChecklistPeople';
import {
  LESSON_VISIT_PUBLIC_FORM_TOKEN,
  VISIT_FORMAT_QUERY,
  PHENOMENON_OPEN_FOR_ALL,
  cachePhenomenonAccess,
  phenomenonMenuVisible,
  type PhenomenonSubmission,
  PHENOMENON_COMMENTS_ID,
  PHENOMENON_COMMENTS_TITLE,
  PHENOMENON_FORM_TOKEN,
  PHENOMENON_GENERAL_LABELS,
  PHENOMENON_ITEMS,
  PHENOMENON_LEVEL_LABELS,
  PHENOMENON_MASTERY_BANDS,
  PHENOMENON_MASTERY_GUIDE_TITLE,
  PHENOMENON_MASTERY_IDS,
  PHENOMENON_MASTERY_SCALE,
  PHENOMENON_OVERALL,
  PHENOMENON_SECTIONS,
  PHENOMENON_TITLE,
  PHENOMENON_UI,
  buildPhenomenonSubmission,
  emptyPhenomenonGeneral,
  filterPhenomenonRecords,
  formatPhenomenonDate,
  masteryQuestionText,
  optionLabel,
  phenomenonExcelSheets,
  phenomenonTeacherNames,
  pick,
  phenomenonLessonByRecord,
  PHENOMENON_LESSON_NUMBERS,
  PHENOMENON_ALL_WEEKS,
  PHENOMENON_LEVEL_ORDER,
  PHENOMENON_WEEKS,
  PHENOMENON_EXTRA_DEPARTMENT,
  phenomenonExtraTeachersOf,
  withPhenomenonExtraTeachers,
  withoutPhenomenonExtraTeachers,
  defaultPhenomenonWeek,
  phenomenonLessonDetail,
  phenomenonLessonRows,
  phenomenonRecordsForWeek,
  phenomenonWeekLabel,
  summarizePhenomenonWeek,
  PHENOMENON_RATING_GAP,
  PHENOMENON_SPREAD_LIMIT,
  phenomenonDepartmentPairSlices,
  phenomenonDiscrepancies,
  phenomenonStageSlices,
  phenomenonTeacherRows,
  sortPhenomenonTeachers,
  phenomenonPointsText,
  PHENOMENON_KEY_INDICATORS,
  phenomenonComments,
  phenomenonDynamics,
  type PhenomenonWeek,
  type PhenomenonWeekDynamics,
  type PhenomenonSliceRow,
  type PhenomenonTeacherRow,
  type PhenomenonTeacherSort,
  type PhenomenonLessonDetail,
  type PhenomenonLessonSort,
  type PhenomenonLessonSummary,
  type PhenomenonLevel,
  type PhenomenonProfileItem,
  type PhenomenonShare,
  type PhenomenonWeekSummary,
  summarizePhenomenonTeachers,
  teacherNameFor,
  toPhenomenonRecord,
  validatePhenomenon,
  type PhenomenonAnswers,
  type PhenomenonChoiceItem,
  type PhenomenonGeneral,
  type PhenomenonLocale,
  type PhenomenonMissing,
  type PhenomenonRecord,
} from '../../lib/lessonVisitChecklist/publicForm';
import { Link, useSearchParams } from 'react-router-dom';
import { PHENOMENON_CHECKLIST_NAV_TITLE, PHENOMENON_CHECKLIST_PATH } from '../../lib/visitChecklistNav';
import { LessonVisitChecklistForm } from '../LessonVisitChecklistPublicPage';

export default function LessonVisitChecklistCabinetFormPage() {
  const [searchParams] = useSearchParams();
  if (searchParams.get('form') === 'phenomenon') {
    return (
      <PhenomenonChecklistPage embedded />
    );
  }
  return <MainCabinetForm />;
}

function MainCabinetForm() {
  const [searchParams] = useSearchParams();
  const tokenFromQuery = String(searchParams.get('token') || '').trim();
  const [token, setToken] = useState(tokenFromQuery || LESSON_VISIT_PUBLIC_FORM_TOKEN);
  // Кнопка феноменального урока: всем после открытия, до этого только участникам пробного доступа.
  const [showPhenomenon, setShowPhenomenon] = useState(phenomenonMenuVisible);

  useEffect(() => {
    let cancelled = false;
    void checkPhenomenonAccess()
      .then((r) => {
        if (!cancelled) setShowPhenomenon(r.access !== 'denied');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tokenFromQuery) {
      setToken(tokenFromQuery);
      return;
    }
    let cancelled = false;
    void getPublicLatestLessonVisitForm()
      .then((row) => {
        if (!cancelled && row.form_token) setToken(row.form_token);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tokenFromQuery]);

  return (
    <>
      {showPhenomenon ? (
        <div className="lf-visit-form ph-entry">
          <Link className="btn" to={PHENOMENON_CHECKLIST_PATH}>
            {PHENOMENON_CHECKLIST_NAV_TITLE} →
          </Link>
        </div>
      ) : null}
      <LessonVisitChecklistForm
        token={token}
        formatQuery={searchParams.get(VISIT_FORMAT_QUERY)}
        embedded
      />
    </>
  );
}

// --- Чек-лист феноменального урока --------------------------------------------

/**
 * Доступ к чек-листу феноменального урока, пока он не открыт для всех.
 * Список участников хранится только на сервере: интерфейс узнаёт ответ, запросив результаты формы
 * (сервер отдаёт их только участникам пробного доступа). Ответ запоминается в sessionStorage,
 * чтобы меню кабинета, которое строится без запросов, могло показать пункт.
 */
type PhenomenonAccess = 'open' | 'allowed' | 'denied';

let pending: Promise<{ access: PhenomenonAccess; projectId: number | null }> | null = null;

function checkPhenomenonAccess(): Promise<{ access: PhenomenonAccess; projectId: number | null }> {
  if (pending) return pending;
  pending = (async () => {
    let projectId: number | null = null;
    try {
      projectId = (await getPublicLessonVisitForm(PHENOMENON_FORM_TOKEN)).project.id;
    } catch {
      projectId = null;
    }
    if (PHENOMENON_OPEN_FOR_ALL) return { access: 'open' as const, projectId };
    if (projectId == null) return { access: 'denied' as const, projectId };
    try {
      await listLessonVisitResponses(projectId);
      cachePhenomenonAccess(true);
      return { access: 'allowed' as const, projectId };
    } catch {
      cachePhenomenonAccess(false);
      return { access: 'denied' as const, projectId };
    }
  })();
  const result = pending;
  void result.finally(() => {
    pending = null;
  });
  return result;
}

/**
 * Отправка ответа. Пока форма закрыта, сервер проверяет сессию, поэтому запрос идёт с ней
 * (общий apiFetch для /api/public/ сессию убирает).
 */
async function postPhenomenonResponse(payload: PhenomenonSubmission): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/api/public/lesson-visit-form/${encodeURIComponent(PHENOMENON_FORM_TOKEN)}/responses`, {
    method: 'POST',
    headers: sessionHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ response?: { id: number }; error?: string; message?: string }>(res);
  if (!res.ok || !data.response) throw new Error(data.message || data.error || res.statusText);
  return { id: data.response.id };
}

const LOCALE_KEY = 'pulse_phenomenon_checklist_locale';

function readLocale(): PhenomenonLocale {
  try {
    return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'ru';
  } catch {
    return 'ru';
  }
}

function storeLocale(locale: PhenomenonLocale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* выбор языка просто не запомнится */
  }
}

function Required() {
  return <span className="public-required-mark"> *</span>;
}

function LocaleSwitch({ locale, onChange }: { locale: PhenomenonLocale; onChange: (l: PhenomenonLocale) => void }) {
  return (
    <div className="public-choice-row ph-inline-row ph-locale-switch" role="radiogroup" aria-label="Язык / Language">
      {(['ru', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          className={`public-choice-btn${locale === l ? ' is-selected' : ''}`}
          style={{ width: 'auto', minWidth: '4rem', justifyContent: 'center' }}
          onClick={() => onChange(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function FieldWrap({ id, invalid, label, required = true, children }: { id: string; invalid: boolean; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div id={id} className={invalid ? 'public-field-invalid' : undefined} style={{ marginTop: '0.85rem', padding: invalid ? '0.35rem' : undefined }}>
      <label style={{ display: 'block', marginBottom: '0.35rem' }}>
        <strong className="public-question-title" style={{ fontSize: '1rem' }}>
          {label}
          {required ? <Required /> : null}
        </strong>
      </label>
      {children}
    </div>
  );
}

function ChoiceQuestion({
  item,
  locale,
  value,
  invalid,
  onChange,
}: {
  item: PhenomenonChoiceItem;
  locale: PhenomenonLocale;
  value: string;
  invalid: boolean;
  onChange: (v: string) => void;
}) {
  const title = pick(item.title, locale);
  return (
    <FieldWrap id={`question-${item.id}`} invalid={invalid} label={title}>
      <div className="public-choice-row" role="radiogroup" aria-label={title}>
        {item.options.map((opt) => {
          const checked = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={checked}
              className={`public-choice-btn${checked ? ' is-selected' : ''}`}
              onClick={() => onChange(opt.id)}
            >
              <span className="public-choice-dot" />
              <span>{pick(opt.label, locale)}</span>
            </button>
          );
        })}
      </div>
    </FieldWrap>
  );
}

function MasteryQuestion({
  text,
  value,
  invalid,
  locale,
  showGuide = false,
  onChange,
}: {
  text: string;
  value: string;
  invalid: boolean;
  locale: PhenomenonLocale;
  showGuide?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className={invalid ? 'public-field-invalid' : undefined} style={{ marginTop: '1rem', padding: invalid ? '0.35rem' : undefined }}>
      <label style={{ display: 'block', marginBottom: '0.35rem' }}>
        <strong className="public-question-title" style={{ fontSize: '1rem' }}>
          {text}
          <Required />
        </strong>
      </label>
      {showGuide ? (
        <div className="ph-mastery-bands muted" style={{ margin: '0 0 0.6rem', fontSize: '0.86rem' }}>
          <p style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>{pick(PHENOMENON_MASTERY_GUIDE_TITLE, locale)}</p>
          {PHENOMENON_MASTERY_BANDS.map((b) => (
            <p key={b.range} style={{ margin: '0.2rem 0' }}>
              <strong>{b.range}:</strong> {pick(b.text, locale)}
            </p>
          ))}
        </div>
      ) : null}
      <p className="muted" style={{ fontSize: '0.82rem', margin: '0 0 0.35rem' }}>
        {pick(PHENOMENON_MASTERY_SCALE, locale)}
      </p>
      <div className="public-choice-row ph-inline-row ph-scale" role="radiogroup" aria-label={text}>
        {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={`public-choice-btn${value === n ? ' is-selected' : ''}`}
            style={{ width: 'auto', minWidth: '2.75rem', justifyContent: 'center' }}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PhenomenonChecklistForm({
  locale,
  directory,
  observerFromAccount,
  photos,
}: {
  locale: PhenomenonLocale;
  directory: LessonVisitDirectory;
  observerFromAccount: string;
  /** Фото из обычного чек-листа посещения (тот же блок, что над его формой). */
  photos?: string[];
}) {
  const ui = PHENOMENON_UI[locale];
  const [general, setGeneral] = useState<PhenomenonGeneral>(() => emptyPhenomenonGeneral(new Date(), observerFromAccount));
  const [answers, setAnswers] = useState<PhenomenonAnswers>({});
  const [missing, setMissing] = useState<PhenomenonMissing[]>([]);
  const [sameTeacher, setSameTeacher] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (observerFromAccount) setGeneral((g) => (g.observer_name ? g : { ...g, observer_name: observerFromAccount }));
  }, [observerFromAccount]);

  // Подписи незаполненных полей меняются вместе с языком.
  useEffect(() => {
    setMissing((prev) => {
      if (!prev.length) return prev;
      const check = validatePhenomenon(general, answers, locale);
      return check.ok ? [] : check.missing;
    });
  }, [locale]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalid = useMemo(() => new Set(missing.map((m) => m.id)), [missing]);
  const teacherChoices = useMemo(() => visitChecklistObservedTeachers(directory).map((t) => t.name), [directory]);
  // «Другие сотрудники» добавлены только в списки педагогов; наблюдателя можно вписать вручную.
  const visitorDirectory = useMemo(() => withoutPhenomenonExtraTeachers(directory), [directory]);
  const teacherGroups = useMemo(() => visitChecklistObservedTeacherGroups(directory), [directory]);

  const setG = (patch: Partial<PhenomenonGeneral>, fieldId: string) => {
    setGeneral((g) => ({ ...g, ...patch }));
    setMissing((m) => m.filter((x) => x.id !== `general-${fieldId}`));
    setSameTeacher(false);
  };
  const setA = (id: string, value: string) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    setMissing((m) => m.filter((x) => x.id !== `question-${id}`));
  };
  const pickTeacher = (slot: 1 | 2, name: string) => {
    const row = directory.teachers.find((t) => t.name === name);
    setG(slot === 1 ? { teacher1_name: name, teacher1_id: row?.id || '' } : { teacher2_name: name, teacher2_id: row?.id || '' }, `teacher${slot}`);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validatePhenomenon(general, answers, locale);
    if (!check.ok) {
      setMissing(check.missing);
      setSameTeacher(check.sameTeacher);
      const first = check.missing[0]?.id || (check.sameTeacher ? 'general-teacher2' : '');
      if (first) document.getElementById(first)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const payload = buildPhenomenonSubmission(general, answers);
      await postPhenomenonResponse(payload);
      setDone(true);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setGeneral(emptyPhenomenonGeneral(new Date(), observerFromAccount));
    setAnswers({});
    setMissing([]);
    setSameTeacher(false);
    setErr(null);
    setDone(false);
  };

  if (done) {
    return (
      <div className="public-form-stack">
        <motion.div className="card public-form-glass-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="public-done-icon" aria-hidden>
            ✓
          </div>
          <h1 style={{ marginTop: '0.35rem' }}>{ui.thanksTitle}</h1>
          <p className="muted">{ui.thanksBody}</p>
          <button type="button" className="btn" style={{ marginTop: '0.75rem' }} onClick={reset}>
            {ui.again}
          </button>
        </motion.div>
      </div>
    );
  }

  const L = (id: keyof typeof PHENOMENON_GENERAL_LABELS) => pick(PHENOMENON_GENERAL_LABELS[id], locale);

  return (
    <form className="public-form-stack" onSubmit={(e) => void onSubmit(e)} noValidate>
      <AnimatePresence>
        {missing.length || sameTeacher || err ? (
          <motion.div className="card public-form-glass-card" role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {err ? <p className="err">{err}</p> : null}
            {sameTeacher ? <p className="err">{ui.sameTeacher}</p> : null}
            {missing.length ? (
              <>
                <p className="err public-form-validation-alert__title">{ui.missingTitle}</p>
                <ul className="public-form-validation-list">
                  {missing.map((m) => (
                    <li key={m.id}>{m.label}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <PublicCampusSlideshow active sources={photos} />

      <div className="card public-form-glass-card">
        <strong className="public-question-title">{pick(PHENOMENON_SECTIONS.registration, locale)}</strong>
        <FieldWrap id="general-date" invalid={invalid.has('general-date')} label={L('date')}>
          <input className="field" type="date" value={general.date} onChange={(e) => setG({ date: e.target.value }, 'date')} />
        </FieldWrap>
        <FieldWrap id="general-observer_name" invalid={invalid.has('general-observer_name')} label={L('observer_name')}>
          {observerFromAccount ? (
            <input className="field" type="text" value={general.observer_name} readOnly aria-readonly />
          ) : (
            <PersonSelectField
              choices={visitChecklistVisitorNames(visitorDirectory)}
              groups={visitChecklistVisitorGroups(visitorDirectory)}
              value={general.observer_name}
              locale={locale}
              placeholder={ui.observerPlaceholder}
              ariaLabel={L('observer_name')}
              allowManualEntry
              onChange={(name) => setG({ observer_name: name }, 'observer_name')}
            />
          )}
        </FieldWrap>
        <FieldWrap id="general-class_name" invalid={invalid.has('general-class_name')} label={L('class_name')}>
          <input className="field" type="text" value={general.class_name} onChange={(e) => setG({ class_name: e.target.value }, 'class_name')} />
        </FieldWrap>
        <FieldWrap id="general-students_count" invalid={invalid.has('general-students_count')} label={L('students_count')}>
          <input className="field" type="text" inputMode="numeric" value={general.students_count} onChange={(e) => setG({ students_count: e.target.value }, 'students_count')} />
        </FieldWrap>
        <FieldWrap id="general-lesson_number" invalid={invalid.has('general-lesson_number')} label={L('lesson_number')}>
          <select className="field" value={general.lesson_number} onChange={(e) => setG({ lesson_number: e.target.value }, 'lesson_number')}>
            <option value="">{locale === 'en' ? 'Choose…' : 'Выберите…'}</option>
            {PHENOMENON_LESSON_NUMBERS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </FieldWrap>
        <FieldWrap id="general-teacher1" invalid={invalid.has('general-teacher1')} label={L('teacher1')}>
          <PersonSelectField
            choices={teacherChoices}
            groups={teacherGroups}
            value={general.teacher1_name}
            excludeNames={general.teacher2_name ? [general.teacher2_name] : []}
            locale={locale}
            placeholder={ui.teacherPlaceholder}
            ariaLabel={L('teacher1')}
            onChange={(name) => pickTeacher(1, name)}
          />
        </FieldWrap>
        <FieldWrap id="general-teacher2" invalid={invalid.has('general-teacher2') || sameTeacher} label={L('teacher2')}>
          <PersonSelectField
            choices={teacherChoices}
            groups={teacherGroups}
            value={general.teacher2_name}
            excludeNames={general.teacher1_name ? [general.teacher1_name] : []}
            locale={locale}
            placeholder={ui.teacherPlaceholder}
            ariaLabel={L('teacher2')}
            onChange={(name) => pickTeacher(2, name)}
          />
          {sameTeacher ? <p className="err" style={{ marginTop: '0.35rem' }}>{ui.sameTeacher}</p> : null}
        </FieldWrap>
      </div>

      <div className="card public-form-glass-card">
        <strong className="public-question-title">{pick(PHENOMENON_SECTIONS.evaluation, locale)}</strong>
        {PHENOMENON_ITEMS.map((item) => (
          <ChoiceQuestion
            key={item.id}
            item={item}
            locale={locale}
            value={answers[item.id] || ''}
            invalid={invalid.has(`question-${item.id}`)}
            onChange={(v) => setA(item.id, v)}
          />
        ))}
      </div>

      <div className="card public-form-glass-card">
        <strong className="public-question-title">{pick(PHENOMENON_SECTIONS.overall, locale)}</strong>
        <ChoiceQuestion
          item={PHENOMENON_OVERALL}
          locale={locale}
          value={answers[PHENOMENON_OVERALL.id] || ''}
          invalid={invalid.has(`question-${PHENOMENON_OVERALL.id}`)}
          onChange={(v) => setA(PHENOMENON_OVERALL.id, v)}
        />
        {PHENOMENON_MASTERY_IDS.map((id) => (
          <div id={`question-${id}`} key={id}>
            <MasteryQuestion
              text={masteryQuestionText(id, locale, teacherNameFor(id, general))}
              value={answers[id] || ''}
              invalid={invalid.has(`question-${id}`)}
              locale={locale}
              showGuide={id === 'ph_mastery_1'}
              onChange={(v) => setA(id, v)}
            />
          </div>
        ))}
        <FieldWrap id={`question-${PHENOMENON_COMMENTS_ID}`} invalid={false} label={pick(PHENOMENON_COMMENTS_TITLE, locale)} required={false}>
          <textarea
            className="field"
            rows={4}
            value={answers[PHENOMENON_COMMENTS_ID] || ''}
            onChange={(e) => setA(PHENOMENON_COMMENTS_ID, e.target.value)}
          />
        </FieldWrap>
      </div>

      <div className="public-submit-row">
        <div className="public-submit-actions">
          <button type="submit" className="btn primary public-btn-submit" disabled={submitting}>
            {submitting ? ui.submitting : ui.submit}
          </button>
        </div>
      </div>
    </form>
  );
}

const PAGE_SIZE = 50;

export function PhenomenonResultsTable({ records }: { records: PhenomenonRecord[] }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [teacher, setTeacher] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [busy, setBusy] = useState(false);
  const teachers = useMemo(() => phenomenonTeacherNames(records), [records]);
  const filtered = useMemo(() => filterPhenomenonRecords(records, { from, to, teacher }), [records, from, to, teacher]);
  const lessons = useMemo(() => phenomenonLessonByRecord(filtered), [filtered]);
  const mastery = useMemo(() => summarizePhenomenonTeachers(filtered), [filtered]);

  const exportXlsx = async () => {
    setBusy(true);
    try {
      await downloadAoaXlsx(`Феноменальные_уроки_${from || 'все'}_${to || 'даты'}.xlsx`, phenomenonExcelSheets(filtered));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="public-form-stack">
      <div className="card public-form-glass-card">
        <strong className="public-question-title">Заполненные чек-листы</strong>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-end', marginTop: '0.75rem' }}>
          <label>
            <span className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>С даты</span>
            <input className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>По дату</span>
            <input className="field" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label style={{ minWidth: '14rem' }}>
            <span className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>Педагог</span>
            <select className="field" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
              <option value="">Все педагоги</option>
              {teachers.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn primary" disabled={busy || !filtered.length} onClick={() => void exportXlsx()}>
            {busy ? 'Выгрузка…' : 'Выгрузить в Excel'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: '0.6rem' }}>
          Чек-листов: {filtered.length}
        </p>
        {filtered.length ? (
          <div className="ph-table-wrap" style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
            <table className="ph-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Класс</th>
                  <th>Педагоги</th>
                  <th>Наблюдатель</th>
                  <th>Итог</th>
                  <th>Уровень</th>
                  <th>Итог урока</th>
                  <th>Мастерство 1</th>
                  <th>Мастерство 2</th>
                  {PHENOMENON_ITEMS.map((i) => (
                    <th key={i.id} title={i.title.ru}>
                      {i.title.ru.replace(/\s*\(.*$/, '')}
                    </th>
                  ))}
                  <th>{PHENOMENON_OVERALL.title.ru}</th>
                  <th>{PHENOMENON_COMMENTS_TITLE.ru}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((r) => (
                  <tr key={r.id}>
                    <td>{formatPhenomenonDate(r.date)}</td>
                    <td>{r.className}</td>
                    <td style={{ minWidth: '12rem' }}>
                      {r.teacher1}
                      <br />
                      {r.teacher2}
                    </td>
                    <td>{r.observer}</td>
                    <td>
                      {r.score.percent} ({r.score.points} из {r.score.max})
                    </td>
                    <td>{PHENOMENON_LEVEL_LABELS[r.score.level].ru}</td>
                    <td>{lessons.get(r.id)?.percent ?? ''}</td>
                    <td>{r.mastery1 ?? ''}</td>
                    <td>{r.mastery2 ?? ''}</td>
                    {PHENOMENON_ITEMS.map((i) => (
                      <td key={i.id}>{optionLabel(i.id, r.answers[i.id] || '')}</td>
                    ))}
                    <td>{optionLabel(PHENOMENON_OVERALL.id, r.answers[PHENOMENON_OVERALL.id] || '')}</td>
                    <td style={{ minWidth: '14rem' }}>{r.comments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > limit ? (
              <button type="button" className="btn" style={{ marginTop: '0.6rem' }} onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                Показать ещё
              </button>
            ) : null}
          </div>
        ) : (
          <p className="muted">Пока нет заполненных чек-листов.</p>
        )}
      </div>
      {mastery.length ? (
        <div className="card public-form-glass-card">
          <strong className="public-question-title">Мастерство педагогов (среднее, 1-10)</strong>
          <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
            <table className="ph-table">
              <thead>
                <tr>
                  <th>Педагог</th>
                  <th>Оценок</th>
                  <th>Среднее</th>
                </tr>
              </thead>
              <tbody>
                {mastery.map((t) => (
                  <tr key={t.key}>
                    <td>{t.name}</td>
                    <td>{t.ratings}</td>
                    <td>{t.mastery}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Страница кабинета: форма на двух языках и, для группы аналитики, таблица результатов. */
export function PhenomenonChecklistPage({ embedded = true }: { embedded?: boolean }) {
  const { user } = useCabinetProfile();
  const [locale, setLocale] = useState<PhenomenonLocale>(readLocale);
  const [mainDirectory, setMainDirectory] = useState<LessonVisitDirectory | null>(null);
  // «Другие сотрудники»: педагоги только для феноменальной формы, хранятся в базе её проекта.
  const [extraTeachers, setExtraTeachers] = useState<{ id: string; name: string }[]>([]);
  const directory = useMemo(
    () => (mainDirectory ? withPhenomenonExtraTeachers(mainDirectory, extraTeachers) : null),
    [mainDirectory, extraTeachers],
  );
  const [photos, setPhotos] = useState<string[] | undefined>();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [staffName, setStaffName] = useState('');
  const [records, setRecords] = useState<PhenomenonRecord[] | null>(null);
  const [tab, setTab] = useState<'form' | 'results'>('form');
  const [access, setAccess] = useState<PhenomenonAccess | null>(null);
  useDocumentTitle(pick(PHENOMENON_TITLE, locale));

  const changeLocale = useCallback((l: PhenomenonLocale) => {
    setLocale(l);
    storeLocale(l);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [checked, phenomenon, main] = await Promise.all([
          checkPhenomenonAccess(),
          getPublicLessonVisitForm(PHENOMENON_FORM_TOKEN),
          getPublicLatestLessonVisitForm()
            .then((latest) => getPublicLessonVisitForm(latest.form_token))
            .catch(() => null),
        ]);
        if (cancelled) return;
        setAccess(checked.access);
        setProjectId(phenomenon.project.id);
        setMainDirectory(resolvePublicLessonVisitDirectory(main?.directory ?? null, defaultLessonVisitDirectory()));
        setExtraTeachers(phenomenonExtraTeachersOf(phenomenon.directory));
        // Те же фото, что в обычном чек-листе; без них блок показывает стандартные фото гимназии.
        setPhotos(main?.media?.photos?.map((ph) => ph.src));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void loadJdMe()
      .then((me) => {
        if (!cancelled) setStaffName(String(me.staff?.full_name || '').trim());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Таблица видна только тем, кому сервер отдаёт ответы (группа аналитики основного чек-листа).
  useEffect(() => {
    if (!user || projectId == null || access == null || access === 'denied') return;
    let cancelled = false;
    void listLessonVisitResponses(projectId)
      .then((rows) => {
        if (cancelled) return;
        const list = rows
          .map((row) => toPhenomenonRecord(row as unknown as Parameters<typeof toPhenomenonRecord>[0]))
          .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
        setRecords(list);
      })
      .catch(() => {
        if (!cancelled) setRecords(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, projectId, tab, access]);

  const observerFromAccount = staffName || String(user?.display_name || '').trim();
  const ui = PHENOMENON_UI[locale];
  const rootClass = embedded ? 'lf-visit-form' : 'page public-form-root lf-visit-form';

  return (
    <MotionConfig reducedMotion="user">
      <div className={rootClass}>
        <div className="public-form-stack">
          <div className="card public-form-glass-card">
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
              <h1 style={{ marginTop: 0, marginBottom: 0 }}>{pick(PHENOMENON_TITLE, tab === 'results' ? 'ru' : locale)}</h1>
              {tab === 'form' ? <LocaleSwitch locale={locale} onChange={changeLocale} /> : null}
            </div>
            {records ? (
              <div className="public-choice-row ph-inline-row" style={{ marginTop: '0.75rem' }} role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'form'} className={`public-choice-btn${tab === 'form' ? ' is-selected' : ''}`} style={{ width: 'auto' }} onClick={() => setTab('form')}>
                  {locale === 'en' ? 'Form' : 'Форма'}
                </button>
                <button type="button" role="tab" aria-selected={tab === 'results'} className={`public-choice-btn${tab === 'results' ? ' is-selected' : ''}`} style={{ width: 'auto' }} onClick={() => setTab('results')}>
                  {locale === 'en' ? 'Results' : 'Результаты'} ({records.length})
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {!loading && access === 'denied' ? (
          <div className="public-form-stack">
            <div className="card public-form-glass-card">
              <h2 style={{ marginTop: 0 }}>{ui.closed}</h2>
            </div>
          </div>
        ) : loading ? (
          <div className="public-form-stack">
            <div className="card public-form-glass-card muted">{ui.loading}</div>
          </div>
        ) : err || !directory ? (
          <div className="public-form-stack">
            <div className="card public-form-glass-card">
              <h2 style={{ marginTop: 0 }}>{ui.unavailable}</h2>
              {err ? <p className="err">{err}</p> : null}
            </div>
          </div>
        ) : tab === 'results' && records ? (
          <PhenomenonAnalytics
            records={records}
            directory={directory}
            extraTeachers={extraTeachers}
            onSaveExtraTeachers={
              projectId == null
                ? undefined
                : async (list) => {
                    const saved = await savePhenomenonTeachers(projectId, list);
                    setExtraTeachers(saved);
                  }
            }
          />
        ) : (
          <PhenomenonChecklistForm locale={locale} directory={directory} observerFromAccount={observerFromAccount} photos={photos} />
        )}
      </div>
    </MotionConfig>
  );
}

// ---------- Аналитика феноменальных уроков (вкладка «Результаты») ----------

type PhView = 'summary' | 'lessons' | 'teachers' | 'slices' | 'discrepancies' | 'comments' | 'dynamics' | 'checklists';

const PH_SORTS: Array<{ id: PhenomenonLessonSort; label: string }> = [
  { id: 'date_desc', label: 'Сначала новые' },
  { id: 'date_asc', label: 'Сначала старые' },
  { id: 'score_desc', label: 'Итог: по убыванию' },
  { id: 'score_asc', label: 'Итог: по возрастанию' },
];

const levelIdx = (level: PhenomenonLevel | null) => (level ? PHENOMENON_LEVEL_ORDER.indexOf(level) : -1);

/** Цвет варианта ответа: по доле балла от максимума пункта (как уровни); пункт без баллов: оттенки серого. */
function optionColor(item: PhenomenonChoiceItem, optionId: string, index: number): string {
  if (!item.scored) return ['#5b6b73', '#7d8d94', '#a3b0b5', '#c5cfd2', '#e1e7e9'][index % 5];
  const max = Math.max(...item.options.map((o) => o.score ?? 0)) || 1;
  const score = item.options.find((o) => o.id === optionId)?.score ?? 0;
  return LEVEL_COLORS[Math.max(0, Math.min(4, Math.round((score / max) * 4)))];
}

function PhLevelChart({ counts, onOpen }: { counts: number[]; onOpen: (levelIndex: number) => void }) {
  const total = counts.reduce((s, n) => s + n, 0);
  const { top, ticks } = niceAxis(Math.max(1, ...counts));
  return (
    <section className="vcr-panel" id="ph-levels">
      <h3>Уроки по уровням</h3>
      <p>Уроков: {total}</p>
      <div className="vcr-level-chart" aria-label="Распределение уроков по уровням">
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
        {counts.map((n, i) => (
          <button key={LEVELS[i]} className="vcr-chart-column" onClick={() => onOpen(i)} aria-label={`${LEVELS[i]}: ${n}`}>
            <span>{n}</span>
            <div className="vcr-chart-track">
              <div className="vcr-chart-stack">
                <div style={{ height: `${(n / top) * 180}px`, backgroundColor: LEVEL_COLORS[i] }} />
              </div>
            </div>
            <small>{LEVELS[i]}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ShareCell({ value }: { value: PhenomenonShare }) {
  if (value.percent == null) return <span className="muted">нет данных</span>;
  return (
    <span className="vcr-scorecell">
      <span className="vcr-scorecell__value">{value.percent}%</span>
      <small>
        {value.count} из {value.total}
      </small>
    </span>
  );
}

function OptionsBar({ item, profile }: { item: PhenomenonChoiceItem; profile: PhenomenonProfileItem }) {
  return (
    <div>
      <div className="ph-optbar" role="img" aria-label={profile.options.map((o) => `${o.label}: ${o.percent}%`).join('; ')}>
        {profile.options.map((o, i) =>
          o.count ? (
            <div key={o.id} title={`${o.label}: ${o.percent}% (${o.count})`} style={{ width: `${o.percent}%`, backgroundColor: optionColor(item, o.id, i) }}>
              {o.percent >= 9 ? `${Math.round(o.percent)}%` : ''}
            </div>
          ) : null,
        )}
      </div>
      <ul className="ph-optlegend">
        {profile.options.map((o, i) => (
          <li key={o.id}>
            <i style={{ backgroundColor: optionColor(item, o.id, i) }} />
            {o.label}: <b>{o.percent}%</b> <span className="muted">({o.count})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhenomenonSummaryView({
  summary,
  onLessons,
  onLesson,
}: {
  summary: PhenomenonWeekSummary;
  onLessons: (level?: number) => void;
  onLesson: (lesson: PhenomenonLessonSummary) => void;
}) {
  const top = phenomenonLessonRows(summary.lessons, { sort: 'score_desc' });
  return (
    <>
      <div className="vcr-metrics">
        <button type="button" className="vcr-metric vcr-metric--link" onClick={() => onLessons()}>
          <strong>{summary.average == null ? 'Нет данных' : `${displayScore(summary.average)} из 100`}</strong>
          <span>Средний итог по урокам</span>
          <Badge percent={summary.average} />
        </button>
        <button type="button" className="vcr-metric vcr-metric--link" onClick={() => onLessons()}>
          <strong>{summary.lessons.length}</strong>
          <span>Уроков посещено</span>
        </button>
        <div className="vcr-metric">
          <strong>{summary.checklists}</strong>
          <span>Чек-листов</span>
        </div>
        <div className="vcr-metric">
          <strong>{summary.observers}</strong>
          <span>Наблюдателей</span>
        </div>
        <div className="vcr-metric">
          <strong>{summary.teachers}</strong>
          <span>Педагогов</span>
        </div>
      </div>
      <PhLevelChart counts={summary.levelCounts} onOpen={(i) => onLessons(i)} />
      <section className="vcr-panel" id="ph-indicators">
        <h3>Ключевые показатели формата</h3>
        <Table headers={['Показатель', 'Доля уроков', 'Доля чек-листов']} stack>
          {summary.indicators.map(({ group, rows }) => (
            <Fragment key={group.id}>
              <tr className="ph-group-row">
                <th colSpan={3} scope="colgroup">
                  {group.title}
                </th>
              </tr>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="Показатель">{row.label}</td>
                  <td data-label="Доля уроков">
                    <ShareCell value={row.lessons} />
                  </td>
                  <td data-label="Доля чек-листов">
                    <ShareCell value={row.checklists} />
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </Table>
      </section>
      <section className="vcr-panel" id="ph-profile">
        <h3>Профиль по критериям</h3>
        <div className="ph-profile">
          {summary.profile.map((p) => {
            const item = PHENOMENON_ITEMS.find((i) => i.id === p.id)!;
            return (
              <div key={p.id} className="ph-profile__item">
                <div className="ph-profile__head">
                  <strong>{p.title.replace(/\s*\(.*$/, '')}</strong>
                  {p.scored && p.percent != null ? (
                    <span className="vcr-scorecell">
                      <span className="vcr-scorecell__value">{displayScore(p.percent)}% от максимума</span>
                    </span>
                  ) : (
                    <span className="muted">без баллов, только распределение</span>
                  )}
                </div>
                {p.scored && p.percent != null ? <PercentBar percent={p.percent} label={`${p.title}: ${p.percent}%`} /> : null}
                <OptionsBar item={item} profile={p} />
              </div>
            );
          })}
        </div>
      </section>
      <section className="vcr-panel vcr-compact" id="ph-top-lessons">
        <div className="vcr-head">
          <h3>Уроки</h3>
          {summary.lessons.length > 5 ? (
            <button type="button" className={`vcr-link ${VCD_PDF_HIDE_CLASS}`} onClick={() => onLessons()}>
              Все {summary.lessons.length} →
            </button>
          ) : null}
        </div>
        {summary.lessons.length ? <PhLessonTable rows={top.slice(0, 5)} onOpen={onLesson} /> : <Empty />}
      </section>
    </>
  );
}

function PhLessonTable({ rows, onOpen }: { rows: PhenomenonLessonSummary[]; onOpen: (lesson: PhenomenonLessonSummary) => void }) {
  const teacherCell = (l: PhenomenonLessonSummary, name: string, label: string) => (
    <td data-label={label}>
      <button type="button" className="vcr-rowlink" onClick={() => onOpen(l)}>
        {name}
      </button>
      <small>{phenomenonPointsText(l.points)}</small>
    </td>
  );
  return (
    <Table headers={['Дата', '№ урока', 'Класс', 'Педагог 1', 'Педагог 2', 'Наблюдателей', 'Итог урока', 'Разброс']} stack>
      {rows.map((l) => (
        <tr key={l.lessonKey} className="vcr-row-link" onClick={(e) => !(e.target as HTMLElement).closest('a,button') && onOpen(l)}>
          <td data-label="Дата">{formatPhenomenonDate(l.date)}</td>
          <td data-label="№ урока">{l.lessonNumber || '—'}</td>
          <td data-label="Класс">{l.className}</td>
          {teacherCell(l, l.teacher1, 'Педагог 1')}
          {teacherCell(l, l.teacher2, 'Педагог 2')}
          <td data-label="Наблюдателей">{l.observers}</td>
          <td data-label="Итог урока">
            <span className="vcr-scorecell">
              <span className="vcr-scorecell__value">{phenomenonPointsText(l.points)}</span>
              <Badge percent={l.percent} />
            </span>
          </td>
          <td data-label="Разброс">
            {l.checklists > 1 ? `${displayScore(l.minPercent)}-${displayScore(l.maxPercent)}%` : '—'}
          </td>
        </tr>
      ))}
    </Table>
  );
}

function PhenomenonLessonsView({
  lessons,
  title,
  onReset,
  level,
  onLevel,
  onOpen,
}: {
  lessons: PhenomenonLessonSummary[];
  title?: string;
  onReset?: () => void;
  level: number | null;
  onLevel: (level: number | null) => void;
  onOpen: (lesson: PhenomenonLessonSummary) => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<PhenomenonLessonSort>('date_desc');
  const rows = phenomenonLessonRows(level == null ? lessons : lessons.filter((l) => levelIdx(l.level) === level), { search, sort });
  return (
    <section className="vcr-panel">
      <div className="vcr-head">
        <h3>
          {title ?? 'Уроки'}
          {level != null ? `: ${LEVELS[level].toLowerCase()} уровень` : ''}
        </h3>
        {onReset ? (
          <button type="button" className="vcr-link" onClick={onReset}>
            Все уроки
          </button>
        ) : null}
        {level != null ? (
          <button type="button" className="vcr-link" onClick={() => onLevel(null)}>
            Все уровни
          </button>
        ) : null}
      </div>
      <div className="vcr-filters">
        <label>
          Поиск по педагогу <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Сортировка{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as PhenomenonLessonSort)}>
            {PH_SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>Уроков: {rows.length}</p>
      {rows.length ? <PhLessonTable rows={rows} onOpen={onOpen} /> : <Empty />}
    </section>
  );
}

function PhenomenonLessonCard({ detail, onBack }: { detail: PhenomenonLessonDetail; onBack: () => void }) {
  const { lesson } = detail;
  return (
    <>
      <header className="vcr-header">
        <div className="vcr-header__title">
          <h2>
            {lesson.teacher1} и {lesson.teacher2} · {formatPhenomenonDate(lesson.date)}
            {lesson.lessonNumber ? ` · ${lesson.lessonNumber} урок` : ''} · {lesson.className}
          </h2>
        </div>
        <div className="vcr-header__actions">
          <button type="button" className="vcr-action" onClick={onBack}>
            ← К списку
          </button>
        </div>
      </header>
      <div className="vcr-metrics">
        <div className="vcr-metric">
          <strong>{phenomenonPointsText(lesson.points)}</strong>
          <span>Балл урока и каждого педагога (среднее по чек-листам)</span>
          <Badge percent={lesson.percent} />
        </div>
        <div className="vcr-metric">
          <strong>{lesson.checklists}</strong>
          <span>Чек-листов</span>
        </div>
        <div className="vcr-metric">
          <strong className="vcr-metric__nowrap">
            {lesson.checklists > 1 ? `${displayScore(lesson.minPercent)}-${displayScore(lesson.maxPercent)}` : '—'}
          </strong>
          <span>Разброс итогов</span>
        </div>
      </div>
      <section className="vcr-panel">
        <h3>Мастерство педагогов (1-10, среднее по наблюдателям)</h3>
        <Table headers={['Педагог', 'Среднее', 'Оценок']} fit>
          {detail.mastery.map((m) => (
            <tr key={m.name}>
              <td>{m.name}</td>
              <td>{m.mean ?? '—'}</td>
              <td>{m.ratings}</td>
            </tr>
          ))}
        </Table>
      </section>
      {detail.checklists.map((r) => (
        <section key={r.id} className="vcr-panel ph-checklist">
          <div className="vcr-head">
            <h3>{r.observer || 'Наблюдатель не указан'}</h3>
            <span className="vcr-scorecell">
              <span className="vcr-scorecell__value">
                {displayScore(r.score.percent)} из 100 ({r.score.points} из {r.score.max} баллов)
              </span>
              <Badge percent={r.score.percent} />
            </span>
          </div>
          <Table headers={['Пункт', 'Ответ']} fit>
            {PHENOMENON_ITEMS.map((i) => (
              <tr key={i.id}>
                <td>{i.title.ru.replace(/\s*\(.*$/, '')}</td>
                <td>{optionLabel(i.id, r.answers[i.id] || '') || '—'}</td>
              </tr>
            ))}
            <tr>
              <td>{PHENOMENON_OVERALL.title.ru}</td>
              <td>{optionLabel(PHENOMENON_OVERALL.id, r.answers[PHENOMENON_OVERALL.id] || '') || '—'}</td>
            </tr>
            <tr>
              <td>Мастерство: {r.teacher1}</td>
              <td>{r.mastery1 ?? '—'}</td>
            </tr>
            <tr>
              <td>Мастерство: {r.teacher2}</td>
              <td>{r.mastery2 ?? '—'}</td>
            </tr>
          </Table>
          {r.comments ? (
            <blockquote>
              <strong>{PHENOMENON_COMMENTS_TITLE.ru}:</strong> {r.comments}
            </blockquote>
          ) : null}
        </section>
      ))}
    </>
  );
}

const PH_TEACHER_SORTS: Array<{ id: PhenomenonTeacherSort; label: string }> = [
  { id: 'points_desc', label: 'Балл: сначала высокий' },
  { id: 'points_asc', label: 'Балл: сначала низкий' },
  { id: 'name', label: 'По алфавиту' },
  { id: 'average_desc', label: 'Средний итог: сначала высокий' },
  { id: 'average_asc', label: 'Средний итог: сначала низкий' },
  { id: 'mastery_desc', label: 'Мастерство: сначала высокое' },
  { id: 'mastery_asc', label: 'Мастерство: сначала низкое' },
  { id: 'lessons_desc', label: 'Больше уроков' },
];

/** Педагоги только для феноменальной формы: видят и меняют те, кому открыта аналитика. */
function PhenomenonExtraTeachersEditor({
  list,
  onSave,
}: {
  list: { id: string; name: string }[];
  onSave: (list: { id?: string; name: string }[]) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (next: { id?: string; name: string }[]) => {
    setBusy(true);
    setError('');
    try {
      await onSave(next);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    const n = name.replace(/\s+/g, ' ').trim();
    if (!n) return;
    if (await save([...list, { name: n }])) setName('');
  };
  return (
    <section className={`vcr-panel ${VCD_PDF_HIDE_CLASS}`}>
      <h3>{PHENOMENON_EXTRA_DEPARTMENT.name}</h3>
      <p className="muted">
        Педагоги только для чек-листа феноменального урока: их можно выбрать первым или вторым педагогом в этой форме.
        В основном чек-листе, справочнике и охвате основной аналитики их нет.
      </p>
      {list.length ? (
        <ul className="ph-extra-list">
          {list.map((t) => (
            <li key={t.id}>
              <span>{t.name}</span>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void save(list.filter((x) => x.id !== t.id))}
              >
                Убрать
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Пока никого нет.</p>
      )}
      <div className="vcr-filters">
        <label>
          ФИО педагога{' '}
          <input
            type="text"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
            }}
          />
        </label>
        <button type="button" className="btn primary" disabled={busy || !name.trim()} onClick={() => void add()}>
          Добавить
        </button>
      </div>
      {error ? <p className="err">{error}</p> : null}
    </section>
  );
}

function PhenomenonTeachersView({ rows, onOpen }: { rows: PhenomenonTeacherRow[]; onOpen: (t: PhenomenonTeacherRow) => void }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<PhenomenonTeacherSort>('points_desc');
  const list = sortPhenomenonTeachers(rows, sort, search);
  return (
    <section className="vcr-panel">
      <h3>Педагоги</h3>
      <div className="vcr-filters">
        <label>
          Поиск по ФИО или кафедре <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Сортировка{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as PhenomenonTeacherSort)}>
            {PH_TEACHER_SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>Педагогов: {list.length}</p>
      {list.length ? (
        <Table headers={['Педагог', 'Балл', 'Кафедра', 'Уроков', 'Уровень', 'Мастерство (1-10)', 'Оценок']} stack>
          {list.map((t) => (
            <tr key={t.key} className="vcr-row-link" onClick={(e) => !(e.target as HTMLElement).closest('a,button') && onOpen(t)}>
              <td data-label="Педагог">
                <button type="button" className="vcr-rowlink" onClick={() => onOpen(t)}>
                  {t.name}
                </button>
              </td>
              <td data-label="Балл">
                <strong>{phenomenonPointsText(t.points)}</strong>
              </td>
              <td data-label="Кафедра">{t.department || '—'}</td>
              <td data-label="Уроков">{t.lessons}</td>
              <td data-label="Уровень">{t.average == null ? '—' : <Badge percent={t.average} />}</td>
              <td data-label="Мастерство (1-10)">{t.mastery == null ? '—' : String(t.mastery).replace('.', ',')}</td>
              <td data-label="Оценок">{t.ratings}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty />
      )}
    </section>
  );
}

function SliceTable({ title, group, rows }: { title: string; group: string; rows: PhenomenonSliceRow[] }) {
  return (
    <section className="vcr-panel">
      <h3>{title}</h3>
      {rows.length ? (
        <Table headers={[group, 'Уроков', 'Средний итог']} stack fit>
          {rows.map((r) => (
            <tr key={r.label}>
              <td data-label={group}>{r.label}</td>
              <td data-label="Уроков">{r.lessons}</td>
              <td data-label="Средний итог">
                {r.average == null ? (
                  '—'
                ) : (
                  <span className="vcr-scorecell">
                    <span className="vcr-scorecell__value">{displayScore(r.average)} из 100</span>
                    <Badge percent={r.average} />
                  </span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty />
      )}
    </section>
  );
}

function PhenomenonDiscrepanciesView({
  records,
  onOpen,
}: {
  records: PhenomenonRecord[];
  onOpen: (lesson: PhenomenonLessonSummary) => void;
}) {
  const d = useMemo(() => phenomenonDiscrepancies(records), [records]);
  return (
    <>
      <section className="vcr-panel">
        <h3>Наблюдатели разошлись: итоги отличаются на {PHENOMENON_SPREAD_LIMIT} баллов и больше</h3>
        {d.spread.length ? (
          <Table headers={['Урок', 'Итоги наблюдателей', 'Разница']} stack>
            {d.spread.map((l) => {
              const list = records.filter((r) => l.recordIds.includes(r.id)).sort((a, b) => a.score.percent - b.score.percent);
              return (
                <tr key={l.lessonKey} className="vcr-row-link" onClick={(e) => !(e.target as HTMLElement).closest('a,button') && onOpen(l)}>
                  <td data-label="Урок">
                    <button type="button" className="vcr-rowlink" onClick={() => onOpen(l)}>
                      {l.teachers.join(' и ')}
                    </button>
                    <small>
                      {formatPhenomenonDate(l.date)}
                      {l.lessonNumber ? ` · ${l.lessonNumber} урок` : ''} · {l.className}
                    </small>
                  </td>
                  <td data-label="Итоги наблюдателей">
                    {list.map((r) => (
                      <div key={r.id}>
                        {r.observer}: {displayScore(r.score.percent)}
                      </div>
                    ))}
                  </td>
                  <td data-label="Разница">{displayScore(l.maxPercent - l.minPercent)}</td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty />
        )}
      </section>
      <section className="vcr-panel">
        <h3>Оценка наблюдателя расходится с баллами на {PHENOMENON_RATING_GAP} уровня и больше</h3>
        {d.ratingGaps.length ? (
          <Table headers={['Урок', 'Наблюдатель', 'По баллам', 'Оценка наблюдателя']} stack>
            {d.ratingGaps.map((g) => (
              <tr key={g.record.id} className="vcr-row-link" onClick={(e) => g.lesson && !(e.target as HTMLElement).closest('a,button') && onOpen(g.lesson)}>
                <td data-label="Урок">
                  <button type="button" className="vcr-rowlink" onClick={() => g.lesson && onOpen(g.lesson)}>
                    {[g.record.teacher1, g.record.teacher2].join(' и ')}
                  </button>
                  <small>
                    {formatPhenomenonDate(g.record.date)} · {g.record.className}
                  </small>
                </td>
                <td data-label="Наблюдатель">{g.record.observer}</td>
                <td data-label="По баллам">
                  <span className="vcr-scorecell">
                    <span className="vcr-scorecell__value">{displayScore(g.record.score.percent)}</span>
                    <Badge percent={g.record.score.percent} />
                  </span>
                </td>
                <td data-label="Оценка наблюдателя">
                  {optionLabel(PHENOMENON_OVERALL.id, g.record.answers[PHENOMENON_OVERALL.id])} {g.gap > 0 ? '↑ выше баллов' : '↓ ниже баллов'}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty />
        )}
      </section>
    </>
  );
}

function PhenomenonCommentsView({ records, week }: { records: PhenomenonRecord[]; week: PhenomenonWeek | undefined }) {
  const [search, setSearch] = useState('');
  const [ai, setAi] = useState<PhenomenonWeekAi | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  useEffect(() => {
    setAi(null);
    setAiError('');
  }, [week?.id]);
  const list = phenomenonComments(records, search);
  const runAi = async () => {
    if (!week) return;
    setAiBusy(true);
    setAiError('');
    try {
      const r = await postPhenomenonWeekAi({ from: week.from, to: week.to });
      setAi(r);
      if (r.error) setAiError(r.error);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Не удалось получить обзор');
    } finally {
      setAiBusy(false);
    }
  };
  return (
    <>
      <section className="vcr-panel">
        <div className="vcr-head">
          <h3>Обзор недели</h3>
          {week ? (
            <button type="button" className="vcr-action vcr-action--primary" disabled={aiBusy} onClick={() => void runAi()}>
              {aiBusy ? 'Готовим обзор…' : ai ? 'Обновить обзор' : 'Обзор недели'}
            </button>
          ) : null}
        </div>
        {!week ? (
          <p className="muted">Обзор строится по одной неделе: выберите неделю вверху.</p>
        ) : !ai && !aiError ? (
          <p className="muted">Сводка общих выводов наблюдателей в два списка, без оценок конкретных учителей. Готовит ГигаЧат, имена в запрос не попадают.</p>
        ) : null}
        {aiError ? <p role="alert">{aiError}</p> : null}
        {ai && (ai.repeat.length || ai.strengthen.length) ? (
          <div className="ph-ai">
            <div>
              <h4>Находки, которые стоит повторить</h4>
              <ul>
                {ai.repeat.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Что усилить</h4>
              <ul>
                {ai.strengthen.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            {ai.note ? <p className="muted">{ai.note}</p> : null}
          </div>
        ) : null}
      </section>
      <section className="vcr-panel">
        <h3>Общие выводы наблюдателей</h3>
        <div className="vcr-filters">
          <label>
            Поиск по тексту <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        <p>Комментариев: {list.length}</p>
        {list.length ? (
          <div className="ph-comments">
            {list.map((c) => (
              <article key={c.id} className="ph-comment">
                <header>
                  <strong>{c.teachers.join(' и ')}</strong>
                  <span className="muted">
                    {formatPhenomenonDate(c.date)}
                    {c.lesson?.lessonNumber ? ` · ${c.lesson.lessonNumber} урок` : ''}
                    {c.lesson ? ` · ${c.lesson.className}` : ''} · {c.observer}
                  </span>
                </header>
                <p>{c.text}</p>
              </article>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </section>
    </>
  );
}

function LevelMiniBar({ counts }: { counts: number[] }) {
  const total = counts.reduce((s, n) => s + n, 0) || 1;
  return (
    <div className="ph-optbar" role="img" aria-label={counts.map((n, i) => `${LEVELS[i]}: ${n}`).join('; ')}>
      {counts.map((n, i) =>
        n ? (
          <div key={i} title={`${LEVELS[i]}: ${n}`} style={{ width: `${(n / total) * 100}%`, backgroundColor: LEVEL_COLORS[i] }}>
            {n}
          </div>
        ) : null,
      )}
    </div>
  );
}

function PhenomenonDynamicsView({ rows }: { rows: PhenomenonWeekDynamics[] }) {
  if (rows.length < 2) {
    return (
      <section className="vcr-panel">
        <h3>Динамика</h3>
        <p className="muted">Динамика появится, когда будут данные хотя бы за две феноменальные недели.</p>
      </section>
    );
  }
  const indicatorRows = PHENOMENON_KEY_INDICATORS.flatMap((g) => g.rows.map((r) => ({ group: g.title, row: r })));
  return (
    <>
      <section className="vcr-panel">
        <h3>Динамика по неделям</h3>
        <Table headers={['Неделя', 'Средний итог', 'Уроков', 'Чек-листов', 'Уроки по уровням']} stack>
          {rows.map(({ week, summary }) => (
            <tr key={week.id}>
              <td data-label="Неделя">{phenomenonWeekLabel(week)}</td>
              <td data-label="Средний итог">
                {summary.average == null ? (
                  '—'
                ) : (
                  <span className="vcr-scorecell">
                    <span className="vcr-scorecell__value">{displayScore(summary.average)} из 100</span>
                    <Badge percent={summary.average} />
                  </span>
                )}
              </td>
              <td data-label="Уроков">{summary.lessons.length}</td>
              <td data-label="Чек-листов">{summary.checklists}</td>
              <td data-label="Уроки по уровням" style={{ minWidth: 220 }}>
                <LevelMiniBar counts={summary.levelCounts} />
              </td>
            </tr>
          ))}
        </Table>
      </section>
      <section className="vcr-panel">
        <h3>Ключевые показатели формата по неделям (доля уроков / доля чек-листов)</h3>
        <Table headers={['Показатель', ...rows.map((r) => r.week.title)]}>
          {indicatorRows.map(({ group, row }) => (
            <tr key={row.id}>
              <td>
                <small>{group}</small>
                {row.label}
              </td>
              {rows.map(({ week, summary }) => {
                const v = summary.indicators.flatMap((x) => x.rows).find((x) => x.id === row.id)!;
                return (
                  <td key={week.id}>
                    {v.lessons.percent == null ? '—' : `${v.lessons.percent}%`} / {v.checklists.percent == null ? '—' : `${v.checklists.percent}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}

export function PhenomenonAnalytics({
  records,
  directory,
  today,
  weeks = PHENOMENON_WEEKS,
  extraTeachers,
  onSaveExtraTeachers,
}: {
  records: PhenomenonRecord[];
  directory?: LessonVisitDirectory | null;
  today?: Date;
  /** Педагоги «Другие сотрудники» (только феноменальная форма) и сохранение их списка. */
  extraTeachers?: { id: string; name: string }[];
  onSaveExtraTeachers?: (list: { id?: string; name: string }[]) => Promise<void>;
  /** Список недель (по умолчанию из кода); параметр нужен для проверок. */
  weeks?: PhenomenonWeek[];
}) {
  const [week, setWeek] = useState(() => defaultPhenomenonWeek(weeks, today));
  const [view, setView] = useState<PhView>('summary');
  const [level, setLevel] = useState<number | null>(null);
  const [lessonKey, setLessonKey] = useState<string | null>(null);
  const [teacherFilter, setTeacherFilter] = useState<PhenomenonTeacherRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const scoped = useMemo(() => phenomenonRecordsForWeek(records, week, weeks), [records, week, weeks]);
  const dynamics = useMemo(() => phenomenonDynamics(records, weeks), [records, weeks]);
  const summary = useMemo(() => summarizePhenomenonWeek(scoped), [scoped]);
  const teacherRows = useMemo(() => phenomenonTeacherRows(scoped, directory), [scoped, directory]);
  const stageSlices = useMemo(() => phenomenonStageSlices(summary.lessons), [summary]);
  const pairSlices = useMemo(() => phenomenonDepartmentPairSlices(scoped, summary.lessons, directory), [scoped, summary, directory]);
  const lesson = lessonKey ? summary.lessons.find((l) => l.lessonKey === lessonKey) ?? null : null;
  const weekObj = weeks.find((w) => w.id === week);

  const exportXlsx = async () => {
    setBusy(true);
    try {
      await downloadAoaXlsx(`Феноменальные_уроки_${weekObj ? weekObj.from : 'все_недели'}.xlsx`, phenomenonExcelSheets(scoped, directory));
    } finally {
      setBusy(false);
    }
  };
  const exportPdf = async () => {
    if (!pdfRef.current) return;
    setBusy(true);
    setPdfError('');
    try {
      await downloadVisitChecklistPdf(pdfRef.current, `Феноменальные_уроки_сводка_${weekObj ? weekObj.from : 'все_недели'}.pdf`);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Не удалось собрать PDF');
    } finally {
      setBusy(false);
    }
  };
  const openLessons = (lvl?: number) => {
    setLevel(lvl ?? null);
    setTeacherFilter(null);
    setView('lessons');
    setLessonKey(null);
  };

  return (
    <div className="vcr-dashboard ph-analytics">
      {lesson ? (
        <PhenomenonLessonCard detail={phenomenonLessonDetail(scoped, lesson)} onBack={() => setLessonKey(null)} />
      ) : (
        <>
          <header className="vcr-header vcr-header--compact">
            <div className="vcr-header__title">
              <h2>Аналитика феноменальных уроков</h2>
            </div>
          </header>
          <div className="vcr-navbar">
            <nav className="vcr-navigation" aria-label="Разделы аналитики">
              {(
                [
                  ['summary', 'Сводка'],
                  ['lessons', 'Уроки'],
                  ['teachers', 'Педагоги'],
                  ['slices', 'Срезы'],
                  ['discrepancies', 'Расхождения'],
                  ['comments', 'Комментарии'],
                  ...(weeks.length >= 2 ? [['dynamics', 'Динамика']] : []),
                  ['checklists', 'Чек-листы'],
                ] as Array<[PhView, string]>
              ).map(([id, name]) => (
                <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => (id === 'lessons' ? openLessons() : setView(id))}>
                  {name}
                </button>
              ))}
            </nav>
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {view === 'summary' ? (
                <button type="button" className="vcr-action" disabled={busy || !scoped.length} onClick={() => void exportPdf()}>
                  Скачать PDF сводки
                </button>
              ) : null}
              <button type="button" className="vcr-action vcr-action--primary" disabled={busy || !scoped.length} onClick={() => void exportXlsx()}>
                {busy ? 'Выгрузка…' : 'Скачать Excel'}
              </button>
            </span>
          </div>
          <div className="vcr-filters" hidden={view === 'dynamics'}>
            <label>
              Неделя{' '}
              <select
                value={week}
                onChange={(e) => {
                  setWeek(e.target.value);
                  setLessonKey(null);
                }}
              >
                {[...weeks].reverse().map((w) => (
                  <option key={w.id} value={w.id}>
                    {phenomenonWeekLabel(w)}
                  </option>
                ))}
                <option value={PHENOMENON_ALL_WEEKS}>Все недели</option>
              </select>
            </label>
          </div>
          {pdfError ? <p role="alert">{pdfError}</p> : null}
          {view === 'dynamics' ? (
            <PhenomenonDynamicsView rows={dynamics} />
          ) : !scoped.length ? (
            <section className="vcr-panel">
              <Empty />
            </section>
          ) : view === 'summary' ? (
            <div ref={pdfRef}>
              <h3 className="ph-pdf-title">
                Сводка: {weekObj ? phenomenonWeekLabel(weekObj) : 'все недели'}
              </h3>
              <PhenomenonSummaryView summary={summary} onLessons={openLessons} onLesson={(l) => setLessonKey(l.lessonKey)} />
            </div>
          ) : view === 'lessons' ? (
            <PhenomenonLessonsView
              lessons={teacherFilter ? summary.lessons.filter((l) => teacherFilter.lessonKeys.includes(l.lessonKey)) : summary.lessons}
              title={teacherFilter ? `Уроки: ${teacherFilter.name}` : undefined}
              onReset={teacherFilter ? () => setTeacherFilter(null) : undefined}
              level={level}
              onLevel={setLevel}
              onOpen={(l) => setLessonKey(l.lessonKey)}
            />
          ) : view === 'teachers' ? (
            <>
              <PhenomenonTeachersView
                rows={teacherRows}
                onOpen={(t) => {
                  setLevel(null);
                  setTeacherFilter(t);
                  setView('lessons');
                }}
              />
              {onSaveExtraTeachers ? (
                <PhenomenonExtraTeachersEditor list={extraTeachers || []} onSave={onSaveExtraTeachers} />
              ) : null}
            </>
          ) : view === 'slices' ? (
            <>
              <SliceTable title="По ступеням" group="Ступень" rows={stageSlices} />
              <SliceTable title="По сочетанию кафедр пары" group="Кафедры пары" rows={pairSlices} />
            </>
          ) : view === 'discrepancies' ? (
            <PhenomenonDiscrepanciesView records={scoped} onOpen={(l) => setLessonKey(l.lessonKey)} />
          ) : view === 'comments' ? (
            <PhenomenonCommentsView records={scoped} week={weekObj} />
          ) : (
            <PhenomenonResultsTable records={scoped} />
          )}
        </>
      )}
    </div>
  );
}
