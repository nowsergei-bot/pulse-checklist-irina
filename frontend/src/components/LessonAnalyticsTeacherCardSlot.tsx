import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { type LessonAnalyticsCardTemplate, type LessonAnalyticsTeacherBlock } from '../api/lessonAnalytics';
import type { AnalyticRow } from '../lib/excelAnalytics/engine';
import type { CellPrimitive } from '../lib/excelAnalytics/parse';
import type { ColumnRole, CustomFilterLabels } from '../lib/excelAnalytics/types';
import type { TeacherPeriodComparison } from '../lib/lessonAnalytics/computeLessonPeriodComparison';
import type { TeacherCardCtx } from '../lib/lessonAnalytics/buildLessonAnalyticsTeacherCardView';
import type { TeacherCardRowMembership } from '../lib/lessonAnalytics/teacherCardRowMembership';
import { type CorporateStaffRow } from '../api/dashboards';
import { normalizeTeacherLabel } from '../lib/lessonAnalytics/normalizeTeacherLabel';
import { useTeacherCardBackgroundStatus } from '../hooks/useTeacherCardBackgroundStatus';
import LessonAnalyticsTeacherBlockCard from './LessonAnalyticsTeacherBlockCard';

export type AiNarrativeStore = {
  byNorm: Record<string, string>;
  byBlockId: Record<string, string>;
};

type LessonAnalyticsTeacherCardSlotProps = {
  block: LessonAnalyticsTeacherBlock;
  cardIndex?: number;
  aiNarrativeStore: AiNarrativeStore;
  aiQueueBlockId: string | null;
  aiBatchRunning: boolean;
  aiBatchOrder: readonly string[];
  aiBatchGiveUp: readonly string[];
  aiBatchRetries?: Readonly<Record<string, number>>;
  aiQueueSelected: boolean;
  visitChecklistMode: boolean;
  visitCardViewMode: 'methodist' | 'teacher';
  highlightRed: boolean;
  cardTemplate: LessonAnalyticsCardTemplate;
  teacherCardCtx: TeacherCardCtx;
  teacherFilterKey: string;
  headers: string[];
  rawRows: CellPrimitive[][];
  rolesForLessonMatrix: ColumnRole[];
  customLabels: CustomFilterLabels;
  staffRows: CorporateStaffRow[];
  narrativeBusyId: string | null;
  emailBusyId: string | null;
  pdfBusyId: string | null;
  pdfCompactBusyId: string | null;
  pdfCaptureBusy: boolean;
  saveBusy: boolean;
  poolRows: AnalyticRow[];
  periodComparison: TeacherPeriodComparison | null;
  sliceChartsSlot: (charts: import('../lib/lessonAnalytics/buildLessonAnalyticsTeacherCardView').TeacherSliceChart[]) => ReactNode;
  resolveBlockAiNarrative: (block: LessonAnalyticsTeacherBlock, store: AiNarrativeStore) => string;
  resolveDisplayBlock: (
    block: LessonAnalyticsTeacherBlock,
    store: AiNarrativeStore,
  ) => LessonAnalyticsTeacherBlock;
  onVisitCardViewModeChange: (blockId: string, mode: 'methodist' | 'teacher') => void;
  onAiQueueSelectChange: (blockId: string, selected: boolean) => void;
  onGenerateNarrative: (block: LessonAnalyticsTeacherBlock) => void;
  onAgree: (blockId: string) => void;
  onRevokeAgree: (blockId: string) => void;
  onEmail: (block: LessonAnalyticsTeacherBlock) => void;
  onDownloadPdf: (block: LessonAnalyticsTeacherBlock) => void;
  onDownloadPdfOnePage: (block: LessonAnalyticsTeacherBlock) => void;
  onAiNarrativeChange: (blockId: string, text: string) => void;
  onRowMembershipChange: (blockId: string, membership: TeacherCardRowMembership) => void;
  /** Чек-лист: полное тело карточки — только в viewport или по кнопке. */
  deferHeavyBody?: boolean;
  /** Явный выбор в Чек-лист 2.0 — открывать без ожидания простоя пользователя. */
  heavyBodyOpenPriority?: boolean;
  /** Чек-лист 2.0: явный выбор — без очереди heavyCardGate. */
  instantHeavyBody?: boolean;
  /** Пошаговый монтаж тяжёлых секций тела карточки. */
  progressiveBody?: boolean;
  /** Чек-лист 2.0: ИИ сразу, баллы/таблицы — по кнопке. */
  visitDeferScoresOnly?: boolean;
  /** Тяжёлое тело — только по кнопке, без viewport. */
  heavyBodyManualOnly?: boolean;
  onDeferHeavyBodyOpen?: () => void;
};

