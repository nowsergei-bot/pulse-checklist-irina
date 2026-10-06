import { type LessonAnalyticsDraft } from '../../api/lessonAnalytics';
import { postExcelNarrativeSummary } from '../../api/excel';
import { buildVisitDashboardNarrativeInputFromDraft } from './buildVisitDashboardNarrativeInputFromDraft';

export type DashboardNarrativeCacheEntry = {
  narrative: string;
  source: 'llm' | 'manual' | null;
  fetchedAt: number;
};

const memoryCache = new Map<string, DashboardNarrativeCacheEntry>();
const inflight = new Map<string, Promise<DashboardNarrativeCacheEntry | null>>();
const listeners = new Set<(key: string) => void>();

function notify(key: string): void {
  for (const fn of listeners) fn(key);
}

export function subscribeDashboardNarrativePrefetch(listener: (key: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function peekPrefetchedDashboardNarrative(key: string): DashboardNarrativeCacheEntry | null {
  const k = key.trim();
  if (!k) return null;
  return memoryCache.get(k) ?? null;
}

export function cacheKeyForAnalyticsProject(projectId: number): string {
  return `la:${projectId}`;
}

export function cacheKeyForLeaderToken(token: string): string {
  return `leader:${token.trim()}`;
}

function seedFromDraft(
  draft: Pick<LessonAnalyticsDraft, 'dashboardNarrative' | 'dashboardNarrativeSource'>,
  cacheKey: string,
): DashboardNarrativeCacheEntry | null {
  const saved = String(draft.dashboardNarrative ?? '').trim();
  if (!saved) return null;
  const entry: DashboardNarrativeCacheEntry = {
    narrative: saved,
    source: draft.dashboardNarrativeSource ?? null,
    fetchedAt: Date.now(),
  };
  memoryCache.set(cacheKey, entry);
  return entry;
}

/** Фоновая генерация ИИ-аналитики среза — не блокирует UI, кэш в памяти. */
export function prefetchVisitDashboardNarrative(
  draft: LessonAnalyticsDraft | Pick<LessonAnalyticsDraft, 'dashboardNarrative' | 'dashboardNarrativeSource'>,
  cacheKey: string,
  opts?: { filterSummary?: string },
): void {
  const key = cacheKey.trim();
  if (!key) return;

  const saved = seedFromDraft(draft, key);
  if (saved) {
    notify(key);
    return;
  }
  if (draft.dashboardNarrativeSource === 'manual') return;
  if (memoryCache.has(key) || inflight.has(key)) return;

  const fullDraft = draft as LessonAnalyticsDraft;
  const hasGrid = Boolean(
    fullDraft.importedGrid?.headers?.length || fullDraft.excelSession?.headers?.length,
  );
  if (!hasGrid) return;
  const input = buildVisitDashboardNarrativeInputFromDraft(fullDraft, opts?.filterSummary ?? '');
  if (!input?.llmContext.trim()) return;

  const promise = (async (): Promise<DashboardNarrativeCacheEntry | null> => {
    try {
      const res = await postExcelNarrativeSummary({
        context: {
          numericSummary: input.llmContext.slice(0, 22000),
          filterSummary: input.filterSummary.trim() || undefined,
          analysisMode: 'visit_checklist',
          userFocus:
            'Сфокусируйся на слабых темах (факт vs максимум рубрики). Учти комментарии методиста. Дай рекомендации по построению урока и приоритеты для методиста. Пиши связными абзацами; не используй коды пунктов (4.3, 7.8) — только краткие смысловые названия показателей из 2–3 слов.',
          meta: {
            filteredRowCount: input.uniqueVisits,
            uniqueImportRows: input.uniqueVisits,
          },
          llmProvider: fullDraft.llmProvider === 'open' ? 'open' : undefined,
        },
      });
      if (res.source === 'llm' && res.narrative?.trim()) {
        const entry: DashboardNarrativeCacheEntry = {
          narrative: res.narrative.trim(),
          source: 'llm',
          fetchedAt: Date.now(),
        };
        memoryCache.set(key, entry);
        notify(key);
        return entry;
      }
      return null;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
}
