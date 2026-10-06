import assert from 'node:assert/strict';
import test from 'node:test';
import type { LessonVisitChecklistConfig, LessonVisitResponseRow } from './types.ts';
import {
  buildMethodistInsights,
  buildTeacherCardInsights,
  coverageFromVisits,
  departmentOutliers,
  highlightsForVisit,
  recurringWeakItem,
  stableItemStreaks,
  trendDirectionOf,
} from './visitChecklistCardInsights.ts';
import {
  buildLiveTeacherBundles,
  scoreLiveVisitRow,
  type LiveVisitScore,
} from './visitChecklistLiveCharts.ts';
import { itemTrafficTone } from './visitChecklistCloudUi.ts';

const checklist: LessonVisitChecklistConfig = {
  v: 1,
  generalFields: [],
  sections: [
    {
      id: 'sec_0',
      code: '1',
      title: 'Организационный блок',
      questions: [
        { id: 'q_1', code: '1.1', text: 'Готовность', type: 'radio', options: ['готов', 'частично', 'не готов'] },
        { id: 'q_2', code: '1.2', text: 'Санитарное', type: 'radio', options: ['удовлетворительное', 'неудовлетворительное'] },
      ],
    },
  ],
};

function row(
  id: number,
  general: LessonVisitResponseRow['general'],
  answers: LessonVisitResponseRow['answers'],
): LessonVisitResponseRow {
  return { id, created_at: general.date || general.visit_date || '2026-09-11', general, answers };
}

function visit(id: number, date: string, format: string, answers: LessonVisitResponseRow['answers'], extra?: Partial<LessonVisitResponseRow['general']>): LiveVisitScore {
  return scoreLiveVisitRow(
    checklist,
    row(id, { visit_date: date, visit_format: format, subject: extra?.subject || 'Алгебра', class_name: extra?.class_name || '5А', ...extra }, answers),
  );
}

test('item traffic: explicit zero is red, unanswered is gray', () => {
  assert.equal(itemTrafficTone(0, false), 'red');
  assert.equal(itemTrafficTone(0, true), 'gray');
  assert.equal(itemTrafficTone(0.8, false), 'green');
  assert.equal(itemTrafficTone(0.5, false), 'yellow');
  assert.equal(itemTrafficTone(null, true), 'gray');
});

test('section gap >20pp flags расхождение and draft check', () => {
  const insights = buildTeacherCardInsights({
    liveVisits: [
      visit(1, '2026-09-01', 'очно', { q_1: 'не готов', q_2: 'неудовлетворительное' }),
      visit(2, '2026-09-02', 'Самоанализ', { q_1: 'готов', q_2: 'удовлетворительное' }),
    ],
  });
  assert.equal(insights.badges.gap, true);
  assert.ok(insights.sectionGaps.some((row) => row.flagged && Math.abs(row.gap) > 20));
  assert.match(insights.draft.check || '', /разрыв|визите/i);
});

test('trend of last visits is rising / falling / flat', () => {
  assert.equal(trendDirectionOf([{ score_pct: 40 }, { score_pct: 55 }, { score_pct: 70 }]), 'rising');
  assert.equal(trendDirectionOf([{ score_pct: 70 }, { score_pct: 40 }]), 'falling');
  assert.equal(trendDirectionOf([{ score_pct: 50 }, { score_pct: 52 }]), 'flat');
});

test('stable green and red require two visits in a row', () => {
  const visits = [
    visit(1, '2026-09-01', 'очно', { q_1: 'не готов', q_2: 'удовлетворительное' }),
    visit(2, '2026-09-02', 'очно', { q_1: 'не готов', q_2: 'удовлетворительное' }),
  ];
  const streaks = stableItemStreaks(visits);
  assert.ok(streaks.weaknesses.some((item) => item.code === '1.1' && item.streak >= 2));
  assert.ok(streaks.strengths.some((item) => item.code === '1.2' && item.streak >= 2));
  const insights = buildTeacherCardInsights({ liveVisits: visits });
  assert.equal(insights.badges.repeat, true);
});

