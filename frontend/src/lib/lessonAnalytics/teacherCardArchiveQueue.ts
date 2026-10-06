import { type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import { yieldForBackgroundWork } from '../backgroundWorkGate';
import { yieldToMain } from '../yieldToMain';
import {
  fetchTeacherCardArchiveList,
  resolveTeacherCardsFromArchiveBulk,
  type TeacherCardArchiveSnapshot,
} from './teacherCardArchive';

export type TeacherCardArchiveStatus = 'idle' | 'loading' | 'ready' | 'processing' | 'stale' | 'missing';

const statusByBlockId = new Map<string, TeacherCardArchiveStatus>();
const listeners = new Set<() => void>();

/** Сколько блоков обрабатываем за один проход перед yield (не блокируем UI). */
const HASH_CHUNK_SIZE = 24;
/** Сколько карточек применяем из архива за проход перед yield. */
const HYDRATE_APPLY_CHUNK_SIZE = 10;

let notifyScheduled = false;
let notifyTimer: number | null = null;

function notify(): void {
  for (const fn of listeners) fn();
}

function scheduleNotify(): void {
  if (notifyScheduled) return;
  notifyScheduled = true;
  if (notifyTimer != null) return;
  notifyTimer = window.setTimeout(() => {
    notifyTimer = null;
    notifyScheduled = false;
    notify();
  }, 120);
}

export function subscribeTeacherCardArchiveStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTeacherCardArchiveStatus(blockId: string): TeacherCardArchiveStatus {
  return statusByBlockId.get(blockId) ?? 'idle';
}

export function resetTeacherCardArchiveStatuses(): void {
  statusByBlockId.clear();
  notify();
}

export function setTeacherCardArchiveStatus(blockId: string, status: TeacherCardArchiveStatus): void {
  if (statusByBlockId.get(blockId) === status) return;
  statusByBlockId.set(blockId, status);
  scheduleNotify();
}

export type HydrateTeacherCardsFromArchiveOpts = {
  projectId: number;
  blocks: LessonAnalyticsTeacherBlock[];
  computeContentHash: (block: LessonAnalyticsTeacherBlock) => string;
  hasNarrative: (block: LessonAnalyticsTeacherBlock) => boolean;
  isManualEdit: (block: LessonAnalyticsTeacherBlock) => boolean;
  onHydrate: (block: LessonAnalyticsTeacherBlock, snapshot: TeacherCardArchiveSnapshot, contentHash: string) => void;
  /** Прерывание фоновой подгрузки (смена среза / размонтирование). */
  isCancelled?: () => boolean;
  /** Пауза между чанками, пока пользователь активен (авто-подгрузка). */
  respectUserActivity?: boolean;
};

type BlockHydratePlan = {
  block: LessonAnalyticsTeacherBlock;
  contentHash: string;
  needsFetch: boolean;
};

function planBlockHydrate(
  block: LessonAnalyticsTeacherBlock,
  contentHash: string,
  opts: Pick<HydrateTeacherCardsFromArchiveOpts, 'hasNarrative' | 'isManualEdit'>,
): BlockHydratePlan {
  const { hasNarrative, isManualEdit } = opts;

  if (isManualEdit(block)) {
    setTeacherCardArchiveStatus(block.id, hasNarrative(block) ? 'ready' : 'missing');
    return { block, contentHash, needsFetch: false };
  }

  const storedHash = String(block.aiNarrativeContentHash ?? '').trim();
  const narrativeReady = hasNarrative(block) && (!storedHash || storedHash === contentHash);

  if (narrativeReady) {
    setTeacherCardArchiveStatus(block.id, 'ready');
    return { block, contentHash, needsFetch: false };
  }

  if (hasNarrative(block) && storedHash && storedHash !== contentHash) {
    setTeacherCardArchiveStatus(block.id, 'stale');
    return { block, contentHash, needsFetch: true };
  }

  setTeacherCardArchiveStatus(block.id, 'loading');
  return { block, contentHash, needsFetch: true };
}

/** Мгновенная подгрузка готовых карточек из JSON-архива при открытии проекта. */
export async function hydrateTeacherCardsFromArchive(
  opts: HydrateTeacherCardsFromArchiveOpts,
): Promise<{ hydrated: number; pending: number }> {
  const { projectId, blocks, computeContentHash, hasNarrative, isManualEdit, onHydrate, isCancelled, respectUserActivity = false } =
    opts;
  const yieldBetweenChunks = respectUserActivity
    ? () => yieldForBackgroundWork(isCancelled)
    : () => yieldToMain();
  if (!Number.isFinite(projectId) || blocks.length === 0) return { hydrated: 0, pending: 0 };

  try {
    await fetchTeacherCardArchiveList(projectId);
  } catch {
    /* список опционален */
  }

  if (isCancelled?.()) return { hydrated: 0, pending: 0 };

  const plans: BlockHydratePlan[] = [];
  for (let i = 0; i < blocks.length; i += HASH_CHUNK_SIZE) {
    if (isCancelled?.()) return { hydrated: 0, pending: 0 };
    const chunk = blocks.slice(i, i + HASH_CHUNK_SIZE);
    for (const block of chunk) {
      const contentHash = computeContentHash(block);
      plans.push(planBlockHydrate(block, contentHash, { hasNarrative, isManualEdit }));
    }
    await yieldBetweenChunks();
  }

  const toFetch = plans.filter((p) => p.needsFetch);
  let hydrated = 0;
  let pending = toFetch.length;

  if (toFetch.length && !isCancelled?.()) {
    await yieldBetweenChunks();
    if (isCancelled?.()) return { hydrated: 0, pending: 0 };
    const snapshots = await resolveTeacherCardsFromArchiveBulk(
      projectId,
      toFetch.map((p) => ({ block: p.block, contentHash: p.contentHash })),
    );

    for (let i = 0; i < toFetch.length; i += HYDRATE_APPLY_CHUNK_SIZE) {
      if (isCancelled?.()) break;
      const chunk = toFetch.slice(i, i + HYDRATE_APPLY_CHUNK_SIZE);
      for (const plan of chunk) {
        const snapshot = snapshots.get(plan.block.id);
        if (snapshot?.aiNarrative?.trim()) {
          onHydrate(plan.block, snapshot, plan.contentHash);
          setTeacherCardArchiveStatus(plan.block.id, 'ready');
          hydrated += 1;
          pending -= 1;
          continue;
        }
        if (hasNarrative(plan.block) && plan.block.aiNarrativeContentHash !== plan.contentHash) {
          setTeacherCardArchiveStatus(plan.block.id, 'stale');
        } else {
          setTeacherCardArchiveStatus(plan.block.id, 'missing');
        }
      }
      if (i + HYDRATE_APPLY_CHUNK_SIZE < toFetch.length) {
        await yieldBetweenChunks();
      }
    }
  }

  scheduleNotify();
  return { hydrated, pending: Math.max(0, pending) };
}

export function markTeacherCardProcessing(blockId: string): void {
  setTeacherCardArchiveStatus(blockId, 'processing');
}

export function markTeacherCardReady(blockId: string): void {
  setTeacherCardArchiveStatus(blockId, 'ready');
}

/** Краткая подпись для нережимных карточек (Excel-аналитика). Чек-лист — см. buildTeacherCardBackgroundStatus. */
export function cardArchiveStatusLabel(status: TeacherCardArchiveStatus): string | null {
  switch (status) {
    case 'loading':
      return 'Загрузка из архива…';
    case 'processing':
      return 'Карточка в работе';
    case 'stale':
      return 'Карточка в работе — пересборка';
    case 'missing':
      return 'Ожидание ИИ-аналитики…';
    default:
      return null;
  }
}
