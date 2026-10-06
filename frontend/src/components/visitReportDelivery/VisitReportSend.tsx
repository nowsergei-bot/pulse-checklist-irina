import { useEffect, useRef, useState } from 'react';
import { previewVisitReport, sendVisitReport, visitReportStatus, type VisitReportSnapshot } from '../../api/visitReportDelivery';
import VisitReportView from './VisitReportView';

export default function VisitReportSend({ lessonId, aggregationVersion }: { lessonId: string; aggregationVersion: string }) {
  const [comment,setComment] = useState('');
  const [preview,setPreview] = useState<VisitReportSnapshot | null>(null);
  const [status,setStatus] = useState('Не отправлено');
  const [sentMeta,setSentMeta] = useState('');
  const [isUpdate,setIsUpdate] = useState(false);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const requestKey = useRef('');
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1; const token = generation.current;
    setPreview(null); setError(''); setStatus('Загрузка…'); setBusy(false); setSentMeta(''); setIsUpdate(false);
    void visitReportStatus(lessonId).then(result => { if (token === generation.current) {
      setStatus(result.status); setIsUpdate(result.status === 'Есть обновление');
      setError(result.error || '');
      setSentMeta([result.sent_at,result.sender_name].filter(Boolean).join(' · '));
    } })
      .catch(e => { if (token === generation.current) { setError(e.message); setStatus('Ошибка загрузки'); } });
  },[lessonId,aggregationVersion]);
  async function buildPreview() {
    const token = generation.current; setBusy(true); setError('');
    try {
      const next = await previewVisitReport(lessonId,comment);
      if (token !== generation.current) return;
      setPreview(next); requestKey.current = crypto.randomUUID();
    } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : 'Ошибка предпросмотра'); }
    finally { if (token === generation.current) setBusy(false); }
  }
  async function send() {
    if (!preview) return;
    const token = generation.current; setBusy(true); setStatus('Отправляется'); setError('');
    try {
      const report = await sendVisitReport(preview.snapshot_id,requestKey.current);
      if (token === generation.current) { setStatus(report.opened_at ? 'Открыто учителем' : 'Отправлено'); setSentMeta(report.sent_at || ''); setPreview(null); }
    } catch (e) {
      if (token === generation.current) { setStatus('Ошибка отправки'); setError(e instanceof Error ? e.message : 'Ошибка отправки'); }
    } finally { if (token === generation.current) setBusy(false); }
  }
  return <section aria-label="Отправка отчёта">
    <p role="status">{status}</p>
    {sentMeta ? <p>{sentMeta}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <label>Комментарий руководителя<textarea value={comment} disabled={busy} onChange={event => { setComment(event.target.value); setPreview(null); }} /></label>
    <button type="button" disabled={busy} onClick={() => void buildPreview()}>Предпросмотр отчёта</button>
    {preview ? <><VisitReportView report={preview} /><button type="button" disabled={busy} onClick={() => void send()}>{isUpdate ? 'Отправить обновление' : 'Отправить'}</button></> : null}
  </section>;
}
