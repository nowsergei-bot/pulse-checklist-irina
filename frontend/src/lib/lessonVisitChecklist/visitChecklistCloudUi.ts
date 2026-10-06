import type { LessonVisitDirectory } from './types';
import { resolveFullTeacherName } from './visitChecklistPeople.ts';
import { looksLikeTeacherCode } from './visitChecklistScheduleMatch.ts';

/** Светофор как в дашборде вовлечённости: красный / жёлтый / зелёный. */
const TRAFFIC = { red: '#ef4444', yellow: '#fbbf24', green: '#16a34a', greenSoft: '#4ade80' } as const;

/** User-facing chart titles/hints — no rubric/version tokens (4.0, 10.1, …). */
export const VISIT_CHECKLIST_CHART_COPY = {
  attention: {
    title: 'Требует внимания',
    hint: 'Критерии с самыми низкими результатами по заполненным чек-листам.',
  },
  sections: {
    title: 'Разделы чек-листа',
    hint: 'Доля набранных баллов по каждому разделу.',
  },
  sectionsByDept: {
    title: 'Разделы по кафедрам',
    hint: 'Результаты каждой кафедры по разделам чек-листа, в процентах от максимального балла.',
  },
  observeSelf: {
    title: 'Наблюдение и самоанализ',
    hint: 'Сравнение оценок наблюдателей и самооценок педагогов.',
  },
  coverage: {
    title: 'Полнота данных',
    hint: 'Количество наблюдений и самоанализов по каждому педагогу.',
  },
  departments: {
    title: 'Кафедры',
    hint: 'Средние результаты анализа уроков педагогов каждой кафедры.',
  },
  teachers: {
    title: 'Педагоги',
    hint: 'Средний балл по каждому педагогу.',
  },
  profile: { title: 'Профиль результатов', hint: '' },
  subjects: {
    title: 'По предметам',
    hint: 'Средние результаты анализа уроков по учебным предметам.',
  },
  classes: {
    title: 'Классы',
    hint: 'Средние результаты анализа уроков, проведённых в каждом классе.',
  },
  visitors: {
    title: 'Выставленные оценки',
    hint: 'Средние оценки уроков по каждому наблюдателю.',
  },
  ordinal: {
    title: 'Общая оценка',
    hint: 'Распределение общих оценок урока.',
  },
  format: {
    title: 'Формат посещения',
    hint: 'Очные и онлайн-посещения уроков.',
  },
  trend: {
    title: 'Результаты по датам',
    hint: 'Средние результаты анализа уроков по датам посещения.',
  },
  compare: {
    title: 'Сравнение результатов',
    hint: 'Результаты педагога в сравнении со средними результатами кафедры или гимназии.',
  },
  teacherObserveSelf: {
    title: 'Наблюдение и самоанализ',
    hint: 'Оценки наблюдателей и самооценки педагога показаны отдельно.',
  },
  sectionGap: {
    title: 'Разрыв по разделам',
    hint: 'Пара баров по разделу. Флаг, если разница самоанализа и наблюдения больше 20 пунктов.',
  },
  recentVisits: {
    title: 'Последние визиты',
    hint: 'Балл каждого из последних посещений, а не одна средняя точка.',
  },
  watchers: {
    title: 'Наблюдатели',
    hint: 'Кто посещал уроки и в каком формате проводилось наблюдение.',
  },
  criteria: {
    title: 'Оценки по критериям',
    hint: 'Средние результаты по отдельным критериям чек-листа, в процентах от максимального балла.',
  },
  directorLevels: {
    title: 'Уровень учителей',
    hint: 'Средняя оценка урока. Слабые сверху. Под фамилией — сколько уроков в расчёте.',
  },
  directorDynamics: {
    title: 'Динамика педагогов',
    hint: 'Только педагоги с тремя и более наблюдениями.',
  },
  ordinalLevel: {
    title: 'Оценка уровня урока',
    hint: '',
  },
  publicDeptTemp: {
    title: 'Температура по кафедрам',
    hint: 'Средний балл чек-листа',
  },
  publicBlocks: {
    title: 'Профиль по блокам',
    hint: 'Среднее по всем посещениям',
  },
  publicBlockProfile: { title: 'Профиль по блокам чек-листа', hint: '' },
  publicTeacherBlocks: { title: 'Блоки чек-листа', hint: '' },
} as const;

