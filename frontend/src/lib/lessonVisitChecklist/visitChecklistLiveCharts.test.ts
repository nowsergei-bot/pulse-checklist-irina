import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { LessonVisitChecklistConfig, LessonVisitResponseRow } from './types.ts';
import { aggregateObserveVsSelf } from './visitChecklistCompare.ts';
import {
  buildCoverageTeacherList,
  buildDepartmentSectionHeatmap,
  buildLiveDashboardCharts,
  buildLiveTeacherBundles,
  buildTeacherCoverage,
  coverageRowHoverText,
  coverageRowVisibleLabel,
  pendingVisitTeachers,
  visitFormatChartRows,
  observeSelfSectionGaps,
  preferChartRows,
  rankRubricItems,
  scoreLiveVisitRow,
  summarizeWatchers,
  visitTrendPoints,
} from './visitChecklistLiveCharts.ts';
import { VISIT_CHECKLIST_TOTAL_MAX } from './visitChecklistRubricScore.ts';

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

test('scoreLiveVisitRow uses official section max and keeps unanswered in the denominator', () => {
  const scored = scoreLiveVisitRow(
    checklist,
    row(
      1,
      {
        class: '5А',
        lesson_subject: 'Алгебра',
        visitor: 'Методист',
        format: 'очно',
        date: '2026-09-11',
      },
      { q_1: 'готов', q_2: 'удовлетворительное' },
    ),
  );
  assert.equal(scored.class_name, '5А');
  assert.equal(scored.subject, 'Алгебра');
  assert.equal(scored.visitor, 'Методист');
  assert.equal(scored.format, 'очно');
  const org = scored.sections.find((sec) => sec.code === '1');
  assert.equal(org?.earned, 200);
  assert.equal(org?.max, 200);
  assert.equal(org?.fillRatio, 1);
  assert.equal(scored.earned, 200);
  assert.equal(scored.max, VISIT_CHECKLIST_TOTAL_MAX);
  assert.ok((org?.items[0].name || '').includes('Готовность'));
});

test('buildLiveDashboardCharts fills subject/class/format from live rows', () => {
  const rows: LessonVisitResponseRow[] = [
    row(1, { class_name: '5А', subject: 'Алгебра', visitor_name: 'Методист', visit_format: 'очно' }, { q_1: 'готов' }),
    row(2, { class_name: '6Б', subject: 'Алгебра', visitor_name: 'Завуч', visit_format: 'Самоанализ' }, { q_1: 'частично' }),
  ];
  const charts = buildLiveDashboardCharts(rows, checklist);
  assert.equal(charts.by_subject.length, 1);
  assert.equal(charts.by_subject[0].name, 'Алгебра');
  assert.equal(charts.by_class.length, 2);
  assert.equal(charts.by_format.length, 1);
  assert.equal(charts.by_format[0].name, 'Очно');
  assert.ok(charts.sections.some((sec) => sec.code === '1' && sec.score_pct > 0));
  assert.equal(charts.observeSelf.comparable, true);
  assert.ok(charts.itemDiagrams[0].items.some((item) => /Готовность/i.test(item.name)));
});

test('preferChartRows hides empty primary buckets', () => {
  assert.deepEqual(preferChartRows([], [{ name: 'A', visits: 1, score_ratio: 0.5, score_pct: 50, traffic: 'yellow' }]), [
    { name: 'A', visits: 1, score_ratio: 0.5, score_pct: 50, traffic: 'yellow' },
  ]);
  assert.deepEqual(preferChartRows([], []), []);
});

test('visitTrendPoints keeps last visits as a date series', () => {
  const visits = [1, 2, 3, 4].map((n) =>
    scoreLiveVisitRow(
      checklist,
      row(
        n,
        { visit_date: `2026-09-0${n}`, visit_format: n === 4 ? 'Самоанализ' : 'очно', subject: 'Алгебра' },
        { q_1: n > 2 ? 'готов' : 'частично' },
      ),
    ),
  );
  const trend = visitTrendPoints(visits);
  assert.equal(trend.length, 4);
  assert.equal(trend[0].date, '2026-09-01');
  assert.equal(trend[3].date, '2026-09-04');
  assert.ok(trend[3].score_pct > trend[0].score_pct);
});

test('rankRubricItems uses human wording and earned/max', () => {
  const visits = [
    scoreLiveVisitRow(
      checklist,
      row(1, { visit_format: 'очно' }, { q_1: 'не готов', q_2: 'удовлетворительное' }),
    ),
    scoreLiveVisitRow(
      checklist,
      row(2, { visit_format: 'очно' }, { q_1: 'не готов', q_2: 'удовлетворительное' }),
    ),
  ];
  const weak = rankRubricItems(visits, { limit: 2, direction: 'weak' });
  const strong = rankRubricItems(visits, { limit: 2, direction: 'strong' });
  assert.ok(weak[0].title.includes('Готовность'));
  assert.equal(weak[0].earned, 0);
  assert.equal(weak[0].max, 100);
  assert.ok(strong[0].title.includes('Санитарное'));
  assert.equal(strong[0].score_pct, 100);
});