test('coverage splits scored / explicit zero / unanswered', () => {
  const mix = coverageFromVisits([
    visit(1, '2026-09-01', 'очно', { q_1: 'готов' }),
  ]);
  assert.ok(mix.scored >= 1);
  assert.ok(mix.unanswered >= 1);
  assert.equal(mix.scored + mix.explicitZero + mix.unanswered, mix.total);
  const zeroMix = coverageFromVisits([
    visit(1, '2026-09-01', 'очно', { q_1: 'не готов', q_2: 'неудовлетворительное' }),
  ]);
  assert.ok(zeroMix.explicitZero >= 1);
  assert.equal(zeroMix.scored, 0);
});

test('highlights keep 3 best and 3 worst answered items', () => {
  const hi = highlightsForVisit(visit(1, '2026-09-01', 'очно', { q_1: 'готов', q_2: 'неудовлетворительное' }));
  assert.ok(hi.best.length >= 1);
  assert.ok(hi.worst.length >= 1);
  assert.ok(hi.best[0].score_pct >= hi.worst[0].score_pct);
});

test('subject and class slices stay separate', () => {
  const insights = buildTeacherCardInsights({
    liveVisits: [
      visit(1, '2026-09-01', 'очно', { q_1: 'готов', q_2: 'удовлетворительное' }, { subject: 'Алгебра', class_name: '5А' }),
      visit(2, '2026-09-02', 'очно', { q_1: 'не готов', q_2: 'неудовлетворительное' }, { subject: 'Геометрия', class_name: '6Б' }),
    ],
  });
  assert.equal(insights.bySubject.length, 2);
  assert.equal(insights.byClass.length, 2);
  assert.ok(insights.bySubject.some((row) => row.name === 'Алгебра'));
  assert.ok(insights.bySubject.some((row) => row.name === 'Геометрия'));
  assert.ok(insights.byClass.some((row) => row.name === '5А'));
  assert.ok(insights.byClass.some((row) => row.name === '6Б'));
});

test('methodist queues, outliers and recurring weak item', () => {
  const teachers = [
    { teacher_key: 'anna', teacher_label: 'Анна', department: 'Математика' },
    { teacher_key: 'olia', teacher_label: 'Оля', department: 'Математика' },
    { teacher_key: 'vera', teacher_label: 'Вера', department: 'История' },
  ];
  const rows: LessonVisitResponseRow[] = [
    row(1, { teacher_name: 'Анна', visit_format: 'очно', visit_date: '2026-09-01' }, { q_1: 'готов', q_2: 'удовлетворительное' }),
    row(2, { teacher_name: 'Анна', visit_format: 'очно', visit_date: '2026-09-02' }, { q_1: 'готов', q_2: 'удовлетворительное' }),
    row(3, { teacher_name: 'Оля', visit_format: 'очно', visit_date: '2026-09-03' }, { q_1: 'не готов', q_2: 'неудовлетворительное' }),
    row(4, { teacher_name: 'Оля', visit_format: 'очно', visit_date: '2026-09-04' }, { q_1: 'не готов', q_2: 'неудовлетворительное' }),
    row(5, { teacher_name: 'Вера', visit_format: 'Самоанализ', visit_date: '2026-09-05' }, { q_1: 'не готов' }),
  ];
  const bundles = buildLiveTeacherBundles(teachers, rows, checklist);
  const methodist = buildMethodistInsights({ bundles });
  assert.deepEqual(methodist.selfOnly.map((row) => row.teacher_label), ['Вера']);
  assert.deepEqual(methodist.pending.map((row) => row.teacher_label), ['Вера']);
  assert.ok(methodist.observeOnly.some((row) => row.teacher_label === 'Анна'));
  assert.ok(!methodist.pending.some((row) => row.teacher_label === 'Анна'));
  const outliers = departmentOutliers(
    bundles.map((row) => ({
      ...row,
      score_ratio: row.teacher_label === 'Анна' ? 0.9 : row.teacher_label === 'Оля' ? 0.4 : row.score_ratio,
    })),
  );
  assert.ok(outliers.some((row) => row.teacher_label === 'Оля' || row.teacher_label === 'Анна'));
  const weak = recurringWeakItem(bundles);
  assert.ok(weak);
  assert.ok(weak.teacher_count >= 2);
});
