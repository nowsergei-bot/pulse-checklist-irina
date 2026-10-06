const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildVisitChecklistKnowledgeBlock,
  visitChecklistKnowledgePromptSection,
  resetVisitChecklistKnowledgeCache,
  maxVisitChecklistKnowledgeChars,
} = require('./visit-checklist-knowledge');

test('visit checklist knowledge loads bundled assets', () => {
  resetVisitChecklistKnowledgeCache();
  const kb = buildVisitChecklistKnowledgeBlock();
  assert.ok(kb.length > 5000, 'expected substantial KB text');
  assert.match(kb, /Учитель года России/);
  assert.match(kb, /9 способов сделать любой урок особенным|Начните урок с удивления/);
});

test('visit checklist knowledge prompt section wraps KB', () => {
  resetVisitChecklistKnowledgeCache();
  const section = visitChecklistKnowledgePromptSection();
  assert.match(section, /База знаний методиста/);
  assert.match(section, /целеполагание|Цель урока/i);
});

test('visit checklist knowledge respects default char cap', () => {
  resetVisitChecklistKnowledgeCache();
  const kb = buildVisitChecklistKnowledgeBlock();
  assert.ok(kb.length <= maxVisitChecklistKnowledgeChars() + 200);
});

test('visit checklist knowledge kbScale halves or omits on retry', () => {
  resetVisitChecklistKnowledgeCache();
  const full = visitChecklistKnowledgePromptSection({ kbScale: 1 });
  const half = visitChecklistKnowledgePromptSection({ kbScale: 0.5 });
  const none = visitChecklistKnowledgePromptSection({ kbScale: 0 });
  assert.ok(half.length < full.length);
  assert.equal(none, '');
});
