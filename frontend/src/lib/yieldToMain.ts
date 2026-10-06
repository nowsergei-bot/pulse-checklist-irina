/** Даёт браузеру обработать ввод/отрисовку между тяжёлыми задачами (html2canvas, нарезка PDF). */
export function yieldToMain(ms = 0): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function' && ms <= 0) {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, ms);
  });
}
