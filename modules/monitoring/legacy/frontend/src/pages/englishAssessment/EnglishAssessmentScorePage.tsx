import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { eaAddGroupStudent, eaDownloadPlacementExcel, eaGroupPlacement, eaGroupScores, eaMoveGroupPlacementDate, eaMoveGroupScoresDate, eaRemoveGroupStudent, eaSaveGroupPlacement, eaSaveGroupScores } from '../../api/englishAssessment';
import { useEaPaths } from '../../lib/englishAssessment/paths';
import { useCabinetPreview } from '../../lib/cabinet/preview';
import { asDirectoryStudents, emitEaLive, useEaLive } from '../../lib/englishAssessment/liveRefresh';
import { loadEaGroupCard, peekCachedEaGroupCard } from '../../lib/englishAssessment/sharedResources';
import { maskFullName } from '../../lib/englishAssessment/parseWorkbook';
import {
  formatHeldOnChip,
  formatHeldOnDmy,
  normalizeHeldOn,
  scoreZone,
  zoneBadgeClass,
} from '../../lib/englishAssessment/analyticsUi';
import type {
  EaDirectoryStudent,
  EaGroupCard,
  EaPlacementRow,
  EaScoreRow,
  EaSection,
  EaWorkType,
  EaEditLock,
} from '../../lib/englishAssessment/types';
import EaDialog from './EaDialog';

function parseGridPaste(text: string): string[][] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((row) => row.some((cell) => String(cell).trim() !== ''));
}

function focusScoreCell(row: number, col: number) {
  const el = document.querySelector<HTMLInputElement>(`input.ea-score-input[data-grid="${row}:${col}"]`);
  el?.focus();
  el?.select();
}

function clampScoreToMax(
  score: number | null,
  max: number | null | undefined,
): { score: number | null; was: number | null } {
  if (score == null || !Number.isFinite(score)) return { score: null, was: null };
  if (score < 0) return { score: 0, was: score };
  if (max != null && Number.isFinite(Number(max)) && score > Number(max)) {
    return { score: Number(max), was: score };
  }
  return { score, was: null };
}

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function PctCell({ percent }: { percent: number | null | undefined }) {
  const zone = scoreZone(percent);
  if (percent == null) return <span className="ea-badge ea-badge--empty">—</span>;
  return <span className={zoneBadgeClass(zone, percent)}>{fmt(percent)}</span>;
}

