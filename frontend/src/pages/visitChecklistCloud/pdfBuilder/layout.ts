import type {
  CardPdfTemplate,
  PdfColor,
  PdfFontMetrics,
  PdfOp,
  PdfPageLayout,
  PdfTemplateBlock,
  TeacherCardPdfLayout,
  TeacherCardPdfModel,
} from './types.ts';
import { approxPdfMetrics } from './metrics.ts';
import { blockTitle } from './defaultTemplate.ts';

export const A4_W = 595.28;
export const A4_H = 841.89;
const MM = 2.834645669;
const INK: PdfColor = [26, 21, 18];
const MUTED: PdfColor = [74, 85, 96];
const RED: PdfColor = [227, 6, 19];
const PANEL: PdfColor = [247, 244, 241];
const LINE: PdfColor = [214, 208, 200];
const GRAY: PdfColor = [148, 163, 184];
const GREEN: PdfColor = [22, 163, 74];
const YELLOW: PdfColor = [251, 191, 36];

type Frag = { h: number; keep: boolean; paint: (x: number, y: number, w: number, ops: PdfOp[]) => void };

function mm(n: number): number {
  return n * MM;
}

function addText(
  ops: PdfOp[],
  m: PdfFontMetrics,
  x: number,
  y: number,
  w: number,
  text: string,
  size: number,
  opts?: { font?: 'body' | 'head'; bold?: boolean; color?: PdfColor },
): number {
  const font = opts?.font || 'body';
  const bold = Boolean(opts?.bold);
  const color = opts?.color || INK;
  const lines = m.wrap(text, size, font, bold, w);
  const lh = m.line(size);
  let yy = y;
  for (const line of lines) {
    ops.push({ t: 'text', x, y: yy + size, s: line, font, size, bold, color });
    yy += lh;
  }
  return yy;
}

function headerFrag(model: TeacherCardPdfModel, m: PdfFontMetrics): Frag {
  return {
    h: 28,
    keep: true,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: 3, fill: RED });
      addText(ops, m, x, y + 6, w * 0.72, model.teacherName, 11, { font: 'head', bold: true });
      addText(ops, m, x + w * 0.72, y + 8, w * 0.28, `${model.projectTitle} · ${model.statusLabel}`, 8.5, {
        color: MUTED,
      });
    },
  };
}

function footerOps(page: PdfPageLayout, model: TeacherCardPdfModel, total: number, margin: number, m: PdfFontMetrics) {
  const y = A4_H - margin - 8;
  const label = `Страница ${page.index} из ${total}`;
  page.ops.push({ t: 'text', x: margin, y, s: formatGenDate(model.generatedAt), font: 'body', size: 8.5, color: MUTED });
  const tw = m.width(label, 8.5, 'body', false);
  page.ops.push({ t: 'text', x: A4_W - margin - tw, y, s: label, font: 'body', size: 8.5, color: MUTED });
}

function formatGenDate(iso: string): string {
  const d = String(iso || '').slice(0, 10);
  const [y, mo, da] = d.split('-');
  if (!y || !mo || !da) return d;
  return `${Number(da)}.${mo}.${y}`;
}

function emptyOf(block: PdfTemplateBlock, model: TeacherCardPdfModel): 'ok' | 'hide' | 'placeholder' | 'error' {
  if (model.loadErrors.length && ['compare', 'narrative'].includes(block.type)) return 'error';
  const policy = block.options.emptyPolicy || 'hide';
  const missing = (() => {
    switch (block.type) {
      case 'teacher':
        return false;
      case 'kpis':
        return model.kpis.visitCount == null && model.kpis.scorePct == null;
      case 'profile':
      case 'sections':
        return !model.sections.length;
      case 'compare':
        return !model.compare.rows.length;
      case 'observeSelf':
        return model.observeSelf.observeCount === 0 && model.observeSelf.selfCount === 0;
      case 'trend':
        return model.trend.points.length === 0;
      case 'watchers':
        return !model.watchers.visitors.length && !model.watchers.offline && !model.watchers.online && !model.watchers.self;
      case 'coverage':
        return model.coverage.total === 0;
      case 'strengths':
        return !model.strengths.length && !model.growth.length;
      case 'slices':
        return !model.bySubject.length && !model.byClass.length;
      case 'narrative':
        return !model.narrative.body;
      case 'visits':
        return !model.visits.length;
      default:
        return false;
    }
  })();
  if (!missing) return 'ok';
  return policy === 'placeholder' ? 'placeholder' : 'hide';
}

