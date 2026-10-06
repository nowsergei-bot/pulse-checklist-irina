import type {
  MoEngagementSectionInsightInput,
  MoEngagementSectionInsightsRequest,
  ResultQuestion,
  SurveyExportRowsPayload,
} from '../types';

/** Разделы шкалы из scripts/data/mo-engagement-survey.json (без открытых вопросов). */
export const MO_ENGAGEMENT_SECTIONS = [
  { number: 1, title: 'Понимание целей, ценностей и перспектив школы', shortTitle: 'Цели и ценности', scaleCount: 3 },
  { number: 2, title: 'Восприятие регламентов и процедур', shortTitle: 'Регламенты', scaleCount: 2 },
  { number: 3, title: 'Уровень информированности', shortTitle: 'Коммуникация', scaleCount: 5 },
  { number: 4, title: 'Отношения с управленческой командой', shortTitle: 'Руководство', scaleCount: 3 },
  { number: 5, title: 'Отношения в команде', shortTitle: 'Команда', scaleCount: 3 },
  { number: 6, title: 'Взаимодействие в команде по рабочим вопросам', shortTitle: 'Сотрудничество', scaleCount: 3 },
  { number: 7, title: 'Прозрачность и справедливость системы оплаты труда', shortTitle: 'Оплата труда', scaleCount: 3 },
  { number: 8, title: 'Обязанности и организация труда', shortTitle: 'Организация труда', scaleCount: 4 },
  { number: 9, title: 'Условия труда', shortTitle: 'Условия труда', scaleCount: 3 },
  { number: 10, title: 'Признание и перспективы карьерного роста', shortTitle: 'Признание', scaleCount: 4 },
  { number: 11, title: 'Возможности обучения и развития', shortTitle: 'Обучение', scaleCount: 3 },
  { number: 12, title: 'Общая удовлетворённость и приверженность', shortTitle: 'Удовлетворённость', scaleCount: 4 },
] as const;

export type MoEngagementSectionScore = {
  number: number;
  title: string;
  shortTitle: string;
  avg: number | null;
  pct: number | null;
  questionCount: number;
  responseCount: number;
};

export type MoEngagementQuestionScore = {
  question: ResultQuestion;
  pct: number | null;
};

export type MoEngagementDeptRow = {
  department: string;
  responseCount: number;
  indexPct: number | null;
  sections: MoEngagementSectionScore[];
};

export const MO_ENGAGEMENT_LOW_SCORE_THRESHOLD = 80;
export const MO_ENGAGEMENT_LOW_AVG_THRESHOLD = 4;
export const MO_ENGAGEMENT_SCALE_MIN = 1;
export const MO_ENGAGEMENT_SCALE_MAX = 5;

/** Светофор шкалы 1–5 (как в форме опроса): 1–2 красный, 3 жёлтый, 4–5 зелёный. */
export const MO_ENGAGEMENT_SCALE_COLORS: Record<number, string> = {
  1: '#ef4444',
  2: '#ef4444',
  3: '#fbbf24',
  4: '#4ade80',
  5: '#16a34a',
};

export const MO_ENGAGEMENT_TRAFFIC_LIGHT = {
  red: MO_ENGAGEMENT_SCALE_COLORS[1],
  yellow: MO_ENGAGEMENT_SCALE_COLORS[3],
  green4: MO_ENGAGEMENT_SCALE_COLORS[4],
  green5: MO_ENGAGEMENT_SCALE_COLORS[5],
} as const;

export type MoEngagementSectionDetail = MoEngagementSectionScore & {
  questions: MoEngagementQuestionScore[];
};

export type MoEngagementDistributionRow = {
  score: number;
  label: string;
  count: number;
  sharePct: number;
};

export type MoEngagementRiskItem = {
  kind: 'section' | 'question';
  sectionNumber: number;
  title: string;
  shortTitle?: string;
  pct: number | null;
  avg: number | null;
  tone: 'low' | 'mid' | 'high';
};

export type MoEngagementRespondentRow = {
  id: number;
  respondent_id: string;
  department: string | null;
  fio: string | null;
  submitted_at: string;
  indexPct: number | null;
  sectionPcts: (number | null)[];
};

