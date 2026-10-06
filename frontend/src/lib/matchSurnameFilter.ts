/** Первая часть ФИО в формате «Фамилия И. О.». */
export function fioSurname(fio: string): string {
  const t = String(fio || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  return t.split(/[\s\u00A0]+/)[0] || t;
}

/** Частичное совпадение фамилии без учёта регистра. Пустой запрос — все записи. */
export function matchesSurnameFilter(fio: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fioSurname(fio).toLowerCase().includes(q);
}
