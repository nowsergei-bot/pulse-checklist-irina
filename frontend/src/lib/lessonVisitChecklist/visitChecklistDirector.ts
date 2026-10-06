import type { VisitChecklistDashTeacherListItem } from '../../api/visitChecklist';
import type { LessonVisitChecklistConfig, LessonVisitDirectory, LessonVisitResponseRow } from './types.ts';
import { buildVisitQaSections, personKey, type VisitQaItem } from './visitChecklistCardAnswers.ts';
import { pickVisitFormat } from './visitChecklistFormat.ts';
import { isSelfAnalysisFormat, scorePct, trafficTone } from './visitChecklistCloudUi.ts';
import type { LiveChartRow, LiveTeacherBundle } from './visitChecklistLiveCharts.ts';
import { resolveFullTeacherName } from './visitChecklistPeople.ts';
import {
  isUnknownTeacherLabel,
  matchTeacherFromVisitSchedule,
  type VisitScheduleMatchRow,
} from './visitChecklistScheduleMatch.ts';

export const DIRECTOR_TEACHER_DYNAMICS_MIN_VISITS = 3;

export type DirectorQaPick = {
  pick: string;
  ratio: number | null;
  unanswered: boolean;
  traffic: string;
  earned: number;
  max: number;
};

export type DirectorLessonCard = {
  id: number;
  date: string;
  subject: string;
  teacher: string;
  class_name: string;
  visitor: string;
  format: string;
  rating: DirectorQaPick;
  feedback: string;
  selfRating: DirectorQaPick | null;
};

