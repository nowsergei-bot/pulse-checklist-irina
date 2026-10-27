import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { type Result, type ScaleRow, studentResult } from './calc';
import Dialog from './Dialog';
import { GroupName, STATUS_NAMES, versionLabel } from './labels';

type Part = { id: number; code: string; name: string; held_on: string | null };
type Task = { id: number; part_id: number; sort: number; section: string; section_label?: string; level: string; level_name: string | null; title: string; max_points: number; focus?: string | null; half?: boolean };
type Student = {
  id: number; full_name: string; result: Result; gentle?: boolean;
  scores: Record<string, number | null>; absent: Record<string, boolean>; foreign: Record<string, string>;
};
type Sheet = {
  work: { id: number; title: string; parallel: number; status: 'draft' | 'open' | 'closed'; spec_title: string; version: number; max_points: number; graded?: boolean };
  group: { id: number; title: string; digital: boolean };
  can_edit: boolean; reason: string; parts: Part[]; tasks: Task[];
  // У работы без отметки (пробный ЕГЭ) шкалы и щадящего режима нет.
  scale?: ScaleRow[]; gentle_scale?: ScaleRow[]; gentle_changes_mark?: boolean;
  students: Student[]; left_students: Student[];
  gentle?: Gentle;
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
// «из 1 группы», «из 3 групп».
const groupsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'группы' : 'групп');

// Фамилия и имя крупно, отчество (всё после второго слова) мельче.
function splitName(full: string) {
  const words = full.trim().split(/\s+/);
  return [words.slice(0, 2).join(' '), words.slice(2).join(' ')];
}

// Подряд идущие задания одного раздела: название раздела над их столбцами.
// У пробного ЕГЭ сервер присылает section_label (раздел ФИПИ): грамматика и лексика одной шапкой.
function bySection(list: Task[]) {
  const out: { section: string; tasks: Task[] }[] = [];
  for (const t of list) {
    const label = t.section_label || t.section;
    const last = out[out.length - 1];
    if (last && last.section === label) last.tasks.push(t);
    else out.push({ section: label, tasks: [t] });
  }
  return out;
}

