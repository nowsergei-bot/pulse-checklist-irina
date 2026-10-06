import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isUnknownTeacherLabel,
  matchTeacherFromVisitSchedule,
  resolveTeacherLabelFromSchedule,
} from './visitChecklistScheduleMatch.ts';

const SCHEDULE = [
  { class_name: '6В', visitor: 'Хорошилов А.А.', teacher: 'Акбатырова Мария' },
  { class_name: '5А', visitor: 'Завуч Иван', teacher: 'Петрова Анна' },
];

describe('visit checklist schedule matcher', () => {
  it('fills FIO from class + visitor and stays unlabeled when the pair is missing', () => {
    assert.equal(isUnknownTeacherLabel('teacher_999999'), true);
    assert.equal(isUnknownTeacherLabel('teacher162'), true);
    assert.equal(isUnknownTeacherLabel('t162'), true);
    assert.equal(
      matchTeacherFromVisitSchedule(SCHEDULE, { class_name: '6B', visitor: 'Хорошилов' }),
      'Акбатырова Мария',
    );
    assert.equal(matchTeacherFromVisitSchedule(SCHEDULE, { class_name: '8А', visitor: 'Хорошилов' }), null);
    assert.equal(
      resolveTeacherLabelFromSchedule(SCHEDULE, [
        { class_name: '6В', visitor: 'Хорошилов' },
        { class_name: '5А', visitor: 'Завуч Иван' },
      ]),
      null,
    );
  });
});