export type MoEngagementOpenAnswerRow = {
  responseId: number;
  respondent_id: string;
  questionId: number;
  questionText: string;
  text: string;
  department: string | null;
  fio: string | null;
  submitted_at: string;
};

/** Подпись автора открытого ответа: ФИО или «Анонимно» без технического идентификатора. */
export function formatMoEngagementAuthorLabel(
  fio: string | null | undefined,
  _respondentId?: string | null | undefined,
): string {
  const trimmed = String(fio ?? '').trim();
  if (trimmed) return trimmed;
  return 'Анонимно';
}

export type MoEngagementOpenQuestionAnswers = {
  questionId: number;
  questionText: string;
  answers: MoEngagementOpenAnswerRow[];
};

/** Шкала 1–5 → % вовлечённости (1 = 0%, 5 = 100%), как в презентации (~88,5%). */
export function scaleAverageToPct(avg: number, min = MO_ENGAGEMENT_SCALE_MIN, max = MO_ENGAGEMENT_SCALE_MAX): number {
  if (!Number.isFinite(avg)) return 0;
  const span = max - min;
  if (span <= 0) return 0;
  const pct = ((avg - min) / span) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10;
}

export function stripSurveyMarkdown(text: string): string {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractMoEngagementScaleQuestions(questions: ResultQuestion[]): ResultQuestion[] {
  return questions.filter((q) => q.type === 'scale' || q.type === 'rating');
}

export function findMoEngagementDeptQuestion(questions: ResultQuestion[]): ResultQuestion | null {
  return (
    questions.find((q) => q.type === 'radio' && /подразделени/i.test(q.text)) ??
    questions.find((q) => q.type === 'radio') ??
    null
  );
}

export function findMoEngagementOpenQuestions(questions: ResultQuestion[]): ResultQuestion[] {
  return questions.filter((q) => q.type === 'text' && !/^\s*фио/i.test(q.text || ''));
}

export function findMoEngagementFioQuestion(questions: ResultQuestion[]): ResultQuestion | null {
  return questions.find((q) => q.type === 'text' && /^\s*фио/i.test(q.text || '')) ?? null;
}

export function findMoEngagementFioQuestionFromExport(
  questions: SurveyExportRowsPayload['questions'],
): SurveyExportRowsPayload['questions'][number] | null {
  return questions.find((q) => q.type === 'text' && /^\s*фио/i.test(q.text || '')) ?? null;
}

export function findMoEngagementDeptQuestionFromExport(
  questions: SurveyExportRowsPayload['questions'],
): SurveyExportRowsPayload['questions'][number] | null {
  return (
    questions.find((q) => q.type === 'radio' && /подразделени/i.test(q.text)) ??
    questions.find((q) => q.type === 'radio') ??
    null
  );
}

export function extractMoEngagementScaleQuestionIds(
  questions: SurveyExportRowsPayload['questions'],
): number[] {
  return questions.filter((q) => q.type === 'scale' || q.type === 'rating').map((q) => q.id);
}

export function groupScaleQuestionsBySection(scaleQuestions: ResultQuestion[]): MoEngagementSectionScore[] {
  const detailed = groupScaleQuestionsDetailed(scaleQuestions);
  return detailed.map(({ questions: _q, ...rest }) => rest);
}

export function groupScaleQuestionsDetailed(scaleQuestions: ResultQuestion[]): MoEngagementSectionDetail[] {
  const out: MoEngagementSectionDetail[] = [];
  let offset = 0;
  for (const sec of MO_ENGAGEMENT_SECTIONS) {
    const slice = scaleQuestions.slice(offset, offset + sec.scaleCount);
    offset += sec.scaleCount;
    const avgs = slice
      .map((q) => q.average)
      .filter((a): a is number => a != null && Number.isFinite(a));
    const avg = avgs.length ? avgs.reduce((s, a) => s + a, 0) / avgs.length : null;
    const responseCount = slice.reduce((m, q) => Math.max(m, q.response_count || 0), 0);
    out.push({
      number: sec.number,
      title: sec.title,
      shortTitle: sec.shortTitle,
      avg,
      pct: avg != null ? scaleAverageToPct(avg) : null,
      questionCount: slice.length,
      responseCount,
      questions: slice.map((question) => ({
        question,
        pct: question.average != null ? scaleAverageToPct(question.average) : null,
      })),
    });
  }
  return out;
}

export function aggregateSectionDistribution(questions: ResultQuestion[]): MoEngagementDistributionRow[] {
  const totals = new Map<number, number>();
  for (let score = MO_ENGAGEMENT_SCALE_MIN; score <= MO_ENGAGEMENT_SCALE_MAX; score += 1) {
    totals.set(score, 0);
  }
  for (const q of questions) {
    for (const row of q.distribution ?? []) {
      const score = Number(row.label);
      if (!Number.isFinite(score) || score < MO_ENGAGEMENT_SCALE_MIN || score > MO_ENGAGEMENT_SCALE_MAX) continue;
      totals.set(score, (totals.get(score) ?? 0) + row.count);
    }
  }
  const sum = [...totals.values()].reduce((s, c) => s + c, 0);
  return [...totals.entries()].map(([score, count]) => ({
    score,
    label: String(score),
    count,
    sharePct: sum > 0 ? Math.round((count / sum) * 1000) / 10 : 0,
  }));
}

export function computeMoEngagementIndex(scaleQuestions: ResultQuestion[]): number | null {
  const avgs = scaleQuestions
    .map((q) => q.average)
    .filter((a): a is number => a != null && Number.isFinite(a));
  if (!avgs.length) return null;
  const mean = avgs.reduce((s, a) => s + a, 0) / avgs.length;
  return scaleAverageToPct(mean);
}

export function scoreMoEngagementQuestions(scaleQuestions: ResultQuestion[]): MoEngagementQuestionScore[] {
  return scaleQuestions.map((question) => ({
    question,
    pct: question.average != null ? scaleAverageToPct(question.average) : null,
  }));
}

export function pickMoEngagementLowScores(
  scaleQuestions: ResultQuestion[],
  threshold = MO_ENGAGEMENT_LOW_SCORE_THRESHOLD,
): MoEngagementQuestionScore[] {
  return scoreMoEngagementQuestions(scaleQuestions)
    .filter((row) => row.pct != null && row.pct < threshold)
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
}

export function pickMoEngagementStrengths(sectionScores: MoEngagementSectionScore[], limit = 4): MoEngagementSectionScore[] {
  return [...sectionScores]
    .filter((s) => s.pct != null)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .slice(0, limit);
}

export function pickMoEngagementRisks(sectionScores: MoEngagementSectionScore[], limit = 4): MoEngagementSectionScore[] {
  return [...sectionScores]
    .filter((s) => s.pct != null)
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))
    .slice(0, limit);
}