export const VISIT_CHART_VERSION_TOKEN_RE =
  /\b(?:4\.0(?:\.\d+)?|10\.1(?:\.\d+)?)\b|рубрик[аи]\s*4(?:\.0)?|earned\s*\/\s*max/i;

export function stripVisitChartVersionTokens(text: string): string {
  return String(text || '')
    .replace(/\s*рубрик[аи]\s*4(?:\.0(?:\.\d+)?)?/gi, '')
    .replace(/\s*\b(?:4\.0(?:\.\d+)?|10\.1(?:\.\d+)?)\b/g, '')
    .replace(/\s*earned\s*\/\s*max/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function visitChecklistChartCopyTexts(): string[] {
  return Object.values(VISIT_CHECKLIST_CHART_COPY).flatMap((block) =>
    [block.title, block.hint].filter((part) => String(part || '').trim()),
  );
}

export function chartPersonLabel(
  raw: string | null | undefined,
  directory?: LessonVisitDirectory | null,
): string {
  return resolveFullTeacherName(raw, directory) || displayTeacherTitle(raw);
}

export function chartAxisWrapChars(axisWidthPx: number): number {
  return Math.max(12, Math.min(22, Math.floor((Number(axisWidthPx) - 12) / 8)));
}

/** Plot height so each category band fits a 2-line tick (plus optional extra line). */
export function verticalCategoryChartHeight(rowCount: number, extraLine = false): number {
  const n = Math.max(0, Math.floor(Number(rowCount) || 0));
  if (!n) return 260;
  const row = extraLine ? 68 : 56;
  return Math.max(260, n * row + 48);
}

import { isSelfAnalysisFormat, normalizeVisitFormat, pickVisitFormat } from './visitChecklistFormat.ts';

export { isSelfAnalysisFormat, normalizeVisitFormat, pickVisitFormat };

export type VisitFormatKind = 'offline' | 'online' | 'self';

export function visitFormatKind(raw: string | null | undefined): VisitFormatKind {
  if (isSelfAnalysisFormat(raw)) return 'self';
  if (/онлайн|online|дистанц/i.test(String(raw || ''))) return 'online';
  return 'offline';
}

export function countVisitKinds(
  visits: Array<{ format?: string | null }> | null | undefined,
): { observe: number; self: number } {
  let observe = 0;
  let self = 0;
  for (const visit of visits || []) {
    if (isSelfAnalysisFormat(visit.format)) self += 1;
    else observe += 1;
  }
  return { observe, self };
}

export function countVisitFormats(
  visits: Array<{ format?: string | null }> | null | undefined,
): { offline: number; online: number; self: number } {
  const out = { offline: 0, online: 0, self: 0 };
  for (const visit of visits || []) {
    out[visitFormatKind(visit.format)] += 1;
  }
  return out;
}

export function isManualNarrativeSource(source: string | null | undefined): boolean {
  return String(source || '').trim().toLowerCase() === 'manual';
}

export function isNarrativeLocked(opts: {
  source?: string | null;
  savedNarrative?: string | null;
  draftNarrative?: string | null;
}): boolean {
  const draft = String(opts.draftNarrative || '');
  if (!draft.trim()) return false;
  if (isManualNarrativeSource(opts.source)) return true;
  return draft !== String(opts.savedNarrative || '');
}

export function narrativeOriginLabel(opts: {
  source?: string | null;
  locked?: boolean;
  hasText?: boolean;
}): string | null {
  if (!opts.hasText) return null;
  if (opts.locked || isManualNarrativeSource(opts.source)) return 'Текст методиста';
  return 'Черновик ИИ';
}

export const AI_NARRATIVE_PROVIDER_LABEL = 'ИИ — GigaChat';
export const AI_UNAVAILABLE_WITH_SOURCE_DATA =
  'Не удалось сформировать анализ с помощью ИИ. Ниже показаны исходные данные чек-листов. Попробуйте ещё раз.';
export const SELECT_TEACHER_MESSAGE = 'Выберите педагога, чтобы посмотреть результаты анализа уроков.';
export const NO_TEACHER_CHECKLISTS_MESSAGE = 'По этому педагогу пока нет заполненных чек-листов.';
export const VISIT_CHECKLIST_CLOUD_LOAD_ERROR = 'Не удалось загрузить дашборд. Обновите страницу или попробуйте позже.';

const RAW_CLOUD_ERROR =
  /request to function|function ['"`][a-z0-9_-]+|failed to fetch|fetch failed|networkerror|econnreset|etimedout|enotfound|502|503|504|cors/i;

export function humanizeVisitChecklistCloudError(
  err: unknown,
  fallback = VISIT_CHECKLIST_CLOUD_LOAD_ERROR,
): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const text = raw.trim();
  if (!text) return fallback;
  // Already-humanized Russian UI copy (incl. PDF messages that mention CORS) must win
  // over the raw-network regex — otherwise «…фото (CORS)» collapses to the generic fallback.
  if (/[а-яё]/i.test(text)) return text;
  if (RAW_CLOUD_ERROR.test(text)) return fallback;
  return fallback;
}

export function teacherGreetingName(fullName: string | null | undefined): string {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length || /педагог без фио/i.test(parts.join(' '))) return '';
  if (parts.length >= 3) return `${parts[1]} ${parts[2]}`;
  if (parts.length === 2 && /(вна|вич|ична|ич|оглы|кызы|гызы)$/i.test(parts[1] || '')) {
    return `${parts[0]} ${parts[1]}`;
  }
  if (parts.length === 2) return parts[1] || '';
  return parts[0] || '';
}

export function schoolAiFromKpis(kpis?: {
  school_ai?: {
    narrative?: string | null;
    source?: string | null;
    error?: string | null;
    report?: unknown;
    observer_warning?: string | null;
    insufficient?: boolean | null;
  } | null;
} | null) {
  const block = kpis?.school_ai;
  const narrative = String(block?.narrative || '').trim();
  const report = block?.report && typeof block.report === 'object' ? block.report : null;
  if (!narrative && !report) return null;
  return {
    narrative,
    report,
    source: block?.source || null,
    error: block?.error || null,
    observer_warning: block?.observer_warning || '',
    insufficient: Boolean(block?.insufficient),
  };
}

export function needsVisitChecklistAiNarrative(card: {
  narrative?: string | null;
  narrative_source?: string | null;
  visit_count?: number | null;
  stats?: { visits?: unknown[] | null } | null;
} | null | undefined): boolean {
  if (!card) return false;
  if (isManualNarrativeSource(card.narrative_source) && String(card.narrative || '').trim()) return false;
  const visits = Number(card.visit_count) || (Array.isArray(card.stats?.visits) ? card.stats.visits.length : 0);
  if (visits <= 0) return false;
  const source = String(card.narrative_source || '').trim().toLowerCase();
  const text = String(card.narrative || '').trim();
  if (!text) return true;
  if (!source || source === 'fallback' || source === 'open' || source === 'closed') return true;
  if (/self-signed certificate|certificate chain|fetch failed|unable to verify|ИИ недоступен/i.test(text)) {
    return true;
  }
  if (/Взять с урока:|Удачные приёмы:/.test(text) || /^Сводка по разделам чек-листа:/.test(text)) return true;
  return false;
}

export function visitMixLabel(observe: number, self: number): string {
  const parts: string[] = [];
  if (observe) {
    const mod10 = observe % 10;
    const mod100 = observe % 100;
    const word =
      mod10 === 1 && mod100 !== 11 ? 'наблюдение' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'наблюдения' : 'наблюдений';
    parts.push(`${observe} ${word}`);
  }
  if (self) {
    const mod10 = self % 10;
    const mod100 = self % 100;
    const word =
      mod10 === 1 && mod100 !== 11
        ? 'самоанализ'
        : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? 'самоанализа'
          : 'самоанализов';
    parts.push(`${self} ${word}`);
  }
  if (!parts.length) return 'нет записей';
  return parts.join(' · ');
}

export function visitCountLabel(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} посещение`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} посещения`;
  return `${n} посещений`;
}

