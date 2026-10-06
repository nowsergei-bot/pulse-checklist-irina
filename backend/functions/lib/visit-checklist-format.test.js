'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  VISIT_FORMAT_SELF_ANALYSIS,
  isSelfAnalysisFormat,
  pickVisitFormat,
} = require('./visit-checklist-format');

test('isSelfAnalysisFormat detects canonical and alias formats', () => {
  assert.equal(isSelfAnalysisFormat(VISIT_FORMAT_SELF_ANALYSIS), true);
  assert.equal(isSelfAnalysisFormat('самоанализ'), true);
  assert.equal(isSelfAnalysisFormat('self'), true);
  assert.equal(isSelfAnalysisFormat('self-analysis'), true);
  assert.equal(isSelfAnalysisFormat('само-анализ'), true);
  assert.equal(isSelfAnalysisFormat('очно'), false);
  assert.equal(isSelfAnalysisFormat(''), false);
});

test('pickVisitFormat reads visit_format and legacy keys', () => {
  assert.equal(
    pickVisitFormat({ visit_format: 'Самоанализ', format: 'очно' }),
    'Самоанализ',
  );
  assert.equal(pickVisitFormat({ format: 'self' }), 'self');
  assert.equal(pickVisitFormat({ visitFormat: 'онлайн' }), 'онлайн');
});
