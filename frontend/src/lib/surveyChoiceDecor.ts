/** Снимает эмодзи и вариации пробелов, чтобы старые ответы совпадали с новыми вариантами. */
export function stripChoiceDecor(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/[\uFE0F\u200D\u20E3]/g, '')
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{So}\s]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function choicesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return stripChoiceDecor(a).toLocaleLowerCase('ru') === stripChoiceDecor(b).toLocaleLowerCase('ru');
}

export function choiceListIncludes(list: string[] | undefined, needle: string): boolean {
  if (!list?.length) return false;
  return list.some((item) => choicesEqual(item, needle));
}
