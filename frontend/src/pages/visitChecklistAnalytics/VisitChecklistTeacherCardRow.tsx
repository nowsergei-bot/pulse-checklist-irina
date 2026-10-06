import { memo, useCallback, useMemo, useState } from 'react';
import { type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import LessonAnalyticsTeacherCardSlot from '../../components/LessonAnalyticsTeacherCardSlot';
import VisitChecklistTeacherCardPreview from '../../components/VisitChecklistTeacherCardPreview';
import { useBackgroundWorkGate } from '../../hooks/useBackgroundWorkGate';
import { useTeacherCardBackgroundStatus } from '../../hooks/useTeacherCardBackgroundStatus';
import { useInView } from '../../hooks/useInView';
import { roughNormFilterValue } from '../../lib/excelAnalytics/filterValueNormalize';
import type { VisitChecklistAnalyticsWorkspace } from './VisitChecklistAnalyticsContext';

type CardWorkspaceSlice = {
  aiBatchRunning: boolean;
} & Pick<
  VisitChecklistAnalyticsWorkspace,
  | 'aiNarrativeStore'
  | 'aiQueueBlockId'
  | 'aiBatchQueueSnapshot'
  | 'aiQueueSelection'
  | 'visitTeacherCardViewModes'
  | 'redHighlightNorms'
  | 'cardTemplate'
  | 'teacherCardCtx'
  | 'teacherFilterKey'
  | 'headers'
  | 'rawRows'
  | 'rolesForLessonMatrix'
  | 'customLabels'
  | 'staffRows'
  | 'narrativeBusyId'
  | 'emailBusyId'
  | 'pdfBusyId'
  | 'pdfCompactBusyId'
  | 'pdfCaptureBusy'
  | 'saveBusy'
  | 'dashboardRows'
  | 'resolveBlockAiNarrative'
  | 'blocksWithResolvedNarratives'
  | 'onTeacherCardViewModeChange'
  | 'onTeacherCardAiQueueChange'
  | 'generateNarrative'
  | 'agreeAndPersist'
  | 'revokeAgreeAndPersist'
  | 'sendEmail'
  | 'downloadTeacherPdf'
  | 'downloadTeacherPdfOnePage'
  | 'onTeacherCardAiNarrativeChange'
  | 'patchTeacherRowMembership'
>;

export type VisitChecklistTeacherCardRowProps = {
  block: LessonAnalyticsTeacherBlock;
  cardIndex: number;
  ws: CardWorkspaceSlice;
};

/** Карточка: лёгкое превью → полная только в viewport или по кнопке. */
function VisitChecklistTeacherCardRow({ block, cardIndex, ws }: VisitChecklistTeacherCardRowProps) {
  const [containerRef, inView] = useInView<HTMLDivElement>({ rootMargin: '280px 0px', once: true });
  const [forceFull, setForceFull] = useState(false);
  const backgroundReady = useBackgroundWorkGate();
  const mountFull = forceFull || (inView && backgroundReady);

  const visitCardViewMode = ws.visitTeacherCardViewModes[block.id] ?? 'methodist';
  const aiQueueSelected = Boolean(ws.aiQueueSelection[block.id]);
  const highlightRed = ws.redHighlightNorms.has(roughNormFilterValue(block.teacherLabel));

  const hasAiNarrative = Boolean(
    String(block.aiNarrative ?? '').trim() ||
      String(ws.aiNarrativeStore.byBlockId[block.id] ?? '').trim(),
  );
  const backgroundStatus = useTeacherCardBackgroundStatus({
    blockId: block.id,
    hasAiNarrative,
    narrativeBusy: ws.narrativeBusyId === block.id || ws.aiQueueBlockId === block.id,
    aiBatchRunning: ws.aiBatchRunning,
    aiQueueBlockId: ws.aiQueueBlockId,
    aiBatchOrder: ws.aiBatchQueueSnapshot.order,
    aiBatchGiveUp: ws.aiBatchQueueSnapshot.giveUp,
  });

  const sliceChartsSlot = useCallback(() => null, []);

  const showFull = useCallback(() => setForceFull(true), []);

  if (!ws.teacherFilterKey) return null;

  return (
    <div ref={containerRef}>
      {!mountFull ? (
        <VisitChecklistTeacherCardPreview
          block={block}
          onShowFull={showFull}
          backgroundStatus={backgroundStatus}
        />
      ) : (
        <LessonAnalyticsTeacherCardSlot
          block={block}
          cardIndex={cardIndex}
          aiNarrativeStore={ws.aiNarrativeStore}
          aiQueueBlockId={ws.aiQueueBlockId}
          aiBatchRunning={ws.aiBatchRunning}
          aiBatchOrder={ws.aiBatchQueueSnapshot.order}
          aiBatchGiveUp={ws.aiBatchQueueSnapshot.giveUp}
          aiQueueSelected={aiQueueSelected}
          visitChecklistMode
          visitCardViewMode={visitCardViewMode}
          highlightRed={highlightRed}
          cardTemplate={ws.cardTemplate}
          teacherCardCtx={ws.teacherCardCtx}
          teacherFilterKey={ws.teacherFilterKey}
          headers={ws.headers}
          rawRows={ws.rawRows}
          rolesForLessonMatrix={ws.rolesForLessonMatrix}
          customLabels={ws.customLabels}
          staffRows={ws.staffRows}
          narrativeBusyId={ws.narrativeBusyId}
          emailBusyId={ws.emailBusyId}
          pdfBusyId={ws.pdfBusyId}
          pdfCompactBusyId={ws.pdfCompactBusyId}
          pdfCaptureBusy={ws.pdfCaptureBusy}
          saveBusy={ws.saveBusy}
          poolRows={ws.dashboardRows}
          periodComparison={null}
          sliceChartsSlot={sliceChartsSlot}
          resolveBlockAiNarrative={ws.resolveBlockAiNarrative}
          resolveDisplayBlock={(b, store) => ws.blocksWithResolvedNarratives([b], store)[0] ?? b}
          onVisitCardViewModeChange={ws.onTeacherCardViewModeChange}
          onAiQueueSelectChange={ws.onTeacherCardAiQueueChange}
          onGenerateNarrative={ws.generateNarrative}
          onAgree={ws.agreeAndPersist}
          onRevokeAgree={ws.revokeAgreeAndPersist}
          onEmail={ws.sendEmail}
          onDownloadPdf={ws.downloadTeacherPdf}
          onDownloadPdfOnePage={ws.downloadTeacherPdfOnePage}
          onAiNarrativeChange={ws.onTeacherCardAiNarrativeChange}
          onRowMembershipChange={ws.patchTeacherRowMembership}
          deferHeavyBody
        />
      )}
    </div>
  );
}

function cardRowPropsEqual(
  prev: VisitChecklistTeacherCardRowProps,
  next: VisitChecklistTeacherCardRowProps,
): boolean {
  if (prev.block !== next.block) return false;
  if (prev.cardIndex !== next.cardIndex) return false;
  const p = prev.ws;
  const n = next.ws;
  if (p.aiNarrativeStore !== n.aiNarrativeStore) {
    const id = prev.block.id;
    const norm = roughNormFilterValue(prev.block.teacherLabel);
    const prevText =
      String(prev.block.aiNarrative ?? '').trim() ||
      String(p.aiNarrativeStore.byBlockId[id] ?? '').trim() ||
      String(p.aiNarrativeStore.byNorm[norm] ?? '').trim();
    const nextText =
      String(next.block.aiNarrative ?? '').trim() ||
      String(n.aiNarrativeStore.byBlockId[id] ?? '').trim() ||
      String(n.aiNarrativeStore.byNorm[norm] ?? '').trim();
    if (prevText !== nextText) return false;
  }
  if (p.aiQueueBlockId !== n.aiQueueBlockId) return false;
  if (p.aiBatchRunning !== n.aiBatchRunning) return false;
  if (p.aiBatchQueueSnapshot !== n.aiBatchQueueSnapshot) return false;
  if (p.narrativeBusyId !== n.narrativeBusyId) return false;
  if (p.emailBusyId !== n.emailBusyId) return false;
  if (p.pdfBusyId !== n.pdfBusyId) return false;
  if (p.pdfCompactBusyId !== n.pdfCompactBusyId) return false;
  if (p.pdfCaptureBusy !== n.pdfCaptureBusy) return false;
  if (p.saveBusy !== n.saveBusy) return false;
  if (p.visitTeacherCardViewModes[prev.block.id] !== n.visitTeacherCardViewModes[next.block.id]) return false;
  if (Boolean(p.aiQueueSelection[prev.block.id]) !== Boolean(n.aiQueueSelection[next.block.id])) return false;
  if (p.redHighlightNorms !== n.redHighlightNorms) return false;
  return true;
}

export default memo(VisitChecklistTeacherCardRow, cardRowPropsEqual);

export function useVisitChecklistTeacherCardRenderer(ws: VisitChecklistAnalyticsWorkspace) {
  const cardWs = useMemo(
    (): CardWorkspaceSlice => ({
      aiNarrativeStore: ws.aiNarrativeStore,
      aiQueueBlockId: ws.aiQueueBlockId,
      aiBatchRunning: ws.aiProgress.running,
      aiBatchQueueSnapshot: ws.aiBatchQueueSnapshot,
      aiQueueSelection: ws.aiQueueSelection,
      visitTeacherCardViewModes: ws.visitTeacherCardViewModes,
      redHighlightNorms: ws.redHighlightNorms,
      cardTemplate: ws.cardTemplate,
      teacherCardCtx: ws.teacherCardCtx,
      teacherFilterKey: ws.teacherFilterKey,
      headers: ws.headers,
      rawRows: ws.rawRows,
      rolesForLessonMatrix: ws.rolesForLessonMatrix,
      customLabels: ws.customLabels,
      staffRows: ws.staffRows,
      narrativeBusyId: ws.narrativeBusyId,
      emailBusyId: ws.emailBusyId,
      pdfBusyId: ws.pdfBusyId,
      pdfCompactBusyId: ws.pdfCompactBusyId,
      pdfCaptureBusy: ws.pdfCaptureBusy,
      saveBusy: ws.saveBusy,
      dashboardRows: ws.dashboardRows,
      resolveBlockAiNarrative: ws.resolveBlockAiNarrative,
      blocksWithResolvedNarratives: ws.blocksWithResolvedNarratives,
      onTeacherCardViewModeChange: ws.onTeacherCardViewModeChange,
      onTeacherCardAiQueueChange: ws.onTeacherCardAiQueueChange,
      generateNarrative: ws.generateNarrative,
      agreeAndPersist: ws.agreeAndPersist,
      revokeAgreeAndPersist: ws.revokeAgreeAndPersist,
      sendEmail: ws.sendEmail,
      downloadTeacherPdf: ws.downloadTeacherPdf,
      downloadTeacherPdfOnePage: ws.downloadTeacherPdfOnePage,
      onTeacherCardAiNarrativeChange: ws.onTeacherCardAiNarrativeChange,
      patchTeacherRowMembership: ws.patchTeacherRowMembership,
    }),
    [
      ws.aiNarrativeStore,
      ws.aiQueueBlockId,
      ws.aiProgress.running,
      ws.aiBatchQueueSnapshot,
      ws.aiQueueSelection,
      ws.visitTeacherCardViewModes,
      ws.redHighlightNorms,
      ws.cardTemplate,
      ws.teacherCardCtx,
      ws.teacherFilterKey,
      ws.headers,
      ws.rawRows,
      ws.rolesForLessonMatrix,
      ws.customLabels,
      ws.staffRows,
      ws.narrativeBusyId,
      ws.emailBusyId,
      ws.pdfBusyId,
      ws.pdfCompactBusyId,
      ws.pdfCaptureBusy,
      ws.saveBusy,
      ws.dashboardRows,
      ws.resolveBlockAiNarrative,
      ws.blocksWithResolvedNarratives,
      ws.onTeacherCardViewModeChange,
      ws.onTeacherCardAiQueueChange,
      ws.generateNarrative,
      ws.agreeAndPersist,
      ws.revokeAgreeAndPersist,
      ws.sendEmail,
      ws.downloadTeacherPdf,
      ws.downloadTeacherPdfOnePage,
      ws.onTeacherCardAiNarrativeChange,
      ws.patchTeacherRowMembership,
    ],
  );

  return useCallback(
    (block: LessonAnalyticsTeacherBlock, cardIndex = 0) => (
      <VisitChecklistTeacherCardRow key={block.id} block={block} cardIndex={cardIndex} ws={cardWs} />
    ),
    [cardWs],
  );
}
