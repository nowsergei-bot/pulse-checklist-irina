import type { AnalyticRow } from '../excelAnalytics/engine';
import type { CellPrimitive } from '../excelAnalytics/parse';
import type { ColumnRole, CustomFilterLabels } from '../excelAnalytics/types';
import { splitRubricPhrasesFromCell } from '../lessonAnalytics/lessonCompetencyScale';
import { rowMatchesTeacher, teacherDataColumnIndex } from '../lessonAnalytics/lessonAnalyticsRubricHeatmap';
import checklistSeed from './defaultSeed.json';
import rubricData from './visitChecklistRubric.json';
import { LESSON_VISIT_SECTION_DEFS } from './visitChecklistAnalyticsMapping';
import type { LessonVisitChecklistConfig } from './types';

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
  /** Есть ли хотя бы один положительный балл в разделе. */
  hasPoints: boolean;
  fillRatio: number;
};

export type VisitScoreHeatmapItem = {
  sectionCode: string;
  sectionTitle: string;
  indicator: string;
  itemCode: string | null;
  avgEarned: number;
  maxPoints: number;
  visitCount: number;
  fillRatio: number;
};

export type VisitScoreHeatmapSection = {
  code: string;
  title: string;
  maxSectionPoints: number;
  avgEarned: number;
  fillRatio: number;
  items: VisitScoreHeatmapItem[];
};

export type VisitSectionPresenceLine = {
  text: string;
  marked: boolean;
};

export type VisitSectionPresence = {
  code: string;
  title: string;
  hasPoints: boolean;
  /** Пункты с баллами (>0) — только формулировки, без чисел. */
  presentIndicators: string[];
  /** Пункты без баллов или с нулём. */
  absentIndicators: string[];
  /** Полный чек-лист раздела в порядке рубрики (все показатели и варианты). */
  checklistLines: VisitSectionPresenceLine[];
};

const RUBRIC = rubricData as { v: number; sections: VisitRubricSection[] };

function buildVisitCodeIndicatorMap(): Map<string, string> {
  const map = new Map<string, string>();
  const checklist = checklistSeed as LessonVisitChecklistConfig;
  for (const sec of checklist.sections) {
    for (const q of sec.questions) {
      const code = String(q.code ?? '').trim();
      const text = String(q.text ?? '').trim();
      if (code && text) map.set(code, text);
    }
  }
  return map;
}

const VISIT_CODE_TO_INDICATOR = buildVisitCodeIndicatorMap();

/** Справочник код→формулировка для промпта ИИ (коды в ответе модели не использовать). */
export function buildVisitChecklistLabelHintsForLlm(): string {
  if (VISIT_CODE_TO_INDICATOR.size === 0) return '';
  const lines: string[] = [
    'Справочник показателей чек-листа (код → полная формулировка; в ответе пиши только краткие смысловые названия 2–3 слова, коды не выводи):',
  ];
  const sorted = [...VISIT_CODE_TO_INDICATOR.entries()].sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  for (const [code, text] of sorted) {
    lines.push(`  ${code} — «${text}»`);
  }
  return lines.join('\n');
}

/** Максимальные баллы по разделам из официальной рубрики (столбец 6 Excel). */
export const VISIT_CHECKLIST_SECTION_MAX: ReadonlyMap<string, number> = new Map(
  RUBRIC.sections.map((s) => [s.code, s.maxSectionPoints]),
);

export const VISIT_CHECKLIST_TOTAL_MAX = RUBRIC.sections.reduce((sum, s) => sum + s.maxSectionPoints, 0);

/** Комментарии методиста из строк Excel (столбец G) — для промптов ИИ. */
export function visitChecklistRubricComments(): { indicator: string; sectionTitle: string; comment: string }[] {
  const out: { indicator: string; sectionTitle: string; comment: string }[] = [];
  for (const sec of RUBRIC.sections) {
    for (const item of sec.items) {
      const c = String(item.comment ?? '').trim();
      if (c) out.push({ indicator: item.indicator, sectionTitle: sec.title, comment: c });
    }
  }
  return out;
}

function normLabel(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[«»""]/g, '"')
    .trim();
}

