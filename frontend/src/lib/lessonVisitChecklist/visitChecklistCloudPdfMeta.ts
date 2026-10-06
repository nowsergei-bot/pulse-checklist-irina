export const VCD_PDF_HIDE_CLASS = 'vcd-pdf-hide';
export const VCD_PDF_CAPTURE_CLASS = 'vcd-pdf-capture';

/** Цельные блоки карточки — страница режется между ними, не сквозь абзац или график. */
export const VCD_PDF_KEEP_SELECTORS = [
  '.vcd-hero',
  '.mo-eng-dash-hero',
  '.vcd-chart',
  '.vcd-insights',
  '.vcd-draft',
  '.vcd-bars',
  '.vcd-visit',
  '.vcd-answers__sec',
  '.vcd-hi-grid',
  '.vcd-methodist__card',
  '.vcd-card__head',
  '.vcd-card > h2',
  '.vcd-card > p',
  '.vcd-chips',
  '.vcd-card textarea',
  '.vcd-card label',
  '.vcd-ai-report',
  '.vcd-school-ai',
] as const;
