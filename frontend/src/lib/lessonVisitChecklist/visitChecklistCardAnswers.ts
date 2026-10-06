import type { LessonVisitChecklistConfig, LessonVisitDirectory, LessonVisitResponseRow } from './types';
import { itemTrafficColor } from './visitChecklistCloudUi.ts';
import {
  findRubricItemByCode,
  scoreVisitFromSectionPicks,
  type VisitSectionScore,
} from './visitChecklistRubricScore.ts';

export type VisitQaItem = {
  code: string;
  text: string;
  pick: string;
  unanswered: boolean;
  earnedPoints: number;
  maxPoints: number;
  traffic: string;
};

export type VisitQaSection = {
  code: string;
  title: string;
  items: VisitQaItem[];
  earnedPoints: number;
  maxPoints: number;
  fillRatio: number;
};

export { findRubricItemByCode };

export function personKey(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatAnswerPick(raw: string | string[] | null | undefined): string {
  if (Array.isArray(raw)) return raw.map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  return String(raw || '').trim();
}

export function scoreVisitFromChecklistAnswers(
  checklist: LessonVisitChecklistConfig | null | undefined,
  answers: Record<string, string | string[]> | null | undefined,
): VisitSectionScore[] {
  const map = answers || {};
  const picks = new Map<string, string>();
  for (const sec of checklist?.sections || []) {
    for (const q of sec.questions || []) {
      const pick = formatAnswerPick(map[q.id] ?? map[q.code]);
      if (pick) picks.set(q.code, pick);
    }
  }
  return scoreVisitFromSectionPicks(picks);
}

export function buildVisitQaSections(
  checklist: LessonVisitChecklistConfig | null | undefined,
  answers: Record<string, string | string[]> | null | undefined,
): VisitQaSection[] {
  const map = answers || {};
  const scored = scoreVisitFromChecklistAnswers(checklist, answers);
  const byCode = new Map<string, { earned: number; max: number; indicator: string }>();
  for (const sec of scored) {
    for (const item of sec.items) {
      const code = String(item.itemCode || '').trim();
      if (!code) continue;
      byCode.set(code, {
        earned: item.earnedPoints,
        max: item.maxPoints,
        indicator: item.indicator,
      });
    }
  }
  return (checklist?.sections || []).map((sec) => {
    const official = scored.find((row) => row.code === sec.code);
    const items = (sec.questions || []).map((q) => {
      const pick = formatAnswerPick(map[q.id] ?? map[q.code]);
      const unanswered = !pick;
      const hit = byCode.get(q.code);
      const rubric = hit || findRubricItemByCode(q.code);
      const earnedPoints = unanswered ? 0 : hit?.earned ?? 0;
      const maxPoints = hit?.max ?? (rubric && 'maxPoints' in rubric ? rubric.maxPoints : 0) ?? 0;
      const text = hit?.indicator || q.text;
      return {
        code: q.code,
        text,
        pick,
        unanswered,
        earnedPoints,
        maxPoints,
        traffic: itemTrafficColor(maxPoints > 0 ? earnedPoints / maxPoints : null, unanswered || maxPoints <= 0),
      };
    });
    const earnedPoints = official?.earnedPoints ?? items.reduce((sum, item) => sum + item.earnedPoints, 0);
    const maxPoints = official?.maxPoints ?? items.reduce((sum, item) => sum + item.maxPoints, 0);
    return {
      code: sec.code,
      title: official?.title || sec.title,
      items,
      earnedPoints,
      maxPoints,
      fillRatio: official?.fillRatio ?? (maxPoints > 0 ? earnedPoints / maxPoints : 0),
    };
  });
}

export function responseMatchesTeacher(
  row: LessonVisitResponseRow,
  teacherKey: string,
  teacherLabel: string,
  directory?: LessonVisitDirectory | null,
): boolean {
  const want = new Set([personKey(teacherKey), personKey(teacherLabel)].filter(Boolean));
  if (!want.size) return false;
  const g = row.general || {};
  const tid = String(g.teacher_id || '');
  const dirName = directory?.teachers?.find((t) => t.id === tid)?.name;
  const candidates = [tid, g.teacher_name, dirName].map(personKey).filter(Boolean);
  return candidates.some((k) => want.has(k));
}

export function findResponseForVisit(
  visit: { id?: number | string | null; date?: string | null; class_name?: string | null; subject?: string | null },
  rows: LessonVisitResponseRow[],
): LessonVisitResponseRow | undefined {
  const id = Number(visit.id);
  if (Number.isFinite(id) && id > 0) {
    const hit = rows.find((r) => Number(r.id) === id);
    if (hit) return hit;
  }
  const date = String(visit.date || '').trim();
  const cls = String(visit.class_name || '').trim().toLocaleLowerCase('ru-RU');
  const subj = String(visit.subject || '').trim().toLocaleLowerCase('ru-RU');
  if (!date && !cls && !subj) return undefined;
  return rows.find((r) => {
    const g = r.general || {};
    const sameDate = !date || String(g.visit_date || g.date || '').trim() === date;
    const sameClass = !cls || String(g.class_name || g.class || '').trim().toLocaleLowerCase('ru-RU') === cls;
    const sameSubj = !subj || String(g.subject || g.lesson_subject || '').trim().toLocaleLowerCase('ru-RU') === subj;
    return sameDate && sameClass && sameSubj;
  });
}
