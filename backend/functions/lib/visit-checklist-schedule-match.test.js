'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isUnknownTeacherLabel,
  matchTeacherFromVisitSchedule,
  normalizeVisitClass,
  resolveTeacherLabelFromSchedule,
  visitorsMatch,
} = require('./visit-checklist-schedule-match');

const SCHEDULE = [
  { class_name: '6В', visitor: 'Хорошилов А.А.', teacher: 'Акбатырова Мария' },
  { class_name: '5А', visitor: 'Завуч Иван', teacher: 'Петрова Анна' },
  { class_name: '5А', visitor: 'Завуч Иван', teacher: 'Петрова Анна' },
  { class_name: '7Б', visitor: 'Методист', teacher: 'teacher_1622' },
];

test('normalizeVisitClass folds latin letter and spaces', () => {
  assert.equal(normalizeVisitClass('6В'), normalizeVisitClass('6B'));
  assert.equal(normalizeVisitClass('5 А'), normalizeVisitClass('5а'));
});

test('visitorsMatch accepts surname vs initials', () => {
  assert.equal(visitorsMatch('Хорошилов А.А.', 'Хорошилов'), true);
  assert.equal(visitorsMatch('Завуч Иван', 'Другой Пётр'), false);
});

test('isUnknownTeacherLabel covers empty, placeholder and teacher_*', () => {
  assert.equal(isUnknownTeacherLabel(''), true);
  assert.equal(isUnknownTeacherLabel('Педагог без ФИО'), true);
  assert.equal(isUnknownTeacherLabel('teacher_999999'), true);
  assert.equal(isUnknownTeacherLabel('teacher162'), true);
  assert.equal(isUnknownTeacherLabel('t162'), true);
  assert.equal(isUnknownTeacherLabel('Акбатырова Мария'), false);
});

test('matchTeacherFromVisitSchedule uses class + visitor only', () => {
  assert.equal(
    matchTeacherFromVisitSchedule(SCHEDULE, { class_name: '6B', visitor: 'Хорошилов' }),
    'Акбатырова Мария',
  );
  assert.equal(
    matchTeacherFromVisitSchedule(SCHEDULE, { class: '5а', visitor_name: 'Завуч Иван' }),
    'Петрова Анна',
  );
});

test('matchTeacherFromVisitSchedule stays unlabeled when pair is missing or ambiguous', () => {
  assert.equal(matchTeacherFromVisitSchedule(SCHEDULE, { class_name: '6В', visitor: '' }), null);
  assert.equal(matchTeacherFromVisitSchedule(SCHEDULE, { class_name: '', visitor: 'Хорошилов' }), null);
  assert.equal(matchTeacherFromVisitSchedule(SCHEDULE, { class_name: '8А', visitor: 'Хорошилов' }), null);
  assert.equal(matchTeacherFromVisitSchedule(SCHEDULE, { class_name: '7Б', visitor: 'Методист' }), null);
  assert.equal(
    matchTeacherFromVisitSchedule(
      [
        { class_name: '5А', visitor: 'Завуч', teacher: 'Петрова Анна' },
        { class_name: '5А', visitor: 'Завуч', teacher: 'Сидорова Вера' },
      ],
      { class_name: '5А', visitor: 'Завуч' },
    ),
    null,
  );
});

test('resolveTeacherLabelFromSchedule needs one agreed name across visits', () => {
  assert.equal(
    resolveTeacherLabelFromSchedule(SCHEDULE, [
      { class_name: '6В', visitor: 'Хорошилов А.А.' },
      { class_name: '6в', visitor: 'Хорошилов' },
    ]),
    'Акбатырова Мария',
  );
  assert.equal(
    resolveTeacherLabelFromSchedule(SCHEDULE, [
      { class_name: '6В', visitor: 'Хорошилов' },
      { class_name: '5А', visitor: 'Завуч Иван' },
    ]),
    null,
  );
  assert.equal(resolveTeacherLabelFromSchedule(SCHEDULE, [{ class_name: '8А', visitor: 'Хорошилов' }]), null);
});
