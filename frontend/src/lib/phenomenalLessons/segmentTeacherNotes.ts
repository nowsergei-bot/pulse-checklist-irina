/**
 * Разбиение для отображения: только абзацы, разделённые пустой строкой.
 * Один абзац = один логический блок (внутренние переносы строк сохраняются).
 */
export function segmentTeacherNotesForDisplay(raw: string): string[] {
  const t = String(raw ?? '').trim();
  if (!t) return [];
  return t
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Строки таблицы комментариев педагогов: один комментарий = одна строка.
 * Несколько отдельных комментариев — разделите блоки пустой строкой (двойной перенос).
 * Не дробим по одиночным переносам, запятым и концам предложений.
 */
export function parseTeacherNotesIntoPointRows(raw: string): string[] {
  return segmentTeacherNotesForDisplay(raw);
}
