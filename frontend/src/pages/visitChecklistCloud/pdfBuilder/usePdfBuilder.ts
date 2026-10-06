import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VisitChecklistDashCard, VisitChecklistPublishedMine } from '../../../api/visitChecklist.ts';
import {
  createVisitChecklistPdfTemplate,
  deleteVisitChecklistPdfTemplate,
  listVisitChecklistPdfTemplates,
  putVisitChecklistPdfDefault,
  updateVisitChecklistPdfTemplate,
  type VisitChecklistPdfTemplateRecord,
} from '../../../api/visitChecklistPdfTemplates.ts';
import { loadAuthMe, peekCachedAuthMe } from '../../../lib/cabinet/sharedAuth.ts';
import { cloneTemplate, defaultTeacherCardTemplate, templatesEqual } from './defaultTemplate.ts';
import { modelFromCard, preloadPdfFonts, releasePdfBuilderWorker, runPdfBuilderJob } from './pdfWorkerHost.ts';
import type { CardPdfTemplate, PdfTemplateBlock, TeacherCardPdfLayout, TeacherCardPdfModel } from './types.ts';
import type { TeacherCardPdfContext } from './normalizeTeacherCard.ts';

const builtin = defaultTeacherCardTemplate();

function draftKey(userId: number | string): string {
  return `pulse.visit-checklist-pdf.draft.${userId}.visit-checklist-teacher-card`;
}

