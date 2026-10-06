import type { VisitSectionPresence } from '../lib/lessonVisitChecklist/visitChecklistScoring';
import './VisitChecklistSectionPresence.css';

type Props = {
  sections: VisitSectionPresence[];
  /** PDF-режим: компактные красные плашки. */
  pdfMode?: boolean;
  /** Только отмеченные пункты (вид для педагога). */
  markedOnly?: boolean;
};

function truncateIndicator(text: string, maxLen: number): string {
  const t = String(text ?? '').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(1, maxLen - 1))}…`;
}

/** Бинарное наличие баллов по разделам (без числовой детализации) — для карточки педагога и PDF. */
export default function VisitChecklistSectionPresence({
  sections,
  pdfMode = false,
  markedOnly = false,
}: Props) {
  if (!sections.length) return null;

  return (
    <section
      className={`visit-checklist-section-presence${pdfMode ? ' visit-checklist-section-presence--pdf' : ''}`}
      aria-label="Наличие баллов по разделам чек-листа"
      style={{ marginTop: pdfMode ? 0 : '0.65rem' }}
    >
      {!pdfMode ? (
        <h4 className="muted" style={{ fontSize: '0.9rem', marginBottom: '0.35rem', fontWeight: 700 }}>
          {markedOnly ? 'Отмеченные пункты чек-листа' : 'Как проводятся уроки: разделы чек-листа 1–10'}
        </h4>
      ) : null}
      {!pdfMode ? (
      <p
        className="muted visit-checklist-section-presence__lead"
        style={{ fontSize: pdfMode ? '0.72rem' : '0.8rem', marginBottom: pdfMode ? '0.35rem' : '0.55rem', lineHeight: 1.4 }}
      >
        {markedOnly
          ? 'Показаны только пункты, которые были отмечены при наблюдении уроков этого педагога.'
          : 'Красная плашка — в разделе зафиксированы баллы; серая — баллы не зафиксированы. Без числовой расшифровки: только наличие или отсутствие отмеченных пунктов рубрики.'}
      </p>
      ) : null}
      <div className="visit-checklist-section-presence__list">
        {sections.map((sec) => {
          const lines = sec.checklistLines?.length
            ? sec.checklistLines
            : [
                ...sec.presentIndicators.map((text) => ({ text, marked: true })),
                ...sec.absentIndicators.map((text) => ({ text, marked: false })),
              ];

          return (
            <div key={sec.code} className="visit-checklist-section-presence__section">
              <div
                className={`visit-checklist-section-presence__header${
                  sec.hasPoints ? ' visit-checklist-section-presence__header--present' : ' visit-checklist-section-presence__header--absent'
                }`}
              >
                <div className="visit-checklist-section-presence__header-row">
                  <div className="visit-checklist-section-presence__header-code">Раздел {sec.code}</div>
                  <div className="visit-checklist-section-presence__header-status">
                    {sec.hasPoints ? 'Баллы зафиксированы' : 'Баллы не зафиксированы'}
                  </div>
                </div>
                <div className="visit-checklist-section-presence__header-title">{sec.title}</div>
              </div>
              {lines.length > 0 ? (
                <ul className="visit-checklist-section-presence__body">
                  {lines.map((line, idx) => (
                    <li
                      key={`${sec.code}-${idx}-${line.text}`}
                      className={`visit-checklist-section-presence__item${
                        line.marked ? ' visit-checklist-section-presence__item--marked' : ''
                      }`}
                    >
                      <span className="visit-checklist-section-presence__mark" aria-hidden>
                        {line.marked ? '✓' : '○'}
                      </span>
                      <span>{truncateIndicator(line.text, pdfMode ? 120 : 180)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
