import { useCallback, useEffect, useMemo, useState } from 'react';
import '../../styles/publicForm.css';
import '../../corporateEvent.css';
import './lessonFeedback.css';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import {
  getPublicLatestLessonVisitForm,
  getPublicLessonVisitForm,
  listLessonVisitResponses,
} from '../../api/visitChecklist';
import { API_BASE, parseJson, sessionHeaders } from '../../api/http';
import PersonSelectField from '../../components/corporate/PersonSelectField';
import PublicCampusSlideshow from '../../components/PublicCampusSlideshow';
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
  summarizePhenomenonLessons,
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
              choices={visitChecklistVisitorNames(directory)}
              groups={visitChecklistVisitorGroups(directory)}
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
          <input className="field" type="text" value={general.lesson_number} onChange={(e) => setG({ lesson_number: e.target.value }, 'lesson_number')} />
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
  const lessons = useMemo(() => new Map(summarizePhenomenonLessons(filtered).map((l) => [l.lessonKey, l])), [filtered]);
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
                    <td>{lessons.get(r.lessonKey)?.percent ?? ''}</td>
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
function PhenomenonChecklistPage({ embedded = true }: { embedded?: boolean }) {
  const { user } = useCabinetProfile();
  const [locale, setLocale] = useState<PhenomenonLocale>(readLocale);
  const [directory, setDirectory] = useState<LessonVisitDirectory | null>(null);
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
        setDirectory(resolvePublicLessonVisitDirectory(main?.directory ?? null, defaultLessonVisitDirectory()));
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
          <PhenomenonResultsTable records={records} />
        ) : (
          <PhenomenonChecklistForm locale={locale} directory={directory} observerFromAccount={observerFromAccount} photos={photos} />
        )}
      </div>
    </MotionConfig>
  );
}
