import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildAutoFilterSections, type FilterColumnForSections } from './filterSectionPlanner';
import { buildFilterKeyLabels } from './filterKeyLabels';
import {
  applyCanonicalMapsToRows,
  applyDerivedDimensionsToRows,
  applyFilters,
  applyFiltersExceptKey,
  buildPulseDashboardFilterKeys,
  isFilterRole,
  listSurveyCandidateFilterKeys,
  listStructuralFilterKeys,
  pruneFilterSelection,
  shouldExposePulseSurveyFilterCandidate,
  uniqueFilterValues,
  filterKeyForRole,
  PULSE_ORDINAL_LEVEL_KEY,
  PULSE_PARALLEL_AUTO_KEY,
  type AnalyticRow,
  type FilterSelection,
} from './engine';
import type { ColumnRole, CustomFilterLabels } from './types';
import type { ExcelDerivedFilterDimension } from '../../types';

export type PulseExcelSliceFiltersConfig = {
  analyticRows: AnalyticRow[];
  roles: ColumnRole[];
  headers: string[];
  customLabels: CustomFilterLabels;
  derivedDimensions?: ExcelDerivedFilterDimension[];
  canonicalMapsByKey?: Record<string, Record<string, string>>;
  initialFilterSelection?: FilterSelection | null;
  initialFilterPanelHiddenKeys?: string[];
  /** Фиксированный набор измерений (страница руководителя). */
  restrictedFilterKeys?: string[] | null;
  restrictedFilterLabels?: Record<string, string>;
  restrictedSectionsTitle?: string;
};

export function buildFilterSelectionForKeys(
  filterKeys: string[],
  saved?: FilterSelection | null,
): FilterSelection {
  const sel: FilterSelection = {};
  for (const k of filterKeys) {
    sel[k] = saved && k in saved ? saved[k] ?? null : null;
  }
  return sel;
}

export function buildPulseFilterColumnDescriptors(
  roles: ColumnRole[],
  headers: string[],
  customLabels: CustomFilterLabels,
  filterKeys: string[],
  derivedDimensions: ExcelDerivedFilterDimension[],
): FilterColumnForSections[] {
  const active = new Set(filterKeys);
  const base: FilterColumnForSections[] = [];
  for (let i = 0; i < roles.length; i++) {
    const r = roles[i];
    if (r === 'ignore' || r === 'date') continue;
    if (isFilterRole(r)) {
      const fk = filterKeyForRole(r, customLabels);
      if (!active.has(fk)) continue;
      base.push({ filterKey: fk, role: r, header: headers[i] || '', colIndex: i });
      if (r === 'filter_class' && !roles.includes('filter_parallel') && active.has(PULSE_PARALLEL_AUTO_KEY)) {
        base.push({
          filterKey: PULSE_PARALLEL_AUTO_KEY,
          role: 'filter_parallel',
          header: 'Параллель (из класса: 7А, 7B → 7)',
          colIndex: -1,
        });
      }
    } else if (shouldExposePulseSurveyFilterCandidate(r)) {
      const fk = `__pulse_survey_col_${i}`;
      if (!active.has(fk)) continue;
      base.push({ filterKey: fk, role: 'filter_custom_1', header: headers[i] || `Колонка ${i + 1}`, colIndex: i });
    }
  }
  if (active.has(PULSE_ORDINAL_LEVEL_KEY) && roles.includes('metric_ordinal_text')) {
    const oci = roles.indexOf('metric_ordinal_text');
    base.push({
      filterKey: PULSE_ORDINAL_LEVEL_KEY,
      role: 'filter_custom_1',
      header: headers[oci] || 'Текстовая шкала',
      colIndex: oci,
    });
  }
  derivedDimensions.forEach((d, i) => {
    if (!active.has(d.id)) return;
    base.push({ filterKey: d.id, role: 'filter_custom_1', header: d.title, colIndex: 2000 + i });
  });
  return base;
}

