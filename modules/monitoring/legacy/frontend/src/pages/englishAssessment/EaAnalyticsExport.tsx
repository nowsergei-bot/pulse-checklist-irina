import { useState } from 'react';
import {
  collectAnalyticsExportRows,
  downloadAnalyticsDocx,
  downloadAnalyticsXlsx,
  studentsFromAnalyticsDash,
  type AnalyticsExportStudentRow,
} from '../../lib/englishAssessment/analyticsExport';
import type { EaDashboard, EaDashboardStudent } from '../../lib/englishAssessment/types';

export function EaAnalyticsExportButtons({
  dash,
  allowedGroupIds,
  scopeLabel,
  loadStudents,
}: {
  dash: EaDashboard | null;
  allowedGroupIds?: Array<string | number> | null;
  scopeLabel: string;
  loadStudents?: () => Promise<EaDashboardStudent[]>;
}) {
  const [busy, setBusy] = useState<'xlsx' | 'docx' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rows(): Promise<AnalyticsExportStudentRow[]> {
    let students = studentsFromAnalyticsDash(dash, allowedGroupIds);
    if (!students.length && loadStudents) {
      students = await loadStudents();
    }
    const list = collectAnalyticsExportRows(students, allowedGroupIds);
    if (!list.length) throw new Error('В выбранной параллели нет списков учащихся с баллами.');
    return list;
  }

  async function run(kind: 'xlsx' | 'docx') {
    setBusy(kind);
    setError(null);
    try {
      const list = await rows();
      if (kind === 'xlsx') await downloadAnalyticsXlsx(list, scopeLabel);
      else await downloadAnalyticsDocx(list, scopeLabel);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ea-export">
      <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void run('xlsx')}>
        {busy === 'xlsx' ? 'Excel…' : 'Скачать Excel'}
      </button>
      <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void run('docx')}>
        {busy === 'docx' ? 'Word…' : 'Скачать Word'}
      </button>
      {error ? <span className="ea-err">{error}</span> : null}
    </div>
  );
}
