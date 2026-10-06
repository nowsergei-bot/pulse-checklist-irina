import { useMemo } from 'react';
import { type LessonAnalyticsCardTemplate } from '../api/lessonAnalytics';
import { resolveLessonPdfVisual } from '../lib/lessonAnalytics/lessonAnalyticsPdfVisual';

const ACCENT_CSS: Record<string, string> = {
  'pulse-red': '#e30613',
  blue: '#2563eb',
  green: '#16a34a',
  slate: '#475569',
};

type Props = {
  template: LessonAnalyticsCardTemplate;
  projectTitle: string;
  teacherSample?: string;
};

export default function LessonAnalyticsPdfPreviewMock({
  template,
  projectTitle,
  teacherSample = 'Иванов И.И.',
}: Props) {
  const visual = useMemo(() => resolveLessonPdfVisual(template, projectTitle), [template, projectTitle]);
  const accent = ACCENT_CSS[template.pdfVisual?.accent ?? 'pulse-red'] ?? ACCENT_CSS['pulse-red'];
  const landscape = visual.orientation === 'landscape';

  return (
    <div
      className={`lesson-pdf-preview-mock${landscape ? ' lesson-pdf-preview-mock--landscape' : ''}`}
      aria-hidden
    >
      <div className="lesson-pdf-preview-mock__stripe" style={{ background: accent }} />
      <div className="lesson-pdf-preview-mock__body">
        <h3 className="lesson-pdf-preview-mock__report-title">{visual.reportTitle}</h3>
        <p className="lesson-pdf-preview-mock__project">{visual.projectTitle}</p>
        {visual.reportTagline ? (
          <p className="lesson-pdf-preview-mock__tagline">{visual.reportTagline}</p>
        ) : null}
        <p className="lesson-pdf-preview-mock__teacher" style={{ color: accent }}>
          {visual.entityCaption}: {teacherSample}
        </p>
        {visual.leadLine ? <p className="lesson-pdf-preview-mock__lead">{visual.leadLine}</p> : null}
        {visual.showDisclaimer ? (
          <p className="lesson-pdf-preview-mock__disclaimer">
            Дисклеймер о рекомендательном характере отчёта…
          </p>
        ) : null}
        {visual.showPulseBrand ? (
          <p className="lesson-pdf-preview-mock__brand">Аналитика ИИ «Пульс» · дата</p>
        ) : null}

        {visual.moduleLayout.showLessonCountInHeader ? (
          <p className="lesson-pdf-preview-mock__lead">Уроков в мониторинге: 12</p>
        ) : null}

        {template.showSliceCharts !== false ? (
          <div className="lesson-pdf-preview-mock__section">
            {visual.showSectionBars ? (
              <span className="lesson-pdf-preview-mock__bar" style={{ background: accent }} />
            ) : null}
            <span>Распределение по срезам</span>
            <div
              className="lesson-pdf-preview-mock__bars"
              style={{
                display: 'grid',
                gridTemplateColumns:
                  visual.moduleLayout.sliceChartsPerRow > 1 ? '1fr 1fr' : '1fr',
                gap: '0.35rem',
                maxWidth: `${visual.moduleLayout.sliceWidthPct}%`,
              }}
            >
              {[72, 48].map((w, i) => (
                <div key={i} className="lesson-pdf-preview-mock__bar-row">
                  <span className="lesson-pdf-preview-mock__bar-label">Срез {i + 1}</span>
                  <span className="lesson-pdf-preview-mock__bar-track">
                    <span className="lesson-pdf-preview-mock__bar-fill" style={{ width: `${w}%`, background: accent }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {template.showCompetencyTable !== false ? (
          <div
            className="lesson-pdf-preview-mock__section"
            style={visual.moduleLayout.competenciesPageBreakBefore ? { marginTop: '1.25rem' } : undefined}
          >
            {visual.showSectionBars ? (
              <span className="lesson-pdf-preview-mock__bar" style={{ background: accent }} />
            ) : null}
            <span>Компетенции (тепловая карта)</span>
            <div className="lesson-pdf-preview-mock__heatmap" />
          </div>
        ) : null}

        {template.showAiNarrative !== false ? (
          <div className="lesson-pdf-preview-mock__section">
            {visual.showSectionBars ? (
              <span className="lesson-pdf-preview-mock__bar" style={{ background: accent }} />
            ) : null}
            <span>Аналитический текст (ИИ)</span>
            <p className="lesson-pdf-preview-mock__prose">Текст аналитики по выбранному срезу…</p>
          </div>
        ) : null}
      </div>
      <footer className="lesson-pdf-preview-mock__footer">
        <span>{visual.footerLine}</span>
        {visual.showPageNumbers ? <span>Стр. 1 / 3</span> : null}
        {visual.showGeneratedDate ? <span>23.05.2026</span> : null}
      </footer>
    </div>
  );
}
