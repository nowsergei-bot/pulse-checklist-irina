/** Безопасное имя файла PDF по подписи педагога / проекта. */
export function safePdfFileBase(label: string): string {
  const x = String(label || 'pedagog')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 72);
  return x || 'pedagog';
}
