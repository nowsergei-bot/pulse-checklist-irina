import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from 'react';
import { listCorporateStaffDirectory } from '../api/dashboards';
import { type CorporateStaffRow } from '../api/dashboards';
import { postExcelNarrativeSummary } from '../api/excel';
import { postLessonAnalyticsSendEmail, putLessonAnalyticsProject } from '../api/lessonAnalytics';
import { type LessonAnalyticsCardTemplate, type LessonAnalyticsDraft, type LessonAnalyticsLlmProvider, type LessonAnalyticsTeacherBlock } from '../api/lessonAnalytics';
import {
  buildAnalyticRows,
  expandRowsForMultiValueFilterColumns,
  expandRowsForPulseSurveyMultiSelect,
  filterKeyForRole,
  augmentRowsWithDerivedParallel,
  type AnalyticRow,
  type FilterSelection,
} from '../lib/excelAnalytics/engine';
import { usePulseExcelSliceFilters } from '../lib/excelAnalytics/usePulseExcelSliceFilters';
import {
  filterTeacherBlocksBySurname,
  filterTeacherBlocksForSlice,
  hasActiveSliceFilters,
  listTeacherLabelsFromRows,
} from '../lib/lessonAnalytics/filterTeacherBlocksForSlice';
import { useVisitChecklistTeacherBlocks } from './useVisitChecklistTeacherBlocks';
import { useBackgroundWorkGate } from './useBackgroundWorkGate';
import {
  appendToAiBatchOrder,
  buildAiBatchOrderFromBlocks,
  computeAiBatchProgress,
  listBlocksForAiQueue,
  peekNextAiBatchBlockId,
  removeFromAiBatchOrder,
  type AiBatchQueueMode,
} from '../lib/lessonAnalytics/aiBatchQueue';
import { enqueueNarrativeRequest, resetNarrativeRequestQueue } from '../lib/lessonAnalytics/narrativeRequestQueue';
import {
  buildTeacherCardContentHash,
  fetchTeacherCardArchiveList,
  saveTeacherCardToArchive,
} from '../lib/lessonAnalytics/teacherCardArchive';
import {
  hydrateTeacherCardsFromArchive,
  markTeacherCardProcessing,
  markTeacherCardReady,
  resetTeacherCardArchiveStatuses,
} from '../lib/lessonAnalytics/teacherCardArchiveQueue';
import {
  buildRedHighlightSelectionForKeys,
  teacherNormsMatchingRedHighlight,
  toggleFilterSelectionValue,
} from '../lib/lessonAnalytics/redHighlight';
import { downloadPdfArrayBufferAsFile } from '../lib/lessonAnalytics/buildLessonAnalyticsTeacherPdf';
import {
  buildLessonAnalyticsTeacherPdfForBlockBytes,
  buildLessonAnalyticsTeacherPdfForBlockOnePageBytes,
} from '../lib/lessonAnalytics/buildLessonAnalyticsTeacherPdfFromCardData';
import { preloadPdfFonts } from '../lib/pdf/jsPdfEmbedFonts';
import { safePdfFileBase } from '../lib/lessonAnalytics/safePdfFileBase';
import { buildTeacherCardNarrativeContext } from '../lib/lessonAnalytics/buildTeacherCardNarrativeContext';
import { buildMinimalTeacherFactsExcerpt } from '../lib/lessonAnalytics/lessonTeacherNarrativeContext';
import { pickLessonTeacherNarrativeText } from '../lib/lessonAnalytics/lessonTeacherNarrativeFallback';
import { normalizeLessonTeacherNarrativeText } from '../lib/lessonAnalytics/lessonTeacherNarrativeSanitize';
import { yieldToMain } from '../lib/yieldToMain';
import {
  canRunBackgroundWork,
  scheduleBackgroundWork,
  subscribeBackgroundWorkGate,
  waitForBackgroundWork,
} from '../lib/backgroundWorkGate';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { buildLessonAnalyticsTeacherCardView } from '../lib/lessonAnalytics/buildLessonAnalyticsTeacherCardView';
import {
  appendRowsToLessonGrid,
  formatLessonGridSourceLabel,
} from '../lib/lessonAnalytics/appendLessonExcelGrid';
import type { TeacherCardRowMembership } from '../lib/lessonAnalytics/teacherCardRowMembership';
import { buildTeacherRowIdxSignature } from '../lib/lessonAnalytics/teacherCardRowMembership';
import { resolveSessionAndRowsFromImportedGrid } from '../lib/lessonAnalytics/resolveImportedGridSession';
import { applyServiceTimestampIgnore } from '../lib/excelAnalytics/serviceTimestamp';
import { serializeImportedRows } from '../lib/excelAnalytics/importedGridSerialize';
import { collapseSimilarFilterDimensionValues } from '../lib/excelAnalytics/filterValueNormalize';
import {
  extractHeadersAndRows,
  getSheetMatrix,
  readWorkbookMeta,
  type CellPrimitive,
} from '../lib/excelAnalytics/parse';
import { pickLessonObservationSheetName } from '../lib/excelAnalytics/autoMap';
import {
  headersLookLikeVisitChecklistAnalytics,
  resolveLessonAnalyticsColumnRoles,
} from '../lib/lessonVisitChecklist/resolveVisitChecklistGridRoles';
import { fileFingerprintFromFile, matchSessionForSheet, type SavedExcelSession } from '../lib/excelAnalytics/excelSessionStorage';
import { validateRoles, type ColumnRole, type CustomFilterLabels } from '../lib/excelAnalytics/types';
import { roughNormFilterValue } from '../lib/excelAnalytics/filterValueNormalize';
import { sortTeachersByLabel } from '../lib/lessonAnalytics/teacherCipherDepartment';
import { isVisitChecklistAnalytics } from '../lib/lessonVisitChecklist/buildVisitChecklistDashboard';
import {
  fetchAnalyticsProject,
  invalidateAnalyticsProjectCache,
} from '../lib/lessonVisitChecklist/analyticsProjectCache';
import { prefetchAnalyticsPageModule } from '../lib/lessonVisitChecklist/prefetchAnalyticsProject';
import { cacheKeyForAnalyticsProject, prefetchVisitDashboardNarrative } from '../lib/lessonVisitChecklist/prefetchVisitDashboardNarrative';
import {
  estimateAiBatchRemainingSec,
  formatEtaRu,
  normalizeLessonCardTemplate,
  pluralRuCards,
} from '../lib/lessonAnalytics/cardTemplate';
import { remapTeacherBlocksToStableIds } from '../lib/lessonAnalytics/teacherBlockId';
import { getCardMountProgress } from '../lib/cardMountProgress';
import { buildLessonTeacherPdfBlockInput } from '../lib/lessonAnalytics/buildLessonTeacherPdfBlockInput';
import { loadDefaultLessonCardTemplate } from '../lib/lessonAnalytics/lessonAnalyticsPdfVisual';
import { type VisitChecklistDashCard } from '../api/visitChecklist';
import { fetchVisitChecklistTeacherDashCard } from '../lib/lessonVisitChecklist/fetchVisitChecklistTeacherDashCard';
import type { TeacherCardPdfContext } from '../pages/visitChecklistCloud/pdfBuilder/normalizeTeacherCard';
import {
  AI_BATCH_GAP_AFTER_RATE_LIMIT_MS,
  AI_BATCH_GAP_MS,
  AI_BATCH_NARRATIVE_RETRIES,
  AI_BATCH_RATE_LIMIT_COOLDOWN_MS,
  AI_BATCH_RETRY_DELAY_MS,
  blocksWithResolvedNarratives,
  collectOrdinalValues,
  countBlocksWithAiNarrative,
  EMPTY_AI_NARRATIVE_STORE,
  EMPTY_CUSTOM_LABELS,
  escHtml,
  hydrateAiNarrativeStore,
  MAX_ROWS,
  rebindAiNarrativeBlockIds,
  resolveAiNarrativeTimeoutMs,
  resolveBlockAiNarrative,
  resolveTeacherDisplayNarrative,
  resolveTeacherFilterLabel,
  sleepMs,
  type AiBatchStartOpts,
  type AiNarrativeStore,
  type LessonAiProgress,
  isFatalNarrativeHint,
  isRateLimitNarrativeHint,
} from '../lib/lessonAnalytics/visitChecklistAnalyticsHelpers';

const EMPTY_SLICE_FILTER_HIDDEN: string[] = [];

export type UseVisitChecklistAnalyticsWorkspaceArgs = {
  projectId: number;
  reloadToken?: number;
  visitProjectId: number;
  visitTitle?: string;
  responseCount?: number;
  directorShareToken?: string | null;
  onResync?: () => Promise<void>;
  resyncBusy?: boolean;
};

