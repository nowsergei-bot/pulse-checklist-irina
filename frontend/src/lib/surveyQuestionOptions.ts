import type { SurveyBranchRules } from './surveyBranching';
import type { QuestionType } from '../types';

/** Shape stored in `questions.options` (JSON) for rich surveys. */
export type PersonSelectGroupOption = {
  heading: string;
  choices: string[];
};

export type SurveyQuestionOptionsRecord = {
  choices?: string[];
  groups?: PersonSelectGroupOption[];
  filterGroupsByFieldKey?: string;
  fieldKey?: string;
  includeTime?: boolean;
  branchRules?: SurveyBranchRules;
  endAfterQuestion?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  helpText?: string;
  sectionNumber?: number;
  sectionTitle?: string;
  i18n?: {
    sectionTitle?: Partial<Record<'ru' | 'en', string>>;
    text?: Partial<Record<'ru' | 'en', string>>;
    helpText?: Partial<Record<'ru' | 'en', string>>;
    choices?: Array<Partial<Record<'ru' | 'en', string>>>;
  };
};

export function isOptionsRecord(options: unknown): options is SurveyQuestionOptionsRecord {
  return Boolean(options) && typeof options === 'object' && !Array.isArray(options);
}

export function getChoicesFromOptions(options: unknown, keepEmpty = false): string[] {
  const read = (values: unknown[]) => keepEmpty ? values.map(String) : values.map(String).filter(Boolean);
  if (Array.isArray(options)) return read(options);
  if (isOptionsRecord(options)) {
    if (Array.isArray(options.choices) && options.choices.length) {
      return read(options.choices);
    }
    if (Array.isArray(options.groups)) {
      const out: string[] = [];
      const seen = new Set<string>();
      for (const g of options.groups) {
        for (const name of g.choices || []) {
          const s = String(name).trim();
          if (!s || seen.has(s)) continue;
          seen.add(s);
          out.push(s);
        }
      }
      return out;
    }
  }
  return [];
}

export function questionOptionsIncludeTime(options: unknown): boolean {
  return isOptionsRecord(options) && options.includeTime === true;
}

export function setIncludeTimeOnOptions(options: unknown, includeTime: boolean, type: QuestionType): unknown {
  const rec = scaleRecordFrom(options, type);
  if (includeTime) rec.includeTime = true;
  else delete rec.includeTime;
  return rec;
}

export function setPersonSelectGroupsOnOptions(
  options: unknown,
  groups: PersonSelectGroupOption[],
): SurveyQuestionOptionsRecord {
  const rec: SurveyQuestionOptionsRecord = isOptionsRecord(options) ? { ...options } : {};
  rec.groups = groups.map((g) => ({
    heading: String(g.heading || '').trim(),
    choices: Array.isArray(g.choices) ? g.choices.map(String).filter(Boolean) : [],
  }));
  delete rec.choices;
  return rec;
}

export function countPersonSelectGroups(options: unknown): { students: number; classes: number } {
  if (!isOptionsRecord(options) || !Array.isArray(options.groups)) {
    return { students: 0, classes: 0 };
  }
  const groups = options.groups.filter((g) => g?.heading && Array.isArray(g.choices) && g.choices.length);
  return {
    classes: groups.length,
    students: groups.reduce((n, g) => n + (g.choices?.length ?? 0), 0),
  };
}

export function getPersonSelectGroupsFromOptions(
  options: unknown,
  questions: { id: number; options: unknown }[],
  answers: Record<number, unknown>,
): PersonSelectGroupOption[] | undefined {
  if (!isOptionsRecord(options) || !Array.isArray(options.groups)) return undefined;
  const groups = options.groups
    .map((g) => ({
      heading: String(g.heading || '').trim(),
      choices: Array.isArray(g.choices) ? g.choices.map(String).filter(Boolean) : [],
    }))
    .filter((g) => g.heading && g.choices.length);
  const filterKey = typeof options.filterGroupsByFieldKey === 'string' ? options.filterGroupsByFieldKey.trim() : '';
  if (!filterKey) return groups;
  const classQ = questions.find((q) => {
    if (!isOptionsRecord(q.options)) return false;
    return String(q.options.fieldKey || '').trim() === filterKey;
  });
  const classVal = classQ ? String(answers[classQ.id] ?? '').trim() : '';
  if (!classVal) return [];
  return groups.filter((g) => g.heading === classVal);
}

