/**
 * Map html2canvas / canvas SecurityError and color-parse failures to stable Russian UI copy.
 */
export function humanizeHtml2CanvasPdfError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const name = err instanceof Error ? err.name : '';
  const text = raw.trim();
  if (
    /taint|securityerror|cross-origin|cors|unable to get image data|operation is insecure/i.test(text) ||
    /securityerror/i.test(name)
  ) {
    return new Error(
      'Не удалось собрать PDF: блокировка фото (CORS). Обновите страницу и попробуйте снова.',
    );
  }
  if (/unsupported color|color-mix|oklch|oklab|color\(srgb|color function/i.test(text)) {
    return new Error(
      'Не удалось собрать PDF: несовместимые цвета карточки. Обновите страницу и попробуйте снова.',
    );
  }
  if (/canvas|html2canvas|width|height|memory|allocation/i.test(text)) {
    return new Error(
      'Не удалось собрать PDF: слишком большой снимок. Сверните лишние блоки и повторите.',
    );
  }
  if (text && /[а-яё]/i.test(text)) return err instanceof Error ? err : new Error(text);
  if (text) return new Error(`Не удалось собрать PDF (${text.slice(0, 120)})`);
  return new Error('Не удалось собрать PDF');
}
