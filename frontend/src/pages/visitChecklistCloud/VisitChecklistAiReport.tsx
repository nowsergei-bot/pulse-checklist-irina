import { type VisitChecklistSchoolAiReport, type VisitChecklistTeacherAiReport } from '../../api/visitChecklist';
import { PDF_CARD_KEEP_TOGETHER_CLASS } from '../../lib/pdf/captureElementToPdfA4';

function ListBlock({ title, items }: { title: string; items?: string[] | null }) {
  const rows = (items || []).map((row) => String(row || '').trim()).filter(Boolean);
  if (!rows.length) return null;
  return (
    <div className="vcd-ai-report__block">
      <h3>{title}</h3>
      <ul>
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </div>
  );
}

export function teacherAiReportCopyText(
  report: VisitChecklistTeacherAiReport | null | undefined,
  narrative?: string | null,
): string {
  if (narrative && narrative.trim()) return narrative.trim();
  if (!report) return '';
  const parts = [
    report.title || 'Методическая справка',
    report.basis,
    report.summary,
    ...(report.strengths || []).map((row) => [row.title, row.evidence, row.meaning].filter(Boolean).join(' — ')),
    ...(report.patterns || []),
    ...(report.growthAreas || []).map((row) =>
      [row.title, row.evidence, row.whyItMatters, row.recommendation].filter(Boolean).join(' — '),
    ),
    ...(report.nextLessonActions || []),
    report.dynamics,
    ...(report.reflectionQuestions || []),
    ...(report.nextObservationFocus || []),
    report.conclusion,
    report.limitations,
  ].filter((row) => String(row || '').trim());
  return parts.join('\n\n');
}

export function schoolAiReportCopyText(
  report: VisitChecklistSchoolAiReport | null | undefined,
  narrative?: string | null,
): string {
  if (narrative && narrative.trim()) return narrative.trim();
  if (!report) return '';
  return [
    report.coverageAssessment,
    report.executiveSummary,
    ...(report.strengths || []).map((row) => row.title || ''),
    ...(report.growthAreas || []).map((row) => row.title || ''),
    ...(report.recommendations || []).map((row) => row.action || ''),
    report.observerWarning,
  ]
    .filter((row) => String(row || '').trim())
    .join('\n\n');
}