export function useVisitChecklistAnalyticsWorkspace({
  projectId,
  reloadToken = 0,
  visitProjectId,
  visitTitle,
  responseCount,
  directorShareToken: directorShareTokenArg,
  onResync,
  resyncBusy,
}: UseVisitChecklistAnalyticsWorkspaceArgs) {
  const visitChecklistMode = true as const;
  const backgroundWorkAllowed = useBackgroundWorkGate();
  /** Фоновая ИИ при загрузке: очередь для карточек без текста после подгрузки архива. */
  const AUTO_BACKGROUND_AI_ON_LOAD = true;

  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState('Аналитика уроков');
  const [teacherBlocks, setTeacherBlocks] = useState<LessonAnalyticsTeacherBlock[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [cardArchiveBusy, setCardArchiveBusy] = useState(false);
  const [cardArchiveItems, setCardArchiveItems] = useState<
    Array<{ block_id: string; object_key: string; size_bytes: number; updated_at: string | null }>
  >([]);
  const [cardArchiveOpen, setCardArchiveOpen] = useState(false);
  const [cardArchiveHydrateBusy, setCardArchiveHydrateBusy] = useState(false);
  const cardArchiveHydratingRef = useRef(false);
  const hydrateBatchRef = useRef<Array<{ blockId: string; teacherLabel: string; text: string; fromLlm?: boolean; contentHash?: string }>>([]);
  const hydrateBatchTimerRef = useRef<number | null>(null);
  const archiveHydrateGenRef = useRef(0);
  const pendingStableIdPersistRef = useRef(false);
  const [pdfCaptureBusy, setPdfCaptureBusy] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [pdfCompactBusyId, setPdfCompactBusyId] = useState<string | null>(null);
  const [pdfBuilderOpen, setPdfBuilderOpen] = useState(false);
  const [pdfBuilderCard, setPdfBuilderCard] = useState<VisitChecklistDashCard | null>(null);
  const [pdfBuilderContext, setPdfBuilderContext] = useState<TeacherCardPdfContext | null>(null);
  const narrativePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourceFiles, setSourceFiles] = useState<string[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheet, setSheet] = useState('');
  const [headerRow1Based, setHeaderRow1Based] = useState(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<CellPrimitive[][]>([]);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [customLabels, setCustomLabels] = useState<CustomFilterLabels>(EMPTY_CUSTOM_LABELS);
  const [ordinalLevels, setOrdinalLevels] = useState<string[]>([]);
  const [fileFingerprint, setFileFingerprint] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [analyticRows, setAnalyticRows] = useState<AnalyticRow[]>([]);
  const [pendingServerSession, setPendingServerSession] = useState<SavedExcelSession | null>(null);
  const [cardTemplate, setCardTemplate] = useState<LessonAnalyticsCardTemplate>(() => normalizeLessonCardTemplate(loadDefaultLessonCardTemplate()));
  const [dashboardNarrative, setDashboardNarrative] = useState('');
  const [dashboardNarrativeSource, setDashboardNarrativeSource] = useState<'llm' | 'manual' | null>(null);
  const [llmProvider, setLlmProvider] = useState<LessonAnalyticsLlmProvider>('closed');
  const [staffRows, setStaffRows] = useState<CorporateStaffRow[]>([]);
  const [narrativeBusyId, setNarrativeBusyId] = useState<string | null>(null);
  const [aiQueueBlockId, setAiQueueBlockId] = useState<string | null>(null);
  const [emailBusyId, setEmailBusyId] = useState<string | null>(null);
  const [directorShareToken, setDirectorShareToken] = useState<string | null>(directorShareTokenArg ?? null);
  const [sheetLoadBusy, setSheetLoadBusy] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [teacherSurnameFilter, setTeacherSurnameFilter] = useState('');
  const debouncedTeacherSurnameFilter = useDebouncedValue(teacherSurnameFilter, 300);
  const [visitAnalyticsTab, setVisitAnalyticsTab] = useState<'summary' | 'teachers'>('teachers');
  const [visitTeacherCardViewModes, setVisitTeacherCardViewModes] = useState<Record<string, 'methodist' | 'teacher'>>({});
  const [sliceFilterBootstrap, setSliceFilterBootstrap] = useState<{ selection: FilterSelection; hidden: string[] } | null>(null);
  const [redHighlightSelection, setRedHighlightSelection] = useState<FilterSelection>({});
  const [aiQueueSelection, setAiQueueSelection] = useState<Record<string, boolean>>({});
  const [aiBatchQueueSnapshot, setAiBatchQueueSnapshot] = useState<{ order: string[]; giveUp: string[] }>({ order: [], giveUp: [] });
  const rebuildSliceFromTableRef = useRef<() => void>(() => {});
  const [autoAiSession, setAutoAiSession] = useState(0);
  const [aiProgress, setAiProgress] = useState<LessonAiProgress>({ done: 0, total: 0, currentName: '', running: false, filled: 0 });
  const cancelAiBatchRef = useRef(false);
  const autoBgAiUserPausedRef = useRef(true);
  const autoBgAiLabelsKeyRef = useRef('');
  const batchNarrativeAbortRef = useRef<AbortController | null>(null);
  const singleNarrativeAbortRef = useRef<AbortController | null>(null);
  const aiBatchRunIdRef = useRef(0);
  const aiBatchInitialTotalRef = useRef(0);
  const aiBatchGiveUpIdsRef = useRef(new Set<string>());
  const aiBatchQueueModeRef = useRef<AiBatchQueueMode>('missing');
  const aiBatchSelectedIdsRef = useRef<Set<string>>(new Set());
  const aiBatchEnqueuedOrderRef = useRef<string[]>([]);
  const aiBatchScopeRef = useRef<LessonAnalyticsTeacherBlock[]>([]);
  const narrativeBusyIdRef = useRef<string | null>(null);
  const aiQueueBlockIdRef = useRef<string | null>(null);
  const syncAiFilledProgressRef = useRef<(patch: Partial<LessonAiProgress>) => void>(() => {});
  const aiBatchRunningRef = useRef(false);
  const [aiNarrativeStore, setAiNarrativeStore] = useState<AiNarrativeStore>(EMPTY_AI_NARRATIVE_STORE);
  const aiNarrativeStoreRef = useRef(aiNarrativeStore);
  aiNarrativeStoreRef.current = aiNarrativeStore;
  const teacherBlocksRef = useRef(teacherBlocks);
  const teacherLabelsKeyRef = useRef('');
  const teacherFilterKeyRef = useRef<string | null>(null);
  const aiProgressRef = useRef(aiProgress);
  const buildTeacherCardContentHashForBlockRef = useRef<(block: LessonAnalyticsTeacherBlock) => string>(() => '');
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const narrativeCtxRef = useRef({ dashboardRows: [] as AnalyticRow[], metricNumericCols: [] as number[], headers: [] as string[], roles: [] as ColumnRole[], structuralFilterKeys: [] as string[], filterLabels: {} as Record<string, string>, dateLabel: '', ordinalLevels: [] as string[] });

  useEffect(() => {
    void listCorporateStaffDirectory().then(setStaffRows).catch(() => setStaffRows([]));
    void preloadPdfFonts().catch(() => {});
    prefetchAnalyticsPageModule();
  }, []);

  useEffect(() => {
    if (directorShareTokenArg != null) setDirectorShareToken(directorShareTokenArg);
  }, [directorShareTokenArg]);


  const setRoleAt = useCallback((colIndex: number, role: ColumnRole) => {
    const n = headers.length;
    if (n === 0) return;
    setRoles((prev) => {
      const next: ColumnRole[] = [];
      for (let j = 0; j < n; j++) next[j] = j === colIndex ? role : prev[j] ?? 'ignore';
      return next;
    });
    if (role === 'metric_ordinal_text') setOrdinalLevels(collectOrdinalValues(rawRows, colIndex));
  }, [headers.length, rawRows]);

  const executeAnalysis = useCallback((h: string[], matrixRows: CellPrimitive[][], rolesInput: ColumnRole[], ordinalInput: string[]) => {
    const v = validateRoles(rolesInput);
    if (!v.ok) { setErr(v.message ?? 'Проверьте маппинг'); return; }
    const ordCol = rolesInput.indexOf('metric_ordinal_text');
    if (ordCol >= 0 && ordinalInput.length === 0) { setErr('Для текстовой шкалы задайте порядок уровней.'); return; }
    const { roles: rolesForRun } = applyServiceTimestampIgnore(h, matrixRows, rolesInput);
    const rolesFixed = isVisitChecklistAnalytics(rolesForRun) ? rolesForRun : rolesForRun;
    const vRun = validateRoles(rolesFixed);
    if (!vRun.ok) { setErr(vRun.message ?? 'Проверьте маппинг'); return; }
    setErr(null);
    let built = buildAnalyticRows(h, matrixRows, rolesFixed, customLabels, ordinalInput);
    built = expandRowsForMultiValueFilterColumns(built, rolesFixed, customLabels);
    built = augmentRowsWithDerivedParallel(built, rolesFixed, customLabels);
    built = expandRowsForPulseSurveyMultiSelect(built, rolesFixed);
    built = collapseSimilarFilterDimensionValues(built, rolesFixed, customLabels);
    setAnalyticRows(built);
    rebuildSliceFromTableRef.current();
  }, [customLabels]);

  const resolveRolesForImport = useCallback((h: string[], matrixRows: CellPrimitive[][], savedRoles?: ColumnRole[]) => {
    const fromTemplate = resolveLessonAnalyticsColumnRoles(h, matrixRows, { preferVisitChecklist: true });
    if (fromTemplate.fromVisitTemplate) return fromTemplate;
    const base = savedRoles && savedRoles.length === h.length && validateRoles(savedRoles).ok
      ? savedRoles
      : resolveLessonAnalyticsColumnRoles(h, matrixRows, { preferVisitChecklist: true }).roles;
    return { roles: base, customLabels: {} as CustomFilterLabels, ordinalLevels: [] as string[], fromVisitTemplate: false };
  }, []);

  const runAnalysisDeferred = useCallback((h: string[], matrixRows: CellPrimitive[][], rolesInput: ColumnRole[], ordinalInput: string[]) => {
    setAnalysisBusy(true);
    window.setTimeout(() => {
      void (async () => {
        await yieldToMain();
        startTransition(() => executeAnalysis(h, matrixRows, rolesInput, ordinalInput));
        await yieldToMain();
        setAnalysisBusy(false);
      })();
    }, 0);
  }, [executeAnalysis]);

  const runAnalysisDeferredRef = useRef(runAnalysisDeferred);
  runAnalysisDeferredRef.current = runAnalysisDeferred;

  useEffect(() => {
    if (!Number.isFinite(projectId)) {
      setLoadErr('Укажите ?project=ID в адресе (откройте проект с hub-страницы).');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const forceReload = reloadToken > 0;
        const { draft, project } = await fetchAnalyticsProject(projectId, { force: forceReload });
        if (cancelled) return;
        setProjectTitle(project.title || draft.title);
        const loadedBlocksRaw = draft.teacherBlocks ?? [];
        const loadedBlocks = remapTeacherBlocksToStableIds(projectId, loadedBlocksRaw);
        pendingStableIdPersistRef.current = loadedBlocks.some(
          (b, i) => b.id !== String(loadedBlocksRaw[i]?.id ?? ''),
        );
        const loadedStore = hydrateAiNarrativeStore(loadedBlocks);
        aiNarrativeStoreRef.current = loadedStore;
        setAiNarrativeStore(loadedStore);
        if (directorShareTokenArg == null) setDirectorShareToken(project.director_share_token ?? null);
        setCardTemplate(normalizeLessonCardTemplate(draft.cardTemplate ?? loadDefaultLessonCardTemplate()));
        setDashboardNarrative(String(draft.dashboardNarrative ?? '').trim());
        setDashboardNarrativeSource(draft.dashboardNarrativeSource ?? null);
        setLlmProvider(draft.llmProvider === 'open' ? 'open' : 'closed');
        setRedHighlightSelection(
          draft.redHighlightSelection && typeof draft.redHighlightSelection === 'object'
            ? { ...draft.redHighlightSelection }
            : {},
        );
        setAiQueueSelection({});
        const ig = draft.importedGrid;
        const ses = draft.excelSession;
        const resolved = ig && ig.headers?.length && ig.rows?.length ? resolveSessionAndRowsFromImportedGrid(ig, ses) : null;
        if (resolved && ig) {
          setPendingServerSession(null);
          const { session, revivedRows } = resolved;
          setHeaders(ig.headers);
          setRawRows(revivedRows);
          setSheet(ig.sheet);
          setHeaderRow1Based(ig.headerRow1Based);
          const loadedSources = ig.sourceFiles?.map((n) => String(n ?? '').trim()).filter(Boolean) ?? (ig.fileName?.trim() ? [ig.fileName.trim()] : []);
          setSourceFiles(loadedSources);
          setFileName(formatLessonGridSourceLabel(loadedSources, ig.fileName));
          setFileFingerprint(session.fingerprint || 'server-stored-grid');
          const visitRolesResolved = resolveLessonAnalyticsColumnRoles(ig.headers, revivedRows, { preferVisitChecklist: true });
          const treatAsVisitGrid = visitRolesResolved.fromVisitTemplate || headersLookLikeVisitChecklistAnalytics(ig.headers);
          const visitFixedForLoad = treatAsVisitGrid
            ? visitRolesResolved.fromVisitTemplate
              ? visitRolesResolved
              : resolveLessonAnalyticsColumnRoles(ig.headers, revivedRows, { preferVisitChecklist: true })
            : null;
          const rolesForLoad = visitFixedForLoad ? visitFixedForLoad.roles : (session.roles as ColumnRole[]);
          const customLabelsForLoad = visitFixedForLoad
            ? Object.keys(visitFixedForLoad.customLabels).length > 0 ? visitFixedForLoad.customLabels : EMPTY_CUSTOM_LABELS
            : session.customLabels && Object.keys(session.customLabels).length > 0 ? session.customLabels : EMPTY_CUSTOM_LABELS;
          const ordForLoad = (() => {
            if (visitFixedForLoad) return visitFixedForLoad.ordinalLevels;
            const oc = rolesForLoad.indexOf('metric_ordinal_text');
            if (oc >= 0 && session.ordinalLevels.length > 0) return session.ordinalLevels;
            return oc >= 0 ? collectOrdinalValues(revivedRows, oc) : [];
          })();
          setTeacherBlocks(loadedBlocks);
          setRoles(rolesForLoad);
          setCustomLabels(customLabelsForLoad);
          setOrdinalLevels(ordForLoad);
          setSliceFilterBootstrap({ selection: session.filterSelection ?? {}, hidden: session.filterPanelHiddenKeys ?? [] });
          runAnalysisDeferredRef.current(ig.headers, revivedRows, rolesForLoad, ordForLoad);
        } else if (draft.excelSession) {
          setPendingServerSession(draft.excelSession);
          setTeacherBlocks(loadedBlocks);
        } else if (!resolved) {
          setTeacherBlocks(loadedBlocks);
        }
        setLoadErr(null);
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : 'Не удалось загрузить проект');
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, reloadToken, directorShareTokenArg]);

  const rolesForLessonMatrix = useMemo(() => {
    if (!headers.length || !rawRows.length || roles.length !== headers.length) return roles;
    return applyServiceTimestampIgnore(headers, rawRows, roles).roles;
  }, [headers, rawRows, roles]);

  const sliceFilters = usePulseExcelSliceFilters({
    analyticRows,
    roles: rolesForLessonMatrix,
    headers,
    customLabels,
    initialFilterSelection: sliceFilterBootstrap?.selection ?? null,
    initialFilterPanelHiddenKeys: sliceFilterBootstrap?.hidden ?? EMPTY_SLICE_FILTER_HIDDEN,
  });
  rebuildSliceFromTableRef.current = sliceFilters.rebuildPageFromTable;
  const dashboardRows = sliceFilters.dashboardRows;

  const teacherFilterKey = useMemo(() => {
    if (!rolesForLessonMatrix.includes('filter_teacher_code')) return null;
    return filterKeyForRole('filter_teacher_code', customLabels);
  }, [rolesForLessonMatrix, customLabels]);

  const visitFilterSummaryRu = useMemo(() => {
    const sel = sliceFilters.filterSelection;
    const parts: string[] = [];
    for (const [key, values] of Object.entries(sel)) {
      if (!values?.length) continue;
      parts.push(`${sliceFilters.filterKeyDisplayLabel[key] ?? key}: ${values.join(', ')}`);
    }
    return parts.join('; ');
  }, [sliceFilters.filterSelection, sliceFilters.filterKeyDisplayLabel]);

  const metricNumericCols = useMemo(() => {
    const idxs: number[] = [];
    rolesForLessonMatrix.forEach((r, i) => { if (r === 'metric_numeric') idxs.push(i); });
    return idxs;
  }, [rolesForLessonMatrix]);

  const dateLabel = useMemo(() => {
    const di = rolesForLessonMatrix.indexOf('date');
    return di >= 0 ? headers[di]?.trim() || 'Дата' : '';
  }, [rolesForLessonMatrix, headers]);

  const teacherLabelsKeyFromRows = useMemo(() => {
    const labels = listTeacherLabelsFromRows(dashboardRows, teacherFilterKey);
    return labels.length ? labels.join('\u0001') : '';
  }, [dashboardRows, teacherFilterKey]);

  const syncVisitTeacherBlocksToState = useCallback((derived: LessonAnalyticsTeacherBlock[]) => {
    const store = aiNarrativeStoreRef.current;
    const reboundStore = rebindAiNarrativeBlockIds(store, derived);
    teacherBlocksRef.current = derived;
    startTransition(() => {
      setTeacherBlocks(derived);
      if (reboundStore !== store) {
        aiNarrativeStoreRef.current = reboundStore;
        setAiNarrativeStore(reboundStore);
      }
    });
  }, []);

  const visitChecklistTeacherBlocks = useVisitChecklistTeacherBlocks({
    enabled: visitChecklistMode,
    projectId,
    teacherFilterKey,
    dashboardRows,
    rawRows,
    roles: rolesForLessonMatrix,
    persistedBlocks: teacherBlocks,
    narrativeStore: aiNarrativeStore,
    onStructuralSync: syncVisitTeacherBlocksToState,
  });

  const teacherLabelsKey = visitChecklistTeacherBlocks.teacherLabelsKey || teacherLabelsKeyFromRows;
  const activeTeacherBlocks = visitChecklistTeacherBlocks.blocks;

  teacherBlocksRef.current = activeTeacherBlocks;
  teacherLabelsKeyRef.current = teacherLabelsKey;
  teacherFilterKeyRef.current = teacherFilterKey;
  aiProgressRef.current = aiProgress;
  narrativeBusyIdRef.current = narrativeBusyId;
  aiQueueBlockIdRef.current = aiQueueBlockId;
  narrativeCtxRef.current = {
    dashboardRows: sliceFilters.filteredRows,
    metricNumericCols,
    headers,
    roles: rolesForLessonMatrix,
    structuralFilterKeys: sliceFilters.filterKeys,
    filterLabels: sliceFilters.filterLabels,
    dateLabel,
    ordinalLevels,
  };

  const visitChecklistLabelsKey = visitChecklistTeacherBlocks.labelsKey;

  /** Ключ для фоновой подгрузки архива — по ФИО, без id (structural sync не перезапускает hydrate). */
  const teacherBlocksHydrateKey = useMemo(
    () =>
      activeTeacherBlocks
        .map(
          (b) =>
            `${String(b.teacherLabel ?? '').trim()}|${b.status}|${b.aiNarrativeManualEdit ? 1 : 0}|${String(b.aiNarrativeContentHash ?? '').trim()}`,
        )
        .join(';'),
    [activeTeacherBlocks],
  );

  const autoPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardTemplateMetaKey = useMemo(() => JSON.stringify(cardTemplate), [cardTemplate]);

  const makeDraftForBlocks = useCallback(
    (blocks: LessonAnalyticsTeacherBlock[]): LessonAnalyticsDraft => {
      const hasGrid = headers.length > 0 && rawRows.length > 0;
      const fp = fileFingerprint || (hasGrid ? 'server-stored-grid' : '');
      const excelSession: SavedExcelSession | null =
        hasGrid && fp
          ? {
              v: 1,
              fingerprint: fp,
              fileName: fileName || 'file.xlsx',
              sheet,
              headerRow1Based,
              headers,
              roles,
              customLabels,
              ordinalLevels,
              filterSelection: sliceFilters.sliceFilterSelection,
              filterPanelHiddenKeys: sliceFilters.filterPanelHiddenKeys,
            }
          : null;
      const importedGrid =
        hasGrid && excelSession
          ? {
              v: 1 as const,
              fileName: formatLessonGridSourceLabel(sourceFiles, fileName || 'file.xlsx'),
              sourceFiles: sourceFiles.length > 0 ? sourceFiles : undefined,
              sheet,
              headerRow1Based,
              headers,
              rows: serializeImportedRows(rawRows),
            }
          : null;
      return {
        title: projectTitle,
        updatedAt: new Date().toISOString(),
        excelSession,
        importedGrid,
        teacherBlocks: blocks,
        linkedSurvey: null,
        cardTemplate,
        redHighlightSelection,
        dashboardNarrative: dashboardNarrative.trim() || null,
        dashboardNarrativeSource: dashboardNarrative.trim() ? dashboardNarrativeSource : null,
        analysisPeriod: null,
        llmProvider,
      };
    },
    [
      fileFingerprint, headers, rawRows, fileName, sourceFiles, sheet, headerRow1Based, roles,
      customLabels, ordinalLevels, projectTitle, cardTemplate, redHighlightSelection,
      sliceFilters.sliceFilterSelection, sliceFilters.filterPanelHiddenKeys,
      dashboardNarrative, dashboardNarrativeSource, llmProvider,
    ],
  );
  useEffect(() => {
    if (visitAnalyticsTab !== 'summary') return;
    if (!Number.isFinite(projectId)) return;
    prefetchVisitDashboardNarrative(
      makeDraftForBlocks(activeTeacherBlocks),
      `${cacheKeyForAnalyticsProject(projectId)}:${llmProvider}`,
      { filterSummary: visitFilterSummaryRu },
    );
  }, [
    visitChecklistMode,
    visitAnalyticsTab,
    projectId,
    llmProvider,
    visitFilterSummaryRu,
    makeDraftForBlocks,
    activeTeacherBlocks,
  ]);


  const saveProject = useCallback(async () => {
    if (!Number.isFinite(projectId)) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const draft = makeDraftForBlocks(
        blocksWithResolvedNarratives(activeTeacherBlocks, aiNarrativeStoreRef.current),
      );
      const { project } = await putLessonAnalyticsProject(projectId, { title: projectTitle, draft });
      setProjectTitle(project.title);
      if (project.director_share_token) setDirectorShareToken(project.director_share_token);
      invalidateAnalyticsProjectCache(projectId);
      setSaveMsg('Сохранено');
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaveBusy(false);
    }
  }, [projectId, makeDraftForBlocks, activeTeacherBlocks, projectTitle]);


  const teacherBlocksMetaKey = useMemo(
    () =>
      activeTeacherBlocks
        .map((b) => {
          const base = `${b.id}|${b.status}|${b.agreedAt ?? ''}|${b.emailedAt ?? ''}|${b.pdfPrintedAt ?? ''}|${b.teacherLabel}`;
          if (aiProgress.running) return base;
          return `${base}|n:${String(b.aiNarrative ?? '').length}`;
        })
        .join(';'),
    [activeTeacherBlocks, aiProgress.running],
  );

  const autoPersistDraft = useCallback(async () => {
    if (!Number.isFinite(projectId)) return;
    if (headers.length === 0 || rawRows.length === 0) return;
    if (aiBatchRunningRef.current) return;
    if (!visitChecklistTeacherBlocks.ready) return;
    try {
      const blocksToSave = teacherBlocksRef.current;
      const draft: LessonAnalyticsDraft = makeDraftForBlocks(
        blocksWithResolvedNarratives(blocksToSave, aiNarrativeStoreRef.current),
      );
      const { project } = await putLessonAnalyticsProject(projectId, { title: projectTitle, draft });
      if (project.director_share_token) setDirectorShareToken(project.director_share_token);
      invalidateAnalyticsProjectCache(projectId);
    } catch {
      /* ошибку показывает ручное «Сохранить на сервер» */
    }
  }, [
    projectId,
    headers.length,
    rawRows.length,
    makeDraftForBlocks,
    projectTitle,
    visitChecklistMode,
    visitChecklistTeacherBlocks.ready,
    visitChecklistLabelsKey,
  ]);

  const scheduleNarrativePersist = useCallback(() => {
    if (!Number.isFinite(projectId)) return;
    if (headers.length === 0 || rawRows.length === 0) return;
    if (aiBatchRunningRef.current || aiProgressRef.current.running) return;
    if (narrativePersistTimerRef.current) clearTimeout(narrativePersistTimerRef.current);
    narrativePersistTimerRef.current = setTimeout(() => {
      narrativePersistTimerRef.current = null;
      if (aiBatchRunningRef.current || aiProgressRef.current.running) return;
      void autoPersistDraft();
    }, 6000);
  }, [projectId, headers.length, rawRows.length, autoPersistDraft]);

  useEffect(() => {
    if (!Number.isFinite(projectId)) return;
    if (headers.length === 0 || rawRows.length === 0) return;
    if (document.hidden) return;
    if (aiBatchRunningRef.current || aiProgress.running) return;
    if (narrativeBusyIdRef.current) return;
    if (autoPersistTimerRef.current) clearTimeout(autoPersistTimerRef.current);
    autoPersistTimerRef.current = setTimeout(() => {
      autoPersistTimerRef.current = null;
      if (document.hidden) return;
      if (aiBatchRunningRef.current || aiProgressRef.current.running) return;
      if (narrativeBusyIdRef.current) return;
      void autoPersistDraft();
    }, 12_000);
    return () => {
      if (autoPersistTimerRef.current) clearTimeout(autoPersistTimerRef.current);
    };
  }, [
    projectId,
    headers.length,
    rawRows.length,
    roles,
    ordinalLevels,
    customLabels,
    teacherBlocksMetaKey,
    projectTitle,
    cardTemplateMetaKey,
    redHighlightSelection,
    dashboardNarrative,
    dashboardNarrativeSource,
    
    autoPersistDraft,
    aiProgress.running,
  ]);

  const commitAiNarrative = useCallback(
    (
      blockId: string,
      teacherLabel: string,
      text: string,
      opts?: { fromLlm?: boolean; manualEdit?: boolean; contentHash?: string; deferred?: boolean },
    ) => {
      const norm = roughNormFilterValue(teacherLabel);
      const trimmed = normalizeLessonTeacherNarrativeText(text, teacherLabel, {
        fromLlm: opts?.fromLlm,
        manualEdit: opts?.manualEdit,
      });
      const contentHash = String(opts?.contentHash ?? '').trim();

      const applyStore = (prev: AiNarrativeStore): AiNarrativeStore => {
        const next: AiNarrativeStore = {
          byNorm: { ...prev.byNorm },
          byBlockId: { ...prev.byBlockId },
        };
        if (trimmed) {
          next.byNorm[norm] = trimmed;
          next.byBlockId[blockId] = trimmed;
          for (const b of teacherBlocksRef.current) {
            if (roughNormFilterValue(b.teacherLabel) === norm) next.byBlockId[b.id] = trimmed;
          }
        } else {
          delete next.byNorm[norm];
          delete next.byBlockId[blockId];
          for (const b of teacherBlocksRef.current) {
            if (roughNormFilterValue(b.teacherLabel) === norm) delete next.byBlockId[b.id];
          }
        }
        aiNarrativeStoreRef.current = next;
        return next;
      };
      const applyBlocks = (prev: LessonAnalyticsTeacherBlock[]) => {
        const nextBlocks = prev.map((b) => {
          if (b.id !== blockId && roughNormFilterValue(b.teacherLabel) !== norm) return b;
          const manualEdit = opts?.manualEdit ? true : opts?.fromLlm ? false : b.aiNarrativeManualEdit;
          return {
            ...b,
            aiNarrative: trimmed,
            aiNarrativeManualEdit: manualEdit,
            ...(contentHash ? { aiNarrativeContentHash: contentHash } : {}),
          };
        });
        teacherBlocksRef.current = nextBlocks;
        return nextBlocks;
      };
      const apply = () => {
        setAiNarrativeStore(applyStore);
        setTeacherBlocks(applyBlocks);
      };
      if (!trimmed) {
        startTransition(apply);
        return;
      }
      if (opts?.deferred || aiBatchRunningRef.current) startTransition(apply);
      else startTransition(apply);
    },
    [],
  );

  const patchBlock = useCallback(
    (id: string, patch: Partial<LessonAnalyticsTeacherBlock>, narrativeOpts?: { manualEdit?: boolean }) => {
      if ('aiNarrative' in patch) {
        const b = teacherBlocksRef.current.find((x) => x.id === id);
        commitAiNarrative(
          id,
          b?.teacherLabel ?? '',
          String(patch.aiNarrative ?? ''),
          narrativeOpts?.manualEdit ? { manualEdit: true } : undefined,
        );
        return;
      }
      const apply = () => {
        setTeacherBlocks((prev) => {
          const next = prev.map((b) => (b.id === id ? { ...b, ...patch } : b));
          teacherBlocksRef.current = next;
          return next;
        });
      };
      startTransition(apply);
    },
    [commitAiNarrative],
  );

  const patchTeacherRowMembership = useCallback(
    (blockId: string, membership: TeacherCardRowMembership) => {
      const b = teacherBlocksRef.current.find((x) => x.id === blockId);
      if (!b) return;
      startTransition(() => {
        setTeacherBlocks((prev) => {
          const next = prev.map((x) =>
            x.id === blockId ? { ...x, rowMembership: membership, aiNarrative: '' } : x,
          );
          teacherBlocksRef.current = next;
          return next;
        });
      });
      commitAiNarrative(blockId, b.teacherLabel, '');
      setSaveMsg('Состав карточки обновлён. Пересоздайте ИИ-аналитику при необходимости.');
      scheduleNarrativePersist();
    },
    [commitAiNarrative, scheduleNarrativePersist],
  );

  const aiBatchSnapshotRafRef = useRef<number | null>(null);
  const refreshAiBatchQueueSnapshot = useCallback((force = false) => {
    const apply = () => {
      setAiBatchQueueSnapshot({
        order: [...aiBatchEnqueuedOrderRef.current],
        giveUp: [...aiBatchGiveUpIdsRef.current],
      });
    };
    if (force) {
      if (aiBatchSnapshotRafRef.current != null) {
        cancelAnimationFrame(aiBatchSnapshotRafRef.current);
        aiBatchSnapshotRafRef.current = null;
      }
      apply();
      return;
    }
    if (aiBatchSnapshotRafRef.current != null) return;
    aiBatchSnapshotRafRef.current = requestAnimationFrame(() => {
      aiBatchSnapshotRafRef.current = null;
      apply();
    });
  }, []);

  const enqueueAiBatchCards = useCallback(
    (blockIds: string[]): boolean => {
      if (!blockIds.length) return false;
      if (!aiBatchRunningRef.current && !aiProgressRef.current.running) return false;

      const scope =
        aiBatchScopeRef.current.length > 0 ? aiBatchScopeRef.current : teacherBlocksRef.current;
      const scopeIds = new Set(scope.map((b) => b.id));
      const valid = blockIds.filter(
        (id) => scopeIds.has(id) || teacherBlocksRef.current.some((b) => b.id === id),
      );
      if (!valid.length) return false;

      for (const id of valid) aiBatchSelectedIdsRef.current.add(id);
      const { order, added } = appendToAiBatchOrder(
        aiBatchEnqueuedOrderRef.current,
        aiBatchGiveUpIdsRef.current,
        valid,
      );
      aiBatchEnqueuedOrderRef.current = order;
      if (added === 0) return false;

      const { total, done } = computeAiBatchProgress(order, aiBatchGiveUpIdsRef.current);
      syncAiFilledProgressRef.current({ done, total, running: true });
      refreshAiBatchQueueSnapshot();
      setErr(null);
      return true;
    },
    [refreshAiBatchQueueSnapshot],
  );

  const dequeueAiBatchCards = useCallback(
    (blockIds: string[]) => {
      if (!blockIds.length) return;
      if (!aiBatchRunningRef.current && !aiProgressRef.current.running) return;

      const nextOrder = removeFromAiBatchOrder(
        aiBatchEnqueuedOrderRef.current,
        aiBatchGiveUpIdsRef.current,
        blockIds,
        aiQueueBlockIdRef.current,
      );
      if (nextOrder.length === aiBatchEnqueuedOrderRef.current.length) return;
      aiBatchEnqueuedOrderRef.current = nextOrder;
      for (const id of blockIds) aiBatchSelectedIdsRef.current.delete(id);

      const { total, done } = computeAiBatchProgress(nextOrder, aiBatchGiveUpIdsRef.current);
      syncAiFilledProgressRef.current({ done, total, running: true });
      refreshAiBatchQueueSnapshot();
    },
    [refreshAiBatchQueueSnapshot],
  );

  const aiQueueContentHashOpts = useMemo(
    () => ({
      getContentHash: (block: LessonAnalyticsTeacherBlock) => buildTeacherCardContentHashForBlockRef.current(block),
    }),
    [],
  );

  const scheduleBackgroundAiBatch = useCallback((opts?: AiBatchStartOpts): boolean => {
    if (!teacherFilterKeyRef.current) {
      setErr('Назначьте колонке роль «Педагог» и пересчитайте аналитику.');
      return false;
    }
    if (!teacherLabelsKeyRef.current) {
      setErr('В текущем срезе нет педагогов — сбросьте фильтры или дождитесь расчёта таблицы.');
      return false;
    }
    if (!narrativeCtxRef.current.dashboardRows.length) {
      setErr('В срезе нет строк данных — дождитесь окончания расчёта таблицы.');
      return false;
    }
    if (analysisBusy) {
      setErr('Дождитесь окончания пересчёта таблицы, затем запустите ИИ.');
      return false;
    }

    const mode: AiBatchQueueMode = opts?.mode ?? 'missing';
    aiBatchQueueModeRef.current = mode;
    aiBatchScopeRef.current = opts?.blocksScope?.length ? opts.blocksScope : teacherBlocksRef.current;

    let selectedIds: Set<string>;
    if (mode === 'selected') {
      selectedIds = opts?.blockIds?.length
        ? new Set(opts.blockIds)
        : new Set(
            Object.entries(aiQueueSelection)
              .filter(([, on]) => on)
              .map(([id]) => id),
          );
      if (selectedIds.size === 0) {
        setErr('Отметьте карточки галочкой «В очередь ИИ» или нажмите «Выбрать всех видимых».');
        return false;
      }
    } else {
      selectedIds = new Set();
    }

    if (aiBatchRunningRef.current || aiProgressRef.current.running) {
      aiBatchSelectedIdsRef.current = new Set([
        ...aiBatchSelectedIdsRef.current,
        ...selectedIds,
      ]);
      const ids =
        mode === 'selected'
          ? [...selectedIds]
          : mode === 'all'
            ? aiBatchScopeRef.current.map((b) => b.id)
            : listBlocksForAiQueue(
                aiBatchScopeRef.current,
                aiNarrativeStoreRef.current,
                aiBatchGiveUpIdsRef.current,
                mode,
                selectedIds,
                aiQueueContentHashOpts,
              ).map((b) => b.id);
      if (!ids.length) {
        setErr('Нет новых карточек для добавления в текущую очередь.');
        return false;
      }
      return enqueueAiBatchCards(ids);
    }

    aiBatchSelectedIdsRef.current = selectedIds;

    const queue = listBlocksForAiQueue(
      aiBatchScopeRef.current,
      aiNarrativeStoreRef.current,
      aiBatchGiveUpIdsRef.current,
      mode,
      aiBatchSelectedIdsRef.current,
      aiQueueContentHashOpts,
    );
    if (queue.length === 0) {
      setErr(
        mode === 'missing'
          ? 'У всех карточек в выборке уже есть ИИ-текст (или очередь уже прошла по ним).'
          : mode === 'selected'
            ? 'Нет отмеченных карточек для очереди (проверьте галочки).'
            : 'Нет карточек для переанализа в текущем списке.',
      );
      return false;
    }
    cancelAiBatchRef.current = false;
    autoBgAiUserPausedRef.current = false;
    aiBatchGiveUpIdsRef.current = new Set();
    aiBatchEnqueuedOrderRef.current = buildAiBatchOrderFromBlocks(queue);
    aiBatchInitialTotalRef.current = queue.length;
    refreshAiBatchQueueSnapshot(true);
    setErr(null);
    setAutoAiSession((s) => s + 1);
    return true;
  }, [analysisBusy, aiQueueSelection, enqueueAiBatchCards, refreshAiBatchQueueSnapshot, aiQueueContentHashOpts]);

  /** Фоновая ИИ при загрузке отключена — только по кнопке. */
  useEffect(() => {
    if (!AUTO_BACKGROUND_AI_ON_LOAD) return;
    if (!visitChecklistMode) return;
    if (!teacherFilterKey || !teacherLabelsKey || analysisBusy) return;
    if (!visitChecklistTeacherBlocks.ready) return;
    if (autoBgAiUserPausedRef.current) return;
    if (cardArchiveHydratingRef.current) return;
    if (aiBatchRunningRef.current || aiProgress.running) return;
    const missing = listBlocksForAiQueue(
      teacherBlocksRef.current,
      aiNarrativeStoreRef.current,
      aiBatchGiveUpIdsRef.current,
      'missing',
      new Set(),
    );
    if (missing.length === 0) return;
    const scheduleKey = `${teacherFilterKey}\u0001${teacherLabelsKey}`;
    if (autoBgAiLabelsKeyRef.current === scheduleKey) return;
    const cardCount = teacherBlocksRef.current.length;
    const delayMs = cardCount > 80 ? 18_000 : cardCount > 40 ? 12_000 : 6_000;
    let retryTimer: number | null = null;
    const tryStartAi = () => {
      if (autoBgAiUserPausedRef.current) return;
      if (cardArchiveHydratingRef.current) {
        retryTimer = window.setTimeout(tryStartAi, 2000);
        return;
      }
      if (aiBatchRunningRef.current || aiProgressRef.current.running) return;
      const { mounted, total } = getCardMountProgress();
      if (total >= 24 && mounted < Math.min(total, 16)) {
        retryTimer = window.setTimeout(tryStartAi, 1500);
        return;
      }
      autoBgAiLabelsKeyRef.current = scheduleKey;
      scheduleBackgroundAiBatch({ mode: 'missing' });
    };
    const t = window.setTimeout(tryStartAi, delayMs);
    return () => {
      window.clearTimeout(t);
      if (retryTimer != null) window.clearTimeout(retryTimer);
    };
  }, [
    visitChecklistMode,
    teacherLabelsKey,
    teacherFilterKey,
    analysisBusy,
    visitChecklistTeacherBlocks.ready,
    scheduleBackgroundAiBatch,
    aiProgress.running,
  ]);

  const startAiBatchForAllTeachers = useCallback(() => {
    autoBgAiUserPausedRef.current = false;
    autoBgAiLabelsKeyRef.current = '';
    if (teacherBlocks.length === 0) {
      setErr('Нет карточек педагогов — загрузите файл и дождитесь списка карточек.');
      return;
    }
    scheduleBackgroundAiBatch({ mode: 'missing' });
  }, [teacherBlocks.length, scheduleBackgroundAiBatch]);

  const startAiRerunAllVisible = useCallback(() => {
    autoBgAiUserPausedRef.current = false;
    autoBgAiLabelsKeyRef.current = '';
    if (!teacherFilterKey) {
      setErr('Назначьте колонке роль «Педагог».');
      return;
    }
    const scope = filterTeacherBlocksBySurname(
      filterTeacherBlocksForSlice(
        teacherBlocksRef.current,
        sliceFilters.filteredRows,
        teacherFilterKey,
        sliceFilters.filterSelection,
      ),
      teacherSurnameFilter,
    );
    if (!scope.length) {
      setErr('Нет видимых карточек по текущим фильтрам.');
      return;
    }
    scheduleBackgroundAiBatch({ mode: 'all', blocksScope: scope });
  }, [teacherFilterKey, sliceFilters.filteredRows, sliceFilters.filterSelection, teacherSurnameFilter, scheduleBackgroundAiBatch]);

  const startAiQueueSelected = useCallback(() => {
    autoBgAiUserPausedRef.current = false;
    if (!teacherFilterKey) {
      setErr('Назначьте колонке роль «Педагог».');
      return;
    }
    const scope = filterTeacherBlocksBySurname(
      filterTeacherBlocksForSlice(
        teacherBlocksRef.current,
        sliceFilters.filteredRows,
        teacherFilterKey,
        sliceFilters.filterSelection,
      ),
      teacherSurnameFilter,
    );
    const blockIds = scope.filter((b) => aiQueueSelection[b.id]).map((b) => b.id);
    scheduleBackgroundAiBatch({ mode: 'selected', blockIds, blocksScope: scope });
  }, [teacherFilterKey, sliceFilters.filteredRows, sliceFilters.filterSelection, teacherSurnameFilter, aiQueueSelection, scheduleBackgroundAiBatch]);

  const stopBackgroundAiBatch = useCallback(() => {
    cancelAiBatchRef.current = true;
    aiBatchRunIdRef.current += 1;
    batchNarrativeAbortRef.current?.abort();
    batchNarrativeAbortRef.current = null;
    aiBatchRunningRef.current = false;
    aiBatchEnqueuedOrderRef.current = [];
    setAiQueueBlockId(null);
    setAiProgress((p) => ({ ...p, running: false, currentName: '' }));
    refreshAiBatchQueueSnapshot(true);
  }, [refreshAiBatchQueueSnapshot]);

  const stopAiBatchForAllTeachers = useCallback(() => {
    autoBgAiUserPausedRef.current = true;
    stopBackgroundAiBatch();
    singleNarrativeAbortRef.current?.abort();
    singleNarrativeAbortRef.current = null;
    const filled = countBlocksWithAiNarrative(teacherBlocksRef.current, aiNarrativeStoreRef.current);
    setAiProgress((p) => ({ ...p, filled, running: false, currentName: '' }));
    setNarrativeBusyId(null);
  }, [stopBackgroundAiBatch]);

  const requestTeacherNarrative = useCallback(
    async (aiCtx: NonNullable<ReturnType<typeof buildTeacherCardNarrativeContext>>) => {
      return enqueueNarrativeRequest(async () => {
        batchNarrativeAbortRef.current?.abort();
        singleNarrativeAbortRef.current?.abort();
        const ac = new AbortController();
        batchNarrativeAbortRef.current = ac;
        singleNarrativeAbortRef.current = ac;
        const timeoutMs = resolveAiNarrativeTimeoutMs(aiCtx.fastMode, llmProvider);
        try {
          return await postExcelNarrativeSummary(
            {
              context: {
                ...aiCtx,
                llmProvider: llmProvider === 'open' ? 'open' : undefined,
              },
            },
            { signal: ac.signal, timeoutMs },
          );
        } finally {
          if (batchNarrativeAbortRef.current === ac) batchNarrativeAbortRef.current = null;
          if (singleNarrativeAbortRef.current === ac) singleNarrativeAbortRef.current = null;
        }
      });
    },
    [llmProvider],
  );

  const requestTeacherNarrativeRef = useRef(requestTeacherNarrative);
  requestTeacherNarrativeRef.current = requestTeacherNarrative;

  const syncAiFilledProgress = useCallback((patch: Partial<LessonAiProgress>) => {
    const filled = countBlocksWithAiNarrative(teacherBlocksRef.current, aiNarrativeStoreRef.current);
    startTransition(() => {
      setAiProgress((p) => ({ ...p, filled, ...patch }));
    });
  }, []);

  syncAiFilledProgressRef.current = syncAiFilledProgress;

  const applyAiNarrativesToBlocks = useCallback(() => {
    const store = aiNarrativeStoreRef.current;
    const synced = blocksWithResolvedNarratives(teacherBlocksRef.current, store);
    const prev = teacherBlocksRef.current;
    const blocksChanged = synced.some(
      (b, i) => String(b.aiNarrative ?? '').trim() !== String(prev[i]?.aiNarrative ?? '').trim(),
    );
    teacherBlocksRef.current = synced;
    if (!blocksChanged) return;
    startTransition(() => {
      setTeacherBlocks(synced);
    });
  }, []);

  const buildTeacherAiNarrativeContext = useCallback(
    (block: LessonAnalyticsTeacherBlock) => {
      if (!teacherFilterKey) return null;
      return buildTeacherCardNarrativeContext({
        block,
        teacherFilterKey,
        sliceRows: hasActiveSliceFilters(sliceFilters.filterSelection)
          ? sliceFilters.filteredRows
          : sliceFilters.dashboardRows,
        dashboardRows: sliceFilters.dashboardRows,
        filterKeys: sliceFilters.filterKeys,
        filterLabels: sliceFilters.filterLabels,
        metricNumericCols,
        headers,
        rawRows,
        roles: rolesForLessonMatrix,
        customLabels,
        ordinalLevels,
        dateLabel,
        aiUserFocus: cardTemplate.aiUserFocus ?? '',
        fastMode: cardTemplate.aiFastMode !== false,
        analysisPeriod: null,
        periodComparison: null,
      });
    },
    [
      teacherFilterKey,
      sliceFilters.filteredRows,
      sliceFilters.filterSelection,
      sliceFilters.dashboardRows,
      sliceFilters.filterKeys,
      sliceFilters.filterLabels,
      metricNumericCols,
      headers,
      dateLabel,
      rolesForLessonMatrix,
      ordinalLevels,
      rawRows,
      customLabels,
      cardTemplate.aiUserFocus,
      cardTemplate.aiFastMode,
    ],
  );

  const buildTeacherAiNarrativeContextRef = useRef(buildTeacherAiNarrativeContext);
  buildTeacherAiNarrativeContextRef.current = buildTeacherAiNarrativeContext;
  const patchBlockRef = useRef(patchBlock);
  patchBlockRef.current = patchBlock;
  const commitAiNarrativeRef = useRef(commitAiNarrative);
  commitAiNarrativeRef.current = commitAiNarrative;
  const scheduleNarrativePersistRef = useRef(scheduleNarrativePersist);
  scheduleNarrativePersistRef.current = scheduleNarrativePersist;
  const autoPersistDraftRef = useRef(autoPersistDraft);
  autoPersistDraftRef.current = autoPersistDraft;

  /** ИИ по одной карточке: текст сразу в карточке, затем следующая. */
  useEffect(() => {
    if (autoAiSession === 0) return;
    if (!teacherFilterKeyRef.current) return;

    const runId = ++aiBatchRunIdRef.current;
    cancelAiBatchRef.current = false;
    aiBatchRunningRef.current = true;
    aiBatchGiveUpIdsRef.current = new Set();

    const totalAtStart = aiBatchInitialTotalRef.current || teacherBlocksRef.current.length;
    let processed = 0;
    let filledThisRun = 0;
    let failed = 0;
    let lastFailHint = '';

    const finishQueue = () => {
      aiBatchRunningRef.current = false;
      aiBatchEnqueuedOrderRef.current = [];
      setAiQueueBlockId(null);
      applyAiNarrativesToBlocks();
      syncAiFilledProgressRef.current({
        done: processed,
        total: totalAtStart,
        currentName: '',
        running: false,
      });
      refreshAiBatchQueueSnapshot(true);
      scheduleNarrativePersistRef.current();
      void autoPersistDraftRef.current();
      resetNarrativeRequestQueue();
    };

    const processNextCard = async () => {
      if (runId !== aiBatchRunIdRef.current || cancelAiBatchRef.current) {
        finishQueue();
        return;
      }

      await waitForBackgroundWork(
        () => runId !== aiBatchRunIdRef.current || cancelAiBatchRef.current,
      );
      if (runId !== aiBatchRunIdRef.current || cancelAiBatchRef.current) {
        finishQueue();
        return;
      }

      const order = aiBatchEnqueuedOrderRef.current;
      const { total, done, left } = computeAiBatchProgress(order, aiBatchGiveUpIdsRef.current);
      const nextId = peekNextAiBatchBlockId(order, aiBatchGiveUpIdsRef.current);
      if (!nextId || left === 0) {
        if (failed > 0) {
          const rateHint = isRateLimitNarrativeHint(lastFailHint)
            ? ' Сервер ИИ ограничил частоту — подождите и запустите снова.'
            : '';
          setErr(
            `ИИ-аналитика: готово ${filledThisRun}, без текста: ${failed}` +
              (lastFailHint ? `. ${lastFailHint}` : '') +
              rateHint,
          );
        } else {
          setErr(null);
        }
        finishQueue();
        return;
      }

      const scope =
        aiBatchScopeRef.current.length > 0 ? aiBatchScopeRef.current : teacherBlocksRef.current;
      const block =
        scope.find((b) => b.id === nextId) ??
        teacherBlocksRef.current.find((b) => b.id === nextId);
      if (!block) {
        aiBatchGiveUpIdsRef.current.add(nextId);
        failed += 1;
        processed += 1;
        refreshAiBatchQueueSnapshot();
        void processNextCard();
        return;
      }
      if (!block.teacherLabel?.trim()) {
        aiBatchGiveUpIdsRef.current.add(block.id);
        failed += 1;
        processed += 1;
        lastFailHint = 'Карточка без метки педагога — пропущена.';
        refreshAiBatchQueueSnapshot();
        void processNextCard();
        return;
      }

      setAiQueueBlockId(block.id);
      markTeacherCardProcessing(block.id);
      syncAiFilledProgressRef.current({
        done,
        total,
        currentName: block.teacherLabel,
        running: true,
      });
      refreshAiBatchQueueSnapshot();
      await yieldToMain();

      try {
        const live = teacherBlocksRef.current.find((b) => b.id === block.id) ?? block;
        let aiCtx = buildTeacherAiNarrativeContextRef.current(live);
        if (!aiCtx) {
          aiBatchGiveUpIdsRef.current.add(block.id);
          failed += 1;
          processed += 1;
          lastFailHint = 'Не назначена роль колонки «Педагог».';
        } else if (!aiCtx.numericSummary.trim()) {
          aiBatchGiveUpIdsRef.current.add(block.id);
          failed += 1;
          processed += 1;
          lastFailHint = `Нет данных в срезе для «${live.teacherLabel}».`;
        } else {
          let text = '';
          let hint: string | undefined;
          let fromLlm = false;
          try {
            for (let attempt = 0; attempt <= AI_BATCH_NARRATIVE_RETRIES; attempt++) {
              if (runId !== aiBatchRunIdRef.current || cancelAiBatchRef.current) break;
              const rateLimited = isRateLimitNarrativeHint(hint);
              if (attempt > 0) {
                await sleepMs(
                  rateLimited ? AI_BATCH_RATE_LIMIT_COOLDOWN_MS * attempt : AI_BATCH_RETRY_DELAY_MS * attempt,
                );
              }
              const res = await requestTeacherNarrativeRef.current(aiCtx);
              const picked = pickLessonTeacherNarrativeText(res, {
                teacherLabel: live.teacherLabel,
                rowCount: aiCtx.meta?.filteredRowCount ?? 0,
                factsExcerpt: aiCtx.numericSummary,
                compFacts: aiCtx.compFactsForFallback,
              });
              text = picked.text;
              hint = picked.hint;
              fromLlm = picked.fromLlm;
              if (picked.fromLlm) break;
              if (isFatalNarrativeHint(hint)) break;
              if (!isRateLimitNarrativeHint(hint)) break;
            }
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : 'ИИ недоступен';
            const picked = pickLessonTeacherNarrativeText(null, {
              teacherLabel: live.teacherLabel,
              rowCount: aiCtx.meta?.filteredRowCount ?? 0,
              factsExcerpt: aiCtx.numericSummary,
              compFacts: aiCtx.compFactsForFallback,
              requestError: errMsg,
            });
            text = picked.text;
            hint = errMsg;
            fromLlm = false;
          }
          if (runId === aiBatchRunIdRef.current && !cancelAiBatchRef.current) {
            aiBatchGiveUpIdsRef.current.add(block.id);
            if (text.trim()) {
              const contentHash = buildTeacherCardContentHashForBlockRef.current(live);
              commitAiNarrativeRef.current(block.id, block.teacherLabel, text, {
                fromLlm,
                contentHash,
                deferred: true,
              });
              const pid = projectIdRef.current;
              if (Number.isFinite(pid)) {
                void saveTeacherCardToArchive({
                  projectId: Number(pid),
                  block: live,
                  contentHash,
                  aiNarrative: text,
                  fromLlm,
                });
              }
              markTeacherCardReady(block.id);
              await yieldToMain();
              filledThisRun += 1;
              if (!fromLlm) {
                lastFailHint =
                  hint && !isFatalNarrativeHint(hint)
                    ? `Часть карточек: автосводка (${hint})`
                    : 'Часть карточек: автосводка по таблице (ИИ не ответил).';
              } else if (hint && !isFatalNarrativeHint(hint)) {
                lastFailHint = `Часть карточек: автосводка (${hint})`;
              }
            } else {
              failed += 1;
              if (hint) lastFailHint = hint;
            }
            processed += 1;
            refreshAiBatchQueueSnapshot();
          }
        }
      } catch (e) {
        aiBatchGiveUpIdsRef.current.add(block.id);
        failed += 1;
        processed += 1;
        lastFailHint = e instanceof Error ? e.message : 'ИИ недоступен';
        setErr(lastFailHint);
        refreshAiBatchQueueSnapshot();
      }

      if (runId !== aiBatchRunIdRef.current || cancelAiBatchRef.current) {
        finishQueue();
        return;
      }

      setAiQueueBlockId(null);
      refreshAiBatchQueueSnapshot();
      const gap = isRateLimitNarrativeHint(lastFailHint)
        ? AI_BATCH_GAP_AFTER_RATE_LIMIT_MS
        : AI_BATCH_GAP_MS;
      await sleepMs(gap);
      await waitForBackgroundWork(
        () => runId !== aiBatchRunIdRef.current || cancelAiBatchRef.current,
      );
      void processNextCard();
    };

    const initialTotal = aiBatchEnqueuedOrderRef.current.length || totalAtStart;
    syncAiFilledProgressRef.current({
      done: 0,
      total: initialTotal,
      currentName: '',
      running: true,
      filled: countBlocksWithAiNarrative(teacherBlocksRef.current, aiNarrativeStoreRef.current),
    });
    refreshAiBatchQueueSnapshot();
    void processNextCard();

    return () => {
      cancelAiBatchRef.current = true;
      aiBatchRunIdRef.current += 1;
      batchNarrativeAbortRef.current?.abort();
      batchNarrativeAbortRef.current = null;
    };
  }, [autoAiSession, applyAiNarrativesToBlocks, refreshAiBatchQueueSnapshot]);

  useEffect(() => {
    return () => {
      cancelAiBatchRef.current = true;
      aiBatchRunIdRef.current += 1;
      batchNarrativeAbortRef.current?.abort();
      singleNarrativeAbortRef.current?.abort();
      resetNarrativeRequestQueue();
    };
  }, []);

  const persistTeacherBlocks = useCallback(
    async (next: LessonAnalyticsTeacherBlock[], successMsg: string, prevSnapshot: LessonAnalyticsTeacherBlock[]) => {
      if (!Number.isFinite(projectId)) return;
      setTeacherBlocks(next);
      setSaveBusy(true);
      setSaveMsg(null);
      try {
        const { project } = await putLessonAnalyticsProject(projectId, {
          title: projectTitle,
          draft: makeDraftForBlocks(blocksWithResolvedNarratives(next, aiNarrativeStoreRef.current)),
        });
        setProjectTitle(project.title);
        if (project.director_share_token) setDirectorShareToken(project.director_share_token);
        setSaveMsg(successMsg);
        setTimeout(() => setSaveMsg(null), 2500);
      } catch (e) {
        setTeacherBlocks(prevSnapshot);
        setSaveMsg(e instanceof Error ? e.message : 'Ошибка сохранения');
      } finally {
        setSaveBusy(false);
      }
    },
    [projectId, projectTitle, makeDraftForBlocks],
  );

  const agreeAndPersist = useCallback(
    async (blockId: string) => {
      const prevSnapshot = teacherBlocks;
      const at = new Date().toISOString();
      const next = teacherBlocks.map((b) =>
        b.id === blockId ? { ...b, status: 'agreed' as const, agreedAt: at } : b,
      );
      await persistTeacherBlocks(next, 'Согласование сохранено на сервере', prevSnapshot);
    },
    [teacherBlocks, persistTeacherBlocks],
  );

  const revokeAgreeAndPersist = useCallback(
    async (blockId: string) => {
      const prevSnapshot = teacherBlocks;
      const next = teacherBlocks.map((b) =>
        b.id === blockId ? { ...b, status: 'draft' as const, agreedAt: null } : b,
      );
      await persistTeacherBlocks(next, 'Согласование отменено', prevSnapshot);
    },
    [teacherBlocks, persistTeacherBlocks],
  );

  const teacherCardCtx = useMemo(
    () => ({
      teacherFilterKey,
      dashboardRows: sliceFilters.dashboardRows,
      sliceRows: hasActiveSliceFilters(sliceFilters.filterSelection)
        ? sliceFilters.filteredRows
        : undefined,
      structuralFilterKeys: sliceFilters.filterKeys,
      filterLabels: sliceFilters.filterLabels,
      metricNumericCols,
      headers,
      roles: rolesForLessonMatrix,
      ordinalLevels,
      dateLabel,
    }),
    [
      teacherFilterKey,
      sliceFilters.dashboardRows,
      sliceFilters.filteredRows,
      sliceFilters.filterSelection,
      sliceFilters.filterKeys,
      sliceFilters.filterLabels,
      metricNumericCols,
      headers,
      rolesForLessonMatrix,
      ordinalLevels,
      dateLabel,
    ],
  );

  const buildTeacherCardView = useCallback(
    (block: LessonAnalyticsTeacherBlock) => buildLessonAnalyticsTeacherCardView(block, teacherCardCtx),
    [teacherCardCtx],
  );

  const buildTeacherPdfBlockInput = useCallback(
    (block: LessonAnalyticsTeacherBlock) => {
      if (!teacherFilterKey || !headers.length || !rawRows.length) {
        throw new Error('Нет данных для PDF — загрузите файл и укажите роль «Педагог».');
      }
      const view = buildTeacherCardView(block);
      const aiText = resolveTeacherDisplayNarrative(block, aiNarrativeStoreRef.current);
      return buildLessonTeacherPdfBlockInput({
        cardTemplate,
        projectTitle,
        block,
        view,
        teacherFilterKey,
        headers,
        rawRows,
        rolesForLessonMatrix,
        customLabels,
        aiNarrative: aiText,
        visitChecklistMode,
      });
    },
    [
      buildTeacherCardView,
      projectTitle,
      teacherFilterKey,
      headers,
      rawRows,
      rolesForLessonMatrix,
      customLabels,
      cardTemplate,
      visitChecklistMode,
    ],
  );

  const buildTeacherCardContentHashForBlock = useCallback(
    (block: LessonAnalyticsTeacherBlock) => {
      const rowIdxSignature =
        teacherFilterKey && teacherCardCtx.dashboardRows.length
          ? buildTeacherRowIdxSignature({
              block,
              teacherFilterKey,
              poolRows: teacherCardCtx.dashboardRows,
              sliceRows: teacherCardCtx.sliceRows,
            })
          : '';
      return buildTeacherCardContentHash({
        projectId: Number(projectId),
        block,
        cardTemplate,
        rowIdxSignature,
        visitChecklistMode,
      });
    },
    [teacherFilterKey, teacherCardCtx, projectId, cardTemplate, visitChecklistMode],
  );

  buildTeacherCardContentHashForBlockRef.current = buildTeacherCardContentHashForBlock;

  useEffect(() => {
    if (!visitChecklistTeacherBlocks.ready) return;
    if (!teacherFilterKey || !headers.length) return;
    const blocks = teacherBlocksRef.current;
    let changed = false;
    const next = blocks.map((b) => {
      const text = resolveBlockAiNarrative(b, aiNarrativeStoreRef.current);
      if (!text || String(b.aiNarrativeContentHash ?? '').trim()) return b;
      const hash = buildTeacherCardContentHashForBlockRef.current({ ...b, aiNarrative: text });
      changed = true;
      return { ...b, aiNarrative: text, aiNarrativeContentHash: hash };
    });
    if (!changed) return;
    teacherBlocksRef.current = next;
    startTransition(() => setTeacherBlocks(next));
  }, [
    visitChecklistTeacherBlocks.ready,
    teacherLabelsKey,
    cardTemplateMetaKey,
    teacherFilterKey,
    headers.length,
  ]);

  const flushHydrateBatch = useCallback(() => {
    const batch = hydrateBatchRef.current.splice(0);
    if (!batch.length) return;
    startTransition(() => {
      setAiNarrativeStore((prev) => {
        const next: AiNarrativeStore = {
          byNorm: { ...prev.byNorm },
          byBlockId: { ...prev.byBlockId },
        };
        for (const item of batch) {
          const norm = roughNormFilterValue(item.teacherLabel);
          const trimmed = normalizeLessonTeacherNarrativeText(item.text, item.teacherLabel, {
            fromLlm: item.fromLlm,
          });
          if (!trimmed) continue;
          next.byNorm[norm] = trimmed;
          next.byBlockId[item.blockId] = trimmed;
          for (const b of teacherBlocksRef.current) {
            if (roughNormFilterValue(b.teacherLabel) === norm) next.byBlockId[b.id] = trimmed;
          }
        }
        aiNarrativeStoreRef.current = next;
        return next;
      });
      setTeacherBlocks((prev) => {
        let nextBlocks = prev;
        for (const item of batch) {
          const norm = roughNormFilterValue(item.teacherLabel);
          const trimmed = normalizeLessonTeacherNarrativeText(item.text, item.teacherLabel, {
            fromLlm: item.fromLlm,
          });
          nextBlocks = nextBlocks.map((b) => {
            if (b.id !== item.blockId && roughNormFilterValue(b.teacherLabel) !== norm) return b;
            return {
              ...b,
              aiNarrative: trimmed,
              aiNarrativeManualEdit: item.fromLlm ? false : b.aiNarrativeManualEdit,
              ...(item.contentHash ? { aiNarrativeContentHash: item.contentHash } : {}),
            };
          });
        }
        teacherBlocksRef.current = nextBlocks;
        return nextBlocks;
      });
    });
  }, []);

  const queueHydrateNarrative = useCallback(
    (
      blockId: string,
      teacherLabel: string,
      text: string,
      opts?: { fromLlm?: boolean; contentHash?: string },
    ) => {
      hydrateBatchRef.current.push({
        blockId,
        teacherLabel,
        text,
        fromLlm: opts?.fromLlm,
        contentHash: opts?.contentHash,
      });
      if (hydrateBatchTimerRef.current != null) return;
      const armFlush = () => {
        if (!canRunBackgroundWork()) {
          const unsub = subscribeBackgroundWorkGate(() => {
            if (canRunBackgroundWork()) {
              unsub();
              armFlush();
            }
          });
          return;
        }
        hydrateBatchTimerRef.current = window.setTimeout(() => {
          hydrateBatchTimerRef.current = null;
          flushHydrateBatch();
        }, 180);
      };
      armFlush();
    },
    [flushHydrateBatch],
  );

  const hydrateCardsFromArchive = useCallback(async () => {
    if (!Number.isFinite(projectId)) return;
    if (!teacherFilterKey) {
      setErr('Назначьте колонке роль «Педагог».');
      return;
    }
    if (!teacherBlocksRef.current.length) return;
    if (!visitChecklistTeacherBlocks.ready) return;
    if (cardArchiveHydratingRef.current) return;

    setCardArchiveHydrateBusy(true);
    cardArchiveHydratingRef.current = true;
    const gen = archiveHydrateGenRef.current + 1;
    archiveHydrateGenRef.current = gen;

    try {
      const { hydrated } = await hydrateTeacherCardsFromArchive({
        projectId: Number(projectId),
        blocks: teacherBlocksRef.current,
        computeContentHash: (block) => buildTeacherCardContentHashForBlockRef.current(block),
        hasNarrative: (block) => Boolean(resolveBlockAiNarrative(block, aiNarrativeStoreRef.current)),
        isManualEdit: (block) => Boolean(block.aiNarrativeManualEdit),
        isCancelled: () => archiveHydrateGenRef.current !== gen,
        respectUserActivity: true,
        onHydrate: (block, snapshot, contentHash) => {
          if (archiveHydrateGenRef.current !== gen) return;
          const fromLlm = snapshot.fromLlm ?? snapshot.aiNarrativeSource === 'llm';
          queueHydrateNarrative(block.id, block.teacherLabel, snapshot.aiNarrative, {
            fromLlm,
            contentHash,
          });
        },
      });
      if (hydrated > 0) scheduleNarrativePersistRef.current();
      setSaveMsg(hydrated > 0 ? `Из архива подгружено ${hydrated} карточек` : 'В архиве нет новых текстов');
      window.setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось подгрузить архив карточек');
    } finally {
      if (archiveHydrateGenRef.current === gen) {
        cardArchiveHydratingRef.current = false;
        setCardArchiveHydrateBusy(false);
        if (hydrateBatchTimerRef.current != null) {
          window.clearTimeout(hydrateBatchTimerRef.current);
          hydrateBatchTimerRef.current = null;
        }
        flushHydrateBatch();
      }
    }
  }, [
    projectId,
    teacherFilterKey,
    visitChecklistTeacherBlocks.ready,
    queueHydrateNarrative,
    flushHydrateBatch,
  ]);

  useEffect(() => {
    return () => {
      archiveHydrateGenRef.current += 1;
      cardArchiveHydratingRef.current = false;
    };
  }, [projectId, reloadToken]);

  useEffect(() => {
    resetTeacherCardArchiveStatuses();
  }, [projectId, reloadToken]);

  /** Фоновая подгрузка готовых текстов из S3-архива при открытии проекта. */
  useEffect(() => {
    if (!Number.isFinite(projectId)) return;
    if (!teacherFilterKey) return;
    if (!teacherBlocksRef.current.length) return;
    if (!sliceFilters.filteredRows.length) return;
    if (!visitChecklistTeacherBlocks.ready) return;

    let cancelled = false;
    const gen = archiveHydrateGenRef.current + 1;
    archiveHydrateGenRef.current = gen;

    const runHydrate = () => {
      if (cancelled || archiveHydrateGenRef.current !== gen) return;
      cardArchiveHydratingRef.current = true;
      setCardArchiveHydrateBusy(true);
      void hydrateTeacherCardsFromArchive({
        projectId: Number(projectId),
        blocks: teacherBlocksRef.current,
        computeContentHash: (block) => buildTeacherCardContentHashForBlockRef.current(block),
        hasNarrative: (block) => Boolean(resolveBlockAiNarrative(block, aiNarrativeStoreRef.current)),
        isManualEdit: (block) => Boolean(block.aiNarrativeManualEdit),
        isCancelled: () => cancelled || archiveHydrateGenRef.current !== gen,
        respectUserActivity: true,
        onHydrate: (block, snapshot, contentHash) => {
          if (cancelled || archiveHydrateGenRef.current !== gen) return;
          const fromLlm = snapshot.fromLlm ?? snapshot.aiNarrativeSource === 'llm';
          queueHydrateNarrative(block.id, block.teacherLabel, snapshot.aiNarrative, {
            fromLlm,
            contentHash,
          });
        },
      })
        .then(({ hydrated }) => {
          if (cancelled || archiveHydrateGenRef.current !== gen) return;
          if (hydrated > 0) scheduleNarrativePersistRef.current();
        })
        .finally(() => {
          if (archiveHydrateGenRef.current === gen) {
            cardArchiveHydratingRef.current = false;
            setCardArchiveHydrateBusy(false);
            if (hydrateBatchTimerRef.current != null) {
              window.clearTimeout(hydrateBatchTimerRef.current);
              hydrateBatchTimerRef.current = null;
            }
            flushHydrateBatch();
          }
        });
    };

    scheduleBackgroundWork(runHydrate, () => cancelled || archiveHydrateGenRef.current !== gen);

    return () => {
      cancelled = true;
      cardArchiveHydratingRef.current = false;
      setCardArchiveHydrateBusy(false);
    };
  }, [
    projectId,
    teacherFilterKey,
    teacherLabelsKey,
    visitChecklistTeacherBlocks.ready,
    visitChecklistLabelsKey,
    sliceFilters.filteredRows.length,
    teacherBlocksHydrateKey,
    queueHydrateNarrative,
    flushHydrateBatch,
  ]);

  /** Дописать contentHash для текстов из черновика — без повторного ИИ. */
  useEffect(() => {
    if (!visitChecklistMode || analysisBusy) return;
    if (!visitChecklistTeacherBlocks.ready) return;
    if (!teacherFilterKey) return;
    const blocks = teacherBlocksRef.current;
    if (!blocks.length) return;
    let changed = false;
    const next = blocks.map((b) => {
      const text = resolveBlockAiNarrative(b, aiNarrativeStoreRef.current);
      if (!text || String(b.aiNarrativeContentHash ?? '').trim()) return b;
      const hash = buildTeacherCardContentHashForBlockRef.current(b);
      if (!hash) return b;
      changed = true;
      return { ...b, aiNarrativeContentHash: hash };
    });
    if (!changed) return;
    teacherBlocksRef.current = next;
    startTransition(() => setTeacherBlocks(next));
    scheduleNarrativePersistRef.current();
  }, [
    visitChecklistMode,
    analysisBusy,
    visitChecklistTeacherBlocks.ready,
    teacherFilterKey,
    teacherLabelsKey,
    cardTemplateMetaKey,
  ]);

  /** Сохранить стабильные id на сервер после миграции с random UUID. */
  useEffect(() => {
    if (!pendingStableIdPersistRef.current) return;
    if (!visitChecklistTeacherBlocks.ready) return;
    if (headers.length === 0 || rawRows.length === 0) return;
    pendingStableIdPersistRef.current = false;
    void autoPersistDraftRef.current();
  }, [visitChecklistTeacherBlocks.ready, headers.length, rawRows.length]);

  const buildTeacherPdfCacheKey = buildTeacherCardContentHashForBlock;

  const generateTeacherPdfBytesFresh = useCallback(
    async (block: LessonAnalyticsTeacherBlock): Promise<ArrayBuffer> => {
      await yieldToMain();
      const input = buildTeacherPdfBlockInput(block);
      return buildLessonAnalyticsTeacherPdfForBlockBytes({
        ...input,
        aiNarrative: input.aiNarrative ?? '',
        pdfBranding: input.pdfBranding,
        pdfVisual: input.pdfVisual,
      });
    },
    [buildTeacherPdfBlockInput],
  );

  const buildTeacherPdfBytes = useCallback(
    async (block: LessonAnalyticsTeacherBlock): Promise<ArrayBuffer> => generateTeacherPdfBytesFresh(block),
    [generateTeacherPdfBytesFresh],
  );

  const buildTeacherPdfBase64 = useCallback(
    async (block: LessonAnalyticsTeacherBlock): Promise<string> => {
      const buf = await buildTeacherPdfBytes(block);
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    },
    [buildTeacherPdfBytes],
  );

  const closeTeacherPdfBuilder = useCallback(() => {
    setPdfBuilderOpen(false);
    setPdfBuilderCard(null);
    setPdfBuilderContext(null);
  }, []);

  const openTeacherPdfBuilder = useCallback(
    async (block: LessonAnalyticsTeacherBlock) => {
      setPdfBusyId(block.id);
      setErr(null);
      await yieldToMain();
      try {
        const view = buildTeacherCardView(block);
        const fallback =
          teacherFilterKey && headers.length && rawRows.length
            ? {
                block,
                view,
                teacherFilterKey,
                headers,
                rawRows,
                rolesForLessonMatrix,
                customLabels,
              }
            : undefined;
        const { card, context } = await fetchVisitChecklistTeacherDashCard({
          visitProjectId,
          projectTitle,
          block,
          fallback,
        });
        setPdfBuilderCard(card);
        setPdfBuilderContext(context);
        setPdfBuilderOpen(true);
        patchBlock(block.id, { pdfPrintedAt: new Date().toISOString() });
        scheduleNarrativePersist();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Не удалось открыть конструктор PDF');
      } finally {
        setPdfBusyId(null);
      }
    },
    [
      buildTeacherCardView,
      teacherFilterKey,
      headers,
      rawRows,
      rolesForLessonMatrix,
      customLabels,
      visitProjectId,
      projectTitle,
      patchBlock,
      scheduleNarrativePersist,
    ],
  );

  const downloadTeacherPdf = openTeacherPdfBuilder;

  const downloadTeacherPdfOnePage = useCallback(
    async (block: LessonAnalyticsTeacherBlock) => {
      setPdfCompactBusyId(block.id);
      setErr(null);
      await yieldToMain();
      try {
        const input = buildTeacherPdfBlockInput(block);
        const buf = await buildLessonAnalyticsTeacherPdfForBlockOnePageBytes(input, cardTemplate);
        downloadPdfArrayBufferAsFile(buf, `${safePdfFileBase(block.teacherLabel)}-1стр`);
        patchBlock(block.id, { pdfPrintedAt: new Date().toISOString() });
        scheduleNarrativePersist();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Не удалось сформировать PDF на одну страницу');
      } finally {
        setPdfCompactBusyId(null);
      }
    },
    [buildTeacherPdfBlockInput, cardTemplate, patchBlock, scheduleNarrativePersist],
  );

  const teacherBlocksWithAiCount = useMemo(
    () => countBlocksWithAiNarrative(activeTeacherBlocks, aiNarrativeStore),
    [activeTeacherBlocks, aiNarrativeStore],
  );

  const aiCardsMissingCount = useMemo(
    () =>
      activeTeacherBlocks.filter((b) => {
        if (b.aiNarrativeManualEdit) return false;
        return !resolveBlockAiNarrative(b, aiNarrativeStore);
      }).length,
    [activeTeacherBlocks, aiNarrativeStore],
  );

  const aiBackgroundStatusLine = useMemo(() => {
    if (!teacherFilterKey || activeTeacherBlocks.length === 0) return null;
    const total = activeTeacherBlocks.length;
    const filled = teacherBlocksWithAiCount;
    if (cardArchiveHydrateBusy && !backgroundWorkAllowed) {
      return 'Подгрузка архива: пауза (вы на странице) — продолжим, когда отойдёте';
    }
    if (aiProgress.running) {
      const left = Math.max(0, aiProgress.total - aiProgress.done);
      if (!backgroundWorkAllowed) {
        return `Фоновая ИИ-аналитика: пауза (вы на странице) · готово ${filled} из ${total} · в очереди ${left} ${pluralRuCards(left)}`;
      }
      const etaSec = estimateAiBatchRemainingSec(left, AI_BATCH_GAP_MS);
      const eta = left > 0 ? formatEtaRu(etaSec) : 'скоро';
      return `Фоновая ИИ-аналитика: готово ${filled} из ${total} · в очереди ${left} ${pluralRuCards(left)} · ориентир ${eta}`;
    }
    if (aiCardsMissingCount > 0 && (analysisBusy || narrativeBusyId != null)) {
      return `Подготовка данных… затем продолжим ИИ (${aiCardsMissingCount} ${pluralRuCards(aiCardsMissingCount)} без текста)`;
    }
    if (aiCardsMissingCount > 0) {
      return `${aiCardsMissingCount} ${pluralRuCards(aiCardsMissingCount)} без ИИ-текста — запустите вручную кнопкой «ИИ без текста»`;
    }
    return `ИИ-аналитика: все ${total} ${pluralRuCards(total)} готовы`;
  }, [
    teacherFilterKey,
    activeTeacherBlocks.length,
    teacherBlocksWithAiCount,
    aiProgress.running,
    aiProgress.total,
    aiProgress.done,
    aiCardsMissingCount,
    analysisBusy,
    narrativeBusyId,
    backgroundWorkAllowed,
    cardArchiveHydrateBusy,
  ]);

  const refreshCardArchiveList = useCallback(async () => {
    if (!Number.isFinite(projectId)) return;
    setCardArchiveBusy(true);
    try {
      const items = await fetchTeacherCardArchiveList(Number(projectId));
      setCardArchiveItems(items);
      setCardArchiveOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось загрузить архив карточек');
    } finally {
      setCardArchiveBusy(false);
    }
  }, [projectId]);

  const downloadAgreedZip = useCallback(async () => {
    const agreed = activeTeacherBlocks.filter((b) => b.status === 'agreed');
    if (agreed.length === 0) {
      setErr('Нет согласованных педагогов — сначала нажмите «Согласовать с методистом».');
      return;
    }
    setErr(null);
    setZipBusy(true);
    setPdfCaptureBusy(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const block of agreed) {
        const pdfBytes = await buildTeacherPdfBytes(block);
        const name = `${safePdfFileBase(block.teacherLabel)}.pdf`;
        zip.file(name, new Uint8Array(pdfBytes));
        await yieldToMain(16);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const prefix = safePdfFileBase(projectTitle);
      const stamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${prefix}_soglasovannye_${stamp}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось собрать архив');
    } finally {
      setZipBusy(false);
      setPdfCaptureBusy(false);
    }
  }, [activeTeacherBlocks, buildTeacherPdfBytes, projectTitle]);

  const applySheetFromBuffer = useCallback(
    async (
      buf: ArrayBuffer,
      sheetName: string,
      opts?: { fingerprint?: string; headerRow1Based?: number; pendingSession?: SavedExcelSession | null },
    ) => {
      setSheetLoadBusy(true);
      setErr(null);
      try {
        const hr = opts?.headerRow1Based ?? headerRow1Based;
        const matrix = await getSheetMatrix(buf, sheetName);
        const { headers: h, rows } = extractHeadersAndRows(matrix, hr, MAX_ROWS);
        if (!h.length || !rows.length) {
          setErr('На листе нет данных — проверьте лист и номер строки заголовков.');
          return;
        }
        setHeaders(h);
        setRawRows(rows);
        const fp = opts?.fingerprint ?? fileFingerprint;
        const pending = opts?.pendingSession ?? pendingServerSession;
        const saved =
          fp && pending && matchSessionForSheet(pending, fp, sheetName, hr, h) ? pending : null;
        let roles: ColumnRole[];
        let ord: string[];
        const resolved = resolveRolesForImport(h, rows, saved?.roles);
        if (resolved.fromVisitTemplate) {
          setCustomLabels(
            Object.keys(resolved.customLabels).length > 0 ? resolved.customLabels : EMPTY_CUSTOM_LABELS,
          );
        } else if (saved && saved.roles.length === h.length && validateRoles(saved.roles).ok) {
          setCustomLabels(
            saved.customLabels && Object.keys(saved.customLabels).length > 0
              ? saved.customLabels
              : EMPTY_CUSTOM_LABELS,
          );
        } else {
          setCustomLabels(EMPTY_CUSTOM_LABELS);
        }
        roles = resolved.roles;
        const ordCol = roles.indexOf('metric_ordinal_text');
        if (resolved.fromVisitTemplate && resolved.ordinalLevels.length > 0) {
          ord = resolved.ordinalLevels;
        } else {
          ord =
            ordCol >= 0 && saved?.ordinalLevels?.length
              ? saved.ordinalLevels
              : ordCol >= 0
                ? collectOrdinalValues(rows, ordCol)
                : [];
        }
        const vRun = validateRoles(roles);
        if (!vRun.ok) {
          setErr(vRun.message ?? 'Не удалось автоматически разобрать колонки — откройте «Настройки колонок».');
          return;
        }
        setRoles(roles);
        setOrdinalLevels(ord);
        runAnalysisDeferred(h, rows, roles, ord);
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : 'Ошибка разбора листа');
      } finally {
        setSheetLoadBusy(false);
      }
    },
    [headerRow1Based, fileFingerprint, pendingServerSession, runAnalysisDeferred, resolveRolesForImport],
  );

  const onFile = async (f: File | null) => {
    if (!f) return;
    if (headers.length > 0 && rawRows.length > 0) {
      const ok = window.confirm(
        'Заменить всю таблицу новым файлом? Строки из ранее добавленных Excel исчезнут (карточки педагогов пересчитаются).',
      );
      if (!ok) return;
    }
    setErr(null);
    try {
      const buf = await f.arrayBuffer();
      const meta = await readWorkbookMeta(buf);
      const fp = fileFingerprintFromFile(f);
      const pending = pendingServerSession;
      let hr = headerRow1Based;
      let nextSheet = pickLessonObservationSheetName(meta.sheetNames);
      if (pending && fp === pending.fingerprint && meta.sheetNames.includes(pending.sheet)) {
        nextSheet = pending.sheet;
        hr = pending.headerRow1Based;
        setHeaderRow1Based(hr);
      }
      setBuffer(buf);
      setFileFingerprint(fp);
      setSourceFiles([f.name]);
      setFileName(f.name);
      setSheetNames(meta.sheetNames);
      setSheet(nextSheet);
      setHeaders([]);
      setRawRows([]);
      setRoles([]);
      setAnalyticRows([]);
      if (nextSheet) {
        await applySheetFromBuffer(buf, nextSheet, {
          fingerprint: fp,
          headerRow1Based: hr,
          pendingSession: pending,
        });
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Не удалось прочитать файл');
    }
  };

  const onAppendExcelFile = async (f: File | null) => {
    if (!f) return;
    if (!headers.length || !rawRows.length) {
      setErr('Сначала загрузите основной Excel или откройте проект с сохранённой таблицей.');
      return;
    }
    setSheetLoadBusy(true);
    setErr(null);
    setSaveMsg(null);
    try {
      const buf = await f.arrayBuffer();
      const meta = await readWorkbookMeta(buf);
      const sheetName = pickLessonObservationSheetName(meta.sheetNames);
      if (!sheetName) {
        setErr('В дополнительном файле не найден лист наблюдений (как в шаблоне «наблюдения урока»).');
        return;
      }
      const matrix = await getSheetMatrix(buf, sheetName);
      const { headers: incHeaders, rows: incRows } = extractHeadersAndRows(matrix, headerRow1Based, MAX_ROWS);
      if (!incHeaders.length) {
        setErr('Не удалось прочитать заголовки — проверьте номер строки заголовков.');
        return;
      }
      const merged = appendRowsToLessonGrid(headers, rawRows, incHeaders, incRows, MAX_ROWS);
      if (!merged.ok) {
        setErr(merged.message);
        return;
      }
      const nextSources = [...sourceFiles, f.name];
      setSourceFiles(nextSources);
      setFileName(formatLessonGridSourceLabel(nextSources, f.name));
      setRawRows(merged.rows);
      const oc = roles.indexOf('metric_ordinal_text');
      let ord = ordinalLevels;
      if (oc >= 0) {
        const fromAll = collectOrdinalValues(merged.rows, oc);
        const ordSet = new Set(ordinalLevels);
        for (const v of fromAll) ordSet.add(v);
        ord = [...ordSet].sort((a, b) => a.localeCompare(b, 'ru'));
        setOrdinalLevels(ord);
      }
      runAnalysisDeferred(headers, merged.rows, roles, ord);
      setSaveMsg(`Добавлено ${merged.appendedCount} строк из «${f.name}». Нажмите «Сохранить» внизу экрана.`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Не удалось добавить файл');
    } finally {
      setSheetLoadBusy(false);
    }
  };

  const onApplySheet = () => {
    if (!buffer || !sheet) return;
    void applySheetFromBuffer(buffer, sheet);
  };


  const runAnalysis = () => {
    if (!headers.length) return;
    runAnalysisDeferred(headers, rawRows, roles, ordinalLevels);
  };

  const generateNarrative = useCallback(
    async (block: LessonAnalyticsTeacherBlock) => {
      if (!teacherFilterKey) {
        setErr('Назначьте колонке роль «Педагог».');
        return;
      }
      if (aiBatchRunningRef.current || aiProgress.running) {
        stopBackgroundAiBatch();
        await yieldToMain();
      }
      const live = teacherBlocksRef.current.find((b) => b.id === block.id) ?? block;
      markTeacherCardProcessing(live.id);
      setNarrativeBusyId(live.id);
      setAiQueueBlockId(null);
      setErr(null);
      await yieldToMain();
      let aiCtx = buildTeacherAiNarrativeContextRef.current(live);
      if (!aiCtx) {
        setNarrativeBusyId(null);
        setErr('Назначьте колонке роль «Педагог» и пересчитайте аналитику.');
        return;
      }
      if (!aiCtx.numericSummary.trim() && teacherFilterKey) {
        const minimal = buildMinimalTeacherFactsExcerpt(
          live.teacherLabel,
          teacherFilterKey,
          headers,
          rawRows,
          rolesForLessonMatrix,
          customLabels,
        );
        if (minimal.trim()) aiCtx = { ...aiCtx, numericSummary: minimal };
      }
      if (!aiCtx.numericSummary.trim()) {
        setNarrativeBusyId(null);
        setErr(
          `Нет строк в срезе для «${live.teacherLabel}». Проверьте роль колонки педагога и совпадение метки с данными в файле.`,
        );
        return;
      }
      const narrativePickOpts = {
        teacherLabel: live.teacherLabel,
        rowCount: aiCtx.meta?.filteredRowCount ?? 0,
        factsExcerpt: aiCtx.numericSummary,
        compFacts: aiCtx.compFactsForFallback,
      };
      try {
        const res = await requestTeacherNarrative(aiCtx);
        const picked = pickLessonTeacherNarrativeText(res, narrativePickOpts);
        const contentHash = buildTeacherCardContentHashForBlockRef.current(live);
        commitAiNarrative(live.id, live.teacherLabel, picked.text, {
          fromLlm: picked.fromLlm,
          contentHash,
        });
        if (Number.isFinite(projectId)) {
          void saveTeacherCardToArchive({
            projectId: Number(projectId),
            block: live,
            contentHash,
            aiNarrative: picked.text,
            fromLlm: picked.fromLlm,
          });
        }
        markTeacherCardReady(live.id);
        syncAiFilledProgress({});
        if (!picked.fromLlm) {
          setErr(
            picked.hint ||
              'ИИ недоступен — в карточку подставлена автосводка по таблице. Проверьте OPENAI_API_KEY на Cloud Function.',
          );
        } else {
          setErr(null);
        }
        scheduleNarrativePersist();
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'ИИ недоступен';
        const picked = pickLessonTeacherNarrativeText(null, {
          ...narrativePickOpts,
          requestError: errMsg,
        });
        const contentHash = buildTeacherCardContentHashForBlockRef.current(live);
        commitAiNarrative(live.id, live.teacherLabel, picked.text, { fromLlm: false, contentHash });
        if (Number.isFinite(projectId)) {
          void saveTeacherCardToArchive({
            projectId: Number(projectId),
            block: live,
            contentHash,
            aiNarrative: picked.text,
            fromLlm: false,
          });
        }
        markTeacherCardReady(live.id);
        syncAiFilledProgress({});
        setErr(`ИИ недоступен — в карточку подставлена автосводка по таблице. ${errMsg}`);
        scheduleNarrativePersist();
      } finally {
        setNarrativeBusyId(null);
      }
    },
    [
      teacherFilterKey,
      aiProgress.running,
      commitAiNarrative,
      scheduleNarrativePersist,
      syncAiFilledProgress,
      requestTeacherNarrative,
      stopBackgroundAiBatch,
      headers,
      rawRows,
      rolesForLessonMatrix,
      projectId,
    ],
  );

  const sendEmail = async (block: LessonAnalyticsTeacherBlock) => {
    if (!Number.isFinite(projectId)) return;
    const narrativePlain = resolveTeacherDisplayNarrative(block, aiNarrativeStoreRef.current);
    const emailHtml = narrativePlain
      ? narrativePlain
          .split(/\n\n+/)
          .map((p) => `<p>${escHtml(p.trim())}</p>`)
          .join('')
      : '';
    let pdfBase64: string;
    setPdfCaptureBusy(true);
    try {
      pdfBase64 = await buildTeacherPdfBase64(block);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось сформировать PDF');
      return;
    } finally {
      setPdfCaptureBusy(false);
    }
    setEmailBusyId(block.id);
    setErr(null);
    try {
      const out = await postLessonAnalyticsSendEmail({
        project_id: projectId,
        block_id: block.id,
        teacher_label: block.teacherLabel,
        narrative_html: emailHtml,
        pdf_base64: pdfBase64,
        pdf_cache_key: buildTeacherPdfCacheKey(block),
      });
      patchBlock(block.id, { emailedAt: out.emailed_at });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не отправлено');
    } finally {
      setEmailBusyId(null);
    }
  };

  const visibleTeacherBlocks = useMemo(
    () =>
      filterTeacherBlocksForSlice(
        activeTeacherBlocks,
        sliceFilters.filteredRows,
        teacherFilterKey,
        sliceFilters.filterSelection,
      ),
    [activeTeacherBlocks, sliceFilters.filteredRows, sliceFilters.filterSelection, teacherFilterKey],
  );

  const displayTeacherBlocks = useMemo(
    () => filterTeacherBlocksBySurname(visibleTeacherBlocks, debouncedTeacherSurnameFilter),
    [visibleTeacherBlocks, debouncedTeacherSurnameFilter],
  );

  const displayTeacherBlockIdsKey = useMemo(
    () => displayTeacherBlocks.map((b) => b.id).join('\u0001'),
    [displayTeacherBlocks],
  );

  /** По умолчанию все видимые карточки в очереди ИИ. */
  useEffect(() => {
    if (!visibleTeacherBlocks.length) return;
    setAiQueueSelection((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const b of visibleTeacherBlocks) {
        if (next[b.id] !== true) {
          next[b.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [visibleTeacherBlocks, displayTeacherBlockIdsKey]);

  useEffect(() => {
    if (!sliceFilters.filterKeys.length) return;
    setRedHighlightSelection((prev) =>
      buildRedHighlightSelectionForKeys(sliceFilters.filterKeys, prev),
    );
  }, [sliceFilters.filterKeys.join('\u0001')]);

  const redHighlightNorms = useMemo(
    () =>
      teacherNormsMatchingRedHighlight(
        sliceFilters.dashboardRows,
        teacherFilterKey,
        redHighlightSelection,
      ),
    [sliceFilters.dashboardRows, teacherFilterKey, redHighlightSelection],
  );

  const toggleRedHighlightValue = useCallback((key: string, val: string, all: string[]) => {
    setRedHighlightSelection((prev) => toggleFilterSelectionValue(prev, key, val, all));
  }, []);

  const clearRedHighlight = useCallback(() => {
    setRedHighlightSelection(buildRedHighlightSelectionForKeys(sliceFilters.filterKeys, null));
  }, [sliceFilters.filterKeys]);

  const aiQueueSelectedCount = useMemo(
    () => displayTeacherBlocks.filter((b) => aiQueueSelection[b.id]).length,
    [displayTeacherBlocks, aiQueueSelection],
  );

  const selectAllVisibleForAiQueue = useCallback(() => {
    setAiQueueSelection((prev) => {
      const next = { ...prev };
      for (const b of displayTeacherBlocks) next[b.id] = true;
      return next;
    });
  }, [displayTeacherBlocks]);

  const clearAiQueueSelection = useCallback(() => setAiQueueSelection({}), []);

  const sortedTeacherBlocks = useMemo(
    () => sortTeachersByLabel(displayTeacherBlocks, (b) => b.teacherLabel),
    [displayTeacherBlocks],
  );

  const onTeacherCardAiQueueChange = useCallback(
    (blockId: string, on: boolean) => {
      setAiQueueSelection((prev) => {
        const next = { ...prev };
        if (on) next[blockId] = true;
        else delete next[blockId];
        return next;
      });
      if (aiProgressRef.current.running) {
        if (on) enqueueAiBatchCards([blockId]);
        else dequeueAiBatchCards([blockId]);
      }
    },
    [enqueueAiBatchCards, dequeueAiBatchCards],
  );

  const onTeacherCardViewModeChange = useCallback((blockId: string, mode: 'methodist' | 'teacher') => {
    startTransition(() => {
      setVisitTeacherCardViewModes((prev) => ({ ...prev, [blockId]: mode }));
    });
  }, []);

  const onTeacherCardAiNarrativeChange = useCallback(
    (blockId: string, text: string) => {
      patchBlock(blockId, { aiNarrative: text }, { manualEdit: true });
      scheduleNarrativePersist();
    },
    [patchBlock, scheduleNarrativePersist],
  );

  const onTeacherSurnameFilterChange = useCallback((value: string) => {
    startTransition(() => setTeacherSurnameFilter(value));
  }, []);

  const onVisitAnalyticsTabChange = useCallback((tab: 'summary' | 'teachers') => {
    startTransition(() => setVisitAnalyticsTab(tab));
  }, []);

  const onToggleLlmProvider = useCallback(() => {
    setLlmProvider((p) => (p === 'open' ? 'closed' : 'open'));
  }, []);


  const onToggleSliceFilterValue = useCallback(
    (key: string, val: string, all: string[]) => {
      startTransition(() => sliceFilters.toggleFilterValue(key, val, all));
    },
    [sliceFilters.toggleFilterValue],
  );

  const onClearSliceFilterKey = useCallback(
    (key: string) => {
      startTransition(() => sliceFilters.clearFilterKey(key));
    },
    [sliceFilters.clearFilterKey],
  );

  const onResetSliceFilters = useCallback(() => {
    startTransition(() => sliceFilters.resetAllFilters());
  }, [sliceFilters.resetAllFilters]);

  return {
    visitChecklistMode,
    visitProjectId,
    visitTitle,
    responseCount,
    onResync,
    resyncBusy,
    projectId,
    loadErr,
    projectTitle,
    setProjectTitle,
    saveBusy,
    saveMsg,
    zipBusy,
    cardArchiveBusy,
    cardArchiveHydrateBusy,
    hydrateCardsFromArchive,
    cardArchiveItems,
    cardArchiveOpen,
    setCardArchiveOpen,
    pdfCaptureBusy,
    pdfBusyId,
    pdfCompactBusyId,
    buffer,
    fileName,
    sourceFiles,
    sheetNames,
    sheet,
    setSheet,
    headerRow1Based,
    setHeaderRow1Based,
    headers,
    rawRows,
    roles,
    customLabels,
    setCustomLabels,
    ordinalLevels,
    setOrdinalLevels,
    fileFingerprint,
    err,
    setErr,
    analyticRows,
    pendingServerSession,
    cardTemplate,
    setCardTemplate,
    dashboardNarrative,
    setDashboardNarrative,
    dashboardNarrativeSource,
    setDashboardNarrativeSource,
    llmProvider,
    setLlmProvider,
    onToggleLlmProvider,
    staffRows,
    narrativeBusyId,
    aiQueueBlockId,
    emailBusyId,
    directorShareToken,
    sheetLoadBusy,
    analysisBusy,
    teacherSurnameFilter,
    setTeacherSurnameFilter,
    onTeacherSurnameFilterChange,
    debouncedTeacherSurnameFilter,
    visitAnalyticsTab,
    setVisitAnalyticsTab,
    onVisitAnalyticsTabChange,
    visitTeacherCardViewModes,
    redHighlightSelection,
    aiQueueSelection,
    aiBatchQueueSnapshot,
    aiProgress,
    aiNarrativeStore,
    teacherBlocks,
    activeTeacherBlocks,
    visitChecklistTeacherBlocks,
    teacherFilterKey,
    rolesForLessonMatrix,
    dashboardRows,
    sliceFilters,
    visitFilterSummaryRu,
    metricNumericCols,
    dateLabel,
    teacherCardCtx,
    visibleTeacherBlocks,
    displayTeacherBlocks,
    sortedTeacherBlocks,
    teacherBlocksWithAiCount,
    aiCardsMissingCount,
    aiBackgroundStatusLine,
    aiQueueSelectedCount,
    redHighlightNorms,
    setRoleAt,
    executeAnalysis,
    runAnalysisDeferred,
    runAnalysis,
    saveProject,
    makeDraftForBlocks,
    autoPersistDraft,
    scheduleNarrativePersist,
    generateNarrative,
    startAiBatchForAllTeachers,
    startAiRerunAllVisible,
    startAiQueueSelected,
    stopAiBatchForAllTeachers,
    stopBackgroundAiBatch,
    agreeAndPersist,
    revokeAgreeAndPersist,
    sendEmail,
    downloadTeacherPdf,
    openTeacherPdfBuilder,
    closeTeacherPdfBuilder,
    pdfBuilderOpen,
    pdfBuilderCard,
    pdfBuilderContext,
    downloadTeacherPdfOnePage,
    downloadAgreedZip,
    refreshCardArchiveList,
    onFile,
    onAppendExcelFile,
    applySheetFromBuffer,
    onApplySheet,
    buildTeacherCardView,
    buildTeacherPdfBlockInput,
    buildTeacherCardContentHashForBlock,
    patchBlock,
    patchTeacherRowMembership,
    onTeacherCardAiQueueChange,
    onTeacherCardViewModeChange,
    onTeacherCardAiNarrativeChange,
    selectAllVisibleForAiQueue,
    clearAiQueueSelection,
    toggleRedHighlightValue,
    clearRedHighlight,
    onToggleSliceFilterValue,
    onClearSliceFilterKey,
    onResetSliceFilters,
    resolveBlockAiNarrative,
    resolveTeacherDisplayNarrative,
    resolveTeacherFilterLabel,
    blocksWithResolvedNarratives,
  };
}