test('observeSelfSectionGaps flags a high self / low observe section', () => {
  const gaps = observeSelfSectionGaps(
    aggregateObserveVsSelf([
      {
        format: 'очно',
        earned: 20,
        max: 100,
        sections: [{ code: '1', title: 'Оргблок', earned: 20, max: 100 }],
      },
      {
        format: 'Самоанализ',
        earned: 90,
        max: 100,
        sections: [{ code: '1', title: 'Оргблок', earned: 90, max: 100 }],
      },
    ]),
  );
  assert.equal(gaps[0].observe, 20);
  assert.equal(gaps[0].self, 90);
  assert.equal(gaps[0].selfMuchHigher, true);
  assert.equal(gaps[0].flagged, true);
});

test('summarizeWatchers splits очно / онлайн / самоанализ and visitor names', () => {
  const visits = [
    scoreLiveVisitRow(checklist, row(1, { visit_format: 'очно', visitor_name: 'Методист' }, { q_1: 'готов' })),
    scoreLiveVisitRow(checklist, row(2, { visit_format: 'онлайн', visitor_name: 'Методист' }, { q_1: 'готов' })),
    scoreLiveVisitRow(checklist, row(3, { visit_format: 'Самоанализ', visitor_name: 'Педагог' }, { q_1: 'готов' })),
  ];
  const watchers = summarizeWatchers(visits);
  assert.equal(watchers.offline, 1);
  assert.equal(watchers.online, 1);
  assert.equal(watchers.self, 1);
  assert.deepEqual(watchers.visitors, [{ name: 'Методист', count: 2 }]);
});

test('heatmap and coverage use the teacher list plus live responses', () => {
  const teachers = [
    { teacher_key: 'anna', teacher_label: 'Анна', department: 'Математика' },
    { teacher_key: 'vera', teacher_label: 'Вера', department: 'История' },
    { teacher_key: 'olia', teacher_label: 'Оля', department: 'Математика' },
    { teacher_key: 'nina', teacher_label: 'Нина', department: 'История' },
  ];
  const rows: LessonVisitResponseRow[] = [
    row(1, { teacher_name: 'Анна', visit_format: 'очно', visit_date: '2026-09-01' }, { q_1: 'готов' }),
    row(2, { teacher_name: 'Анна', visit_format: 'очно', visit_date: '2026-09-02' }, { q_1: 'готов' }),
    row(3, { teacher_name: 'Вера', visit_format: 'Самоанализ', visit_date: '2026-09-03' }, { q_1: 'частично' }),
    row(4, { teacher_name: 'Оля', visit_format: 'очно', visit_date: '2026-09-04' }, { q_1: 'не готов' }),
  ];
  const bundles = buildLiveTeacherBundles(teachers, rows, checklist);
  const heatmap = buildDepartmentSectionHeatmap(bundles);
  const coverage = buildTeacherCoverage(bundles);
  assert.deepEqual(heatmap.departments, ['История', 'Математика']);
  assert.equal(heatmap.sections.length, 10);
  const mathOrg = heatmap.cells.find((cell) => cell.department === 'Математика' && cell.code === '1');
  const histOrg = heatmap.cells.find((cell) => cell.department === 'История' && cell.code === '1');
  assert.ok(mathOrg && mathOrg.fillRatio > (histOrg?.fillRatio || 0));
  assert.deepEqual(
    coverage.none.map((row) => row.teacher_label),
    ['Нина'],
  );
  assert.deepEqual(
    coverage.selfOnly.map((row) => row.teacher_label),
    ['Вера'],
  );
  assert.deepEqual(
    coverage.fewObserve.map((row) => row.teacher_label),
    ['Оля'],
  );
  assert.deepEqual(
    coverage.observeOnly.map((row) => row.teacher_label),
    ['Анна', 'Оля'],
  );
  const charts = buildLiveDashboardCharts(rows, checklist, teachers);
  assert.equal(charts.heatmap.departments.length, 2);
  assert.ok(charts.coverage.none.length);
});

test('visit format chart counts only external observations', () => {
  const rows: LessonVisitResponseRow[] = [
    row(1, { visit_format: 'очно' }, { q_1: 'готов' }),
    row(2, { visit_format: 'очно' }, { q_1: 'готов' }),
    row(3, { visit_format: 'онлайн' }, { q_1: 'готов' }),
    row(4, { visit_format: 'Самоанализ' }, { q_1: 'готов' }),
    row(5, { visit_format: 'Самоанализ' }, { q_1: 'готов' }),
    row(6, { visit_format: 'Самоанализ' }, { q_1: 'готов' }),
    row(7, { visit_format: 'Самоанализ' }, { q_1: 'готов' }),
  ];
  const charts = buildLiveDashboardCharts(rows, checklist);
  assert.deepEqual(
    new Map(charts.by_format.map((item) => [item.name, item.visits])),
    new Map([
      ['Очно', 2],
      ['Онлайн', 1],
    ]),
  );
  assert.equal(charts.by_format.length, 2);
  assert.equal(charts.by_format.reduce((sum, item) => sum + item.visits, 0), 3);
  assert.equal(
    visitFormatChartRows([
      { name: 'очно', visits: 2, score_ratio: 0.8, score_pct: 80, traffic: 'green' },
      { name: 'Самоанализ', visits: 4, score_ratio: 0.5, score_pct: 50, traffic: 'yellow' },
      { name: 'онлайн', visits: 1, score_ratio: 0.7, score_pct: 70, traffic: 'green' },
    ]).reduce((sum, item) => sum + item.visits, 0),
    3,
  );
});