const EMPTY_FILTER_PANEL_HIDDEN: string[] = [];

export function usePulseExcelSliceFilters(cfg: PulseExcelSliceFiltersConfig) {
  const {
    analyticRows,
    roles,
    headers,
    customLabels,
    derivedDimensions = [],
    canonicalMapsByKey = {},
  } = cfg;

  const rowsAfterDerived = useMemo(
    () => applyDerivedDimensionsToRows(analyticRows, derivedDimensions),
    [analyticRows, derivedDimensions],
  );

  const dashboardRows = useMemo(
    () => applyCanonicalMapsToRows(rowsAfterDerived, canonicalMapsByKey),
    [rowsAfterDerived, canonicalMapsByKey],
  );

  const structuralFilterKeys = useMemo(
    () => listStructuralFilterKeys(roles, customLabels, derivedDimensions),
    [roles, customLabels, derivedDimensions],
  );

  const surveyCandidateFilterKeys = useMemo(() => listSurveyCandidateFilterKeys(roles), [roles]);

  const defaultFilterKeys = useMemo(() => {
    if (cfg.restrictedFilterKeys?.length) return cfg.restrictedFilterKeys;
    return buildPulseDashboardFilterKeys(roles, customLabels, derivedDimensions);
  }, [cfg.restrictedFilterKeys, roles, customLabels, derivedDimensions]);

  const [aiSurveyFilterKeys, setAiSurveyFilterKeys] = useState<string[] | null>(null);
  const filterKeys = useMemo(() => {
    if (cfg.restrictedFilterKeys?.length) return cfg.restrictedFilterKeys;
    const survey = aiSurveyFilterKeys ?? surveyCandidateFilterKeys;
    return [...structuralFilterKeys, ...survey];
  }, [cfg.restrictedFilterKeys, structuralFilterKeys, aiSurveyFilterKeys, surveyCandidateFilterKeys]);

  const filterLabels = useMemo(
    () => buildFilterKeyLabels(roles, headers, customLabels),
    [roles, headers, customLabels],
  );

  const filterKeyDisplayLabel = useMemo(() => {
    const m: Record<string, string> = { ...filterLabels, ...(cfg.restrictedFilterLabels ?? {}) };
    for (const d of derivedDimensions) {
      m[d.id] = d.title;
    }
    return m;
  }, [filterLabels, derivedDimensions, cfg.restrictedFilterLabels]);

  const filterSectionColumns = useMemo(
    () => buildPulseFilterColumnDescriptors(roles, headers, customLabels, filterKeys, derivedDimensions),
    [roles, headers, customLabels, filterKeys, derivedDimensions],
  );

  const autoFilterSections = useMemo(() => buildAutoFilterSections(filterSectionColumns), [filterSectionColumns]);

  const filterSections = useMemo(() => {
    if (!cfg.restrictedFilterKeys?.length) return autoFilterSections;
    return [
      {
        id: 'director-public-slice',
        title: cfg.restrictedSectionsTitle ?? 'Срез для руководителя',
        keys: filterKeys,
      },
    ];
  }, [autoFilterSections, cfg.restrictedFilterKeys, cfg.restrictedSectionsTitle, filterKeys]);

  const [filterSelection, setFilterSelection] = useState<FilterSelection>({});
  const [filterPanelHiddenKeys, setFilterPanelHiddenKeys] = useState<string[]>([]);

  const filterKeysSig = useMemo(() => filterKeys.join('\u0001'), [filterKeys]);

  const initialHiddenKeys =
    cfg.initialFilterPanelHiddenKeys && cfg.initialFilterPanelHiddenKeys.length > 0
      ? cfg.initialFilterPanelHiddenKeys
      : EMPTY_FILTER_PANEL_HIDDEN;

  const filterBootstrapSig = useMemo(
    () =>
      `${filterKeysSig}\u0000${JSON.stringify(cfg.initialFilterSelection ?? null)}\u0000${JSON.stringify(initialHiddenKeys)}`,
    [filterKeysSig, cfg.initialFilterSelection, initialHiddenKeys],
  );

  const appliedFilterBootstrapSigRef = useRef('');

  useEffect(() => {
    if (appliedFilterBootstrapSigRef.current === filterBootstrapSig) return;
    appliedFilterBootstrapSigRef.current = filterBootstrapSig;
    setFilterSelection(buildFilterSelectionForKeys(filterKeys, cfg.initialFilterSelection ?? null));
    setFilterPanelHiddenKeys(initialHiddenKeys.length ? [...initialHiddenKeys] : []);
  }, [filterBootstrapSig, filterKeys, cfg.initialFilterSelection, initialHiddenKeys]);

  const sliceFilterSelection = useMemo((): FilterSelection => {
    const out: FilterSelection = {};
    for (const k of filterKeys) {
      out[k] = filterSelection[k] ?? null;
    }
    return out;
  }, [filterKeys, filterSelection]);

  const filteredRows = useMemo(
    () => applyFilters(dashboardRows, sliceFilterSelection),
    [dashboardRows, sliceFilterSelection],
  );

  const resetAllFilters = useCallback(() => {
    setFilterSelection((prev) => {
      const next: FilterSelection = {};
      for (const k of Object.keys(prev)) next[k] = null;
      return next;
    });
  }, []);

  const rebuildPageFromTable = useCallback(() => {
    if (cfg.restrictedFilterKeys?.length) {
      setFilterSelection(buildFilterSelectionForKeys(cfg.restrictedFilterKeys, null));
      setFilterPanelHiddenKeys([]);
      return;
    }
    setAiSurveyFilterKeys(surveyCandidateFilterKeys);
    setFilterSelection(buildFilterSelectionForKeys(defaultFilterKeys, null));
    setFilterPanelHiddenKeys([]);
  }, [cfg.restrictedFilterKeys, surveyCandidateFilterKeys, defaultFilterKeys]);

  const toggleFilterValue = useCallback(
    (key: string, val: string, all: string[]) => {
      setFilterSelection((prev) => {
        const cur = prev[key];
        let nextVal: string[] | null;
        if (cur == null) {
          nextVal = [val];
        } else {
          const set = new Set(cur);
          if (set.has(val)) set.delete(val);
          else set.add(val);
          const arr = [...set];
          if (arr.length === 0) nextVal = null;
          else if (arr.length === all.length) nextVal = null;
          else nextVal = arr;
        }
        const updated = { ...prev, [key]: nextVal };
        return pruneFilterSelection(dashboardRows, updated, filterKeys);
      });
    },
    [dashboardRows, filterKeys],
  );

  const clearFilterKey = useCallback(
    (key: string) => {
      setFilterSelection((p) => pruneFilterSelection(dashboardRows, { ...p, [key]: null }, filterKeys));
    },
    [dashboardRows, filterKeys],
  );

  const hideFilterKey = useCallback(
    (key: string) => {
      setFilterPanelHiddenKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
      clearFilterKey(key);
    },
    [clearFilterKey],
  );

  const showFilterKey = useCallback((key: string) => {
    setFilterPanelHiddenKeys((prev) => prev.filter((k) => k !== key));
  }, []);

  const valuesForKey = useCallback(
    (key: string) =>
      uniqueFilterValues(applyFiltersExceptKey(dashboardRows, sliceFilterSelection, key), key),
    [dashboardRows, sliceFilterSelection],
  );

  return {
    dashboardRows,
    filteredRows,
    sliceFilterSelection,
    filterKeys,
    filterLabels,
    filterKeyDisplayLabel,
    filterSections,
    filterSelection,
    setFilterSelection,
    filterPanelHiddenKeys,
    setFilterPanelHiddenKeys,
    resetAllFilters,
    rebuildPageFromTable,
    toggleFilterValue,
    clearFilterKey,
    hideFilterKey,
    showFilterKey,
    valuesForKey,
    surveyCandidateFilterKeys,
  };
}
