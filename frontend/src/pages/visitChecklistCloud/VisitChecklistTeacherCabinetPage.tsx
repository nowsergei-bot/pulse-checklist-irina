import '../../styles/lessonAnalytics.css';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLessonVisitProject, getVisitChecklistDashboardMe } from '../../api/visitChecklist';
import { type VisitChecklistDashCard, type VisitChecklistPublishedMine } from '../../api/visitChecklist';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useCabinetLoadOverlay } from '../../hooks/useCabinetLoadOverlay';
import { safePdfFileBase } from '../../lib/lessonAnalytics/safePdfFileBase';
import { buildTeacherCardInsights } from '../../lib/lessonVisitChecklist/visitChecklistCardInsights';
import { VCD_PDF_HIDE_CLASS } from '../../lib/lessonVisitChecklist/visitChecklistCloudPdf';
import { staffPortraitUrl } from '../../lib/staffPhoto/portraitUrl';
import {
  barFillColor,
  countVisitKinds,
  AI_NARRATIVE_PROVIDER_LABEL,
  displayTeacherTitle,
  formatVisitChecklistDate,
  teacherGreetingName,
  isSelfAnalysisFormat,
  scorePct,
  scorePctLabel,
  trafficColor,
  visitCountLabel,
} from '../../lib/lessonVisitChecklist/visitChecklistCloudUi';
import { resolveFullTeacherName } from '../../lib/lessonVisitChecklist/visitChecklistPeople';
import { isUnknownTeacherLabel } from '../../lib/lessonVisitChecklist/visitChecklistScheduleMatch';
import type { LessonVisitDirectory } from '../../lib/lessonVisitChecklist/types';
import { aggregateObserveVsSelf } from '../../lib/lessonVisitChecklist/visitChecklistCompare';
import {
  liveVisitsFromCard,
  rankRubricItems,
  summarizeWatchers,
  visitTrendPoints,
} from '../../lib/lessonVisitChecklist/visitChecklistLiveCharts';
import '../../moEngagementDashboard.css';
import { VisitChecklistTeacherAiReportView } from './VisitChecklistAiReport';
import { VisitAnswerList } from './VisitChecklistAnswerList';
import { VisitChecklistCardIdentity } from './VisitChecklistCardIdentity';
import VisitChecklistCardInsightsPanel, { VisitChecklistDraftBlock } from './VisitChecklistCardInsightsPanel';
import { VisitChecklistTeacherCharts } from './VisitChecklistCloudCharts';
import './visitChecklistCloud.css';
import VisitReportInbox from '../../components/visitReportDelivery/VisitReportInbox';

function pct(ratio: number | null | undefined): string {
  return `${scorePct(ratio)}%`;
}

