const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { findOwner, nameMatches } = require('./cabinet-lesson-visit-schedule-access');
const { parseSheetCsv } = require('../cabinet-lesson-visit-schedule');

describe('lesson visit schedule owners', () => {
  it('recognizes administration deputies and Новожилов', () => {
    assert.equal(findOwner({ email: 'khoroshilov@primakov.school' })?.key, 'khoroshilov');
    assert.equal(findOwner({ fullName: 'Новожилов Сергей Валерьевич' })?.key, 'novozhilov');
    assert.equal(findOwner({ fullName: 'Майсурадзе Майя Отариевна' })?.key, 'maisuradze');
    assert.equal(findOwner({ fullName: 'Басовский Виталий Валерьевич' })?.key, 'basovsky');
    assert.equal(nameMatches('Акбатырова М.Н.', 'Акбатырова Мария Николаевна'), true);
  });
});

describe('lesson visit schedule csv', () => {
  it('parses teacher rows', () => {
    const rows = parseSheetCsv(
      `Дата,№ урока,Класс,Предмет,Кафедра,ФИО учителя,ФИО посещающего урок,Отметка о посещении
14.09.2026,4,6В,Лидерство,Кафедра лидерства,Клементьева Е.С.,Круглова Г.И.,
`,
      'gid',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].teacher, 'Клементьева Е.С.');
    assert.equal(rows[0].visitor, 'Круглова Г.И.');
  });
});
