import type { LessonVisitChecklistConfig, LessonVisitDirectory, LessonVisitResponseRow } from './types';
import type { CellPrimitive } from '../excelAnalytics/parse';
import type { ColumnRole } from '../excelAnalytics/types';
import {
  buildLessonVisitAnalyticsHeaders,
  buildLessonVisitColumnRoles,
  buildLessonVisitCustomLabels,
  formatVisitAnswerPhrase,
  LESSON_VISIT_ORDINAL_LEVELS,
  LESSON_VISIT_ORDINAL_HEADER,
  LESSON_VISIT_RECOMMENDATIONS_HEADER,
  LESSON_VISIT_SUMMARY_HEADER,
  resolveVisitQuestionTarget,
} from './visitChecklistAnalyticsMapping';
export {
  buildLessonVisitAnalyticsHeaders,
  buildLessonVisitColumnRoles,
  buildLessonVisitCustomLabels,
  LESSON_VISIT_ORDINAL_LEVELS,
};

function cellDisplay(v: unknown): string | number {
  if (v == null) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (Array.isArray(v)) return v.map((x) => String(x)).join('; ');
  return String(v);
}

function resolveTeacherName(directory: LessonVisitDirectory, teacherId: string): string {
  return directory.teachers.find((t) => t.id === teacherId)?.name ?? teacherId;
}

function resolveDepartmentName(directory: LessonVisitDirectory, departmentId: string): string {
  return directory.departments.find((d) => d.id === departmentId)?.name ?? departmentId;
}

function normalizeOrdinalAnswer(raw: unknown): string {
  const s = String(cellDisplay(raw)).trim();
  if (!s) return '';
  const canon = LESSON_VISIT_ORDINAL_LEVELS.find((lvl) => lvl.toLowerCase() === s.toLowerCase());
  return canon ?? s;
}

/** Ответы чек-листа → таблица для модуля «Аналитика уроков» (формат «Для анализа ИИ»). */
export function lessonVisitResponsesToLessonGrid(
  checklist: LessonVisitChecklistConfig,
  directory: LessonVisitDirectory,
  responses: LessonVisitResponseRow[],
): {
  headers: string[];
  rows: CellPrimitive[][];
  roles: ColumnRole[];
  customLabels: ReturnType<typeof buildLessonVisitCustomLabels>;
  ordinalLevels: string[];
  fileName: string;
  sheet: string;
  headerRow1Based: number;
} {
  const headers = buildLessonVisitAnalyticsHeaders(checklist);
  const roles = buildLessonVisitColumnRoles(headers);
  const customLabels = buildLessonVisitCustomLabels();
  const generalIds = checklist.generalFields.map((f) => f.id);

  const ordinalIdx = headers.indexOf(LESSON_VISIT_ORDINAL_HEADER);
  const summaryIdx = headers.indexOf(LESSON_VISIT_SUMMARY_HEADER);
  const recommendationsIdx = headers.indexOf(LESSON_VISIT_RECOMMENDATIONS_HEADER);

  const matrixRows: CellPrimitive[][] = [];

  for (const r of responses) {
    const line: CellPrimitive[] = headers.map(() => '');
    line[0] = String(r.id);

    for (let gi = 0; gi < generalIds.length; gi++) {
      const fid = generalIds[gi];
      const col = 1 + gi;
      const raw = r.general[fid] ?? '';
      if (fid === 'teacher_id') {
        line[col] = resolveTeacherName(directory, String(raw));
      } else if (fid === 'department_id') {
        line[col] = resolveDepartmentName(directory, String(raw));
      } else {
        line[col] = cellDisplay(raw);
      }
    }

    headers.forEach((_, col) => {
      const role = roles[col];
      if (!role.startsWith('lesson_visit_sec_') && !role.startsWith('lesson_comp_scale_')) return;
      const phrases: string[] = [];
      for (const sec of checklist.sections) {
        for (const q of sec.questions) {
          const target = resolveVisitQuestionTarget(q, sec);
          if (target !== role) continue;
          const phrase = formatVisitAnswerPhrase(q, r.answers[q.id]);
          if (phrase) phrases.push(phrase);
        }
      }
      line[col] = phrases.join(', ');
    });

    if (ordinalIdx >= 0) {
      for (const sec of checklist.sections) {
        for (const q of sec.questions) {
          if (resolveVisitQuestionTarget(q, sec) !== 'ordinal') continue;
          const ord = normalizeOrdinalAnswer(r.answers[q.id]);
          if (ord) {
            line[ordinalIdx] = ord;
            break;
          }
        }
      }
    }

    if (summaryIdx >= 0) {
      const chunks: string[] = [];
      for (const sec of checklist.sections) {
        for (const q of sec.questions) {
          if (resolveVisitQuestionTarget(q, sec) !== 'text_summary') continue;
          const t = String(cellDisplay(r.answers[q.id])).trim();
          if (t) chunks.push(t);
        }
      }
      line[summaryIdx] = chunks.join('\n\n');
    }

    if (recommendationsIdx >= 0) {
      const chunks: string[] = [];
      for (const sec of checklist.sections) {
        for (const q of sec.questions) {
          if (resolveVisitQuestionTarget(q, sec) !== 'text_recommendations') continue;
          const t = String(cellDisplay(r.answers[q.id])).trim();
          if (t) chunks.push(t);
        }
      }
      line[recommendationsIdx] = chunks.join('\n\n');
    }

    matrixRows.push(line);
  }

  return {
    headers,
    rows: matrixRows,
    roles,
    customLabels,
    ordinalLevels: [...LESSON_VISIT_ORDINAL_LEVELS],
    fileName: 'Чек-лист посещения урока · ответы.xlsx',
    sheet: 'Ответы',
    headerRow1Based: 1,
  };
}

export function lessonVisitGridFingerprint(projectId: number): string {
  return `lesson-visit-${projectId}`;
}