function LessonAnalyticsTeacherCardSlot({
  block,
  cardIndex: _cardIndex,
  aiNarrativeStore,
  aiQueueBlockId,
  aiBatchRunning,
  aiBatchOrder,
  aiBatchGiveUp,
  aiBatchRetries = {},
  aiQueueSelected,
  visitChecklistMode,
  visitCardViewMode,
  highlightRed,
  cardTemplate,
  teacherCardCtx,
  teacherFilterKey,
  headers,
  rawRows,
  rolesForLessonMatrix,
  customLabels,
  staffRows,
  narrativeBusyId,
  emailBusyId,
  pdfBusyId,
  pdfCompactBusyId,
  pdfCaptureBusy,
  saveBusy,
  poolRows,
  periodComparison,
  sliceChartsSlot,
  resolveBlockAiNarrative,
  resolveDisplayBlock,
  onVisitCardViewModeChange,
  onAiQueueSelectChange,
  onGenerateNarrative,
  onAgree,
  onRevokeAgree,
  onEmail,
  onDownloadPdf,
  onDownloadPdfOnePage,
  onAiNarrativeChange,
  onRowMembershipChange,
  deferHeavyBody = false,
  heavyBodyOpenPriority = false,
  instantHeavyBody = false,
  progressiveBody = false,
  visitDeferScoresOnly = false,
  heavyBodyManualOnly = false,
  onDeferHeavyBodyOpen,
}: LessonAnalyticsTeacherCardSlotProps) {
  const displayBlock = useMemo(
    () => resolveDisplayBlock(block, aiNarrativeStore),
    [block, aiNarrativeStore, resolveDisplayBlock],
  );
  const aiNarrativeText = useMemo(
    () => resolveBlockAiNarrative(displayBlock, aiNarrativeStore),
    [displayBlock, aiNarrativeStore, resolveBlockAiNarrative],
  );

  const aiForming = aiQueueBlockId === block.id;
  const aiBatchGiveUpSet = useMemo(() => new Set(aiBatchGiveUp), [aiBatchGiveUp]);
  const aiInBatchQueue =
    aiBatchRunning && aiBatchOrder.includes(block.id) && !aiBatchGiveUpSet.has(block.id);
  const aiPending = aiInBatchQueue && aiQueueBlockId !== block.id;
  const aiGiveUp = aiBatchGiveUpSet.has(block.id);
  const narrativeBusy = narrativeBusyId === block.id || aiForming;

  const cardBackgroundStatus = useTeacherCardBackgroundStatus({
    blockId: block.id,
    hasAiNarrative: Boolean(aiNarrativeText.trim()),
    narrativeBusy,
    aiBatchRunning,
    aiQueueBlockId,
    aiBatchOrder,
    aiBatchGiveUp,
    aiBatchRetries,
  });

  const cardArchiveStatusText = cardBackgroundStatus?.compactLine ?? null;
  const showArchivePending = Boolean(cardBackgroundStatus);

  const resolvedEmail = useMemo(
    () => resolveEmailFromStaff(staffRows, block.teacherLabel),
    [staffRows, block.teacherLabel],
  );

  const handleVisitModeChange = useCallback(
    (mode: 'methodist' | 'teacher') => onVisitCardViewModeChange(block.id, mode),
    [block.id, onVisitCardViewModeChange],
  );
  const handleAiQueueChange = useCallback(
    (on: boolean) => onAiQueueSelectChange(block.id, on),
    [block.id, onAiQueueSelectChange],
  );

  return (
    <LessonAnalyticsTeacherBlockCard
      block={displayBlock}
      visitChecklistMode={visitChecklistMode}
      teacherAudienceView={visitChecklistMode && visitCardViewMode === 'teacher'}
      showVisitCardViewToggle={visitChecklistMode}
      visitCardViewMode={visitCardViewMode}
      onVisitCardViewModeChange={handleVisitModeChange}
      defaultCollapsed={false}
      highlightRed={highlightRed}
      aiQueueSelected={aiQueueSelected}
      onAiQueueSelectChange={handleAiQueueChange}
      cardTemplate={cardTemplate}
      aiNarrativeText={aiNarrativeText}
      narrativeManualEdit={Boolean(displayBlock.aiNarrativeManualEdit)}
      teacherCardCtx={teacherCardCtx}
      teacherFilterKey={teacherFilterKey}
      headers={headers}
      rawRows={rawRows}
      rolesForLessonMatrix={rolesForLessonMatrix}
      customLabels={customLabels}
      resolvedEmail={resolvedEmail}
      narrativeBusy={narrativeBusy}
      aiPending={aiPending || showArchivePending}
      aiGiveUp={aiGiveUp}
      cardArchiveStatusText={cardArchiveStatusText}
      cardBackgroundStatus={cardBackgroundStatus}
      emailBusy={emailBusyId === block.id}
      pdfBusy={pdfBusyId === block.id}
      pdfCompactBusy={pdfCompactBusyId === block.id}
      pdfCaptureBusy={pdfCaptureBusy}
      aiBatchRunning={aiBatchRunning}
      saveBusy={saveBusy}
      sliceChartsSlot={sliceChartsSlot}
      onGenerateNarrative={onGenerateNarrative}
      onAgree={onAgree}
      onRevokeAgree={onRevokeAgree}
      onEmail={onEmail}
      onDownloadPdf={onDownloadPdf}
      onDownloadPdfOnePage={onDownloadPdfOnePage}
      onAiNarrativeChange={onAiNarrativeChange}
      poolRows={poolRows}
      onRowMembershipChange={onRowMembershipChange}
      periodComparison={periodComparison}
      cardIndex={_cardIndex}
      deferHeavyBody={deferHeavyBody}
      heavyBodyOpenPriority={heavyBodyOpenPriority}
      instantHeavyBody={instantHeavyBody}
      progressiveBody={progressiveBody}
      visitDeferScoresOnly={visitDeferScoresOnly}
      heavyBodyManualOnly={heavyBodyManualOnly}
      onDeferHeavyBodyOpen={onDeferHeavyBodyOpen}
    />
  );
}