export function getHelpTextFromOptions(options: unknown): string {
  if (!isOptionsRecord(options)) return '';
  return typeof options.helpText === 'string' ? options.helpText : '';
}

/** Text field rendered/validated as e-mail (Magadan registration etc.). */
export function isEmailTextQuestion(options: unknown, text?: string): boolean {
  if (isOptionsRecord(options)) {
    const rec = options as SurveyQuestionOptionsRecord & {
      fieldKey?: string;
      format?: string;
      inputType?: string;
      placeholder?: string;
    };
    const key = String(rec.fieldKey || '').toLowerCase();
    if (key === 'email' || key === 'почта') return true;
    const format = String(rec.format || rec.inputType || '').toLowerCase();
    if (format === 'email') return true;
  }
  return /почт|e-?mail|электрон/i.test(String(text || ''));
}

export function getPlaceholderFromOptions(options: unknown): string {
  if (!isOptionsRecord(options)) return '';
  const rec = options as { placeholder?: string };
  return typeof rec.placeholder === 'string' ? rec.placeholder : '';
}

export function questionOptionsHasI18n(options: unknown): boolean {
  return isOptionsRecord(options) && Boolean(options.i18n);
}

export function getQuestionTextEn(options: unknown): string {
  if (!isOptionsRecord(options)) return '';
  const en = options.i18n?.text?.en;
  return typeof en === 'string' ? en : '';
}

export function getHelpTextEn(options: unknown): string {
  if (!isOptionsRecord(options)) return '';
  const en = options.i18n?.helpText?.en;
  return typeof en === 'string' ? en : '';
}

export function getChoiceEnAt(options: unknown, index: number): string {
  if (!isOptionsRecord(options)) return '';
  const en = options.i18n?.choices?.[index]?.en;
  return typeof en === 'string' ? en : '';
}

function scaleRecordFrom(options: unknown, type: QuestionType): SurveyQuestionOptionsRecord {
  if (isOptionsRecord(options)) return { ...options };
  if (type === 'scale' || type === 'rating') {
    const o = options && typeof options === 'object' && !Array.isArray(options) ? (options as { min?: number; max?: number }) : {};
    return { min: o.min ?? (type === 'rating' ? 1 : 1), max: o.max ?? (type === 'rating' ? 5 : 10) };
  }
  if (type === 'text') {
    const o = options && typeof options === 'object' && !Array.isArray(options) ? (options as { maxLength?: number }) : {};
    return { maxLength: o.maxLength ?? 2000 };
  }
  return {};
}

export function setHelpTextOnOptions(options: unknown, helpText: string, type: QuestionType): unknown {
  const rec = scaleRecordFrom(options, type);
  const trimmed = helpText.trim();
  if (!trimmed) delete rec.helpText;
  else rec.helpText = trimmed;
  return finalizeOptions(rec, type);
}

export function setQuestionTextEnOnOptions(
  options: unknown,
  enText: string,
  ruText: string,
  type: QuestionType,
): unknown {
  const rec = scaleRecordFrom(options, type);
  const i18n = { ...(rec.i18n || {}) };
  const text = { ...(i18n.text || {}) };
  if (enText.trim()) text.en = enText.trim();
  else delete text.en;
  if (ruText.trim()) text.ru = ruText.trim();
  else delete text.ru;
  if (Object.keys(text).length) i18n.text = text;
  else delete i18n.text;
  if (Object.keys(i18n).length) rec.i18n = i18n;
  else delete rec.i18n;
  return finalizeOptions(rec, type);
}

