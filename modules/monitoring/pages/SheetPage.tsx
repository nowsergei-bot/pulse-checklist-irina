import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { type Result, type ScaleRow, studentResult } from './calc';
import Dialog from './Dialog';
import { GroupName, STATUS_NAMES, versionLabel } from './labels';

type Part = { id: number; code: string; name: string; held_on: string | null };
type Task = { id: number; part_id: number; sort: number; section: string; level: string; level_name: string | null; title: string; max_points: number };
type Student = {
  id: number; full_name: string; result: Result; gentle: boolean;
  scores: Record<string, number | null>; absent: Record<string, boolean>; foreign: Record<string, string>;
};
type Sheet = {
  work: { id: number; title: string; parallel: number; status: 'draft' | 'open' | 'closed'; spec_title: string; version: number; max_points: number };
  group: { id: number; title: string; digital: boolean };
  can_edit: boolean; reason: string; parts: Part[]; tasks: Task[]; scale: ScaleRow[];
  students: Student[]; left_students: Student[];
  gentle: Gentle;
};
type Gentle = {
  enabled: boolean; can_change: boolean; groups_on: number; groups_total: number;
  history: { enabled: boolean; changed_by_name: string; changed_at: string }[];
};
type GentlePreview = { groups: number; changed: number; higher: number; lower: number };
type GentleAsk = { enabled: boolean; scope: 'group' | 'parallel'; preview?: GentlePreview; busy?: boolean; error?: string };
type Change = { student_id: number; task_id?: number; score?: number | null; part_id?: number; absent?: boolean };
type SaveResult = { students: Student[]; errors: string[]; conflicts: { student_id: number; key: string; group: string }[] };
type SaveState = 'saved' | 'pending' | 'saving' | 'offline' | 'blocked';

const SAVE_TEXT: Record<SaveState, string> = {
  saved: 'Все изменения сохранены',
  pending: 'Есть изменения, сохраняем',
  saving: 'Сохраняем…',
  offline: 'Нет связи, не сохранено. Изменения хранятся в этом браузере, повторим сами',
  blocked: 'Не сохранено',
};

// Название из спецификации часто повторяет раздел и уровень («Listening: базовый»); тогда оно только в подсказке.
const norm = (v: string) => v.toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim();
const sameTitle = (t: Task) => norm(t.title) === norm(`${t.section} ${t.level_name || t.level}`);

// «у 1 ученика», «у 2 учеников», «у 21 ученика».
const pupils = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'ученика' : 'учеников');

