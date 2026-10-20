// Сравнение прежнего и нового правила щадящего режима: отметки по каждому правилу и сводка переходов.
// Прежнее (19–20.10.2026): щадящие пороги 90 / 75 / 45. Новое: режим не влияет, обычная шкала 90 / 74 / 50.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ruleMarks, compareRules } = require('../server/gentle-compare.cjs');

const scale = [
  { mark: '5', min_percent: 90 },
  { mark: '4', min_percent: 74 },
  { mark: '3', min_percent: 50 },
  { mark: '2', min_percent: 0 },
];
const tasks = [{ id: 1, level: 'basic', max_points: 50 }];
const pupil = (total, extra = {}) => ({ gentle: true, scores: { 1: total }, result: { total, complete: true }, ...extra });
const both = (total, extra) => {
  const m = ruleMarks(pupil(total, extra), tasks, 50, scale);
  return [m.rule_old, m.rule_new];
};

test('отметки по прежнему и новому правилу, работа на 50', () => {
  const cases = [
    // [итог, прежнее правило, новое]
    [22, '2', '2'], // 44 %
    [23, '3', '2'], // 46 %: прежний щадящий «3», теперь «2»
    [24, '3', '2'], // 48 %
    [25, '3', '3'], // 50 %
    [36, '3', '3'], // 72 %
    [37, '3', '4'], // 74 %: «4» от 74 %
    [38, '4', '4'], // 76 %
    [45, '5', '5'], // 90 %
  ];
  for (const [total, oldMark, newMark] of cases) assert.deepEqual(both(total), [oldMark, newMark], `${total} из 50`);
});

test('не в щадящем режиме или работа не полная: не сравнивается', () => {
  assert.deepEqual(both(23, { gentle: false }), [null, null]);
  assert.deepEqual(both(23, { result: { total: 23, complete: false } }), [null, null]);
});

test('сводка: изменилось, выше, ниже, переходы', () => {
  const rows = [23, 24, 25, 37, 45].map(total => ruleMarks(pupil(total), tasks, 50, scale));
  rows.push({ rule_old: null, rule_new: null });
  assert.deepEqual(compareRules(rows), { compared: 5, changed: 3, higher: 1, lower: 2, moves: { '3→2': 2, '3→4': 1 } });
});
