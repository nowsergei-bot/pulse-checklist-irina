import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { type LessonAnalyticsLlmProvider } from '../../api/lessonAnalytics';
import {
  useVisitChecklistAnalyticsWorkspace,
  type UseVisitChecklistAnalyticsWorkspaceArgs,
} from '../../hooks/useVisitChecklistAnalyticsWorkspace';

export type VisitChecklistAnalyticsWorkspace = ReturnType<typeof useVisitChecklistAnalyticsWorkspace>;

export type VisitChecklistAnalyticsHeaderValue = {
  visitProjectId: number;
  projectTitle: string;
  setProjectTitle: (value: string) => void;
  saveBusy: boolean;
  saveMsg: string | null;
  saveProject: () => Promise<void>;
  directorShareToken: string | null;
  llmProvider: LessonAnalyticsLlmProvider;
  onToggleLlmProvider: () => void;
  onResync?: () => Promise<void>;
  resyncBusy?: boolean;
  responseCount?: number;
  err: string | null;
  teacherCount: number;
};

const VisitChecklistAnalyticsContext = createContext<VisitChecklistAnalyticsWorkspace | null>(null);
const VisitChecklistAnalyticsHeaderContext = createContext<VisitChecklistAnalyticsHeaderValue | null>(null);

export function VisitChecklistAnalyticsProvider({
  children,
  ...args
}: UseVisitChecklistAnalyticsWorkspaceArgs & { children: ReactNode }) {
  const workspace = useVisitChecklistAnalyticsWorkspace(args);

  const headerValue = useMemo((): VisitChecklistAnalyticsHeaderValue => {
    const teacherCount =
      workspace.visitChecklistTeacherBlocks.teacherLabels.length || workspace.activeTeacherBlocks.length;
    return {
      visitProjectId: workspace.visitProjectId,
      projectTitle: workspace.projectTitle,
      setProjectTitle: workspace.setProjectTitle,
      saveBusy: workspace.saveBusy,
      saveMsg: workspace.saveMsg,
      saveProject: workspace.saveProject,
      directorShareToken: workspace.directorShareToken,
      llmProvider: workspace.llmProvider,
      onToggleLlmProvider: workspace.onToggleLlmProvider,
      onResync: workspace.onResync,
      resyncBusy: workspace.resyncBusy,
      responseCount: workspace.responseCount,
      err: workspace.err,
      teacherCount,
    };
  }, [
    workspace.visitProjectId,
    workspace.projectTitle,
    workspace.setProjectTitle,
    workspace.saveBusy,
    workspace.saveMsg,
    workspace.saveProject,
    workspace.directorShareToken,
    workspace.llmProvider,
    workspace.onToggleLlmProvider,
    workspace.onResync,
    workspace.resyncBusy,
    workspace.responseCount,
    workspace.err,
    workspace.visitChecklistTeacherBlocks.teacherLabels.length,
    workspace.activeTeacherBlocks.length,
  ]);

  return (
    <VisitChecklistAnalyticsContext.Provider value={workspace}>
      <VisitChecklistAnalyticsHeaderContext.Provider value={headerValue}>
        {children}
      </VisitChecklistAnalyticsHeaderContext.Provider>
    </VisitChecklistAnalyticsContext.Provider>
  );
}

export function useVisitChecklistAnalytics(): VisitChecklistAnalyticsWorkspace {
  const ctx = useContext(VisitChecklistAnalyticsContext);
  if (!ctx) {
    throw new Error('useVisitChecklistAnalytics must be used within VisitChecklistAnalyticsProvider');
  }
  return ctx;
}

export function useVisitChecklistAnalyticsHeader(): VisitChecklistAnalyticsHeaderValue {
  const ctx = useContext(VisitChecklistAnalyticsHeaderContext);
  if (!ctx) {
    throw new Error('useVisitChecklistAnalyticsHeader must be used within VisitChecklistAnalyticsProvider');
  }
  return ctx;
}

/** Шапка и кнопки сохранения — без подписки на обновления карточек. */
export const useVisitChecklistAnalyticsChrome = useVisitChecklistAnalyticsHeader;
