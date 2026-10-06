import type { ReactNode } from 'react';
import { PDF_CARD_KEEP_TOGETHER_CLASS } from '../lib/pdf/captureElementToPdfA4';
import './VisitChecklistTeacherCardSection.css';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  /** Тёмная плашка для блока ИИ-вывода. */
  variant?: 'red' | 'ai';
  /** Свернуть содержимое в `<details>` (заголовок — в summary). */
  collapsible?: boolean;
  /** Начальное состояние `<details>` (по умолчанию закрыто). */
  defaultOpen?: boolean;
  /** Короткая подпись в summary при свёрнутом блоке. */
  summaryHint?: string;
};

/** Красная плашка-заголовок секции карточки педагога (как в дашборде Arabic Center). */
export default function VisitChecklistTeacherCardSection({
  title,
  subtitle,
  children,
  className,
  variant = 'red',
  collapsible = false,
  defaultOpen = false,
  summaryHint,
}: Props) {
  const variantClass = variant === 'ai' ? ' visit-checklist-teacher-card-section--ai' : '';
  const collapsibleClass = collapsible ? ' visit-checklist-teacher-card-section--collapsible' : '';

  const header = (
    <>
      <span className="visit-checklist-teacher-card-section__title">{title}</span>
      {subtitle ? <p className="visit-checklist-teacher-card-section__subtitle">{subtitle}</p> : null}
      {collapsible && summaryHint ? (
        <span className="visit-checklist-teacher-card-section__summary-hint">{summaryHint}</span>
      ) : null}
    </>
  );

  if (collapsible) {
    return (
      <details
        className={`visit-checklist-teacher-card-section ${PDF_CARD_KEEP_TOGETHER_CLASS}${variantClass}${collapsibleClass}${
          className ? ` ${className}` : ''
        }`}
        open={defaultOpen || undefined}
        aria-label={title}
      >
        <summary className="visit-checklist-teacher-card-section__header visit-checklist-teacher-card-section__summary">
          {header}
        </summary>
        <div className="visit-checklist-teacher-card-section__body">{children}</div>
      </details>
    );
  }

  return (
    <section
      className={`visit-checklist-teacher-card-section ${PDF_CARD_KEEP_TOGETHER_CLASS}${variantClass}${
        className ? ` ${className}` : ''
      }`}
      aria-label={title}
    >
      <header className="visit-checklist-teacher-card-section__header">{header}</header>
      <div className="visit-checklist-teacher-card-section__body">{children}</div>
    </section>
  );
}
