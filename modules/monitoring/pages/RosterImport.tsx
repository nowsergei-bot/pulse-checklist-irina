import { useRef, useState } from 'react';
import { api, useApi } from './api';
import Dialog from './Dialog';
import { readRosterFile, type RosterRow, type TeacherRow } from './rosterFile';
import { TeacherPreview, type TeacherReport } from './GroupTeachers';

type GroupStat = { group_id: number; title: string; parallel: number | null; rows: number; matched: number; stay: number; moved: number; added: number; not_found: number; ambiguous: number; leaving: number };
type Report = {
  token: string;
  summary: {
    rows: number; groups_in_file: number; groups_found: number; groups_applied: number; matched: number; by_full_name: number; by_short_name: number;
    stay: number; moved: number; added: number; not_found: number; ambiguous: number; duplicates: number; leaving: number; unknown_group_rows: number;
  };
  groups: GroupStat[];
  unknown_groups: { group: string; rows: number }[];
  untouched_groups: string[];
  not_found: { name: string; group: string; cls: string }[];
  ambiguous: { name: string; group: string; cls: string; candidates: { full_name: string; groups: string[] }[] }[];
  moves: { name: string; full_name: string; from: string[]; to: string; how: 'full' | 'short' }[];
  leaving: { full_name: string; group: string; to: string[] }[];
  two_groups: { full_name: string; groups: string[] }[];
  short_matches: { name: string; full_name: string; group: string }[];
  duplicates: { name: string; group: string; full_name: string }[];
};
type Imports = { imports: { id: number; active: boolean; groups_count: number; students_count: number; created_by_name: string; created_at: string; cancelled_by_name: string | null; cancelled_at: string | null }[] };

