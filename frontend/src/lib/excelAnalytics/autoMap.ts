import {
  LESSON_COMPETENCY_SCALE_DEFS,
  countCommaSeparatedScaleTokens,
  countRubricItemsInCell,
} from '../lessonAnalytics/lessonCompetencyScale';
import { parseAnalyticsDate, parseNumber } from './engine';
import type { CellPrimitive } from './parse';
import type { ColumnRole } from './types';
import { roleAllowsDuplicate, validateRoles } from './types';
import { applyServiceTimestampIgnore } from './serviceTimestamp';

const SAMPLE = 200;

function norm(h: string): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

type ColStats = {
  dateRatio: number;
  numericRatio: number;
  nonEmptyRatio: number;
  uniqueStrCount: number;
  medianStrLen: number;
  filledStrCount: number;
};

function cellStr(c: CellPrimitive): string {
  if (c == null || c === '') return '';
  if (c instanceof Date) {
    if (!Number.isFinite(c.getTime())) return '';
    return c.toISOString().slice(0, 10);
  }
  return String(c).trim();
}

function computeStats(rows: CellPrimitive[][], col: number): ColStats {
  const slice = rows.slice(0, SAMPLE);
  let n = 0;
  let dates = 0;
  let nums = 0;
  const uniq = new Set<string>();
  const lengths: number[] = [];
  for (const line of slice) {
    const c = line[col];
    if (c == null || c === '') continue;
    n++;
    if (parseAnalyticsDate(c) != null) dates++;
    if (parseNumber(c) != null) nums++;
    const s = cellStr(c);
    if (s) {
      uniq.add(s.toLowerCase());
      lengths.push(s.length);
    }
  }
  const total = slice.length || 1;
  lengths.sort((a, b) => a - b);
  const medianStrLen = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;
  return {
    dateRatio: n ? dates / n : 0,
    numericRatio: n ? nums / n : 0,
    nonEmptyRatio: n / total,
    uniqueStrCount: uniq.size,
    medianStrLen,
    filledStrCount: lengths.length,
  };
}

type HeaderMatch = { role: ColumnRole; priority: number };