const decimal = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const MARKS = ['5', '4', '3', '2'];

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
  // Неверное значение в клетке: показываем его красным с подсказкой, на сервер не отправляем.
  const [wrong, setWrong] = useState<{ cell: string; text: string; message: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
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

  // Enter и Tab: следующая клетка в строке, в конце строки первая клетка следующего ученика; Shift назад.
  // Стрелки вверх и вниз: тот же столбец у соседнего ученика. Пока в клетке неверное значение, курсор не уходит.
  function move(e: React.KeyboardEvent<HTMLInputElement>, cell: string) {
    const along = e.key === 'Enter' || e.key === 'Tab';
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!along && !step) return;
    if (wrong && wrong.cell === cell) { e.preventDefault(); return; }
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[data-cell]:not(:disabled)')];
    let next: HTMLInputElement | undefined;
    if (along) next = inputs[inputs.indexOf(e.currentTarget) + (e.shiftKey ? -1 : 1)];
    else {
      const [r, c] = cell.split(':').map(Number);
      next = inputs.find(i => i.dataset.cell === `${r + step}:${c}`);
    }
    if (!next) {
      if (e.key !== 'Tab') e.preventDefault();
      return;
    }
    e.preventDefault();
    next.focus();
    next.select();
  }

  if (loadError) return <div><BackLink base={base} /><p className="mon-err" role="alert">{loadError}</p></div>;
  if (!sheet) return <div><BackLink base={base} /><p className="mon-note">Загружаем…</p></div>;

  const { work, parts, tasks, students } = sheet;
  // Работа без отметки: нет столбца «Отметка», строки щадящего режима и счёта отметок внизу.
  const graded = work.graded !== false;
  const gentle: Gentle = sheet.gentle || { enabled: false, can_change: false, groups_on: 0, groups_total: 0, history: [] };
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
    parts, tasks, maxPoints: work.max_points, scale: sheet.scale || [], gentleScale: sheet.gentle_scale || [],
    gentleChangesMark: Boolean(sheet.gentle_changes_mark), graded,
    absentPartIds: new Set(parts.filter(p => absentOf(s, p)).map(p => p.id)),
    scoreOf: taskId => scoreOf(s, tasks.find(t => t.id === taskId) as Task),
    // Режим группы, где внесены баллы ученика (у ученика из двух групп может отличаться).
    gentle: Boolean(s.gentle),
  });
  const results = new Map(students.map(s => [s.id, resultOf(s)]));
  const left = sheet.left_students || [];
  const complete = students.filter(s => results.get(s.id)?.complete).length;
  const absent = students.filter(s => results.get(s.id)?.state.startsWith('отсутствовал')).length;
  const present = students.length - absent;
  // Среднее по группе: только полные работы.
  const done = students.map(s => results.get(s.id) as Result).filter(r => r.complete);
  const avgTotal = done.length ? done.reduce((a, r) => a + r.total, 0) / done.length : null;
  const avgPercent = done.length ? done.reduce((a, r) => a + r.percent, 0) / done.length : null;
  // Щадящие пороги для подсказок (когда режим меняет отметку).
  const gentleChanges = Boolean(sheet.gentle_changes_mark);
  const gentleRule = [...(sheet.gentle_scale || [])].sort((a, b) => Number(b.min_percent) - Number(a.min_percent))
    .filter(x => Number(x.min_percent) > 0).map(x => `«${x.mark}» от ${x.min_percent}%`).join(', ');
  const partTasks = (p: Part) => tasks.filter(t => t.part_id === p.id);
  // Среднее по блоку: только полные работы, как средний итог.
  const doneStudents = students.filter(s => results.get(s.id)?.complete);
  const blockAvg = (t: Task) => (doneStudents.length ? doneStudents.reduce((a, s) => a + (scoreOf(s, t) || 0), 0) / doneStudents.length : null);
  // Первое задание каждого раздела, кроме первого в части: тонкая линия между разделами.
  const sectionStart = new Set(parts.flatMap(p => bySection(partTasks(p)).slice(1).map(g => g.tasks[0].id)));
  // Кнопки щадящего режима и полный подзаголовок видит только data_admin (переключение доступно только ему).
  const admin = gentle.can_change;
  let col = 0;

  function row(s: Student, rowIndex: number, isLeft: boolean) {
    col = 0;
    const r = isLeft ? s.result : results.get(s.id) as Result;
    const rowEditable = editable && !isLeft;
    const wasAbsent = r.state.startsWith('отсутствовал');
    const foreignGroups = [...new Set(Object.values(s.foreign))];
    const empty = r.missing === tasks.length && !wasAbsent;
    const allAbsent = parts.every(p => absentOf(s, p));
    const [name, patronymic] = splitName(s.full_name);
    return (
      <tr key={s.id} className={isLeft ? 'is-left' : undefined}>
        <td className="mon-sheet__name">
          <span className="mon-sheet__fio">{name}</span>
          {patronymic ? <span className="mon-sheet__patronymic">{patronymic}</span> : null}
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
            ...partTasks(p).map(t => {
              const c = col++;
              const cell = `${rowIndex}:${c}`;
              const foreign = s.foreign[`t${t.id}`];
              const value = scoreOf(s, t);
              const bad = wrong && wrong.cell === cell ? wrong : null;
              return (
                <td key={t.id} className={`mon-sheet__cell${sectionStart.has(t.id) ? ' is-sec-start' : ''}${isAbsent ? ' is-absent' : ''}${bad ? ' is-wrong' : ''}`}>
                  <input
                    className={`mon-sheet__input${bad ? ' is-wrong' : ''}${foreign ? ' is-foreign' : ''}`}
                    data-cell={isLeft ? undefined : cell}
                    inputMode={t.half ? 'decimal' : 'numeric'}
                    autoComplete="off"
                    value={bad ? bad.text : value === null ? '' : decimal(value)}
                    disabled={!rowEditable || isAbsent}
                    readOnly={Boolean(foreign)}
                    title={foreign ? `Внесено в другой группе: ${foreign}` : `${t.title}: от 0 до ${t.max_points}${t.half ? ', можно 0,5' : ''}`}
                    aria-label={`${s.full_name}, ${t.title}, из ${t.max_points}`}
                    aria-invalid={bad ? true : undefined}
                    onFocus={e => e.target.select()}
                    onBlur={() => { if (bad) setWrong(null); }}
                    onKeyDown={e => move(e, cell)}
                    onChange={e => {
                      if (foreign) return;
                      const v = e.target.value.trim();
                      if (v === '') { setWrong(null); change(`${s.id}:t${t.id}`, { student_id: s.id, task_id: t.id, score: null }); return; }
                      // В задании с отметкой «можно 0,5» допускается половина балла: 1,5 или 1.5.
                      const ok = t.half ? /^\d+([.,][05])?$/.test(v) : /^\d+$/.test(v);
                      if (!ok) { setWrong({ cell, text: e.target.value, message: t.half ? `от 0 до ${t.max_points}, шаг 0,5` : `целое число от 0 до ${t.max_points}` }); return; }
                      const num = Number(v.replace(',', '.'));
                      if (num > t.max_points) { setWrong({ cell, text: v, message: `максимум ${t.max_points}` }); return; }
                      setWrong(null);
                      change(`${s.id}:t${t.id}`, { student_id: s.id, task_id: t.id, score: num });
                    }}
                  />
                  {bad ? <span className="mon-sheet__tip" role="alert">{bad.message}</span> : null}
                </td>
              );
            }),
          ];
        })}
        <td className="mon-num mon-sheet__res-start mon-sheet__total">{empty || allAbsent ? '' : decimal(r.total)}</td>
        <td className={`mon-num mon-sheet__pct${r.complete ? '' : ' is-wait'}`} title={graded ? undefined : r.state}>
          {graded ? (wasAbsent || empty ? '' : r.percent)
            : wasAbsent ? <span className="mon-sheet__state is-absent">{parts.length > 1 ? r.state : 'отсутствовал'}</span>
              : empty ? '' : r.complete ? r.percent : <span className="mon-sheet__state" title={r.state}>не внесено: {r.missing}</span>}
        </td>
        {graded ? <MarkCell r={r} wasAbsent={wasAbsent} parts={parts.length} gentleRule={gentleRule} /> : null}
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
            {admin ? <GroupName group={sheet.group} /> : (
              <span className="mon-group-name">{sheet.group.title}{sheet.group.digital ? <span className="mon-gtype mon-gtype--digital">ЦГ</span> : null}</span>
            )}
            <span className="mon-muted">{admin ? versionLabel({ title: work.spec_title, version: work.version, max_points: work.max_points }) : `${work.spec_title} · итого ${work.max_points}`}</span>
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
      {students.length ? (
        <div className="mon-sheet__progress">
          <span className="mon-progress" role="progressbar" aria-valuemin={0} aria-valuemax={present} aria-valuenow={complete} aria-label="Внесено работ">
            <span className="mon-progress__bar" style={{ width: `${present ? Math.round((100 * complete) / present) : 0}%` }} />
          </span>
          <span className="mon-sheet__progress-text">Внесено {complete} из {present}</span>
          <span className="mon-muted">отсутствовали: {absent}</span>
        </div>
      ) : null}

      {/* Строку с кнопками и историей видит только тот, кто может переключать режим (data_admin). Пока режим на отметку не влияет, пометки «щадящий» нет. */}
      {admin ? (
        <div className={`mon-gentle${gentle.enabled ? ' is-on' : ''}`}>
          <span className="mon-gentle__line" title={gentleChanges ? `Процент тот же, отметка по щадящим порогам: ${gentleRule}.` : 'Решение кафедры 20.10.2026: щадящий режим на отметку не влияет, отметка всегда по обычной шкале. Где режим включён, сохраняется.'}>
            <strong>Щадящий режим {gentle.enabled ? 'включён' : 'выключен'}</strong>
            {gentle.groups_total > 1 || gentle.enabled
              ? ` · ${gentle.enabled ? '' : 'включён в '}${gentle.groups_on} из ${gentle.groups_total} ${groupsWord(gentle.groups_total)}`
              : ''}
            {gentleChanges ? '' : ' · на отметку не влияет'}
          </span>
          {gentle.history.length ? (
            <button type="button" className="mon-link mon-link--muted mon-gentle__history-link" aria-expanded={showHistory} onClick={() => setShowHistory(v => !v)}>
              История изменений
            </button>
          ) : null}
          <span className="mon-gentle__actions">
            <button type="button" className="mon-btn mon-btn--sm" title={`Только группа ${sheet.group.title}`} onClick={() => { void askGentle(!gentle.enabled, 'group'); }}>
              {gentle.enabled ? 'Выключить' : 'Включить'}
            </button>
            {gentle.groups_total > 1 ? (
              <span className="mon-gentle__all" title="Все группы этой работы">
                <span className="mon-muted">Вся параллель:</span>
                {gentle.groups_on < gentle.groups_total ? (
                  <button type="button" className="mon-btn mon-btn--sm mon-btn--ghost" onClick={() => { void askGentle(true, 'parallel'); }}>включить</button>
                ) : null}
                {gentle.groups_on > 0 ? (
                  <button type="button" className="mon-btn mon-btn--sm mon-btn--ghost" onClick={() => { void askGentle(false, 'parallel'); }}>выключить</button>
                ) : null}
              </span>
            ) : null}
          </span>
          {showHistory && gentle.history.length ? (
            <ul className="mon-gentle__history">
              {gentle.history.map(h => (
                <li key={`${h.changed_at}-${h.enabled}`}>{when(h.changed_at)} · {h.changed_by_name || 'автор не указан'} · {h.enabled ? 'включён' : 'выключен'}</li>
              ))}
            </ul>
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
                  {!gentleAsk.preview.changed ? 'Отметки не изменятся.'
                    : !gentleAsk.preview.lower ? `Отметка станет выше у ${gentleAsk.preview.higher} ${pupils(gentleAsk.preview.higher)}.`
                      : !gentleAsk.preview.higher ? `Отметка станет ниже у ${gentleAsk.preview.lower} ${pupils(gentleAsk.preview.lower)}.`
                        : `Отметка изменится у ${gentleAsk.preview.changed} ${pupils(gentleAsk.preview.changed)}: выше у ${gentleAsk.preview.higher}, ниже у ${gentleAsk.preview.lower}.`}
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
                <th rowSpan={3} className="mon-sheet__name mon-sheet__corner">Ученик</th>
                {parts.map(p => (
                  <th key={p.id} colSpan={partTasks(p).length + 1} className="mon-sheet__part mon-sheet__part-start">
                    {parts.length === 1 ? work.title : p.name}{p.held_on ? ` · ${date(p.held_on)}` : ''}
                  </th>
                ))}
                <th colSpan={graded ? 3 : 2} className="mon-sheet__part mon-sheet__res-start">Результат</th>
              </tr>
              <tr>
                {parts.map(p => [
                  <th key={`a${p.id}`} rowSpan={2} className="mon-sheet__absent mon-sheet__part-start" title="Отсутствовал">Отс.</th>,
                  ...bySection(partTasks(p)).map((g, i) => (
                    <th key={`${p.id}-${i}`} colSpan={g.tasks.length} className="mon-sheet__section">{g.section}</th>
                  )),
                ])}
                <th rowSpan={2} className="mon-num mon-sheet__res-start mon-sheet__res-head">Итого<span className="mon-sheet__max">из {work.max_points}</span></th>
                <th rowSpan={2} className="mon-num mon-sheet__res-head" title="Процент: итог / максимум, округление до целого">%</th>
                {graded ? <th rowSpan={2} className="mon-sheet__mark-head mon-sheet__res-head">Отметка</th> : null}
              </tr>
              <tr>
                {parts.map(p => partTasks(p).map(t => (
                  <th key={t.id} className={`mon-sheet__task${sectionStart.has(t.id) ? ' is-sec-start' : ''}`} title={t.focus && t.section_label ? `${t.title}: ${t.focus}` : t.title}>
                    <span className="mon-sheet__level">{t.level_name || t.level}</span>
                    {sameTitle(t) ? null : <span className="mon-sheet__task-title">{t.title}</span>}
                    <span className="mon-sheet__max">из {t.max_points}</span>
                    {t.half ? <span className="mon-sheet__half">шаг 0,5</span> : null}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => row(s, i, false))}
              {left.map((s, i) => row(s, students.length + i, true))}
            </tbody>
            {students.length ? (
              <tfoot>
                <tr>
                  <td className="mon-sheet__name">
                    <span className="mon-sheet__fio">Среднее по группе</span>
                    <span className="mon-sheet__patronymic">полных работ: {done.length}</span>
                  </td>
                  {graded ? (
                    <td colSpan={tasks.length + parts.length} className="mon-sheet__marks">
                      <span className="mon-muted">Отметки:</span>
                      {MARKS.map(m => (
                        <span key={m} className="mon-sheet__mark-count"><span className={`mon-mark mon-mark--${m}`}>{m}</span>{done.filter(r => r.mark === m).length}</span>
                      ))}
                    </td>
                  ) : parts.map(p => [
                    // Работа без отметки: среднее по каждому блоку (по полным работам), в подсказке процент от максимума блока.
                    <td key={`a${p.id}`} className="mon-sheet__absent mon-sheet__part-start" />,
                    ...partTasks(p).map(t => {
                      const v = blockAvg(t);
                      return (
                        <td key={t.id} className={`mon-num mon-sheet__block-avg${sectionStart.has(t.id) ? ' is-sec-start' : ''}`} title={v === null ? undefined : `${t.title}: ${decimal((100 * v) / t.max_points)} % от максимума`}>
                          {v === null ? '' : decimal(v)}
                        </td>
                      );
                    }),
                  ])}
                  <td className="mon-num mon-sheet__res-start mon-sheet__total">{avgTotal === null ? '' : decimal(avgTotal)}</td>
                  <td className="mon-num mon-sheet__pct">{avgPercent === null ? '' : decimal(avgPercent)}</td>
                  {graded ? <td /> : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
      {editable ? <p className="mon-note">Баллы сохраняются сами. Enter и Tab переводят к следующей клетке, Shift+Tab назад, стрелки вверх и вниз к соседнему ученику. Пустое поле: балл не внесён.</p> : null}
    </div>
  );
}

// Отметка плашкой; «щадящий», только если по щадящим порогам отметка выше обычной. Пока работа не полная, вместо отметки её состояние.
function MarkCell({ r, wasAbsent, parts, gentleRule }: { r: Result; wasAbsent: boolean; parts: number; gentleRule: string }) {
  return (
    <td className="mon-sheet__mark">
      {r.mark ? <span className={`mon-mark mon-mark--${MARKS.includes(r.mark) ? r.mark : 'other'}`} title={r.gentle_used ? `Отметка по щадящим порогам: ${gentleRule}` : r.state}>{r.mark}</span>
        : <span className={`mon-sheet__state${wasAbsent ? ' is-absent' : ''}`} title={r.state}>{r.complete ? 'нет отметки' : wasAbsent ? (parts > 1 ? r.state : 'отсутствовал') : `не внесено: ${r.missing}`}</span>}
      {r.gentle_used ? <span className="mon-sheet__pct-mode">щадящий</span> : null}
    </td>
  );
}

function BackLink({ base }: { base: string }) {
  return <p className="mon-back"><Link className="mon-link mon-link--muted" to={base}>← Все работы</Link></p>;
}
