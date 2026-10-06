import { useMemo } from 'react';
import { useBackgroundWorkGate } from './useBackgroundWorkGate';
import { useTeacherCardArchiveStatus } from './useTeacherCardArchiveStatus';
import {
  buildTeacherCardBackgroundStatus,
  countCardsAheadInAiBatch,
  type TeacherCardBackgroundStatus,
} from '../lib/lessonAnalytics/teacherCardBackgroundStatus';

export type UseTeacherCardBackgroundStatusArgs = {
  blockId: string;
  hasAiNarrative: boolean;
  narrativeBusy: boolean;
  aiBatchRunning: boolean;
  aiQueueBlockId: string | null;
  aiBatchOrder: readonly string[];
  aiBatchGiveUp: readonly string[];
  aiBatchRetries?: Readonly<Record<string, number>>;
};

/** Локальный статус фоновой обработки одной карточки — без лишних перерисовок списка. */
export function useTeacherCardBackgroundStatus({
  blockId,
  hasAiNarrative,
  narrativeBusy,
  aiBatchRunning,
  aiQueueBlockId,
  aiBatchOrder,
  aiBatchGiveUp,
  aiBatchRetries = {},
}: UseTeacherCardBackgroundStatusArgs): TeacherCardBackgroundStatus | null {
  const archiveStatus = useTeacherCardArchiveStatus(blockId);
  const backgroundWorkPaused = !useBackgroundWorkGate();

  return useMemo(() => {
    if (hasAiNarrative) return null;
    const giveUpSet = new Set(aiBatchGiveUp);
    const aiForming = aiQueueBlockId === blockId;
    const aiInBatchQueue =
      aiBatchRunning && aiBatchOrder.includes(blockId) && !giveUpSet.has(blockId);
    const aiPending = aiInBatchQueue && !aiForming;
    const queueAhead = countCardsAheadInAiBatch(blockId, aiBatchOrder, giveUpSet, aiQueueBlockId);

    return buildTeacherCardBackgroundStatus({
      archiveStatus,
      narrativeBusy: narrativeBusy || aiForming,
      aiPending,
      aiBatchRunning,
      queueAhead,
      backgroundWorkPaused,
      aiRetryAttempt: aiBatchRetries[blockId] ?? 0,
    });
  }, [
    hasAiNarrative,
    blockId,
    archiveStatus,
    narrativeBusy,
    aiBatchRunning,
    aiQueueBlockId,
    aiBatchOrder,
    aiBatchGiveUp,
    aiBatchRetries,
    backgroundWorkPaused,
  ]);
}