/** Чем выше priority, тем раньше претендует на уникальную роль. */
function matchHeader(header: string): HeaderMatch | null {
  const h = norm(header);
  if (!h) return null;

  const rules: [ColumnRole, RegExp, number][] = [
    /** Шаблон «Для анализа ИИ» / Google Forms: служебная метка, не дата урока. */
    ['ignore', /^\s*отметка\s*времени\s*$|^timestamp$/i, 100],
    ['ignore', /фио\s*родител|фио\s*ребен|фио\s*дет/i, 98],
    [
      'filter_teacher_code',
      /^группа$|^номер\s*группы$|^код\s*группы$|^группа\s*обуч/i,
      95,
    ],
    /** «проведен» в общем виде не используем — иначе «Формат проведения урока» ошибочно становится «датой». */
    [
      'date',
      /дата\s*посещ|дата\s*урока?|дата\s*наблюден|дата\s*мероприят|дата\s*проведени\w*\s*урок|lesson\s*date|date\s*of\s*visit/i,
      99,
    ],
    ['date', /время\s*ответ|время\s*отправ|время\s*заполн|submitted\s*at|created\s*at|дата\s*ответ|дата\s*отправ/i, 82],
    ['date', /\bдата\b(?!\s*ответ)|\bdate\b|когда\b/i, 87],
    /** Число учеников на уроке — метрика, не «подпись строки». */
    [
      'metric_numeric',
      /количеств\w*\s*учеников\s*на\s*урок|number\s*of\s*students\s*in\s*the\s*lesson|числ\w*\s*ученик/i,
      97,
    ],
    [
      'filter_teacher_code',
      /фио\s*учител|фио\s*педагог|фио\s*наставник|учител|педагог|наставник|teacher|mentor|ведущ/i,
      95,
    ],
    ['filter_parallel', /параллел|parallel/i, 90],
    /**
     * Не использовать голое «class» — цепляется за classroom, classification и т.п.
     * Только явный русский «класс» или «class» как отдельное слово / в блоке «Класс // Class».
     */
    [
      'filter_class',
      /(^|[^а-яё])класс(?:[^а-яё]|$)|класс\s*\/\/|\/\/\s*class(?:\s|$)|^\s*class\s*$|(^|[^a-z])class(?:[^a-z]|$)|группа\s*\d/i,
      90,
    ],
    ['filter_subject', /предмет|дисциплин|тема\s*урок|subject|курс(?!\s*оцен)/i, 88],
    [
      'filter_format',
      /формат|модаль|вид\s*урок|вид\s*занят|дистанц|очно|онлайн|гибрид|смеш|удалён|удален|remote|hybrid|zoom|teams|офлайн|офис|присутств/i,
      86,
    ],
    [
      'lesson_comp_scale_org_tech',
      /организационно[\s-]*технич|орг[\s.]*тех|услови\w*\s*проведен\w*\s*урок|organisational\s+and\s+technical\s+conditions/i,
      88,
    ],
    [
      'lesson_comp_scale_methodology',
      /методическ\w*\s*грамот|методическ\w*\s*построен|lesson\s+methodology/i,
      87,
    ],
    ['lesson_comp_scale_general', /общекультурн|general\s+performance/i, 86],
    [
      'lesson_comp_scale_rapport',
      /взаимодействи\w*\s*участник|teacher[\s-]*student\s+rapport|раппорт|teacher-student/i,
      85,
    ],
    ['lesson_comp_scale_misc', /дополнительн\w*\s*\/\/\s*miscellaneous|^miscellaneous$|^\s*misc\s*$/i, 84],
    /**
     * В типовом файле «Для анализа ИИ» это текстовый столбец (выводы), не ячейка шкалы 0–4.
     * Выше приоритета «рекомендации», чтобы заголовок с «/рекомендации» не ушёл в text_ai_recommendations.
     */
    [
      'text_ai_summary',
      /общие\s*выводы\s*по\s*уроку|выводы\s*\/\s*рекомендац|summary\s*\/\s*recommendation|summary\/recommendation/i,
      94,
    ],
    [
      'text_ai_recommendations',
      /рекомендаци\w*\s*учителю|рекомендации\s*для\s*учител|teacher\s*recommendations/i,
      93,
    ],
    ['text_ai_recommendations', /что\s*улучшить|на\s*что\s*обратить/i, 84],
    ['text_ai_summary', /вывод|резюме|итог|заключен|обобщ|комментарий\s*эксперт|самоанализ/i, 83],
    ['text_list_features', /услови[яе]?\s+проведен|тег|через\s*запят|перечисл|критери.*списк/i, 81],
    [
      'metric_ordinal_text',
      /уровен\w*\s*профессиональн\w*\s*методическ|мастерств\w*\s*учител\w*\s*в\s*целом|teacher'?s\s+competences\s+in\s+general|level\s+of\s+teacher/i,
      93,
    ],
    ['metric_ordinal_text', /уровен|категория\s*качеств|качество\s*\(|шкала\s*\(|тип\s*оценк/i, 80],
    ['row_label', /название|наименован|тема(?!\s*урок)|урок(?!\s*\d)|описание/i, 78],
    ['id_row', /(^|[^а-я])№\s*строк|номер\s*строк|^id$|^№$|^номер$|^n$/i, 78],
    ['filter_custom_1', /кампус|площадк|здание/i, 70],
    ['filter_custom_2', /тип\s*мероприят|мероприят/i, 69],
    ['filter_custom_3', /дополнит|прочее|примечан/i, 68],
  ];

  let best: HeaderMatch | null = null;
  for (const [role, re, priority] of rules) {
    if (re.test(h)) {
      if (!best || priority > best.priority) best = { role, priority };
    }
  }
  return best;
}

/** Ячейка похожа на перечень уровней 0–4 (через запятую / пробел) или одну отметку 0–4. */
function cellLooksLikeCommaScale(cell: CellPrimitive): boolean {
  const s = cellStr(cell);
  if (!s) return false;
  const tok = countCommaSeparatedScaleTokens(s, 4);
  if (tok >= 2) return true;
  if (tok >= 1 && /[,;،]/.test(s)) return true;
  const compact = s.replace(/\s/g, '');
  if (/^[0-4]$/.test(compact)) return true;
  /** Шаблон «Для анализа ИИ»: пункты рубрики через запятую (не числа 0–4). */
  if (countRubricItemsInCell(s) >= 2) return true;
  return false;
}

/** Доля непустых ячеек в образце, похожих на шкалу «пойнты через запятую». */
function columnCommaScaleAffinity(rows: CellPrimitive[][], col: number): number {
  const slice = rows.slice(0, SAMPLE);
  let hit = 0;
  let total = 0;
  for (const line of slice) {
    const c = line[col];
    if (c == null || c === '') continue;
    total++;
    if (cellLooksLikeCommaScale(c)) hit++;
  }
  return total ? hit / total : 0;
}

function nextFreeLessonCompRole(out: ColumnRole[]): ColumnRole | null {
  for (const d of LESSON_COMPETENCY_SCALE_DEFS) {
    if (!out.includes(d.role)) return d.role;
  }
  return null;
}

/**
 * Шкала 0–4 по заголовку не должна «перебивать» столбец с длинным текстом (не похожим на «0,1,2»).
 * `asText` — после inclusiveFill: сразу в текстовую роль; иначе в `ignore` для последующих проходов.
 */
/** Заголовок явно про школьный класс (литера/номер), а не «classroom» в длинной фразе. */
function headerStronglySuggestsClassColumn(header: string): boolean {
  const h = norm(header);
  return (
    /(^|[^а-яё])класс(?:[^а-яё]|$)/.test(h) ||
    /класс\s*\/\//.test(h) ||
    /\/\/\s*class(?:\s|$)/.test(h) ||
    /^\s*class\s*$/.test(h) ||
    /(^|[^a-z])class(?:[^a-z]|$)/.test(h) ||
    /группа\s*\d/.test(h)
  );
}

/** Колонка про аудиторию/тип в англ. формулировке, а не «7А». */
function headerSuggestsNotSchoolClassColumn(header: string): boolean {
  const h = norm(header);
  return /classroom|classification|classified|subclass/.test(h);
}

/**
 * Столбец «Класс» по ошибке (числа, рубрика 0–4, «classroom» в заголовке) — снимаем роль,
 * иначе по всему файлу рисуется одна «параллель» и ИИ выдумывает литеры.
 */
function demoteMisassignedClassColumn(headers: string[], rows: CellPrimitive[][], out: ColumnRole[]): void {
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== 'filter_class') continue;
    const st = computeStats(rows, i);
    const h = headers[i] ?? '';
    if (st.numericRatio >= 0.38) {
      out[i] = 'metric_numeric';
      continue;
    }
    if (columnCommaScaleAffinity(rows, i) >= 0.22) {
      out[i] = 'ignore';
      continue;
    }
    if (headerSuggestsNotSchoolClassColumn(h) && !headerStronglySuggestsClassColumn(h)) {
      out[i] = 'ignore';
      continue;
    }
  }
}

