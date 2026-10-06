const { isPulsePrimakovBaseUrl } = require('./llm-chat');

function truncatePulseMaterials(text, maxChars) {
  const t = String(text ?? '').trim();
  if (!t || t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 120).trim()}\n\n[… материалы сокращены для лимита контекста ИИ; при необходимости сузьте файл или задайте вопрос по одному листу …]`;
}

function maxPulseAttachmentsChars() {
  return isPulsePrimakovBaseUrl() ? 22_000 : 90_000;
}

function maxPulseChatTokens() {
  return isPulsePrimakovBaseUrl() ? 4096 : 8192;
}

module.exports = {
  truncatePulseMaterials,
  maxPulseAttachmentsChars,
  maxPulseChatTokens,
};
