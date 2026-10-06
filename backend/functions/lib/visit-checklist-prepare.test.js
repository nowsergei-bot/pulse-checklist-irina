'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatEta, progressCopy, ruCards } = require('./visit-checklist-prepare');
const { gigaChatParallelLimit } = require('./default-chat-model');

test('gigaChatParallelLimit: PERS=1, CORP/B2B=8, Cloud.ru=8, env cap 10', () => {
  assert.equal(gigaChatParallelLimit({ GIGACHAT_SCOPE: 'GIGACHAT_API_PERS' }), 1);
  assert.equal(gigaChatParallelLimit({ GIGACHAT_SCOPE: 'GIGACHAT_API_CORP' }), 8);
  assert.equal(gigaChatParallelLimit({ GIGACHAT_SCOPE: 'GIGACHAT_API_B2B' }), 8);
  assert.equal(gigaChatParallelLimit({ GIGACHAT_SCOPE: 'GIGACHAT_API_CORP', GIGACHAT_PARALLEL: '4' }), 4);
  assert.equal(gigaChatParallelLimit({ GIGACHAT_SCOPE: 'GIGACHAT_API_CORP', GIGACHAT_PARALLEL: '99' }), 10);
  assert.equal(gigaChatParallelLimit({ CLOUD_RU_FM_API_KEY: 'k', GIGACHAT_SCOPE: 'GIGACHAT_API_PERS' }), 8);
});

test('prepare copy has no technical jargon', () => {
  const text = progressCopy({ phase: 'cards', done: 8, total: 40, pending: 32, parallel: 8 });
  assert.match(text, /карточки/);
  assert.doesNotMatch(text, /GigaChat|TLS|OAuth|HTTP|scope/i);
  assert.match(formatEta(12), /меньше минуты/);
  assert.match(ruCards(1), /карточку/);
  assert.match(ruCards(8), /карточек/);
});
