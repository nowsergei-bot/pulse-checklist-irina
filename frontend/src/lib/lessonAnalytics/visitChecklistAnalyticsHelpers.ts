import { type LessonAnalyticsLlmProvider, type LessonAnalyticsTeacherBlock } from '../../api/lessonAnalytics';
import { formatBilingualCellLabel } from '../excelAnalytics/excelDisplayLabel';
import {
  applyFilters,
  type AnalyticRow,
  type FilterSelection,
  uniqueFilterValues,
} from '../excelAnalytics/engine';
import { roughNormFilterValue } from '../excelAnalytics/filterValueNormalize';
import {
  primitiveCellToPlainString,
  type CellPrimitive,
} from '../excelAnalytics/parse';
import { COLUMN_ROLE_OPTIONS, type ColumnRole, type CustomFilterLabels } from '../excelAnalytics/types';
import {
  listTeacherLabelsFromRows,
  syncTeacherBlocksFromLabels,
} from './filterTeacherBlocksForSlice';
import { listBlocksForAiQueue, type AiBatchQueueMode } from './aiBatchQueue';

export const MAX_ROWS = 8000;

/** Стабильная ссылка — иначе `setCustomLabels({})` перезапускает загрузку проекта в цикле. */
export const EMPTY_CUSTOM_LABELS: CustomFilterLabels = {};

/** Пакетная ИИ-аналитика: очередь = все карточки без текста (без лимита по числу педагогов). */
export const AI_BATCH_NARRATIVE_RETRIES = 2;
export const AI_BATCH_RETRY_DELAY_MS = 2200;
/** Пауза между карточками — снижает 429 от контура ИИ. */
export const AI_BATCH_GAP_MS = 800;
export const AI_BATCH_GAP_AFTER_RATE_LIMIT_MS = 9_000;
export const AI_BATCH_RATE_LIMIT_COOLDOWN_MS = 10_000;
export const AI_NARRATIVE_TIMEOUT_FAST_MS = 58_000;
export const AI_NARRATIVE_TIMEOUT_STANDARD_MS = 78_000;
export const AI_NARRATIVE_TIMEOUT_OPEN_FAST_MS = 90_000;
export const AI_NARRATIVE_TIMEOUT_OPEN_STANDARD_MS = 110_000;

export type LessonAiProgress = {
  done: number;
  total: number;
  currentName: string;
  running: boolean;
  /** Сколько карточек уже с непустым aiNarrative (по всему проекту). */
  filled: number;
};

export type AiNarrativeStore = {
  byNorm: Record<string, string>;
  byBlockId: Record<string, string>;
};

export const EMPTY_AI_NARRATIVE_STORE: AiNarrativeStore = { byNorm: {}, byBlockId: {} };

export type AiBatchStartOpts = {
  mode?: AiBatchQueueMode;
  blockIds?: string[];
  blocksScope?: LessonAnalyticsTeacherBlock[];
};

export function resolveAiNarrativeTimeoutMs(
  fastMode?: boolean,
  llmProvider?: LessonAnalyticsLlmProvider,
): number {
  if (llmProvider === 'open') {
    return fastMode ? AI_NARRATIVE_TIMEOUT_OPEN_FAST_MS : AI_NARRATIVE_TIMEOUT_OPEN_STANDARD_MS;
  }
  return fastMode ? AI_NARRATIVE_TIMEOUT_FAST_MS : AI_NARRATIVE_TIMEOUT_STANDARD_MS;
}

export function isRateLimitNarrativeHint(hint?: string): boolean {
  return /429|rate limit|too many requests|частоту запросов|resource_exhausted/i.test(String(hint ?? ''));
}

/** Нет смысла повторять запрос (ключ, конфиг) — только тратит минуты в очереди. */
export function isFatalNarrativeHint(hint?: string): boolean {
  return /OPENAI_API_KEY|не настроен|no_key|GIGACHAT|YANDEX_API|доступ к контуру|не задан|HTTP 400|json_object/i.test(
    String(hint ?? ''),
  );
}

export function listBlocksMissingAiNarrative(
  blocks: LessonAnalyticsTeacherBlock[],
  store: AiNarrativeStore,
  giveUpIds: ReadonlySet<string>,
  getContentHash?: (block: LessonAnalyticsTeacherBlock) => string | null,
): LessonAnalyticsTeacherBlock[] {
  return listBlocksForAiQueue(blocks, store, giveUpIds, 'missing', new Set(), { getContentHash });
}

export function resolveBlockAiNarrative(block: LessonAnalyticsTeacherBlock, store: AiNarrativeStore): string {
  const onBlock = String(block.aiNarrative ?? '').trim();
  if (onBlock) return onBlock;
  const byId = String(store.byBlockId[block.id] ?? '').trim();
  if (byId) return byId;
  return String(store.byNorm[roughNormFilterValue(block.teacherLabel)] ?? '').trim();
}