function loadDraft(userId: number | string | null): CardPdfTemplate | null {
  if (userId == null || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CardPdfTemplate;
    if (parsed?.schemaVersion !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(userId: number | string | null, template: CardPdfTemplate) {
  if (userId == null || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(template));
  } catch {
    /* quota */
  }
}

export function usePdfBuilder(opts: {
  open: boolean;
  card: VisitChecklistDashCard | VisitChecklistPublishedMine;
  context?: TeacherCardPdfContext;
}) {
  const [template, setTemplate] = useState<CardPdfTemplate>(() => cloneTemplate(builtin));
  const [saved, setSaved] = useState<CardPdfTemplate>(() => cloneTemplate(builtin));
  const [records, setRecords] = useState<VisitChecklistPdfTemplateRecord[]>([]);
  const [record, setRecord] = useState<VisitChecklistPdfTemplateRecord | null>(null);
  const [defaultId, setDefaultId] = useState<number | null>(null);
  const [name, setName] = useState('Карточка педагога');
  const [serverNote, setServerNote] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>('teacher');
  const [layout, setLayout] = useState<TeacherCardPdfLayout | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(peekCachedAuthMe()?.id ?? null);
  const [hist, setHist] = useState({ past: 0, future: 0 });
  const past = useRef<CardPdfTemplate[]>([]);
  const future = useRef<CardPdfTemplate[]>([]);
  const requestId = useRef(0);
  const cache = useRef<{ key: string; blob: Blob } | null>(null);

  const compareMode = template.blocks.find((row) => row.type === 'compare')?.options.compareMode;
  const model: TeacherCardPdfModel = useMemo(
    () => modelFromCard(opts.card, { ...opts.context, compareMode }),
    [opts.card, opts.context, compareMode],
  );

  const dirty = !templatesEqual(template, saved);

  const applyTemplate = useCallback((next: CardPdfTemplate, pushHistory = true) => {
    setTemplate((prev) => {
      if (pushHistory) {
        past.current = [...past.current.slice(-29), cloneTemplate(prev)];
        future.current = [];
        setHist({ past: past.current.length, future: 0 });
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(cloneTemplate(template));
    setHist({ past: past.current.length, future: future.current.length });
    setTemplate(prev);
  }, [template]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(cloneTemplate(template));
    setHist({ past: past.current.length, future: future.current.length });
    setTemplate(next);
  }, [template]);

  useEffect(() => {
    if (!opts.open) return;
    let cancelled = false;
    void (async () => {
      let uid: number | null = peekCachedAuthMe()?.id ?? null;
      try {
        const u = await loadAuthMe();
        uid = u.id;
        if (!cancelled) setUserId(u.id);
      } catch {
        if (!cancelled) setUserId(null);
      }
      await preloadPdfFonts().catch(() => undefined);
      if (cancelled) return;
      try {
        const data = await listVisitChecklistPdfTemplates();
        if (cancelled) return;
        setRecords(data.templates);
        setDefaultId(data.defaultId);
        const preferred =
          data.templates.find((row) => row.id === data.defaultId) ||
          data.templates.find((row) => !row.incompatible);
        if (preferred && !preferred.incompatible) {
          setRecord(preferred);
          setName(preferred.name);
          const t = cloneTemplate(preferred.template);
          setTemplate(t);
          setSaved(cloneTemplate(t));
        } else {
          if (preferred?.incompatible) {
            setServerNote('Сохранённый шаблон новее этой версии. Показан встроенный макет.');
          }
          const draft = uid != null ? loadDraft(uid) : null;
          const t = draft || cloneTemplate(builtin);
          setTemplate(t);
          setSaved(cloneTemplate(builtin));
          setRecord(null);
          setName('Карточка педагога');
        }
      } catch {
        if (cancelled) return;
        setServerNote('Личные шаблоны на сервере пока недоступны. Показан встроенный макет — скачать PDF можно.');
        const draft = uid != null ? loadDraft(uid) : null;
        const t = draft || cloneTemplate(builtin);
        setTemplate(t);
        setSaved(cloneTemplate(builtin));
        setRecord(null);
      }
    })();
    return () => {
      cancelled = true;
      releasePdfBuilderWorker();
    };
  }, [opts.open]);

  useEffect(() => {
    if (!opts.open || userId == null) return;
    saveDraft(userId, template);
  }, [opts.open, template, userId]);

  useEffect(() => {
    if (!opts.open) return;
    const id = ++requestId.current;
    setBusy(true);
    const timer = window.setTimeout(() => {
      void runPdfBuilderJob({ kind: 'layout', model, template })
        .then((res) => {
          if (id !== requestId.current) return;
          setLayout(res.layout);
          setBusy(false);
        })
        .catch((e) => {
          if (id !== requestId.current) return;
          setErr(e instanceof Error ? e.message : 'Не удалось рассчитать макет');
          setBusy(false);
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [opts.open, model, template]);

  const selected: PdfTemplateBlock | null = template.blocks.find((b) => b.id === selectedId) || null;

  const patchSelected = (patch: Partial<PdfTemplateBlock>) => {
    if (!selected) return;
    applyTemplate({
      ...template,
      blocks: template.blocks.map((b) => (b.id === selected.id ? { ...b, ...patch, options: { ...b.options, ...(patch.options || {}) } } : b)),
    });
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = template.blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= template.blocks.length) return;
    const blocks = [...template.blocks];
    const [row] = blocks.splice(i, 1);
    blocks.splice(j, 0, row!);
    applyTemplate({ ...template, blocks });
  };

  const remove = (id: string) => {
    applyTemplate({ ...template, blocks: template.blocks.filter((b) => b.id !== id) });
    if (selectedId === id) setSelectedId(template.blocks[0]?.id || null);
  };

  const add = (type: PdfTemplateBlock['type']) => {
    if (template.blocks.some((b) => b.type === type)) return;
    const id = `${type}-${Date.now().toString(36)}`;
    applyTemplate({
      ...template,
      blocks: [
        ...template.blocks,
        {
          id,
          type,
          enabled: true,
          width: type === 'narrative' || type === 'visits' || type === 'sections' || type === 'strengths' ? 'full' : 'half',
          breakBefore: false,
          options: { emptyPolicy: 'hide', density: 'normal' },
        },
      ],
    });
    setSelectedId(id);
  };

  const saveNew = async (asDefault: boolean) => {
    const created = await createVisitChecklistPdfTemplate({ name, template, setDefault: asDefault });
    setRecord(created);
    setSaved(cloneTemplate(template));
    setRecords((rows) => [created, ...rows.filter((r) => r.id !== created.id)]);
    if (asDefault) setDefaultId(created.id);
  };

  const saveExisting = async () => {
    if (!record) return saveNew(false);
    const updated = await updateVisitChecklistPdfTemplate(record.id, {
      name,
      template,
      revision: record.revision,
    });
    setRecord(updated);
    setSaved(cloneTemplate(template));
    setRecords((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
  };

  const makeDefault = async () => {
    if (!record) await saveNew(true);
    else {
      await putVisitChecklistPdfDefault(record.id);
      setDefaultId(record.id);
    }
  };

  const removeRecord = async () => {
    if (!record) return;
    await deleteVisitChecklistPdfTemplate(record.id);
    setRecords((rows) => rows.filter((r) => r.id !== record.id));
    if (defaultId === record.id) setDefaultId(null);
    setRecord(null);
    setSaved(cloneTemplate(builtin));
  };

  const download = async (_fileName: string, onBlob: (blob: Blob) => void) => {
    const key = JSON.stringify({ template, teacher: model.teacherName, visits: model.visits.length, gen: model.generatedAt });
    if (cache.current && cache.current.key === key) {
      onBlob(cache.current.blob);
      return;
    }
    setPdfBusy(true);
    try {
      const res = await runPdfBuilderJob({ kind: 'pdf', model, template });
      if (!res.blob) throw new Error('Не удалось собрать PDF');
      cache.current = { key, blob: res.blob };
      setLayout(res.layout);
      onBlob(res.blob);
    } finally {
      setPdfBusy(false);
    }
  };

  return {
    model,
    template,
    name,
    setName,
    record,
    records,
    defaultId,
    serverNote,
    selected,
    setSelectedId,
    layout,
    busy,
    pdfBusy,
    err,
    setErr,
    dirty,
    undo,
    redo,
    canUndo: hist.past > 0,
    canRedo: hist.future > 0,
    patchSelected,
    move,
    remove,
    add,
    applyTemplate,
    saveNew,
    saveExisting,
    makeDefault,
    removeRecord,
    download,
    builtin: !record,
  };
}