function cardTitle(ops: PdfOp[], m: PdfFontMetrics, x: number, y: number, w: number, title: string): number {
  return addText(ops, m, x, y, w, title, 12, { font: 'head', bold: true });
}

function placeholderFrag(title: string, m: PdfFontMetrics): Frag {
  return {
    h: 52,
    keep: true,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: 48, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      let yy = cardTitle(ops, m, x + 8, y + 8, w - 16, title);
      addText(ops, m, x + 8, yy + 4, w - 16, 'Нет данных', 10, { color: MUTED });
    },
  };
}

function kpiFrag(model: TeacherCardPdfModel, m: PdfFontMetrics, compact: boolean): Frag {
  const h = compact ? 88 : 108;
  return {
    h,
    keep: true,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: h - 4, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      let yy = cardTitle(ops, m, x + 8, y + 8, w - 16, 'Ключевые показатели');
      const rows: Array<[string, string]> = [
        ['Средний балл', model.kpis.scorePct == null ? 'нет данных' : `${model.kpis.scorePct}%`],
        ['Посещения', model.kpis.visitCount == null ? 'нет данных' : String(model.kpis.visitCount)],
        ['Наблюдения / самоанализы', `${model.kpis.observeCount ?? 'нет данных'} / ${model.kpis.selfCount ?? 'нет данных'}`],
        ['Последняя дата', model.kpis.lastVisit || 'нет данных'],
      ];
      for (const [k, v] of rows) {
        addText(ops, m, x + 8, yy, w - 16, `${k}: ${v}`, compact ? 9 : 10);
        yy += compact ? 14 : 16;
      }
      if (model.singleVisitCaution) {
        addText(ops, m, x + 8, yy, w - 16, 'Выводы основаны на одном посещении', 8.5, { color: MUTED });
      }
    },
  };
}

function teacherFrag(model: TeacherCardPdfModel, m: PdfFontMetrics): Frag {
  return {
    h: 86,
    keep: true,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: 80, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      const photo = 64;
      if (model.photoKey && !model.photoWarning) {
        ops.push({ t: 'image', x: x + 8, y: y + 8, w: photo, h: photo, key: 'photo' });
      } else {
        ops.push({ t: 'rect', x: x + 8, y: y + 8, w: photo, h: photo, fill: [255, 255, 255], stroke: RED, lw: 1.2, r: 4 });
        const ix = x + 8 + (photo - m.width(model.initials, 16, 'head', true)) / 2;
        ops.push({ t: 'text', x: ix, y: y + 46, s: model.initials, font: 'head', size: 16, bold: true, color: RED });
      }
      const tx = x + 84;
      let yy = addText(ops, m, tx, y + 10, w - 96, model.teacherName, 16, { font: 'head', bold: true });
      yy = addText(ops, m, tx, yy + 2, w - 96, `${model.department} · ${model.statusLabel}`, 10, { color: MUTED });
      addText(ops, m, tx, yy + 2, w - 96, model.projectTitle, 9, { color: MUTED });
      if (model.photoWarning) addText(ops, m, tx, y + 62, w - 96, model.photoWarning, 8.5, { color: MUTED });
    },
  };
}

const FOOTER_H = 28;

function pageBodyHeight(marginMm = 14): number {
  const margin = mm(marginMm);
  const contentTop = margin + 32;
  const contentBottom = A4_H - margin - FOOTER_H;
  return contentBottom - contentTop;
}