/** Y-axis tick lines for Recharts: word wrap, 2 lines max, ellipsis + full string for tooltip. */
export function wrapChartAxisLabel(
  name: string,
  width = 22,
  maxLines = 2,
): { lines: string[]; full: string } {
  const full = String(name || '').replace(/\s+/g, ' ').trim();
  const limit = Math.max(4, Math.floor(width));
  const cap = Math.max(1, Math.floor(maxLines));
  if (!full) return { lines: [''], full: '' };

  const clip = (text: string) => (text.length <= limit ? text : `${text.slice(0, limit - 1)}…`);
  const withEllipsis = (text: string) => clip(text.endsWith('…') ? text : `${text}…`);

  const words = full.split(' ');
  const lines: string[] = [];
  let cur = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = cur ? `${cur} ${word}` : word;
    const more = i < words.length - 1;
    if (next.length <= limit) {
      cur = next;
      continue;
    }
    const lastSlot = lines.length + 1 >= cap;
    if (cur) {
      if (lastSlot) {
        lines.push(withEllipsis(`${cur} ${word}`));
        return { lines, full };
      }
      lines.push(cur);
      cur = word.length > limit ? clip(word) : word;
      continue;
    }
    lines.push(lastSlot && more ? withEllipsis(word) : clip(word));
    cur = '';
    if (lastSlot) return { lines, full };
  }
  if (cur) lines.push(lines.length >= cap ? withEllipsis(`${lines.pop() || ''} ${cur}`.trim()) : cur);
  return { lines: lines.length ? lines : [''], full };
}