export function isMoEngagementRiskPct(pct: number | null): boolean {
  return pct != null && pct < MO_ENGAGEMENT_LOW_SCORE_THRESHOLD;
}

export function isMoEngagementRiskAvg(avg: number | null): boolean {
  return avg != null && avg < MO_ENGAGEMENT_LOW_AVG_THRESHOLD;
}

export function pctToScaleAverage(pct: number): number {
  return MO_ENGAGEMENT_SCALE_MIN + (pct / 100) * (MO_ENGAGEMENT_SCALE_MAX - MO_ENGAGEMENT_SCALE_MIN);
}

/** Светофор по среднему баллу или индексу (%): 1–2 красный, 3 жёлтый, 4–5 зелёный. */
export function engagementTrafficLightColor(pct: number | null, avg?: number | null): string {
  if (pct == null && (avg == null || !Number.isFinite(avg))) return MO_ENGAGEMENT_TRAFFIC_LIGHT.red;
  const score = avg != null && Number.isFinite(avg) ? avg : pctToScaleAverage(pct ?? 0);
  if (score <= 2) return MO_ENGAGEMENT_TRAFFIC_LIGHT.red;
  if (score < 3.5) return MO_ENGAGEMENT_TRAFFIC_LIGHT.yellow;
  if (score < 4.5) return MO_ENGAGEMENT_TRAFFIC_LIGHT.green4;
  return MO_ENGAGEMENT_TRAFFIC_LIGHT.green5;
}

