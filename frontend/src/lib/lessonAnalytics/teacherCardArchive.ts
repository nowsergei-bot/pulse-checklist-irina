import { type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import { getLessonAnalyticsTeacherCardArchive, listLessonAnalyticsTeacherCardArchive, postLessonAnalyticsTeacherCardArchive, postLessonAnalyticsTeacherCardArchiveBulk } from '../../api/lessonAnalytics';
import { stableTeacherBlockId } from './teacherBlockId';

export type TeacherCardArchiveSnapshot = {
  v?: number;
  projectId?: number;
  blockId?: string;
  contentHash?: string;
  teacherLabel?: string;
  aiNarrative: string;
  aiNarrativeSource?: 'llm' | 'fallback' | 'manual' | null;
  fromLlm?: boolean;
  generatedAt?: string;
};

const memoryCache = new Map<string, TeacherCardArchiveSnapshot>();

function memoryKey(projectId: number, blockId: string, contentHash: string): string {
  return `${projectId}\u0001${blockId}\u0001${contentHash}`;
}

export type ResolveTeacherCardArchiveOpts = {
  projectId: number;
  block: LessonAnalyticsTeacherBlock;
  contentHash: string;
};

/** Загружает готовый снимок карточки из JSON-архива (S3). */
export async function resolveTeacherCardFromArchive(
  opts: ResolveTeacherCardArchiveOpts,
): Promise<{ snapshot: TeacherCardArchiveSnapshot | null; fromArchive: boolean }> {
  const { projectId, block, contentHash } = opts;
  const mem = memoryCache.get(memoryKey(projectId, block.id, contentHash));
  if (mem?.aiNarrative?.trim()) return { snapshot: mem, fromArchive: true };

  try {
    const hit = await getLessonAnalyticsTeacherCardArchive(projectId, {
      block_id: block.id,
      content_hash: contentHash,
    });
    if (hit.hit && hit.snapshot?.aiNarrative?.trim()) {
      const snapshot = hit.snapshot;
      memoryCache.set(memoryKey(projectId, block.id, contentHash), snapshot);
      return { snapshot, fromArchive: true };
    }
    const stableId = stableTeacherBlockId(projectId, block.teacherLabel);
    if (stableId !== block.id) {
      const stableHit = await getLessonAnalyticsTeacherCardArchive(projectId, {
        block_id: stableId,
        content_hash: contentHash,
      });
      if (stableHit.hit && stableHit.snapshot?.aiNarrative?.trim()) {
        const snapshot = stableHit.snapshot;
        memoryCache.set(memoryKey(projectId, stableId, contentHash), snapshot);
        return { snapshot, fromArchive: true };
      }
    }
  } catch {
    /* S3 недоступен */
  }

  return { snapshot: null, fromArchive: false };
}

export type BulkResolveTeacherCardArchiveItem = {
  block: LessonAnalyticsTeacherBlock;
  contentHash: string;
};

/** Пакетная загрузка снимков — один HTTP вместо N точечных GET. */
export async function resolveTeacherCardsFromArchiveBulk(
  projectId: number,
  items: BulkResolveTeacherCardArchiveItem[],
): Promise<Map<string, TeacherCardArchiveSnapshot>> {
  const out = new Map<string, TeacherCardArchiveSnapshot>();
  if (!Number.isFinite(projectId) || !items.length) return out;

  const pending: Array<{ block_id: string; content_hash: string; targetBlockId: string }> = [];
  for (const { block, contentHash } of items) {
    const mem = memoryCache.get(memoryKey(projectId, block.id, contentHash));
    if (mem?.aiNarrative?.trim()) {
      out.set(block.id, mem);
      continue;
    }
    pending.push({ block_id: block.id, content_hash: contentHash, targetBlockId: block.id });
    const stableId = stableTeacherBlockId(projectId, block.teacherLabel);
    if (stableId !== block.id) {
      const memStable = memoryCache.get(memoryKey(projectId, stableId, contentHash));
      if (memStable?.aiNarrative?.trim()) {
        out.set(block.id, memStable);
        continue;
      }
      pending.push({ block_id: stableId, content_hash: contentHash, targetBlockId: block.id });
    }
  }

  const pendingFetch = pending.filter((p) => !out.has(p.targetBlockId));
  if (!pendingFetch.length) return out;

  const CHUNK = 120;
  for (let i = 0; i < pendingFetch.length; i += CHUNK) {
    const slice = pendingFetch.slice(i, i + CHUNK);
    const requestItems = slice.map((p) => ({ block_id: p.block_id, content_hash: p.content_hash }));
    try {
      const hits = await postLessonAnalyticsTeacherCardArchiveBulk(projectId, requestItems);
      for (const hit of hits) {
        if (!hit.hit || !hit.snapshot?.aiNarrative?.trim()) continue;
        const snapshot = hit.snapshot;
        const match = slice.find((p) => p.block_id === hit.block_id && p.content_hash === hit.content_hash);
        const targetId = match?.targetBlockId ?? hit.block_id;
        memoryCache.set(memoryKey(projectId, hit.block_id, hit.content_hash), snapshot);
        out.set(targetId, snapshot);
      }
    } catch {
      for (const item of slice) {
        if (out.has(item.targetBlockId)) continue;
        try {
          const single = await getLessonAnalyticsTeacherCardArchive(projectId, {
            block_id: item.block_id,
            content_hash: item.content_hash,
          });
          if (single.hit && single.snapshot?.aiNarrative?.trim()) {
            memoryCache.set(memoryKey(projectId, item.block_id, item.content_hash), single.snapshot);
            out.set(item.targetBlockId, single.snapshot);
          }
        } catch {
          /* S3 недоступен */
        }
      }
    }
  }

  return out;
}

export type SaveTeacherCardArchiveOpts = {
  projectId: number;
  block: LessonAnalyticsTeacherBlock;
  contentHash: string;
  aiNarrative: string;
  fromLlm?: boolean;
  aiNarrativeSource?: 'llm' | 'fallback' | 'manual';
};

/** Сохраняет готовый снимок карточки в JSON-архив. */
export async function saveTeacherCardToArchive(opts: SaveTeacherCardArchiveOpts): Promise<void> {
  const { projectId, block, contentHash, aiNarrative, fromLlm, aiNarrativeSource } = opts;
  const trimmed = String(aiNarrative ?? '').trim();
  if (!trimmed) return;

  const snapshot: TeacherCardArchiveSnapshot = {
    v: 1,
    projectId,
    blockId: block.id,
    contentHash,
    teacherLabel: block.teacherLabel,
    aiNarrative: trimmed,
    aiNarrativeSource: aiNarrativeSource ?? (fromLlm ? 'llm' : 'fallback'),
    fromLlm: Boolean(fromLlm),
    generatedAt: new Date().toISOString(),
  };
  memoryCache.set(memoryKey(projectId, block.id, contentHash), snapshot);

  try {
    await postLessonAnalyticsTeacherCardArchive(projectId, {
      block_id: block.id,
      content_hash: contentHash,
      teacher_label: block.teacherLabel,
      snapshot,
    });
  } catch {
    /* архив опционален */
  }
}

export async function fetchTeacherCardArchiveList(projectId: number) {
  return listLessonAnalyticsTeacherCardArchive(projectId);
}

export { buildTeacherCardContentHash } from './teacherCardArchiveKey';