function demoteLessonCompIfCellsNotScale(
  headers: string[],
  rows: CellPrimitive[][],
  out: ColumnRole[],
  asText: boolean
): void {
  for (let i = 0; i < out.length; i++) {
    const r = out[i];
    if (!r.startsWith('lesson_comp_scale_')) continue;
    const aff = columnCommaScaleAffinity(rows, i);
    const st = computeStats(rows, i);
    if (aff < 0.25 && st.medianStrLen > 42) {
      if (asText) {
        const h = norm(headers[i] ?? '');
        if (/рекомендаци\w*\s*учител|teacher\s*recommend/i.test(h)) out[i] = 'text_ai_recommendations';
        else out[i] = 'text_ai_summary';
      } else {
        out[i] = 'ignore';
      }
    }
  }
}

function refreshUsedUnique(out: ColumnRole[], usedUnique: Set<ColumnRole>): void {
  usedUnique.clear();
  for (const r of out) {
    if (!roleAllowsDuplicate(r)) usedUnique.add(r);
  }
}

/** Типичные подписи формата: очно / дистанционно / онлайн и т.п. */
const FORMAT_VALUE_HINT =
  /очно|офлайн|офис|в\s*класс|присутств|дистанц|удалён|удален|онлайн|online|remote|zoom|teams|дистант|смеш|гибрид|hybrid|виртуал|видеосвяз|видео\s*урок|синхрон|асинхрон/i;