export function barColorForEngagementPct(pct: number): string {
  return engagementTrafficLightColor(pct);
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function riskToneFromPct(pct: number | null, avg?: number | null): 'low' | 'mid' | 'high' {
  if (pct == null && (avg == null || !Number.isFinite(avg))) return 'mid';
  const score = avg != null && Number.isFinite(avg) ? avg : pctToScaleAverage(pct ?? 0);
  if (score <= 2) return 'low';
  if (score < 4) return 'mid';
  return 'high';
}

export function buildMoEngagementRiskZone(
  sectionDetails: MoEngagementSectionDetail[],
  scaleQuestions: ResultQuestion[],
): MoEngagementRiskItem[] {
  const items: MoEngagementRiskItem[] = [];

  for (const section of sectionDetails) {
    if (isMoEngagementRiskPct(section.pct) || isMoEngagementRiskAvg(section.avg)) {
      items.push({
        kind: 'section',
        sectionNumber: section.number,
        title: section.title,
        shortTitle: section.shortTitle,
        pct: section.pct,
        avg: section.avg,
        tone: riskToneFromPct(section.pct, section.avg),
      });
    }
    for (const { question, pct } of section.questions) {
      const avg = question.average ?? null;
      if (isMoEngagementRiskPct(pct) || isMoEngagementRiskAvg(avg)) {
        items.push({
          kind: 'question',
          sectionNumber: section.number,
          title: stripSurveyMarkdown(question.text),
          shortTitle: section.shortTitle,
          pct,
          avg,
          tone: riskToneFromPct(pct, avg),
        });
      }
    }
  }

  const lowQuestions = pickMoEngagementLowScores(scaleQuestions);
  for (const { question, pct } of lowQuestions) {
    const exists = items.some((i) => i.kind === 'question' && i.title === stripSurveyMarkdown(question.text));
    if (exists) continue;
    const sectionNumber =
      sectionDetails.find((s) => s.questions.some((q) => q.question.question_id === question.question_id))?.number ?? 0;
    items.push({
      kind: 'question',
      sectionNumber,
      title: stripSurveyMarkdown(question.text),
      pct,
      avg: question.average ?? null,
      tone: riskToneFromPct(pct, question.average ?? null),
    });
  }

  return items.sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
}

export function heatmapPctColor(pct: number | null, avg?: number | null): string {
  if (pct == null && (avg == null || !Number.isFinite(avg))) return 'rgba(17,24,39,0.06)';
  return hexToRgba(engagementTrafficLightColor(pct, avg), 0.38);
}

export function engagementTone(pct: number | null): 'high' | 'mid' | 'low' | 'empty' {
  if (pct == null || !Number.isFinite(pct)) return 'empty';
  const avg = pctToScaleAverage(pct);
  if (avg <= 2) return 'low';
  if (avg < 4) return 'mid';
  return 'high';
}

/** Индекс вовлечённости по срезу POST /results-filter для подразделения. */
export function computeDeptEngagementFromResults(questions: ResultQuestion[]): {
  indexPct: number | null;
  sections: MoEngagementSectionScore[];
} {
  const scaleQuestions = extractMoEngagementScaleQuestions(questions);
  return {
    indexPct: computeMoEngagementIndex(scaleQuestions),
    sections: groupScaleQuestionsBySection(scaleQuestions),
  };
}

export function buildMoEngagementDeptRows(
  baseQuestions: ResultQuestion[],
  deptSlices: Map<string, ResultQuestion[]>,
): MoEngagementDeptRow[] {
  const deptQ = findMoEngagementDeptQuestion(baseQuestions);
  if (!deptQ?.distribution?.length) return [];

  return deptQ.distribution
    .map((d) => {
      const sliceQuestions = deptSlices.get(String(d.label));
      const computed = sliceQuestions ? computeDeptEngagementFromResults(sliceQuestions) : null;
      return {
        department: String(d.label),
        responseCount: d.count,
        indexPct: computed?.indexPct ?? null,
        sections: computed?.sections ?? [],
      };
    })
    .sort((a, b) => b.responseCount - a.responseCount);
}

export function buildDepartmentSectionHeatmap(
  deptRows: MoEngagementDeptRow[],
  maxDepartments = Number.POSITIVE_INFINITY,
): { departments: string[]; sections: string[]; cells: (number | null)[][] } {
  const rows = deptRows.filter((d) => d.responseCount > 0);
  const limited = Number.isFinite(maxDepartments) ? rows.slice(0, maxDepartments) : rows;
  const sections = MO_ENGAGEMENT_SECTIONS.map((s) => s.shortTitle);
  const cells = limited.map((row) =>
    MO_ENGAGEMENT_SECTIONS.map((sec) => {
      const hit = row.sections.find((s) => s.number === sec.number);
      return hit?.pct ?? null;
    }),
  );
  return {
    departments: limited.map((r) => r.department),
    sections,
    cells,
  };
}

function parseScaleAnswer(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < MO_ENGAGEMENT_SCALE_MIN || n > MO_ENGAGEMENT_SCALE_MAX) return null;
  return n;
}

