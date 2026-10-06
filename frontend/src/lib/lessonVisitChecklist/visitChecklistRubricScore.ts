import rubricData from './visitChecklistRubric.json' with { type: 'json' };

export type VisitRubricOption = { label: string; points: number };
export type VisitRubricItem = {
  sectionCode: string;
  sectionTitle: string;
  itemCode: string | null;
  indicator: string;
  options: VisitRubricOption[];
  comment: string | null;
  scoringMode: 'single' | 'additive';
  maxPoints: number;
};
export type VisitRubricSection = {
  code: string;
  title: string;
  maxSectionPoints: number;
  items: VisitRubricItem[];
};
export type VisitItemScore = {
  indicator: string;
  itemCode: string | null;
  earnedPoints: number;
  maxPoints: number;
  selectedLabels: string[];
  scoringMode: 'single' | 'additive';
};
export type VisitSectionScore = {
  code: string;
  title: string;
  items: VisitItemScore[];
  earnedPoints: number;
  maxPoints: number;
  hasPoints: boolean;
  fillRatio: number;
};

const RUBRIC = rubricData as { v: number; sections: VisitRubricSection[] };

export const VISIT_CHECKLIST_TOTAL_MAX = RUBRIC.sections.reduce((sum, sec) => sum + sec.maxSectionPoints, 0);

export function getVisitRubricSections(): VisitRubricSection[] {
  return RUBRIC.sections;
}

function normLabel(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[«»""]/g, '"')
    .trim();
}

export function findRubricItemByCode(code: string): VisitRubricItem | null {
  if (!code) return null;
  for (const sec of RUBRIC.sections) {
    const byCode = sec.items.find((it) => String(it.itemCode ?? '').trim() === code);
    if (byCode) return byCode;
  }
  return null;
}

function scoreLabelsAgainstItem(item: VisitRubricItem, labels: string[]): VisitItemScore {
  const selected: string[] = [];
  let earned = 0;
  for (const raw of labels) {
    const label = normLabel(raw);
    if (!label) continue;
    const opt =
      item.options.find((o) => normLabel(o.label) === label) ||
      item.options.find((o) => normLabel(o.label).includes(label) || label.includes(normLabel(o.label)));
    if (!opt) continue;
    selected.push(opt.label);
    earned += opt.points;
  }
  if (item.scoringMode === 'single' && selected.length > 1) {
    const best = item.options
      .filter((o) => selected.some((s) => normLabel(s) === normLabel(o.label)))
      .sort((a, b) => b.points - a.points)[0];
    earned = best?.points ?? earned;
    if (best) selected.splice(0, selected.length, best.label);
  }
  return {
    indicator: item.indicator,
    itemCode: item.itemCode,
    earnedPoints: Math.round(earned * 100) / 100,
    maxPoints: item.maxPoints,
    selectedLabels: selected,
    scoringMode: item.scoringMode,
  };
}

function splitPicks(raw: string): string[] {
  return String(raw || '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function scoreVisitFromSectionPicks(
  picksByCode: Map<string, string> | Record<string, string>,
): VisitSectionScore[] {
  const map = picksByCode instanceof Map ? picksByCode : new Map(Object.entries(picksByCode));
  return RUBRIC.sections.map((sec) => {
    const items = sec.items.map((item) => {
      const code = String(item.itemCode || '');
      const pick = code ? map.get(code) || '' : '';
      return scoreLabelsAgainstItem(item, splitPicks(pick));
    });
    const earnedPoints = items.reduce((sum, item) => sum + item.earnedPoints, 0);
    return {
      code: sec.code,
      title: sec.title,
      items,
      earnedPoints: Math.round(earnedPoints * 100) / 100,
      maxPoints: sec.maxSectionPoints,
      hasPoints: earnedPoints > 0,
      fillRatio: sec.maxSectionPoints > 0 ? earnedPoints / sec.maxSectionPoints : 0,
    };
  });
}