function when(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function date(value: string | null) {
  if (!value) return '';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// Несохранённые изменения лежат в браузере, пока сервер их не принял.
function readStored(key: string): Record<string, Change> {
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeStored(key: string, value: Record<string, Change>) {
  try {
    if (Object.keys(value).length) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
  } catch {
    // Хранилище недоступно: изменения остаются в памяти страницы.
  }
}

export default function SheetPage({ base, workId, groupId }: { base: string; workId: number; groupId: number }) {
  const storeKey = `mon-sheet-${workId}-${groupId}`;
  const [sheet, setSheet] = useState<Sheet>();
  const [loadError, setLoadError] = useState('');
  const [save, setSave] = useState<{ state: SaveState; message?: string }>({ state: 'saved' });
  const [notes, setNotes] = useState<string[]>([]);
  const [hint, setHint] = useState('');
  const [flash, setFlash] = useState('');
  const [gentleAsk, setGentleAsk] = useState<GentleAsk>();
  const [, setTick] = useState(0);
  const pending = useRef<Record<string, Change>>({});
  const saving = useRef(false);
  const retry = useRef(0);
  const timer = useRef<number>();

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (saving.current) {
      timer.current = window.setTimeout(() => { void flush(); }, 400);
      return;
    }
    const entries = Object.entries(pending.current);
    if (!entries.length) return;
    saving.current = true;
    setSave({ state: 'saving' });
    try {
      const r = await api<SaveResult>(`/works/${workId}/sheet`, { method: 'POST', body: { group_id: groupId, changes: entries.map(([, c]) => c) } });
      // Снимаем только то, что не меняли во время сохранения.
      for (const [key, change] of entries) if (pending.current[key] === change) delete pending.current[key];
      writeStored(storeKey, pending.current);
      retry.current = 0;
      const byId = new Map(r.students.map(s => [s.id, s]));
      setSheet(prev => prev && { ...prev, students: prev.students.map(s => byId.get(s.id) || s) });
      const names = new Map(r.students.map(s => [s.id, s.full_name]));
      const next = [
        ...r.errors,
        ...r.conflicts.map(c => `${names.get(c.student_id) || 'Ученик'}: ${c.key.startsWith('p') ? 'отметка «отсутствовал» или баллы части уже внесены' : 'балл уже внесён'} в другой группе (${c.group}), здесь не изменено`),
      ];
      if (next.length) setNotes(next);
      const left = Object.keys(pending.current).length;
      setSave({ state: left ? 'pending' : 'saved' });
      if (left) timer.current = window.setTimeout(() => { void flush(); }, 300);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status && status < 500 && status !== 408 && status !== 429) {
        setSave({ state: 'blocked', message: (e as Error).message });
      } else {
        setSave({ state: 'offline' });
        const delay = Math.min(30000, 2000 * 2 ** retry.current);
        retry.current += 1;
        timer.current = window.setTimeout(() => { void flush(); }, delay);
      }
    } finally {
      saving.current = false;
      setTick(t => t + 1);
    }
  }, [workId, groupId, storeKey]);

  useEffect(() => {
    let active = true;
    setLoadError('');
    api<Sheet>(`/works/${workId}/sheet?group=${groupId}`)
      .then(data => {
        if (!active) return;
        setSheet(data);
        pending.current = readStored(storeKey);
        if (Object.keys(pending.current).length) {
          if (data.can_edit) { setSave({ state: 'pending' }); void flush(); }
          else setSave({ state: 'blocked', message: data.reason || 'Нет права вносить результаты' });
        }
      })
      .catch((e: Error) => { if (active) setLoadError(e.message); });
    return () => {
      active = false;
      window.clearTimeout(timer.current);
    };
  }, [workId, groupId, storeKey, flush]);

  // Перед уходом со страницы с несохранёнными изменениями браузер спросит подтверждение.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  function change(key: string, value: Change) {
    pending.current = { ...pending.current, [key]: value };
    writeStored(storeKey, pending.current);
    setSave({ state: 'pending' });
    setTick(t => t + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 700);
  }

  // Щадящий режим: сначала сервер считает, у скольких учеников изменится отметка, потом подтверждение.
  async function askGentle(enabled: boolean, scope: GentleAsk['scope']) {
    setGentleAsk({ enabled, scope, busy: true });
    try {
      const preview = await api<GentlePreview>(`/works/${workId}/gentle`, { method: 'POST', body: { group_id: groupId, scope, enabled } });
      setGentleAsk({ enabled, scope, preview });
    } catch (e) {
      setGentleAsk({ enabled, scope, error: (e as Error).message });
    }
  }

  async function applyGentle(ask: GentleAsk) {
    setGentleAsk({ ...ask, busy: true, error: '' });
    try {
      await api(`/works/${workId}/gentle`, { method: 'POST', body: { group_id: groupId, scope: ask.scope, enabled: ask.enabled, confirm: true } });
      const data = await api<Sheet>(`/works/${workId}/sheet?group=${groupId}`);
      setSheet(data);
      setGentleAsk(undefined);
    } catch (e) {
      setGentleAsk({ ...ask, busy: false, error: (e as Error).message });
    }
  }

  function reject(cell: string, max: number) {
    setHint(`Балл: целое число от 0 до ${max}`);
    setFlash(cell);
    window.setTimeout(() => setFlash(f => (f === cell ? '' : f)), 1200);
  }

  function move(e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    const step = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`[data-cell="${row + step}:${col}"]`);
    if (next) { next.focus(); next.select(); }
  }

  if (loadError) return <div><BackLink base={base} /><p className="mon-err" role="alert">{loadError}</p></div>;
  if (!sheet) return <div><BackLink base={base} /><p className="mon-note">Загружаем…</p></div>;

  const { work, parts, tasks, students } = sheet;
  const gentle = sheet.gentle;
  const editable = sheet.can_edit;
  const scoreOf = (s: Student, t: Task) => {
    const p = pending.current[`${s.id}:t${t.id}`];
    return p ? p.score ?? null : s.scores[t.id] ?? null;
  };
  const absentOf = (s: Student, p: Part) => {
    const c = pending.current[`${s.id}:p${p.id}`];
    return c ? Boolean(c.absent) : Boolean(s.absent[p.id]);
  };
  // Итог, процент и отметка по тому, что сейчас в полях, включая ещё не отправленное.
  const resultOf = (s: Student) => studentResult({
    parts, tasks, maxPoints: work.max_points, scale: sheet.scale,
    absentPartIds: new Set(parts.filter(p => absentOf(s, p)).map(p => p.id)),
    scoreOf: taskId => scoreOf(s, tasks.find(t => t.id === taskId) as Task),
    // Режим группы, где внесены баллы ученика (у ученика из двух групп может отличаться).
    gentle: s.gentle,
  });
  const results = new Map(students.map(s => [s.id, resultOf(s)]));
  const left = sheet.left_students || [];
  const complete = students.filter(s => results.get(s.id)?.complete).length;
  const absent = students.filter(s => results.get(s.id)?.state.startsWith('отсутствовал')).length;
  const unfinished = students.length - complete - absent;
  let col = 0;

  function row(s: Student, rowIndex: number, isLeft: boolean) {
    col = 0;
    const r = isLeft ? s.result : results.get(s.id) as Result;
    const rowEditable = editable && !isLeft;
    const wasAbsent = r.state.startsWith('отсутствовал');
    const foreignGroups = [...new Set(Object.values(s.foreign))];
    const empty = r.missing === tasks.length && !wasAbsent;
    const allAbsent = parts.every(p => absentOf(s, p));
    return (
      <tr key={s.id} className={isLeft ? 'is-left' : undefined}>
        <td className="mon-sheet__name">
          {s.full_name}
          {isLeft ? <span className="mon-sheet__foreign">выбыл из группы</span> : null}
          {foreignGroups.length ? <span className="mon-sheet__foreign">внесено в другой группе: {foreignGroups.join(', ')}</span> : null}
        </td>
        {parts.map(p => {
          const isAbsent = absentOf(s, p);
          const foreignPart = s.foreign[`p${p.id}`];
          const partForeign = tasks.some(t => t.part_id === p.id && s.foreign[`t${t.id}`]);
          return [
            <td key={`a${p.id}`} className="mon-sheet__absent mon-sheet__part-start">
              <label className="mon-sheet__check" title={foreignPart ? `Отмечено в другой группе: ${foreignPart}` : partForeign ? 'Баллы этой части внесены в другой группе' : `${p.name}: отсутствовал`}>
                <input
                  type="checkbox"
                  checked={isAbsent}
                  disabled={!rowEditable || Boolean(foreignPart) || partForeign}
                  aria-label={`${s.full_name}, ${p.name}: отсутствовал`}
                  onChange={e => change(`${s.id}:p${p.id}`, { student_id: s.id, part_id: p.id, absent: e.target.checked })}
                />
              </label>
            </td>,
            ...tasks.filter(t => t.part_id === p.id).map(t => {
              const c = col++;
              const cell = `${rowIndex}:${c}`;
              const foreign = s.foreign[`t${t.id}`];
              const value = scoreOf(s, t);
              return (
                <td key={t.id} className={`mon-sheet__cell${isAbsent ? ' is-absent' : ''}`}>
                  <input
                    className={`mon-sheet__input${flash === cell ? ' is-wrong' : ''}${foreign ? ' is-foreign' : ''}`}
                    data-cell={isLeft ? undefined : cell}
                    inputMode="numeric"
                    autoComplete="off"
                    value={value === null ? '' : String(value)}
                    disabled={!rowEditable || isAbsent}
                    readOnly={Boolean(foreign)}
                    title={foreign ? `Внесено в другой группе: ${foreign}` : `${t.title}: от 0 до ${t.max_points}`}
                    aria-label={`${s.full_name}, ${t.title}, из ${t.max_points}`}
                    onFocus={e => e.target.select()}
                    onKeyDown={e => move(e, rowIndex, c)}
                    onChange={e => {
                      if (foreign) return;
                      const v = e.target.value.trim();
                      if (v === '') { change(`${s.id}:t${t.id}`, { student_id: s.id, task_id: t.id, score: null }); return; }
                      if (!/^\d+$/.test(v) || Number(v) > t.max_points) { reject(cell, t.max_points); return; }
                      setHint('');
                      change(`${s.id}:t${t.id}`, { student_id: s.id, task_id: t.id, score: Number(v) });
                    }}
                  />
                </td>
              );
            }),
          ];
        })}
        <td className="mon-num mon-sheet__res-start"><strong>{empty || allAbsent ? '' : r.total}</strong></td>
        <td
          className={`mon-num${r.complete ? '' : ' is-wait'}`}
          title={r.gentle && !(wasAbsent || empty) ? `Щадящий режим. Обычный процент: ${r.percent}` : undefined}
        >
          {wasAbsent || empty ? '' : r.gentle ? <>{r.gentle_percent}<span className="mon-gentle-tag">щадящий</span></> : r.percent}
        </td>
        <td className="mon-sheet__mark">{r.mark || ''}</td>
        <td><span className={`mon-state mon-state--${r.complete ? 'ok' : wasAbsent ? 'absent' : 'missing'}`}>{r.state}</span></td>
      </tr>
    );
  }

  return (
    <div className="mon-sheet">
      <BackLink base={base} />
      <div className="mon-sheet__head">
        <div>
          <h2 className="mon-title">{work.title}, {work.parallel} параллель</h2>
          <div className="mon-sheet__meta">
            <GroupName group={sheet.group} />
            <span className="mon-muted">{versionLabel({ title: work.spec_title, version: work.version, max_points: work.max_points })}</span>
            <span className={`mon-status mon-status--${work.status}`}>{STATUS_NAMES[work.status]}</span>
          </div>
        </div>
        {editable ? (
          <div className={`mon-save mon-save--${save.state}`} role="status">
            <span className="mon-save__dot" />
            <span>{save.state === 'blocked' && save.message ? `Не сохранено: ${save.message}` : SAVE_TEXT[save.state]}</span>
            {save.state === 'offline' || save.state === 'blocked' ? (
              <button type="button" className="mon-btn mon-btn--ghost" onClick={() => { retry.current = 0; void flush(); }}>Повторить</button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!editable ? <p className="mon-alert mon-alert--warn">{sheet.reason || 'Только просмотр'}</p> : null}
      {!editable && save.state === 'blocked' ? <p className="mon-alert mon-alert--err">В этом браузере есть несохранённые изменения, но сейчас вносить результаты нельзя.</p> : null}
      {notes.length ? (
        <div className="mon-alert mon-alert--warn" role="alert">
          <ul>{notes.map(n => <li key={n}>{n}</li>)}</ul>
          <button type="button" className="mon-link" onClick={() => setNotes([])}>Скрыть</button>
        </div>
      ) : null}
      <p className="mon-note mon-sheet__summary">
        Учеников: {students.length} · полная работа: {complete} · отсутствовали: {absent} · не внесено полностью: {unfinished}
        {left.length ? ` · выбыли из группы: ${left.length}` : ''}
        {hint ? <span className="mon-sheet__hint"> · {hint}</span> : null}
      </p>

      {gentle.can_change || gentle.enabled ? (
        <div className={`mon-gentle${gentle.enabled ? ' is-on' : ''}`}>
          <div className="mon-gentle__state">
            <strong>Щадящий режим: {gentle.enabled ? 'включён' : 'выключен'}</strong>
            <span className="mon-muted">
              Задания повышенного уровня считаются с коэффициентом 0,5, отметка ставится по этому проценту.
              {gentle.can_change && gentle.groups_total > 1 ? ` Включён в группах работы: ${gentle.groups_on} из ${gentle.groups_total}.` : ''}
            </span>
          </div>
          {gentle.can_change ? (
            <div className="mon-gentle__actions">
              <button type="button" className="mon-btn" onClick={() => { void askGentle(!gentle.enabled, 'group'); }}>
                {gentle.enabled ? 'Выключить' : 'Включить'}
              </button>
              {gentle.groups_total > 1 && gentle.groups_on < gentle.groups_total ? (
                <button type="button" className="mon-btn mon-btn--ghost" title="Все группы этой работы" onClick={() => { void askGentle(true, 'parallel'); }}>
                  Включить для всех групп параллели
                </button>
              ) : null}
              {gentle.groups_total > 1 && gentle.groups_on > 0 ? (
                <button type="button" className="mon-btn mon-btn--ghost" title="Все группы этой работы" onClick={() => { void askGentle(false, 'parallel'); }}>
                  Выключить для всех групп параллели
                </button>
              ) : null}
            </div>
          ) : null}
          {gentle.history.length ? (
            <details className="mon-gentle__history">
              <summary>История изменений</summary>
              <ul>
                {gentle.history.map(h => (
                  <li key={`${h.changed_at}-${h.enabled}`}>{when(h.changed_at)} · {h.changed_by_name || 'автор не указан'} · {h.enabled ? 'включён' : 'выключен'}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {gentleAsk ? (
        <Dialog
          title={`${gentleAsk.enabled ? 'Включить' : 'Выключить'} щадящий режим ${gentleAsk.scope === 'parallel' ? 'для всех групп параллели' : `для группы ${sheet.group.title}`}?`}
          confirmLabel={gentleAsk.enabled ? 'Включить' : 'Выключить'}
          busy={gentleAsk.busy || !gentleAsk.preview}
          onConfirm={gentleAsk.preview && gentleAsk.preview.groups ? () => { void applyGentle(gentleAsk); } : undefined}
          onCancel={() => setGentleAsk(undefined)}
        >
          {gentleAsk.preview ? (
            gentleAsk.preview.groups ? (
              <>
                <p>
                  {gentleAsk.preview.changed
                    ? `Отметка изменится у ${gentleAsk.preview.changed} ${pupils(gentleAsk.preview.changed)}: выше у ${gentleAsk.preview.higher}, ниже у ${gentleAsk.preview.lower}.`
                    : 'Отметки не изменятся.'}
                </p>
                {gentleAsk.scope === 'parallel' ? <p>Групп, где режим изменится: {gentleAsk.preview.groups}.</p> : null}
                <p>Баллы не меняются.</p>
              </>
            ) : <p>Режим уже {gentleAsk.enabled ? 'включён' : 'выключен'} во всех этих группах.</p>
          ) : gentleAsk.error ? null : <p>Считаем…</p>}
          {gentleAsk.error ? <p className="mon-err" role="alert">{gentleAsk.error}</p> : null}
        </Dialog>
      ) : null}

      {!students.length && !left.length ? <p className="mon-note">В группе нет учеников</p> : (
        <div className="mon-sheet__wrap">
          <table className="mon-table mon-sheet__table">
            <thead>
              <tr>
                <th rowSpan={2} className="mon-sheet__name">Ученик</th>
                {parts.map(p => (
                  <th key={p.id} colSpan={tasks.filter(t => t.part_id === p.id).length + 1} className="mon-sheet__part">
                    {p.name}{p.held_on ? <span className="mon-muted"> · {date(p.held_on)}</span> : null}
                  </th>
                ))}
                <th colSpan={4} className="mon-sheet__part mon-sheet__res-start">Результат</th>
              </tr>
              <tr>
                {parts.map(p => [
                  <th key={`a${p.id}`} className="mon-sheet__absent mon-sheet__part-start">Отсут&shy;ствовал</th>,
                  ...tasks.filter(t => t.part_id === p.id).map(t => (
                    <th key={t.id} className="mon-sheet__task" title={t.title}>
                      <span className="mon-sheet__section">{t.section}</span>
                      <span>{t.level_name || t.level}</span>
                      {sameTitle(t) ? null : <span className="mon-sheet__task-title">{t.title}</span>}
                      <span className="mon-sheet__max">из {t.max_points}</span>
                    </th>
                  )),
                ])}
                <th className="mon-num mon-sheet__res-start">Итого<span className="mon-sheet__max">из {work.max_points}</span></th>
                <th className="mon-num">%</th>
                <th className="mon-sheet__mark-head">Отметка</th>
                <th>Состояние</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => row(s, i, false))}
              {left.map((s, i) => row(s, students.length + i, true))}
            </tbody>
          </table>
        </div>
      )}
      {editable ? <p className="mon-note">Баллы сохраняются сами. Enter и стрелки переводят к соседнему ученику. Пустое поле: балл не внесён.</p> : null}
    </div>
  );
}

function BackLink({ base }: { base: string }) {
  return <p className="mon-back"><Link className="mon-link mon-link--muted" to={base}>← Все работы</Link></p>;
}
