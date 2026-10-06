import { jsPDF } from 'jspdf';
import { loadPdfFontPack, preloadPdfFonts, registerPdfFontsFromBase64, type PdfFontPack } from '../../../lib/pdf/jsPdfEmbedFonts.ts';
import { layoutTeacherCard } from './layout.ts';
import { metricsFromJsPdf } from './metrics.ts';
import { normalizeTeacherCardForPdf, type TeacherCardPdfContext } from './normalizeTeacherCard.ts';
import { renderTeacherCardPdf } from './renderPdf.ts';
import type { CardPdfTemplate, TeacherCardPdfLayout, TeacherCardPdfModel } from './types.ts';
import type { VisitChecklistDashCard, VisitChecklistPublishedMine } from '../../../api/visitChecklist.ts';

type Job = {
  requestId: number;
  kind: 'layout' | 'pdf';
  model: TeacherCardPdfModel;
  template: CardPdfTemplate;
  fonts?: PdfFontPack | null;
  photoJpeg?: string | null;
};

let worker: Worker | null = null;
let seq = 0;
let cachedFonts: PdfFontPack | null = null;
const pending = new Map<number, { resolve: (v: { layout: TeacherCardPdfLayout; blob?: Blob }) => void; reject: (e: Error) => void }>();

function onMsg(ev: MessageEvent) {
  const data = ev.data || {};
  const wait = pending.get(Number(data.requestId));
  if (!wait) return;
  pending.delete(Number(data.requestId));
  if (data.error) {
    wait.reject(new Error(String(data.error)));
    return;
  }
  const blob = data.pdf ? new Blob([data.pdf], { type: 'application/pdf' }) : undefined;
  wait.resolve({ layout: data.layout, blob });
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', onMsg);
    return worker;
  } catch {
    worker = null;
    return null;
  }
}

async function fontsOrThrow(pack?: PdfFontPack | null): Promise<PdfFontPack> {
  if (pack) return pack;
  if (!cachedFonts) cachedFonts = await loadPdfFontPack();
  return cachedFonts;
}

function metricsFromFonts(fonts: PdfFontPack) {
  const probe = new jsPDF({ unit: 'pt', format: 'a4' });
  registerPdfFontsFromBase64(probe, fonts);
  return metricsFromJsPdf(probe);
}

async function runLocal(job: Job): Promise<{ layout: TeacherCardPdfLayout; blob?: Blob }> {
  const fonts = await fontsOrThrow(job.fonts);
  const layout = layoutTeacherCard(job.model, job.template, metricsFromFonts(fonts));
  if (job.kind === 'layout') return { layout };
  const blob = await renderTeacherCardPdf(layout, { fonts, photoJpeg: job.photoJpeg });
  return { layout, blob };
}

export function releasePdfBuilderWorker(): void {
  for (const [, wait] of pending) wait.reject(new Error('cancelled'));
  pending.clear();
  worker?.terminate();
  worker = null;
}

export async function runPdfBuilderJob(job: Omit<Job, 'requestId'>): Promise<{ layout: TeacherCardPdfLayout; blob?: Blob }> {
  const requestId = ++seq;
  const fonts = await fontsOrThrow(job.fonts);
  if (job.kind === 'pdf') {
    return runLocal({ ...job, fonts, requestId });
  }
  const wk = getWorker();
  if (!wk) return runLocal({ ...job, fonts, requestId });
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    wk.postMessage({ ...job, fonts, requestId });
  });
}

export function modelFromCard(
  card: VisitChecklistDashCard | VisitChecklistPublishedMine,
  context?: TeacherCardPdfContext,
): TeacherCardPdfModel {
  return normalizeTeacherCardForPdf(card, context);
}

export { preloadPdfFonts };
