const test = require('node:test');
const assert = require('node:assert/strict');
const { GENTLE_CHANGES_MARK, GENTLE_SCALE, percentOf, markFor, studentResult } = require('../server/lib/calc.cjs');

// Шкала по Положению о системе оценивания (миграции 004 и 010): «4» от 74 %.
const scale = [
  { mark: '5', min_percent: 90 },
  { mark: '4', min_percent: 74 },
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
  // Граница «4»: 73,5 % (147 из 200) -> 74 % -> «4»; 74,4 % -> 74 % -> «4»; 73,4 % -> 73 % -> «3».
  assert.deepEqual([single(147, 200).percent, single(147, 200).mark], [74, '4']);
  assert.deepEqual([single(372, 500).percent, single(372, 500).mark], [74, '4']);
  assert.deepEqual([single(367, 500).percent, single(367, 500).mark], [73, '3']);
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

// Работа на max баллов одним заданием; gentle: щадящий режим группы.
const gentleParts = [{ id: 1, name: 'Тест' }];
const gentleTasks = [{ id: 30, part_id: 1, level: 'basic', max_points: 20 }, { id: 31, part_id: 1, level: 'advanced', max_points: 30 }];
function anyMax(total, maxPoints, gentle, extra = {}) {
  const one = [{ id: 60, part_id: 1, level: 'basic', max_points: maxPoints }];
  return studentResult({ parts: gentleParts, tasks: one, maxPoints, scale, absentPartIds: new Set(), scores: new Map([[60, total]]), gentle, ...extra });
}
const view = (r) => [r.percent, r.mark];

test('новая шкала, примеры из задания на 50 баллов', () => {
  assert.deepEqual(view(anyMax(37, 50, false)), [74, '4']);
  assert.deepEqual(view(anyMax(36, 50, false)), [72, '3']);
  assert.deepEqual(view(anyMax(45, 50, false)), [90, '5']);
  assert.deepEqual(view(anyMax(25, 50, false)), [50, '3']);
  assert.deepEqual(view(anyMax(24, 50, false)), [48, '2']);
});

test('работы на 43 и 38 баллов: процент от своего максимума, округление до целого', () => {
  // 32/43 = 74,4 % -> 74 % -> «4»; 31/43 = 72,1 % -> 72 % -> «3».
  assert.deepEqual(view(anyMax(32, 43, false)), [74, '4']);
  assert.deepEqual(view(anyMax(31, 43, false)), [72, '3']);
  // 28/38 = 73,68 % -> 74 % -> «4» (без округления было бы ниже 74). 27/38 = 71,05 % -> 71 % -> «3».
  assert.deepEqual(view(anyMax(28, 38, false)), [74, '4']);
  assert.deepEqual(view(anyMax(27, 38, false)), [71, '3']);
});

test('границы обычной шкалы: 49/50, 73/74, 89/90', () => {
  const cases = [[49, '2'], [50, '3'], [73, '3'], [74, '4'], [89, '4'], [90, '5'], [0, '2'], [100, '5']];
  for (const [percent, mark] of cases) assert.deepEqual(view(anyMax(percent, 100, false)), [percent, mark], `${percent} %`);
});

test('щадящий режим на отметку не влияет: та же отметка, пометки нет', () => {
  assert.equal(GENTLE_CHANGES_MARK, false);
  for (const maxPoints of [38, 43, 50, 100]) {
    for (let total = 0; total <= maxPoints; total += 1) {
      const on = anyMax(total, maxPoints, true);
      const off = anyMax(total, maxPoints, false);
      assert.deepEqual([on.percent, on.mark, on.gentle_used], [off.percent, off.mark, false], `${total} из ${maxPoints}`);
      assert.equal(on.gentle, true);
    }
  }
  // 23/50 = 46 %: «2» и в группе с режимом; 37/50 = 74 %: «4» в обеих.
  assert.deepEqual(view(anyMax(23, 50, true)), [46, '2']);
  assert.deepEqual(view(anyMax(37, 50, true)), [74, '4']);
});

test('прежние щадящие пороги хранятся для сравнения и включаются одной настройкой', () => {
  assert.deepEqual(GENTLE_SCALE.map(r => [r.mark, r.min_percent]), [['5', 90], ['4', 75], ['3', 45], ['2', 0]]);
  assert.ok(Object.isFrozen(GENTLE_SCALE));
  const on = anyMax(23, 50, true, { gentleChangesMark: true });
  assert.deepEqual([on.mark, on.gentle_used], ['3', true]);
});

test('процент один: от уровня заданий не зависит', () => {
  for (const [basic, advanced] of [[18, 21], [20, 19], [9, 30]]) {
    const r = studentResult({ parts: gentleParts, tasks: gentleTasks, maxPoints: 50, scale, absentPartIds: new Set(), scores: new Map([[30, basic], [31, advanced]]), gentle: true });
    assert.deepEqual(view(r), [78, '4']);
  }
});

test('монотонность: при большем итоге отметка не ниже, для 38, 43 и 50 баллов, с режимом и без', () => {
  for (const maxPoints of [38, 43, 50]) {
    for (const gentle of [false, true]) {
      let prev = 0;
      for (let total = 0; total <= maxPoints; total += 1) {
        const mark = Number(anyMax(total, maxPoints, gentle).mark);
        assert.ok(mark >= prev, `максимум ${maxPoints}: ${total} баллов дают «${mark}», а ${total - 1} давали «${prev}»`);
        prev = mark;
      }
      assert.equal(prev, 5);
    }
  }
});

test('щадящий режим: отсутствовал или не всё внесено: отметки и пометки нет', () => {
  const missing = studentResult({ parts: gentleParts, tasks: gentleTasks, maxPoints: 50, scale, absentPartIds: new Set(), scores: new Map([[30, 16], [31, null]]), gentle: true });
  assert.deepEqual([missing.mark, missing.gentle_used, missing.complete], [null, false, false]);
  const absent = studentResult({ parts: gentleParts, tasks: gentleTasks, maxPoints: 50, scale, absentPartIds: new Set([1]), scores: new Map(), gentle: true });
  assert.deepEqual([absent.mark, absent.gentle_used, absent.state], [null, false, 'отсутствовал: тест']);
});
