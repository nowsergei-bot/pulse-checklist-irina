/** Регистрация родителей на ПРИМА КВИЗПЛИЗ */
export const PRIMA_QUIZPLIZ_REGISTRATION_ACCESS_LINK = 'prima-quizpliz-registraciya-2026';

/** Рефлексия участника Лиги домов */
export const LIGA_DOMOV_CHILD_REFLECTION_ACCESS_LINK = 'liga-domov-refleksiya-rebenka-2026';

export function isPrimaQuizplizRegistrationAccessLink(accessLink: string | null | undefined): boolean {
  const s = String(accessLink || '').trim().toLowerCase();
  return s === PRIMA_QUIZPLIZ_REGISTRATION_ACCESS_LINK || s.startsWith('prima-quizpliz-registraciya-');
}

export function isLigaDomovChildReflectionAccessLink(accessLink: string | null | undefined): boolean {
  const s = String(accessLink || '').trim().toLowerCase();
  return s === LIGA_DOMOV_CHILD_REFLECTION_ACCESS_LINK || s.startsWith('liga-domov-refleksiya-');
}

export const HOUSES = ['Север', 'Юг', 'Запад', 'Восток'] as const;

export type HouseName = (typeof HOUSES)[number];

export const HOUSE_COLORS: Record<HouseName, string> = {
  Север: '#3b82f6',
  Юг: '#ef4444',
  Запад: '#22c55e',
  Восток: '#f59e0b',
};
