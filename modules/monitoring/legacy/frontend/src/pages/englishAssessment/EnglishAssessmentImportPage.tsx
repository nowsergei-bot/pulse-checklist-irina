import { useEffect, useState } from 'react';
import { eaImportBatches, eaImportCommit, eaImportPreview } from '../../api/englishAssessment';
import { parseEnglishContingentWorkbook } from '../../lib/englishAssessment/parseWorkbook';
import type { EaImportPreview } from '../../lib/englishAssessment/types';

type Batch = {
  id: number;
  filename: string;
  author_email: string | null;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  created_at: string;
};

export default function EnglishAssessmentImportPage() {
  const [filename, setFilename] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [preview, setPreview] = useState<EaImportPreview | null>(null);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);

  function reloadBatches() {
    void eaImportBatches()
      .then((data) => setBatches(data.batches || []))
      .catch(() => setBatches([]));
  }

  useEffect(() => {
    reloadBatches();
  }, []);

  async function onFile(file: File) {
    setError(null);
    setMessage(null);
    setConfirmLarge(false);
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parseEnglishContingentWorkbook(buf);
      setFilename(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const result = await eaImportPreview({
        filename: file.name,
        headers: parsed.headers,
        rows: parsed.rows,
      });
      setPreview(result.preview || null);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!headers.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await eaImportCommit({
        filename,
        headers,
        rows,
        confirm_large_classes: confirmLarge,
      });
      setMessage(
        `Сохранено. Создано ${result.created || 0}, обновлено ${result.updated || 0}, пропущено ${result.skipped || 0}.`,
      );
      reloadBatches();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="ea-lead">
        Ожидаемые колонки: №, КЛАСС, ФИО, ДАТА Р., ПОЛ. Повторный импорт обновляет найденных учащихся и не удаляет
        существующих. Персональные данные не уходят в ИИ.
      </p>
      <label className="ea-file">
        Файл .xlsx
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </label>

      {preview ? (
        <div className="ea-panel" style={{ marginTop: '1rem' }}>
          <p>
            Строк: {preview.summary.total}. С ошибками: {preview.summary.error_rows}. Классов:{' '}
            {preview.summary.classes}.
          </p>
          {preview.missing_headers.length ? (
            <p className="ea-err">Нет колонок: {preview.missing_headers.join(', ')}</p>
          ) : null}
          {preview.summary.large_classes.length ? (
            <div className="ea-warn">
              Крупные классы: {preview.summary.large_classes.map((c) => `${c.code} (${c.count})`).join(', ')}.
              {preview.summary.needs_large_class_confirm ? (
                <label style={{ display: 'block', marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={confirmLarge}
                    onChange={(e) => setConfirmLarge(e.target.checked)}
                  />{' '}
                  Подтверждаю аномально большие классы
                </label>
              ) : null}
            </div>
          ) : null}
          {preview.errors.length ? (
            <table className="ea-table">
              <thead>
                <tr>
                  <th>Строка</th>
                  <th>Ошибка</th>
                </tr>
              </thead>
              <tbody>
                {preview.errors.slice(0, 40).map((err) => (
                  <tr key={`${err.row_no}-${err.code}`}>
                    <td>{err.row_no}</td>
                    <td className="ea-err">{err.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ea-note">Критических ошибок нет. Можно сохранять.</p>
          )}
          <div className="ea-actions">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void commit()}>
              {busy ? 'Сохранение…' : 'Сохранить в базу'}
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p>{message}</p> : null}
      {error ? <p className="ea-err">{error}</p> : null}

      {batches.length ? (
        <div className="ea-panel" style={{ marginTop: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem' }}>Журнал импорта</h2>
          <table className="ea-table">
            <thead>
              <tr>
                <th>Файл</th>
                <th>Автор</th>
                <th>Созд.</th>
                <th>Обн.</th>
                <th>Проп.</th>
                <th>Ошибки</th>
                <th>Когда</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.filename}</td>
                  <td>{b.author_email || '—'}</td>
                  <td>{b.created_count}</td>
                  <td>{b.updated_count}</td>
                  <td>{b.skipped_count}</td>
                  <td>{b.error_count}</td>
                  <td>{new Date(b.created_at).toLocaleString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
