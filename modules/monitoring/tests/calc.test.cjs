const test = require('node:test');
const assert = require('node:assert/strict');
const { studentResult } = require('../server/lib/calc.cjs');

const scale = [
  { mark: '5', min_equivalent: '4.60' },
  { mark: '4', min_equivalent: '3.70' },
  { mark: '3', min_equivalent: '2.80' },
  { mark: '2', min_equivalent: '0' },
];
const parts = [{ id: 1, name: 'Письмо' }, { id: 2, name: 'Тест' }];
// Максимум 50: письмо 5 баллов, тест 45 баллов в одном задании.
const tasks = [{ id: 10, part_id: 1, max_points: 5 }, { id: 11, part_id: 2, max_points: 45 }];

function run(total, extra = {}) {
  const scores = new Map([[10, Math.min(total, 5)], [11, total - Math.min(total, 5)]]);
  return studentResult({ parts, tasks, maxPoints: 50, scale, absentPartIds: new Set(), scores, ...extra });
}

test('пример из задания: 41, 46, 28, 27 из 50', () => {
  const cases = [[41, 82, 4.1, '4'], [46, 92, 4.6, '5'], [28, 56, 2.8, '3'], [27, 54, 2.7, '2']];
  for (const [total, percent, equivalent, mark] of cases) {
    const r = run(total);
    assert.equal(r.total, total);
    assert.equal(Math.round(r.percent), percent);
    assert.equal(r.equivalent, equivalent);
    assert.equal(r.mark, mark);
    assert.equal(r.state, 'полная работа');
  }
});

test('отсутствовал по части: отметки нет', () => {
  const r = run(40, { absentPartIds: new Set([2]) });
  assert.equal(r.mark, null);
  assert.equal(r.state, 'отсутствовал: тест');
  const both = run(0, { absentPartIds: new Set([1, 2]) });
  assert.equal(both.state, 'отсутствовал: письмо и тест');
});

test('пропущенные баллы: отметки нет', () => {
  const r = run(0, { scores: new Map([[10, 5]]) });
  assert.equal(r.mark, null);
  assert.equal(r.missing, 1);
  assert.equal(r.state, 'не внесено баллов: 1');
});

test('схема с другим максимумом: считается от её максимума', () => {
  const one = [{ id: 20, part_id: 2, max_points: 38 }];
  const r = studentResult({ parts: [parts[1]], tasks: one, maxPoints: 38, scale, absentPartIds: new Set(), scores: new Map([[20, 35]]) });
  assert.equal(r.equivalent, 4.61);
  assert.equal(r.mark, '5');
});
