import {
  chartAxisWrapChars,
  stripVisitChartVersionTokens,
  wrapChartAxisLabel,
  wrapChartPersonLabel,
} from '../lib/lessonVisitChecklist/visitChecklistCloudUi';

export const VISIT_CHART_AXIS_TICK = { fill: '#334155', fontSize: 11, letterSpacing: 0 as const };

export type VisitChecklistCategoryTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string };
  extra?: string;
  wrapWidth?: number;
  person?: boolean;
  width?: number;
};

export function VisitChecklistCategoryTick({
  x,
  y,
  payload,
  extra,
  wrapWidth,
  person,
  width,
}: VisitChecklistCategoryTickProps) {
  const full = stripVisitChartVersionTokens(String(payload?.value || ''));
  const chars = wrapWidth ?? chartAxisWrapChars(typeof width === 'number' && width < 40 ? 160 : width || 200);
  const { lines } = person ? wrapChartPersonLabel(full, chars, 2) : wrapChartAxisLabel(full, chars, 2);
  const left = Number(x) || 0;
  const top = Number(y) || 0;
  const lineCount = lines.length + (extra ? 1 : 0);
  const firstDy = lineCount > 1 ? -7 * (lineCount - 1) : 4;
  const tip = extra ? `${full} · ${extra}` : full;
  return (
    <text
      x={left}
      y={top}
      textAnchor="end"
      fill={VISIT_CHART_AXIS_TICK.fill}
      fontSize={VISIT_CHART_AXIS_TICK.fontSize}
      letterSpacing={0}
      style={{ letterSpacing: 0, overflow: 'visible' }}
    >
      <title>{tip}</title>
      {lines.map((line, i) => (
        <tspan key={`${i}-${line}`} x={left} dy={i === 0 ? firstDy : 13}>
          {line}
        </tspan>
      ))}
      {extra ? (
        <tspan x={left} dy={13} fill="#64748b" fontSize={10} letterSpacing={0}>
          {extra}
        </tspan>
      ) : null}
    </text>
  );
}

export function visitChecklistCategoryTick(opts?: { wrapWidth?: number; person?: boolean; extraFor?: (value: string) => string | undefined }) {
  return (props: VisitChecklistCategoryTickProps) => {
    const value = String(props.payload?.value || '');
    return (
      <VisitChecklistCategoryTick
        x={props.x}
        y={props.y}
        payload={props.payload}
        wrapWidth={opts?.wrapWidth}
        person={opts?.person}
        extra={opts?.extraFor?.(value)}
      />
    );
  };
}
