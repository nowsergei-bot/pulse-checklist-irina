const test = require('node:test');
const assert = require('node:assert/strict');
const { percentOf, markFor, studentResult } = require('../server/lib/calc.cjs');

// Шкала по Положению о системе оценивания (миграция 004).
const scale = [
  { mark: '5', min_percent: 90 },
  { mark: '4', min_percent: 75 },
  { mark: '3', min_percent: 50 },
  { mark: '2', min_percent: 0 },
];
const parts = [{ id: 1, name: 'Письмо' }, { id: 2, name: 'Тест' }];
// Максимум 50: письмо 5 баллов, тест 45 баллов в одном задании.
const tasks = [{ id: 10, part_id: 1, max_points: 5 }, { id: 11, part_id: 2, max_points: 45 }];

function run(total, extra = {}) {
  const scores = new Map([[10, Math.min(total, 5)], [11, total - Math.min(total, 5)]]);
  return studentResult({ parts, tasks, maxPoints: 50, scale, absentPartIds: new Set(), scores, ...extra });
}

function single(total, maxPoints) {
  const one = [{ id: 20, part_id: 2, max_points: maxPoints }];
  return studentResult({ parts: [parts[1]], tasks: one, maxPoints, scale, absentPartIds: new Set(), scores: new Map([[20, total]]) });
}

test('пример из задания: 41, 46, 28, 27 из 50', () => {
  const cases = [[41, 82, '4'], [46, 92, '5'], [28, 56, '3'], [27, 54, '3']];
  for (const [total, percent, mark] of cases) {
    const r = run(total);
    assert.equal(r.total, total);
    assert.equal(r.percent, percent);
    assert.equal(r.mark, mark);
    assert.equal(r.state, 'полная работа');
    assert.equal('equivalent' in r, false);
  }
});

test('процент округляется до целого, половина вверх', () => {
  // 37 из 41 = 90,24 % -> 90 % -> «5».
  assert.deepEqual([single(37, 41).percent, single(37, 41).mark], [90, '5']);
  // 30 из 40 = 75 % -> «4».
  assert.deepEqual([single(30, 40).percent, single(30, 40).mark], [75, '4']);
  // Граница 74,5 % (149 из 200) -> 75 % -> «4».
  assert.deepEqual([single(149, 200).percent, single(149, 200).mark], [75, '4']);
  // 74,4 % -> 74 % -> «3».
  assert.deepEqual([single(372, 500).percent, single(372, 500).mark], [74, '3']);
  // Границы «5» и «3»: 89,5 % -> 90 %, 49,5 % -> 50 %, 49,4 % -> 49 %.
  assert.equal(markFor(percentOf(179, 200), scale), '5');
  assert.equal(markFor(percentOf(99, 200), scale), '3');
  assert.equal(markFor(percentOf(247, 500), scale), '2');
  assert.equal(percentOf(0, 50), 0);
  assert.equal(percentOf(50, 50), 100);
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
  // 34 из 38 = 89,47 % -> 89 % -> «4»; 35 из 38 = 92,1 % -> 92 % -> «5».
  assert.deepEqual([single(34, 38).percent, single(34, 38).mark], [89, '4']);
  assert.deepEqual([single(35, 38).percent, single(35, 38).mark], [92, '5']);
});

// Щадящий режим. Максимум базовых 20, повышенных 30, итого 50 (так выходят проценты из задания).
const gentleParts = [{ id: 1, name: 'Тест' }];
const gentleTasks = [{ id: 30, part_id: 1, level: 'basic', max_points: 20 }, { id: 31, part_id: 1, level: 'advanced', max_points: 30 }];
function gentleRun(basic, advanced, gentle = true) {
  return studentResult({ parts: gentleParts, tasks: gentleTasks, maxPoints: 50, scale, absentPartIds: new Set(), scores: new Map([[30, basic], [31, advanced]]), gentle });
}

test('щадящий режим: ученики А-Д, отметка лучшая из двух', () => {
  // [имя, базовые, повышенные, щадящий %, обычный %, отметка в режиме, сработал щадящий, отметка без режима]
  const cases = [
    ['А', 16, 8, 57, 48, '3', true, '2'],
    ['Б', 18, 15, 73, 66, '3', false, '3'],
    ['В', 19, 20, 83, 78, '4', false, '4'],
    ['Г', 20, 25, 93, 90, '5', false, '5'],
    ['Д', 12, 26, 71, 76, '4', false, '4'],
  ];
  for (const [name, basic, advanced, gentlePercent, percent, mark, used, normalMark] of cases) {
    const r = gentleRun(basic, advanced);
    assert.equal(r.gentle_percent, gentlePercent, `ученик ${name}`);
    assert.equal(r.percent, percent, `ученик ${name}`);
    assert.equal(r.mark, mark, `ученик ${name}`);
    assert.equal(r.gentle_used, used, `ученик ${name}`);
    // Итог в баллах не меняется.
    assert.equal(r.total, basic + advanced);
    const off = gentleRun(basic, advanced, false);
    assert.deepEqual([off.mark, off.gentle_percent, off.gentle_used], [normalMark, null, false], `ученик ${name}`);
  }
});

test('щадящий режим: базовый 9/20, повышенный 16/30: обычный 50 % «3», щадящий 49 % «2», итог «3» по обычному', () => {
  const r = gentleRun(9, 16);
  assert.deepEqual([r.percent, r.gentle_percent, r.mark, r.gentle_used], [50, 49, '3', false]);
});

test('щадящий режим: 12/26: обычный 76 % «4», щадящий 71 % «3», итог «4» по обычному', () => {
  const r = gentleRun(12, 26);
  assert.deepEqual([r.percent, r.gentle_percent, r.mark, r.gentle_used], [76, 71, '4', false]);
});

test('щадящий режим: незаконченная работа без отметки и без срабатывания', () => {
  const r = studentResult({ parts: gentleParts, tasks: gentleTasks, maxPoints: 50, scale, absentPartIds: new Set(), scores: new Map([[30, 16], [31, null]]), gentle: true });
  assert.deepEqual([r.mark, r.gentle_used], [null, false]);
});

test('щадящий режим: без повышенных заданий процент тот же', () => {
  const tasksBasic = [{ id: 40, part_id: 1, level: 'basic', max_points: 40 }];
  const r = studentResult({ parts: gentleParts, tasks: tasksBasic, maxPoints: 40, scale, absentPartIds: new Set(), scores: new Map([[40, 30]]), gentle: true });
  assert.deepEqual([r.percent, r.gentle_percent, r.mark], [75, 75, '4']);
});