/** «1.2 — да» → { code: '1.2', answer: 'да' } */
export function parseVisitPhrase(phrase: string): { code: string; answer: string } | null {
  const t = String(phrase ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*[—–-]\s*(.+)$/);
  if (m) return { code: m[1].trim(), answer: m[2].trim() };
  const colon = t.match(/^(.{8,80}?):\s*(.+)$/);
  if (colon) return { code: '', answer: colon[2].trim() };
  return { code: '', answer: t };
}

function findRubricItem(sectionCode: string, indicator: string): VisitRubricItem | null {
  const sec = RUBRIC.sections.find((s) => s.code === sectionCode);
  if (!sec) return null;
  const norm = normLabel(indicator);
  return (
    sec.items.find((it) => normLabel(it.indicator) === norm) ??
    sec.items.find((it) => normLabel(it.indicator).includes(norm) || norm.includes(normLabel(it.indicator))) ??
    null
  );
}

export function findRubricItemByCode(code: string): VisitRubricItem | null {
  if (!code) return null;
  for (const sec of RUBRIC.sections) {
    const byCode = sec.items.find((it) => String(it.itemCode ?? '').trim() === code);
    if (byCode) return byCode;
  }
  for (const sec of RUBRIC.sections) {
    const hit = sec.items.find((it) => code.startsWith(sec.code + '.') && normLabel(it.indicator).includes(normLabel(code)));
    if (hit) return hit;
  }
  return null;
}

/** Сопоставление кода вопроса (1.2) с показателем рубрики. */
function resolveIndicatorForPhrase(code: string, answer: string, sectionCode: string): VisitRubricItem | null {
  const sec = RUBRIC.sections.find((s) => s.code === sectionCode);
  if (!sec) return null;

  if (code) {
    const item = sec.items.find((it) => String(it.itemCode ?? '').trim() === code);
    if (item) return item;

    const checklistIndicator = VISIT_CODE_TO_INDICATOR.get(code);
    if (checklistIndicator) {
      const byChecklist = findRubricItem(sectionCode, checklistIndicator);
      if (byChecklist) return byChecklist;
    }

    const prefix = code.split('.')[0];
    if (prefix === sectionCode) {
      const sub = code.split('.')[1];
      const ordered = sec.items.filter((it) => it.itemCode);
      const idx = parseInt(sub ?? '', 10);
      if (Number.isFinite(idx) && ordered[idx - 1]) return ordered[idx - 1];
    }
  }

  const byAnswer = sec.items.find((it) =>
    it.options.some((o) => normLabel(o.label) === normLabel(answer)),
  );
  if (byAnswer) return byAnswer;

  return findRubricItemByCode(code);
}

/** Полная формулировка показателя рубрики + ответ (вместо «1.3 — да»). */
export function formatVisitSectionPhraseDisplay(phrase: string, sectionCode: string): string {
  const raw = String(phrase ?? '').trim();
  if (!raw) return '';

  const parsed = parseVisitPhrase(raw);
  if (!parsed) return raw;

  const item = resolveIndicatorForPhrase(parsed.code, parsed.answer, sectionCode);
  if (item) {
    return `${item.indicator} — ${parsed.answer}`;
  }

  if (parsed.code) {
    const checklistText = VISIT_CODE_TO_INDICATOR.get(parsed.code);
    if (checklistText) return `${checklistText} — ${parsed.answer}`;
  }

  return raw;
}

