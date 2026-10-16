import { useRef, useState } from 'react';
import { api, useApi } from './api';
import Dialog from './Dialog';
import { readSpecFile, type SpecFile } from './specFile';

type Type = { id: number; code: string; name: string };
type Version = { id: number; version: number; status: 'draft' | 'approved'; max_points: number; frame_name: string; tasks: number; works: number };
type Spec = { id: number; title: string; type_name: string; versions: Version[] };
type SpecsData = { types: Type[]; specs: Spec[] };
type Task = { sort?: number; row?: number; part: string; section: string; level: string; title: string; max_points: number; focus: string | null };
type Preview = {
  spec_title: string; class_hint: string | null; dates: { writing: string | null; test: string | null };
  tasks: Task[]; max_points: number; errors: string[];
  frame: { id: number; name: string } | null; matched: boolean; diffs: string[]; suggested_frame_name: string;
};

export const LEVEL_NAMES: Record<string, string> = { basic: 'Базовый', advanced: 'Повышенный' };

function formatDate(value: string | null) {
  if (!value) return '';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function TasksTable({ tasks, total }: { tasks: Task[]; total?: number }) {
  return (
    <table className="mon-table mon-tasks">
      <thead>
        <tr><th>№</th><th>Часть</th><th>Раздел</th><th>Уровень</th><th>Задание</th><th className="mon-num">Баллы</th><th>Фокус</th></tr>
      </thead>
      <tbody>
        {tasks.map((t, i) => (
          <tr key={i}>
            <td className="mon-muted">{i + 1}</td><td>{t.part}</td><td>{t.section}</td><td>{LEVEL_NAMES[t.level] || t.level}</td>
            <td>{t.title}</td><td className="mon-num">{t.max_points}</td><td className="mon-muted">{t.focus || ''}</td>
          </tr>
        ))}
      </tbody>
      {total !== undefined ? (
        <tfoot><tr><td colSpan={5}>Итого</td><td className="mon-num">{total}</td><td /></tr></tfoot>
      ) : null}
    </table>
  );
}

function Upload({ types, onSaved, onClose }: { types: Type[]; onSaved: (text: string) => void; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [typeId, setTypeId] = useState(types.find(t => t.code === 'module')?.id || types[0]?.id);
  const [file, setFile] = useState<SpecFile | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [frameName, setFrameName] = useState('');
  const [askFrame, setAskFrame] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function check(spec: SpecFile, type = typeId) {
    const p = await api<Preview>('/specs/preview', { method: 'POST', body: { type_id: type, cells: spec.cells } });
    setPreview(p);
    setFrameName(p.suggested_frame_name);
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true); setError(''); setPreview(null); setFile(null);
    try {
      const spec = await readSpecFile(f);
      setFile(spec);
      await check(spec);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function changeType(id: number) {
    setTypeId(id);
    if (!file) return;
    setBusy(true); setError('');
    try { await check(file, id); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function saveFrame() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      await api('/specs/frames', { method: 'POST', body: { type_id: typeId, cells: file.cells, name: frameName } });
      setAskFrame(false);
      await check(file);
    } catch (e) {
      setAskFrame(false);
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  async function save() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const r = await api<{ version: { version: number } }>('/specs', {
        method: 'POST',
        body: { type_id: typeId, cells: file.cells, file: { filename: file.filename, content_base64: file.content_base64 } },
      });
      onSaved(`Сохранён черновик «${preview?.spec_title}», версия ${r.version.version}. Утвердите его, чтобы создавать работы.`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  const canSave = Boolean(preview && !preview.errors.length && preview.matched);
  return (
    <section className="mon-panel">
      <div className="mon-panel__head">
        <h2 className="mon-h2">Загрузка спецификации из Excel</h2>
        <button type="button" className="mon-btn mon-btn--ghost" onClick={onClose}>Закрыть</button>
      </div>
      <div className="mon-field">
        <span className="mon-label">Вид работы</span>
        <span className="mon-segmented" role="group">
          {types.map(t => (
            <button type="button" key={t.id} className={t.id === typeId ? 'is-current' : undefined} aria-pressed={t.id === typeId} disabled={busy} onClick={() => changeType(t.id)}>{t.name}</button>
          ))}
        </span>
      </div>
      <div className="mon-field">
        <span className="mon-label">Файл по шаблону, лист «Спецификация»</span>
        <span className="mon-actions mon-actions--tight">
          <button type="button" className="mon-btn" disabled={busy} onClick={() => input.current?.click()}>Выбрать файл</button>
          <span className="mon-muted">{file ? file.filename : 'Файл не выбран'}</span>
          <input ref={input} type="file" accept=".xlsx" hidden onChange={e => pick(e.target.files?.[0])} />
        </span>
      </div>
      {busy && !preview ? <p className="mon-note">Читаем файл…</p> : null}
      {error ? <p className="mon-alert mon-alert--err" role="alert">{error}</p> : null}

      {preview ? (
        <>
          <dl className="mon-facts">
            <div><dt>Спецификация</dt><dd>{preview.spec_title || 'не указана'}</dd></div>
            <div><dt>Класс</dt><dd>{preview.class_hint || 'не указан'}</dd></div>
            <div><dt>Заданий</dt><dd>{preview.tasks.length}</dd></div>
            <div><dt>Итого баллов</dt><dd>{preview.max_points}</dd></div>
            {preview.dates.writing || preview.dates.test ? (
              <div><dt>Даты в файле</dt><dd>{[preview.dates.writing && `письмо ${formatDate(preview.dates.writing)}`, preview.dates.test && `тест ${formatDate(preview.dates.test)}`].filter(Boolean).join(', ')}</dd></div>
            ) : null}
          </dl>

          {preview.errors.length ? (
            <div className="mon-alert mon-alert--err" role="alert">
              <strong>Сохранить нельзя, исправьте файл:</strong>
              <ul>{preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          ) : null}

          {preview.matched && preview.frame ? (
            <p className="mon-alert mon-alert--ok">Схема баллов: «{preview.frame.name}», итого {preview.max_points}.</p>
          ) : null}
          {!preview.matched && preview.tasks.length ? (
            <div className="mon-alert mon-alert--warn">
              <strong>Не подходит ни одна схема баллов.</strong>
              {preview.frame ? <> Расхождения с ближайшей, «{preview.frame.name}»:</> : null}
              <ul>{preview.diffs.map((d, i) => <li key={i}>{d}</li>)}</ul>
              {!preview.errors.length ? (
                <div className="mon-actions mon-actions--tight">
                  <input className="mon-input" value={frameName} onChange={e => setFrameName(e.target.value)} aria-label="Название новой схемы" placeholder="Название новой схемы" />
                  <button type="button" className="mon-btn" disabled={busy || !frameName.trim()} onClick={() => setAskFrame(true)}>Сохранить новую схему</button>
                </div>
              ) : null}
            </div>
          ) : null}

          <TasksTable tasks={preview.tasks} total={preview.max_points} />

          <div className="mon-actions">
            <button type="button" className="mon-btn mon-btn--primary" disabled={busy || !canSave} onClick={save}>Сохранить черновик</button>
            <span className="mon-muted">{canSave ? 'Черновик можно проверить и утвердить в списке ниже.' : preview.errors.length ? 'Сначала исправьте файл.' : 'Сначала сохраните новую схему.'}</span>
          </div>
        </>
      ) : null}

      {askFrame && preview ? (
        <Dialog title={`Сохранить схему «${frameName.trim()}»?`} confirmLabel="Сохранить схему" busy={busy} onConfirm={saveFrame} onCancel={() => setAskFrame(false)}>
          <p>Итого {preview.max_points} баллов. Процент и отметка по работам с этой схемой считаются от {preview.max_points}.</p>
        </Dialog>
      ) : null}
    </section>
  );
}

export default function SpecsPage() {
  const { data, error, reload } = useApi<SpecsData>('/specs');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const tasks = useApi<{ tasks: Task[] }>(open ? `/specs/versions/${open}` : null);
  const [confirm, setConfirm] = useState<{ action: 'approve' | 'delete'; spec: Spec; version: Version } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!confirm) return;
    setBusy(true); setMessage('');
    try {
      await api(`/specs/versions/${confirm.version.id}/${confirm.action}`, { method: 'POST', body: {} });
      setMessage(confirm.action === 'approve' ? `Версия ${confirm.version.version} «${confirm.spec.title}» утверждена` : 'Черновик удалён');
      if (confirm.action === 'delete' && open === confirm.version.id) setOpen(null);
      reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally { setBusy(false); setConfirm(null); }
  }

  return (
    <div>
      <div className="mon-toolbar">
        <p className="mon-note mon-hint">Утверждённую версию изменить нельзя: правка создаёт новую версию. Работы создаются только по утверждённым версиям.</p>
        {!uploading ? <button type="button" className="mon-btn mon-btn--primary" onClick={() => { setUploading(true); setMessage(''); }}>Загрузить из Excel</button> : null}
      </div>
      {uploading && data ? <Upload types={data.types} onClose={() => setUploading(false)} onSaved={text => { setUploading(false); setMessage(text); reload(); }} /> : null}
      {message ? <p className="mon-note" role="status">{message}</p> : null}
      {error ? <p className="mon-err" role="alert">{error}</p> : null}
      {!data && !error ? <p className="mon-note">Загружаем…</p> : null}
      {data && !data.specs.length && !uploading ? <p className="mon-note">Спецификаций пока нет</p> : null}

      {data?.specs.map(spec => (
        <section key={spec.id} className="mon-card">
          <h3 className="mon-card__title">{spec.title} <span className="mon-muted">{spec.type_name}</span></h3>
          <table className="mon-table">
            <thead><tr><th>Версия</th><th>Статус</th><th>Схема баллов</th><th className="mon-num">Итого</th><th className="mon-num">Заданий</th><th className="mon-num">Работ</th><th /></tr></thead>
            <tbody>
              {spec.versions.map(v => (
                <tr key={v.id}>
                  <td>{v.version}</td>
                  <td><span className={`mon-status mon-status--${v.status}`}>{v.status === 'approved' ? 'Утверждена' : 'Черновик'}</span></td>
                  <td>{v.frame_name}</td>
                  <td className="mon-num">{v.max_points}</td>
                  <td className="mon-num">{v.tasks}</td>
                  <td className="mon-num">{v.works}</td>
                  <td><span className="mon-row-actions">
                    <button type="button" className="mon-link" onClick={() => setOpen(open === v.id ? null : v.id)}>{open === v.id ? 'Скрыть задания' : 'Задания'}</button>
                    {v.status === 'draft' ? (
                      <>
                        <button type="button" className="mon-link" onClick={() => setConfirm({ action: 'approve', spec, version: v })}>Утвердить</button>
                        <button type="button" className="mon-link mon-link--muted" onClick={() => setConfirm({ action: 'delete', spec, version: v })}>Удалить</button>
                      </>
                    ) : null}
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {spec.versions.some(v => v.id === open) ? (
            tasks.data ? <TasksTable tasks={tasks.data.tasks} total={tasks.data.tasks.reduce((s, t) => s + t.max_points, 0)} /> : <p className="mon-note">Загружаем задания…</p>
          ) : null}
        </section>
      ))}

      {confirm ? (
        <Dialog
          title={confirm.action === 'approve' ? `Утвердить версию ${confirm.version.version} «${confirm.spec.title}»?` : `Удалить черновик версии ${confirm.version.version} «${confirm.spec.title}»?`}
          confirmLabel={confirm.action === 'approve' ? 'Утвердить' : 'Удалить'}
          busy={busy}
          onConfirm={run}
          onCancel={() => setConfirm(null)}
        >
          <p>{confirm.action === 'approve' ? 'После утверждения версию нельзя изменить или удалить. По ней можно будет создавать работы.' : 'Черновик и его задания будут удалены.'}</p>
        </Dialog>
      ) : null}
    </div>
  );
}
