/**
 * html2canvas 1.4.x cannot parse modern CSS colors (`color-mix()`, `color(srgb …)`, oklch…).
 * Chrome resolves `color-mix` to `color(srgb …)` in getComputedStyle — still unsupported.
 * Before capture, bake rgb/rgba/hex into inline styles (and restore after).
 */

const COLOR_STYLE_PROPS = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'textDecorationColor',
  'columnRuleColor',
  'caretColor',
  'fill',
  'stroke',
  'stopColor',
  'floodColor',
  'lightingColor',
] as const;

/** Composite values that embed color tokens (gradients, shadows). */
const COMPOSITE_PAINT_PROPS = [
  'boxShadow',
  'textShadow',
  'webkitTextStrokeColor',
  'backgroundImage',
  'borderImageSource',
] as const;

const MODERN_COLOR_RE = /color-mix\(|oklch\(|oklab\(|(?:^|[^\w-])(?:lab|lch|color)\(/i;
const COLOR_SRGB_RE =
  /color\(srgb\s+([0-9.e+-]+)\s+([0-9.e+-]+)\s+([0-9.e+-]+)(?:\s*\/\s*([0-9.e+-]+))?\s*\)/gi;

type SavedPaint = {
  el: HTMLElement | SVGElement;
  cssText: string;
  fill: string | null;
  stroke: string | null;
  stopColor: string | null;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Convert a single color token to rgb/rgba/hex that html2canvas accepts. */
export function cssColorToHtml2CanvasSafe(raw: string): string | null {
  const v = String(raw || '').trim();
  if (!v || v === 'none') return null;
  if (v === 'transparent') return 'rgba(0, 0, 0, 0)';
  if (/^#([0-9a-f]{3,8})$/i.test(v) || /^(rgb|rgba|hsl|hsla)\(/i.test(v)) return v;

  COLOR_SRGB_RE.lastIndex = 0;
  const m = COLOR_SRGB_RE.exec(v);
  if (m && m.index === 0 && m[0].length === v.length) {
    const r = Math.round(clamp01(parseFloat(m[1]!)) * 255);
    const g = Math.round(clamp01(parseFloat(m[2]!)) * 255);
    const b = Math.round(clamp01(parseFloat(m[3]!)) * 255);
    const a = m[4] != null ? clamp01(parseFloat(m[4])) : 1;
    return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
  }

  if (typeof document !== 'undefined') {
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillStyle = v;
        const out = String(ctx.fillStyle || '').trim();
        if (/^#([0-9a-f]{3,8})$/i.test(out) || /^(rgb|rgba)\(/i.test(out)) return out;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Rewrite every `color(srgb …)` token inside a composite value (box-shadow, gradients). */
export function rewriteModernColorsInCssValue(raw: string): string {
  const input = String(raw || '');
  if (!input || !/color\(|color-mix\(|oklch\(|oklab\(|(?:^|[^\w-])(?:lab|lch)\(/i.test(input)) {
    return input;
  }
  COLOR_SRGB_RE.lastIndex = 0;
  let out = input.replace(COLOR_SRGB_RE, (token) => cssColorToHtml2CanvasSafe(token) || 'transparent');
  if (MODERN_COLOR_RE.test(out)) {
    // Unresolved modern color in a composite — drop paint rather than crash capture.
    if (/gradient|url\(|shadow/i.test(out) || /^\s*-?\d/.test(out)) return 'none';
    const whole = cssColorToHtml2CanvasSafe(out);
    if (whole) return whole;
    return 'none';
  }
  return out;
}

function needsPaintFlatten(value: string): boolean {
  return MODERN_COLOR_RE.test(value) || /color\(srgb/i.test(value) || /var\(/i.test(value);
}

/**
 * Inline rgb/rgba colors on `root` so html2canvas never sees color-mix / color(srgb).
 * Returns a restore function for the previous inline styles / SVG attrs.
 */
export function flattenCssColorsForPdfCapture(root: HTMLElement): () => void {
  if (typeof getComputedStyle !== 'function') return () => {};

  const saved: SavedPaint[] = [];
  const nodes: Element[] = [root, ...root.querySelectorAll('*')];

  for (const node of nodes) {
    if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) continue;
    const cs = getComputedStyle(node);
    saved.push({
      el: node,
      cssText: node.style.cssText,
      fill: node.getAttribute('fill'),
      stroke: node.getAttribute('stroke'),
      stopColor: node.getAttribute('stop-color'),
    });

    for (const prop of COLOR_STYLE_PROPS) {
      const raw = String((cs as CSSStyleDeclaration & Record<string, string>)[prop] || '');
      if (!raw || raw === 'none' || !needsPaintFlatten(raw)) continue;
      const safe = cssColorToHtml2CanvasSafe(raw);
      if (safe) (node.style as CSSStyleDeclaration & Record<string, string>)[prop] = safe;
    }

    for (const prop of COMPOSITE_PAINT_PROPS) {
      const raw = String((cs as CSSStyleDeclaration & Record<string, string>)[prop] || '');
      if (!raw || raw === 'none' || !needsPaintFlatten(raw)) continue;
      const safe = rewriteModernColorsInCssValue(raw);
      if (safe) (node.style as CSSStyleDeclaration & Record<string, string>)[prop] = safe;
    }

    if (node instanceof SVGElement) {
      for (const [attr, cssKey] of [
        ['fill', 'fill'],
        ['stroke', 'stroke'],
        ['stop-color', 'stopColor'],
      ] as const) {
        const attrRaw = node.getAttribute(attr);
        if (attrRaw === 'none') continue;
        const computed = String(
          cs.getPropertyValue(attr) || (cs as CSSStyleDeclaration & Record<string, string>)[cssKey] || '',
        );
        if (!computed || computed === 'none') continue;
        const source = attrRaw && needsPaintFlatten(attrRaw) ? attrRaw : computed;
        if (!needsPaintFlatten(source) && !needsPaintFlatten(computed) && !/var\(/i.test(attrRaw || '')) {
          continue;
        }
        const safe = cssColorToHtml2CanvasSafe(computed) || cssColorToHtml2CanvasSafe(source);
        if (safe && safe !== 'rgba(0, 0, 0, 0)') node.setAttribute(attr, safe);
      }
    }
  }

  return () => {
    for (let i = saved.length - 1; i >= 0; i--) {
      const item = saved[i]!;
      item.el.style.cssText = item.cssText;
      if (item.fill == null) item.el.removeAttribute('fill');
      else item.el.setAttribute('fill', item.fill);
      if (item.stroke == null) item.el.removeAttribute('stroke');
      else item.el.setAttribute('stroke', item.stroke);
      if (item.stopColor == null) item.el.removeAttribute('stop-color');
      else item.el.setAttribute('stop-color', item.stopColor);
    }
  };
}
