// Сравнение прежнего и нового правила щадящего режима: отметки по каждому правилу и сводка переходов.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ruleMarks, compareRules } = require('../server/gentle-compare.cjs');

const scale = [
  { mark: '5', min_percent: 90 },
  { mark: '4', min_percent: 75 },
  { mark: '3', min_percent: 50 },
  { mark: '2', min_percent: 0 },
];
// Работа на 50: базовый 20, повышенный 30.
const tasks = [{ id: 1, level: 'basic', max_points: 20 }, { id: 2, level: 'advanced', max_points: 30 }];
const pupil = (basic, advanced, extra = {}) => ({
  gentle: true, scores: { 1: basic, 2: advanced }, result: { total: basic + advanced, complete: true }, ...extra,
});
const both = (basic, advanced, extra) => {
  const m = ruleMarks(pupil(basic, advanced, extra), tasks, 50, scale);
  return [m.rule_old, m.rule_new];
};

test('отметки по прежнему и новому правилу (пороги 90 / 75 / 45)', () => {
  const cases = [
    // [базовый, повышенный, прежнее правило, новое]
    [18, 17, '4', '3'], // 35: прежний щадящий 76 % → «4»; новое 70 % → «3»
    [16, 20, '3', '3'], // 36: прежний щадящий 74 % → «3»; новое 72 % → «3»
    [20, 13, '4', '3'], // 33: прежний щадящий 76 % → «4»; новое 66 % → «3»
    [18, 4, '3', '2'], // 22: прежний щадящий 57 % → «3»; новое 44 % → «2»
    [20, 23, '5', '4'], // 43: прежний щадящий 90 % → «5»; новое 86 % → «4»
    [20, 21, '4', '4'], // 41: прежний щадящий 87 % → «4»; новое 82 % → «4»
    [10, 30, '4', '4'], // 40: обычный 80 % → «4»; новое 80 % → «4»
    [15, 8, '3', '3'], // 23: прежний щадящий 59 % → «3»; новое 46 % → «3»
  ];
  for (const [basic, advanced, oldMark, newMark] of cases) {
    assert.deepEqual(both(basic, advanced), [oldMark, newMark], `${basic} + ${advanced}`);
  }
});

test('не в щадящем режиме или работа не полная: не сравнивается', () => {
  assert.deepEqual(both(18, 4, { gentle: false }), [null, null]);
  assert.deepEqual(both(18, 4, { result: { total: 22, complete: false } }), [null, null]);
});

test('сводка: изменилось, выше, ниже, переходы', () => {
  const rows = [[18, 17], [16, 20], [20, 13], [18, 4], [20, 23]].map(([b, a]) => ruleMarks(pupil(b, a), tasks, 50, scale));
  rows.push({ rule_old: null, rule_new: null });
  assert.deepEqual(compareRules(rows), { compared: 5, changed: 4, higher: 0, lower: 4, moves: { '4→3': 2, '3→2': 1, '5→4': 1 } });
});