export function setHelpTextEnOnOptions(
  options: unknown,
  enHelp: string,
  ruHelp: string,
  type: QuestionType,
): unknown {
  const rec = scaleRecordFrom(options, type);
  const i18n = { ...(rec.i18n || {}) };
  const help = { ...(i18n.helpText || {}) };
  if (enHelp.trim()) help.en = enHelp.trim();
  else delete help.en;
  if (ruHelp.trim()) help.ru = ruHelp.trim();
  else delete help.ru;
  if (Object.keys(help).length) i18n.helpText = help;
  else delete i18n.helpText;
  if (Object.keys(i18n).length) rec.i18n = i18n;
  else delete rec.i18n;
  return finalizeOptions(rec, type);
}

export function setChoicesOnOptions(options: unknown, choices: string[], type: QuestionType): unknown {
  const rec = scaleRecordFrom(options, type);
  rec.choices = choices;
  const prevI18n = rec.i18n?.choices;
  if (prevI18n?.length) {
    const i18n = { ...(rec.i18n || {}) };
    i18n.choices = choices.map((ru, i) => {
      const prev = prevI18n[i];
      const row: Partial<Record<'ru' | 'en', string>> = { ru };
      if (prev?.en) row.en = prev.en;
      return row;
    });
    rec.i18n = i18n;
  }
  return finalizeOptions(rec, type);
}

export function setChoiceEnAt(
  options: unknown,
  index: number,
  enLabel: string,
  choices: string[],
  type: QuestionType,
): unknown {
  const rec = scaleRecordFrom(options, type);
  rec.choices = choices;
  const i18n = { ...(rec.i18n || {}) };
  const rows = [...(i18n.choices || [])];
  while (rows.length < choices.length) {
    const i = rows.length;
    rows.push({ ru: choices[i] });
  }
  const row = { ...(rows[index] || { ru: choices[index] || '' }) };
  if (enLabel.trim()) row.en = enLabel.trim();
  else delete row.en;
  row.ru = choices[index] || row.ru || '';
  rows[index] = row;
  i18n.choices = rows;
  rec.i18n = i18n;
  return finalizeOptions(rec, type);
}

function finalizeOptions(rec: SurveyQuestionOptionsRecord, type: QuestionType): unknown {
  if (rec.endAfterQuestion === true) return rec;
  const hasI18n = rec.i18n && Object.keys(rec.i18n).length > 0;
  const hasHelp = Boolean(rec.helpText?.trim());
  const hasSection =
    (typeof rec.sectionNumber === 'number' && rec.sectionNumber > 0) ||
    Boolean(rec.sectionTitle?.trim());
  const hasChoices = Array.isArray(rec.choices) && rec.choices.length > 0;
  const hasBranchRules = rec.branchRules && Object.keys(rec.branchRules).length > 0;
  const hasScale = typeof rec.min === 'number' || typeof rec.max === 'number';
  const hasMaxLen = typeof rec.maxLength === 'number';

  if (type === 'radio' || type === 'checkbox') {
    if (hasI18n || hasHelp || hasSection || hasBranchRules) return rec;
    return rec.choices ?? [];
  }
  if (type === 'scale' || type === 'rating' || type === 'text') {
    if (hasI18n || hasHelp || hasSection) return rec;
    if (type === 'text') return { maxLength: rec.maxLength ?? 2000 };
    return { min: rec.min ?? (type === 'rating' ? 1 : 1), max: rec.max ?? (type === 'rating' ? 5 : 10) };
  }
  if (hasChoices) return rec;
  if (hasScale) return { min: rec.min, max: rec.max };
  if (hasMaxLen) return { maxLength: rec.maxLength };
  return rec;
}

export function draftQuestionHasExtendedOptions(options: unknown): boolean {
  if (!isOptionsRecord(options)) return false;
  const hasSection =
    (typeof options.sectionNumber === 'number' && options.sectionNumber > 0) ||
    Boolean(options.sectionTitle?.trim());
  const hasBranchRules =
    isOptionsRecord(options) && options.branchRules && Object.keys(options.branchRules).length > 0;
  return (
    questionOptionsHasI18n(options) ||
    Boolean(getHelpTextFromOptions(options)) ||
    hasSection ||
    Boolean(hasBranchRules) ||
    options.endAfterQuestion === true
  );
}
