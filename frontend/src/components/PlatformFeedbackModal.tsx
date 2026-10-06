import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { getPublicSurvey } from '../api/dashboards';
import { submitResponse } from '../api/surveys';
import {
  markPlatformFeedbackHandledInSession,
  newPlatformFeedbackRespondentId,
  PLATFORM_FEEDBACK_ACCESS_LINK,
} from '../lib/platformFeedback';
import type { Question } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Контекст для аналитики в respondent_id (не персональные данные). */
  source: 'survey' | 'lesson-visit-checklist';
};

function questionByOrder(questions: Question[], order: number): Question | undefined {
  const sorted = [...questions].sort((a, b) => a.sort_order - b.sort_order);
  return sorted[order];
}

export default function PlatformFeedbackModal({ open, onClose, source }: Props) {
  const titleId = useId();
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [issues, setIssues] = useState('');
  const [mic, setMic] = useState('');
  const [other, setOther] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const qIssues = useMemo(() => questionByOrder(questions, 0), [questions]);
  const qMic = useMemo(() => questionByOrder(questions, 1), [questions]);
  const qOther = useMemo(() => questionByOrder(questions, 2), [questions]);

  const micOptions = useMemo(() => {
    const opts = qMic?.options;
    if (Array.isArray(opts)) return opts.map(String);
    return ['Да', 'Нет', 'Не пробовал(а)'];
  }, [qMic]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    setSubmitErr(null);
    setSubmitted(false);
    void getPublicSurvey(PLATFORM_FEEDBACK_ACCESS_LINK)
      .then((s) => {
        if (cancelled) return;
        setQuestions(s.questions || []);
      })
      .catch((e) => {
        if (cancelled) return;
        const raw = e instanceof Error ? e.message : 'Не удалось загрузить форму';
        const friendly =
          /not found|not published/i.test(raw)
            ? 'Форма отзыва ещё не настроена на сервере. Можно закрыть — чек-лист уже отправлен.'
            : raw;
        setLoadErr(friendly);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const dismiss = useCallback(() => {
    markPlatformFeedbackHandledInSession();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!qIssues && !qMic && !qOther) {
      dismiss();
      return;
    }
    const answers: { question_id: number; value: string }[] = [];
    if (qIssues && issues.trim()) answers.push({ question_id: qIssues.id, value: issues.trim() });
    if (qMic && mic) answers.push({ question_id: qMic.id, value: mic });
    if (qOther && other.trim()) answers.push({ question_id: qOther.id, value: other.trim() });

    if (!answers.length) {
      dismiss();
      return;
    }

    setSubmitting(true);
    setSubmitErr(null);
    try {
      const rid = `${source}:${newPlatformFeedbackRespondentId()}`;
      await submitResponse(PLATFORM_FEEDBACK_ACCESS_LINK, rid, answers);
      setSubmitted(true);
      markPlatformFeedbackHandledInSession();
      window.setTimeout(() => onClose(), 900);
    } catch (ex) {
      setSubmitErr(ex instanceof Error ? ex.message : 'Не удалось отправить');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="platform-feedback-modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
        >
          <button type="button" className="platform-feedback-modal-backdrop" aria-label="Закрыть" onClick={dismiss} />
          <motion.div
            className="card public-form-glass-card platform-feedback-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <h2 id={titleId} className="platform-feedback-modal-title">
              Как вам платформа?
            </h2>
            <p className="muted platform-feedback-modal-lead">
              Необязательно. Помогите улучшить Пульс — можно пропустить.
            </p>

            {loading ? (
              <p className="muted">Загрузка…</p>
            ) : loadErr ? (
              <>
                <p className="err">{loadErr}</p>
                <div className="platform-feedback-modal-actions">
                  <button type="button" className="btn" onClick={dismiss}>
                    Закрыть
                  </button>
                </div>
              </>
            ) : submitted ? (
              <p className="muted">Спасибо за отзыв!</p>
            ) : (
              <form className="platform-feedback-modal-form" onSubmit={(e) => void onSubmit(e)}>
                <label className="platform-feedback-field">
                  <span className="public-question-title">Что не работает?</span>
                  <textarea
                    className="field"
                    rows={3}
                    value={issues}
                    onChange={(ev) => setIssues(ev.target.value)}
                    placeholder="Опишите проблему, если есть"
                    disabled={submitting}
                  />
                </label>

                <fieldset className="platform-feedback-field">
                  <legend className="public-question-title">Микрофон работает?</legend>
                  <div className="public-choice-row">
                    {micOptions.map((opt) => (
                      <label key={opt} className="public-choice-btn">
                        <input
                          type="radio"
                          name="platform-feedback-mic"
                          value={opt}
                          checked={mic === opt}
                          onChange={() => setMic(opt)}
                          disabled={submitting}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="platform-feedback-field">
                  <span className="public-question-title">Другое о качестве</span>
                  <textarea
                    className="field"
                    rows={2}
                    value={other}
                    onChange={(ev) => setOther(ev.target.value)}
                    placeholder="Замечания, пожелания"
                    disabled={submitting}
                  />
                </label>

                {submitErr ? <p className="err">{submitErr}</p> : null}

                <div className="platform-feedback-modal-actions">
                  <button type="button" className="btn" onClick={dismiss} disabled={submitting}>
                    Пропустить
                  </button>
                  <button type="submit" className="btn primary" disabled={submitting}>
                    {submitting ? 'Отправка…' : 'Отправить'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
