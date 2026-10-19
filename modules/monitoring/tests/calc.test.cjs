const test = require('node:test');
const assert = require('node:assert/strict');
const { GENTLE_SCALE, percentOf, markFor, studentResult } = require('../server/lib/calc.cjs');

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
// Щадящий режим: процент тот же, отметка по щадящим порогам 90 / 75 / 45: меняется только «3» от 45 %.
const gentleParts = [{ id: 1, name: 'Тест' }];
const gentleTasks = [{ id: 30, part_id: 1, level: 'basic', max_points: 20 }, { id: 31, part_id: 1, level: 'advanced', max_points: 30 }];
function gentleRun(basic, advanced, gentle = true) {
  return studentResult({ parts: gentleParts, tasks: gentleTasks, maxPoints: 50, scale, absentPartIds: new Set(), scores: new Map([[30, basic], [31, advanced]]), gentle });
}
// Работа на max баллов одним заданием.
function anyMax(total, maxPoints, gentle) {
  const one = [{ id: 60, part_id: 1, level: 'basic', max_points: maxPoints }];
  return studentResult({ parts: gentleParts, tasks: one, maxPoints, scale, absentPartIds: new Set(), scores: new Map([[60, total]]), gentle });
}

test('щадящие пороги заданы в одном месте: 90 / 75 / 45', () => {
  assert.deepEqual(GENTLE_SCALE.map(r => [r.mark, r.min_percent]), [['5', 90], ['4', 75], ['3', 45], ['2', 0]]);
  assert.ok(Object.isFrozen(GENTLE_SCALE));
});

test('щадящий режим: примеры из задания на 50 баллов', () => {
  const cases = [
    // [базовый, повышенный, %, отметка в режиме, пометка, отметка без режима]
    [18, 17, 70, '3', false, '3'],
    [16, 20, 72, '3', false, '3'],
    [17, 20, 74, '3', false, '3'],
    [18, 20, 76, '4', false, '4'],
    [15, 8, 46, '3', true, '2'],
    [14, 8, 44, '2', false, '2'],
  ];
  for (const [basic, advanced, percent, mark, used, offMark] of cases) {
    const r = gentleRun(basic, advanced);
    assert.deepEqual([r.total, r.percent, r.mark, r.gentle_used], [basic + advanced, percent, mark, used], `${basic} + ${advanced}`);
    assert.equal('gentle_percent' in r, false);
    const off = gentleRun(basic, advanced, false);
    assert.deepEqual([off.percent, off.mark, off.gentle_used], [percent, offMark, false], `${basic} + ${advanced} без режима`);
  }
});

test('процент один: от уровня заданий не зависит', () => {
  // 18 + 21, 20 + 19 и 9 + 30 = 39 из 50: 78 % в обоих режимах.
  for (const [basic, advanced] of [[18, 21], [20, 19], [9, 30]]) {
    assert.equal(gentleRun(basic, advanced).percent, 78);
    assert.equal(gentleRun(basic, advanced, false).percent, 78);
  }
});

test('щадящий режим: границы 44/45, 74/75, 89/90; пометка только у 45–49 %', () => {
  const cases = [
    // [%, отметка в режиме, пометка]
    [44, '2', false], [45, '3', true],
    [49, '3', true], [50, '3', false],
    [74, '3', false], [75, '4', false],
    [89, '4', false], [90, '5', false],
    [0, '2', false], [100, '5', false],
  ];
  for (const [percent, mark, used] of cases) {
    const r = anyMax(percent, 100, true);
    assert.deepEqual([r.percent, r.mark, r.gentle_used], [percent, mark, used], `${percent} %`);
  }
  // На всей шкале щадящий режим меняет отметку только в 45–49 %.
  for (let p = 0; p <= 100; p += 1) {
    const on = anyMax(p, 100, true);
    const off = anyMax(p, 100, false);
    assert.equal(on.mark !== off.mark, p >= 45 && p <= 49, `${p} %`);
    assert.equal(on.gentle_used, p >= 45 && p <= 49, `${p} %`);
  }
});

test('обычный режим: границы 49/50, 74/75, 89/90', () => {
  const cases = [[49, '2'], [50, '3'], [74, '3'], [75, '4'], [89, '4'], [90, '5']];
  for (const [percent, mark] of cases) {
    const r = anyMax(percent, 100, false);
    assert.deepEqual([r.percent, r.mark, r.gentle_used], [percent, mark, false], `${percent} %`);
  }
  assert.deepEqual([49, 50, 74, 75, 89, 90].map(p => markFor(p, scale)), ['2', '3', '3', '4', '4', '5']);
  assert.deepEqual([44, 45, 74, 75, 89, 90].map(p => markFor(p, GENTLE_SCALE)), ['2', '3', '3', '4', '4', '5']);
});

test('работы на 43 и 38 баллов: процент от своего максимума', () => {
  // 20/43 = 46,5 → 47 %: щадящий «3» с пометкой, обычный «2». 30/43 = 70 %: «3» в обоих режимах.
  assert.deepEqual([anyMax(20, 43, true).percent, anyMax(20, 43, true).mark, anyMax(20, 43, true).gentle_used, anyMax(20, 43, false).mark], [47, '3', true, '2']);
  assert.deepEqual([anyMax(30, 43, true).mark, anyMax(30, 43, true).gentle_used], ['3', false]);
  // 17/38 = 44,7 → 45 %: щадящий «3» с пометкой; 16/38 = 42 %: «2».
  assert.deepEqual([anyMax(17, 38, true).percent, anyMax(17, 38, true).mark, anyMax(17, 38, true).gentle_used], [45, '3', true]);
  assert.deepEqual([anyMax(16, 38, true).percent, anyMax(16, 38, true).mark], [42, '2']);
});

test('монотонность: при большем итоге отметка не ниже, для 38, 43 и 50 баллов, в обоих режимах', () => {
  for (const maxPoints of [38, 43, 50]) {
    for (const gentle of [false, true]) {
      let prev = 0;
      for (let total = 0; total <= maxPoints; total += 1) {
        const mark = Number(anyMax(total, maxPoints, gentle).mark);
        assert.ok(mark >= prev, `максимум ${maxPoints}, ${gentle ? 'щадящий' : 'обычный'}: ${total} баллов дают «${mark}», а ${total - 1} давали «${prev}»`);
        prev = mark;
      }
      assert.equal(prev, 5);
    }
    // Щадящая отметка никогда не ниже обычной.
    for (let total = 0; total <= maxPoints; total += 1) {
      assert.ok(Number(anyMax(total, maxPoints, true).mark) >= Number(anyMax(total, maxPoints, false).mark));
    }
  }
});

test('щадящий режим: отсутствовал или не всё внесено: отметки и пометки нет', () => {
  const missing = studentResult({ parts: gentleParts, tasks: gentleTasks, maxPoints: 50, scale, absentPartIds: new Set(), scores: new Map([[30, 16], [31, null]]), gentle: true });
  assert.deepEqual([missing.mark, missing.gentle_used, missing.complete], [null, false, false]);
  const absent = studentResult({ parts: gentleParts, tasks: gentleTasks, maxPoints: 50, scale, absentPartIds: new Set([1]), scores: new Map(), gentle: true });
  assert.deepEqual([absent.mark, absent.gentle_used, absent.state], [null, false, 'отсутствовал: тест']);
});
