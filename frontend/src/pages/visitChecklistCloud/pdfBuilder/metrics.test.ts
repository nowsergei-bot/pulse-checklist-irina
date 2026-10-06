import assert from 'node:assert/strict';
import test from 'node:test';
import { approxPdfMetrics } from './metrics.ts';

test('PDF wrap keeps paragraph breaks', () => {
  const m = approxPdfMetrics();
  const lines = m.wrap('Первая строка\nВторая строка', 10, 'body', false, 400);
  assert.deepEqual(lines, ['Первая строка', 'Вторая строка']);
});
