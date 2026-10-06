import { useCallback, useEffect, useState } from 'react';
import { type LessonAnalyticsCardTemplate, type LessonAnalyticsPdfLayoutSettings } from '../api/lessonAnalytics';
import { normalizeLessonCardTemplate } from '../lib/lessonAnalytics/cardTemplate';
import {
  DEFAULT_LESSON_PDF_VISUAL,
  normalizeLessonPdfVisual,
  type LessonAnalyticsPdfAccent,
  type LessonAnalyticsPdfDensity,
  type LessonAnalyticsPdfOrientation,
} from '../lib/lessonAnalytics/lessonAnalyticsPdfVisual';
import { normalizeLessonPdfLayoutSettings } from '../lib/lessonAnalytics/lessonAnalyticsPdfLayout';
import { pdfVisualFromCardTemplate } from '../lib/lessonAnalytics/cardTemplate';
import { buildLessonAnalyticsTeacherPdfBytes, downloadPdfArrayBufferAsFile } from '../lib/lessonAnalytics/buildLessonAnalyticsTeacherPdf';
import LessonAnalyticsPdfPreviewMock from './LessonAnalyticsPdfPreviewMock';

type Props = {
  open: boolean;
  onClose: () => void;
  template: LessonAnalyticsCardTemplate;
  onChange: (next: LessonAnalyticsCardTemplate) => void;
  projectTitle: string;
  disabled?: boolean;
  /** Сохранить как шаблон по умолчанию для новых проектов (localStorage) */
  onSaveAsDefault?: (template: LessonAnalyticsCardTemplate) => void;
  saveAsDefaultLabel?: string;
  /** Экспорт карточки конкретного педагога с текущими настройками шаблона. */
  exportTarget?: {
    teacherLabel: string;
    busy?: boolean;
    onExport: (template: LessonAnalyticsCardTemplate) => Promise<void>;
  };
};

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="lesson-analytics-template-toggle">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default function LessonAnalyticsPdfConstructorModal({
  open,
  onClose,
  template: templateProp,
  onChange,
  projectTitle,
  disabled,
  onSaveAsDefault,
  saveAsDefaultLabel = 'Сохранить как шаблон по умолчанию',
  exportTarget,
}: Props) {
  const [local, setLocal] = useState(() => normalizeLessonCardTemplate(templateProp));
  const [sampleBusy, setSampleBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [sampleErr, setSampleErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) setLocal(normalizeLessonCardTemplate(templateProp));
  }, [open, templateProp]);

  const patch = useCallback((p: Partial<LessonAnalyticsCardTemplate>) => {
    setLocal((prev) => {
      const next = normalizeLessonCardTemplate({
        ...prev,
        ...p,
        v: 1,
        updatedAt: new Date().toISOString(),
      });
      onChange(next);
      return next;
    });
  }, [onChange]);

  const patchVisual = useCallback(
    (p: Partial<NonNullable<LessonAnalyticsCardTemplate['pdfVisual']>>) => {
      const v = normalizeLessonPdfVisual({ ...local.pdfVisual, ...p });
      patch({ pdfVisual: v });
    },
    [local.pdfVisual, patch],
  );

  const patchLayout = useCallback(
    (p: Partial<LessonAnalyticsPdfLayoutSettings>) => {
      const prev = normalizeLessonPdfVisual(local.pdfVisual).layout ?? {};
      patchVisual({ layout: { ...prev, ...p } });
    },
    [local.pdfVisual, patchVisual],
  );

  const visual = local.pdfVisual ?? DEFAULT_LESSON_PDF_VISUAL;
  const layout = normalizeLessonPdfLayoutSettings(visual.layout);

  const exportTeacherPdf = async () => {
    if (!exportTarget) return;
    setExportBusy(true);
    setSampleErr(null);
    try {
      await exportTarget.onExport(local);
    } catch (e) {
      setSampleErr(e instanceof Error ? e.message : 'Не удалось сформировать PDF');
    } finally {
      setExportBusy(false);
    }
  };

  const downloadSample = async () => {
    setSampleBusy(true);
    setSampleErr(null);
    try {
      const pdfVisual = pdfVisualFromCardTemplate(local, projectTitle);
      const buf = await buildLessonAnalyticsTeacherPdfBytes({
        projectTitle,
        teacherLabel: 'Пример педагога',
        metricBars: [],
        ordinalBars: [],
        lessonCount: 14,
        sliceCharts: [
          {
            title: 'Предмет',
            items: [
              { label: 'Математика', value: 12 },
              { label: 'Физика', value: 8 },
              { label: 'Информатика', value: 5 },
            ],
          },
          {
            title: 'Класс',
            items: [
              { label: '5А', value: 6 },
              { label: '6Б', value: 4 },
            ],
          },
        ],
        lessonCompPhraseBreakdown: [
          {
            title: 'Компетенция 1',
            phrases: [
              { text: 'Формулировка уровня 1', count: 3 },
              { text: 'Формулировка уровня 2', count: 7 },
              { text: 'Формулировка уровня 3', count: 2 },
            ],
          },
        ],
        summaryForPedagogue: '',
        narrativePlain:
          'Пример аналитического текста: по выбранному срезу отмечается рост вовлечённости, при этом сохраняются зоны внимания по обратной связи.',
        layoutMode: 'lesson-card',
        pdfVisual,
      });
      downloadPdfArrayBufferAsFile(buf, `pulse-pdf-preview-${Date.now()}.pdf`);
    } catch (e) {
      setSampleErr(e instanceof Error ? e.message : 'Не удалось сформировать PDF');
    } finally {
      setSampleBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="lesson-pdf-constructor-backdrop" role="presentation" onClick={onClose}>
      <div
        className="lesson-pdf-constructor-dialog card glass-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-pdf-constructor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="lesson-pdf-constructor-dialog__head">
          <div>
            <h2 id="lesson-pdf-constructor-title" className="admin-dash-title" style={{ fontSize: '1.15rem', margin: 0 }}>
              Конструктор PDF
            </h2>
            <p className="muted" style={{ fontSize: '0.85rem', margin: '0.35rem 0 0' }}>
              Визуальные настройки отчёта по педагогу. Изменения применяются ко всем PDF проекта.
            </p>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <div className="lesson-pdf-constructor-dialog__grid">
          <div className="lesson-pdf-constructor-dialog__settings">
            <section className="lesson-pdf-constructor-section">
              <h3>Титул и подписи</h3>
              <label className="field">
                <span className="muted" style={{ fontSize: '0.82rem' }}>Заголовок отчёта</span>
                <input
                  className="input"
                  disabled={disabled}
                  value={visual.reportTitle ?? ''}
                  onChange={(e) => patchVisual({ reportTitle: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="muted" style={{ fontSize: '0.82rem' }}>Подпись поля с ФИО</span>
                <input
                  className="input"
                  disabled={disabled}
                  value={visual.entityCaption ?? ''}
                  onChange={(e) => patchVisual({ entityCaption: e.target.value })}
                  placeholder="Педагог"
                />
              </label>
              <label className="field">
                <span className="muted" style={{ fontSize: '0.82rem' }}>Подзаголовок под названием проекта</span>
                <input
                  className="input"
                  disabled={disabled}
                  value={visual.reportTagline ?? ''}
                  onChange={(e) => patchVisual({ reportTagline: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="muted" style={{ fontSize: '0.82rem' }}>Пояснение под ФИО</span>
                <textarea
                  className="input"
                  rows={2}
                  disabled={disabled}
                  value={visual.leadLine ?? ''}
                  onChange={(e) => patchVisual({ leadLine: e.target.value })}
                  placeholder="Если пусто — используется вводный текст шаблона"
                />
              </label>
              <label className="field">
                <span className="muted" style={{ fontSize: '0.82rem' }}>Вводный текст (экран + PDF, если нет пояснения)</span>
                <textarea
                  className="input"
                  rows={2}
                  disabled={disabled}
                  value={local.introText ?? ''}
                  onChange={(e) => patch({ introText: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="muted" style={{ fontSize: '0.82rem' }}>Подпись внизу каждой страницы</span>
                <textarea
                  className="input"
                  rows={2}
                  disabled={disabled}
                  value={local.footerText ?? ''}
                  onChange={(e) => patch({ footerText: e.target.value })}
                />
              </label>
            </section>

            <section className="lesson-pdf-constructor-section">
              <h3>Макет листа</h3>
              <div className="lesson-pdf-constructor-row">
                <label className="field" style={{ flex: 1 }}>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>Ориентация</span>
                  <select
                    className="input"
                    disabled={disabled}
                    value={visual.orientation ?? 'landscape'}
                    onChange={(e) =>
                      patchVisual({ orientation: e.target.value as LessonAnalyticsPdfOrientation })
                    }
                  >
                    <option value="landscape">Альбомная (рекомендуется)</option>
                    <option value="portrait">Книжная</option>
                  </select>
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>Плотность полей</span>
                  <select
                    className="input"
                    disabled={disabled}
                    value={visual.density ?? 'normal'}
                    onChange={(e) => patchVisual({ density: e.target.value as LessonAnalyticsPdfDensity })}
                  >
                    <option value="compact">Компактная</option>
                    <option value="normal">Обычная</option>
                    <option value="airy">Свободная</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span className="muted" style={{ fontSize: '0.82rem' }}>Акцентный цвет</span>
                <select
                  className="input"
                  disabled={disabled}
                  value={visual.accent ?? 'pulse-red'}
                  onChange={(e) => patchVisual({ accent: e.target.value as LessonAnalyticsPdfAccent })}
                >
                  <option value="pulse-red">Пульс (красный)</option>
                  <option value="blue">Синий</option>
                  <option value="green">Зелёный</option>
                  <option value="slate">Серый</option>
                </select>
              </label>
              <div className="lesson-pdf-constructor-row">
                <label className="field" style={{ flex: 1 }}>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>
                    Макс. диаграмм среза ({visual.maxSliceCharts ?? 6})
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    disabled={disabled}
                    value={visual.maxSliceCharts ?? 6}
                    onChange={(e) => patchVisual({ maxSliceCharts: Number(e.target.value) })}
                  />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>
                    Лимит страниц ({visual.maxPages ?? 16})
                  </span>
                  <input
                    type="range"
                    min={4}
                    max={32}
                    step={1}
                    disabled={disabled}
                    value={visual.maxPages ?? 16}
                    onChange={(e) => patchVisual({ maxPages: Number(e.target.value) })}
                  />
                </label>
              </div>
            </section>

            <section className="lesson-pdf-constructor-section">
              <h3>Модули и страницы</h3>
              <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 0.65rem' }}>
                Настройки применяются ко всем PDF педагогов в проекте после сохранения шаблона.
              </p>
              <label className="field">
                <span className="muted" style={{ fontSize: '0.82rem' }}>
                  Ширина диаграммы среза ({layout.sliceWidthPct}%)
                </span>
                <input
                  type="range"
                  min={30}
                  max={100}
                  step={2}
                  disabled={disabled}
                  value={layout.sliceWidthPct}
                  onChange={(e) => patchLayout({ sliceWidthPct: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span className="muted" style={{ fontSize: '0.82rem' }}>Диаграмм среза в ряд</span>
                <select
                  className="input"
                  disabled={disabled}
                  value={layout.sliceChartsPerRow}
                  onChange={(e) =>
                    patchLayout({ sliceChartsPerRow: Number(e.target.value) === 1 ? 1 : 2 })
                  }
                >
                  <option value={1}>1 (на всю доступную ширину)</option>
                  <option value={2}>2 (компактно, ~полстраницы каждая при 48%)</option>
                </select>
              </label>
              <div className="lesson-analytics-template-toggles">
                <Toggle
                  label="Компетенции — с новой страницы"
                  checked={layout.competenciesPageBreakBefore}
                  disabled={disabled}
                  onChange={(v) => patchLayout({ competenciesPageBreakBefore: v })}
                />
                <Toggle
                  label="ИИ-текст не разрывать между страницами"
                  checked={layout.aiNarrativeKeepTogether}
                  disabled={disabled}
                  onChange={(v) => patchLayout({ aiNarrativeKeepTogether: v })}
                />
                <Toggle
                  label="Цвет «вхождений» в PDF (тепловая заливка)"
                  checked={layout.phraseCountHeatColors}
                  disabled={disabled}
                  onChange={(v) => patchLayout({ phraseCountHeatColors: v })}
                />
                <Toggle
                  label="Число уроков в шапке PDF"
                  checked={layout.showLessonCountInHeader}
                  disabled={disabled}
                  onChange={(v) => patchLayout({ showLessonCountInHeader: v })}
                />
              </div>
            </section>

            <section className="lesson-pdf-constructor-section">
              <h3>Содержимое блоков</h3>
              <div className="lesson-analytics-template-toggles">
                <Toggle
                  label="Диаграммы по срезам"
                  checked={local.showSliceCharts !== false}
                  disabled={disabled}
                  onChange={(v) => patch({ showSliceCharts: v })}
                />
                <Toggle
                  label="Таблица / тепловая карта компетенций"
                  checked={local.showCompetencyTable !== false}
                  disabled={disabled}
                  onChange={(v) => patch({ showCompetencyTable: v })}
                />
                <Toggle
                  label="Выводы и рекомендации из файла"
                  checked={local.showProsePanel !== false}
                  disabled={disabled}
                  onChange={(v) => patch({ showProsePanel: v })}
                />
                <Toggle
                  label="Сводка по баллам"
                  checked={local.showQuickSummary !== false}
                  disabled={disabled}
                  onChange={(v) => patch({ showQuickSummary: v })}
                />
                <Toggle
                  label="Блок ИИ-аналитики"
                  checked={local.showAiNarrative !== false}
                  disabled={disabled}
                  onChange={(v) => patch({ showAiNarrative: v })}
                />
              </div>
            </section>

            <section className="lesson-pdf-constructor-section">
              <h3>Служебные элементы</h3>
              <div className="lesson-analytics-template-toggles">
                <Toggle
                  label="Дисклеймер в шапке"
                  checked={visual.showDisclaimer !== false}
                  disabled={disabled}
                  onChange={(v) => patchVisual({ showDisclaimer: v })}
                />
                <Toggle
                  label="Бренд «Аналитика ИИ Пульс»"
                  checked={visual.showPulseBrand !== false}
                  disabled={disabled}
                  onChange={(v) => patchVisual({ showPulseBrand: v })}
                />
                <Toggle
                  label="Нумерация страниц"
                  checked={visual.showPageNumbers !== false}
                  disabled={disabled}
                  onChange={(v) => patchVisual({ showPageNumbers: v })}
                />
                <Toggle
                  label="Дата формирования в подвале"
                  checked={visual.showGeneratedDate !== false}
                  disabled={disabled}
                  onChange={(v) => patchVisual({ showGeneratedDate: v })}
                />
                <Toggle
                  label="Цветная полоска у заголовков секций"
                  checked={visual.showSectionBars !== false}
                  disabled={disabled}
                  onChange={(v) => patchVisual({ showSectionBars: v })}
                />
              </div>
            </section>
          </div>

          <aside className="lesson-pdf-constructor-dialog__preview">
            <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}>
              Предпросмотр (схема макета)
            </p>
            <LessonAnalyticsPdfPreviewMock template={local} projectTitle={projectTitle} />
          </aside>
        </div>

        <footer className="lesson-pdf-constructor-dialog__foot">
          {sampleErr ? <p className="err" style={{ margin: 0 }}>{sampleErr}</p> : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginLeft: 'auto' }}>
            {onSaveAsDefault ? (
              <button
                type="button"
                className="btn btn-sm"
                disabled={disabled}
                onClick={() => onSaveAsDefault(local)}
              >
                {saveAsDefaultLabel}
              </button>
            ) : null}
            {exportTarget ? (
              <button
                type="button"
                className="btn btn-sm primary"
                disabled={disabled || exportBusy || sampleBusy || exportTarget.busy}
                onClick={() => void exportTeacherPdf()}
              >
                {exportBusy || exportTarget.busy
                  ? 'PDF…'
                  : `Скачать PDF — ${exportTarget.teacherLabel}`}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-sm"
              disabled={disabled || sampleBusy || exportBusy}
              onClick={() => void downloadSample()}
            >
              {sampleBusy ? 'PDF…' : 'Скачать пример PDF'}
            </button>
            <button type="button" className="btn btn-sm primary" onClick={onClose}>
              Готово
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