function chunkLines(lines: string[], lineHeight: number, maxH: number): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let h = 0;
  for (const line of lines) {
    if (h + lineHeight > maxH && cur.length) {
      chunks.push(cur);
      cur = [];
      h = 0;
    }
    cur.push(line);
    h += lineHeight;
  }
  if (cur.length) chunks.push(cur);
  return chunks.length ? chunks : [[]];
}

function barRowsHeight(
  m: PdfFontMetrics,
  w: number,
  rows: Array<{ title: string }>,
): number {
  let h = 0;
  const labelW = Math.max(24, w * 0.42);
  for (const row of rows) {
    const lines = m.wrap(row.title, 9, 'body', false, labelW);
    h += Math.max(16, lines.length * m.line(9)) + 4;
  }
  return h;
}

function barRows(
  ops: PdfOp[],
  m: PdfFontMetrics,
  x: number,
  y: number,
  w: number,
  rows: Array<{ title: string; pct: number | null; empty?: string }>,
): number {
  let yy = y;
  for (const row of rows) {
    const lines = m.wrap(row.title, 9, 'body', false, w * 0.42);
    const rowH = Math.max(16, lines.length * m.line(9));
    let ly = yy;
    for (const ln of lines) {
      ops.push({ t: 'text', x, y: ly + 9, s: ln, font: 'body', size: 9, color: INK });
      ly += m.line(9);
    }
    const bx = x + w * 0.44;
    const bw = w * 0.4;
    ops.push({ t: 'rect', x: bx, y: yy + 3, w: bw, h: 10, fill: [255, 255, 255], stroke: LINE, lw: 0.4, r: 2 });
    if (row.pct == null) {
      ops.push({ t: 'text', x: bx + 4, y: yy + 12, s: row.empty || 'нет данных', font: 'body', size: 8, color: MUTED });
    } else {
      const fill = row.pct <= 0 ? GRAY : row.pct >= 70 ? GREEN : row.pct >= 45 ? YELLOW : RED;
      ops.push({ t: 'rect', x: bx, y: yy + 3, w: Math.max(2, (bw * row.pct) / 100), h: 10, fill, r: 2 });
      ops.push({ t: 'text', x: bx + bw + 4, y: yy + 12, s: `${row.pct}%`, font: 'body', size: 8.5, color: INK });
    }
    yy += rowH + 4;
  }
  return yy;
}

function resolveProfileChart(
  mode: 'auto' | 'radar' | 'bars',
  sections: TeacherCardPdfModel['sections'],
  m: PdfFontMetrics,
): 'radar' | 'bars' {
  if (mode === 'radar') return 'radar';
  if (mode === 'bars') return 'bars';
  for (const sec of sections) {
    if (m.wrap(sec.title, 7.5, 'body', false, 52).length > 1) return 'bars';
    if (m.width(sec.title, 7.5, 'body', false) > 48) return 'bars';
  }
  return 'radar';
}

