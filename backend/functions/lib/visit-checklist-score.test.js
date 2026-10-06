'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  teacherKey,
  resolveTeacherName,
  displayTeacherLabel,
  scoreResponse,
  scoreProjectResponses,
  aggregateDashboardKpis,
} = require('./visit-checklist-score');

const CHECKLIST = {
  sections: [
    {
      code: '1',
      title: 'Организационный блок',
      questions: [
        { id: 'q_1', code: '1.1', text: 'Готовность к уроку', type: 'radio' },
        { id: 'q_2', code: '1.2', text: 'Санитарное состояние кабинета', type: 'radio' },
      ],
    },
    {
      code: '10',
      title: 'Общая оценка урока',
      questions: [
        { id: 'q_101', code: '10.1', text: 'Уровень представленного урока', type: 'radio' },
        { id: 'q_102', code: '10.2', text: 'Общие выводы', type: 'text' },
      ],
    },
  ],
};

test('teacherKey folds ё and case', () => {
  assert.equal(teacherKey('Иванов Сергей'), teacherKey('иванов  сергей'));
  assert.equal(teacherKey('Ёлкина Анна'), teacherKey('елкина анна'));
});

test('resolveTeacherName uses project directory then seed, never raw teacher_*', () => {
  assert.equal(
    resolveTeacherName({ teacher_id: 't1' }, { teachers: [{ id: 't1', name: 'Борисов Иван' }] }, { teachers: [] }),
    'Борисов Иван',
  );
  assert.equal(
    resolveTeacherName(
      { teacher_id: 'teacher_1622' },
      { teachers: [] },
      { teachers: [{ id: 'teacher_1622', name: 'Киселёва Анна' }] },
    ),
    'Киселёва Анна',
  );
  assert.equal(
    resolveTeacherName({ teacher_id: 'teacher_999999' }, { teachers: [] }, { teachers: [] }),
    'Педагог без ФИО',
  );
  assert.equal(resolveTeacherName({ teacher_id: 'Смирнова' }, { teachers: [] }, { teachers: [] }), 'Смирнова');
  assert.equal(displayTeacherLabel('teacher_1622'), 'Педагог без ФИО');
});

test('scoreResponse awards rubric points for 1.1 готов', () => {
  const scored = scoreResponse(CHECKLIST, { q_1: 'готов', q_2: 'удовлетворительное' });
  const sec1 = scored.sections.find((s) => s.code === '1');
  assert.ok(sec1);
  assert.equal(sec1.earnedPoints, 200);
  assert.ok(scored.earned >= 200);
});

test('scoreProjectResponses groups two visits of one teacher and keeps another', () => {
  const draft = {
    checklist: CHECKLIST,
    directory: {
      teachers: [{ id: 't1', name: 'Петрова Анна' }],
      departments: [{ id: 'd1', name: 'Кафедра математики' }],
    },
  };
  const rows = [
    {
      id: 1,
      created_at: '2026-09-01T10:00:00Z',
      answers_json: {
        general: {
          teacher_id: 't1',
          department_id: 'd1',
          date: '2026-09-01',
          visitor: 'Методист',
          class: '5А',
          lesson_subject: 'Математика',
        },
        answers: { q_1: 'готов', q_102: 'Сильный старт' },
      },
    },
    {
      id: 2,
      created_at: '2026-09-08T10:00:00Z',
      answers_json: {
        general: {
          teacher_id: 't1',
          department_id: 'd1',
          visit_date: '2026-09-08',
          visitor_name: 'Завуч',
          class_name: '6Б',
        },
        answers: { q_1: 'частично' },
      },
    },
    {
      id: 3,
      created_at: '2026-09-09T10:00:00Z',
      answers_json: {
        general: { teacher_id: 'Другой Пётр', visit_date: '2026-09-09' },
        answers: { q_1: 'готов' },
      },
    },
  ];
  const teachers = scoreProjectResponses(draft, rows);
  assert.equal(teachers.length, 2);
  const petrova = teachers.find((t) => t.stats.teacher_label === 'Петрова Анна');
  assert.ok(petrova);
  assert.equal(petrova.stats.visit_count, 2);
  assert.equal(petrova.stats.department, 'Кафедра математики');
  assert.equal(petrova.stats.last_visit.class_name, '6Б');
  assert.equal(petrova.stats.visits[0].class_name, '5А');
  assert.equal(petrova.stats.visits[0].subject, 'Математика');
  assert.match(petrova.stats.visits[0].summary, /Сильный старт/);
});

test('scoreProjectResponses keeps teacher_* key internally and hides it from the title', () => {
  const draft = { checklist: CHECKLIST, directory: { teachers: [], departments: [] } };
  const teachers = scoreProjectResponses(draft, [
    {
      id: 9,
      created_at: '2026-09-01T10:00:00Z',
      answers_json: {
        general: { teacher_id: 'teacher_999999', visit_date: '2026-09-01' },
        answers: { q_1: 'готов' },
      },
    },
  ]);
  assert.equal(teachers.length, 1);
  assert.equal(teachers[0].teacher_key, teacherKey('teacher_999999'));
  assert.equal(teachers[0].stats.teacher_label, 'Педагог без ФИО');
  assert.doesNotMatch(teachers[0].stats.teacher_label, /^teacher_/);
});