export function VisitChecklistTeacherAiReportView({
  report,
  greeting,
}: {
  report: VisitChecklistTeacherAiReport;
  greeting?: string | null;
}) {
  const name = String(greeting || '').trim();
  return (
    <section className={`vcd-ai-report ${PDF_CARD_KEEP_TOGETHER_CLASS}`} aria-label="Методическая справка учителю">
      <h2>{report.title || 'Методическая справка'}</h2>
      {name ? <p className="vcd-ai-report__lead">{name}, ниже — методическая справка по посещениям уроков.</p> : null}
      {report.basis ? (
        <div className="vcd-ai-report__block">
          <h3>Основание анализа</h3>
          <p>{report.basis}</p>
        </div>
      ) : null}
      {report.summary ? (
        <div className="vcd-ai-report__block">
          <h3>Общая картина</h3>
          <p>{report.summary}</p>
        </div>
      ) : null}
      {(report.strengths || []).length ? (
        <div className="vcd-ai-report__block">
          <h3>Ваши сильные практики</h3>
          <ul>
            {(report.strengths || []).map((row) => (
              <li key={row.title || row.evidence}>
                <strong>{row.title}</strong>
                {row.evidence ? <span> — {row.evidence}</span> : null}
                {row.meaning ? <span> {row.meaning}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ListBlock title="Повторяющиеся особенности уроков" items={report.patterns} />
      {(report.growthAreas || []).length ? (
        <div className="vcd-ai-report__block">
          <h3>Точки профессионального роста</h3>
          <ul>
            {(report.growthAreas || []).map((row) => (
              <li key={row.title || row.evidence}>
                <strong>{row.title}</strong>
                {row.evidence ? <span> — {row.evidence}</span> : null}
                {row.whyItMatters ? <p>Зачем: {row.whyItMatters}</p> : null}
                {row.recommendation ? <p>Что изменить: {row.recommendation}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ListBlock title="Что можно попробовать уже на ближайших уроках" items={report.nextLessonActions} />
      {report.dynamics ? (
        <div className="vcd-ai-report__block">
          <h3>Динамика</h3>
          <p>{report.dynamics}</p>
        </div>
      ) : null}
      <ListBlock title="Вопросы для самоанализа" items={report.reflectionQuestions} />
      <ListBlock title="Методический фокус на следующий цикл наблюдений" items={report.nextObservationFocus} />
      {report.conclusion ? (
        <div className="vcd-ai-report__block">
          <h3>Итог</h3>
          <p>{report.conclusion}</p>
        </div>
      ) : null}
      {report.limitations ? <p className="muted vcd-ai-report__limit">{report.limitations}</p> : null}
    </section>
  );
}

export function VisitChecklistSchoolAiReportView({ report }: { report: VisitChecklistSchoolAiReport }) {
  return (
    <section className={`vcd-ai-report ${PDF_CARD_KEEP_TOGETHER_CLASS}`} aria-label="Аналитическая справка по школе">
      <h2>Аналитическая справка по посещению уроков</h2>
      {report.observerWarning ? <p className="vcd-ai-report__warn">{report.observerWarning}</p> : null}
      {report.coverageAssessment ? (
        <div className="vcd-ai-report__block">
          <h3>1. Масштаб анализа</h3>
          <p>{report.coverageAssessment}</p>
        </div>
      ) : null}
      {(report.strengths || []).length ? (
        <div className="vcd-ai-report__block">
          <h3>2. Что в школе является устойчиво сильной практикой</h3>
          <ul>
            {(report.strengths || []).map((row) => (
              <li key={row.title || row.evidence}>
                <strong>{row.title}</strong>
                {row.evidence ? <span> — {row.evidence}</span> : null}
                {row.meaning ? <span> {row.meaning}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(report.growthAreas || []).length ? (
        <div className="vcd-ai-report__block">
          <h3>3. Основные точки внимания</h3>
          <ul>
            {(report.growthAreas || []).map((row) => (
              <li key={row.title || row.evidence}>
                <strong>{row.title}</strong>
                {row.kind ? <span> ({row.kind})</span> : null}
                {row.evidence ? <span> — {row.evidence}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ListBlock title="4. Динамика" items={report.trends} />
      {(report.departments || []).length ? (
        <div className="vcd-ai-report__block">
          <h3>5. Кафедры / направления</h3>
          <ul>
            {(report.departments || []).map((row) => (
              <li key={row.name}>
                <strong>{row.name}</strong>
                {row.strengths ? <span> — {row.strengths}</span> : null}
                {row.requests ? <span> {row.requests}</span> : null}
                {row.exchange ? <span> {row.exchange}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(report.methodicalPriorities || []).length ? (
        <div className="vcd-ai-report__block">
          <h3>6. Матрица методических приоритетов</h3>
          <ul>
            {(report.methodicalPriorities || []).map((row) => (
              <li key={`${row.band}-${row.title}`}>
                {row.band ? <strong>{row.band}. </strong> : null}
                {row.title}
                {row.evidence ? <span> — {row.evidence}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(report.recommendations || []).length ? (
        <div className="vcd-ai-report__block">
          <h3>7. Рекомендации методической службе</h3>
          <ul>
            {(report.recommendations || []).map((row) => (
              <li key={row.action}>
                {row.action}
                {row.dataReason ? <span className="muted"> — {row.dataReason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ListBlock title="8. Что проверить в следующем цикле наблюдений" items={report.nextCycleQuestions} />
      <ListBlock title="9. Качество мониторинга" items={report.dataQuality} />
      {report.executiveSummary ? (
        <div className="vcd-ai-report__block">
          <h3>10. Резюме для руководителя</h3>
          <p>{report.executiveSummary}</p>
        </div>
      ) : null}
      {(report.limitations || []).length ? (
        <p className="muted vcd-ai-report__limit">{(report.limitations || []).join(' ')}</p>
      ) : null}
    </section>
  );
}
