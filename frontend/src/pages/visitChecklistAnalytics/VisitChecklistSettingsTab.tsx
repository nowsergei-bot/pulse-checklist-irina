import { memo, useState, type ReactNode } from 'react';
import DirectorShareLinkRow from '../../components/DirectorShareLinkRow';
import LessonAnalyticsCardTemplatePanel from '../../components/LessonAnalyticsCardTemplatePanel';
import LessonAnalyticsPdfConstructorModal from '../../components/LessonAnalyticsPdfConstructorModal';
import LessonAnalyticsRedHighlightPanel from '../../components/LessonAnalyticsRedHighlightPanel';
import LessonVisitResponsesAdminPanel from '../../components/LessonVisitResponsesAdminPanel';
import PulseExcelSliceFiltersPanel from '../../components/PulseExcelSliceFiltersPanel';
import { lessonVisitDirectorPublicUrl } from '../../api/visitChecklist';
import { COLUMN_ROLE_OPTIONS, type ColumnRole } from '../../lib/excelAnalytics/types';
import { normalizeLessonCardTemplate } from '../../lib/lessonAnalytics/cardTemplate';
import type { LessonVisitChecklistConfig, LessonVisitDirectory } from '../../lib/lessonVisitChecklist/types';
import { useVisitChecklistAnalytics } from './VisitChecklistAnalyticsContext';

type Props = {
  checklist?: LessonVisitChecklistConfig | null;
  directory?: LessonVisitDirectory | null;
};

function CollapsibleSection({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="card glass-surface pulse-slice-filters-collapsible" open={defaultOpen}>
      <summary className="pulse-slice-filters-collapsible-summary">
        <span className="pulse-slice-filters-collapsible-title">{title}</span>
        {hint ? <span className="pulse-slice-filters-collapsible-hint muted">{hint}</span> : null}
      </summary>
      <div className="pulse-slice-filters-collapsible-body">{children}</div>
    </details>
  );
}

