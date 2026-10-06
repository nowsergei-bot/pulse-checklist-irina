import type { LessonVisitChecklistConfig, LessonVisitDraft } from '../../lib/lessonVisitChecklist/types';

export type VisitChecklistAnalyticsTab = 'teachers' | 'summary' | 'settings';

export type VisitChecklistVisitContext = {
  visitProjectId: number;
  visitTitle?: string;
  responseCount?: number;
  directorShareToken?: string | null;
  onResync?: () => Promise<void>;
  resyncBusy?: boolean;
  embedded?: boolean;
  /** Для панели ответов во вкладке «Настройки». */
  visitDraft?: LessonVisitDraft | null;
  visitChecklist?: LessonVisitChecklistConfig | null;
};

export type VisitChecklistAnalyticsPageProps = {
  projectId: number;
  visitContext: VisitChecklistVisitContext;
  reloadToken?: number;
  activeTab: VisitChecklistAnalyticsTab;
  onTabChange: (tab: VisitChecklistAnalyticsTab) => void;
};