/** FIO: surname on line 1, name + patronymic on line 2. */
export function wrapChartPersonLabel(
  name: string,
  width = 20,
  maxLines = 2,
): { lines: string[]; full: string } {
  const full = stripVisitChartVersionTokens(String(name || '').replace(/\s+/g, ' '));
  const parts = full.split(' ').filter(Boolean);
  if (parts.length >= 3 && maxLines >= 2) {
    const limit = Math.max(4, Math.floor(width));
    const clip = (text: string) => (text.length <= limit ? text : `${text.slice(0, limit - 1)}…`);
    return { lines: [clip(parts[0]), clip(parts.slice(1).join(' '))], full };
  }
  return wrapChartAxisLabel(full, width, maxLines);
}

export function lessonCountLabel(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} урок`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} урока`;
  return `${n} уроков`;
}

const VISIT_DATE_MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

/** `2026-09-09` → `9 сентября 2026 года`. */
export function formatVisitChecklistDate(raw: string | null | undefined): string {
  const iso = String(raw || '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso || 'дата не указана';
  const month = VISIT_DATE_MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${Number(m[3])} ${month} ${m[1]} года`;
}

export function scorePct(ratio: number | null | undefined): number {
  const n = Number(ratio);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 1.0001) return Math.round(Math.min(n, 100));
  return Math.round(n * 100);
}

export function scorePctLabel(ratio: number | null | undefined): string {
  return `Средний балл ${scorePct(ratio)}%`;
}

export function trafficColor(ratio: number | null | undefined): string {
  const pct = scorePct(ratio);
  if (pct >= 80) return TRAFFIC.green;
  if (pct >= 70) return TRAFFIC.greenSoft;
  if (pct >= 45) return TRAFFIC.yellow;
  return TRAFFIC.red;
}

/** 0% — серый (нет данных / пустой знаменатель), иначе светофор. */
export function barFillColor(ratio: number | null | undefined): string {
  if (scorePct(ratio) <= 0) return '#94a3b8';
  return trafficColor(ratio);
}

export function cardWorkflowLabel(row: {
  published_at?: string | null;
  status?: string | null;
}): string | null {
  if (row.published_at) return 'Отчёт опубликован';
  return null;
}

export function cardSendLabel(row: { published_at?: string | null }): string {
  return row.published_at ? 'Отчёт опубликован' : 'Отчёт не опубликован';
}

export function trafficTone(ratio: number | null | undefined): 'green' | 'yellow' | 'red' {
  const pct = scorePct(ratio);
  if (pct >= 70) return 'green';
  if (pct >= 45) return 'yellow';
  return 'red';
}

export type ItemTrafficTone = 'green' | 'yellow' | 'red' | 'gray';

/** Пункт: зелёный ≥80%, жёлтый 45–79%, красный <45%. Нет ответа — серый; явный 0 — красный. */
export function itemTrafficTone(ratio: number | null | undefined, unanswered: boolean): ItemTrafficTone {
  if (unanswered || ratio == null || !Number.isFinite(Number(ratio))) return 'gray';
  const pct = scorePct(ratio);
  if (pct >= 80) return 'green';
  if (pct >= 45) return 'yellow';
  return 'red';
}

export function itemTrafficColor(ratio: number | null | undefined, unanswered: boolean): string {
  const tone = itemTrafficTone(ratio, unanswered);
  if (tone === 'gray') return '#94a3b8';
  if (tone === 'green') return TRAFFIC.green;
  if (tone === 'yellow') return TRAFFIC.yellow;
  return TRAFFIC.red;
}

export function formatEarnedMax(earned: number | null | undefined, max: number | null | undefined): string {
  const e = Number(earned);
  const m = Number(max);
  if (!Number.isFinite(m) || m <= 0) return '';
  const er = Math.round((Number.isFinite(e) ? e : 0) * 10) / 10;
  const mr = Math.round(m * 10) / 10;
  return `${er}/${mr}`;
}

export function draftNarrativeFromVisits(card: {
  stats?: {
    visits?: Array<{
      date?: string | null;
      subject?: string | null;
      class_name?: string | null;
      summary?: string | null;
      recommendations?: string | null;
    }>;
    sections?: Array<{ title?: string | null; fillRatio?: number | null }>;
  } | null;
}): string {
  const visits = card.stats?.visits || [];
  const notes: string[] = [];
  for (const visit of visits) {
    const head = [formatVisitChecklistDate(visit.date) !== 'дата не указана' ? formatVisitChecklistDate(visit.date) : '', visit.subject, visit.class_name]
      .filter(Boolean)
      .join(' · ');
    if (visit.summary) notes.push(head ? `${head}\n${visit.summary}` : String(visit.summary));
    if (visit.recommendations) notes.push(`Удачные приёмы: ${visit.recommendations}`);
  }
  if (notes.length) return notes.join('\n\n');
  const secs = (card.stats?.sections || []).filter((sec) => sec.title);
  if (secs.length) {
    return `Сводка по разделам чек-листа:\n${secs
      .map((sec) => `• ${sec.title}: ${Math.round((Number(sec.fillRatio) || 0) * 100)}%`)
      .join('\n')}`;
  }
  return '';
}

export function displayTeacherTitle(raw: string | null | undefined): string {
  const label = String(raw || '').trim();
  if (!label || looksLikeTeacherCode(label)) return 'Педагог без ФИО';
  return label;
}
