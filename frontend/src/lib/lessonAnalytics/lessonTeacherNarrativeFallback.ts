import type { ExcelNarrativeSummaryResponse } from '../../types';
import {
  compactFactsForTeacherFallback,
  normalizeLessonTeacherNarrativeText,
} from './lessonTeacherNarrativeSanitize';

/**
 * Текст в карточку, когда LLM недоступен или вернул пустой narrative.
 * Без полной служебной выгрузки «Факты по выборке» — только краткий фрагмент.
 */
export function buildLessonTeacherNarrativeFallbackRu(opts: {
  teacherLabel: string;
  rowCount: number;
  factsExcerpt?: string;
  compFacts?: string;
  apiHint?: string;
}): string {
  const label = String(opts.teacherLabel ?? '').trim() || 'педагог';
  const n = Number.isFinite(opts.rowCount) ? Math.max(0, Math.round(opts.rowCount)) : 0;
  const lessonWord = n === 1 ? 'урок' : n < 5 ? 'урока' : 'уроков';
  const lines: string[] = [
    `Аналитическая записка по срезу · ${label}`,
    `В выборке ${n} ${lessonWord} (текущие фильтры страницы). Полный текст ИИ не сформирован — ниже сводка по таблице.`,
  ];

  const comp = String(opts.compFacts ?? '').trim();
  const compact =
    (comp ? compactFactsForTeacherFallback(comp, 1400) : '') ||
    compactFactsForTeacherFallback(String(opts.factsExcerpt ?? ''), 1400);
  if (compact) {
    lines.push('', 'Сводка по данным:', '', compact);
  } else {
    lines.push(
      '',
      'По этому педагогу в срезе мало распознанных фактов — проверьте фильтры, роль колонки «Педагог» и столбцы компетенций.',
    );
  }

  const hint = String(opts.apiHint ?? '').trim();
  if (hint) {
    const shortHint = hint.length > 480 ? `${hint.slice(0, 480)}…` : hint;
    lines.push('', `Примечание (ИИ): ${shortHint}`);
  }
  return lines.join('\n');
}

function ensureNonemptyNarrative(text: string, teacherLabel: string, fromLlm = true): string {
  const t = normalizeLessonTeacherNarrativeText(text, teacherLabel, { fromLlm });
  if (t) return t;
  const label = String(teacherLabel ?? '').trim() || 'педагог';
  return [
    `Аналитическая записка · ${label}`,
    '',
    'Не удалось собрать факты по срезу — проверьте роль колонки «Педагог» и фильтры страницы.',
  ].join('\n');
}

/** Ответ API, ошибка сети или только локальные факты — всегда непустой текст для карточки. */
export function pickLessonTeacherNarrativeText(
  res: ExcelNarrativeSummaryResponse | null | undefined,
  opts: {
    teacherLabel: string;
    rowCount: number;
    factsExcerpt?: string;
    compFacts?: string;
    requestError?: string;
  },
): { text: string; fromLlm: boolean; hint?: string } {
  const label = opts.teacherLabel;
  if (res) {
    const rawLlm = res.source === 'llm' && res.narrative?.trim() ? res.narrative.trim() : '';
    const llm = rawLlm ? normalizeLessonTeacherNarrativeText(rawLlm, label) : '';
    if (llm) return { text: llm, fromLlm: true };
    const hint = res.hint?.trim() || opts.requestError?.trim();
    const text = ensureNonemptyNarrative(
      buildLessonTeacherNarrativeFallbackRu({
        teacherLabel: label,
        rowCount: opts.rowCount,
        factsExcerpt: opts.factsExcerpt,
        compFacts: opts.compFacts,
        apiHint: hint,
      }),
      label,
      false,
    );
    return { text, fromLlm: false, hint };
  }
  const hint = opts.requestError?.trim();
  const text = ensureNonemptyNarrative(
    buildLessonTeacherNarrativeFallbackRu({
      teacherLabel: label,
      rowCount: opts.rowCount,
      factsExcerpt: opts.factsExcerpt,
      compFacts: opts.compFacts,
      apiHint: hint,
    }),
    label,
    false,
  );
  return { text, fromLlm: false, hint };
}

/** @deprecated Используйте pickLessonTeacherNarrativeText */
export function extractNarrativeFromApiResponse(
  res: ExcelNarrativeSummaryResponse,
  fallback: { teacherLabel: string; rowCount: number; factsExcerpt: string; compFacts?: string },
): { text: string; fromLlm: boolean; hint?: string } {
  return pickLessonTeacherNarrativeText(res, fallback);
}