test('scoreProjectResponses fills unknown FIO from visit schedule by class + visitor', () => {
  const draft = { checklist: CHECKLIST, directory: { teachers: [], departments: [] } };
  const scheduleRows = [
    { class_name: '6В', visitor: 'Хорошилов А.А.', teacher: 'Акбатырова Мария' },
    { class_name: '5А', visitor: 'Завуч', teacher: 'Петрова Анна' },
    { class_name: '5А', visitor: 'Завуч', teacher: 'Сидорова Вера' },
  ];
  const filled = scoreProjectResponses(
    draft,
    [
      {
        id: 11,
        created_at: '2026-09-01T10:00:00Z',
        answers_json: {
          general: {
            teacher_id: 'teacher_999999',
            class: '6B',
            visitor: 'Хорошилов',
            visit_date: '2026-09-01',
          },
          answers: { q_1: 'готов' },
        },
      },
    ],
    { scheduleRows },
  );
  assert.equal(filled[0].teacher_key, teacherKey('teacher_999999'));
  assert.equal(filled[0].stats.teacher_label, 'Акбатырова Мария');

  const named = scoreProjectResponses(
    {
      checklist: CHECKLIST,
      directory: { teachers: [{ id: 'teacher_1', name: 'Борисов Иван' }], departments: [] },
    },
    [
      {
        id: 12,
        created_at: '2026-09-01T10:00:00Z',
        answers_json: {
          general: { teacher_id: 'teacher_1', class_name: '6В', visitor_name: 'Хорошилов' },
          answers: { q_1: 'готов' },
        },
      },
    ],
    { scheduleRows },
  );
  assert.equal(named[0].stats.teacher_label, 'Борисов Иван');

  const conflict = scoreProjectResponses(
    draft,
    [
      {
        id: 14,
        created_at: '2026-09-01T10:00:00Z',
        answers_json: {
          general: { teacher_id: 'teacher_777777', class_name: '6В', visitor_name: 'Хорошилов' },
          answers: { q_1: 'готов' },
        },
      },
      {
        id: 15,
        created_at: '2026-09-02T10:00:00Z',
        answers_json: {
          general: { teacher_id: 'teacher_777777', class_name: '5А', visitor_name: 'Завуч Иван' },
          answers: { q_1: 'готов' },
        },
      },
    ],
    {
      scheduleRows: [
        { class_name: '6В', visitor: 'Хорошилов А.А.', teacher: 'Акбатырова Мария' },
        { class_name: '5А', visitor: 'Завуч Иван', teacher: 'Петрова Анна' },
      ],
    },
  );
  assert.equal(conflict[0].stats.teacher_label, 'Педагог без ФИО');

  const ambiguous = scoreProjectResponses(
    draft,
    [
      {
        id: 13,
        created_at: '2026-09-01T10:00:00Z',
        answers_json: {
          general: { teacher_id: 'teacher_888888', class_name: '5А', visitor_name: 'Завуч' },
          answers: { q_1: 'готов' },
        },
      },
    ],
    { scheduleRows },
  );
  assert.equal(ambiguous[0].stats.teacher_label, 'Педагог без ФИО');
});

test('aggregateDashboardKpis counts agreed and published without touching narratives', () => {
  const kpis = aggregateDashboardKpis(
    [
      { teacher_key: 'a', stats: { visit_count: 2, score_ratio: 0.5, department: 'Математика', sections: [] } },
      { teacher_key: 'b', stats: { visit_count: 1, score_ratio: 1, department: 'История', sections: [] } },
    ],
    [
      { teacher_key: 'a', status: 'agreed', published_at: '2026-09-11', narrative: 'Не затирать' },
      { teacher_key: 'b', status: 'draft', published_at: null, narrative: '' },
    ],
    9,
  );
  assert.equal(kpis.response_count, 3);
  assert.equal(kpis.teacher_count, 2);
  assert.equal(kpis.agreed_count, 1);
  assert.equal(kpis.published_count, 1);
  assert.equal(kpis.department_count, 2);
  assert.equal(kpis.last_response_id, 9);
});

test('aggregateDashboardKpis builds traffic-light slices for chairs, teachers, lessons, classes', () => {
  const kpis = aggregateDashboardKpis(
    [
      {
        teacher_key: 'a',
        stats: {
          teacher_label: 'Тестова Алла',
          visit_count: 1,
          score_ratio: 0.8,
          total_earned: 80,
          total_max: 100,
          department: 'Математика',
          sections: [{ code: '1', title: 'Оргблок', earned: 80, max: 100 }],
          visits: [
            {
              subject: 'Алгебра',
              class_name: '5А',
              format: 'очно',
              visitor: 'Методист',
              ordinal: 'высокий',
              date: '2026-09-01',
              earned: 80,
              max: 100,
            },
          ],
        },
      },
    ],
    [],
    1,
  );
  assert.equal(kpis.charts.by_department[0].name, 'Математика');
  assert.equal(kpis.charts.by_department[0].traffic, 'green');
  assert.equal(kpis.charts.by_teacher[0].name, 'Тестова Алла');
  assert.equal(kpis.charts.by_subject[0].name, 'Алгебра');
  assert.equal(kpis.charts.by_class[0].name, '5А');
  assert.equal(kpis.charts.by_format[0].name, 'очно');
  assert.equal(kpis.charts.by_visitor[0].name, 'Методист');
  assert.equal(kpis.charts.by_ordinal[0].name, 'высокий');
  assert.equal(kpis.charts.trend[0].name, '2026-09-01');
});
