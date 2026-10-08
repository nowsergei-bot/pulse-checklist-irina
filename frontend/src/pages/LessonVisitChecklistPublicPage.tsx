import '../styles/publicForm.css';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getPublicLessonVisitForm, postPublicLessonVisitResponse } from '../api/visitChecklist';
import PlatformFeedbackModal from '../components/PlatformFeedbackModal';
import PublicCampusSlideshow from '../components/PublicCampusSlideshow';
import PersonSelectField from '../components/corporate/PersonSelectField';
import PublicDictationField from '../components/PublicDictationField';
import PublicFormValidationAlert from '../components/PublicFormValidationAlert';
import '../corporateEvent.css';
import './lessonFeedback/lessonFeedback.css';
import { platformFeedbackAlreadyHandledInSession } from '../lib/platformFeedback';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useCabinetLoadOverlay } from '../hooks/useCabinetLoadOverlay';
import {
  collectMissingLessonVisitFields,
  scrollToFirstMissingField,
  type PublicFormMissingField,
} from '../lib/publicFormValidation';
import {
  isLessonVisitOtherOption,
  isLessonVisitOtherSelected,
  prepareLessonVisitAnswersForSubmit,
} from '../lib/lessonVisitChecklist/otherOption';
import type {
  LessonVisitChecklistConfig,
  LessonVisitDirectory,
  LessonVisitGeneralField,
  LessonVisitMediaPhoto,
  LessonVisitQuestion,
  LessonVisitSection,
} from '../lib/lessonVisitChecklist/types';
import { defaultLessonVisitDirectory } from '../lib/lessonVisitChecklist/types';
import { resolvePublicLessonVisitDirectory } from '../lib/lessonVisitChecklist/resolvePublicDirectory';
import {
  displayVisitChecklistTitle,
  normalizeSavedChecklist,
  VISIT_CHECKLIST_TITLE,
} from '../lib/lessonVisitChecklist/normalizeChecklist';
import { preferredVisitFormatFromQuery, VISIT_FORMAT_QUERY } from '../lib/lessonVisitChecklist/publicForm';
import {
  displayVisitFormatOptionLabel,
  isVisitFormatSelfAnalysisOption,
} from '../lib/lessonVisitChecklist/visitChecklistFormat';
import {
  isDirectoryTeacherId,
  isVisitChecklistPersonField,
  resolveVisitTeacherChoice,
  visitChecklistChairDepartments,
  visitChecklistObservedTeacherGroups,
  visitChecklistObservedTeachers,
  visitChecklistVisitorGroups,
  visitChecklistVisitorNames,
  visitTeacherDisplayName,
} from '../lib/lessonVisitChecklist/visitChecklistPeople';