function when(stamp: string) {
  const d = new Date(stamp);
  return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

function Fact({ value, label, tone }: { value: number; label: string; tone?: 'ok' | 'warn' | 'err' }) {
  return (
    <div className={`mon-imp__fact${tone ? ` mon-imp__fact--${tone}` : ''}`}>
      <span className="mon-imp__num">{value}</span>
      <span className="mon-imp__label">{label}</span>
    </div>
  );
}

function List<T>({ title, items, head, row, open }: { title: string; items: T[]; head: string[]; row: (item: T) => (string | JSX.Element)[]; open?: boolean }) {
  if (!items.length) return null;
  return (
    <details className="mon-imp__list" open={open}>
      <summary>{title} ({items.length})</summary>
      <table className="mon-table">
        <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{items.map((item, i) => <tr key={i}>{row(item).map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}

// Загрузка составов групп из Excel: пробный прогон без записи, затем применение после подтверждения.
// Из того же файла отдельным прогоном читаются учителя групп (столбец «Учитель»).
export default function RosterImport({ onApplied, onTeachersApplied }: { onApplied: () => void; onTeachersApplied: () => void }) {
  const { data: status, reload } = useApi<Imports>('/rosters/import');
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<'apply' | 'cancel' | null>(null);
  const [teacherRows, setTeacherRows] = useState<TeacherRow[] | null>(null);
  const [teacherReport, setTeacherReport] = useState<TeacherReport | null>(null);
  const [teacherNote, setTeacherNote] = useState('');

  const active = status?.imports.find(i => i.active) || null;

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(''); setMessage(''); setReport(null); setRows(null); setTeacherReport(null); setTeacherRows(null); setTeacherNote('');
    try {
      const { rows: read, teachers } = await readRosterFile(file);
      setFileName(file.name);
      setRows(read);
      setReport(await api<Report>('/rosters/import/preview', { method: 'POST', body: { rows: read } }));
      if (teachers.length) {
        setTeacherRows(teachers);
        setTeacherReport(await api<TeacherReport>('/rosters/teachers/preview', { method: 'POST', body: { rows: teachers } }));
      } else setTeacherNote('В файле нет столбца «Учитель» или он пуст: учителя групп не меняются.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function apply() {
    if (!rows || !report) return;
    setBusy(true); setError('');
    try {
      const r = await api<{ groups: number; students: number }>('/rosters/import/apply', { method: 'POST', body: { rows, token: report.token } });
      setMessage(`Составы из файла применены: групп ${r.groups}, учеников ${r.students}`);
      setReport(null); setRows(null);
      reload(); onApplied();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); setConfirm(null); }
  }

  async function backToPulse() {
    setBusy(true); setError('');
    try {
      await api('/rosters/import/cancel', { method: 'POST', body: {} });
      setMessage('Составы снова из Пульса. Поправки по ученикам остались.');
      reload(); onApplied();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); setConfirm(null); }
  }

  const s = report?.summary;
  return (
    <section className="mon-imp">
      <div className="mon-imp__head">
        <div>
          <h3 className="mon-imp__title">Составы групп из файла</h3>
          <p className="mon-note">
            {active
              ? `Действует загрузка от ${when(active.created_at)}, ${active.created_by_name || 'автор не определён'}: групп ${active.groups_count}, учеников ${active.students_count}. Остальные группы как в Пульсе.`
              : 'Загрузок нет: все составы как в Пульсе.'}
          </p>
        </div>
        <div className="mon-imp__actions">
          <input ref={input} type="file" accept=".xlsx" hidden onChange={e => pick(e.target.files?.[0])} />
          <button type="button" className="mon-btn mon-btn--ghost" disabled={busy} onClick={() => input.current?.click()}>Загрузить файл Excel</button>
          {active ? <button type="button" className="mon-link mon-link--muted" disabled={busy} onClick={() => setConfirm('cancel')}>Вернуть составы из Пульса</button> : null}
        </div>
      </div>
      {busy && !report ? <p className="mon-note">Читаем файл и сопоставляем учеников и учителей…</p> : null}
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {message ? <p className="mon-alert mon-alert--ok" role="status">{message}</p> : null}

      {report && s ? (
        <div className="mon-imp__report">
          <p className="mon-imp__kicker">Пробный прогон · {fileName} · ничего не записано</p>
          <div className="mon-imp__facts">
            <Fact value={s.rows} label="учеников в файле" />
            <Fact value={s.matched} label={`сопоставлено: по полному ФИО ${s.by_full_name}, по фамилии и имени ${s.by_short_name}`} tone="ok" />
            <Fact value={s.stay} label="остаются в своей группе" />
            <Fact value={s.moved} label="переходят из другой группы" tone={s.moved ? 'warn' : undefined} />
            <Fact value={s.added} label="без текущей группы в Пульсе" tone={s.added ? 'warn' : undefined} />
            <Fact value={s.leaving} label="уходят из группы: есть в Пульсе, нет в файле" tone={s.leaving ? 'warn' : undefined} />
            <Fact value={s.not_found} label="не найдены в Пульсе" tone={s.not_found ? 'err' : undefined} />
            <Fact value={s.ambiguous} label="найдено несколько" tone={s.ambiguous ? 'err' : undefined} />
            {s.unknown_group_rows ? <Fact value={s.unknown_group_rows} label="строк с группой, которой нет в Пульсе" tone="err" /> : null}
          </div>

          <table className="mon-table mon-imp__groups">
            <thead>
              <tr><th>Группа</th>{['В файле', 'Сопоставлено', 'Остаются', 'Из других групп', 'Без группы', 'Уходят', 'Не найдены', 'Несколько'].map(h => <th key={h} className="mon-num">{h}</th>)}</tr>
            </thead>
            <tbody>
              {report.groups.map(g => (
                <tr key={g.group_id} className={g.matched ? undefined : 'is-skipped'}>
                  <td>{g.title}{g.matched ? '' : <span className="mon-rost__from">не применяется: никто не сопоставлен</span>}</td>
                  <td className="mon-num">{g.rows}</td>
                  <td className="mon-num">{g.matched}</td>
                  <td className="mon-num">{g.stay}</td>
                  <td className="mon-num">{g.moved || ''}</td>
                  <td className="mon-num">{g.added || ''}</td>
                  <td className="mon-num">{g.leaving || ''}</td>
                  <td className={`mon-num${g.not_found ? ' mon-imp__bad' : ''}`}>{g.not_found || ''}</td>
                  <td className={`mon-num${g.ambiguous ? ' mon-imp__bad' : ''}`}>{g.ambiguous || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <List title="Не найдены в Пульсе" open items={report.not_found} head={['ФИО в файле', 'Группа', 'Класс']} row={r => [r.name, r.group, r.cls]} />
          <List title="Найдено несколько" open items={report.ambiguous} head={['ФИО в файле', 'Группа', 'Кандидаты в Пульсе']}
            row={r => [r.name, r.group, <>{r.candidates.map((c, i) => <span key={i} className="mon-imp__cand">{c.full_name}{c.groups.length ? ` · ${c.groups.join(', ')}` : ' · нет текущей группы'}</span>)}</>]} />
          <List title="Приходят в группу из другой группы или без группы" items={report.moves} head={['Ученик', 'Сейчас в Пульсе', 'По файлу']}
            row={r => [<>{r.full_name}{r.how === 'short' ? <span className="mon-rost__from">в файле: {r.name}</span> : null}</>, r.from.length ? r.from.join(', ') : 'нет текущей группы', r.to]} />
          <List title="Уходят из группы" items={report.leaving} head={['Ученик', 'Группа', 'По файлу']}
            row={r => [r.full_name, r.group, r.to.length ? r.to.join(', ') : 'нет в файле']} />
          <List title="Сопоставлены по фамилии и имени" items={report.short_matches} head={['ФИО в файле', 'ФИО в Пульсе', 'Группа']} row={r => [r.name, r.full_name, r.group]} />
          <List title="В двух группах по файлу" items={report.two_groups} head={['Ученик', 'Группы']} row={r => [r.full_name, r.groups.join(', ')]} />
          <List title="Повторы в файле" items={report.duplicates} head={['ФИО в файле', 'Группа', 'ФИО в Пульсе']} row={r => [r.name, r.group, r.full_name]} />
          <List title="Группы из файла, которых нет в Пульсе" open items={report.unknown_groups} head={['Группа в файле', 'Строк']} row={r => [r.group, String(r.rows)]} />
          {report.untouched_groups.length ? (
            <p className="mon-note">Остаются как в Пульсе ({report.untouched_groups.length}): {report.untouched_groups.join(', ')}.</p>
          ) : null}

          <div className="mon-imp__apply">
            <button type="button" className="mon-btn mon-btn--primary" disabled={busy || !s.matched} onClick={() => setConfirm('apply')}>Применить составы из файла</button>
            <button type="button" className="mon-btn" disabled={busy} onClick={() => { setReport(null); setRows(null); }}>Отменить</button>
            <span className="mon-note">Не найденные и неоднозначные ученики не попадут в группы. Их можно добавить вручную.</span>
          </div>
        </div>
      ) : null}

      {teacherReport && teacherRows ? (
        <TeacherPreview rows={teacherRows} report={teacherReport} fileName={fileName}
          onApplied={text => { setMessage(text); setTeacherReport(null); setTeacherRows(null); onTeachersApplied(); }}
          onClose={() => { setTeacherReport(null); setTeacherRows(null); }} />
      ) : null}
      {teacherNote ? <p className="mon-note">{teacherNote}</p> : null}

      {confirm === 'apply' && s ? (
        <Dialog title="Применить составы из файла?" confirmLabel="Применить" busy={busy} onConfirm={apply} onCancel={() => setConfirm(null)}>
          <p>Групп: {s.groups_applied}, учеников: {s.matched}. В этих группах состав в модуле станет как в файле, на все работы текущего учебного года.</p>
          <p>Остальные группы остаются как в Пульсе. Баллы, уже внесённые в группе, останутся за ней. В самом Пульсе составы не меняются.</p>
          {active ? <p>Предыдущая загрузка будет заменена.</p> : null}
        </Dialog>
      ) : null}
      {confirm === 'cancel' ? (
        <Dialog title="Вернуть составы из Пульса?" confirmLabel="Вернуть" busy={busy} onConfirm={backToPulse} onCancel={() => setConfirm(null)}>
          <p>Загрузка из файла перестанет действовать, составы всех групп снова будут как в Пульсе. Поправки по отдельным ученикам останутся. Баллы не меняются.</p>
        </Dialog>
      ) : null}
    </section>
  );
}