function profileFrag(model: TeacherCardPdfModel, m: PdfFontMetrics, mode: 'auto' | 'radar' | 'bars', width: number): Frag {
  const useBars = resolveProfileChart(mode, model.sections, m) === 'bars';
  const innerW = width - 16;
  const barsH = barRowsHeight(
    m,
    innerW,
    model.sections.map((s) => ({ title: s.title })),
  );
  const h = useBars ? 36 + barsH : 168;
  return {
    h: Math.max(80, h),
    keep: true,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: h - 2, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      let yy = cardTitle(ops, m, x + 8, y + 8, w - 16, 'Профиль результатов');
      if (useBars) {
        barRows(
          ops,
          m,
          x + 8,
          yy + 4,
          w - 16,
          model.sections.map((s) => ({ title: s.title, pct: s.fillPct })),
        );
        return;
      }
      const cx = x + w / 2;
      const cy = yy + 68;
      const r = 52;
      const n = Math.max(3, model.sections.length);
      const ring: Array<[number, number]> = [];
      const data: Array<[number, number]> = [];
      for (let i = 0; i < n; i += 1) {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        ring.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
        const pct = model.sections[i]?.fillPct ?? 0;
        data.push([cx + Math.cos(ang) * r * (pct / 100), cy + Math.sin(ang) * r * (pct / 100)]);
        const lx = cx + Math.cos(ang) * (r + 12);
        const ly = cy + Math.sin(ang) * (r + 12);
        const label = model.sections[i]?.title || '';
        const labelLines = m.wrap(label, 7.5, 'body', false, 52);
        const lh = m.line(7.5);
        labelLines.forEach((ln, li) => {
          ops.push({
            t: 'text',
            x: lx - 26,
            y: ly + li * lh,
            s: ln,
            font: 'body',
            size: 7.5,
            color: MUTED,
          });
        });
      }
      ops.push({ t: 'poly', pts: ring, stroke: LINE, lw: 0.6, close: true });
      ops.push({ t: 'poly', pts: data, stroke: RED, fill: [227, 6, 19], lw: 1.1, close: true });
    },
  };
}

function compareFrag(model: TeacherCardPdfModel, m: PdfFontMetrics, width: number): Frag {
  const rows = model.compare.rows.slice(0, 12);
  const h = 72 + barRowsHeight(
    m,
    width - 16,
    rows.map((r) => ({ title: r.title })),
  );
  return {
    h,
    keep: true,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: h - 2, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      let yy = cardTitle(ops, m, x + 8, y + 8, w - 16, 'Сравнение');
      const cap =
        model.compare.mode === 'none'
          ? 'Сравнение выключено'
          : `${model.compare.cohortLabel || (model.compare.mode === 'department' ? 'Кафедра' : 'Гимназия')}${
              model.compare.cohortSize ? `, выборка ${model.compare.cohortSize}` : ''
            }`;
      yy = addText(ops, m, x + 8, yy, w - 16, cap, 9, { color: MUTED });
      yy = addText(
        ops,
        m,
        x + 8,
        yy,
        w - 16,
        `Педагог ${model.compare.teacherPct == null ? 'нет данных' : `${model.compare.teacherPct}%`} · сравнение ${
          model.compare.cohortPct == null ? 'нет данных' : `${model.compare.cohortPct}%`
        }`,
        9,
      );
      barRows(
        ops,
        m,
        x + 8,
        yy + 4,
        w - 16,
        rows.map((r) => ({ title: r.title, pct: r.teacher })),
      );
    },
  };
}

function observeFrag(model: TeacherCardPdfModel, m: PdfFontMetrics): Frag {
  return {
    h: 96,
    keep: true,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: 90, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      let yy = cardTitle(ops, m, x + 8, y + 8, w - 16, 'Наблюдение и самоанализ');
      yy = addText(
        ops,
        m,
        x + 8,
        yy,
        w - 16,
        `Наблюдение: ${model.observeSelf.observePct == null ? 'Нет данных' : `${model.observeSelf.observePct}%`} (${model.observeSelf.observeCount})`,
        10,
      );
      addText(
        ops,
        m,
        x + 8,
        yy,
        w - 16,
        `Самоанализ: ${model.observeSelf.selfPct == null ? 'Нет данных' : `${model.observeSelf.selfPct}%`} (${model.observeSelf.selfCount})`,
        10,
      );
    },
  };
}