function collectDistinctStrings(rows: CellPrimitive[][], col: number): Set<string> {
  const s = new Set<string>();
  for (let r = 0; r < rows.length && r < SAMPLE; r++) {
    const c = rows[r][col];
    if (c == null || c === '') continue;
    const t = cellStr(c).toLowerCase();
    if (t) s.add(t);
  }
  return s;
}

function headerHintsFormat(header: string): boolean {
  return /формат|модаль|вид\s*урок|вид\s*занят|проведен|дистанц|очно|онлайн|удалён|удален/i.test(norm(header));
}

/** Насколько столбец похож на «формат проведения» (метка, не числовая метрика). */
function scoreFormatLikeness(vals: Set<string>, header: string): number {
  if (vals.size < 2 || vals.size > 14) return 0;
  const hh = headerHintsFormat(header);
  const only = [...vals].sort();
  if (only.length === 2 && only.every((x) => /^[01]$/.test(x)) && hh) return 70;
  if (only.length <= 3 && only.every((x) => /^[012]$/.test(x)) && hh) return 55;

  let hits = 0;
  for (const v of vals) {
    if (FORMAT_VALUE_HINT.test(v)) hits++;
  }
  const ratio = hits / vals.size;
  if (ratio >= 0.55) return 55 + ratio * 45 + (hh ? 10 : 0);
  if (vals.size <= 3 && hits >= 2) return 50 + (hh ? 10 : 0);
  return 0;
}

function firstFreeFilterCustom(out: ColumnRole[]): ColumnRole | null {
  for (const fk of ['filter_custom_1', 'filter_custom_2', 'filter_custom_3'] as ColumnRole[]) {
    if (!out.includes(fk)) return fk;
  }
  return null;
}

/** Типичные заголовки критериев в листах наблюдения за уроком. */
const STRONG_OBSERVATION_RUBRIC =
  /методическ\w*\s*грамотност|общекультурн\w*\s*компетенц|взаимодействи\w*\s*участник|содержател\w*\s*урок|результативност|управлен\w*\s*деятельност|дидактич/i;

/**
 * Всё, что осталось «игнор», подключаем к дашборду: критерии, даты, короткие справочники, длинные тексты.
 * Несколько текстовых колонок допускается (см. roleAllowsDuplicate для text_*).
 */
function inclusiveFillIgnored(headers: string[], rows: CellPrimitive[][], out: ColumnRole[]): void {
  const n = headers.length;
  const stats = headers.map((_, i) => computeStats(rows, i));

  for (let i = 0; i < n; i++) {
    if (out[i] !== 'ignore') continue;
    const s = stats[i];
    const h = norm(headers[i] ?? '');

    if (s.nonEmptyRatio < 0.015) continue;

    if (STRONG_OBSERVATION_RUBRIC.test(h)) {
      const aff = columnCommaScaleAffinity(rows, i);
      if (aff >= 0.18) {
        const m = matchHeader(headers[i]);
        let role: ColumnRole | null = null;
        if (m?.role.startsWith('lesson_comp_scale_') && !out.includes(m.role)) role = m.role;
        if (!role) role = nextFreeLessonCompRole(out);
        if (role) {
          out[i] = role;
          continue;
        }
      }
      out[i] = 'metric_numeric';
      continue;
    }
    if (s.numericRatio >= 0.2) {
      out[i] = 'metric_numeric';
      continue;
    }
    if (!out.includes('date') && s.dateRatio >= 0.38) {
      out[i] = 'date';
      continue;
    }
    if (
      s.numericRatio < 0.2 &&
      s.uniqueStrCount >= 2 &&
      s.uniqueStrCount <= 42 &&
      s.medianStrLen < 50 &&
      s.nonEmptyRatio > 0.08
    ) {
      const fk = firstFreeFilterCustom(out);
      if (fk) {
        out[i] = fk;
        continue;
      }
    }
    if (s.medianStrLen >= 24) {
      out[i] = 'text_ai_summary';
      continue;
    }
    if (s.medianStrLen >= 8) {
      out[i] = 'text_list_features';
      continue;
    }
    out[i] = 'text_ai_summary';
  }
}

/**
 * Подбор ролей по названиям столбцов и первым строкам данных.
 * Уникальные роли не дублируются; несколько столбцов могут быть metric_numeric и несколько — с ролями text_*.
 */
