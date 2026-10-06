import assert from 'node:assert/strict';
import test from 'node:test';
import type { LessonVisitChecklistConfig } from './types';
import {
  buildVisitQaSections,
  findResponseForVisit,
  formatAnswerPick,
  personKey,
  responseMatchesTeacher,
} from './visitChecklistCardAnswers.ts';

const checklist: LessonVisitChecklistConfig = {
  v: 1,
  generalFields: [],
  sections: [
    {
      id: 'sec_0',
      code: '1',
      title: 'Оргблок',
      questions: [
        { id: 'q_1', code: '1.1', text: 'Готовность', type: 'radio', options: ['готов', 'нет'] },
        { id: 'q_2', code: '1.2', text: 'Старт', type: 'radio', options: ['да', 'нет'] },
      ],
    },
  ],
};

test('personKey matches backend-style FIO', () => {
  assert.equal(personKey('Матвеев  Алексей'), personKey('матвеев алексей'));
});

test('buildVisitQaSections lists every question including empty answers', () => {
  const first = checklist.sections[0].questions[0];
  const sections = buildVisitQaSections(checklist, { [first.id]: 'готов' });
  assert.equal(sections[0].items.length, 2);
  assert.equal(sections[0].items[0].pick, 'готов');
  assert.equal(sections[0].items[0].unanswered, false);
  assert.equal(sections[0].items[0].earnedPoints, 100);
  assert.equal(sections[0].items[0].maxPoints, 100);
  assert.equal(sections[0].items[1].unanswered, true);
  assert.equal(sections[0].items[1].earnedPoints, 0);
  assert.equal(sections[0].maxPoints, 200);
  assert.equal(sections[0].fillRatio, 0.5);
});

test('formatAnswerPick joins checkbox answers', () => {
  assert.equal(formatAnswerPick(['а', 'б']), 'а, б');
});

test('responseMatchesTeacher uses directory name', () => {
  const row = {
    id: 1,
    created_at: '2026-09-11',
    general: { teacher_id: 'teacher_1' },
    answers: {},
  };
  assert.equal(
    responseMatchesTeacher(row, 'матвеев алексей', 'Матвеев Алексей', {
      departments: [],
      teachers: [{ id: 'teacher_1', name: 'Матвеев Алексей', departmentId: 'd1' }],
    }),
    true,
  );
});

test('findResponseForVisit prefers id', () => {
  const rows: import('./types').LessonVisitResponseRow[] = [
    { id: 9, created_at: '', general: { visit_date: '2026-01-01' }, answers: {} },
    { id: 3, created_at: '', general: { visit_date: '2026-09-11', class_name: '5А' }, answers: { q_1: 'готов' } },
  ];
  const hit = findResponseForVisit({ id: 3, date: '2026-09-11' }, rows);
  assert.equal(hit?.id, 3);
  assert.equal(formatAnswerPick(hit?.answers.q_1), 'готов');
});