function trendFrag(model: TeacherCardPdfModel, m: PdfFontMetrics): Frag {
  return {
    h: 120,
    keep: true,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: 114, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      let yy = cardTitle(ops, m, x + 8, y + 8, w - 16, 'Динамика посещений');
      if (model.trend.insufficient) {
        addText(ops, m, x + 8, yy, w - 16, 'Недостаточно данных для динамики: нужно не меньше двух наблюдений.', 10, {
          color: MUTED,
        });
        return;
      }
      const box = { x: x + 16, y: yy + 8, w: w - 32, h: 64 };
      ops.push({ t: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, fill: [255, 255, 255], stroke: LINE, lw: 0.4 });
      const pts = model.trend.points;
      const poly: Array<[number, number]> = pts.map((p, i) => {
        const px = box.x + (pts.length === 1 ? box.w / 2 : (i * box.w) / (pts.length - 1));
        const py = box.y + box.h - (p.scorePct / 100) * box.h;
        return [px, py];
      });
      ops.push({ t: 'poly', pts: poly, stroke: RED, lw: 1.2 });
      addText(ops, m, x + 8, box.y + box.h + 2, w - 16, pts.map((p) => p.date).join(' · '), 8, { color: MUTED });
    },
  };
}

function watchersFrag(model: TeacherCardPdfModel, m: PdfFontMetrics): Frag {
  const h = 72 + model.watchers.visitors.length * 14;
  return {
    h,
    keep: true,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: h - 4, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      let yy = cardTitle(ops, m, x + 8, y + 8, w - 16, 'Наблюдатели и форматы');
      yy = addText(
        ops,
        m,
        x + 8,
        yy,
        w - 16,
        `Очно ${model.watchers.offline} · онлайн ${model.watchers.online} · самоанализ ${model.watchers.self}`,
        9,
      );
      for (const v of model.watchers.visitors) {
        yy = addText(ops, m, x + 8, yy, w - 16, `${v.name} — ${v.count}`, 9);
      }
    },
  };
}

function coverageFrag(model: TeacherCardPdfModel, m: PdfFontMetrics): Frag {
  return {
    h: 88,
    keep: true,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: 82, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      let yy = cardTitle(ops, m, x + 8, y + 8, w - 16, 'Заполненность рубрики');
      const t = Math.max(1, model.coverage.total);
      const items: Array<[string, number, PdfColor]> = [
        ['с оценкой', model.coverage.scored, GREEN],
        ['явный ноль', model.coverage.explicitZero, RED],
        ['пропущено', model.coverage.unanswered, GRAY],
      ];
      const bx = x + 8;
      const barY = yy;
      let xx = bx;
      for (const [, n, color] of items) {
        const ww = ((w - 16) * n) / t;
        if (n) ops.push({ t: 'rect', x: xx, y: barY, w: Math.max(ww, 0), h: 12, fill: color });
        xx += ww;
      }
      let ly = barY + 16;
      for (const [label, n] of items) {
        ly = addText(ops, m, bx, ly, w - 16, `${label}: ${n}`, 8.5, { color: MUTED });
      }
    },
  };
}

function strengthsFrag(model: TeacherCardPdfModel, m: PdfFontMetrics, wHint: number): Frag {
  const lines = [...model.strengths.map((s) => `Сильная сторона: ${s.title}`), ...model.growth.map((s) => `Точка роста: ${s.title}`)];
  const wrapped = lines.flatMap((t) => m.wrap(t, 10, 'body', false, wHint - 16));
  const h = 40 + wrapped.length * m.line(10);
  return {
    h,
    keep: false,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: h - 2, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      let yy = cardTitle(ops, m, x + 8, y + 8, w - 16, 'Сильные стороны и точки роста');
      for (const t of lines) yy = addText(ops, m, x + 8, yy, w - 16, t, 10);
    },
  };
}

function slicesFrag(model: TeacherCardPdfModel, m: PdfFontMetrics, width: number): Frag {
  const rows = [
    ...model.bySubject.map((r) => ({ title: `Предмет · ${r.name} (${r.visits})`, pct: r.scorePct })),
    ...model.byClass.map((r) => ({ title: `Класс · ${r.name} (${r.visits})`, pct: r.scorePct })),
  ];
  const h = 40 + barRowsHeight(m, width - 16, rows);
  return {
    h,
    keep: false,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: h - 2, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      const yy = cardTitle(ops, m, x + 8, y + 8, w - 16, 'По предметам и классам');
      barRows(ops, m, x + 8, yy + 2, w - 16, rows);
    },
  };
}

