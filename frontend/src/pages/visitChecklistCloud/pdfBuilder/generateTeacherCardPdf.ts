import type { VisitChecklistDashCard, VisitChecklistPublishedMine } from '../../../api/visitChecklist.ts';
import { downloadPdfBlobAsFile } from '../../../lib/pdf/surveyAnalyticsPdf.ts';
import { loadPdfFontPack, registerPdfFontsFromBase64 } from '../../../lib/pdf/jsPdfEmbedFonts.ts';
import { defaultTeacherCardTemplate } from './defaultTemplate.ts';
import { jsPDF } from 'jspdf';
import { layoutTeacherCard } from './layout.ts';
import { normalizeTeacherCardForPdf, type TeacherCardPdfContext } from './normalizeTeacherCard.ts';
import { renderTeacherCardPdf, type PdfRenderAssets } from './renderPdf.ts';
import type { CardPdfTemplate, TeacherCardPdfLayout } from './types.ts';
import { metricsFromJsPdf } from './metrics.ts';

export type GenerateTeacherCardPdfInput = {
  card: VisitChecklistDashCard | VisitChecklistPublishedMine;
  context?: TeacherCardPdfContext;
  template?: CardPdfTemplate;
  assets?: PdfRenderAssets;
};

export async function layoutTeacherCardFromInput(input: GenerateTeacherCardPdfInput): Promise<TeacherCardPdfLayout> {
  const model = normalizeTeacherCardForPdf(input.card, input.context);
  const fonts = input.assets?.fonts ?? (await loadPdfFontPack());
  const probe = new jsPDF({ unit: 'pt', format: 'a4' });
  registerPdfFontsFromBase64(probe, fonts);
  return layoutTeacherCard(model, input.template || defaultTeacherCardTemplate(), metricsFromJsPdf(probe));
}

export async function generateTeacherCardPdfBlob(input: GenerateTeacherCardPdfInput): Promise<{
  blob: Blob;
  layout: TeacherCardPdfLayout;
}> {
  const fonts = input.assets?.fonts ?? (await loadPdfFontPack());
  const layout = await layoutTeacherCardFromInput({ ...input, assets: { ...input.assets, fonts } });
  const blob = await renderTeacherCardPdf(layout, { ...input.assets, fonts });
  return { blob, layout };
}

export async function downloadTeacherCardPdf(
  input: GenerateTeacherCardPdfInput & { fileName: string },
): Promise<TeacherCardPdfLayout> {
  const { blob, layout } = await generateTeacherCardPdfBlob(input);
  downloadPdfBlobAsFile(blob, input.fileName);
  return layout;
}
