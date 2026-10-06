/// <reference lib="webworker" />
import { jsPDF } from 'jspdf';
import { registerPdfFontsFromBase64, type PdfFontPack } from '../../../lib/pdf/jsPdfEmbedFonts.ts';
import { layoutTeacherCard } from './layout.ts';
import { metricsFromJsPdf } from './metrics.ts';
import { normalizeTeacherCardForPdf } from './normalizeTeacherCard.ts';
import { renderTeacherCardPdf } from './renderPdf.ts';
import type { CardPdfTemplate, TeacherCardPdfModel } from './types.ts';
import type { TeacherCardPdfContext } from './normalizeTeacherCard.ts';
import type { VisitChecklistDashCard, VisitChecklistPublishedMine } from '../../../api/visitChecklist.ts';

export type PdfWorkerRequest = {
  requestId: number;
  kind: 'layout' | 'pdf';
  model?: TeacherCardPdfModel;
  card?: VisitChecklistDashCard | VisitChecklistPublishedMine;
  context?: TeacherCardPdfContext;
  template: CardPdfTemplate;
  fonts?: PdfFontPack | null;
  photoJpeg?: string | null;
};

function metricsFromFonts(fonts: PdfFontPack) {
  const probe = new jsPDF({ unit: 'pt', format: 'a4' });
  registerPdfFontsFromBase64(probe, fonts);
  return metricsFromJsPdf(probe);
}

self.onmessage = async (ev: MessageEvent<PdfWorkerRequest>) => {
  const msg = ev.data;
  try {
    const model = msg.model || (msg.card ? normalizeTeacherCardForPdf(msg.card, msg.context) : null);
    if (!model) throw new Error('no_model');
    if (!msg.fonts) throw new Error('fonts_required');
    const layout = layoutTeacherCard(model, msg.template, metricsFromFonts(msg.fonts));
    if (msg.kind === 'layout') {
      self.postMessage({ requestId: msg.requestId, layout });
      return;
    }
    const blob = await renderTeacherCardPdf(layout, { fonts: msg.fonts, photoJpeg: msg.photoJpeg });
    const pdf = await blob.arrayBuffer();
    self.postMessage({ requestId: msg.requestId, layout, pdf }, [pdf]);
  } catch (err) {
    self.postMessage({ requestId: msg.requestId, error: err instanceof Error ? err.message : 'pdf_failed' });
  }
};
