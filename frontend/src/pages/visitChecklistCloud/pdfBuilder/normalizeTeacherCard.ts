import type { VisitChecklistDashCard, VisitChecklistPublishedMine, VisitChecklistTeacherAiReport } from '../../../api/visitChecklist.ts';
import { buildTeacherCardInsights } from '../../../lib/lessonVisitChecklist/visitChecklistCardInsights.ts';
import { aggregateObserveVsSelf, buildCompareResult, type CompareMode } from '../../../lib/lessonVisitChecklist/visitChecklistCompare.ts';
import {
  countVisitKinds,
  displayTeacherTitle,
  formatVisitChecklistDate,
  scorePct,
} from '../../../lib/lessonVisitChecklist/visitChecklistCloudUi.ts';
import { liveVisitsFromCard, summarizeWatchers, visitTrendPoints } from '../../../lib/lessonVisitChecklist/visitChecklistLiveCharts.ts';
import type { PdfCardStatus, PdfCompareMode, TeacherCardPdfModel } from './types.ts';

function teacherAiReportText(report: VisitChecklistTeacherAiReport | null | undefined): string {
  if (!report) return '';
  const parts = [
    report.title,
    report.basis,
    report.summary,
    ...(report.strengths || []).map((row) => [row.title, row.evidence, row.meaning].filter(Boolean).join(' — ')),
    ...(report.patterns || []),
    ...(report.growthAreas || []).map((row) =>
      [row.title, row.evidence, row.whyItMatters, row.recommendation].filter(Boolean).join(' — '),
    ),
    ...(report.nextLessonActions || []),
    report.dynamics,
    ...(report.reflectionQuestions || []),
    ...(report.nextObservationFocus || []),
    report.conclusion,
    report.limitations,
  ].filter((row) => String(row || '').trim());
  return parts.join('\n\n');
}

export type TeacherCardPdfContext = {
  projectTitle?: string | null;
  generatedAt?: string;
  teacherName?: string | null;
  compareMode?: PdfCompareMode;
  teachers?: Array<{
    teacher_key: string;
    department?: string | null;
    score_ratio: number;
    sections?: Array<{ code?: string; title?: string; fillRatio?: number | null; earned?: number | null; max?: number | null }>;
  }>;
  schoolRatio?: number | null;
  schoolSections?: Array<{ code?: string; title?: string; fillRatio?: number | null }>;
  photoWarning?: string | null;
  loadErrors?: string[];
};

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
  return letters || 'П';
}

function statusOf(card: {
  published_at?: string | null;
  published?: boolean;
  status?: string | null;
}): { status: PdfCardStatus; label: string } {
  if (card.published_at || card.published) return { status: 'published', label: 'Опубликовано' };
  if (String(card.status || '') === 'agreed') return { status: 'agreed', label: 'Согласовано' };
  return { status: 'draft', label: 'Черновик' };
}

function dashFromPublished(item: VisitChecklistPublishedMine): VisitChecklistDashCard {
  const stats = item.card.stats || {};
  const visits = stats.visits || item.card.visits || [];
  return {
    teacher_key: item.teacher_key,
    teacher_label: item.card.teacher_label,
    department: item.card.department,
    visit_count: stats.visit_count ?? visits.length,
    photo_url: item.card.photo_url,
    photo_thumb_url: item.card.photo_thumb_url,
    stats: { ...stats, visits },
    narrative: item.card.narrative || '',
    ai_conclusions: item.card.ai_conclusions,
    ai_report: item.card.ai_report,
    status: 'agreed',
    published_at: item.published_at || item.card.published_at,
    published: true,
  };
}

function pickNarrative(card: VisitChecklistDashCard): { title: string; body: string; source: string | null } {
  const manual = String(card.narrative || '').trim();
  const source = card.narrative_source || null;
  if (manual) {
    return { title: 'Методическая справка', body: manual, source };
  }
  const reportText = teacherAiReportText(card.ai_report);
  if (reportText.trim()) {
    return { title: card.ai_report?.title || 'Методическая справка', body: reportText.trim(), source: 'ai_report' };
  }
  const c = card.ai_conclusions;
  const parts = [c?.summary, ...(c?.strengths || []), ...(c?.growth || []), ...(c?.recommendations || [])]
    .map((row) => String(row || '').trim())
    .filter(Boolean);
  if (parts.length) return { title: 'Методическая справка', body: parts.join('\n\n'), source: 'ai_conclusions' };
  return { title: 'Методическая справка', body: '', source: null };
}

function numOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeTeacherCardForPdf(
  input: VisitChecklistDashCard | VisitChecklistPublishedMine,
  context: TeacherCardPdfContext = {},
): TeacherCardPdfModel {
  const card: VisitChecklistDashCard =
    'card' in input && input.card ? dashFromPublished(input) : (input as VisitChecklistDashCard);
  const name = String(context.teacherName || displayTeacherTitle(card.teacher_label)).trim() || 'Педагог без ФИО';
  const liveVisits = liveVisitsFromCard(card);
  const insights = buildTeacherCardInsights({ card, liveVisits });
  const mix = countVisitKinds(card.stats?.visits || []);
  const watchers = summarizeWatchers(liveVisits);
  const trend = visitTrendPoints(liveVisits);
  const observeSelf = aggregateObserveVsSelf(liveVisits);
  const st = statusOf(card);
  const compareMode = (context.compareMode || 'department') as CompareMode;
  const compare = buildCompareResult({
    mode: compareMode === 'none' ? 'none' : compareMode,
    teacherRatio: card.stats?.score_ratio,
    teacherSections: card.stats?.sections || [],
    teachers: context.teachers || [],
    current: { teacher_key: card.teacher_key, department: card.department },
    schoolSections: context.schoolSections,
    schoolRatio: context.schoolRatio,
  });
  const last = card.stats?.last_visit?.date || liveVisits[liveVisits.length - 1]?.date || null;
  const narrative = pickNarrative(card);
  const visitCount = numOrNull(card.stats?.visit_count) ?? (card.stats?.visits?.length || liveVisits.length || null);
  return {
    teacherName: name,
    initials: initialsOf(name),
    department: String(card.department || '').trim() || 'Кафедра не указана',
    projectTitle: String(context.projectTitle || '').trim() || 'Анализ уроков',
    generatedAt: context.generatedAt || new Date().toISOString().slice(0, 10),
    status: st.status,
    statusLabel: st.label,
    photoKey: card.photo_url || card.photo_thumb_url ? 'photo' : null,
    photoWarning: context.photoWarning || null,
    kpis: {
      scorePct: card.stats?.score_ratio == null ? null : scorePct(card.stats.score_ratio),
      visitCount,
      observeCount: mix.observe || null,
      selfCount: mix.self || null,
      lastVisit: last ? formatVisitChecklistDate(last) : null,
    },
    sections: (card.stats?.sections || []).map((sec) => ({
      code: String(sec.code || ''),
      title: String(sec.title || sec.code || ''),
      earned: numOrNull(sec.earned),
      max: numOrNull(sec.max),
      fillPct: sec.fillRatio == null && (sec.max == null || !sec.max) ? null : scorePct(sec.fillRatio ?? (Number(sec.max) > 0 ? Number(sec.earned) / Number(sec.max) : null)),
    })),
    compare: {
      available: {
        department: Boolean((context.teachers || []).some((row) => row.department && row.teacher_key !== card.teacher_key)),
        school: Boolean((context.teachers || []).length > 1 || context.schoolRatio != null),
      },
      mode: compareMode,
      cohortLabel: compare.cohortLabel,
      cohortSize: compare.cohortSize,
      teacherPct: card.stats?.score_ratio == null ? null : compare.overall.teacher,
      cohortPct: compare.cohortSize || context.schoolRatio != null ? compare.overall.cohort : null,
      rows: compare.sections.map((row) => ({
        title: row.title,
        teacher: Number.isFinite(row.teacher) ? row.teacher : null,
        cohort: Number.isFinite(row.cohort) ? row.cohort : null,
      })),
    },
    observeSelf: {
      observePct: observeSelf.observe.count ? scorePct(observeSelf.observe.fillRatio) : null,
      selfPct: observeSelf.self.count ? scorePct(observeSelf.self.fillRatio) : null,
      observeCount: observeSelf.observe.count,
      selfCount: observeSelf.self.count,
    },
    trend: {
      points: trend.map((p) => ({ date: formatVisitChecklistDate(p.date) || p.date, scorePct: p.score_pct })),
      insufficient: trend.length < 2,
    },
    watchers: {
      visitors: watchers.visitors,
      offline: watchers.offline,
      online: watchers.online,
      self: watchers.self,
    },
    coverage: {
      scored: insights.coverage.scored,
      explicitZero: insights.coverage.explicitZero,
      unanswered: insights.coverage.unanswered,
      total: insights.coverage.total,
    },
    strengths: insights.strengths.map((row) => ({ title: row.title, scorePct: 0, note: '' })),
    growth: insights.weaknesses.map((row) => ({ title: row.title, scorePct: 0, note: '' })),
    bySubject: insights.bySubject.map((row) => ({ name: row.name, visits: row.visits, scorePct: row.score_pct })),
    byClass: insights.byClass.map((row) => ({ name: row.name, visits: row.visits, scorePct: row.score_pct })),
    narrative,
    visits: (card.stats?.visits || []).map((visit, i) => ({
      id: String(visit.id ?? i),
      date: formatVisitChecklistDate(visit.date) || visit.date || 'дата не указана',
      subject: visit.subject || 'предмет не указан',
      className: visit.class_name || 'класс не указан',
      visitor: visit.visitor || 'наблюдатель не указан',
      format: visit.format || '',
      summary: visit.summary || '',
      recommendations: visit.recommendations || '',
      earned: Number(visit.earned) || 0,
      max: Number(visit.max) || 0,
      sections: (visit.sections || []).map((sec) => ({
        title: String(sec.title || sec.code || ''),
        earned: Number(sec.earned) || 0,
        max: Number(sec.max) || 0,
        items: (sec.marks || []).map((mark) => ({
          code: String(mark.code || ''),
          title: String(mark.indicator || mark.code || ''),
          earned: Number(mark.pts) || 0,
          max: Number(mark.max) || 0,
          unanswered: !String(mark.pick || '').trim(),
        })),
      })),
    })),
    singleVisitCaution: (visitCount || 0) === 1,
    loadErrors: [...(context.loadErrors || [])],
  };
}
