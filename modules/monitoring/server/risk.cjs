// Зона риска для вкладки «Аналитика»: причины у ученика и у группы. Пороги только в RISK (lib/calc.cjs).
// Считается по полным работам; отсутствовавшие и незаполненные работы в зону риска не попадают.

const { GENTLE_SCALE, RISK, percentOf } = require('./lib/calc.cjs');

const minOf = (scale, mark) => {
  const row = scale.find(r => String(r.mark) === String(mark));
  return row ? Number(row.min_percent) : null;
};
const round1 = (v) => Math.round(v * 10) / 10;

// Базовый уровень по разделам: процент от максимума заданий раздела этого уровня.
function basicSections(r, tasks) {
  const sec = new Map();
  for (const t of tasks) {
    if (t.level !== 'basic') continue;
    if (!sec.has(t.section)) sec.set(t.section, { got: 0, max: 0 });
    const s = sec.get(t.section);
    s.got += Number(r.scores[t.id] || 0);
    s.max += t.max_points;
  }
  return [...sec.entries()].filter(([, s]) => s.max > 0).map(([section, s]) => ({ section, percent: percentOf(s.got, s.max) }));
}

// r: строка buildStudents (result, scores по task_id); scale: обычная шкала работы.
function studentReasons(r, tasks, scale) {
  const res = r.result;
  if (!res.complete) return [];
  const out = [];
  if (String(res.mark) === '2') out.push({ code: 'two', text: 'отметка «2»' });
  if (res.gentle_used) {
    const from = minOf(GENTLE_SCALE, res.mark);
    const to = minOf(scale, res.mark);
    const range = from !== null && to !== null ? ` (${from}–${to - 1}\u00a0%)` : '';
    out.push({ code: 'gentle', text: `«${res.mark}» только благодаря щадящему режиму${range}` });
  }
  if (res.percent >= RISK.edge_from && res.percent <= RISK.edge_to) out.push({ code: 'edge', text: `на грани двойки (${RISK.edge_from}–${RISK.edge_to}\u00a0%)` });
  const low = basicSections(r, tasks).filter(s => s.percent < RISK.basic_below);
  if (low.length) out.push({ code: 'basic', text: `базовый уровень ниже ${RISK.basic_below}\u00a0%: ${low.map(s => `${s.section} ${s.percent}\u00a0%`).join(', ')}` });
  return out;
}

const shareText = (x) => (Math.abs(x - 1 / 3) < 1e-9 ? 'больше трети' : `больше ${Math.round(x * 100)}\u00a0%`);

// sum: сводка группы (summarize из analytics.cjs); atRisk: сколько её учеников в зоне риска.
function groupRisk(sum, atRisk) {
  const complete = sum.complete;
  const twosShare = complete ? round1((100 * sum.marks[2]) / complete) : null;
  const reasons = [];
  if (complete) {
    if (twosShare >= RISK.group_twos_from) reasons.push({ code: 'twos', text: `«2» у ${twosShare.toLocaleString('ru-RU')}\u00a0% (порог ${RISK.group_twos_from}\u00a0%)` });
    if (sum.avg_percent !== null && sum.avg_percent < RISK.group_avg_below) reasons.push({ code: 'avg', text: `средний\u00a0% ${sum.avg_percent.toLocaleString('ru-RU')} (ниже ${RISK.group_avg_below})` });
    if (atRisk > complete * RISK.group_risk_share) reasons.push({ code: 'share', text: `в зоне риска ${atRisk} из ${complete} (${shareText(RISK.group_risk_share)})` });
  }
  return { at_risk: reasons.length > 0, students: atRisk, twos_share: twosShare, reasons };
}

// Пороги для подписей на экране.
function thresholds(scale) {
  return {
    ...RISK,
    gentle_three_from: minOf(GENTLE_SCALE, '3'),
    normal_three_from: scale ? minOf(scale, '3') : null,
  };
}

module.exports = { studentReasons, groupRisk, basicSections, thresholds };
