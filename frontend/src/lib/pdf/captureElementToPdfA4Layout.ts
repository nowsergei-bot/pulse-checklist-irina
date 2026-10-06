export const PDF_DEFAULT_SCALE = 2;
export const PDF_MARGIN_MM = 12;
export const SLICE_BOTTOM_SAFE_CSS_PX = 28;
export const MIN_SLICE_HEIGHT_PX = 32;
export const PDF_MIN_FIT_SCALE = 0.72;

/** Стили замены textarea: без mid-word tears (`anywhere`) и без обрезки. */
export function textareaPdfReplacementLayout(): {
  whiteSpace: string;
  wordBreak: string;
  overflowWrap: string;
  hyphens: string;
  overflow: string;
} {
  return {
    whiteSpace: 'pre-wrap',
    wordBreak: 'normal',
    overflowWrap: 'break-word',
    hyphens: 'none',
    overflow: 'visible',
  };
}

export function mapKeepBlocksToCanvas(
  blocks: { top: number; bottom: number }[],
  expectedHeightPx: number,
  canvasHeight: number,
): { top: number; bottom: number }[] {
  const ratio = expectedHeightPx > 0 ? canvasHeight / expectedHeightPx : 1;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return blocks
    .map((b) => ({
      top: Math.max(0, Math.min(b.top * safeRatio, canvasHeight)),
      bottom: Math.max(0, Math.min(b.bottom * safeRatio, canvasHeight)),
    }))
    .filter((b) => b.bottom - b.top >= 2);
}

/** Сжать ширину картинки, если цельный блок чуть выше страницы — иначе режем только огромные блоки. */
export function fitPdfImageWidthMm(opts: {
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  canvasWidth: number;
  keepBlocks: { top: number; bottom: number }[];
  minScale?: number;
}): number {
  const maxWidth = Math.max(1, opts.pageWidthMm - 2 * opts.marginMm);
  const pageAvail = Math.max(1, opts.pageHeightMm - 2 * opts.marginMm);
  const minWidth = maxWidth * (opts.minScale ?? PDF_MIN_FIT_SCALE);
  if (opts.canvasWidth <= 0) return maxWidth;
  const capacityAt = (widthMm: number) => (pageAvail / widthMm) * opts.canvasWidth;
  const pagePx = capacityAt(maxWidth);
  const slightlyOver = opts.keepBlocks
    .map((b) => b.bottom - b.top)
    .filter((h) => h > pagePx && h <= pagePx * 1.35);
  const target = slightlyOver.length ? Math.max(...slightlyOver) : 0;
  if (target <= 0) return maxWidth;
  const needed = (pageAvail * opts.canvasWidth) / target;
  return Math.max(minWidth, Math.min(maxWidth, needed));
}

export function computeSliceBottomPx(
  yStart: number,
  pageCapacityPx: number,
  canvasHeight: number,
  blocks: { top: number; bottom: number }[],
  opts?: { safeBottomPx?: number; minSlicePx?: number },
): number {
  if (yStart >= canvasHeight) return canvasHeight;
  const safeBottom = opts?.safeBottomPx ?? SLICE_BOTTOM_SAFE_CSS_PX * PDF_DEFAULT_SCALE;
  const minSlice = opts?.minSlicePx ?? MIN_SLICE_HEIGHT_PX;
  const safeCap = Math.max(minSlice, pageCapacityPx - safeBottom);
  const maxBottom = Math.min(yStart + Math.floor(safeCap), canvasHeight);
  let end = maxBottom;

  /** Блок выше почти целой страницы — иначе PDF «застревает»; такой блок можно резать. */
  const splittableThreshold = pageCapacityPx * 0.92;

  for (let iter = 0; iter < blocks.length + 6; iter++) {
    let blocker: { top: number; bottom: number } | null = null;
    for (const b of blocks) {
      const blockH = b.bottom - b.top;
      if (blockH >= splittableThreshold) continue;
      if (end <= b.top || end >= b.bottom) continue;
      if (b.top < end && end < b.bottom && b.top >= yStart) {
        blocker = b;
        break;
      }
    }
    if (!blocker) break;
    const blockH = blocker.bottom - blocker.top;
    const nb = Math.floor(blocker.top);
    const fitsOnOnePage = blockH <= safeCap;
    const remaining = maxBottom - yStart;

    if (nb > yStart && (fitsOnOnePage || remaining < blockH)) {
      end = nb;
      continue;
    }
    if (fitsOnOnePage && blocker.top > yStart) {
      end = Math.floor(blocker.top);
      continue;
    }
    break;
  }

  if (end <= yStart) end = maxBottom;
  if (end - yStart < minSlice && end < canvasHeight) {
    const expanded = Math.min(maxBottom, canvasHeight);
    const wouldCutBlock = blocks.some((b) => {
      if (b.bottom - b.top >= splittableThreshold) return false;
      return yStart < b.top && b.top < expanded && expanded < b.bottom;
    });
    if (!wouldCutBlock) end = expanded;
  }
  end = Math.min(Math.max(end, yStart + 1), canvasHeight);
  /** Никогда не «съедать» весь оставшийся канвас одним срезом, если он выше страницы A4. */
  const maxSlice = Math.floor(safeCap);
  if (canvasHeight - yStart > maxSlice && end - yStart > maxSlice) {
    end = Math.min(end, yStart + maxSlice);
  }
  return end;
}
