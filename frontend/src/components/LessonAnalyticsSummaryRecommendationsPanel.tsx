import { useMemo, type CSSProperties } from 'react';
import type { LessonProseCommentBlock } from '../lib/excelAnalytics/engine';
import { getMergedLessonAnalyticsProseRows } from '../lib/lessonAnalytics/lessonAnalyticsProseMerge';
import { PDF_CARD_KEEP_TOGETHER_CLASS } from '../lib/pdf/captureElementToPdfA4';
import VisitChecklistTeacherCardSection from './VisitChecklistTeacherCardSection';

type Props = {
  blocks: LessonProseCommentBlock[];
  compact?: boolean;
  /** Абзацы из столбца «Общие выводы / summary» (роль шкалы Excel) — показываются первыми. */
  excelSummaryChunks?: string[];
  /** Тексты из столбца «Рекомендации» напрямую из Excel. */
  excelRecommendationChunks?: string[];
  /**
   * Карточка «Аналитика урока»: без max-height и прокрутки внутри блоков — выводы и рекомендации сразу видны целиком.
   */
  expandedProse?: boolean;
  /** Показать только выводы, только рекомендации или оба блока (по умолчанию). */
  parts?: 'both' | 'summary' | 'recommendations';
  /** Скрыть встроенные заголовки h4 — заголовок задаёт родитель (плашка секции). */
  hideHeading?: boolean;
  /** Чек-лист посещения: красные плашки разделов вместо обычных заголовков. */
  visitChecklistSectionHeaders?: boolean;
};

function QuoteTable({ rows }: { rows: string[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="phenomenal-teacher-notes-table-wrap">
      <table className="phenomenal-teacher-notes-points-table phenomenal-teacher-notes-points-table--pair">
        <thead>
          <tr>
            <th scope="col">{'\u2116'}</th>
            <th scope="col">Пункт / формулировка</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={PDF_CARD_KEEP_TOGETHER_CLASS}>
              <td>{ri + 1}</td>
              <td className="phenomenal-public-prose" style={{ whiteSpace: 'pre-wrap' }}>
                {row}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LessonAnalyticsSummaryRecommendationsPanel({
  blocks,
  compact,
  excelSummaryChunks = [],
  excelRecommendationChunks = [],
  expandedProse = false,
  parts = 'both',
  hideHeading = false,
  visitChecklistSectionHeaders = false,
}: Props) {
  const { allSummaryRows, allRecRows } = useMemo(
    () => getMergedLessonAnalyticsProseRows(blocks, excelSummaryChunks, excelRecommendationChunks),
    [blocks, excelSummaryChunks, excelRecommendationChunks],
  );

  const showSummary = parts === 'both' || parts === 'summary';
  const showRec = parts === 'both' || parts === 'recommendations';
  const hasSummary = showSummary && allSummaryRows.length > 0;
  const hasRec = showRec && allRecRows.length > 0;

  if (!hasSummary && !hasRec) return null;

  const useBanner = visitChecklistSectionHeaders;
  const bareInner = hideHeading && expandedProse;
  const proseBoxStyle: CSSProperties = bareInner
    ? { padding: 0, border: 'none', background: 'transparent' }
    : expandedProse || useBanner
      ? {
          border: useBanner ? 'none' : '1px solid var(--card-border, rgba(148,163,184,0.25))',
          borderRadius: useBanner ? 0 : 10,
          padding: useBanner ? 0 : '0.55rem 0.7rem',
          background: useBanner ? 'transparent' : 'var(--card-inner-bg, rgba(15,23,42,0.02))',
        }
      : {
          maxHeight: compact ? 280 : 380,
          overflowY: 'auto',
          border: '1px solid var(--card-border, rgba(148,163,184,0.25))',
          borderRadius: 10,
          padding: '0.65rem 0.75rem',
          background: 'var(--card-inner-bg, rgba(15,23,42,0.02))',
        };

  const summaryTitle = useBanner ? 'Общие выводы по урокам' : 'Общие выводы по уроку (цитаты из файла)';
  const summaryLead = useBanner
    ? 'Цитаты из столбца «Общие выводы по уроку» по всем посещениям педагога в срезе.'
    : undefined;
  const recLead = useBanner
    ? 'Рекомендации из столбца «Рекомендации учителю» по посещениям в срезе.'
    : undefined;

  const renderBlock = (
    ariaLabel: string,
    title: string,
    lead: string | undefined,
    rows: string[],
    marginTop?: string,
  ) => {
    const table = (
      <div
        className={expandedProse || useBanner ? undefined : 'lesson-analytics-prose-comments-scroll'}
        style={proseBoxStyle}
      >
        <QuoteTable rows={rows} />
      </div>
    );

    if (useBanner) {
      return (
        <VisitChecklistTeacherCardSection
          title={title}
          subtitle={lead}
        >
          {table}
        </VisitChecklistTeacherCardSection>
      );
    }

    return (
      <section
        className={`phenomenal-public-teacher-notes ${PDF_CARD_KEEP_TOGETHER_CLASS}`}
        style={marginTop ? { marginTop } : undefined}
        aria-label={ariaLabel}
      >
        {!hideHeading ? (
          <h4 className="phenomenal-report-section-title" style={{ fontSize: compact ? '0.95rem' : '1.02rem' }}>
            {title}
          </h4>
        ) : null}
        {!hideHeading && !compact && !expandedProse && lead ? (
          <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '0.55rem' }}>
            {lead}
          </p>
        ) : null}
        {!hideHeading && !compact && !expandedProse && !lead && ariaLabel === 'Общие выводы по уроку' ? (
          <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '0.55rem' }}>
            Колонка с ролью «Общие выводы / summary» и дополнительные текстовые колонки с ролью «Текст: выводы / резюме».
            Фрагменты, разделённые пустой строкой в ячейке, идут отдельными строками.
          </p>
        ) : null}
        {!hideHeading && !compact && !expandedProse && ariaLabel === 'Рекомендации учителю' ? (
          <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '0.55rem' }}>
            Текст из колонок Excel с ролью «Текст: рекомендации» и связанные ячейки в строках отчёта — одним списком.
          </p>
        ) : null}
        {table}
      </section>
    );
  };

  const inner = (
    <>
      {hasSummary
        ? renderBlock('Общие выводы по уроку', summaryTitle, summaryLead, allSummaryRows)
        : null}
      {hasRec
        ? renderBlock(
            'Рекомендации учителю',
            'Рекомендации учителю',
            recLead,
            allRecRows,
            useBanner ? undefined : hasSummary ? (expandedProse ? '0.55rem' : '1rem') : undefined,
          )
        : null}
    </>
  );

  if (useBanner) return inner;
  return <div style={{ marginTop: expandedProse ? '0.55rem' : '0.85rem' }}>{inner}</div>;
}