export function suggestColumnRoles(headers: string[], rows: CellPrimitive[][]): ColumnRole[] {
  const n = headers.length;
  const out: ColumnRole[] = Array(n).fill('ignore');
  const usedUnique = new Set<ColumnRole>();

  function takeUnique(role: ColumnRole, i: number): boolean {
    if (roleAllowsDuplicate(role)) {
      out[i] = role;
      return true;
    }
    if (usedUnique.has(role)) return false;
    out[i] = role;
    usedUnique.add(role);
    return true;
  }

  const headerCands: { i: number; role: ColumnRole; p: number }[] = [];
  for (let i = 0; i < n; i++) {
    const m = matchHeader(headers[i]);
    if (m) headerCands.push({ i, role: m.role, p: m.priority });
  }
  headerCands.sort((a, b) => b.p - a.p);
  for (const c of headerCands) {
    if (out[c.i] !== 'ignore') continue;
    takeUnique(c.role, c.i);
  }

  /** Столбцы с «3, 4» / «0, 1, 2» в ячейках → шкала компетенций (роль по заголовку или по порядку рубрики). */
  const scaleQueue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (out[i] !== 'ignore') continue;
    if (columnCommaScaleAffinity(rows, i) < 0.28) continue;
    const m = matchHeader(headers[i]);
    if (m?.role.startsWith('lesson_comp_scale_')) {
      takeUnique(m.role, i);
    } else {
      scaleQueue.push(i);
    }
  }
  scaleQueue.sort((a, b) => a - b);
  for (const i of scaleQueue) {
    const role = nextFreeLessonCompRole(out);
    if (!role) break;
    takeUnique(role, i);
  }

  demoteLessonCompIfCellsNotScale(headers, rows, out, false);
  refreshUsedUnique(out, usedUnique);
  demoteMisassignedClassColumn(headers, rows, out);
  refreshUsedUnique(out, usedUnique);

  const stats = headers.map((_, i) => computeStats(rows, i));

  /** Формат проведения (очно / дистанционно): по заголовку уже могли назначить; иначе — по содержимому ячеек */
  if (!usedUnique.has('filter_format')) {
    let bestI = -1;
    let bestScore = -1;
    for (let i = 0; i < n; i++) {
      if (out[i] !== 'ignore') continue;
      const s = stats[i];
      if (s.numericRatio > 0.85) continue;
      const distinct = collectDistinctStrings(rows, i);
      const dataScore = scoreFormatLikeness(distinct, headers[i] ?? '');
      const score = dataScore;
      if (score > bestScore && dataScore > 0) {
        bestScore = score;
        bestI = i;
      }
    }
    if (bestI >= 0) takeUnique('filter_format', bestI);
  }

  /** Лучший столбец для даты по данным */
  if (!usedUnique.has('date')) {
    let bestI = -1;
    let bestScore = -1;
    for (let i = 0; i < n; i++) {
      if (out[i] !== 'ignore') continue;
      const s = stats[i];
      const score = s.dateRatio * 100 + s.nonEmptyRatio * 10;
      if (s.dateRatio >= 0.45 && score > bestScore) {
        bestScore = score;
        bestI = i;
      }
    }
    if (bestI >= 0) takeUnique('date', bestI);
  }

  /** Числовые пункты: столбцы с преобладанием чисел (но не «пойнты через запятую»). */
  for (let i = 0; i < n; i++) {
    if (out[i] !== 'ignore') continue;
    const s = stats[i];
    if (s.numericRatio >= 0.48 && s.filledStrCount > 0) {
      if (columnCommaScaleAffinity(rows, i) >= 0.35) continue;
      out[i] = 'metric_numeric';
    }
  }

  /** Текстовая шкала: немного разных коротких строк */
  if (!usedUnique.has('metric_ordinal_text')) {
    let bestI = -1;
    let bestScore = -1;
    for (let i = 0; i < n; i++) {
      if (out[i] !== 'ignore') continue;
      const s = stats[i];
      if (s.uniqueStrCount >= 2 && s.uniqueStrCount <= 18 && s.nonEmptyRatio > 0.35 && s.medianStrLen < 45) {
        const score = s.nonEmptyRatio * 50 - s.uniqueStrCount;
        if (score > bestScore) {
          bestScore = score;
          bestI = i;
        }
      }
    }
    if (bestI >= 0) takeUnique('metric_ordinal_text', bestI);
  }

  /** Длинные тексты — по очереди роли */
  const textRoles: ColumnRole[] = ['text_ai_summary', 'text_ai_recommendations', 'text_list_features'];
  let tr = 0;
  const longTextCols = headers
    .map((_, i) => ({ i, s: stats[i] }))
    .filter(({ i, s }) => out[i] === 'ignore' && s.medianStrLen >= 35 && s.nonEmptyRatio > 0.2)
    .sort((a, b) => b.s.medianStrLen - a.s.medianStrLen);

  for (const { i } of longTextCols) {
    if (tr < textRoles.length) {
      takeUnique(textRoles[tr], i);
      tr++;
    } else {
      takeUnique('text_ai_summary', i);
    }
  }

  /** Подпись строки: первый осмысленный текстовый столбец без роли */
  if (!usedUnique.has('row_label')) {
    for (let i = 0; i < n; i++) {
      if (out[i] !== 'ignore') continue;
      const s = stats[i];
      if (s.medianStrLen > 8 && s.medianStrLen < 120 && s.nonEmptyRatio > 0.4) {
        if (takeUnique('row_label', i)) break;
      }
    }
  }

  /** Оставшиеся столбцы с числами — тоже пункты (кроме шкалы 0–4 в одной ячейке). */
  for (let i = 0; i < n; i++) {
    if (out[i] !== 'ignore') continue;
    const s = stats[i];
    if (s.numericRatio >= 0.28) {
      if (columnCommaScaleAffinity(rows, i) >= 0.32) {
        const role = nextFreeLessonCompRole(out);
        if (role) takeUnique(role, i);
        continue;
      }
      out[i] = 'metric_numeric';
    }
  }

  demoteLessonCompIfCellsNotScale(headers, rows, out, false);
  refreshUsedUnique(out, usedUnique);

  inclusiveFillIgnored(headers, rows, out);

  demoteLessonCompIfCellsNotScale(headers, rows, out, true);

  if (!validateRoles(out).ok) {
    let placed = false;
    for (let i = 0; i < n; i++) {
      if (out[i] === 'ignore') {
        out[i] = 'metric_numeric';
        placed = true;
        break;
      }
    }
    if (!placed && n > 0) out[0] = 'metric_numeric';
  }

  const { roles: afterStrip } = applyServiceTimestampIgnore(headers, rows, out);
  return afterStrip;
}

