import type { jsPDF } from 'jspdf';
import { PDF_BODY_FONT, PDF_HEADING_FONT } from '../../../lib/pdf/jsPdfEmbedFonts.ts';
import type { PdfFontMetrics } from './types.ts';

function makeWrap(width: PdfFontMetrics['width']): PdfFontMetrics['wrap'] {
  return (text, size, font, bold, maxW) => {
    const chunks = String(text || '').split('\n');
    const lines: string[] = [];
    for (const chunk of chunks) {
      const raw = chunk.replace(/[ \t]+/g, ' ').trim();
      if (!raw) {
        if (chunk.length) lines.push('');
        continue;
      }
      const words = raw.split(' ');
      let cur = '';
      const pushLong = (word: string) => {
        let rest = word;
        while (rest && width(rest, size, font, bold) > maxW) {
          let cut = rest.length;
          while (cut > 1 && width(rest.slice(0, cut), size, font, bold) > maxW) cut -= 1;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        cur = rest;
      };
      for (const word of words) {
        const next = cur ? `${cur} ${word}` : word;
        if (width(next, size, font, bold) <= maxW) {
          cur = next;
          continue;
        }
        if (cur) lines.push(cur);
        if (width(word, size, font, bold) > maxW) pushLong(word);
        else cur = word;
      }
      if (cur) lines.push(cur);
    }
    return lines.filter((line, i, all) => line !== '' || i === 0 || all[i - 1] !== '');
  };
}

export function metricsFromWidth(width: PdfFontMetrics['width']): PdfFontMetrics {
  return {
    width,
    wrap: makeWrap(width),
    line: (size) => Math.max(10, size * 1.28),
  };
}

export function approxPdfMetrics(): PdfFontMetrics {
  const factor = (font: 'body' | 'head', bold: boolean) => (font === 'head' ? 0.62 : 0.54) * (bold ? 1.06 : 1);
  return metricsFromWidth((text, size, font, bold) => {
    let w = 0;
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (ch === ' ') w += size * 0.28;
      else if (code > 127) w += size * factor(font, bold) * 1.08;
      else w += size * factor(font, bold);
    }
    return w;
  });
}

export function metricsFromJsPdf(doc: jsPDF): PdfFontMetrics {
  return metricsFromWidth((text, size, font, bold) => {
    doc.setFont(font === 'head' ? PDF_HEADING_FONT : PDF_BODY_FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    return doc.getTextWidth(text);
  });
}