export default function VisitChecklistTeacherCabinetPage() {
  const [cards, setCards] = useState<VisitChecklistPublishedMine[] | null>(null);
  const [directory, setDirectory] = useState<LessonVisitDirectory | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  useDocumentTitle('Моя обратная связь по урокам');
  useCabinetLoadOverlay({
    active: cards == null && !err,
    kind: 'checklist',
    // PDF failures must not re-open the stage overlay (pointer-events lock).
    error: cards == null ? err : null,
  });

  useEffect(() => {
    let cancelled = false;
    void getVisitChecklistDashboardMe()
      .then((data) => {
        if (!cancelled) setCards(data.cards);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Не удалось загрузить карточку');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const projectId = cards?.[0]?.project_id;
    if (!projectId) return;
    let cancelled = false;
    void getLessonVisitProject(projectId)
      .then((pack) => {
        if (!cancelled) setDirectory(pack?.draft?.directory ?? null);
      })
      .catch(() => {
        if (!cancelled) setDirectory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cards]);

  const teacherTitle = (label: string | null | undefined) =>
    resolveFullTeacherName(label, directory) || displayTeacherTitle(label);

  async function exportCard(item: VisitChecklistPublishedMine) {
    const key = `${item.project_id}-${item.teacher_key}`;
    setPdfBusy(key);
    try {
      const { downloadTeacherCardPdf } = await import('./pdfBuilder/generateTeacherCardPdf.ts');
      const { defaultTeacherCardTemplate } = await import('./pdfBuilder/defaultTemplate.ts');
      await downloadTeacherCardPdf({
        card: item,
        template: defaultTeacherCardTemplate(),
        context: {
          projectTitle: item.project_title,
          teacherName: teacherTitle(item.card.teacher_label),
        },
        fileName: `${safePdfFileBase(teacherTitle(item.card.teacher_label))}.pdf`,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось собрать PDF');
    } finally {
      setPdfBusy(null);
    }
  }

  return (
    <div className="page vcd-page mo-eng-dash-page">
      <header className="mo-eng-dash-hero vcd-hero">
        <p className="mo-eng-dash-kicker">Кабинет педагога</p>
        <h1 className="mo-eng-dash-hero-title">Моя обратная связь</h1>
        <p className="vcd-hero__lead">
          Здесь появляется карточка после того, как методист отправит её в кабинет.
        </p>
      </header>
      <VisitReportInbox />
      {err ? (
        <p className="err card glass-surface" style={{ marginTop: '1rem', padding: '0.85rem' }}>
          {err}
        </p>
      ) : null}
      {cards == null && !err ? (
        <div className="card glass-surface vcd-placeholder" style={{ marginTop: '1rem' }}>
          null
        </div>
      ) : null}
      {cards && cards.length === 0 ? (
        <div className="card glass-surface" style={{ marginTop: '1rem', padding: '1rem' }}>
          <p className="muted" style={{ margin: 0 }}>
            Пока нет опубликованной обратной связи. Когда методист отправит карточку, она появится здесь.
          </p>
        </div>
      ) : null}
      {(cards || [])
        .filter((item) => !isUnknownTeacherLabel(item.card.teacher_label))
        .map((item) => {
        const card = item.card;
        const stats = card.stats || {};
        const visits = stats.visits || card.visits || [];
        const key = `${item.project_id}-${item.teacher_key}`;
        const dashCard = {
          teacher_key: item.teacher_key,
          teacher_label: card.teacher_label,
          department: card.department,
          visit_count: stats.visit_count ?? visits.length,
          photo_url: card.photo_url,
          photo_thumb_url: card.photo_thumb_url,
          stats: { ...stats, visits },
          narrative: card.narrative || '',
          status: 'agreed',
        } as VisitChecklistDashCard;
        const liveVisits = liveVisitsFromCard(dashCard);
        const insights = buildTeacherCardInsights({ card: dashCard, liveVisits });
        const mix = countVisitKinds(visits);
        return (
          <article
            key={key}
            className="card glass-surface vcd-card"
            style={{ marginTop: '1rem' }}
          >
            <VisitChecklistCardIdentity
              name={teacherTitle(card.teacher_label)}
              large
              photoUrl={staffPortraitUrl(card)}
              actionsClassName={`vcd-card__head-actions ${VCD_PDF_HIDE_CLASS}`}
              actions={
                <button type="button" className="btn btn-sm primary" disabled={pdfBusy === key} onClick={() => void exportCard(item)}>
                  {pdfBusy === key ? 'Собираем PDF…' : 'Скачать PDF'}
                </button>
              }
              meta={
                <>
                  {card.department || item.project_title} · {visitCountLabel(stats.visit_count ?? visits.length)} ·{' '}
                  <span style={{ color: trafficColor(stats.score_ratio), fontWeight: 700 }}>
                    {scorePctLabel(stats.score_ratio)}
                  </span>
                </>
              }
            >
              <p className="vcd-chips" aria-label="Состав записей">
                <span className="vcd-chip vcd-chip--observe">Наблюдение · {mix.observe}</span>
                <span className="vcd-chip vcd-chip--self">Самоанализ · {mix.self}</span>
                {insights.badges.gap ? <span className="vcd-badge vcd-badge--gap">расхождение</span> : null}
                {insights.badges.repeat ? <span className="vcd-badge vcd-badge--repeat">повтор</span> : null}
              </p>
            </VisitChecklistCardIdentity>
            <VisitChecklistTeacherCharts
              card={dashCard}
              observeSelf={aggregateObserveVsSelf(liveVisits)}
              trend={visitTrendPoints(liveVisits)}
              watchers={summarizeWatchers(liveVisits)}
              liveVisits={liveVisits}
            />
            <VisitChecklistCardInsightsPanel
              insights={insights}
              weakItems={rankRubricItems(liveVisits, { limit: 3, direction: 'weak' })}
              strongItems={rankRubricItems(liveVisits, { limit: 3, direction: 'strong' })}
            />
            {stats.sections?.length ? (
              <div className="vcd-bars">
                {stats.sections.map((sec) => {
                  const color = barFillColor(sec.fillRatio);
                  return (
                  <div key={sec.title} className="vcd-bar" style={{ ['--vcd-fill' as string]: color }}>
                    <span className="vcd-bar__label">{sec.title}</span>
                    <span className="vcd-bar__track">
                      <span className="vcd-bar__fill" style={{ width: pct(sec.fillRatio) }} />
                    </span>
                    <span className="vcd-bar__val">{pct(sec.fillRatio)}</span>
                  </div>
                  );
                })}
              </div>
            ) : null}
            {!card.ai_report ? <VisitChecklistDraftBlock draft={insights.draft} compact /> : null}
            <p className="muted" style={{ margin: '0.85rem 0 0.2rem', fontSize: '0.75rem' }}>
              {AI_NARRATIVE_PROVIDER_LABEL}
            </p>
            {card.ai_report ? (
              <VisitChecklistTeacherAiReportView
                report={card.ai_report}
                greeting={teacherGreetingName(teacherTitle(card.teacher_label))}
              />
            ) : card.narrative ? (
              <p style={{ whiteSpace: 'pre-wrap', marginTop: '0.35rem', lineHeight: 1.55 }}>{card.narrative}</p>
            ) : (
              <p className="muted" style={{ marginTop: '0.35rem' }}>
                Текст методиста не добавлен.
              </p>
            )}
            <div className="vcd-visits">
              {visits.map((visit) => {
                const liveVisit = liveVisits.find(
                  (row) =>
                    (!visit.date || row.date === String(visit.date).slice(0, 10)) &&
                    (!visit.class_name || row.class_name === visit.class_name) &&
                    (!visit.subject || row.subject === visit.subject),
                );
                return (
                <article
                  key={`${visit.id}-${visit.date}`}
                  className={isSelfAnalysisFormat(visit.format) ? 'vcd-visit vcd-visit--self' : 'vcd-visit'}
                >
                  <p className="vcd-visit__meta">
                    <span className={isSelfAnalysisFormat(visit.format) ? 'vcd-chip vcd-chip--self' : 'vcd-chip vcd-chip--observe'}>
                      {isSelfAnalysisFormat(visit.format) ? 'Самоанализ' : 'Наблюдение'}
                    </span>
                    <span>
                      {formatVisitChecklistDate(visit.date)} · {visit.class_name || 'класс'} · {visit.subject || 'предмет'}
                    </span>
                  </p>
                  {visit.summary ? <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap' }}>{visit.summary}</p> : null}
                  <VisitAnswerList visit={visit} liveVisit={liveVisit} />
                </article>
                );
              })}
            </div>
          </article>
        );
      })}
      <p style={{ marginTop: '1rem' }}>
        <Link to="/cabinet/feedback" className="btn btn-sm">
          ← К формам чек-листа
        </Link>
      </p>
    </div>
  );
}