function scoreLabelsAgainstItem(item: VisitRubricItem, labels: string[]): VisitItemScore {
  const selected: string[] = [];
  let earned = 0;

  for (const raw of labels) {
    const label = normLabel(raw);
    if (!label) continue;
    const opt = item.options.find((o) => normLabel(o.label) === label);
    if (!opt) {
      const partial = item.options.find(
        (o) => normLabel(o.label).includes(label) || label.includes(normLabel(o.label)),
      );
      if (partial) {
        selected.push(partial.label);
        earned += partial.points;
      }
      continue;
    }
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

/** Оценка одного посещения по ячейкам разделов 1–10. */
export function scoreVisitFromSectionCells(sectionPhrasesByCode: Map<string, string[]>): VisitSectionScore[] {
  const answersByIndicator = new Map<string, string[]>();

  for (const [sectionCode, phrases] of sectionPhrasesByCode) {
    for (const ph of phrases) {
      const parsed = parseVisitPhrase(ph);
      if (!parsed) continue;
      const item = resolveIndicatorForPhrase(parsed.code, parsed.answer, sectionCode);
      if (!item) continue;
      const key = `${sectionCode}::${item.indicator}`;
      const cur = answersByIndicator.get(key) ?? [];
      cur.push(parsed.answer);
      answersByIndicator.set(key, cur);
    }
  }

  return RUBRIC.sections.map((sec) => {
    const items: VisitItemScore[] = sec.items.map((rubricItem) => {
      const key = `${sec.code}::${rubricItem.indicator}`;
      const labels = answersByIndicator.get(key) ?? [];
      return scoreLabelsAgainstItem(rubricItem, labels);
    });
    const earnedPoints = items.reduce((s, it) => s + it.earnedPoints, 0);
    const maxPoints = sec.maxSectionPoints;
    return {
      code: sec.code,
      title: sec.title,
      items,
      earnedPoints: Math.round(earnedPoints * 100) / 100,
      maxPoints,
      hasPoints: earnedPoints > 0,
      fillRatio: maxPoints > 0 ? earnedPoints / maxPoints : 0,
    };
  });
}

function sectionPhrasesFromRow(
  rawRows: CellPrimitive[][],
  roles: ColumnRole[],
  rowIdx: number,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const def of LESSON_VISIT_SECTION_DEFS) {
    const col = roles.indexOf(def.role);
    if (col < 0) continue;
    const line = rawRows[rowIdx];
    const cell = col < line.length ? line[col] : '';
    out.set(def.code, splitRubricPhrasesFromCell(cell));
  }
  return out;
}

/** Тепловая карта баллов по срезу (для панели методиста). */
export function buildVisitScoreHeatmap(
  rawRows: CellPrimitive[][],
  roles: ColumnRole[],
  filteredRows: AnalyticRow[],
): VisitScoreHeatmapSection[] {
  const rowIdxs = [...new Set(filteredRows.map((r) => r.idx))];
  if (!rowIdxs.length) return [];

  const itemAcc = new Map<string, { sum: number; count: number; item: VisitRubricItem; section: VisitRubricSection }>();
  const sectionAcc = new Map<string, { sum: number; count: number; section: VisitRubricSection }>();

  for (const ri of rowIdxs) {
    const sectionCells = sectionPhrasesFromRow(rawRows, roles, ri);
    const visitScores = scoreVisitFromSectionCells(sectionCells);
    for (const secScore of visitScores) {
      const sec = RUBRIC.sections.find((s) => s.code === secScore.code);
      if (!sec) continue;
      const sa = sectionAcc.get(sec.code) ?? { sum: 0, count: 0, section: sec };
      sa.sum += secScore.earnedPoints;
      sa.count += 1;
      sectionAcc.set(sec.code, sa);

      for (const itemScore of secScore.items) {
        const rubItem = sec.items.find((it) => it.indicator === itemScore.indicator);
        if (!rubItem) continue;
        const key = `${sec.code}::${itemScore.indicator}`;
        const ia = itemAcc.get(key) ?? { sum: 0, count: 0, item: rubItem, section: sec };
        ia.sum += itemScore.earnedPoints;
        ia.count += 1;
        itemAcc.set(key, ia);
      }
    }
  }

  return RUBRIC.sections.map((sec) => {
    const sa = sectionAcc.get(sec.code);
    const avgSec = sa && sa.count > 0 ? sa.sum / sa.count : 0;
    const items: VisitScoreHeatmapItem[] = sec.items.map((rubricItem) => {
      const key = `${sec.code}::${rubricItem.indicator}`;
      const ia = itemAcc.get(key);
      const avg = ia && ia.count > 0 ? ia.sum / ia.count : 0;
      const max = rubricItem.maxPoints;
      return {
        sectionCode: sec.code,
        sectionTitle: sec.title,
        indicator: rubricItem.indicator,
        itemCode: rubricItem.itemCode,
        avgEarned: Math.round(avg * 100) / 100,
        maxPoints: max,
        visitCount: ia?.count ?? 0,
        fillRatio: max > 0 ? avg / max : 0,
      };
    });
    return {
      code: sec.code,
      title: sec.title,
      maxSectionPoints: sec.maxSectionPoints,
      avgEarned: Math.round(avgSec * 100) / 100,
      fillRatio: sec.maxSectionPoints > 0 ? avgSec / sec.maxSectionPoints : 0,
      items,
    };
  });
}

/** Тепловая карта баллов одного педагога (средние по его посещениям). */
export function buildVisitTeacherScoreHeatmap(
  rawRows: CellPrimitive[][],
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
  teacherFilterKey: string | null,
  teacherLabel: string,
  rowIdxs: number[],
): VisitScoreHeatmapSection[] {
  const ti = teacherDataColumnIndex(roles, customLabels, teacherFilterKey);
  const teacherRowIdxs = rowIdxs.filter((ri) => {
    const line = rawRows[ri];
    if (!line?.length) return false;
    if (ti >= 0) {
      const teacherCell = ti < line.length ? line[ti] : '';
      return rowMatchesTeacher(teacherCell, teacherLabel);
    }
    return true;
  });
  if (!teacherRowIdxs.length) return [];
  const pseudoRows: AnalyticRow[] = teacherRowIdxs.map((idx) => ({ idx } as AnalyticRow));
  return buildVisitScoreHeatmap(rawRows, roles, pseudoRows);
}

/** Сводка баллов одного педагога (для ИИ и карточки). */
export function buildVisitTeacherSectionScores(
  rawRows: CellPrimitive[][],
  roles: ColumnRole[],
  customLabels: CustomFilterLabels,
  teacherFilterKey: string | null,
  teacherLabel: string,
  rowIdxs: number[],
): VisitSectionScore[] {
  const ti = teacherDataColumnIndex(roles, customLabels, teacherFilterKey);
  const mergedPhrases = new Map<string, string[]>();

  for (const ri of rowIdxs) {
    const line = rawRows[ri];
    if (!line?.length) continue;
    if (ti >= 0) {
      const teacherCell = ti < line.length ? line[ti] : '';
      if (!rowMatchesTeacher(teacherCell, teacherLabel)) continue;
    }
    const cells = sectionPhrasesFromRow(rawRows, roles, ri);
    for (const [code, phrases] of cells) {
      const cur = mergedPhrases.get(code) ?? [];
      cur.push(...phrases);
      mergedPhrases.set(code, cur);
    }
  }

  return scoreVisitFromSectionCells(mergedPhrases);
}

function optionLabelMarked(selectedLabels: string[], optionLabel: string): boolean {
  const norm = normLabel(optionLabel);
  if (!norm) return false;
  for (const raw of selectedLabels) {
    const sel = normLabel(raw);
    if (!sel) continue;
    if (sel === norm || sel.includes(norm) || norm.includes(sel)) return true;
  }
  return false;
}

function presenceLinesForRubricItem(
  rubricItem: VisitRubricItem,
  score: VisitItemScore,
): VisitSectionPresenceLine[] {
  if (rubricItem.scoringMode === 'additive' && rubricItem.options.length > 0) {
    return rubricItem.options.map((opt) => ({
      text: opt.label,
      marked: optionLabelMarked(score.selectedLabels, opt.label),
    }));
  }

  const marked =
    rubricItem.maxPoints > 0
      ? score.earnedPoints > 0
      : score.selectedLabels.some((s) => String(s ?? '').trim());

  return [{ text: rubricItem.indicator, marked }];
}

export type BuildVisitSectionPresenceOpts = {
  /** Вид для педагога: только отмеченные пункты этого педагога, без полной рубрики. */
  markedOnly?: boolean;
};

function finalizeVisitSectionPresence(
  sec: VisitRubricSection,
  secScore: VisitSectionScore | undefined,
  checklistLines: VisitSectionPresenceLine[],
  presentIndicators: string[],
  absentIndicators: string[],
  markedOnly: boolean,
): VisitSectionPresence | null {
  const markedLines = markedOnly ? checklistLines.filter((line) => line.marked) : checklistLines;
  if (markedOnly && markedLines.length === 0) return null;

  return {
    code: sec.code,
    title: sec.title,
    hasPoints: markedOnly ? markedLines.length > 0 : (secScore?.hasPoints ?? false),
    presentIndicators: markedOnly ? markedLines.map((line) => line.text) : presentIndicators,
    absentIndicators: markedOnly ? [] : absentIndicators,
    checklistLines: markedOnly ? markedLines : checklistLines,
  };
}

/** Бинарное присутствие баллов по разделам (для PDF педагога). */
export function buildVisitSectionPresence(
  sectionScores: VisitSectionScore[],
  opts?: BuildVisitSectionPresenceOpts,
): VisitSectionPresence[] {
  const markedOnly = opts?.markedOnly === true;
  const scoresByCode = new Map(sectionScores.map((sec) => [sec.code, sec]));

  const out: VisitSectionPresence[] = [];
  for (const sec of RUBRIC.sections) {
    const secScore = scoresByCode.get(sec.code);
    const scoreItemsByIndicator = new Map((secScore?.items ?? []).map((it) => [it.indicator, it]));

    const checklistLines: VisitSectionPresenceLine[] = [];
    const presentIndicators: string[] = [];
    const absentIndicators: string[] = [];

    for (const rubricItem of sec.items) {
      const score =
        scoreItemsByIndicator.get(rubricItem.indicator) ?? scoreLabelsAgainstItem(rubricItem, []);
      for (const line of presenceLinesForRubricItem(rubricItem, score)) {
        checklistLines.push(line);
        if (line.marked) presentIndicators.push(line.text);
        else absentIndicators.push(line.text);
      }
    }

    const finalized = finalizeVisitSectionPresence(
      sec,
      secScore,
      checklistLines,
      presentIndicators,
      absentIndicators,
      markedOnly,
    );
    if (finalized) out.push(finalized);
  }
  return out;
}

/** Контекст рубрики с баллами для промпта ИИ (методист / педагог). */
export function buildVisitScoringLlmContextRu(
  sectionScores: VisitSectionScore[],
  options?: { audience?: 'methodist' | 'teacher'; visitCount?: number },
): string {
  const audience = options?.audience ?? 'methodist';
  const visitCount = options?.visitCount ?? 1;
  const comments = visitChecklistRubricComments();
  const lines: string[] = [
    '=== Рубрика чек-листа посещения урока (баллы по столбцу 6 официального Excel) ===',
    `Посещений в срезе: ${visitCount}. Суммарный максимум по разделам 1–10: ${VISIT_CHECKLIST_TOTAL_MAX} баллов.`,
  ];

  if (comments.length) {
    lines.push('', 'Методические комментарии к показателям (из Excel):');
    for (const c of comments) {
      lines.push(`  • «${c.indicator}»: ${c.comment}`);
    }
  }

  lines.push('', 'Фактические баллы vs максимум по темам урока:');
  const sorted = [...sectionScores].sort((a, b) => a.fillRatio - b.fillRatio);
  for (const sec of sorted) {
    const pct = sec.maxPoints > 0 ? Math.round(sec.fillRatio * 100) : 0;
    lines.push(
      `  «${sec.title}»: ${sec.earnedPoints} из ${sec.maxPoints} (${pct}% от максимума)`,
    );
    const weakItems = sec.items
      .filter((it) => it.maxPoints > 0 && it.earnedPoints < it.maxPoints * 0.5)
      .slice(0, 4);
    if (weakItems.length) {
      for (const it of weakItems) {
        lines.push(
          `    — слабый показатель «${it.indicator}»: ${it.earnedPoints}/${it.maxPoints}` +
            (it.selectedLabels.length ? ` (отмечено: ${it.selectedLabels.join('; ')})` : ' (не отмечено)'),
        );
      }
    }
  }

  const weakest = sorted.filter((s) => s.maxPoints > 0).slice(0, 3);
  if (weakest.length) {
    lines.push('', 'Зоны внимания (наименьший % от максимума):');
    for (const w of weakest) {
      lines.push(`  • «${w.title}»: ${Math.round(w.fillRatio * 100)}%`);
    }
  }

  lines.push(
    '',
    'Служебно для модели: номера разделов и коды пунктов во входе — только для сопоставления с данными. В ответе пользователю — связная проза абзацами; показатели называй короткими смысловыми метками (2–3 слова), без кодов вроде 4.3 или 7.8.',
  );

  if (audience === 'teacher') {
    lines.push(
      'Для педагога: не называй числовые баллы и проценты в ответе — опирайся на сравнение с максимумом и конкретные пробелы; дай шаги по построению урока.',
    );
  } else {
    lines.push(
      'Для методиста: интерпретируй разрыв факт/макс; для показателей со сложением баллов учитывай отрицательные варианты; предложи приоритеты методической работы.',
    );
  }

  return lines.join('\n');
}

export function getVisitRubricSections(): VisitRubricSection[] {
  return RUBRIC.sections;
}
