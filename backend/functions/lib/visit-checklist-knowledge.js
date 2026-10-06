const fs = require('fs');
const path = require('path');
const { isPulsePrimakovBaseUrl } = require('./llm-chat');
const { truncatePulseMaterials } = require('./pulse-ai-context-cap');

const KB_DIR = path.join(__dirname, '..', 'assets', 'visit-checklist-knowledge');

/** Порядок важен: сначала практика и критерии урока, затем общие положения. */
const KB_FILES = [
  'blogi-dinaev-9-sposobov-urok.txt',
  'metod-2024-ocenka-urok.txt',
  'metod-2024-obshie-polozheniya.txt',
];

let cachedBlock = null;

function readKbFile(name) {
  const p = path.join(KB_DIR, name);
  if (!fs.existsSync(p)) return '';
  return String(fs.readFileSync(p, 'utf8') || '').trim();
}

function maxVisitChecklistKnowledgeChars() {
  return isPulsePrimakovBaseUrl() ? 8_000 : 16_000;
}

/**
 * Собирает текст базы знаний для промптов ИИ-аналитики чек-листа посещения урока.
 * Файлы лежат в backend/functions/assets/visit-checklist-knowledge/ и попадают в ZIP функции.
 */
function buildVisitChecklistKnowledgeBlock() {
  if (cachedBlock !== null) return cachedBlock;

  const parts = [];
  for (const name of KB_FILES) {
    const chunk = readKbFile(name);
    if (chunk) parts.push(chunk);
  }
  if (!parts.length) {
    cachedBlock = '';
    return cachedBlock;
  }

  const joined = parts.join('\n\n---\n\n');
  const cap = maxVisitChecklistKnowledgeChars();
  cachedBlock = truncatePulseMaterials(joined, cap);
  return cachedBlock;
}

/** Сброс кэша (тесты / горячая подмена файлов). */
function resetVisitChecklistKnowledgeCache() {
  cachedBlock = null;
}

/**
 * @param {{ kbScale?: number }} [opts] — 1 = полный блок; 0.5 = половина; 0 = не включать.
 */
function visitChecklistKnowledgePromptSection(opts = {}) {
  const kbScale = Number(opts.kbScale ?? 1);
  if (!Number.isFinite(kbScale) || kbScale <= 0) return '';

  const kb = buildVisitChecklistKnowledgeBlock();
  if (!kb) return '';

  const scaledKb =
    kbScale >= 0.99
      ? kb
      : truncatePulseMaterials(kb, Math.max(400, Math.floor(kb.length * Math.min(1, kbScale))));

  return `**База знаний методиста (ориентир, не подменяет факты среза):**
Опирайся на материалы ниже при интерпретации слабых зон чек-листа и формулировке рекомендаций по построению урока. Не цитируй документы дословно длинными блоками; не выдумывай факты о конкретном срезе — цифры и наблюдения только из блока «Факты».

${scaledKb}`;
}

module.exports = {
  buildVisitChecklistKnowledgeBlock,
  visitChecklistKnowledgePromptSection,
  resetVisitChecklistKnowledgeCache,
  maxVisitChecklistKnowledgeChars,
};
