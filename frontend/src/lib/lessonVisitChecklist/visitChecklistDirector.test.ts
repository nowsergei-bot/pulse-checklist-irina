import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LessonVisitChecklistConfig, LessonVisitResponseRow } from './types.ts';
import {
  DIRECTOR_TEACHER_DYNAMICS_MIN_VISITS,
  buildDirectorLessonCards,
  buildDirectorTeacherLevelRows,
  buildDirectorTeacherPlaques,
  directorTeachersWithDynamics,
  directorVisitPairKey,
  shouldShowDirectorTeacherDynamics,
} from './visitChecklistDirector.ts';
import { buildLiveTeacherBundles } from './visitChecklistLiveCharts.ts';

const checklist: LessonVisitChecklistConfig = {
  v: 1,
  generalFields: [],
  sections: [
    {
      id: 'sec_10',
      code: '10',
      title: 'Общая оценка урока',
      questions: [
        {
          id: 'q_28',
          code: '10.1',
          text: 'Оцените уровень представленного урока',
          type: 'radio',
          options: ['очень высокий', 'высокий', 'средний', 'ниже среднего', 'низкий'],
        },
        {
          id: 'q_29',
          code: '10.2',
          text: 'Общие выводы',
          type: 'text',
          options: [],
        },
      ],
    },
  ],
};

function row(
  id: number,
  general: LessonVisitResponseRow['general'],
  answers: LessonVisitResponseRow['answers'] = {},
): LessonVisitResponseRow {
  return { id, created_at: general.visit_date || '2026-09-01', general, answers };
}