function sectionsFrag(model: TeacherCardPdfModel, m: PdfFontMetrics, width: number): Frag {
  const rows = model.sections.map((s) => ({
    title: `${s.title} (${s.earned ?? '—'} / ${s.max ?? '—'})`,
    pct: s.fillPct,
  }));
  const h = 40 + barRowsHeight(m, width - 16, rows);
  return {
    h,
    keep: false,
    paint: (x, y, w, ops) => {
      ops.push({ t: 'rect', x, y, w, h: h - 2, fill: PANEL, stroke: LINE, lw: 0.4, r: 4 });
      const yy = cardTitle(ops, m, x + 8, y + 8, w - 16, 'Результаты по разделам');
      barRows(ops, m, x + 8, yy + 2, w - 16, rows);
    },
  };
}

function narrativeFrags(model: TeacherCardPdfModel, m: PdfFontMetrics, width: number): Frag[] {
  const title = model.narrative.title || 'Методическая справка';
  const paras = model.narrative.body.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (!paras.length) {
    return [
      {
        h: 22,
        keep: true,
        paint: (x, y, w, ops) => {
          addText(ops, m, x, y, w, title, 13, { font: 'head', bold: true });
        },
      },
    ];
  }
  const out: Frag[] = [];
  const pageH = pageBodyHeight();
  const bodySize = 10.5;
  const bodyLh = m.line(bodySize);
  const titleH = 22;
  const firstPara = paras[0]!;
  const firstLines = m.wrap(firstPara, bodySize, 'body', false, width);
  const firstBlockH = titleH + firstLines.length * bodyLh + 6;
  const minWithTitle = titleH + Math.min(2, firstLines.length) * bodyLh;
  if (minWithTitle <= pageH) {
    out.push({
      h: firstBlockH,
      keep: true,
      paint: (x, y, w, ops) => {
        addText(ops, m, x, y, w, title, 13, { font: 'head', bold: true });
        addText(ops, m, x, y + titleH, w, firstPara, bodySize);
      },
    });
    paras.shift();
  } else {
    out.push({
      h: titleH,
      keep: true,
      paint: (x, y, w, ops) => {
        addText(ops, m, x, y, w, title, 13, { font: 'head', bold: true });
      },
    });
  }
  for (const para of paras) {
    const lines = m.wrap(para, bodySize, 'body', false, width);
    for (const chunk of chunkLines(lines, bodyLh, pageH - 8)) {
      const h = chunk.length * bodyLh + 4;
      out.push({
        h,
        keep: false,
        paint: (x, y, _w, ops) => {
          let ly = y;
          for (const line of chunk) {
            ops.push({ t: 'text', x, y: ly + bodySize, s: line, font: 'body', size: bodySize, color: INK });
            ly += bodyLh;
          }
        },
      });
    }
  }
  return out;
}