function VisitChecklistSettingsTab({ checklist, directory }: Props) {
  const ws = useVisitChecklistAnalytics();
  const [pdfConstructorOpen, setPdfConstructorOpen] = useState(false);
  const directorPublicUrl = ws.directorShareToken
    ? lessonVisitDirectorPublicUrl(ws.directorShareToken)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {ws.analyticRows.length > 0 && ws.sliceFilters.filterSections.length > 0 ? (
        <PulseExcelSliceFiltersPanel
          collapsible
          filterSections={ws.sliceFilters.filterSections}
          filterKeyDisplayLabel={ws.sliceFilters.filterKeyDisplayLabel}
          filterPanelHiddenKeys={ws.sliceFilters.filterPanelHiddenKeys}
          filterSelection={ws.sliceFilters.filterSelection}
          valuesForKey={ws.sliceFilters.valuesForKey}
          onToggleValue={ws.onToggleSliceFilterValue}
          onClearKey={ws.onClearSliceFilterKey}
          onHideKey={ws.sliceFilters.hideFilterKey}
          onShowKey={ws.sliceFilters.showFilterKey}
          onShowAllHidden={() => ws.sliceFilters.setFilterPanelHiddenKeys([])}
          onResetAll={ws.onResetSliceFilters}
          onRebuildFromTable={ws.sliceFilters.rebuildPageFromTable}
          lead="Срезы по колонкам (кафедра, класс, предмет). Карточки педагогов и ИИ учитывают только выбранную выборку."
        />
      ) : null}

      {ws.analyticRows.length > 0 && ws.sliceFilters.filterSections.length > 0 ? (
        <LessonAnalyticsRedHighlightPanel
          collapsible
          filterSections={ws.sliceFilters.filterSections}
          filterKeyDisplayLabel={ws.sliceFilters.filterKeyDisplayLabel}
          filterPanelHiddenKeys={ws.sliceFilters.filterPanelHiddenKeys}
          redHighlightSelection={ws.redHighlightSelection}
          valuesForKey={ws.sliceFilters.valuesForKey}
          onToggleRedValue={ws.toggleRedHighlightValue}
          onClearRedHighlight={ws.clearRedHighlight}
        />
      ) : null}

      <CollapsibleSection title={`Ответы чек-листа (${ws.responseCount ?? 0})`} hint="удаление ответов">
        <LessonVisitResponsesAdminPanel
          projectId={ws.visitProjectId}
          checklist={checklist ?? null}
          directory={directory ?? null}
          onChanged={() => void ws.onResync?.()}
          hideHeading
        />
      </CollapsibleSection>

      {directorPublicUrl ? (
        <CollapsibleSection title="Ссылка для руководителя">
          <DirectorShareLinkRow label="Сводка для руководителя (чек-лист)" url={directorPublicUrl} />
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection title="Дополнительный Excel" hint="необязательно">
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          Основные данные — из ответов чек-листа. Сюда можно добавить плоский Excel «Для анализа ИИ» с теми же
          заголовками.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.65rem' }}>
          <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
            {ws.headers.length > 0 ? 'Заменить таблицу Excel' : 'Выбрать Excel'}
            <input
              type="file"
              accept=".xlsx,.xlsm"
              style={{ display: 'none' }}
              onChange={(e) => {
                void ws.onFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </label>
          {ws.headers.length > 0 ? (
            <label className="btn btn-sm primary" style={{ cursor: ws.sheetLoadBusy ? 'wait' : 'pointer' }}>
              Добавить ещё один Excel
              <input
                type="file"
                accept=".xlsx,.xlsm"
                style={{ display: 'none' }}
                disabled={ws.sheetLoadBusy}
                onChange={(e) => {
                  void ws.onAppendExcelFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
          ) : null}
        </div>
        {ws.fileName ? (
          <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            {ws.fileName}
            {ws.rawRows.length > 0 ? ` · ${ws.rawRows.length} строк` : ''}
          </p>
        ) : null}
      </CollapsibleSection>

      {ws.headers.length > 0 ? (
        <CollapsibleSection title="Настройки колонок" hint="при необходимости">
          <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
            <table className="admin-table" style={{ fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Колонка</th>
                  <th>Роль</th>
                </tr>
              </thead>
              <tbody>
                {ws.headers.map((h, i) => (
                  <tr key={`visit-checklist-col-${i}`}>
                    <td>{h || '—'}</td>
                    <td>
                      <select
                        className="input"
                        value={ws.roles[i] ?? 'ignore'}
                        onChange={(e) => ws.setRoleAt(i, e.target.value as ColumnRole)}
                      >
                        {COLUMN_ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-sm primary" style={{ marginTop: '0.65rem' }} onClick={ws.runAnalysis}>
            Пересчитать аналитические строки
          </button>
        </CollapsibleSection>
      ) : null}

      {ws.headers.length > 0 && ws.teacherFilterKey ? (
        <CollapsibleSection title="Шаблон карточки PDF" hint="необязательно">
          <LessonAnalyticsCardTemplatePanel
            template={ws.cardTemplate}
            disabled={ws.saveBusy}
            onChange={(next) => ws.setCardTemplate(normalizeLessonCardTemplate(next))}
            onOpenPdfConstructor={() => setPdfConstructorOpen(true)}
            embedded
          />
        </CollapsibleSection>
      ) : null}

      <LessonAnalyticsPdfConstructorModal
        open={pdfConstructorOpen}
        onClose={() => setPdfConstructorOpen(false)}
        template={ws.cardTemplate}
        projectTitle={ws.projectTitle}
        disabled={ws.saveBusy}
        onChange={(next) => ws.setCardTemplate(normalizeLessonCardTemplate(next))}
      />

      {ws.cardArchiveOpen ? (
        <div className="card glass-surface" style={{ padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.9rem' }}>Архив готовых карточек (JSON, S3)</strong>
            <button type="button" className="btn btn-sm" onClick={() => ws.setCardArchiveOpen(false)}>
              Скрыть
            </button>
          </div>
          {ws.cardArchiveItems.length === 0 ? (
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>
              Пока пусто — снимки появятся после фоновой обработки карточек.
            </p>
          ) : (
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
              {ws.cardArchiveItems.map((item) => {
                const block = ws.activeTeacherBlocks.find((b) => b.id === item.block_id);
                const label = block?.teacherLabel || item.block_id;
                return (
                  <li key={item.object_key ?? `${item.block_id}-${item.updated_at}`} style={{ marginBottom: 4 }}>
                    {label}
                    {item.updated_at ? ` · ${new Date(item.updated_at).toLocaleString('ru-RU')}` : ''}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default memo(VisitChecklistSettingsTab);
