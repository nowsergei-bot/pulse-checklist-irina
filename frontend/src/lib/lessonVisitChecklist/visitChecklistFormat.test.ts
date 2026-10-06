import assert from 'node:assert/strict';
import test from 'node:test';
import { VISIT_FORMAT_SELF_ANALYSIS } from './normalizeChecklist.ts';
import {
  displayVisitFormatOptionLabel,
  isSelfAnalysisFormat,
  pickVisitFormat,
} from './visitChecklistFormat.ts';

test('isSelfAnalysisFormat detects Самоанализ and aliases', () => {
  assert.equal(isSelfAnalysisFormat(VISIT_FORMAT_SELF_ANALYSIS), true);
  assert.equal(isSelfAnalysisFormat('самоанализ'), true);
  assert.equal(isSelfAnalysisFormat('self'), true);
  assert.equal(isSelfAnalysisFormat('self-analysis'), true);
  assert.equal(isSelfAnalysisFormat('само-анализ'), true);
  assert.equal(isSelfAnalysisFormat('очно'), false);
});

test('pickVisitFormat prefers visit_format over legacy format', () => {
  assert.equal(pickVisitFormat({ visit_format: 'Самоанализ', format: 'очно' }), 'Самоанализ');
  assert.equal(pickVisitFormat({ visitFormat: 'онлайн' }), 'онлайн');
});

test('displayVisitFormatOptionLabel shows lowercase самоанализ for stored value', () => {
  assert.equal(displayVisitFormatOptionLabel(VISIT_FORMAT_SELF_ANALYSIS), 'самоанализ');
  assert.equal(displayVisitFormatOptionLabel('очно'), 'очно');
  assert.equal(displayVisitFormatOptionLabel('онлайн'), 'онлайн');
});
