import type { PdfOp, TeacherCardPdfLayout } from './types.ts';
import { A4_H, A4_W } from './layout.ts';

function opNode(op: PdfOp, i: number) {
  if (op.t === 'text') {
    return (
      <text
        key={i}
        x={op.x}
        y={op.y}
        fill={`rgb(${op.color.join(',')})`}
        fontSize={op.size}
        fontWeight={op.bold ? 700 : 400}
      >
        {op.s}
      </text>
    );
  }
  if (op.t === 'rect') {
    return (
      <rect
        key={i}
        x={op.x}
        y={op.y}
        width={op.w}
        height={op.h}
        rx={op.r || 0}
        fill={op.fill ? `rgb(${op.fill.join(',')})` : 'none'}
        stroke={op.stroke ? `rgb(${op.stroke.join(',')})` : 'none'}
        strokeWidth={op.lw || 0}
      />
    );
  }
  if (op.t === 'line') {
    return (
      <line
        key={i}
        x1={op.x1}
        y1={op.y1}
        x2={op.x2}
        y2={op.y2}
        stroke={`rgb(${op.color.join(',')})`}
        strokeWidth={op.lw}
      />
    );
  }
  if (op.t === 'poly') {
    const d = op.pts.map((p, n) => `${n ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ') + (op.close ? ' Z' : '');
    return (
      <path
        key={i}
        d={d}
        fill={op.fill ? `rgba(${op.fill.join(',')},0.18)` : 'none'}
        stroke={op.stroke ? `rgb(${op.stroke.join(',')})` : 'none'}
        strokeWidth={op.lw || 1}
      />
    );
  }
  if (op.t === 'image') {
    return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill="#eee" stroke="#ccc" />;
  }
  return null;
}

export default function PdfPagePreview({
  layout,
  selectedId,
  onSelect,
}: {
  layout: TeacherCardPdfLayout | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!layout) {
    return <div className="vcd-pdf-skel" aria-hidden />;
  }
  return (
    <div className="vcd-pdf-preview">
      {layout.pages.map((page) => (
        <div key={page.index} className="vcd-pdf-page" aria-label={`Страница ${page.index}`}>
          <svg viewBox={`0 0 ${A4_W} ${A4_H}`} role="img">
            {page.ops.map(opNode)}
          </svg>
          <button type="button" className="vcd-pdf-sr" onClick={() => selectedId && onSelect(selectedId)}>
            страница {page.index}
          </button>
        </div>
      ))}
    </div>
  );
}
