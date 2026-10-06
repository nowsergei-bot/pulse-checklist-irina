import type { CardPdfTemplate, PdfBlockType, PdfTemplateBlock } from './types.ts';
import { PDF_DOCUMENT_TYPE } from './types.ts';

const FULL_ONLY = new Set<PdfBlockType>(['narrative', 'visits', 'sections', 'strengths']);

function block(
  type: PdfBlockType,
  extra?: Partial<PdfTemplateBlock>,
): PdfTemplateBlock {
  const base: PdfTemplateBlock = {
    id: extra?.id || type,
    type,
    enabled: extra?.enabled ?? true,
    width: FULL_ONLY.has(type) ? 'full' : extra?.width === 'half' ? 'half' : extra?.width || 'full',
    breakBefore: extra?.breakBefore ?? false,
    options: {
      emptyPolicy: extra?.options?.emptyPolicy || (type === 'teacher' || type === 'kpis' ? 'placeholder' : 'hide'),
      density: extra?.options?.density || 'normal',
      ...(type === 'compare' ? { compareMode: extra?.options?.compareMode || 'department' } : {}),
      ...(type === 'visits' ? { visitDetail: extra?.options?.visitDetail || 'short' } : {}),
      ...(type === 'profile' ? { profileChart: extra?.options?.profileChart || 'bars' } : {}),
    },
  };
  return base;
}

export function defaultTeacherCardTemplate(): CardPdfTemplate {
  return {
    schemaVersion: 1,
    documentType: PDF_DOCUMENT_TYPE,
    page: { format: 'A4', orientation: 'portrait', marginMm: 14 },
    blocks: [
      block('teacher', { width: 'full' }),
      block('kpis', { width: 'half' }),
      block('profile', { width: 'half' }),
      block('compare', { width: 'full' }),
      block('observeSelf', { width: 'half' }),
      block('trend', { width: 'half' }),
      block('watchers', { width: 'half' }),
      block('coverage', { width: 'half' }),
      block('strengths', { width: 'full' }),
      block('slices', { width: 'full' }),
      block('sections', { width: 'full' }),
      block('narrative', { width: 'full' }),
      block('visits', { width: 'full' }),
    ],
  };
}

export const BLOCK_CATALOG: Array<{ type: PdfBlockType; title: string; repeatable: boolean; fullOnly: boolean }> = [
  { type: 'teacher', title: 'Педагог', repeatable: false, fullOnly: false },
  { type: 'kpis', title: 'Ключевые показатели', repeatable: false, fullOnly: false },
  { type: 'profile', title: 'Профиль результатов', repeatable: false, fullOnly: false },
  { type: 'compare', title: 'Сравнение', repeatable: false, fullOnly: false },
  { type: 'observeSelf', title: 'Наблюдение и самоанализ', repeatable: false, fullOnly: false },
  { type: 'trend', title: 'Динамика посещений', repeatable: false, fullOnly: false },
  { type: 'watchers', title: 'Наблюдатели и форматы', repeatable: false, fullOnly: false },
  { type: 'coverage', title: 'Заполненность рубрики', repeatable: false, fullOnly: false },
  { type: 'strengths', title: 'Сильные стороны и точки роста', repeatable: false, fullOnly: true },
  { type: 'slices', title: 'По предметам и классам', repeatable: false, fullOnly: false },
  { type: 'sections', title: 'Результаты по разделам', repeatable: false, fullOnly: true },
  { type: 'narrative', title: 'Методическая справка', repeatable: false, fullOnly: true },
  { type: 'visits', title: 'Посещения', repeatable: true, fullOnly: true },
];

export function blockTitle(type: PdfBlockType): string {
  return BLOCK_CATALOG.find((row) => row.type === type)?.title || type;
}

export function cloneTemplate(template: CardPdfTemplate): CardPdfTemplate {
  return JSON.parse(JSON.stringify(template)) as CardPdfTemplate;
}

export function templatesEqual(a: CardPdfTemplate, b: CardPdfTemplate): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