function computeSectionPctsFromAnswers(
  scaleQuestionIds: number[],
  answers: Record<number, unknown>,
): (number | null)[] {
  const out: (number | null)[] = [];
  let offset = 0;
  for (const sec of MO_ENGAGEMENT_SECTIONS) {
    const ids = scaleQuestionIds.slice(offset, offset + sec.scaleCount);
    offset += sec.scaleCount;
    const vals = ids.map((id) => parseScaleAnswer(answers[id])).filter((v): v is number => v != null);
    if (!vals.length) {
      out.push(null);
      continue;
    }
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    out.push(scaleAverageToPct(avg));
  }
  return out;
}

function parseExportDepartment(value: unknown): string | null {
  if (value == null || value === '') return null;
  return String(Array.isArray(value) ? value[0] : value).trim() || null;
}

function parseExportFio(value: unknown): string | null {
  if (value == null || value === '') return null;
  return String(value).trim() || null;
}

function parseExportTextAnswer(value: unknown, depth = 0): string | null {
  if (value == null || depth > 8) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== value) {
        const inner = parseExportTextAnswer(parsed, depth + 1);
        if (inner) return inner;
      }
    } catch {
      /* сырой текст */
    }
    return trimmed;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((x) => parseExportTextAnswer(x, depth + 1))
      .filter((s): s is string => Boolean(s))
      .join('\n')
      .trim();
    return joined || null;
  }

  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (rec.text != null) return parseExportTextAnswer(rec.text, depth + 1);
    if (rec.answer != null) return parseExportTextAnswer(rec.answer, depth + 1);
    if (rec.value != null) return parseExportTextAnswer(rec.value, depth + 1);
    const vals = Object.values(rec).filter((v) => v != null);
    if (vals.length === 1) return parseExportTextAnswer(vals[0], depth + 1);
    const joined = vals
      .map((v) => parseExportTextAnswer(v, depth + 1))
      .filter((s): s is string => Boolean(s))
      .join('\n')
      .trim();
    return joined || null;
  }

  const text = String(value).trim();
  return text || null;
}

export function findMoEngagementOpenQuestionsFromExport(
  questions: SurveyExportRowsPayload['questions'],
): SurveyExportRowsPayload['questions'] {
  return questions.filter((q) => q.type === 'text' && !/^\s*фио/i.test(q.text || ''));
}

