import { type VisitChecklistDashCard } from '../../api/visitChecklist';
import type { LessonVisitChecklistConfig, LessonVisitDirectory, LessonVisitResponseRow } from '../../lib/lessonVisitChecklist/types';
import {
  buildVisitQaSections,
  findResponseForVisit,
  findRubricItemByCode,
  responseMatchesTeacher,
  type VisitQaItem,
  type VisitQaSection,
} from '../../lib/lessonVisitChecklist/visitChecklistCardAnswers';
import { highlightsForVisit, type VisitHighlights } from '../../lib/lessonVisitChecklist/visitChecklistCardInsights';
import { formatEarnedMax, itemTrafficColor } from '../../lib/lessonVisitChecklist/visitChecklistCloudUi';
import type { LiveVisitScore } from '../../lib/lessonVisitChecklist/visitChecklistLiveCharts';

function AnswerLine({
  code,
  text,
  pick,
  unanswered,
  earned,
  max,
  traffic,
}: {
  code?: string | null;
  text?: string | null;
  pick?: string | null;
  unanswered: boolean;
  earned: number;
  max: number;
  traffic: string;
}) {
  return (
    <p className="vcd-answers__q" style={{ ['--vcd-item' as string]: traffic }}>
      <span className="vcd-answers__dot" aria-hidden />
      <span>
        {code ? <strong>{code}</strong> : null}
        {text ? `${code ? ' — ' : ''}${text}` : ''}
        {': '}
        {unanswered ? (
          <span className="vcd-answers__empty">нет ответа</span>
        ) : (
          <span className="vcd-answers__pick">{pick}</span>
        )}
      </span>
      {max > 0 ? <span className="vcd-answers__pts">{formatEarnedMax(earned, max)}</span> : <span />}
    </p>
  );
}

function qaHighlights(sections: VisitQaSection[]): VisitHighlights {
  const answered = sections.flatMap((sec) => sec.items).filter((item) => !item.unanswered && item.maxPoints > 0);
  const toHi = (item: VisitQaItem) => ({
    code: item.code,
    title: item.text,
    score_pct: item.maxPoints > 0 ? Math.round((item.earnedPoints / item.maxPoints) * 100) : 0,
    earned: item.earnedPoints,
    max: item.maxPoints,
  });
  const best = [...answered]
    .sort((a, b) => b.earnedPoints / b.maxPoints - a.earnedPoints / a.maxPoints)
    .slice(0, 3)
    .map(toHi);
  const worst = [...answered]
    .sort((a, b) => a.earnedPoints / a.maxPoints - b.earnedPoints / b.maxPoints)
    .slice(0, 3)
    .map(toHi);
  return { best, worst };
}

function HighlightBlock({ title, items, tone }: { title: string; items: VisitHighlights['best']; tone: 'ok' | 'bad' }) {
  if (!items.length) return null;
  return (
    <div className={`vcd-hi vcd-hi--${tone}`}>
      <p className="vcd-insight__label">{title}</p>
      <ul className="vcd-insight__list">
        {items.map((item) => (
          <li key={`${tone}-${item.code}`}>
            <span>{item.title}</span>
            <strong>{item.score_pct}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VisitAnswerList({
  visit,
  teacherKey,
  teacherLabel,
  responses,
  checklist,
  directory,
  liveVisit,
}: {
  visit: NonNullable<VisitChecklistDashCard['stats']['visits']>[number];
  teacherKey?: string;
  teacherLabel?: string;
  responses?: LessonVisitResponseRow[];
  checklist?: LessonVisitChecklistConfig | null;
  directory?: LessonVisitDirectory | null;
  liveVisit?: LiveVisitScore | null;
}) {
  const teacherRows = (responses || []).filter((row) =>
    teacherKey ? responseMatchesTeacher(row, teacherKey, teacherLabel || '', directory) : true,
  );
  const row = findResponseForVisit(visit, teacherRows.length ? teacherRows : responses || []);
  const qa: VisitQaSection[] = row && checklist ? buildVisitQaSections(checklist, row.answers) : [];
  const hi = qa.length ? qaHighlights(qa) : liveVisit ? highlightsForVisit(liveVisit) : { best: [], worst: [] };
  if (!qa.length) {
    const sections = visit.sections || [];
    const hasMarks = sections.some(
      (sec) => (sec.marks && sec.marks.length) || (sec.unanswered_codes && sec.unanswered_codes.length),
    );
    if (!hasMarks && !hi.best.length && !hi.worst.length) {
      return (
        <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.8rem' }}>
          Не удалось сопоставить ответы этой записи с формой чек-листа.
        </p>
      );
    }
    return (
      <div className="vcd-answers">
        <div className="vcd-hi-grid">
          <HighlightBlock title="Высокие оценки" items={hi.best} tone="ok" />
          <HighlightBlock title="Низкие оценки" items={hi.worst} tone="bad" />
        </div>
        {sections.map((sec) => (
          <details key={sec.code || sec.title} className="vcd-answers__sec">
            <summary>
              {sec.title || 'Раздел'}
              {sec.max ? ` · ${Math.round(((Number(sec.earned) || 0) / Number(sec.max)) * 100)}%` : ''}
              {sec.max ? ` · ${formatEarnedMax(sec.earned, sec.max)}` : ''}
            </summary>
            {(sec.marks || []).map((mark) => {
              const unanswered = !String(mark.pick || '').trim();
              const max = Number(mark.max) || findRubricItemByCode(String(mark.code || ''))?.maxPoints || 0;
              const earned = unanswered ? 0 : Number(mark.pts) || 0;
              const ratio = max > 0 ? earned / max : null;
              return (
                <AnswerLine
                  key={`${mark.code}-${mark.pick}`}
                  code={mark.code}
                  text={mark.indicator}
                  pick={mark.pick}
                  unanswered={unanswered}
                  earned={earned}
                  max={max}
                  traffic={itemTrafficColor(ratio, unanswered || max <= 0)}
                />
              );
            })}
            {(sec.unanswered_codes || []).map((code) => {
              const max = findRubricItemByCode(code)?.maxPoints || 0;
              return (
                <AnswerLine
                  key={`empty-${code}`}
                  code={code}
                  pick=""
                  unanswered
                  earned={0}
                  max={max}
                  traffic={itemTrafficColor(0, true)}
                />
              );
            })}
          </details>
        ))}
      </div>
    );
  }
  return (
    <div className="vcd-answers">
      <div className="vcd-hi-grid">
        <HighlightBlock title="Высокие оценки" items={hi.best} tone="ok" />
        <HighlightBlock title="Низкие оценки" items={hi.worst} tone="bad" />
      </div>
      {qa.map((sec) => {
        const answered = sec.items.filter((it) => !it.unanswered).length;
        return (
          <details key={sec.code || sec.title} className="vcd-answers__sec">
            <summary>
              {sec.title} · {answered}/{sec.items.length}
            </summary>
            {sec.items.map((item) => (
              <AnswerLine
                key={item.code}
                code={item.code}
                text={item.text}
                pick={item.pick}
                unanswered={item.unanswered}
                earned={item.earnedPoints}
                max={item.maxPoints}
                traffic={item.traffic}
              />
            ))}
          </details>
        );
      })}
    </div>
  );
}
