import { getUserAnalyticsWorkspace, putUserAnalyticsWorkspace } from '../api/surveys';
import type { SurveyTemplate } from '../data/surveyTemplates';
import type { SavedMappingTemplate } from './excelAnalytics/types';
import type { PhenomenalReportDraft } from './phenomenalLessons/reportDraftTypes';
import { PHENOMENAL_REPORT_AUTOSAVE_KEY } from './phenomenalLessons/storageKeys';
import { hasStaffSessionHint } from './staffSession';

const LS_EXCEL_TEMPLATES = 'pulse_excel_analytics_templates_v1';
const LS_CUSTOM_SURVEY_TEMPLATES = 'pulse_custom_survey_templates_v1';
const LS_SLICE_PREFIX = 'pulse_analytics_slice_rows_';

export type SurveyAnalyticsSliceRowPersist = { uid: string; question_id: number | null; value: string };

export type UserAnalyticsWorkspaceState = {
  excelTemplates?: SavedMappingTemplate[];
  phenomenalScratch?: PhenomenalReportDraft | null;
  surveyAnalyticsSlices?: Record<string, SurveyAnalyticsSliceRowPersist[]>;
  customSurveyTemplates?: SurveyTemplate[];
};

let cache: UserAnalyticsWorkspaceState = {};
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();
const pendingMerge: UserAnalyticsWorkspaceState = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeUserAnalyticsWorkspace(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getUserAnalyticsWorkspaceCache(): UserAnalyticsWorkspaceState {
  return cache;
}

function authTokenPresent(): boolean {
  return hasStaffSessionHint();
}

function canSyncAnalyticsWorkspace(): boolean {
  return authTokenPresent();
}

function applyPartToCache(part: Partial<UserAnalyticsWorkspaceState>): void {
  cache = { ...cache, ...part };
}

function buildMigrationPatch(server: UserAnalyticsWorkspaceState): UserAnalyticsWorkspaceState {
  const patch: UserAnalyticsWorkspaceState = {};
  try {
    if (!server.excelTemplates?.length) {
      const raw = localStorage.getItem(LS_EXCEL_TEMPLATES);
      if (raw) {
        const p = JSON.parse(raw) as unknown;
        if (Array.isArray(p) && p.length) patch.excelTemplates = p as SavedMappingTemplate[];
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const hasScratch =
      server.phenomenalScratch &&
      typeof server.phenomenalScratch === 'object' &&
      Array.isArray(server.phenomenalScratch.blocks) &&
      server.phenomenalScratch.blocks.length > 0;
    if (!hasScratch) {
      const raw = localStorage.getItem(PHENOMENAL_REPORT_AUTOSAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as PhenomenalReportDraft;
        if (d && Array.isArray(d.blocks) && d.blocks.length) patch.phenomenalScratch = d;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    if (!server.customSurveyTemplates?.length) {
      const raw = localStorage.getItem(LS_CUSTOM_SURVEY_TEMPLATES);
      if (raw) {
        const p = JSON.parse(raw) as unknown;
        if (Array.isArray(p) && p.length) patch.customSurveyTemplates = p as SurveyTemplate[];
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const hasSlices =
      server.surveyAnalyticsSlices && typeof server.surveyAnalyticsSlices === 'object'
        ? Object.keys(server.surveyAnalyticsSlices).length > 0
        : false;
    if (!hasSlices) {
      const slices: Record<string, SurveyAnalyticsSliceRowPersist[]> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(LS_SLICE_PREFIX)) continue;
        const idPart = k.slice(LS_SLICE_PREFIX.length);
        if (!/^\d+$/.test(idPart)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!Array.isArray(parsed)) continue;
          const rows: SurveyAnalyticsSliceRowPersist[] = [];
          for (const item of parsed) {
            if (!item || typeof item !== 'object') continue;
            const o = item as { question_id?: unknown; value?: unknown; uid?: unknown };
            const qid = o.question_id != null && o.question_id !== '' ? Number(o.question_id) : null;
            rows.push({
              uid: typeof o.uid === 'string' ? o.uid : `m-${rows.length}`,
              question_id: Number.isFinite(qid as number) ? (qid as number) : null,
              value: String(o.value ?? ''),
            });
          }
          if (rows.length) slices[idPart] = rows;
        } catch {
          /* ignore */
        }
      }
      if (Object.keys(slices).length) patch.surveyAnalyticsSlices = slices;
    }
  } catch {
    /* ignore */
  }

  return patch;
}

function clearMigratedLocalKeys(patch: UserAnalyticsWorkspaceState): void {
  try {
    if (patch.excelTemplates?.length) localStorage.removeItem(LS_EXCEL_TEMPLATES);
    if (patch.phenomenalScratch) localStorage.removeItem(PHENOMENAL_REPORT_AUTOSAVE_KEY);
    if (patch.customSurveyTemplates?.length) localStorage.removeItem(LS_CUSTOM_SURVEY_TEMPLATES);
    if (patch.surveyAnalyticsSlices) {
      for (const id of Object.keys(patch.surveyAnalyticsSlices)) {
        localStorage.removeItem(LS_SLICE_PREFIX + id);
      }
    }
  } catch {
    /* ignore */
  }
}

export async function initUserAnalyticsWorkspace(): Promise<void> {
  if (!canSyncAnalyticsWorkspace()) {
    notify();
    return;
  }
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const { state } = await getUserAnalyticsWorkspace();
      cache = { ...(state as UserAnalyticsWorkspaceState) };
      const mig = buildMigrationPatch(cache);
      if (Object.keys(mig).length) {
        const { state: next } = await putUserAnalyticsWorkspace(mig as Record<string, unknown>);
        cache = { ...(next as UserAnalyticsWorkspaceState) };
        clearMigratedLocalKeys(mig);
      }
    } catch {
      /* 401 / сеть — не подменяем кэш ответом сервера */
    } finally {
      /* Патчи, накопленные пока шёл запрос (или ещё не ушли на сервер), не должны затираться ответом GET. */
      if (Object.keys(pendingMerge).length) {
        Object.assign(cache, pendingMerge);
      }
      notify();
    }
  })();
  return initPromise;
}

export function resetUserAnalyticsWorkspaceForLogout(): void {
  cache = {};
  initPromise = null;
  Object.keys(pendingMerge).forEach((k) => delete (pendingMerge as Record<string, unknown>)[k]);
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  notify();
}

/** Немедленная отправка накопленных патчей и `part` одним PUT (без debounce). */
export async function syncUserAnalyticsWorkspaceNow(
  part: Partial<UserAnalyticsWorkspaceState>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!canSyncAnalyticsWorkspace()) {
    return { ok: false, message: 'Войдите корпоративной почтой, чтобы сохранять данные на сервер.' };
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const patch: Record<string, unknown> = { ...pendingMerge, ...part };
  for (const k of Object.keys(pendingMerge)) {
    delete (pendingMerge as Record<string, unknown>)[k];
  }
  try {
    const { state } = await putUserAnalyticsWorkspace(patch);
    cache = { ...(state as UserAnalyticsWorkspaceState) };
    notify();
    return { ok: true };
  } catch {
    Object.assign(pendingMerge, patch);
    notify();
    return { ok: false, message: 'Не удалось сохранить. Проверьте сеть и повторите попытку.' };
  }
}

export function scheduleUserAnalyticsWorkspacePatch(part: Partial<UserAnalyticsWorkspaceState>): void {
  if (!canSyncAnalyticsWorkspace()) return;
  Object.assign(pendingMerge, part);
  applyPartToCache(part);
  notify();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const keys = Object.keys(pendingMerge);
    if (!keys.length) return;
    const patch: Record<string, unknown> = {};
    for (const k of keys) {
      patch[k] = (pendingMerge as Record<string, unknown>)[k];
      delete (pendingMerge as Record<string, unknown>)[k];
    }
    void putUserAnalyticsWorkspace(patch)
      .then(({ state }) => {
        cache = { ...(state as UserAnalyticsWorkspaceState) };
        notify();
      })
      .catch(() => {
        Object.assign(pendingMerge, patch);
        notify();
      });
  }, 850);
}

export function scheduleSurveyAnalyticsSliceRows(
  surveyId: number,
  rows: SurveyAnalyticsSliceRowPersist[],
): void {
  const sid = String(surveyId);
  const slices = { ...(cache.surveyAnalyticsSlices || {}) };
  slices[sid] = rows;
  scheduleUserAnalyticsWorkspacePatch({ surveyAnalyticsSlices: slices });
}

export function getPhenomenalScratchFromWorkspace(): PhenomenalReportDraft | null {
  const s = cache.phenomenalScratch;
  if (s && typeof s === 'object' && Array.isArray(s.blocks)) return s;
  return null;
}