const cardEnter = {
  hidden: { opacity: 0, y: 22, scale: 0.98 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const DONE_PREFIX = 'lesson_visit_done_';

function alreadyDone(token: string): boolean {
  return localStorage.getItem(DONE_PREFIX + token) === '1';
}

function markDone(token: string) {
  localStorage.setItem(DONE_PREFIX + token, '1');
}

function clearDone(token: string) {
  localStorage.removeItem(DONE_PREFIX + token);
}

function emptyGeneralFields(fields: LessonVisitGeneralField[]): Record<string, string> {
  const g: Record<string, string> = {};
  for (const f of fields) g[f.id] = '';
  return g;
}

function PublicFormBackground() {
  return (
    <div className="public-form-bg" aria-hidden>
      <div className="public-form-gradient-layer" />
      <motion.div
        className="public-form-orb public-form-orb--1"
        animate={{ opacity: [0.25, 0.5, 0.28], scale: [1, 1.08, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="public-form-orb public-form-orb--2"
        animate={{ opacity: [0.2, 0.42, 0.22], scale: [1, 1.12, 1] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
      <motion.div
        className="public-form-orb public-form-orb--3"
        animate={{ opacity: [0.22, 0.48, 0.24] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      <motion.div
        className="public-form-orb public-form-orb--4"
        animate={{ y: [0, -14, 0], opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

function EmbeddedChecklistWait() {
  useCabinetLoadOverlay({
    active: true,
    kind: 'checklist',
    immediate: true,
  });
  return <div className="pulse-route-fallback pulse-route-fallback--cabinet" aria-busy="true" />;
}

export function LessonVisitChecklistForm({
  token: tokenProp,
  formatQuery: formatProp,
  embedded = false,
}: {
  token?: string;
  formatQuery?: string | null;
  embedded?: boolean;
}) {
  const { token: rawToken } = useParams();
  const [searchParams] = useSearchParams();
  const token = tokenProp ?? (rawToken ? decodeURIComponent(rawToken) : '');
  const pulseContext = String(searchParams.get('pulse_context') || '');
  const formatQuery = formatProp !== undefined ? formatProp : searchParams.get(VISIT_FORMAT_QUERY);
  const rootClass = embedded ? 'lf-visit-form' : 'page public-form-root lf-visit-form';

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  useDocumentTitle(title || VISIT_CHECKLIST_TITLE);
  const [checklist, setChecklist] = useState<LessonVisitChecklistConfig | null>(null);
  const [directory, setDirectory] = useState<LessonVisitDirectory | null>(null);
  const [photos, setPhotos] = useState<LessonVisitMediaPhoto[] | undefined>();
  const [general, setGeneral] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [allowMultipleResponses, setAllowMultipleResponses] = useState(true);
  const [missingFields, setMissingFields] = useState<PublicFormMissingField[]>([]);
  const [platformFeedbackOpen, setPlatformFeedbackOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setErr('Некорректная ссылка.');
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await getPublicLessonVisitForm(token);
        if (cancelled) return;
        const allowMultiple = data.allow_multiple_responses !== false;
        setAllowMultipleResponses(allowMultiple);
        if (allowMultiple) {
          clearDone(token);
          setDone(false);
        } else {
          setDone(alreadyDone(token));
        }
        setTitle(displayVisitChecklistTitle(data.project.title));
        const checklist = normalizeSavedChecklist(data.checklist) ?? data.checklist;
        setChecklist(checklist);
        setDirectory(resolvePublicLessonVisitDirectory(data.directory, defaultLessonVisitDirectory()));
        setPhotos(data.media?.photos);
        const generalInit = emptyGeneralFields(checklist.generalFields);
        const visitFormatField = checklist.generalFields.find((f) => f.id === 'visit_format');
        const preferred = preferredVisitFormatFromQuery(formatQuery, visitFormatField?.options);
        if (preferred) generalInit.visit_format = preferred;
        setGeneral(generalInit);
        setAnswers({});
        setOtherTexts({});
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Не удалось загрузить');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, formatQuery]);

  useEffect(() => {
    if (!general.teacher_id || !directory) return;
    if (!isDirectoryTeacherId(directory, general.teacher_id)) return;
    if (!general.department_id) return;
    const row = directory.teachers.find((t) => t.id === general.teacher_id);
    if (row && row.departmentId !== general.department_id) {
      setGeneral((g) => ({ ...g, teacher_id: '' }));
    }
  }, [directory, general.department_id, general.teacher_id]);

  const invalidFieldIds = useMemo(() => new Set(missingFields.map((m) => m.id)), [missingFields]);

  const clearMissingField = useCallback((fieldId: string) => {
    setMissingFields((prev) => prev.filter((m) => m.id !== fieldId));
  }, []);

  const resetForm = useCallback(() => {
    if (!checklist) return;
    const generalInit = emptyGeneralFields(checklist.generalFields);
    const visitFormatField = checklist.generalFields.find((f) => f.id === 'visit_format');
    const preferred = preferredVisitFormatFromQuery(formatQuery, visitFormatField?.options);
    if (preferred) generalInit.visit_format = preferred;
    setGeneral(generalInit);
    setAnswers({});
    setOtherTexts({});
    setErr(null);
    setMissingFields([]);
    setDone(false);
    setPlatformFeedbackOpen(false);
  }, [checklist, formatQuery]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checklist) {
      setErr('Нет формы');
      return;
    }
    const missing = collectMissingLessonVisitFields(checklist, general, answers, otherTexts);
    if (missing.length) {
      setMissingFields(missing);
      setErr(null);
      scrollToFirstMissingField(missing);
      return;
    }
    setMissingFields([]);
    setSubmitting(true);
    setErr(null);
    try {
      const payloadAnswers = prepareLessonVisitAnswersForSubmit(checklist, answers, otherTexts);
      await postPublicLessonVisitResponse(token, { general: pulseContext ? { ...general, pulse_context: pulseContext } : general, answers: payloadAnswers });
      if (!allowMultipleResponses) {
        markDone(token);
      } else {
        clearDone(token);
      }
      setDone(true);
      if (!platformFeedbackAlreadyHandledInSession()) {
        setPlatformFeedbackOpen(true);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Не удалось отправить');
    } finally {
      setSubmitting(false);
    }
  };

  const cardCount = checklist ? 2 + checklist.sections.length : 2;

  if (loading) {
    if (embedded) {
      return (
        <div className={rootClass} aria-busy="true">
          <EmbeddedChecklistWait />
        </div>
      );
    }
    return (
      <MotionConfig reducedMotion="user">
        <div className={rootClass}>
          {embedded ? null : <PublicFormBackground />}
          <div className="public-form-stack">
            <motion.div
              className="card public-form-glass-card"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <motion.div
                className="muted"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              >
                Загрузка чек-листа…
              </motion.div>
              <motion.div
                style={{ marginTop: 12, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}
              >
                <motion.div
                  style={{ height: '100%', width: '40%', background: 'linear-gradient(90deg, transparent, rgba(227,6,19,0.85), transparent)' }}
                  animate={{ x: ['-100%', '280%'] }}
                  transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
                />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </MotionConfig>
    );
  }

  if (done) {
    return (
      <MotionConfig reducedMotion="user">
        <div className={rootClass}>
          {embedded ? null : <PublicFormBackground />}
          <div className="public-form-stack">
            <motion.div
              className="card public-form-glass-card"
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            >
              <motion.div
                className="public-done-icon"
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: [0, 8, -4, 0] }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 400, damping: 12 }}
                aria-hidden
              >
                ✓
              </motion.div>
              <h1 style={{ marginTop: '0.35rem' }}>Спасибо!</h1>
              <p className="muted">Чек-лист отправлен.</p>
              {allowMultipleResponses && (
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: '0.75rem' }}
                  onClick={resetForm}
                >
                  Заполнить ещё раз
                </button>
              )}
            </motion.div>
          </div>
        </div>
        <PlatformFeedbackModal
          open={platformFeedbackOpen}
          onClose={() => setPlatformFeedbackOpen(false)}
          source="lesson-visit-checklist"
        />
      </MotionConfig>
    );
  }

  if (err && !checklist) {
    return (
      <MotionConfig reducedMotion="user">
        <div className={rootClass}>
          {embedded ? null : <PublicFormBackground />}
          <div className="public-form-stack">
            <motion.div
              className="card public-form-glass-card"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <h1 style={{ marginTop: 0 }}>Чек-лист недоступен</h1>
              <p className="err">{err}</p>
            </motion.div>
          </div>
        </div>
      </MotionConfig>
    );
  }

  if (!checklist || !directory) return null;

  return (
    <MotionConfig reducedMotion="user">
      <div className={rootClass}>
        {embedded ? null : <PublicFormBackground />}
        <form className="public-form-stack" onSubmit={(e) => void onSubmit(e)}>
          <motion.div
            className="card public-form-glass-card"
            custom={0}
            variants={cardEnter}
            initial="hidden"
            animate="show"
          >
            <motion.h1 style={{ marginTop: 0 }} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              {title}
            </motion.h1>
            <p className="muted">Чек-лист посещения урока</p>
            <AnimatePresence>
              {err ? (
                <motion.p
                  className="err"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {err}
                </motion.p>
              ) : null}
              {missingFields.length > 0 ? <PublicFormValidationAlert missing={missingFields} /> : null}
            </AnimatePresence>
          </motion.div>

          <PublicCampusSlideshow active sources={photos?.map((p) => p.src) || undefined} />

          <motion.div
            className="card public-form-glass-card"
            custom={1}
            variants={cardEnter}
            initial="hidden"
            animate="show"
          >
            <strong className="public-question-title">Общая информация</strong>
            {checklist.generalFields.map((f) => (
              <GeneralFieldInput
                key={f.id}
                field={f}
                value={general[f.id] ?? ''}
                general={general}
                directory={directory}
                invalid={invalidFieldIds.has(`general-${f.id}`)}
                onChange={(patch) => {
                  setGeneral((g) => ({ ...g, ...patch }));
                  for (const id of Object.keys(patch)) clearMissingField(`general-${id}`);
                }}
              />
            ))}
          </motion.div>

          <AnimatePresence mode="popLayout">
            {checklist.sections.map((sec, i) => (
              <SectionBlock
                key={sec.id}
                section={sec}
                cardIndex={i + 2}
                answers={answers}
                otherTexts={otherTexts}
                invalidFieldIds={invalidFieldIds}
                onChange={(qid, val) => {
                  setAnswers((a) => ({ ...a, [qid]: val }));
                  clearMissingField(`question-${qid}`);
                }}
                onOtherTextChange={(qid, text) => {
                  setOtherTexts((m) => ({ ...m, [qid]: text }));
                  clearMissingField(`question-${qid}`);
                  clearMissingField(`question-${qid}-other`);
                }}
              />
            ))}
          </AnimatePresence>

          <motion.div
            className="public-submit-row"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(0.15 + cardCount * 0.04, 0.5) }}
          >
            <div className="public-submit-actions">
              <motion.button
                type="submit"
                className="btn primary public-btn-submit"
                disabled={submitting}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {submitting ? 'Отправка…' : 'Отправить чек-лист'}
              </motion.button>
            </div>
          </motion.div>
        </form>
      </div>
    </MotionConfig>
  );
}

export default function LessonVisitChecklistPublicPage() {
  return <LessonVisitChecklistForm />;
}

function GeneralFieldInput({
  field,
  value,
  general,
  directory,
  invalid,
  onChange,
}: {
  field: LessonVisitGeneralField;
  value: string;
  general: Record<string, string>;
  directory: LessonVisitDirectory;
  invalid?: boolean;
  onChange: (patch: Record<string, string>) => void;
}) {
  const [manualSubject, setManualSubject] = useState(false);
  const isCustomSubject = field.id === 'subject' && Boolean(value) && !field.options?.includes(value);
  const showSubjectInput = field.id === 'subject' && (manualSubject || isCustomSubject);
  const personKind = isVisitChecklistPersonField(field);
  const chairDepartments = visitChecklistChairDepartments(directory);
  const teacherGroups = visitChecklistObservedTeacherGroups(directory);
  const teacherChoices = visitChecklistObservedTeachers(directory).map((t) => t.name);

  return (
    <div
      id={`general-${field.id}`}
      className={invalid ? 'public-field-invalid' : undefined}
      style={{ marginTop: '0.75rem', padding: invalid ? '0.35rem' : undefined }}
    >
      <label style={{ display: 'block', marginBottom: '0.35rem' }}>
        <strong className="public-question-title" style={{ fontSize: '1rem' }}>
          {field.label}
          {field.required ? <span className="public-required-mark"> *</span> : null}
        </strong>
      </label>
      {field.type === 'date' ? (
        <input
          className="field"
          type="date"
          value={value}
          required={field.required}
          onChange={(e) => onChange({ [field.id]: e.target.value })}
        />
      ) : field.type === 'radio' && field.options ? (
        <div className="public-choice-row" role="radiogroup" aria-label={field.label}>
          {field.options.map((opt) => {
            const selected = value === opt;
            const selfAnalysis = field.id === 'visit_format' && isVisitFormatSelfAnalysisOption(opt);
            return (
              <motion.button
                key={opt}
                type="button"
                className={`public-choice-btn${selected ? ' is-selected' : ''}${selfAnalysis ? ' is-self-analysis' : ''}`}
                onClick={() => onChange({ [field.id]: opt })}
                aria-checked={selected}
                role="radio"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              >
                <span className="public-choice-dot" />
                <span>{field.id === 'visit_format' ? displayVisitFormatOptionLabel(opt) : opt}</span>
              </motion.button>
            );
          })}
        </div>
      ) : field.type === 'select' && field.options ? (
        <>
          <select
            className="field"
            value={value}
            required={field.required}
            aria-label={field.label}
            onChange={(e) => {
              setManualSubject(false);
              onChange({ [field.id]: e.target.value });
            }}
          >
            <option value="">— выберите предмет —</option>
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            {isCustomSubject && <option value={value}>{value}</option>}
          </select>
          {field.id === 'subject' && (
            <>
              <button
                type="button"
                className="public-choice-btn"
                style={{ marginTop: '0.5rem' }}
                aria-expanded={showSubjectInput}
                aria-controls="custom-subject"
                onClick={() => {
                  setManualSubject(!showSubjectInput);
                  onChange({ [field.id]: '' });
                }}
              >
                {showSubjectInput ? 'Выбрать из списка' : 'Добавить СВОЁ'}
              </button>
              {showSubjectInput && (
                <input
                  id="custom-subject"
                  className="field"
                  style={{ marginTop: '0.5rem' }}
                  type="text"
                  autoFocus
                  aria-label="Свой предмет"
                  placeholder="Введите название предмета"
                  value={value}
                  required={field.required}
                  onChange={(e) => onChange({ [field.id]: e.target.value })}
                  onBlur={() => onChange({ [field.id]: value.trim() })}
                />
              )}
            </>
          )}
        </>
      ) : field.type === 'department' ? (
        <select
          className="field"
          value={value}
          required={field.required}
          onChange={(e) => onChange({ [field.id]: e.target.value })}
        >
          <option value="">— выберите кафедру —</option>
          {chairDepartments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      ) : personKind === 'teacher' ? (
        <PersonSelectField
          choices={teacherChoices}
          groups={teacherGroups}
          value={visitTeacherDisplayName(directory, value)}
          locale="ru"
          placeholder="Начните вводить фамилию педагога…"
          ariaLabel={field.label}
          allowManualEntry
          notInListLabel="Моей фамилии нет в списке"
          manualNamePlaceholder="Фамилия Имя Отчество"
          onChange={(name) => {
            const resolved = resolveVisitTeacherChoice(directory, name, general.department_id);
            onChange({
              teacher_id: resolved.teacherId,
              ...(resolved.departmentId ? { department_id: resolved.departmentId } : {}),
            });
          }}
        />
      ) : personKind === 'visitor' ? (
        <PersonSelectField
          choices={visitChecklistVisitorNames(directory)}
          groups={visitChecklistVisitorGroups(directory)}
          value={value}
          locale="ru"
          placeholder="Начните вводить фамилию…"
          ariaLabel={field.label}
          allowManualEntry
          notInListLabel="Моей фамилии нет в списке"
          manualNamePlaceholder="Фамилия Имя Отчество"
          onChange={(name) => onChange({ [field.id]: name })}
        />
      ) : (
        <PublicDictationField
          multiline={false}
          inputClassName="field"
          value={value}
          onChange={(v) => onChange({ [field.id]: v })}
        />
      )}
    </div>
  );
}

function questionRepeatsSectionTitle(question: LessonVisitQuestion, section: LessonVisitSection): boolean {
  if (question.type !== 'text') return false;
  const qText = question.text.trim();
  const sectionTitle = section.title.trim();
  return qText === sectionTitle || qText === section.title.trim();
}

function SectionBlock({
  section,
  cardIndex,
  answers,
  otherTexts,
  invalidFieldIds,
  onChange,
  onOtherTextChange,
}: {
  section: LessonVisitSection;
  cardIndex: number;
  answers: Record<string, string | string[]>;
  otherTexts: Record<string, string>;
  invalidFieldIds: Set<string>;
  onChange: (qid: string, val: string | string[]) => void;
  onOtherTextChange: (qid: string, text: string) => void;
}) {
  const sectionTitle = section.code ? `${section.code}. ${section.title}` : section.title;
  const soleQuestion = section.questions.length === 1 ? section.questions[0] : null;
  const hideSoleQuestionLabel = soleQuestion != null && questionRepeatsSectionTitle(soleQuestion, section);

  return (
    <motion.div
      className="card public-form-glass-card"
      custom={cardIndex}
      variants={cardEnter}
      initial="hidden"
      animate="show"
      layout
    >
      <strong className="public-question-title">{sectionTitle}</strong>
      {section.questions.map((q) => (
        <QuestionInput
          key={q.id}
          question={q}
          value={answers[q.id]}
          otherText={otherTexts[q.id] ?? ''}
          invalid={invalidFieldIds.has(`question-${q.id}`)}
          hideLabel={hideSoleQuestionLabel && q.id === soleQuestion.id}
          onChange={(v) => onChange(q.id, v)}
          onOtherTextChange={(text) => onOtherTextChange(q.id, text)}
        />
      ))}
    </motion.div>
  );
}

function QuestionInput({
  question,
  value,
  otherText,
  invalid,
  hideLabel,
  onChange,
  onOtherTextChange,
}: {
  question: LessonVisitQuestion;
  value: string | string[] | undefined;
  otherText: string;
  invalid?: boolean;
  hideLabel?: boolean;
  onChange: (v: string | string[]) => void;
  onOtherTextChange: (text: string) => void;
}) {
  const label = question.code ? `${question.code} ${question.text}` : question.text;
  const wrapProps = {
    id: `question-${question.id}`,
    className: invalid ? 'public-field-invalid' : undefined,
    style: { marginTop: '0.85rem', padding: invalid ? '0.35rem' : undefined },
  };

  if (question.type === 'text') {
    return (
      <div {...wrapProps}>
        {!hideLabel ? (
          <label style={{ display: 'block', marginBottom: '0.35rem' }}>
            <strong className="public-question-title" style={{ fontSize: '1rem' }}>
              {label}
              {question.required ? <span className="public-required-mark"> *</span> : null}
            </strong>
          </label>
        ) : null}
        <PublicDictationField
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => onChange(v)}
        />
      </div>
    );
  }

  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const isMulti = question.type === 'checkbox' || question.allowMultiple;
  const showOtherInput = isLessonVisitOtherSelected(value, question);

  return (
    <div {...wrapProps}>
      <label style={{ display: 'block', marginBottom: '0.35rem' }}>
        <strong className="public-question-title" style={{ fontSize: '1rem' }}>
          {label}
          {question.required ? <span className="public-required-mark"> *</span> : null}
        </strong>
      </label>
      {question.hint ? (
        <p className="muted" style={{ fontSize: '0.82rem', margin: '0 0 0.35rem' }}>
          {question.hint}
        </p>
      ) : null}
      <div className="public-choice-row" role={isMulti ? undefined : 'radiogroup'} aria-label={label}>
        {question.options.map((opt) => {
          const checked = selected.includes(opt);
          const isOtherOpt = isLessonVisitOtherOption(opt);
          return (
            <div key={opt} style={isOtherOpt ? { width: '100%' } : undefined}>
              <motion.button
                type="button"
                className={`public-choice-btn${checked ? ' is-selected' : ''}`}
                onClick={() => {
                  if (isMulti) {
                    const next = checked ? selected.filter((x) => x !== opt) : [...selected, opt];
                    onChange(next);
                    if (isOtherOpt && checked) onOtherTextChange('');
                  } else {
                    onChange(opt);
                    if (isOtherOpt && !checked) onOtherTextChange('');
                    else if (!isOtherOpt) onOtherTextChange('');
                  }
                }}
                aria-checked={isMulti ? undefined : checked}
                aria-pressed={isMulti ? checked : undefined}
                role={isMulti ? undefined : 'radio'}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              >
                <span className="public-choice-dot" />
                <span>{opt}</span>
              </motion.button>
            </div>
          );
        })}
      </div>
      {showOtherInput ? (
        <div id={`question-${question.id}-other`} style={{ marginTop: '0.35rem' }}>
          <PublicDictationField
            multiline={false}
            inputClassName="public-other-input"
            value={otherText}
            onChange={onOtherTextChange}
            placeholder="Уточните…"
          />
        </div>
      ) : null}
    </div>
  );
}