export function buildMoEngagementOpenAnswers(payload: SurveyExportRowsPayload): MoEngagementOpenAnswerRow[] {
  const openQuestions = findMoEngagementOpenQuestionsFromExport(payload.questions);
  if (!openQuestions.length) return [];

  const deptQ = findMoEngagementDeptQuestionFromExport(payload.questions);
  const fioQ = findMoEngagementFioQuestionFromExport(payload.questions);
  const answers: MoEngagementOpenAnswerRow[] = [];

  for (const row of payload.rows) {
    const department = deptQ ? parseExportDepartment(row.answers[deptQ.id]) : null;
    const fio = fioQ ? parseExportFio(row.answers[fioQ.id]) : null;

    for (const question of openQuestions) {
      const text = parseExportTextAnswer(row.answers[question.id]);
      if (!text) continue;
      answers.push({
        responseId: row.id,
        respondent_id: row.respondent_id,
        questionId: question.id,
        questionText: stripSurveyMarkdown(question.text),
        text,
        department,
        fio,
        submitted_at: row.created_at,
      });
    }
  }

  return answers.sort((a, b) => {
    const ta = new Date(a.submitted_at).getTime();
    const tb = new Date(b.submitted_at).getTime();
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
    return b.responseId - a.responseId;
  });
}

export function groupMoEngagementOpenAnswers(
  rows: MoEngagementOpenAnswerRow[],
  openQuestions: ResultQuestion[],
): MoEngagementOpenQuestionAnswers[] {
  const byQuestion = new Map<number, MoEngagementOpenAnswerRow[]>();
  for (const row of rows) {
    const bucket = byQuestion.get(row.questionId) ?? [];
    bucket.push(row);
    byQuestion.set(row.questionId, bucket);
  }

  if (openQuestions.length) {
    return openQuestions.map((question) => ({
      questionId: question.question_id,
      questionText: stripSurveyMarkdown(question.text),
      answers: byQuestion.get(question.question_id) ?? [],
    }));
  }

  return [...byQuestion.entries()]
    .sort(([a], [b]) => a - b)
    .map(([questionId, answers]) => ({
      questionId,
      questionText: answers[0]?.questionText ?? '',
      answers,
    }));
}

export function buildMoEngagementRespondentRows(payload: SurveyExportRowsPayload): MoEngagementRespondentRow[] {
  const scaleQuestionIds = extractMoEngagementScaleQuestionIds(payload.questions);
  const deptQ = findMoEngagementDeptQuestionFromExport(payload.questions);
  const fioQ = findMoEngagementFioQuestionFromExport(payload.questions);

  return payload.rows
    .map((row) => {
      const department = deptQ ? parseExportDepartment(row.answers[deptQ.id]) : null;
      const fio = fioQ ? parseExportFio(row.answers[fioQ.id]) : null;
      const sectionPcts = computeSectionPctsFromAnswers(scaleQuestionIds, row.answers);
      const scaleVals = scaleQuestionIds
        .map((id) => parseScaleAnswer(row.answers[id]))
        .filter((v): v is number => v != null);
      const indexPct = scaleVals.length
        ? scaleAverageToPct(scaleVals.reduce((s, v) => s + v, 0) / scaleVals.length)
        : null;
      return {
        id: row.id,
        respondent_id: row.respondent_id,
        department,
        fio,
        submitted_at: row.created_at,
        indexPct,
        sectionPcts,
      };
    })
    .sort((a, b) => {
      const ta = new Date(a.submitted_at).getTime();
      const tb = new Date(b.submitted_at).getTime();
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
      return b.id - a.id;
    });
}