describe('visit checklist director helper', () => {
  it('pairs observe with self-analysis by teacher + date + class + subject', () => {
    const cards = buildDirectorLessonCards(
      [
        row(
          1,
          {
            teacher_name: 'Петрова Анна',
            visit_date: '2026-09-01',
            class_name: '5А',
            subject: 'Алгебра',
            visitor_name: 'Хорошилов',
            visit_format: 'очно',
          },
          { q_28: 'высокий', q_29: 'Темп урока уверенный' },
        ),
        row(
          2,
          {
            teacher_name: 'Петрова Анна',
            visit_date: '2026-09-01',
            class_name: '5А',
            subject: 'Алгебра',
            visit_format: 'Самоанализ',
          },
          { q_28: 'средний' },
        ),
        row(
          3,
          {
            teacher_name: 'Сидорова Вера',
            visit_date: '2026-09-02',
            class_name: '6Б',
            subject: 'История',
            visitor_name: 'Зенькович',
            visit_format: 'онлайн',
          },
          { q_28: 'очень высокий' },
        ),
      ],
      checklist,
    );

    assert.equal(cards.length, 2);
    assert.equal(cards[0].teacher, 'Сидорова Вера');
    assert.equal(cards[0].selfRating, null);
    assert.equal(cards[1].subject, 'Алгебра');
    assert.equal(cards[1].visitor, 'Хорошилов');
    assert.equal(cards[1].class_name, '5А');
    assert.equal(cards[1].rating.pick, 'высокий');
    assert.equal(cards[1].feedback, 'Темп урока уверенный');
    assert.equal(cards[1].selfRating?.pick, 'средний');
    assert.equal(cards[1].rating.unanswered, false);
    assert.ok(cards[1].rating.traffic);
  });

  it('keeps orphan self-analysis cards when no observation pair exists', () => {
    const cards = buildDirectorLessonCards(
      [
        row(
          10,
          {
            teacher_name: 'Петрова Анна',
            visit_date: '2026-09-05',
            class_name: '5А',
            subject: 'Алгебра',
            visit_format: 'Самоанализ',
          },
          { q_28: 'высокий' },
        ),
      ],
      checklist,
    );
    assert.equal(cards.length, 1);
    assert.equal(cards[0].format, 'Самоанализ');
    assert.equal(cards[0].rating.pick, 'высокий');
    assert.equal(cards[0].selfRating?.pick, 'высокий');
    const plaques = buildDirectorTeacherPlaques(cards);
    assert.equal(plaques.length, 1);
    assert.equal(plaques[0].observe, 0);
    assert.equal(plaques[0].self, 1);
  });

  it('groups lesson ratings by teacher, weak first, and drops unknown FIO', () => {
    const cards = buildDirectorLessonCards(
      [
        row(1, { teacher_name: 'Петрова Анна', visit_date: '2026-09-01', class_name: '5А', subject: 'Алгебра', visit_format: 'очно' }, { q_28: 'высокий' }),
        row(2, { teacher_name: 'Петрова Анна', visit_date: '2026-09-08', class_name: '5А', subject: 'Геометрия', visit_format: 'очно' }, { q_28: 'очень высокий' }),
        row(3, { teacher_name: 'Сидорова Вера', visit_date: '2026-09-03', class_name: '7А', subject: 'Химия', visit_format: 'очно' }, { q_28: 'низкий' }),
        row(4, { teacher_name: 'teacher_999', visit_date: '2026-09-03', class_name: '7А', subject: 'Химия', visit_format: 'очно' }, { q_28: 'высокий' }),
        row(5, { teacher_name: 'Педагог без ФИО', visit_date: '2026-09-04', class_name: '8А', subject: 'Биология', visit_format: 'очно' }, { q_28: 'средний' }),
      ],
      checklist,
    );
    assert.equal(cards.every((card) => card.teacher !== 'Педагог без ФИО'), true);
    assert.equal(cards.some((card) => /teacher_/i.test(card.teacher)), false);
    const plaques = buildDirectorTeacherPlaques(cards);
    assert.equal(plaques.length, 2);
    assert.equal(plaques.find((row) => row.teacher === 'Петрова Анна')?.observe, 2);
    const withPhotos = buildDirectorTeacherPlaques(cards, [
      {
        teacher_key: 'petrova',
        teacher_label: 'Петрова',
        department: 'Математика',
        visit_count: 2,
        score_ratio: 0.8,
        last_visit: null,
        status: 'agreed',
        photo_url: 'https://example.test/petrova.jpg',
      },
    ]);
    assert.equal(withPhotos.find((row) => row.teacher === 'Петрова Анна')?.photo_url, 'https://example.test/petrova.jpg');
    assert.equal(withPhotos[0].teacher, 'Сидорова Вера');
    const rows = buildDirectorTeacherLevelRows(plaques);
    assert.equal(rows[0].name, 'Сидорова Вера');
    assert.equal(rows[0].visits, 1);
    assert.ok(rows[0].score_pct < rows[1].score_pct);
    assert.equal(rows[1].name, 'Петрова Анна');
    assert.equal(rows[1].visits, 2);
  });

  it('hides teacher dynamics until some teacher has three observe visits', () => {
    assert.equal(DIRECTOR_TEACHER_DYNAMICS_MIN_VISITS, 3);
    const teachers = [
      { teacher_key: 'anna', teacher_label: 'Анна', department: 'Математика' },
      { teacher_key: 'vera', teacher_label: 'Вера', department: 'История' },
    ];
    const few = buildLiveTeacherBundles(teachers, [
      row(1, { teacher_name: 'Анна', visit_format: 'очно', visit_date: '2026-09-01' }),
      row(2, { teacher_name: 'Анна', visit_format: 'очно', visit_date: '2026-09-02' }),
      row(3, { teacher_name: 'Вера', visit_format: 'Самоанализ', visit_date: '2026-09-03' }),
    ], checklist);
    assert.equal(shouldShowDirectorTeacherDynamics(few), false);

    const enough = buildLiveTeacherBundles(teachers, [
      row(1, { teacher_name: 'Анна', visit_format: 'очно', visit_date: '2026-09-01' }),
      row(2, { teacher_name: 'Анна', visit_format: 'очно', visit_date: '2026-09-02' }),
      row(3, { teacher_name: 'Анна', visit_format: 'очно', visit_date: '2026-09-03' }),
      row(4, { teacher_name: 'Вера', visit_format: 'очно', visit_date: '2026-09-04' }),
    ], checklist);
    assert.equal(shouldShowDirectorTeacherDynamics(enough), true);
    assert.deepEqual(
      directorTeachersWithDynamics(enough).map((row) => row.teacher_label),
      ['Анна'],
    );
  });

  it('fills unknown teacher from visit schedule by class + visitor', () => {
    const cards = buildDirectorLessonCards(
      [
        row(
          1,
          {
            teacher_id: 'teacher_999999',
            visit_date: '2026-09-01',
            class_name: '6B',
            subject: 'Лидерство',
            visitor_name: 'Хорошилов',
            visit_format: 'очно',
          },
          { q_28: 'высокий' },
        ),
      ],
      checklist,
      { teachers: [], departments: [] },
      [{ class_name: '6В', visitor: 'Хорошилов А.А.', teacher: 'Акбатырова Мария' }],
    );
    assert.equal(cards[0].teacher, 'Акбатырова Мария');
  });

  it('builds a stable pair key', () => {
    assert.equal(
      directorVisitPairKey('Петрова Анна', '2026-09-01', '5А', 'Алгебра'),
      directorVisitPairKey('петрова  анна', '2026-09-01T00:00', '5а', 'алгебра'),
    );
  });

  it('buildDirectorTeacherPlaques prefers live self counts over paired selfRating', () => {
    const cards = buildDirectorLessonCards(
      [
        row(1, { teacher_name: 'Анна', visit_format: 'очно', visit_date: '2026-09-01' }),
        row(2, { teacher_name: 'Анна', visit_format: 'очно', visit_date: '2026-09-02' }),
      ],
      checklist,
    );
    const plaques = buildDirectorTeacherPlaques(cards, undefined, undefined, new Map([['анна', 3]]));
    assert.equal(plaques[0].self, 3);
  });
});
