/** Локальная автосводка (ИИ не ответил) — не обрезаем служебные хвосты с фактами. */
export function isLessonTeacherLocalFallbackText(raw: string): boolean {
  const s = String(raw ?? '').trim();
  if (!s.startsWith('Аналитическая записка')) return false;
  return /\nВ выборке \d+ (наблюдени|урок)/i.test(s);
}

/** Убрать из текста карточки чужой fallback, сырой JSON и служебные блоки. */
export function normalizeLessonTeacherNarrativeText(
  raw: string,
  teacherLabel?: string,
  opts?: { fromLlm?: boolean; manualEdit?: boolean },
): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';

  const fromJson = extractNarrativeFromJsonLike(s);
  if (fromJson) s = fromJson;

  s = s.replace(/^\s*\{?\s*"narrative"\s*:\s*"/i, '').replace(/"\s*\}\s*$/s, '');

  if (opts?.manualEdit) {
    return s
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const preserveFallbackBody = opts?.fromLlm === false || isLessonTeacherLocalFallbackText(s);

  if (!preserveFallbackBody) {
    const label = String(teacherLabel ?? '').trim();
    if (label) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const foreign = new RegExp(
        `\\n\\nАналитическая записка по срезу · (?!${escaped})[^\\n]+`,
        'i',
      );
      const m = foreign.exec(s);
      if (m && m.index > 60) s = s.slice(0, m.index).trim();
    } else {
      const foreign = s.search(/\n\nАналитическая записка по срезу · /);
      if (foreign > 60) s = s.slice(0, foreign).trim();
    }

    for (const marker of [
      /\n\nИИ-контур:\s/i,
      /\n\nНиже — автосводка по таблице/i,
      /\n\n={3,}\s*Факты по выборке/i,
      /\n\n\[… фрагмент сокращён/i,
    ]) {
      const idx = s.search(marker);
      if (idx > 80) s = s.slice(0, idx).trim();
    }
  }

  return s
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractNarrativeFromJsonLike(s: string): string | null {
  const trimmed = s.trim();
  if (!/"narrative"\s*:/i.test(trimmed)) return null;
  const parsed = tryParseLooseNarrativeJson(trimmed);
  if (parsed) return parsed;
  const m = /"narrative"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s.exec(trimmed);
  if (!m?.[1]) return null;
  return unescapeJsonString(m[1]);
}

function tryParseLooseNarrativeJson(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let slice = s.slice(start);
  if (!slice.trimEnd().endsWith('}')) slice = `${slice}}`;
  try {
    const o = JSON.parse(slice) as { narrative?: unknown };
    if (typeof o.narrative === 'string' && o.narrative.trim()) return o.narrative.trim();
  } catch {
    /* ignore */
  }
  return null;
}

function unescapeJsonString(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

/** Короткий фрагмент для автосводки (без полной LLM-выгрузки). */
export function compactFactsForTeacherFallback(factsExcerpt: string, maxChars = 1100): string {
  const lines = String(factsExcerpt ?? '').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^===|^\[Служебно|Служебно:|Тема\/поле|Педагоги по полю|Календарный период|Текстовая шкала|Баллы по вопросам|развёртка рубрики|Объём:\s*в полном файле/i.test(t)) {
      continue;
    }
    if (
      /компетенц|рубрик|пункт|слаб|отсутствует|зона риска|балл|шкал|вхожден|уровень|наблюден/i.test(t) ||
      kept.length < 16
    ) {
      kept.push(t);
    }
    if (kept.join('\n').length > maxChars) break;
  }
  const body = kept.join('\n').trim();
  if (!body) return '';
  return body.length > maxChars ? `${body.slice(0, maxChars)}\n\n[…]` : body;
}