export default memo(LessonAnalyticsTeacherCardSlot, (prev, next) => {
  if (prev.block !== next.block) return false;
  if (prev.cardIndex !== next.cardIndex) return false;
  if (prev.deferHeavyBody !== next.deferHeavyBody) return false;
  if (prev.heavyBodyOpenPriority !== next.heavyBodyOpenPriority) return false;
  if (prev.instantHeavyBody !== next.instantHeavyBody) return false;
  if (prev.progressiveBody !== next.progressiveBody) return false;
  if (prev.visitDeferScoresOnly !== next.visitDeferScoresOnly) return false;
  if (prev.heavyBodyManualOnly !== next.heavyBodyManualOnly) return false;
  if (prev.aiNarrativeStore !== next.aiNarrativeStore) {
    const id = prev.block.id;
    const norm = normalizeTeacherLabel(prev.block.teacherLabel);
    const prevText =
      String(prev.block.aiNarrative ?? '').trim() ||
      String(prev.aiNarrativeStore.byBlockId[id] ?? '').trim() ||
      String(prev.aiNarrativeStore.byNorm[norm] ?? '').trim();
    const nextText =
      String(next.block.aiNarrative ?? '').trim() ||
      String(next.aiNarrativeStore.byBlockId[id] ?? '').trim() ||
      String(next.aiNarrativeStore.byNorm[norm] ?? '').trim();
    if (prevText !== nextText) return false;
    if (String(prev.block.aiNarrativeContentHash ?? '') !== String(next.block.aiNarrativeContentHash ?? '')) {
      return false;
    }
  }
  if (prev.aiQueueBlockId !== next.aiQueueBlockId) {
    const id = prev.block.id;
    if (prev.aiQueueBlockId === id || next.aiQueueBlockId === id) return false;
  }
  if (prev.aiBatchRunning !== next.aiBatchRunning) {
    const id = prev.block.id;
    const prevInBatch =
      prev.aiBatchRunning &&
      (prev.aiBatchOrder.includes(id) || prev.aiQueueBlockId === id || prev.narrativeBusyId === id);
    const nextInBatch =
      next.aiBatchRunning &&
      (next.aiBatchOrder.includes(id) || next.aiQueueBlockId === id || next.narrativeBusyId === id);
    if (prevInBatch !== nextInBatch) return false;
  }
  if (prev.aiBatchOrder !== next.aiBatchOrder) {
    const id = prev.block.id;
    const prevIn = prev.aiBatchOrder.includes(id);
    const nextIn = next.aiBatchOrder.includes(id);
    if (prevIn !== nextIn) return false;
  }
  if (prev.aiBatchGiveUp !== next.aiBatchGiveUp) {
    const id = prev.block.id;
    const prevGiveUp = prev.aiBatchGiveUp.includes(id);
    const nextGiveUp = next.aiBatchGiveUp.includes(id);
    if (prevGiveUp !== nextGiveUp) return false;
  }
  if (prev.aiQueueSelected !== next.aiQueueSelected) return false;
  if (prev.visitCardViewMode !== next.visitCardViewMode) return false;
  if (prev.highlightRed !== next.highlightRed) return false;
  if (prev.narrativeBusyId !== next.narrativeBusyId) {
    if (prev.narrativeBusyId === prev.block.id || next.narrativeBusyId === prev.block.id) return false;
  }
  if (prev.emailBusyId !== next.emailBusyId) {
    if (prev.emailBusyId === prev.block.id || next.emailBusyId === prev.block.id) return false;
  }
  if (prev.pdfBusyId !== next.pdfBusyId) {
    if (prev.pdfBusyId === prev.block.id || next.pdfBusyId === prev.block.id) return false;
  }
  if (prev.pdfCompactBusyId !== next.pdfCompactBusyId) {
    if (prev.pdfCompactBusyId === prev.block.id || next.pdfCompactBusyId === prev.block.id) return false;
  }
  if (prev.pdfCaptureBusy !== next.pdfCaptureBusy) return false;
  if (prev.saveBusy !== next.saveBusy) return false;
  if (prev.periodComparison !== next.periodComparison) return false;
  if (prev.visitChecklistMode !== next.visitChecklistMode) return false;
  if (prev.cardTemplate !== next.cardTemplate) return false;
  if (prev.teacherCardCtx !== next.teacherCardCtx) return false;
  if (prev.teacherFilterKey !== next.teacherFilterKey) return false;
  if (prev.headers !== next.headers) return false;
  if (prev.rawRows !== next.rawRows) return false;
  if (prev.rolesForLessonMatrix !== next.rolesForLessonMatrix) return false;
  if (prev.customLabels !== next.customLabels) return false;
  if (prev.staffRows !== next.staffRows) return false;
  if (prev.poolRows !== next.poolRows) return false;
  return true;
});

function normStaffName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveEmailFromStaff(staffRows: CorporateStaffRow[], teacherLabel: string): string | null {
  const t = normStaffName(teacherLabel);
  if (!t) return null;
  for (const r of staffRows) {
    const n = normStaffName(r.full_name);
    if (n && n === t) return r.email;
  }
  for (const r of staffRows) {
    const n = normStaffName(r.full_name);
    if (n && (t.includes(n) || n.includes(t))) return r.email;
  }
  return null;
}

export function teacherPeriodComparisonForBlock(
  block: LessonAnalyticsTeacherBlock,
  periodComparisonByTeacher: Map<string, TeacherPeriodComparison>,
): TeacherPeriodComparison | null {
  return periodComparisonByTeacher.get(normalizeTeacherLabel(block.teacherLabel)) ?? null;
}