export function listMoEngagementDepartments(
  deptRows: MoEngagementDeptRow[],
  deptQuestion: ResultQuestion | null,
): string[] {
  const fromRows = deptRows.map((r) => r.department);
  const fromDist = deptQuestion?.distribution?.map((d) => String(d.label)) ?? [];
  return [...new Set([...fromDist, ...fromRows].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}

export type MoEngagementWeakSection = {
  number: number;
  shortTitle: string;
  pct: number | null;
};

export type MoEngagementWorstRespondent = {
  respondent: MoEngagementRespondentRow;
  authorLabel: string;
  weakSections: MoEngagementWeakSection[];
  openAnswers: MoEngagementOpenAnswerRow[];
  sortScore: number;
};

/** Эвристика: текст преимущественно на латинице — вероятно английский. */
export function looksLikeEnglishText(text: string): boolean {
  const trimmed = String(text || '').trim();
  if (trimmed.length < 8) return false;
  const latin = (trimmed.match(/[a-zA-Z]/g) || []).length;
  const cyrillic = (trimmed.match(/[а-яА-ЯёЁ]/g) || []).length;
  if (latin < 6) return false;
  return latin > cyrillic * 1.2;
}

function minSectionPct(sectionPcts: (number | null)[]): number | null {
  const vals = sectionPcts.filter((p): p is number => p != null && Number.isFinite(p));
  if (!vals.length) return null;
  return Math.min(...vals);
}

export function pickMoEngagementWorstRespondents(
  respondents: MoEngagementRespondentRow[],
  openAnswers: MoEngagementOpenAnswerRow[],
  limit = 10,
  filterDepartment?: string | null,
): MoEngagementWorstRespondent[] {
  const filtered = filterDepartment
    ? respondents.filter((r) => r.department === filterDepartment)
    : respondents;

  const openByResponseId = new Map<number, MoEngagementOpenAnswerRow[]>();
  for (const row of openAnswers) {
    const bucket = openByResponseId.get(row.responseId) ?? [];
    bucket.push(row);
    openByResponseId.set(row.responseId, bucket);
  }

  const ranked = filtered
    .filter((r) => r.indexPct != null && Number.isFinite(r.indexPct))
    .map((respondent) => {
      const minPct = minSectionPct(respondent.sectionPcts);
      const sortScore = (respondent.indexPct ?? 100) + (minPct != null ? minPct * 0.001 : 0);
      const weakSections = MO_ENGAGEMENT_SECTIONS.map((sec, i) => ({
        number: sec.number,
        shortTitle: sec.shortTitle,
        pct: respondent.sectionPcts[i] ?? null,
      }))
        .filter((s) => s.pct != null && s.pct < MO_ENGAGEMENT_LOW_SCORE_THRESHOLD)
        .sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100))
        .slice(0, 4);

      return {
        respondent,
        authorLabel: formatMoEngagementAuthorLabel(respondent.fio),
        weakSections,
        openAnswers: openByResponseId.get(respondent.id) ?? [],
        sortScore,
      };
    })
    .sort((a, b) => a.sortScore - b.sortScore)
    .slice(0, limit);

  return ranked;
}

type YoYSectionDeltaLike = {
  number: number;
  deltaPct: number | null;
  baselinePct: number | null;
};

const MO_ENGAGEMENT_INSIGHT_TEXT_MAX = 180;

function truncateInsightText(value: string, max = MO_ENGAGEMENT_INSIGHT_TEXT_MAX): string {
  const t = String(value ?? '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function resolveMoEngagementSectionNumber(section: { number?: unknown; sectionNumber?: unknown } | null | undefined): number | null {
  const raw = section?.number ?? section?.sectionNumber;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > MO_ENGAGEMENT_SECTIONS.length) return null;
  return n;
}

/** 12 разделов из шкальных вопросов (не из теплокарты подразделений). */
export function buildMoEngagementInsightSectionDetails(scaleQuestions: ResultQuestion[]): MoEngagementSectionDetail[] {
  const detailed = groupScaleQuestionsDetailed(scaleQuestions);
  if (detailed.length >= MO_ENGAGEMENT_SECTIONS.length) return detailed;
  return MO_ENGAGEMENT_SECTIONS.map((sec) => {
    const hit = detailed.find((d) => d.number === sec.number);
    if (hit) return hit;
    return {
      number: sec.number,
      title: sec.title,
      shortTitle: sec.shortTitle,
      avg: null,
      pct: null,
      questionCount: sec.scaleCount,
      responseCount: 0,
      questions: [],
    };
  });
}

export function buildMoEngagementInsightSectionScores(scaleQuestions: ResultQuestion[]): MoEngagementSectionScore[] {
  return buildMoEngagementInsightSectionDetails(scaleQuestions).map(({ questions: _q, ...rest }) => rest);
}

/** Проверка, что payload для ИИ-выводов содержит хотя бы один валидный раздел (number 1–12). */
export function countValidMoEngagementInsightSections(
  sections: { number?: unknown; sectionNumber?: unknown }[] | null | undefined,
): number {
  if (!Array.isArray(sections)) return 0;
  return sections.reduce((count, section) => count + (resolveMoEngagementSectionNumber(section) ? 1 : 0), 0);
}

