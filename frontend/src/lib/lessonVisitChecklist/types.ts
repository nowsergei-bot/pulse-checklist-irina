import { type LessonAnalyticsDraft } from '../../api/lessonAnalytics';
import defaultSeed from './defaultSeed.json';
import { normalizeSavedChecklist, VISIT_CHECKLIST_TITLE } from './normalizeChecklist';

export type LessonVisitGeneralFieldType = 'text' | 'date' | 'radio' | 'select' | 'department' | 'teacher';

export interface LessonVisitGeneralField {
  id: string;
  label: string;
  type: LessonVisitGeneralFieldType;
  required?: boolean;
  options?: string[];
}

export type LessonVisitQuestionType = 'radio' | 'checkbox' | 'text';

export interface LessonVisitQuestion {
  id: string;
  code: string;
  text: string;
  type: LessonVisitQuestionType;
  required?: boolean;
  options: string[];
  allowMultiple?: boolean;
  hint?: string;
}

export interface LessonVisitSection {
  id: string;
  code: string;
  title: string;
  questions: LessonVisitQuestion[];
}

export interface LessonVisitDepartment {
  id: string;
  name: string;
}

export interface LessonVisitTeacher {
  id: string;
  name: string;
  departmentId: string;
}

export interface LessonVisitDirectory {
  departments: LessonVisitDepartment[];
  teachers: LessonVisitTeacher[];
}

export interface LessonVisitChecklistConfig {
  v: 1;
  generalFields: LessonVisitGeneralField[];
  sections: LessonVisitSection[];
}

export interface LessonVisitResponseRow {
  id: number;
  created_at: string;
  general: Record<string, string>;
  answers: Record<string, string | string[]>;
}

export interface LessonVisitMediaPhoto {
  src: string;
  name?: string;
}

export interface LessonVisitDraft {
  v: 1;
  title: string;
  updatedAt: string;
  checklist: LessonVisitChecklistConfig;
  directory: LessonVisitDirectory;
  /** Фото для слайдшоу на публичной форме (как у опросов). */
  media?: { photos?: LessonVisitMediaPhoto[] };
  /** Разрешить повторное заполнение с одного устройства (по умолчанию true). */
  allowMultipleResponses?: boolean;
  /** Связанный проект «Аналитика уроков» для PDF, срезов и ИИ */
  lessonAnalyticsProjectId?: number | null;
  lessonAnalyticsDirectorToken?: string | null;
  /** ID учителей справочника (teacher_N), которых администратор отметил как новых. Без ФИО. */
  newTeacherIds?: string[];
}

export type LessonVisitProjectRow = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  form_token: string;
  director_share_token?: string;
  response_count?: number;
};

export function defaultLessonVisitChecklist(): LessonVisitChecklistConfig {
  return normalizeSavedChecklist(structuredClone(defaultSeed as LessonVisitChecklistConfig));
}

export function defaultLessonVisitDirectory(): LessonVisitDirectory {
  const seed = defaultSeed as { directory: LessonVisitDirectory };
  return structuredClone(seed.directory);
}

export function emptyLessonVisitDraft(title?: string): LessonVisitDraft {
  return {
    v: 1,
    title: title || VISIT_CHECKLIST_TITLE,
    updatedAt: new Date().toISOString(),
    checklist: defaultLessonVisitChecklist(),
    directory: defaultLessonVisitDirectory(),
    allowMultipleResponses: true,
    lessonAnalyticsProjectId: null,
  };
}

export type LessonVisitAnalyticsDraft = LessonAnalyticsDraft;
