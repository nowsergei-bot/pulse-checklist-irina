// Общие разделы для сравнения разных работ (входное, модули, пробный ЕГЭ).
// Сравниваются только проценты выполнения: максимумы у работ разные.

const COMMON_SECTIONS = Object.freeze([
  { code: 'listening', name: 'Аудирование' },
  { code: 'reading', name: 'Чтение' },
  { code: 'use', name: 'Грамматика и лексика' },
  { code: 'writing', name: 'Письменная речь' },
]);

// Разделы модуля и ЕГЭ (monitoring.sections) в общие разделы. Speaking не сравнивается.
const MODULE_SECTION_MAP = Object.freeze({
  Listening: 'listening',
  Reading: 'reading',
  Grammar: 'use',
  Vocabulary: 'use',
  Writing: 'writing',
});

// Предложение для поля входного тестирования по коду и названию раздела и подписи столбца.
// Окончательное сопоставление задаёт data_admin; поле без сопоставления в итог сравнения не идёт.
function suggestCommonSection(field) {
  const text = [field && field.section_code, field && field.section, field && field.excel_label]
    .filter(Boolean).join(' ').toLowerCase();
  if (!text) return null;
  if (/speak|говорен|устн/.test(text)) return null;
  if (/listen|аудир/.test(text)) return 'listening';
  if (/read|чтен/.test(text)) return 'reading';
  if (/writ|письм|эсс|essay|letter|email/.test(text)) return 'writing';
  if (/gramm|грамм|vocab|лекс|use of english|word|словообр|use_of_english/.test(text)) return 'use';
  return null;
}

module.exports = { COMMON_SECTIONS, MODULE_SECTION_MAP, suggestCommonSection };
