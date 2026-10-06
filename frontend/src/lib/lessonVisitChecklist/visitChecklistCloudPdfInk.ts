/** Raise pale fill-opacity values used by recharts radar/area on white PDF paper. */
export function boostPdfFillOpacity(op: number): number {
  if (!Number.isFinite(op) || op <= 0) return op;
  if (op < 0.55) return Math.min(0.72, Math.max(0.55, op * 3.4));
  return op;
}

function hardenSvgPaint(raw: string | null): string | null {
  const v = String(raw || '').trim();
  if (!v || v === 'none' || v === 'transparent') return null;
  if (/var\(--cab-red|e30613|#c40b18/i.test(v) || /color-mix\([^)]*cab-red/i.test(v)) return '#c40b18';
  if (/var\(/i.test(v) || /color-mix\(/i.test(v)) return '#1a1512';
  return null;
}

/** Raise pale recharts fills so teacher PDF is not washed-out on white paper. */
export function boostVisitChecklistPdfChartInk(clonedRoot: HTMLElement): void {
  for (const node of clonedRoot.querySelectorAll('svg [fill], svg [stroke], svg path, svg rect, svg circle, svg polygon, svg tspan, svg text')) {
    if (!(node instanceof Element)) continue;
    const fillFix = hardenSvgPaint(node.getAttribute('fill'));
    if (fillFix) {
      node.setAttribute('fill', fillFix);
      if (node instanceof SVGElement) node.style.fill = fillFix;
    }
    const strokeFix = hardenSvgPaint(node.getAttribute('stroke'));
    if (strokeFix) {
      node.setAttribute('stroke', strokeFix);
      if (node instanceof SVGElement) node.style.stroke = strokeFix;
    }
  }
  for (const node of clonedRoot.querySelectorAll('[fill-opacity]')) {
    if (!(node instanceof Element)) continue;
    const raw = node.getAttribute('fill-opacity');
    if (raw == null || raw === '') continue;
    const op = Number.parseFloat(raw);
    if (!Number.isFinite(op) || op <= 0) continue;
    const next = boostPdfFillOpacity(op);
    if (next !== op) node.setAttribute('fill-opacity', String(next));
  }
  for (const node of clonedRoot.querySelectorAll(
    '.recharts-text, .recharts-cartesian-axis-tick-value, .recharts-polar-angle-axis-tick, .recharts-legend-item-text, .recharts-label, tspan',
  )) {
    if (!(node instanceof SVGElement) && !(node instanceof HTMLElement)) continue;
    if (node instanceof SVGElement) {
      node.setAttribute('fill', '#1a1512');
      node.style.fill = '#1a1512';
    } else {
      node.style.color = '#1a1512';
    }
  }
  for (const node of clonedRoot.querySelectorAll(
    '.recharts-cartesian-grid line, .recharts-polar-grid-angle line, .recharts-polar-grid-concentric path, .recharts-polar-grid-concentric line',
  )) {
    if (!(node instanceof SVGElement)) continue;
    const stroke = node.getAttribute('stroke') || '';
    if (!stroke || stroke === 'none') continue;
    node.setAttribute('stroke', '#64748b');
    node.setAttribute('stroke-opacity', '0.95');
  }
}