test('pending visits include no records and self-only, not observed teachers', () => {
  const directory = {
    departments: [
      { id: 'dept_math', name: 'Математика' },
      { id: 'dept_hist', name: 'История' },
    ],
    teachers: [
      { id: 't-a', name: 'Учитель А', departmentId: 'dept_math' },
      { id: 't-b', name: 'Учитель Б', departmentId: 'dept_math' },
      { id: 't-c', name: 'Учитель В', departmentId: 'dept_hist' },
      { id: 't-d', name: 'Учитель Г', departmentId: 'dept_hist' },
    ],
  };
  const coverageTeachers = buildCoverageTeacherList(directory, []);
  const rows: LessonVisitResponseRow[] = [
    row(1, { teacher_name: 'Учитель Б', visit_format: 'Самоанализ' }, { q_1: 'готов' }),
    row(2, { teacher_name: 'Учитель В', visit_format: 'очно' }, { q_1: 'готов' }),
    row(3, { teacher_name: 'Учитель Г', visit_format: 'онлайн' }, { q_1: 'готов' }),
  ];
  const charts = buildLiveDashboardCharts(rows, checklist, coverageTeachers, directory);
  const pending = pendingVisitTeachers(charts.coverage);
  assert.deepEqual(
    pending.map((item) => item.teacher_label),
    ['Учитель А', 'Учитель Б'],
  );
  assert.ok(!pending.some((item) => item.teacher_label === 'Учитель В'));
  assert.ok(!pending.some((item) => item.teacher_label === 'Учитель Г'));
});

test('teacher162-style answers drop from coverage and live aggregates', () => {
  const directory = {
    departments: [{ id: 'dept_math', name: 'Кафедра математики' }],
    teachers: [
      { id: 'teacher_162', name: 'Митяжин Роман Валерьевич', departmentId: 'dept_math' },
      { id: 'teacher_1', name: 'Петрова Анна Сергеевна', departmentId: 'dept_math' },
    ],
  };
  const teachers = [
    { teacher_key: 'teacher162', teacher_label: 'teacher162', department: 'Кафедра математики' },
    { teacher_key: 'teacher163', teacher_label: 'teacher163', department: 'Кафедра математики' },
    { teacher_key: 'teacher_1', teacher_label: 'Петрова Анна Сергеевна', department: 'Кафедра математики' },
  ];
  const rows: LessonVisitResponseRow[] = [
    row(
      1,
      { teacher_id: 'teacher162', visit_format: 'очно', subject: 'Алгебра', visit_date: '2026-09-01' },
      { q_1: 'готов' },
    ),
    row(
      2,
      { teacher_id: 'teacher163', visit_format: 'очно', subject: 'Алгебра', visit_date: '2026-09-02' },
      { q_1: 'готов' },
    ),
    row(
      3,
      { teacher_id: 'teacher_1', teacher_name: 'Петрова Анна Сергеевна', visit_format: 'очно', subject: 'Геометрия', visit_date: '2026-09-03' },
      { q_1: 'готов' },
    ),
  ];
  const charts = buildLiveDashboardCharts(rows, checklist, teachers, directory);
  const labels = [
    ...charts.coverage.none,
    ...charts.coverage.selfOnly,
    ...charts.coverage.observeOnly,
    ...charts.coverage.fewObserve,
  ].map((item) => item.teacher_label);
  assert.equal(labels.some((name) => /teacher16[23]|t16[23]/i.test(name)), false);
  assert.ok(labels.includes('Петрова Анна Сергеевна'));
  assert.equal(charts.by_subject.reduce((sum, item) => sum + item.visits, 0), 1);
  assert.deepEqual(
    new Map(charts.by_subject.map((item) => [item.name, item.visits])),
    new Map([['Геометрия', 1]]),
  );
  const petrova = charts.coverage.fewObserve.find((item) => item.teacher_label === 'Петрова Анна Сергеевна');
  assert.ok(petrova);
  assert.equal(coverageRowVisibleLabel(petrova), 'Петрова Анна Сергеевна');
  assert.doesNotMatch(coverageRowVisibleLabel(petrova), /кафедр|набл|самоан/i);
  assert.match(coverageRowHoverText(petrova), /Кафедра математики/);
  assert.match(coverageRowHoverText(petrova), /3 сентября 2026/);
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../pages/visitChecklistCloud/VisitChecklistCloudCharts.tsx'),
    'utf8',
  );
  assert.doesNotMatch(src, /· \{row\.department\} · набл/);
});
