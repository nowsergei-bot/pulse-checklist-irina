import type { VisitReportSnapshot } from '../../api/visitReportDelivery';
import names from '../../pages/visitChecklistV3/names.json';

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object' && 'numerator' in value && 'denominator' in value) {
    const exact = value as { numerator: string | number; denominator: string | number };
    return `${exact.numerator}/${exact.denominator}`;
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
const statuses: Record<string,string> = { scored:'Балл',descriptive:'Без балла',not_applicable:'Не применимо',
  missing_answer:'Не оценено: нет ответа',insufficient_evidence:'Не оценено: недостаточно сведений',
  contradiction:'Не оценено: противоречие',scale_not_configured:'Ошибка конфигурации шкалы',missing_assessment:'Не оценено' };
const metadataLabels: Record<string,string> = {date:'Дата урока',teacher_label:'Учитель',department:'Кафедра',
  class_name:'Класс',subject:'Предмет',topic:'Тема',adjustment:'Корректировка за кабинет',adjustment_reason:'Основание корректировки'};

export default function VisitReportView({ report }: { report: VisitReportSnapshot }) {
  const snapshot = report.snapshot;
  return <article aria-label="Отчёт о посещении урока">
    <h2>Урок</h2>
    <p>Получатель: {snapshot.recipient_name}</p>
    <dl>{Object.entries(snapshot.lesson).filter(([key])=>metadataLabels[key]).map(([key,value]) => <div key={key}><dt>{metadataLabels[key]}</dt><dd>{text(value)}</dd></div>)}</dl>
    <p><strong>{snapshot.result.complete
      ? `${snapshot.result.display ?? text(snapshot.result.final)} из ${snapshot.result.maximum}`
      : snapshot.result.status || 'Итог не сформирован'}</strong></p>
    {snapshot.checklists.map(record => <section key={`${record.checklist.checklist_id}-${record.checklist.revision}`}>
      <h3>{record.author || record.checklist.checklist_id} · {record.checklist.source === 'self_analysis' ? 'Самоанализ' : 'Наблюдение'}</h3>
      <p>Редакция {record.checklist.revision} · {record.checklist.form_version}</p>
      {record.result ? <p>{record.result.value == null ? record.result.status : `${record.result.display} из ${record.result.maximum}`}</p> : null}
      <h4>Все 30 пунктов чек-листа</h4>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Пункт</th><th>Исходный ответ</th><th>Балл</th><th>Статус</th><th>Основание</th></tr></thead>
        <tbody>{Object.entries(record.checklist.answers).map(([code,answer]) => {
          const result = record.results.find(item => item.code === code);
          const labels: Record<string,string> = {...names.scored_criteria,...names.descriptive_criteria};
          return <tr key={code}><th>{code} {labels[code]}</th><td style={{whiteSpace:'pre-wrap'}}>{answer.selected_options.map(option => option.label).join('; ')}{answer.text ? <p>{answer.text}</p> : null}</td>
            <td>{result?.score == null ? '—' : `${result.score} из ${result.max_score}`}</td>
            <td>{statuses[result?.status ?? 'missing_assessment'] ?? result?.status}</td><td>{result?.reason || ''}</td></tr>;
        })}</tbody></table></div>
    </section>)}
    <h3>Критерии, требующие внимания</h3>
    {snapshot.attention.length ? <ul>{snapshot.attention.map(item => <li key={item.code}>{item.code} {item.title || item.label} {item.display ? `${item.display} из ${item.maximum}` : ''} {item.reason}</li>)}</ul> : <p>Нет отмеченных критериев.</p>}
    {snapshot.manager_comment ? <><h3>Комментарий руководителя</h3><p style={{whiteSpace:'pre-wrap'}}>{snapshot.manager_comment}</p></> : null}
    <details><summary>Версия отчёта</summary><p>Урок: {text(snapshot.lesson.id)} · Учитель: {snapshot.teacher_user_id}</p><p>{report.snapshot_id} · {snapshot.aggregation_version}</p><p>{snapshot.assessment_ids.join(', ')}</p></details>
  </article>;
}
