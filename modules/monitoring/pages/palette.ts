// Палитра модуля мониторинга (Ира, 28.10): морской, серо-бирюзовый, песок, тёмно-красный #9E3B3E (Ира, 28.10 вечер, вместо терракоты #B87A62). Все цвета данных только здесь.
// CSS берёт их через переменные --mon-p-* (paletteCss подключается в index.tsx), графики и Excel через PALETTE.
// Фирменный красный гимназии остаётся только на кнопках, заголовках разделов и вкладках, его здесь нет.

export const PALETTE = {
  // Клетки по проценту, одна шкала везде: 90 и выше, 85-89, 70-84, ниже 70.
  p90: { bg: '#1F4E5F', ink: '#FFFFFF' },
  p85: { bg: '#7FA7A6', ink: '#14262C' },
  p70: { bg: '#ECE4D2', ink: '#3A3428' },
  low: { bg: '#9E3B3E', ink: '#FFFFFF' },
  // Прогресс и изменения: рост, без изменений, снижение (и зона риска).
  up: { bg: '#1F4E5F', ink: '#FFFFFF' },
  same: { bg: '#CFC7B6', ink: '#3A3428' },
  down: { bg: '#9E3B3E', ink: '#FFFFFF' },
  // «не внесено»: белый фон, пунктирная рамка.
  empty: { bg: '#FFFFFF', border: '#CCCCCC', ink: '#999999' },
  // Отметки на экране ввода и в таблицах.
  mark: {
    5: { bg: '#1F4E5F', ink: '#FFFFFF' },
    4: { bg: '#7FA7A6', ink: '#14262C' },
    3: { bg: '#ECE4D2', ink: '#3A3428' },
    2: { bg: '#9E3B3E', ink: '#FFFFFF' },
  },
  // Линии графиков: группа, параллель пунктиром; несколько линий: оттенки морского и серо-бирюзового.
  line: {
    group: '#1F4E5F',
    parallel: '#9A9A9A',
    series: ['#1F4E5F', '#7FA7A6', '#3F7C8C', '#4F6F70', '#9BC1C0', '#2E6576', '#5E8F8E'],
  },
  // Светлые подложки: строка зоны риска, выбранная строка, нейтральные плашки.
  soft: { risk: '#F6EDE8', pick: '#E9F0F0', sand: '#F6F2EA', note: '#6B6458' },
} as const;

export type Band = 'p90' | 'p85' | 'p70' | 'low';

// Ступень шкалы по проценту. Одна и та же для тепловых таблиц, «Динамики», полос и столбиков.
export function percentBand(v: number): Band {
  if (v >= 90) return 'p90';
  if (v >= 85) return 'p85';
  if (v >= 70) return 'p70';
  return 'low';
}

// Подписи легенды в порядке шкалы.
export const BAND_LEGEND: { band: Band; label: string }[] = [
  { band: 'p90', label: '90 и выше' },
  { band: 'p85', label: '85-89' },
  { band: 'p70', label: '70-84' },
  { band: 'low', label: 'ниже 70' },
];

export const seriesColor = (i: number) => PALETTE.line.series[i % PALETTE.line.series.length];

// CSS-переменные для monitoring.css и rosters.css.
export const paletteCss = (() => {
  const p = PALETTE;
  const vars: Record<string, string> = {};
  for (const k of ['p90', 'p85', 'p70', 'low', 'up', 'same', 'down'] as const) {
    vars[`${k}-bg`] = p[k].bg;
    vars[`${k}-ink`] = p[k].ink;
  }
  for (const m of [5, 4, 3, 2] as const) {
    vars[`m${m}-bg`] = p.mark[m].bg;
    vars[`m${m}-ink`] = p.mark[m].ink;
  }
  vars['empty-bg'] = p.empty.bg;
  vars['empty-border'] = p.empty.border;
  vars['empty-ink'] = p.empty.ink;
  vars['line-group'] = p.line.group;
  vars['line-parallel'] = p.line.parallel;
  vars['risk'] = p.soft.risk;
  vars['pick'] = p.soft.pick;
  vars['sand'] = p.soft.sand;
  vars['note'] = p.soft.note;
  return `:root{${Object.entries(vars).map(([k, v]) => `--mon-p-${k}:${v}`).join(';')}}`;
})();

// Excel: заливка и цвет текста ячейки с процентом по той же шкале.
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;
type XCell = { value: unknown; fill?: unknown; font?: unknown };
export function xlsxPercent(cell: XCell, v: unknown) {
  if (typeof v !== 'number') return;
  const c = PALETTE[percentBand(v)];
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.bg) } };
  cell.font = { ...(cell.font as object || {}), color: { argb: argb(c.ink) } };
}
export function xlsxRisk(cell: XCell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(PALETTE.down.bg) } };
  cell.font = { ...(cell.font as object || {}), color: { argb: argb(PALETTE.down.ink) } };
}
// Шапка столбца отметки «5»..«2» в цвете отметки.
export function xlsxMark(cell: XCell, m: unknown) {
  const c = PALETTE.mark[Number(m) as 5 | 4 | 3 | 2];
  if (!c) return;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.bg) } };
  cell.font = { ...(cell.font as object || {}), color: { argb: argb(c.ink) } };
}
export const xlsxNote = argb(PALETTE.soft.note);
export const xlsxMuted = argb(PALETTE.empty.ink);