export default function EnglishAssessmentScorePage() {
  const { href } = useEaPaths();
  const preview = useCabinetPreview();
  const readonly = preview.isPreview;
  const { id } = useParams();
  const groupId = Number(id);
  const [params, setParams] = useSearchParams();
  const peekedCard = Number.isFinite(groupId) ? peekCachedEaGroupCard(groupId) : null;
  const [card, setCard] = useState<EaGroupCard | null>(peekedCard);
  const [rows, setRows] = useState<EaScoreRow[]>([]);
  const [heldOn, setHeldOn] = useState(normalizeHeldOn(params.get('date')) || '');
  const datePinned = useRef(Boolean(params.get('date')));
  const [section, setSection] = useState(params.get('section') || 'reading');
  const [workType, setWorkType] = useState('current');
  const [maxScore, setMaxScore] = useState(20);
  const [sections, setSections] = useState<EaSection[]>(peekedCard?.sections || []);
  const [workTypes, setWorkTypes] = useState<EaWorkType[]>(peekedCard?.work_types || []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [mask, setMask] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClass, setNewClass] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [addNote, setAddNote] = useState<string | null>(null);
  const [mode, setMode] = useState<'placement' | 'section'>(
    params.get('mode') === 'section' ? 'section' : 'placement',
  );
  const [placementRows, setPlacementRows] = useState<EaPlacementRow[]>([]);
  const [confirmScope, setConfirmScope] = useState(false);
  const [editLock, setEditLock] = useState<EaEditLock>({ edit_locked: false });
  const [entryMode, setEntryMode] = useState(false);
  const [scoresReady, setScoresReady] = useState(false);
  const [placementReady, setPlacementReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dialog, setDialog] = useState<
    | null
    | { kind: 'leave'; next: () => void }
    | { kind: 'saved'; message: string }
    | { kind: 'move-date'; nextDate: string }
  >(null);
  const [movingDate, setMovingDate] = useState(false);
  const [nudgeKey, setNudgeKey] = useState<string | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardSeq = useRef(0);
  const scoresSeq = useRef(0);
  const placementSeq = useRef(0);
  const dirtyScores = useRef(false);
  const dirtyPlacement = useRef(false);

  const sheetReady = mode === 'placement' ? placementReady : scoresReady;

  function flashScoreNudge(key: string, message: string) {
    setNudgeKey(key);
    setError(message);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudgeKey(null), 700);
  }

  async function reloadCard(force = false) {
    if (!Number.isFinite(groupId)) return;
    const seq = ++cardSeq.current;
    const data = await loadEaGroupCard(groupId, force);
    if (seq !== cardSeq.current) return;
    setCard(data);
    setSections(data.sections || []);
    setWorkTypes(data.work_types || []);
  }

  function askLeave(next: () => void) {
    if (!dirty) {
      next();
      return;
    }
    setDialog({ kind: 'leave', next });
  }

  function navigateToDate(nextDate: string) {
    datePinned.current = true;
    setHeldOn(nextDate);
    const next = new URLSearchParams(params);
    next.set('date', nextDate);
    setParams(next, { replace: true });
  }

  async function moveWorkDate(nextDate: string) {
    if (!Number.isFinite(groupId) || readonly) return;
    const from = normalizeHeldOn(heldOn) || todayIso();
    const to = normalizeHeldOn(nextDate) || nextDate;
    if (from === to) {
      setDialog(null);
      return;
    }
    setMovingDate(true);
    setError(null);
    try {
      if (mode === 'placement') {
        await eaMoveGroupPlacementDate(groupId, { held_on: from, new_held_on: to });
      } else {
        await eaMoveGroupScoresDate(groupId, { held_on: from, new_held_on: to, section_code: section });
      }
      emitEaLive({ kind: mode === 'placement' ? 'placement' : 'scores' });
      await reloadCard(true);
      navigateToDate(to);
      setDialog({ kind: 'saved', message: `Дата работы перенесена на ${formatHeldOnDmy(to)}. Баллы сохранены.` });
    } catch (e) {
      setDialog(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMovingDate(false);
    }
  }

  function applyRoster(nextStudents: EaDirectoryStudent[]) {
    const students = asDirectoryStudents(nextStudents);
    const order = students.map((s) => s.id);
    const byId = new Map(students.map((s) => [s.id, s]));
    setCard((prev) =>
      prev
        ? {
            ...prev,
            students,
            group: { ...prev.group, student_count: students.length },
          }
        : prev,
    );
    setRows((prev) => {
      const map = new Map(prev.map((row) => [row.student_id, row]));
      return order.map((id) => {
        const existing = map.get(id);
        const student = byId.get(id);
        return (
          existing || {
            student_id: id,
            public_id: student?.public_id || null,
            full_name: student?.full_name || '',
            score: null,
            status: 'incomplete',
            percent: null,
          }
        );
      });
    });
    setPlacementRows((prev) => {
      const map = new Map(prev.map((row) => [row.student_id, row]));
      const fields = card?.placement?.fields || [];
      return order.map((id) => {
        const existing = map.get(id);
        if (existing) return existing;
        const student = byId.get(id);
        return {
          student_id: id,
          public_id: student?.public_id || null,
          full_name: student?.full_name || '',
          status: 'incomplete',
          fields: fields.map((field) => ({
            field_id: field.id,
            excel_label: field.excel_label,
            section: field.section,
            score: null,
            status: 'incomplete' as const,
            percent: null,
          })),
          section_scores: [],
          total_score: null,
          total_max: card?.placement?.total_max ?? null,
          percent: null,
        };
      });
    });
  }

  useEaLive((detail) => {
    if (detail.kind === 'specs') {
      void reloadCard().catch((e) => setError(e instanceof Error ? e.message : String(e)));
      return;
    }
    if (detail.kind === 'roster' && detail.groupId === groupId) {
      applyRoster(detail.students);
    }
  });

  useEffect(() => {
    if (!Number.isFinite(groupId)) return;
    const peeked = peekCachedEaGroupCard(groupId);
    setCard(peeked);
    setSections(peeked?.sections || []);
    setWorkTypes(peeked?.work_types || []);
    setRows([]);
    setPlacementRows([]);
    setEntryMode(false);
    setScoresReady(false);
    setPlacementReady(false);
    setDirty(false);
    dirtyScores.current = false;
    dirtyPlacement.current = false;
    void reloadCard().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [groupId]);

  /** Без ?date= открываем последнюю работу группы, а не «сегодня» (иначе пустой лист при вчерашних баллах). */
  useEffect(() => {
    if (datePinned.current) return;
    const dates = (card?.sessions || [])
      .map((s) => normalizeHeldOn(s.held_on) || '')
      .filter(Boolean)
      .sort();
    const latest = dates.length ? dates[dates.length - 1] : todayIso();
    const pinned = normalizeHeldOn(params.get('date'));
    if (!heldOn || (heldOn !== latest && !pinned)) {
      setHeldOn(latest);
    }
  }, [card?.sessions, card?.group?.id]);

  const sessionDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of card?.sessions || []) {
      const iso = normalizeHeldOn(s.held_on);
      if (iso) set.add(iso);
    }
    return [...set].sort().reverse();
  }, [card?.sessions]);

  const emptyOnDate = useMemo(() => {
    if (mode === 'placement') {
      return placementRows.length > 0 && placementRows.every((r) => r.status !== 'complete' && r.percent == null);
    }
    return rows.length > 0 && rows.every((r) => r.status !== 'complete' && r.percent == null);
  }, [mode, placementRows, rows]);

  useEffect(() => {
    if (!card?.sections?.length) return;
    const first = card.sections[0];
    if (first && !card.sections.some((s) => s.code === section)) {
      setSection(first.code);
      setMaxScore(first.default_max);
    }
    if (!card.placement && mode === 'placement') setMode('section');
  }, [card, section, mode]);

  useEffect(() => {
    const dateIso = normalizeHeldOn(heldOn);
    if (!Number.isFinite(groupId) || !dateIso || !section || mode === 'placement') return;
    setScoresReady(false);
    dirtyScores.current = false;
    setDirty(false);
    const seq = ++scoresSeq.current;
    void eaGroupScores(groupId, dateIso, section)
      .then((data) => {
        if (seq !== scoresSeq.current || dirtyScores.current) return;
        setRows(data.rows || []);
        setScoresReady(true);
        if (data.session?.max_score) setMaxScore(Number(data.session.max_score));
        if (data.session?.work_type) setWorkType(data.session.work_type);
        setEditLock({
          edit_locked: Boolean(data.session?.edit_locked),
          edit_locked_until: data.session?.edit_locked_until ?? null,
          edit_lock_remaining_ms: data.session?.edit_lock_remaining_ms ?? null,
          edit_lock_bypass: Boolean(data.session?.edit_lock_bypass),
          created_at: data.session?.created_at ?? null,
        });
        const loaded = data.rows || [];
        if (!loaded.some((r) => r.status === 'complete')) setEntryMode(true);
        else setEntryMode(false);
        setSections((prev) => (data.sections?.length ? data.sections : prev));
        setWorkTypes((prev) => (data.work_types?.length ? data.work_types : prev));
      })
      .catch((e) => {
        if (seq !== scoresSeq.current) return;
        setScoresReady(true);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [groupId, heldOn, section, mode]);

  useEffect(() => {
    const dateIso = normalizeHeldOn(heldOn);
    if (!Number.isFinite(groupId) || !dateIso || mode !== 'placement' || !card?.placement) return;
    setPlacementReady(false);
    dirtyPlacement.current = false;
    setDirty(false);
    const seq = ++placementSeq.current;
    void eaGroupPlacement(groupId, dateIso)
      .then((data) => {
        if (seq !== placementSeq.current || dirtyPlacement.current) return;
        setPlacementRows(data.rows || []);
        setPlacementReady(true);
        setEditLock({
          edit_locked: Boolean(data.session?.edit_locked),
          edit_locked_until: data.session?.edit_locked_until ?? null,
          edit_lock_remaining_ms: data.session?.edit_lock_remaining_ms ?? null,
          edit_lock_bypass: Boolean(data.session?.edit_lock_bypass),
          created_at: data.session?.created_at ?? null,
        });
        const loaded = data.rows || [];
        if (!loaded.some((r) => r.status === 'complete')) setEntryMode(true);
        else setEntryMode(false);
      })
      .catch((e) => {
        if (seq !== placementSeq.current) return;
        setPlacementReady(true);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [groupId, heldOn, mode, card?.placement?.id]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const summary = useMemo(() => {
    const complete = rows.filter((r) => r.status === 'complete');
    const percents = complete.map((r) => r.percent).filter((v): v is number => v != null);
    const mean = percents.length ? percents.reduce((a, b) => a + b, 0) / percents.length : null;
    return {
      complete: complete.length,
      absent: rows.filter((r) => r.status === 'absent').length,
      incomplete: rows.filter((r) => r.status === 'incomplete').length,
      mean,
    };
  }, [rows]);

  function setRow(studentId: number, patch: Partial<EaScoreRow>) {
    dirtyScores.current = true;
    setDirty(true);
    const name = rows.find((r) => r.student_id === studentId)?.full_name || 'Учащийся';
    let nextScore = patch.score;
    if (patch.score != null && Number.isFinite(Number(patch.score))) {
      const clamped = clampScoreToMax(Number(patch.score), maxScore);
      if (clamped.was != null) {
        nextScore = clamped.score;
        flashScoreNudge(
          `${studentId}:score`,
          `Нельзя поставить выше максимума. У ${name} было ${clamped.was}, записали ${clamped.score} (макс. ${maxScore}).`,
        );
      } else {
        setError(null);
      }
    }
    setRows((prev) =>
      prev.map((r) => {
        if (r.student_id !== studentId) return r;
        const next = { ...r, ...patch, score: nextScore !== undefined ? nextScore : r.score };
        if (next.status === 'absent') {
          next.percent = null;
          next.score = null;
        } else if (next.status === 'complete' && next.score != null && maxScore > 0) {
          next.percent = Math.round((Number(next.score) / maxScore) * 1000) / 10;
        } else {
          next.percent = null;
        }
        return next;
      }),
    );
    setSaved(null);
  }

  function setPlacementRow(studentId: number, patch: Partial<EaPlacementRow>) {
    dirtyPlacement.current = true;
    setDirty(true);
    setPlacementRows((prev) =>
      prev.map((r) => {
        if (r.student_id !== studentId) return r;
        const next = { ...r, ...patch };
        if (next.status === 'absent') {
          next.percent = null;
          next.total_score = null;
          next.fields = next.fields.map((f) => ({ ...f, score: null, percent: null, status: 'absent' as const }));
        }
        return next;
      }),
    );
    setSaved(null);
  }

  function setPlacementField(studentId: number, fieldId: string, score: number | null) {
    dirtyPlacement.current = true;
    setDirty(true);
    const fieldMeta = new Map((card?.placement?.fields || []).map((f) => [f.id, f]));
    const meta = fieldMeta.get(fieldId);
    const max = meta?.effective_max;
    const label = meta?.excel_label || fieldId;
    const name = placementRows.find((r) => r.student_id === studentId)?.full_name || 'Учащийся';
    const clamped = clampScoreToMax(score, max);
    const nextScore = clamped.score;
    if (clamped.was != null) {
      flashScoreNudge(
        `${studentId}:${fieldId}`,
        `Нельзя поставить выше максимума поля. У ${name} «${label}»: было ${clamped.was}, записали ${nextScore} (макс. ${max}).`,
      );
    } else if (score != null) {
      setError(null);
    }
    setPlacementRows((prev) =>
      prev.map((r) => {
        if (r.student_id !== studentId) return r;
        const fields = r.fields.map((f) => {
          if (f.field_id !== fieldId) return f;
          const percent =
            nextScore != null && max != null && Number(max) > 0
              ? Math.round((Number(nextScore) / Number(max)) * 1000) / 10
              : null;
          return {
            ...f,
            score: nextScore,
            status: nextScore == null ? ('incomplete' as const) : ('complete' as const),
            percent,
          };
        });
        const allComplete = fields.length > 0 && fields.every((f) => f.status === 'complete' && f.score != null);
        const totalScore = allComplete
          ? fields.reduce((sum, f) => sum + Number(f.score || 0), 0)
          : null;
        const totalMax = card?.placement?.total_max ?? r.total_max;
        const percent =
          totalScore != null && totalMax != null && Number(totalMax) > 0
            ? Math.round((totalScore / Number(totalMax)) * 1000) / 10
            : null;
        return {
          ...r,
          status: 'incomplete',
          fields,
          total_score: totalScore,
          percent,
        };
      }),
    );
    setSaved(null);
  }

  async function savePlacement() {
    if (!card?.can_write || readonly || !Number.isFinite(groupId) || !card.placement) return;
    let rowsToSave = placementRows;
    const over = placementRows.flatMap((r) =>
      (r.fields || []).flatMap((f) => {
        const meta = card.placement?.fields.find((x) => x.id === f.field_id);
        const max = meta?.effective_max;
        if (r.status === 'absent' || f.score == null || max == null || Number(f.score) <= Number(max)) return [];
        return [{ row: r, field: f, meta, max: Number(max) }];
      }),
    );
    if (over.length) {
      const first = over[0];
      flashScoreNudge(
        `${first.row.student_id}:${first.field.field_id}`,
        `Нельзя поставить выше максимума поля. У ${first.row.full_name} «${first.meta?.excel_label || first.field.field_id}»: было ${first.field.score}, записали ${first.max} (макс. ${first.max}).`,
      );
      rowsToSave = placementRows.map((r) => ({
        ...r,
        fields: r.fields.map((f) => {
          const max = card.placement?.fields.find((x) => x.id === f.field_id)?.effective_max;
          const next = clampScoreToMax(f.score, max).score;
          return { ...f, score: next };
        }),
      }));
      setPlacementRows(rowsToSave);
    }
    setSaving(true);
    if (!over.length) setError(null);
    try {
      const data = await eaSaveGroupPlacement(groupId, {
        held_on: normalizeHeldOn(heldOn) || todayIso(),
        confirm_group_scope: confirmScope,
        rows: rowsToSave.map((r) => ({
          student_id: r.student_id,
          status: r.status,
          fields: r.fields.map((f) => ({
            field_id: f.field_id,
            score: r.status === 'absent' ? null : f.score,
            status: r.status === 'absent' ? 'absent' : f.status,
          })),
        })),
      });
      placementSeq.current += 1;
      dirtyPlacement.current = false;
      setDirty(false);
      setPlacementRows(data.rows || []);
      setEntryMode(false);
      setError(null);
      setSaved('Сохранено. Суммы по разделам и Total Score пересчитаны на сервере.');
      setDialog({ kind: 'saved', message: 'Результаты входного теста сохранены.' });
      emitEaLive({ kind: 'placement' });
      const next = new URLSearchParams(params);
      next.set('date', normalizeHeldOn(heldOn) || todayIso());
      next.set('mode', 'placement');
      setParams(next, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function downloadExcel() {
    if (!Number.isFinite(groupId)) return;
    setError(null);
    try {
      const { blob, filename } = await eaDownloadPlacementExcel(groupId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function save() {
    if (!card?.can_write || readonly || !Number.isFinite(groupId)) return;
    let rowsToSave = rows;
    const over = rows.find((r) => r.status !== 'absent' && r.score != null && Number(r.score) > maxScore);
    if (over) {
      flashScoreNudge(
        `${over.student_id}:score`,
        `Нельзя поставить выше максимума. У ${over.full_name} было ${over.score}, записали ${maxScore} (макс. ${maxScore}).`,
      );
      rowsToSave = rows.map((r) => {
        const next = clampScoreToMax(r.score, maxScore).score;
        return r.status === 'absent' ? r : { ...r, score: next };
      });
      setRows(rowsToSave);
    }
    setSaving(true);
    if (!over) setError(null);
    try {
      const data = await eaSaveGroupScores(groupId, {
        held_on: normalizeHeldOn(heldOn) || todayIso(),
        section_code: section,
        work_type: workType,
        max_score: maxScore,
        rows: rowsToSave.map((r) => ({
          student_id: r.student_id,
          score: r.status === 'absent' ? null : r.score,
          status: r.status,
        })),
      });
      scoresSeq.current += 1;
      dirtyScores.current = false;
      setDirty(false);
      setRows(data.rows || []);
      setEntryMode(false);
      setError(null);
      setSaved('Сохранено. Итоги пересчитаны на сервере.');
      setDialog({ kind: 'saved', message: 'Баллы группы сохранены.' });
      emitEaLive({ kind: 'scores' });
      const next = new URLSearchParams(params);
      next.set('date', normalizeHeldOn(heldOn) || todayIso());
      next.set('section', section);
      setParams(next, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function addStudent() {
    if (readonly || !card?.can_edit_roster || !Number.isFinite(groupId) || !newName.trim()) return;
    setAdding(true);
    setAddNote(null);
    setError(null);
    try {
      const data = await eaAddGroupStudent(groupId, {
        full_name: newName.trim(),
        class_label: newClass.trim() || undefined,
      });
      const students = asDirectoryStudents(data.students);
      applyRoster(students);
      emitEaLive({ kind: 'roster', groupId, students });
      setNewName('');
      setNewClass('');
      setAddNote('Учащийся добавлен в группу.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function removeStudent(student: EaDirectoryStudent) {
    if (readonly || !card?.can_edit_roster || !Number.isFinite(groupId)) return;
    if (!window.confirm(`Убрать «${student.full_name}» из группы?`)) return;
    setRemovingId(student.id);
    setAddNote(null);
    setError(null);
    try {
      const data = await eaRemoveGroupStudent(groupId, student.id);
      const students = asDirectoryStudents(data.students);
      applyRoster(students);
      emitEaLive({ kind: 'roster', groupId, students });
      setAddNote('Учащийся убран из группы.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingId(null);
    }
  }

  if (!Number.isFinite(groupId)) return <p className="ea-err">Нет группы</p>;
  if (error && !card) return <p className="ea-err">{error}</p>;
  if (!card) {
    return (
      <div aria-busy="true">
        <p className="ea-kicker">
          <Link to={href()}>Группы</Link>
          {' · '}
          ввод баллов
        </p>
        <h2 className="ea-card-title ea-skel ea-skel--title">&nbsp;</h2>
        <div className="ea-skel ea-skel--bar" />
        <div className="ea-skel ea-skel--chart" />
      </div>
    );
  }

  const sectionMeta = sections.find((s) => s.code === section);
  const canWriteBase = Boolean(card.can_write) && !readonly;
  const lockComplete = Boolean(editLock.edit_locked);
  const canWrite = canWriteBase && entryMode;
  const canEditRoster = Boolean(card.can_edit_roster) && !readonly;
  const hasOpenRows =
    mode === 'placement'
      ? placementRows.some((r) => r.status !== 'complete')
      : rows.some((r) => r.status !== 'complete');
  const hasSavedScores =
    mode === 'placement'
      ? placementRows.some((r) => r.status === 'complete' || r.status === 'absent')
      : rows.some((r) => r.status === 'complete' || r.status === 'absent');
  const canCorrectSaved = canWriteBase && !lockComplete && hasSavedScores;
  const canFillMissing = canWriteBase && hasOpenRows && hasSavedScores;
  function rowEditable(status: string) {
    if (!canWrite) return false;
    if (lockComplete && status === 'complete') return false;
    return true;
  }

  return (
    <div>
      <p className="ea-kicker">
        <Link to={href()}>Группы</Link>
        {' · '}
        ввод баллов
      </p>
      <h2 className="ea-card-title">{card.group.title}</h2>
      <p className="ea-note">
        {card.group.parallel ? `${card.group.parallel} параллель` : 'группа'}
        {card.group.campus === 'digital' ? ' · ЦГ' : ''} · {card.students.length} уч. Speaking не входит.
      </p>
      {canWriteBase && !readonly ? (
        <p className="ea-warn">
          {lockComplete
            ? 'Через час после первого сохранения уже выставленные баллы нельзя менять. Результаты группы остаются на этой странице. Отсутствовавшим — кнопка «Дозаполнить отсутствующих».'
            : entryMode
              ? 'Ввод баллов. Пустая ячейка — ещё не внесено, ноль — выставленный балл. «Н» — отсутствовал.'
              : 'Сохранённые результаты группы. Исправить — «Исправить результаты». Болевших/отсутствующих — «Дозаполнить отсутствующих».'}
        </p>
      ) : !readonly ? (
        <p className="ea-warn">Лист группы открыт для просмотра. Вносить баллы можно только в своих группах.</p>
      ) : null}

      {canEditRoster ? (
        <div className="ea-add-student">
          <p className="ea-kicker">Состав группы</p>
          <div className="ea-add-student__row">
            <label>
              ФИО
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Фамилия Имя Отчество"
                autoComplete="off"
              />
            </label>
            <label>
              Класс <span className="ea-note">(необяз.)</span>
              <input
                value={newClass}
                onChange={(e) => setNewClass(e.target.value)}
                placeholder="напр. 6Б"
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="btn"
              disabled={adding || !newName.trim()}
              onClick={() => void addStudent()}
            >
              {adding ? 'Добавление…' : 'Добавить в группу'}
            </button>
          </div>
          {card.students.length ? (
            <ul className="ea-roster-list">
              {card.students.map((student) => (
                <li key={student.id}>
                  <span>{mask ? maskFullName(student.full_name) : student.full_name}</span>
                  <button
                    type="button"
                    className="btn"
                    disabled={removingId === student.id}
                    onClick={() => void removeStudent(student)}
                  >
                    {removingId === student.id ? 'Удаление…' : 'Убрать'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ea-note">В группе пока никого нет.</p>
          )}
          {addNote ? <p className="ea-note">{addNote}</p> : null}
        </div>
      ) : null}

      {card.placement_excluded ? (
        <div className="ea-warn">
          Для 1 и 8 классов общего входного теста 2026/27 нет. Загрузите диагностическую спецификацию на странице
          спецификаций — либо ведите текущие работы по разделам.
        </div>
      ) : null}

      <div className="ea-score-bar">
        <label>
          Режим
          <select
            value={mode}
            onChange={(e) => {
              const next = e.target.value === 'section' ? 'section' : 'placement';
              askLeave(() => {
                setMode(next);
                if (next === 'section' && workType === 'diagnostic') setWorkType('current');
              });
            }}
          >
            <option value="placement" disabled={!card.placement}>
              Входной тест 2026/27
            </option>
            <option value="section">Текущая / контрольная по разделу</option>
          </select>
        </label>
        <label>
          Дата работы
          <input
            type="date"
            value={normalizeHeldOn(heldOn) || todayIso()}
            onChange={(e) => {
              const nextDate = normalizeHeldOn(e.target.value) || e.target.value;
              askLeave(() => {
                if (hasSavedScores && canWriteBase && !readonly && nextDate !== normalizeHeldOn(heldOn)) {
                  setDialog({ kind: 'move-date', nextDate });
                  return;
                }
                navigateToDate(nextDate);
              });
            }}
          />
        </label>
        {hasSavedScores && canWriteBase && !readonly ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              const el = document.querySelector<HTMLInputElement>('label input[type="date"]');
              el?.showPicker?.();
              el?.focus();
            }}
          >
            Изменить дату
          </button>
        ) : null}
        {sessionDates.length ? (
          <div className="ea-date-chips" aria-label="Даты с баллами">
            {sessionDates.slice(0, 6).map((d) => (
              <button
                key={d}
                type="button"
                className={`ea-date-chip${heldOn === d ? ' is-active' : ''}`}
                onClick={() => {
                  askLeave(() => {
                    datePinned.current = true;
                    setHeldOn(d);
                    const next = new URLSearchParams(params);
                    next.set('date', d);
                    setParams(next, { replace: true });
                  });
                }}
              >
                {formatHeldOnChip(d)}
              </button>
            ))}
          </div>
        ) : null}
        {mode === 'section' ? (
          <>
            <label>
              Раздел
              <select
                value={section}
                onChange={(e) => {
                  const next = e.target.value;
                  askLeave(() => {
                    setSection(next);
                    const meta = sections.find((s) => s.code === next);
                    if (meta) setMaxScore(meta.default_max);
                  });
                }}
              >
                {sections.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.title_en}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип работы
              <select value={workType} onChange={(e) => setWorkType(e.target.value)}>
                {workTypes
                  .filter((w) => !(card.placement && w.code === 'diagnostic'))
                  .map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Максимум
              <input
                type="number"
                min={1}
                step={0.5}
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value) || 0)}
              />
            </label>
          </>
        ) : null}
        <label className="ea-note">
          <input type="checkbox" checked={mask} onChange={(e) => setMask(e.target.checked)} /> Скрыть ФИО на
          экране
        </label>
      </div>

      {mode === 'placement' && card.placement ? (
        <div className="ea-spec-card">
          <p className="ea-kicker">
            {card.placement.grade} класс · {card.placement.variant || 'вариант не указан'}
          </p>
          <p className="ea-note">
            {card.placement.source_file} · максимум {card.placement.total_max ?? '—'}
            {card.placement.total_max_proposed ? '*' : ''} ·{' '}
            {card.placement.official ? 'схема утверждена' : 'черновик, официальный ввод закрыт'}
          </p>
          {card.placement.group_scope ? (
            <label className="ea-note">
              <input type="checkbox" checked={confirmScope} onChange={(e) => setConfirmScope(e.target.checked)} />
              Группа входит в область {card.placement.group_scope}
            </label>
          ) : null}
          {card.placement.issues.length ? (
            <div className="ea-warn">
              {card.placement.issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'placement' && card.placement ? (
        <>
          {!sheetReady ? <p className="ea-note">Загружаем баллы…</p> : null}
          {sheetReady && emptyOnDate && sessionDates.length && heldOn && !sessionDates.includes(heldOn) ? (
            <p className="ea-warn">
              На {formatHeldOnDmy(heldOn)} баллов нет. Есть работы:{' '}
              {sessionDates
                .slice(0, 3)
                .map((d) => formatHeldOnChip(d))
                .join(', ')}
              .{' '}
              <button
                type="button"
                className="ea-linkish"
                onClick={() => {
                  const d = sessionDates[0];
                  datePinned.current = true;
                  setHeldOn(d);
                  const next = new URLSearchParams(params);
                  next.set('date', d);
                  setParams(next, { replace: true });
                }}
              >
                Открыть последнюю
              </button>
            </p>
          ) : null}
          <div className="ea-grid" style={{ margin: '0.85rem 0' }}>
            <div className="ea-stat">
              <span className="ea-kicker">Total Score</span>
              <strong>{card.placement.total_max ?? '—'}</strong>
              <span className="ea-note">считает сервер</span>
            </div>
            <div className="ea-stat">
              <span className="ea-kicker">Выставлено</span>
              <strong>{placementRows.filter((r) => r.status === 'complete').length}</strong>
            </div>
            <div className="ea-stat">
              <span className="ea-kicker">Отсутствовали</span>
              <strong>{placementRows.filter((r) => r.status === 'absent').length}</strong>
            </div>
          </div>
          <div className="ea-heat-wrap">
            <table className="ea-table ea-score-table ea-placement-table">
              <thead>
                <tr>
                  <th>Учащийся</th>
                  {card.placement.fields.map((field) => (
                    <th key={field.id}>
                      {field.section}
                      <br />
                      {field.excel_label}
                      <span className="ea-note">
                        {' '}
                        / {field.effective_max ?? '—'}
                        {field.proposed ? '*' : ''}
                      </span>
                    </th>
                  ))}
                  <th>Total</th>
                  <th>%</th>
                  <th>Н</th>
                </tr>
              </thead>
              <tbody>
                {placementRows.map((row, rowIdx) => {
                  const zone = scoreZone(row.percent);
                  return (
                  <tr key={row.student_id} className={zone ? `ea-row-zone--${zone}` : undefined}>
                    <td>
                      <Link to={href(`/students/${row.public_id || row.student_id}`)}>
                        {mask ? maskFullName(row.full_name) : row.full_name}
                      </Link>
                    </td>
                    {row.fields.map((field, colIdx) => {
                      const fieldZone = scoreZone(field.percent);
                      const fieldMax = card.placement?.fields.find((f) => f.id === field.field_id)?.effective_max;
                      return (
                      <td
                        key={field.field_id}
                        className={fieldZone ? `ea-cell-zone--${fieldZone}` : undefined}
                      >
                        <input
                          className={`ea-score-input${nudgeKey === `${row.student_id}:${field.field_id}` ? ' ea-score-input--nudge' : ''}`}
                          type="number"
                          min={0}
                          max={fieldMax ?? undefined}
                          step={0.5}
                          data-grid={`${rowIdx}:${colIdx}`}
                          aria-label={`${row.full_name} — ${field.excel_label || field.section}`}
                          disabled={!rowEditable(row.status) || row.status === 'absent' || !card.placement?.official}
                          value={row.status === 'absent' || field.score == null ? '' : field.score}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setPlacementField(row.student_id, field.field_id, raw === '' ? null : Number(raw));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              focusScoreCell(rowIdx + 1, colIdx);
                            }
                          }}
                          onPaste={(e) => {
                            const text = e.clipboardData.getData('text');
                            if (!text.includes('\t') && !text.includes('\n')) return;
                            e.preventDefault();
                            const grid = parseGridPaste(text);
                            grid.forEach((line, r) => {
                              const target = placementRows[rowIdx + r];
                              if (!target) return;
                              line.forEach((cell, c) => {
                                const f = target.fields[colIdx + c];
                                if (!f) return;
                                const trimmed = String(cell).trim();
                                setPlacementField(target.student_id, f.field_id, trimmed === '' ? null : Number(trimmed));
                              });
                            });
                          }}
                        />
                      </td>
                      );
                    })}
                    <td>{row.total_score ?? '—'}</td>
                    <td>
                      <PctCell percent={row.percent} />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.status === 'absent'}
                        disabled={!rowEditable(row.status) || !card.placement?.official}
                        onChange={(e) =>
                          setPlacementRow(row.student_id, {
                            status: e.target.checked ? 'absent' : 'incomplete',
                          })
                        }
                        aria-label="Отсутствовал"
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="ea-zone-legend" aria-label="Светофор %">
            <li>
              <span className={zoneBadgeClass('green')}>≥85%</span>
            </li>
            <li>
              <span className={zoneBadgeClass('yellow')}>75–85%</span>
            </li>
            <li>
              <span className={zoneBadgeClass('red')}>60–75%</span>
            </li>
            <li>
              <span className={zoneBadgeClass('risk')}>&lt;60%</span>
            </li>
          </ul>
        </>
      ) : (
        <>
          {!sheetReady ? <p className="ea-note">Загружаем баллы…</p> : null}
            <div className="ea-grid" style={{ margin: '0.85rem 0' }}>
            <div className="ea-stat">
              <span className="ea-kicker">Раздел</span>
              <strong>{sectionMeta?.title_en || sectionMeta?.title || '—'}</strong>
            </div>
            <div className="ea-stat">
              <span className="ea-kicker">Среднее</span>
              <strong>
                <PctCell percent={summary.mean} />
              </strong>
              <span className="ea-note">по выставленным, без отсутствующих</span>
            </div>
            <div className="ea-stat">
              <span className="ea-kicker">Выставлено</span>
              <strong>{summary.complete}</strong>
            </div>
            <div className="ea-stat">
              <span className="ea-kicker">Отсутствовали</span>
              <strong>{summary.absent}</strong>
            </div>
          </div>

          <table className="ea-table ea-score-table ea-heat-table ea-card-table">
            <thead>
              <tr>
                <th>Учащийся</th>
                <th>Балл</th>
                <th>Н</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => {
                const zone = scoreZone(row.percent);
                return (
                <tr key={row.student_id} className={zone ? `ea-row-zone--${zone}` : undefined}>
                  <td data-label="Учащийся">
                    <Link to={href(`/students/${row.public_id || row.student_id}`)}>
                      {mask ? maskFullName(row.full_name) : row.full_name}
                    </Link>
                  </td>
                  <td data-label="Балл">
                    <input
                      className={`ea-score-input${nudgeKey === `${row.student_id}:score` ? ' ea-score-input--nudge' : ''}`}
                      type="number"
                      min={0}
                      max={maxScore}
                      step={0.5}
                      data-grid={`${rowIdx}:0`}
                      aria-label={`${row.full_name} — балл`}
                      disabled={!rowEditable(row.status) || row.status === 'absent'}
                      value={row.status === 'absent' || row.score == null ? '' : row.score}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setRow(row.student_id, {
                          score: raw === '' ? null : Number(raw),
                          status: raw === '' ? 'incomplete' : 'complete',
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          focusScoreCell(rowIdx + 1, 0);
                        }
                      }}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData('text');
                        if (!text.includes('\t') && !text.includes('\n')) return;
                        e.preventDefault();
                        parseGridPaste(text).forEach((line, r) => {
                          const target = rows[rowIdx + r];
                          if (!target) return;
                          const trimmed = String(line[0] ?? '').trim();
                          setRow(target.student_id, {
                            score: trimmed === '' ? null : Number(trimmed),
                            status: trimmed === '' ? 'incomplete' : 'complete',
                          });
                        });
                      }}
                    />
                  </td>
                  <td data-label="Н">
                    <input
                      type="checkbox"
                      checked={row.status === 'absent'}
                      disabled={!rowEditable(row.status)}
                      onChange={(e) =>
                        setRow(row.student_id, {
                          status: e.target.checked ? 'absent' : row.score == null ? 'incomplete' : 'complete',
                          score: e.target.checked ? null : row.score,
                        })
                      }
                      aria-label="Отсутствовал"
                    />
                  </td>
                  <td data-label="%">
                    <PctCell percent={row.percent} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="ea-zone-legend" aria-label="Светофор %">
            <li>
              <span className={zoneBadgeClass('green')}>≥85%</span>
            </li>
            <li>
              <span className={zoneBadgeClass('yellow')}>75–85%</span>
            </li>
            <li>
              <span className={zoneBadgeClass('red')}>60–75%</span>
            </li>
            <li>
              <span className={zoneBadgeClass('risk')}>&lt;60%</span>
            </li>
          </ul>
        </>
      )}

      {error ? <p className="ea-err">{error}</p> : null}
      {saved ? <p className="ea-note">{saved}</p> : null}
      {dirty ? <p className="ea-warn">Есть несохранённые изменения</p> : null}
      <div className="ea-actions ea-save-dock">
        {canWriteBase && !entryMode ? (
          <>
            {canCorrectSaved ? (
              <button
                type="button"
                className="btn primary"
                disabled={mode === 'placement' && !card.placement?.official}
                onClick={() => setEntryMode(true)}
              >
                Исправить результаты
              </button>
            ) : null}
            {canFillMissing ? (
              <button
                type="button"
                className="btn primary"
                disabled={mode === 'placement' && !card.placement?.official}
                onClick={() => setEntryMode(true)}
              >
                Дозаполнить отсутствующих
              </button>
            ) : null}
            {mode === 'placement' ? (
              <button type="button" className="btn" disabled={!card.placement?.official} onClick={() => void downloadExcel()}>
                Excel группы
              </button>
            ) : null}
            <span className="ea-note">
              {!sheetReady
                ? 'Загружаем баллы…'
                : canCorrectSaved
                  ? 'Можно исправить выставленные баллы до истечения часа.'
                  : canFillMissing
                    ? 'Можно заполнить пустые строки и отсутствовавших на этой же дате.'
                    : 'Все результаты этой даты уже внесены.'}
            </span>
          </>
        ) : !canWriteBase ? (
          <span className="ea-note">
            {readonly
              ? 'Режим просмотра: баллы не сохраняются.'
              : 'В этой группе баллы не сохраняются — она закреплена за другим преподавателем.'}
          </span>
        ) : mode === 'placement' ? (
          <>
            <button
              type="button"
              className="btn primary"
              disabled={saving || !card.placement?.official}
              onClick={() => void savePlacement()}
            >
              {saving ? 'Сохранение…' : 'Сохранить входной тест'}
            </button>
            <button type="button" className="btn" onClick={() => setEntryMode(false)}>
              К результатам
            </button>
            <button type="button" className="btn" disabled={!card.placement?.official} onClick={() => void downloadExcel()}>
              Excel группы
            </button>
            <span className="ea-note">
              {card.placement?.official
                ? lockComplete
                  ? 'После часа правки: только отсутствовавшие и пустые строки. Выставленное не перезаписывается.'
                  : 'Пустая ячейка — не внесено. Ноль — выставленный балл. Итоги считает сервер.'
                : 'Официальный ввод откроется после утверждения схемы.'}
            </span>
          </>
        ) : (
          <>
            <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'Сохранение…' : 'Сохранить баллы'}
            </button>
            <button type="button" className="btn" onClick={() => setEntryMode(false)}>
              К результатам
            </button>
            <span className="ea-note">
              {lockComplete
                ? 'После часа правки можно заполнить только отсутствовавших и пустые ячейки.'
                : 'Пустая ячейка — результат ещё не внесён. Ноль — выставленный балл. Н — отсутствовал.'}
            </span>
          </>
        )}
      </div>

      {card.sessions.length ? (
        <>
          <h3>Недавние работы группы</h3>
          <table className="ea-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Раздел</th>
                <th>Выставлено</th>
                <th>Н</th>
              </tr>
            </thead>
            <tbody>
              {card.sessions.map((s) => (
                <tr key={`${s.held_on}-${s.section_code}-${s.id}`}>
                  <td>
                    <button
                      type="button"
                      className="ea-linkish"
                      onClick={() => {
                        askLeave(() => {
                          if (s.held_on) {
                            const iso = normalizeHeldOn(s.held_on);
                            if (iso) {
                              datePinned.current = true;
                              setHeldOn(iso);
                              const next = new URLSearchParams(params);
                              next.set('date', iso);
                              next.set('mode', 'section');
                              next.set('section', s.section_code);
                              setParams(next, { replace: true });
                            }
                          }
                          setMode('section');
                          setSection(s.section_code);
                        });
                      }}
                    >
                      {formatHeldOnDmy(s.held_on)}
                    </button>
                  </td>
                  <td>{s.section_title || s.section_code}</td>
                  <td>{s.complete ?? '—'}</td>
                  <td>{s.absent ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <EaDialog
        open={dialog?.kind === 'leave'}
        title="Уйти без сохранения?"
        cancelLabel="Остаться"
        confirmLabel="Уйти"
        danger
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          const next = dialog?.kind === 'leave' ? dialog.next : null;
          setDialog(null);
          setDirty(false);
          dirtyScores.current = false;
          dirtyPlacement.current = false;
          next?.();
        }}
      >
        <p>Есть несохранённые изменения на листе баллов.</p>
      </EaDialog>

      <EaDialog
        open={dialog?.kind === 'saved'}
        title="Сохранено"
        dismissLabel="Хорошо"
        onCancel={() => setDialog(null)}
      >
        <p>{dialog?.kind === 'saved' ? dialog.message : ''}</p>
      </EaDialog>

      <EaDialog
        open={dialog?.kind === 'move-date'}
        title="Перенести дату работы?"
        cancelLabel="Открыть пустой лист"
        confirmLabel={movingDate ? 'Перенос…' : 'Перенести баллы'}
        onCancel={() => {
          if (movingDate) return;
          const nextDate = dialog?.kind === 'move-date' ? dialog.nextDate : '';
          setDialog(null);
          if (nextDate) navigateToDate(nextDate);
        }}
        onConfirm={() => {
          if (dialog?.kind !== 'move-date' || movingDate) return;
          void moveWorkDate(dialog.nextDate);
        }}
      >
        <p>
          На {formatHeldOnDmy(heldOn)} уже есть сохранённые результаты. Перенести их на{' '}
          {dialog?.kind === 'move-date' ? formatHeldOnDmy(dialog.nextDate) : '—'} без потери баллов?
        </p>
        <p className="ea-note">«Открыть пустой лист» — новая дата без переноса (как раньше).</p>
      </EaDialog>
    </div>
  );
}
