import {
  getVisitChecklistDashboard,
  getVisitChecklistDashboardTeacher,
  type VisitChecklistDashCard,
} from '../../api/visitChecklist.ts';
import type { LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics.ts';
import type { TeacherCardPdfContext } from '../../pages/visitChecklistCloud/pdfBuilder/normalizeTeacherCard.ts';
import {
  buildAnalyticsBlockDashCard,
  type AnalyticsBlockDashCardInput,
} from './analyticsBlockToDashCard.ts';
import { matchDashTeacher } from './visitChecklistDirector.ts';
import type { LessonVisitDirectory } from './types.ts';

export type FetchTeacherDashCardResult = {
  card: VisitChecklistDashCard;
  context: TeacherCardPdfContext;
};

export async function fetchVisitChecklistTeacherDashCard(opts: {
  visitProjectId: number;
  projectTitle: string;
  block: LessonAnalyticsTeacherBlock;
  directory?: LessonVisitDirectory | null;
  fallback?: AnalyticsBlockDashCardInput;
}): Promise<FetchTeacherDashCardResult> {
  const dash = await getVisitChecklistDashboard(opts.visitProjectId);
  const matched = matchDashTeacher(dash.teachers, opts.block.teacherLabel, opts.directory);
  let card: VisitChecklistDashCard | null = null;

  if (matched?.teacher_key) {
    try {
      const res = await getVisitChecklistDashboardTeacher(matched.teacher_key, opts.visitProjectId);
      card = res.card;
    } catch {
      card = null;
    }
  }

  if (!card && opts.fallback) {
    card = buildAnalyticsBlockDashCard({
      ...opts.fallback,
      department: opts.fallback.department ?? matched?.department ?? null,
    });
  }

  if (!card) {
    throw new Error('Не удалось загрузить данные карточки для PDF');
  }

  const narrative = String(opts.block.aiNarrative ?? '').trim();
  if (narrative && !String(card.narrative ?? '').trim()) {
    card = { ...card, narrative, narrative_source: card.narrative_source || 'analytics' };
  }

  const context: TeacherCardPdfContext = {
    projectTitle: opts.projectTitle || dash.project?.title || undefined,
    teacherName: opts.block.teacherLabel,
    teachers: (dash.teachers || []).map((row) => ({
      teacher_key: row.teacher_key,
      department: row.department,
      score_ratio: row.score_ratio,
      sections: row.sections,
    })),
    schoolRatio: dash.kpis?.avg_score_ratio ?? null,
    compareMode: 'department',
  };

  return { card, context };
}
