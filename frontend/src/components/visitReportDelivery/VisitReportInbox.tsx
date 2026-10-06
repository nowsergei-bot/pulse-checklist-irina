import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMyVisitReport,listMyVisitReports,markMyVisitReportOpened,type VisitReportListItem,type VisitReportSnapshot } from '../../api/visitReportDelivery';
import VisitReportView from './VisitReportView';

export default function VisitReportInbox() {
  const [params,setParams] = useSearchParams();
  const id = params.get('report');
  const [reports,setReports] = useState<VisitReportListItem[] | null>(null);
  const [selected,setSelected] = useState<VisitReportSnapshot | null>(null);
  const [error,setError] = useState('');
  useEffect(() => { let cancelled = false;
    void listMyVisitReports().then(data => { if (!cancelled) setReports(data.reports); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  },[]);
  useEffect(() => { let cancelled = false; setSelected(null); setError('');
    if (id) void getMyVisitReport(id).then(report => { if (!cancelled) setSelected(report); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  },[id]);
  // Mark only after the immutable report has been successfully loaded and rendered.
  useEffect(() => { if (!selected || selected.opened_at) return; let cancelled = false;
    void markMyVisitReportOpened(selected.snapshot_id).then(report => {
      if (!cancelled) { setSelected(report); setReports(rows => rows?.map(row => row.snapshot_id === report.snapshot_id ? {...row,opened_at:report.opened_at} : row) ?? null); }
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  },[selected]);
  return <section><h2>Результаты посещений</h2>
    {error ? <p role="alert">{error}</p> : null}
    {reports === null && !error ? <p role="status">Загрузка отчётов…</p> : null}
    {reports?.length === 0 ? <p>Пока нет отправленных отчётов.</p> : null}
    <ul>{reports?.map(report => <li key={report.snapshot_id}>
      <button type="button" onClick={() => { const next = new URLSearchParams(params); next.set('report',report.snapshot_id); setParams(next); }}>
        {String(report.lesson.date || '')} · {String(report.lesson.subject || '')} · версия {report.version}{report.historical ? ' · История' : ''}
      </button> · {report.sent_at} · {report.sender_name} · {report.opened_at ? 'Открыто учителем' : 'Отправлено'}
    </li>)}</ul>
    {selected ? <VisitReportView report={selected} /> : id && !error ? <p role="status">Загрузка отчёта…</p> : null}
  </section>;
}