/**
 * В сохранённых проектах рубрика иногда остаётся filter_custom / опросной фильтр —
 * тогда одна строка Excel раздувается в десятки «уроков» на графиках. Восстанавливаем роли шаблона наблюдений.
 */
export function repairLessonObservationColumnRoles(
  headers: string[],
  rows: CellPrimitive[][],
  roles: ColumnRole[],
): ColumnRole[] {
  const n = headers.length;
  const out = roles.slice(0, n);
  while (out.length < n) out.push('ignore');
  for (let i = 0; i < n; i++) {
    const m = matchHeader(headers[i] || '');
    if (!m) continue;
    if (m.role.startsWith('lesson_comp_scale_')) {
      out[i] = m.role;
      continue;
    }
    if (m.role === 'text_ai_summary' && out[i] !== 'date' && out[i] !== 'filter_teacher_code') {
      out[i] = 'text_ai_summary';
      continue;
    }
    if (m.role === 'text_ai_recommendations') {
      out[i] = 'text_ai_recommendations';
      continue;
    }
    if (m.role === 'metric_ordinal_text' && out[i] !== 'date') {
      out[i] = 'metric_ordinal_text';
    }
  }
  demoteLessonCompIfCellsNotScale(headers, rows, out, true);
  return out;
}

/** Лист «Уроки» в типовом файле наблюдений — предпочитаем его при автозагрузке. */
export function pickLessonObservationSheetName(sheetNames: string[]): string {
  if (!sheetNames.length) return '';
  const exact = sheetNames.find((n) => /^уроки$/i.test(String(n).trim()));
  if (exact) return exact;
  const loose = sheetNames.find((n) => /урок/i.test(String(n)));
  if (loose) return loose;
  return sheetNames[0] ?? '';
}
