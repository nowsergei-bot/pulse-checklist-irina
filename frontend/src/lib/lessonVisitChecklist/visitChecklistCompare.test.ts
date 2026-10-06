import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateObserveVsSelf,
  buildCompareResult,
  formatScoreDelta,
  meanRatio,
  selectCompareCohort,
} from './visitChecklistCompare.ts';

const teachers = [
  {
    teacher_key: 'anna',
    department: 'Математика',
    score_ratio: 0.8,
    sections: [{ code: '1', title: 'Оргблок', fillRatio: 0.9 }],
  },
  {
    teacher_key: 'boris',
    department: 'Математика',
    score_ratio: 0.4,
    sections: [{ code: '1', title: 'Оргблок', fillRatio: 0.3 }],
  },
  {
    teacher_key: 'vera',
    department: 'История',
    score_ratio: 0.6,
    sections: [{ code: '1', title: 'Оргблок', fillRatio: 0.6 }],
  },
];

test('meanRatio ignores empty values', () => {
  assert.equal(meanRatio([0.25, 0.75]), 0.5);
  assert.equal(meanRatio([]), 0);
});

test('selectCompareCohort splits school vs department and excludes self', () => {
  assert.equal(selectCompareCohort(teachers, 'school', { teacher_key: 'anna', department: 'Математика' }).length, 2);
  assert.deepEqual(
    selectCompareCohort(teachers, 'department', { teacher_key: 'anna', department: 'Математика' }).map(
      (row) => row.teacher_key,
    ),
    ['boris'],
  );
  assert.deepEqual(selectCompareCohort(teachers, 'none', { teacher_key: 'anna' }), []);
});

test('buildCompareResult reports section and overall deltas vs department', () => {
  const cmp = buildCompareResult({
    mode: 'department',
    teacherRatio: 0.8,
    teacherSections: [{ code: '1', title: 'Оргблок', fillRatio: 0.9 }],
    teachers,
    current: { teacher_key: 'anna', department: 'Математика' },
  });
  assert.equal(cmp.cohortSize, 1);
  assert.equal(cmp.overall.teacher, 80);
  assert.equal(cmp.overall.cohort, 40);
  assert.equal(cmp.overall.delta, 40);
  assert.equal(cmp.sections[0].teacher, 90);
  assert.equal(cmp.sections[0].cohort, 30);
  assert.equal(cmp.sections[0].delta, 60);
  assert.equal(formatScoreDelta(60), '+60 п.п.');
});

test('buildCompareResult falls back to school section averages when list has no fills', () => {
  const cmp = buildCompareResult({
    mode: 'school',
    teacherRatio: 0.5,
    teacherSections: [{ code: '1', title: 'Оргблок', fillRatio: 0.4 }],
    teachers: [{ teacher_key: 'anna', department: 'Математика', score_ratio: 0.5 }],
    current: { teacher_key: 'anna', department: 'Математика' },
    schoolSections: [{ code: '1', title: 'Оргблок', fillRatio: 0.7 }],
    schoolRatio: 0.66,
  });
  assert.equal(cmp.sections[0].cohort, 70);
  assert.equal(cmp.overall.cohort, 66);
  assert.equal(cmp.overall.delta, 50 - 66);
});

test('aggregateObserveVsSelf keeps observation and self-analysis apart', () => {
  const mix = aggregateObserveVsSelf([
    {
      format: 'очно',
      earned: 40,
      max: 100,
      sections: [{ code: '1', title: 'Оргблок', earned: 40, max: 100 }],
    },
    {
      format: 'Самоанализ',
      earned: 80,
      max: 100,
      sections: [{ code: '1', title: 'Оргблок', earned: 80, max: 100 }],
    },
  ]);
  assert.equal(mix.comparable, true);
  assert.equal(mix.selfHigher, true);
  assert.equal(mix.observe.fillRatio, 0.4);
  assert.equal(mix.self.fillRatio, 0.8);
  assert.equal(mix.gap, 0.4);
  assert.equal(mix.observe.sections[0].fillRatio, 0.4);
  assert.equal(mix.self.sections[0].fillRatio, 0.8);
});