export function isMoEngagementInsightRequestReady(
  sections: { number?: unknown; sectionNumber?: unknown }[] | null | undefined,
): boolean {
  return countValidMoEngagementInsightSections(sections) > 0;
}

export function buildMoEngagementSectionInsightsRequest(opts: {
  surveyTitle: string;
  totalResponses: number;
  filterDepartment?: string | null;
  compareWithPreviousYear?: boolean;
  sectionDetails?: MoEngagementSectionDetail[];
  scaleQuestions?: ResultQuestion[];
  deptRows: MoEngagementDeptRow[];
  yoySectionDeltas: YoYSectionDeltaLike[];
}): MoEngagementSectionInsightsRequest {
  const sectionDetails =
    opts.sectionDetails?.length
      ? opts.sectionDetails
      : buildMoEngagementInsightSectionDetails(opts.scaleQuestions ?? []);

  const sections: MoEngagementSectionInsightInput[] = sectionDetails.map((detail) => {
    const yoy = opts.yoySectionDeltas.find((d) => d.number === detail.number);
    const deptBreakdown = opts.deptRows
      .filter((d) => d.responseCount > 0)
      .map((d) => {
        const sec = d.sections.find((s) => s.number === detail.number);
        return { department: d.department, pct: sec?.pct ?? null };
      })
      .filter((d) => d.pct != null)
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

    return {
      number: detail.number,
      title: detail.title,
      shortTitle: detail.shortTitle,
      pct: detail.pct,
      avg: detail.avg,
      questionCount: detail.questionCount,
      questions: detail.questions.slice(0, 8).map(({ question, pct }) => ({
        text: truncateInsightText(stripSurveyMarkdown(question.text)),
        pct,
        avg: question.average ?? null,
      })),
      deptBreakdown: deptBreakdown.slice(0, 10),
      yoyDelta: opts.compareWithPreviousYear ? (yoy?.deltaPct ?? null) : null,
      yoyBaselinePct: opts.compareWithPreviousYear ? (yoy?.baselinePct ?? null) : null,
    };
  });

  return {
    surveyTitle: opts.surveyTitle,
    totalResponses: opts.totalResponses,
    filterDepartment: opts.filterDepartment ?? null,
    compareWithPreviousYear: Boolean(opts.compareWithPreviousYear),
    sections,
  };
}

export function buildMoEngagementOverallInsightRequest(opts: {
  surveyTitle: string;
  totalResponses: number;
  filterDepartment?: string | null;
  compareWithPreviousYear?: boolean;
  engagementIndex: number | null;
  yoyIndexDelta?: number | null;
  yoyBaselineIndex?: number | null;
  sectionScores?: MoEngagementSectionScore[];
  scaleQuestions?: ResultQuestion[];
  yoySectionDeltas: YoYSectionDeltaLike[];
}): import('../types').MoEngagementOverallInsightRequest {
  const sectionScores =
    opts.sectionScores?.length
      ? opts.sectionScores
      : buildMoEngagementInsightSectionScores(opts.scaleQuestions ?? []);

  const sections = sectionScores.map((section) => {
    const yoy = opts.yoySectionDeltas.find((d) => d.number === section.number);
    return {
      number: section.number,
      shortTitle: section.shortTitle,
      pct: section.pct,
      yoyDelta: opts.compareWithPreviousYear ? (yoy?.deltaPct ?? null) : null,
      yoyBaselinePct: opts.compareWithPreviousYear ? (yoy?.baselinePct ?? null) : null,
    };
  });

  return {
    surveyTitle: opts.surveyTitle,
    totalResponses: opts.totalResponses,
    filterDepartment: opts.filterDepartment ?? null,
    compareWithPreviousYear: Boolean(opts.compareWithPreviousYear),
    engagementIndex: opts.engagementIndex,
    yoyIndexDelta: opts.compareWithPreviousYear ? (opts.yoyIndexDelta ?? null) : null,
    yoyBaselineIndex: opts.compareWithPreviousYear ? (opts.yoyBaselineIndex ?? null) : null,
    sections,
  };
}