function visitFrags(model: TeacherCardPdfModel, block: PdfTemplateBlock, m: PdfFontMetrics, width: number): Frag[] {
  const detailed = block.options.visitDetail === 'detailed';
  const out: Frag[] = [];
  const pageH = pageBodyHeight();
  const bodySize = 10;
  const bodyLh = m.line(bodySize);
  const headerH = 24;
  const chunkMax = Math.min(pageH - headerH - 12, bodyLh * 10);
  for (const visit of model.visits) {
    const head = `${visit.date} · ${visit.subject} · ${visit.className} · ${visit.visitor}`;
    const bits = [visit.format, visit.summary, visit.recommendations].filter(Boolean);
    if (detailed) {
      for (const sec of visit.sections) {
        bits.push(`${sec.title}: ${sec.earned}/${sec.max}`);
        for (const item of sec.items) {
          bits.push(
            item.unanswered
              ? `${item.title}: пропущено`
              : `${item.title}: ${item.earned}/${item.max}${item.earned === 0 ? ' (явный ноль)' : ''}`,
          );
        }
      }
    }
    const lines = m.wrap(bits.join('\n'), bodySize, 'body', false, width);
    const chunks = chunkLines(lines, bodyLh, chunkMax);
    chunks.forEach((chunk, i) => {
      const continued = i > 0;
      const label = continued ? `Посещение · ${head} · продолжение` : `Посещение · ${head}`;
      const h = headerH + chunk.length * bodyLh + 4;
      out.push({
        h,
        keep: h <= pageH,
        paint: (x, y, w, ops) => {
          ops.push({ t: 'rect', x, y, w, h: 3, fill: RED });
          addText(ops, m, x, y + 8, w, label, 11, { font: 'head', bold: true });
          let ly = y + headerH;
          for (const line of chunk) {
            ops.push({ t: 'text', x, y: ly + bodySize, s: line, font: 'body', size: bodySize, color: INK });
            ly += bodyLh;
          }
        },
      });
    });
  }
  return out;
}

function fragsFor(
  block: PdfTemplateBlock,
  model: TeacherCardPdfModel,
  m: PdfFontMetrics,
  width: number,
): Frag[] {
  const state = emptyOf(block, model);
  if (state === 'hide') return [];
  const title = blockTitle(block.type);
  if (state === 'placeholder' || state === 'error') {
    const f = placeholderFrag(title, m);
    if (state === 'error') {
      return [
        {
          ...f,
          paint: (x, y, w, ops) => {
            f.paint(x, y, w, ops);
            addText(ops, m, x + 8, y + 32, w - 16, model.loadErrors.join(' '), 9, { color: RED });
          },
        },
      ];
    }
    return [f];
  }
  const compact = block.options.density === 'compact';
  switch (block.type) {
    case 'teacher':
      return [teacherFrag(model, m)];
    case 'kpis':
      return [kpiFrag(model, m, compact)];
    case 'profile':
      return [profileFrag(model, m, block.options.profileChart || 'bars', width)];
    case 'compare':
      return [compareFrag(model, m, width)];
    case 'observeSelf':
      return [observeFrag(model, m)];
    case 'trend':
      return [trendFrag(model, m)];
    case 'watchers':
      return [watchersFrag(model, m)];
    case 'coverage':
      return [coverageFrag(model, m)];
    case 'strengths':
      return [strengthsFrag(model, m, width)];
    case 'slices':
      return [slicesFrag(model, m, width)];
    case 'sections':
      return [sectionsFrag(model, m, width)];
    case 'narrative':
      return narrativeFrags(model, m, width);
    case 'visits':
      return visitFrags(model, block, m, width);
    default:
      return [];
  }
}

function newPage(index: number): PdfPageLayout {
  return { index, width: A4_W, height: A4_H, ops: [] };
}