/** ИИ-текст карточки педагога (по id блока / ФИО). */
export function resolveTeacherDisplayNarrative(
  block: LessonAnalyticsTeacherBlock,
  store: AiNarrativeStore,
): string {
  return resolveBlockAiNarrative(block, store);
}

export function countBlocksWithAiNarrative(blocks: LessonAnalyticsTeacherBlock[], store: AiNarrativeStore): number {
  return blocks.filter((b) => resolveBlockAiNarrative(b, store)).length;
}

export function hydrateAiNarrativeStore(blocks: LessonAnalyticsTeacherBlock[]): AiNarrativeStore {
  const store: AiNarrativeStore = { byNorm: {}, byBlockId: {} };
  for (const b of blocks) {
    const t = String(b.aiNarrative ?? '').trim();
    if (!t) continue;
    store.byNorm[roughNormFilterValue(b.teacherLabel)] = t;
    store.byBlockId[b.id] = t;
  }
  return store;
}

export function blocksWithResolvedNarratives(
  blocks: LessonAnalyticsTeacherBlock[],
  store: AiNarrativeStore,
): LessonAnalyticsTeacherBlock[] {
  return blocks.map((b) => {
    const text = resolveBlockAiNarrative(b, store);
    return text === String(b.aiNarrative ?? '').trim() ? b : { ...b, aiNarrative: text };
  });
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Метка педагога в фильтре — точное совпадение или нормализованное (регистр/пробелы). */
export function resolveTeacherFilterLabel(
  rows: AnalyticRow[],
  teacherFilterKey: string,
  teacherLabel: string,
): string {
  const direct = String(teacherLabel ?? '').trim();
  if (!direct) return direct;
  const sel: FilterSelection = { [teacherFilterKey]: [direct] };
  if (applyFilters(rows, sel).length > 0) return direct;
  const want = formatBilingualCellLabel(direct, 'ru').trim().toLowerCase();
  const norm = roughNormFilterValue(direct);
  for (const v of uniqueFilterValues(rows, teacherFilterKey)) {
    if (roughNormFilterValue(v) === norm) return v;
    const vv = formatBilingualCellLabel(v, 'ru').trim().toLowerCase();
    if (!vv || !want) continue;
    if (vv === want || vv.includes(want) || want.includes(vv)) return v;
  }
  return direct;
}

export function rebindAiNarrativeBlockIds(store: AiNarrativeStore, blocks: LessonAnalyticsTeacherBlock[]): AiNarrativeStore {
  const byBlockId = { ...store.byBlockId };
  let changed = false;
  for (const b of blocks) {
    const text = resolveBlockAiNarrative(b, store);
    if (!text) continue;
    if (byBlockId[b.id] !== text) {
      byBlockId[b.id] = text;
      changed = true;
    }
  }
  return changed ? { ...store, byBlockId } : store;
}

/** Список карточек по меткам педагогов; id и aiNarrative берём из ref (после пакетного ИИ). */
export function mergeTeacherBlocksForLabels(
  labels: string[],
  prev: LessonAnalyticsTeacherBlock[],
  latestFromRef: LessonAnalyticsTeacherBlock[],
  narrativeStore: AiNarrativeStore,
): LessonAnalyticsTeacherBlock[] {
  const narrativeForLabel = (label: string, block?: LessonAnalyticsTeacherBlock): string => {
    const fromBlock = block ? resolveBlockAiNarrative(block, narrativeStore) : '';
    if (fromBlock) return fromBlock;
    return String(narrativeStore.byNorm[roughNormFilterValue(label)] ?? '').trim();
  };

  const merged = syncTeacherBlocksFromLabels(labels, [...prev, ...latestFromRef], narrativeForLabel);
  const usedIds = new Set(merged.map((b) => b.id));
  for (const b of latestFromRef) {
    if (!usedIds.has(b.id) && resolveBlockAiNarrative(b, narrativeStore)) {
      usedIds.add(b.id);
      merged.push(b);
    }
  }
  return merged;
}

export function sampleColumnCellsForAi(rows: CellPrimitive[][], colIndex: number, maxSamples = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of rows) {
    if (out.length >= maxSamples) break;
    const c = line[colIndex];
    if (c == null || c === '') continue;
    const s = formatBilingualCellLabel(primitiveCellToPlainString(c), 'ru').trim().slice(0, 180);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function coerceColumnRole(value: string): ColumnRole {
  const t = String(value ?? '').trim();
  return COLUMN_ROLE_OPTIONS.some((o) => o.value === t) ? (t as ColumnRole) : 'ignore';
}

export function collectOrdinalValues(rows: CellPrimitive[][], colIndex: number): string[] {
  const s = new Set<string>();
  for (const line of rows) {
    const c = line[colIndex];
    if (c == null || c === '') continue;
    const raw = primitiveCellToPlainString(c);
    const t = formatBilingualCellLabel(raw, 'ru').trim();
    if (t) s.add(t);
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
}

export function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { listTeacherLabelsFromRows };
