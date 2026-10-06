import type { Question } from '../types';

export function isLetterCheckQuestion(options: unknown): boolean {
  return Boolean(
    options &&
      typeof options === 'object' &&
      (options as { letterCheck?: boolean }).letterCheck,
  );
}

export function getLetterRecipientsFromQuestions(
  questions: Question[],
  fallback: string[] = [],
): string[] {
  for (const q of questions) {
    if (!isLetterCheckQuestion(q.options)) continue;
    const rec = (q.options as { letterRecipients?: string[] }).letterRecipients;
    if (Array.isArray(rec) && rec.length) {
      return rec.map((x) => String(x).trim()).filter(Boolean);
    }
  }
  return fallback.map((x) => String(x).trim()).filter(Boolean);
}

export function shouldShowLetterQuestion(personName: string, letterRecipients: string[]): boolean {
  const name = personName.trim();
  if (!name || !letterRecipients.length) return false;
  return letterRecipients.includes(name);
}

export function getTableExemptRecipientsFromQuestions(questions: Question[]): string[] {
  for (const q of questions) {
    if (q.type !== 'table_seat') continue;
    const rec = (q.options as { tableExemptRecipients?: string[] }).tableExemptRecipients;
    if (Array.isArray(rec) && rec.length) {
      return rec.map((x) => String(x).trim()).filter(Boolean);
    }
  }
  return [];
}

export function shouldShowTableQuestion(personName: string, exemptRecipients: string[]): boolean {
  const name = personName.trim();
  if (!name || !exemptRecipients.length) return true;
  return !exemptRecipients.includes(name);
}

export function filterCorporateQuestionsForPerson<T extends Question>(
  questions: T[],
  personName: string,
  letterRecipients: string[],
  tableExemptRecipients: string[] = [],
): T[] {
  const tableExempt = tableExemptRecipients.length
    ? tableExemptRecipients
    : getTableExemptRecipientsFromQuestions(questions);
  return questions.filter((q) => {
    if (isLetterCheckQuestion(q.options)) {
      return shouldShowLetterQuestion(personName, letterRecipients);
    }
    if (q.type === 'table_seat' && tableExempt.length) {
      return shouldShowTableQuestion(personName, tableExempt);
    }
    return true;
  });
}

/** @deprecated use filterCorporateQuestionsForPerson */
export function filterLetterQuestionsForPerson<T extends Question>(
  questions: T[],
  personName: string,
  letterRecipients: string[],
): T[] {
  return filterCorporateQuestionsForPerson(questions, personName, letterRecipients);
}