function pickGeneral(row: LessonVisitResponseRow, keys: string[]): string {
  const g = row.general || {};
  for (const key of keys) {
    const value = String(g[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function qaByCode(
  checklist: LessonVisitChecklistConfig | null | undefined,
  answers: LessonVisitResponseRow['answers'],
  code: string,
): VisitQaItem | undefined {
  return buildVisitQaSections(checklist, answers)
    .flatMap((sec) => sec.items)
    .find((item) => item.code === code);
}

function toPick(item: VisitQaItem | undefined): DirectorQaPick {
  if (!item) {
    return { pick: '', ratio: null, unanswered: true, traffic: '#94a3b8', earned: 0, max: 0 };
  }
  const ratio = item.maxPoints > 0 && !item.unanswered ? item.earnedPoints / item.maxPoints : null;
  return {
    pick: item.pick,
    ratio,
    unanswered: item.unanswered,
    traffic: item.traffic,
    earned: item.earnedPoints,
    max: item.maxPoints,
  };
}

export function directorTeacherLabel(
  row: LessonVisitResponseRow,
  directory?: LessonVisitDirectory | null,
  scheduleRows?: VisitScheduleMatchRow[] | null,
): string {
  const named = pickGeneral(row, ['teacher_name', 'teacher']);
  const fromNamed = resolveFullTeacherName(named, directory);
  if (fromNamed) return fromNamed;
  const tid = pickGeneral(row, ['teacher_id']);
  const fromId = resolveFullTeacherName(tid, directory);
  if (fromId) return fromId;
  const fromSchedule = matchTeacherFromVisitSchedule(scheduleRows, {
    class_name: pickGeneral(row, ['class_name', 'class', 'className']),
    visitor: pickGeneral(row, ['visitor_name', 'visitor', 'observer']),
  });
  return resolveFullTeacherName(fromSchedule, directory);
}

export function directorVisitPairKey(
  teacher: string,
  date: string,
  className: string,
  subject: string,
): string {
  return [personKey(teacher), date.slice(0, 10), personKey(className), personKey(subject)].join('|');
}

function visitDate(row: LessonVisitResponseRow): string {
  return pickGeneral(row, ['visit_date', 'date']).slice(0, 10) || String(row.created_at || '').slice(0, 10);
}

function rowPairKey(
  row: LessonVisitResponseRow,
  directory?: LessonVisitDirectory | null,
  scheduleRows?: VisitScheduleMatchRow[] | null,
): string {
  return directorVisitPairKey(
    directorTeacherLabel(row, directory, scheduleRows),
    visitDate(row),
    pickGeneral(row, ['class_name', 'class', 'className']),
    pickGeneral(row, ['subject', 'lesson_subject', 'discipline']),
  );
}

function visitFeedback(
  checklist: LessonVisitChecklistConfig | null | undefined,
  row: LessonVisitResponseRow,
): string {
  const q102 = qaByCode(checklist, row.answers, '10.2');
  if (q102?.pick) return q102.pick;
  return pickGeneral(row, ['summary', 'feedback', 'conclusions']);
}

export function buildDirectorLessonCards(
  rows: LessonVisitResponseRow[] | null | undefined,
  checklist: LessonVisitChecklistConfig | null | undefined,
  directory?: LessonVisitDirectory | null,
  scheduleRows?: VisitScheduleMatchRow[] | null,
): DirectorLessonCard[] {
  const list = rows || [];
  const selfByKey = new Map<string, LessonVisitResponseRow>();
  const selfRows: LessonVisitResponseRow[] = [];
  for (const row of list) {
    const format = pickVisitFormat(row.general) || pickGeneral(row, ['visit_format', 'format']);
    if (!isSelfAnalysisFormat(format)) continue;
    selfByKey.set(rowPairKey(row, directory, scheduleRows), row);
    selfRows.push(row);
  }

  const cards: DirectorLessonCard[] = [];
  const pairedSelfIds = new Set<number>();
  for (const row of list) {
    const format = pickVisitFormat(row.general) || pickGeneral(row, ['visit_format', 'format']);
    if (isSelfAnalysisFormat(format)) continue;
    const teacher = directorTeacherLabel(row, directory, scheduleRows);
    if (!teacher || isUnknownTeacherLabel(teacher)) continue;
    const date = visitDate(row);
    const class_name = pickGeneral(row, ['class_name', 'class', 'className']);
    const subject = pickGeneral(row, ['subject', 'lesson_subject', 'discipline']);
    const self = selfByKey.get(directorVisitPairKey(teacher, date, class_name, subject));
    if (self) pairedSelfIds.add(self.id);
    cards.push({
      id: row.id,
      date,
      subject,
      teacher,
      class_name,
      visitor:
        resolveFullTeacherName(pickGeneral(row, ['visitor_name', 'visitor', 'observer']), directory) ||
        pickGeneral(row, ['visitor_name', 'visitor', 'observer']),
      format,
      rating: toPick(qaByCode(checklist, row.answers, '10.1')),
      feedback: visitFeedback(checklist, row),
      selfRating: self ? toPick(qaByCode(checklist, self.answers, '10.1')) : null,
    });
  }

  // Orphan self-analysis (no matching observation) must still appear as its own card.
  for (const row of selfRows) {
    if (pairedSelfIds.has(row.id)) continue;
    const teacher = directorTeacherLabel(row, directory, scheduleRows);
    if (!teacher || isUnknownTeacherLabel(teacher)) continue;
    const format = pickVisitFormat(row.general) || pickGeneral(row, ['visit_format', 'format']);
    cards.push({
      id: row.id,
      date: visitDate(row),
      subject: pickGeneral(row, ['subject', 'lesson_subject', 'discipline']),
      teacher,
      class_name: pickGeneral(row, ['class_name', 'class', 'className']),
      visitor: '',
      format,
      rating: toPick(qaByCode(checklist, row.answers, '10.1')),
      feedback: visitFeedback(checklist, row),
      selfRating: toPick(qaByCode(checklist, row.answers, '10.1')),
    });
  }

  return cards.sort((a, b) => {
    const byDate = String(b.date).localeCompare(String(a.date));
    if (byDate) return byDate;
    return b.id - a.id;
  });
}

export type DirectorTeacherPlaque = {
  teacher_key: string;
  teacher: string;
  department: string;
  photo_url?: string | null;
  photo_thumb_url?: string | null;
  observe: number;
  self: number;
  score_ratio: number;
  cards: DirectorLessonCard[];
};

export function matchDashTeacher(
  teachers: VisitChecklistDashTeacherListItem[] | null | undefined,
  teacherName: string,
  directory?: LessonVisitDirectory | null,
): VisitChecklistDashTeacherListItem | undefined {
  const key = personKey(teacherName);
  if (!key) return undefined;
  const list = teachers || [];
  return (
    list.find((row) => personKey(row.teacher_label) === key) ||
    list.find((row) => personKey(row.teacher_key) === key) ||
    list.find((row) => {
      const full = resolveFullTeacherName(row.teacher_label, directory) || row.teacher_label;
      return personKey(full) === key;
    }) ||
    list.find((row) => {
      const labelKey = personKey(resolveFullTeacherName(row.teacher_label, directory) || row.teacher_label);
      const last = labelKey.split(' ')[0];
      const want = key.split(' ')[0];
      return Boolean(last && last === want && (key.startsWith(labelKey) || labelKey.startsWith(key)));
    })
  );
}

export function buildDirectorTeacherPlaques(
  cards: DirectorLessonCard[] | null | undefined,
  teachers?: VisitChecklistDashTeacherListItem[] | null,
  directory?: LessonVisitDirectory | null,
  selfByTeacher?: Map<string, number> | null,
): DirectorTeacherPlaque[] {
  const groups = new Map<string, DirectorLessonCard[]>();
  for (const card of cards || []) {
    if (!card.teacher || isUnknownTeacherLabel(card.teacher)) continue;
    const key = personKey(card.teacher);
    const list = groups.get(key) || [];
    list.push(card);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const dash = matchDashTeacher(teachers, list[0].teacher, directory);
      const observeCards = list.filter((card) => !isSelfAnalysisFormat(card.format));
      const selfOnlyCards = list.filter((card) => isSelfAnalysisFormat(card.format));
      const ratios = observeCards
        .map((card) => card.rating.ratio)
        .filter((ratio): ratio is number => ratio != null);
      const selfFromPairs = observeCards.filter((card) => card.selfRating).length;
      return {
        teacher_key: dash?.teacher_key || key,
        teacher: list[0].teacher,
        department: dash?.department || '',
        photo_url: dash?.photo_url,
        photo_thumb_url: dash?.photo_thumb_url,
        observe: observeCards.length,
        self: selfByTeacher?.get(key) ?? selfFromPairs + selfOnlyCards.length,
        score_ratio: ratios.length ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : 0,
        cards: list,
      };
    })
    .sort((a, b) => a.score_ratio - b.score_ratio || a.teacher.localeCompare(b.teacher, 'ru'));
}

/** Один столбец на педагога, слабые сверху. */
export function buildDirectorTeacherLevelRows(plaques: DirectorTeacherPlaque[] | null | undefined): LiveChartRow[] {
  return (plaques || [])
    .map((plaque) => ({
      name: plaque.teacher,
      visits: plaque.observe,
      score_ratio: plaque.score_ratio,
      score_pct: scorePct(plaque.score_ratio),
      traffic: trafficTone(plaque.score_ratio),
    }))
    .sort((a, b) => a.score_pct - b.score_pct || a.name.localeCompare(b.name, 'ru'));
}

export function directorTeachersWithDynamics(
  bundles: LiveTeacherBundle[] | null | undefined,
): LiveTeacherBundle[] {
  return (bundles || []).filter((row) => {
    if (isUnknownTeacherLabel(row.teacher_label)) return false;
    const observe = row.visits.filter((visit) => !isSelfAnalysisFormat(visit.format)).length;
    return observe >= DIRECTOR_TEACHER_DYNAMICS_MIN_VISITS;
  });
}

export function shouldShowDirectorTeacherDynamics(
  bundles: LiveTeacherBundle[] | null | undefined,
): boolean {
  return directorTeachersWithDynamics(bundles).length > 0;
}
