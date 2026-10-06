import type { jsPDF } from 'jspdf';

const CHUNK = 8192;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    const sub = bytes.subarray(i, end);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

let cachedLatoRegularB64: string | null = null;
let cachedLatoBoldB64: string | null = null;
let cachedHalvarRgB64: string | null = null;
let cachedHalvarBdB64: string | null = null;
let fontFetchPromise: Promise<void> | null = null;

async function ensureAllPdfFontsLoaded(): Promise<void> {
  if (cachedLatoRegularB64 && cachedLatoBoldB64 && cachedHalvarRgB64 && cachedHalvarBdB64) return;
  const envBase =
    typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.BASE_URL === 'string'
      ? import.meta.env.BASE_URL
      : '/';
  const base = `${envBase || '/'}`.replace(/\/?$/, '/');
  const [regRes, boldRes, halRgRes, halBdRes] = await Promise.all([
    fetch(`${base}fonts/Lato-Regular.ttf`),
    fetch(`${base}fonts/Lato-Bold.ttf`),
    fetch(`${base}fonts/HalvarBreit-Rg.ttf`),
    fetch(`${base}fonts/HalvarBreit-Bd.ttf`),
  ]);
  if (!regRes.ok) throw new Error(`PDF: Lato-Regular.ttf (${regRes.status})`);
  if (!boldRes.ok) throw new Error(`PDF: Lato-Bold.ttf (${boldRes.status})`);
  if (!halRgRes.ok) throw new Error(`PDF: HalvarBreit-Rg.ttf (${halRgRes.status})`);
  if (!halBdRes.ok) throw new Error(`PDF: HalvarBreit-Bd.ttf (${halBdRes.status})`);
  const [reg, bold, halRg, halBd] = await Promise.all([
    regRes.arrayBuffer(),
    boldRes.arrayBuffer(),
    halRgRes.arrayBuffer(),
    halBdRes.arrayBuffer(),
  ]);
  cachedLatoRegularB64 = arrayBufferToBase64(reg);
  cachedLatoBoldB64 = arrayBufferToBase64(bold);
  cachedHalvarRgB64 = arrayBufferToBase64(halRg);
  cachedHalvarBdB64 = arrayBufferToBase64(halBd);
}

export async function preloadPdfFonts(): Promise<void> {
  if (!fontFetchPromise) fontFetchPromise = ensureAllPdfFontsLoaded();
  await fontFetchPromise;
}

/** Основной текст отчёта */
export const PDF_BODY_FONT = 'Lato';
/** Заголовки разделов */
export const PDF_HEADING_FONT = 'Halvar';

export type PdfFontPack = {
  latoRegular: string;
  latoBold: string;
  halvarRg: string;
  halvarBd: string;
};

/** Чистая регистрация из уже загруженных base64 — без fetch, пригодна для worker. */
export function registerPdfFontsFromBase64(doc: jsPDF, pack: PdfFontPack): void {
  const list = doc.getFontList();
  if (!list.Lato) {
    doc.addFileToVFS('Lato-Regular.ttf', pack.latoRegular);
    doc.addFont('Lato-Regular.ttf', PDF_BODY_FONT, 'normal');
    doc.addFileToVFS('Lato-Bold.ttf', pack.latoBold);
    doc.addFont('Lato-Bold.ttf', PDF_BODY_FONT, 'bold');
  }
  if (!list.Halvar) {
    doc.addFileToVFS('HalvarBreit-Rg.ttf', pack.halvarRg);
    doc.addFont('HalvarBreit-Rg.ttf', PDF_HEADING_FONT, 'normal');
    doc.addFileToVFS('HalvarBreit-Bd.ttf', pack.halvarBd);
    doc.addFont('HalvarBreit-Bd.ttf', PDF_HEADING_FONT, 'bold');
  }
}

export async function loadPdfFontPack(): Promise<PdfFontPack> {
  if (!fontFetchPromise) fontFetchPromise = ensureAllPdfFontsLoaded();
  await fontFetchPromise;
  return {
    latoRegular: cachedLatoRegularB64!,
    latoBold: cachedLatoBoldB64!,
    halvarRg: cachedHalvarRgB64!,
    halvarBd: cachedHalvarBdB64!,
  };
}

export async function embedPdfFonts(doc: jsPDF): Promise<void> {
  registerPdfFontsFromBase64(doc, await loadPdfFontPack());
}

/** @deprecated используйте embedPdfFonts */
export async function embedLatoCyrillicInJsPdf(doc: jsPDF): Promise<void> {
  await embedPdfFonts(doc);
}
