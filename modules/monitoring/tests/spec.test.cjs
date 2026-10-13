const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSpecSheet, matchFrame, frameRowsFromTasks, splitParts } = require('../server/lib/spec.cjs');

function sheet(head, rows) {
  const cells = { C3: head.title, C4: head.classHint };
  rows.forEach((r, i) => {
    const row = 9 + i;
    [cells[`B${row}`], cells[`C${row}`], cells[`D${row}`], cells[`E${row}`]] = r;
  });
  return (address) => cells[address];
}

const standard = {
  id: 1,
  name: 'Модуль без письма',
  rows: [
    ['Listening', 'basic', 5], ['Listening', 'advanced', 5], ['Reading', 'basic', 5], ['Reading', 'advanced', 5],
    ['Grammar', 'basic', 5], ['Grammar', 'advanced', 10], ['Vocabulary', 'basic', 5], ['Vocabulary', 'advanced', 10],
  ].map(([section, level, points]) => ({ section, level, points })),
};

const rowsOf = (list) => list.map(([s, l, p]) => [s, l, `${s}: ${l.toLowerCase()}`, p]);

test('общая спецификация совпадает со схемой «Модуль без письма»', () => {
  const spec = parseSpecSheet(sheet({ title: 'Модуль 1' }, rowsOf([
    ['Listening', 'Базовый', 5], ['Listening', 'Повышенный', 5], ['Reading', 'Базовый', 5], ['Reading', 'Повышенный', 5],
    ['Grammar', 'Базовый', 5], ['Grammar', 'Повышенный', 10], ['Vocabulary', 'Базовый', 5], ['Vocabulary', 'Повышенный', 10],
  ])));
  assert.deepEqual(spec.errors, []);
  assert.equal(spec.max_points, 50);
  const m = matchFrame(spec.tasks, [standard]);
  assert.equal(m.matched, true);
  assert.deepEqual(splitParts(spec.tasks).map(p => p.name), ['Тест']);
});

test('спецификация на 38 баллов: расхождения с ближайшей схемой и новая схема', () => {
  const spec = parseSpecSheet(sheet({ title: 'Модуль 1', classHint: '1' }, rowsOf([
    ['Listening', 'Базовый', 8], ['Reading', 'Базовый', 10], ['Grammar', 'Базовый', 5], ['Grammar', 'Повышенный', 5],
    ['Vocabulary', 'Базовый', 5], ['Vocabulary', 'Повышенный', 5],
  ])));
  assert.deepEqual(spec.errors, []);
  assert.equal(spec.max_points, 38);
  assert.equal(spec.class_hint, '1');
  const m = matchFrame(spec.tasks, [standard]);
  assert.equal(m.matched, false);
  assert.deepEqual(m.diffs.map(d => d.text), [
    'Listening, базовый: нужно 5, сейчас 8',
    'Listening, повышенный: нужно 5, сейчас 0',
    'Reading, базовый: нужно 5, сейчас 10',
    'Reading, повышенный: нужно 5, сейчас 0',
    'Grammar, повышенный: нужно 10, сейчас 5',
    'Vocabulary, повышенный: нужно 10, сейчас 5',
  ]);
  const own = { id: 2, name: 'Модуль 1, 1 класс', rows: frameRowsFromTasks(spec.tasks) };
  assert.equal(matchFrame(spec.tasks, [standard, own]).frame.id, 2);
});

test('ошибки строк', () => {
  const spec = parseSpecSheet(sheet({ title: '' }, [
    ['Listening', 'Базовый', 'Задание', ''],
    ['Speeking', 'Базовый', 'Задание', 5],
    ['Grammar', 'Средний', 'Задание', 5],
    ['Grammar', 'Базовый', 'Задание', 2.5],
    ['Writing', 'Повышенный', 'Задание', 5],
  ]));
  assert.deepEqual(spec.errors, [
    'Не указана работа (C3)',
    'Строка 9: дополните раздел, уровень, задание и баллы',
    'Строка 10: раздел «Speeking» не из справочника',
    'Строка 11: уровень «Средний» не из справочника',
    'Строка 12: балл должен быть целым числом от 1',
    'Строка 13: у Writing только базовый уровень',
  ]);
});

test('у вида не module одна часть «Тест», у module Writing уходит в «Письмо»', () => {
  const tasks = [{ section: 'Writing' }, { section: 'Grammar' }];
  assert.deepEqual(splitParts(tasks, 'module').map(p => p.name), ['Письмо', 'Тест']);
  assert.deepEqual(splitParts(tasks, 'placement').map(p => p.name), ['Тест']);
});

test('сервер берёт из присланных ячеек только адреса шаблона', () => {
  const { cellReader } = require('../server/specs.cjs');
  const cell = cellReader({ C3: 'Модуль 1', B9: 'Listening', E28: 5, A1: 'лишнее', G9: 'лишнее', C7: 'лишнее', D9: { x: 1 } });
  assert.equal(cell('C3'), 'Модуль 1');
  assert.equal(cell('B9'), 'Listening');
  assert.equal(cell('E28'), '5');
  assert.equal(cell('A1'), undefined);
  assert.equal(cell('G9'), undefined);
  assert.equal(cell('C7'), undefined);
  assert.equal(cell('D9'), undefined);
});