export function layoutTeacherCard(
  model: TeacherCardPdfModel,
  template: CardPdfTemplate,
  metrics: PdfFontMetrics = approxPdfMetrics(),
): TeacherCardPdfLayout {
  const margin = mm(template.page?.marginMm || 14);
  const contentTop = margin + 32;
  const contentBottom = A4_H - margin - FOOTER_H;
  const contentW = A4_W - margin * 2;
  const gutter = 10;
  const halfW = (contentW - gutter) / 2;
  const warnings: string[] = [...model.loadErrors];
  const unknownBlocks: string[] = [];
  const pages: PdfPageLayout[] = [newPage(1)];
  const m = metrics;

  const paintHeader = (page: PdfPageLayout) => {
    headerFrag(model, m).paint(margin, margin, contentW, page.ops);
  };
  paintHeader(pages[0]!);

  type Packed = { width: 'full' | 'half'; breakBefore: boolean; frag: Frag };
  const packed: Packed[] = [];
  for (const block of template.blocks || []) {
    if (!block.enabled) continue;
    const known = [
      'teacher',
      'kpis',
      'profile',
      'compare',
      'observeSelf',
      'trend',
      'watchers',
      'coverage',
      'strengths',
      'slices',
      'sections',
      'narrative',
      'visits',
    ].includes(block.type);
    if (!known) {
      unknownBlocks.push(block.type);
      warnings.push(`Неизвестный модуль «${block.type}» не выведен.`);
      continue;
    }
    const w = block.width === 'half' ? halfW : contentW;
    const list = fragsFor(block, model, m, w);
    list.forEach((frag, i) => {
      packed.push({ width: block.width === 'half' && i === 0 ? 'half' : 'full', breakBefore: block.breakBefore && i === 0, frag });
    });
  }

  let y = contentTop;
  let pending: Packed | null = null;

  const pageInner = () => contentBottom - contentTop;

  const ensure = (need: number, keep: boolean) => {
    const page = pages[pages.length - 1]!;
    if (y + need <= contentBottom) return page;
    if (keep && y > contentTop && need <= pageInner()) {
      pages.push(newPage(pages.length + 1));
      paintHeader(pages[pages.length - 1]!);
      y = contentTop;
      return pages[pages.length - 1]!;
    }
    if (y + need > contentBottom) {
      pages.push(newPage(pages.length + 1));
      paintHeader(pages[pages.length - 1]!);
      y = contentTop;
    }
    return pages[pages.length - 1]!;
  };

  const paintFrag = (item: Packed, x: number, width: number) => {
    const frag = item.frag;
    if (frag.keep && frag.h > pageInner()) {
      warnings.push('Блок не уместился целиком и обрезан по высоте страницы.');
    }
    if (frag.h > contentBottom - y && y > contentTop) {
      pages.push(newPage(pages.length + 1));
      paintHeader(pages[pages.length - 1]!);
      y = contentTop;
    }
    const page = ensure(Math.min(frag.h, pageInner()), frag.keep);
    const drawH = Math.min(frag.h, contentBottom - y);
    if (drawH < frag.h) {
      warnings.push('Фрагмент не поместился на страницу целиком.');
    }
    frag.paint(x, y, width, page.ops);
    y += drawH + 8;
  };

  const flushPending = () => {
    if (!pending) return;
    paintFrag(pending, margin, halfW);
    pending = null;
  };

  for (const item of packed) {
    if (item.breakBefore) {
      flushPending();
      if (y > contentTop) {
        pages.push(newPage(pages.length + 1));
        paintHeader(pages[pages.length - 1]!);
        y = contentTop;
      }
    }
    if (item.width === 'half') {
      if (!pending) {
        pending = item;
        continue;
      }
      const rowH = Math.max(pending.frag.h, item.frag.h);
      const page = ensure(rowH + 8, true);
      pending.frag.paint(margin, y, halfW, page.ops);
      item.frag.paint(margin + halfW + gutter, y, halfW, page.ops);
      y += rowH + 8;
      pending = null;
      continue;
    }
    flushPending();
    paintFrag(item, margin, contentW);
  }
  flushPending();

  while (pages.length > 1) {
    const last = pages[pages.length - 1]!;
    const onlyChrome = last.ops.length <= headerFrag(model, m).h;
    if (last.ops.filter((op) => op.t !== 'rect' || op.h !== 3).length <= 2) {
      pages.pop();
    } else break;
    void onlyChrome;
  }

  pages.forEach((page, i) => {
    page.index = i + 1;
    footerOps(page, model, pages.length, margin, m);
  });

  return { pages, warnings, unknownBlocks };
}

export function layoutFingerprint(layout: TeacherCardPdfLayout): string {
  return JSON.stringify(layout.pages.map((p) => ({ n: p.ops.length, t: p.ops.filter((o) => o.t === 'text').length })));
}
