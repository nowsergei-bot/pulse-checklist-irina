import assert from 'node:assert/strict';
import { register } from 'node:module';
import { Writable } from 'node:stream';
import test from 'node:test';
import { VISIT_FORMAT_SELF_ANALYSIS } from './normalizeChecklist.ts';
import {
  displayVisitFormatOptionLabel,
  isSelfAnalysisFormat,
  pickVisitFormat,
} from './visitChecklistFormat.ts';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PHENOMENON_ITEMS,
  PHENOMENON_MASTERY_IDS,
  PHENOMENON_MAX_SCORE,
  PHENOMENON_OPEN_FOR_ALL,
  PHENOMENON_OVERALL,
  buildPhenomenonSubmission,
  cachePhenomenonAccess,
  phenomenonMenuVisible,
  emptyPhenomenonGeneral,
  masteryQuestionText,
  maxScoreFromDefinition,
  phenomenonExcelSheets,
  phenomenonLessonByRecord,
  PHENOMENON_ALL_WEEKS,
  PHENOMENON_WEEKS,
  defaultPhenomenonWeek,
  phenomenonLessonDetail,
  phenomenonLessonRows,
  phenomenonRecordsForWeek,
  phenomenonWeekOf,
  summarizePhenomenonWeek,
  phenomenonDepartmentPairSlices,
  phenomenonComments,
  phenomenonDynamics,
  phenomenonDiscrepancies,
  phenomenonStageOf,
  phenomenonStageSlices,
  phenomenonTeacherRows,
  sortPhenomenonTeachers,
  parsePhenomenonLessonNumber,
  PHENOMENON_LESSON_NUMBERS,
  phenomenonLevel,
  scorePhenomenon,
  summarizePhenomenonLessons,
  summarizePhenomenonTeachers,
  filterPhenomenonRecords,
  toPhenomenonRecord,
  validatePhenomenon,
  type PhenomenonAnswers,
  type PhenomenonGeneral,
} from './publicForm.ts';
import {
  PHENOMENON_CHECKLIST_PATH,
  isPhenomenonChecklistLocation,
  isVisitChecklistNavItemCurrent,
  visitChecklistNavItems,
  VISIT_CHECKLIST_FORM_PATH,
} from '../visitChecklistNav.ts';
import { levelIndex } from './reportPresentation.ts';

test('isSelfAnalysisFormat detects Самоанализ and aliases', () => {
  assert.equal(isSelfAnalysisFormat(VISIT_FORMAT_SELF_ANALYSIS), true);
  assert.equal(isSelfAnalysisFormat('самоанализ'), true);
  assert.equal(isSelfAnalysisFormat('self'), true);
  assert.equal(isSelfAnalysisFormat('self-analysis'), true);
  assert.equal(isSelfAnalysisFormat('само-анализ'), true);
  assert.equal(isSelfAnalysisFormat('очно'), false);
});

test('pickVisitFormat prefers visit_format over legacy format', () => {
  assert.equal(pickVisitFormat({ visit_format: 'Самоанализ', format: 'очно' }), 'Самоанализ');
  assert.equal(pickVisitFormat({ visitFormat: 'онлайн' }), 'онлайн');
});

test('displayVisitFormatOptionLabel shows lowercase самоанализ for stored value', () => {
  assert.equal(displayVisitFormatOptionLabel(VISIT_FORMAT_SELF_ANALYSIS), 'самоанализ');
  assert.equal(displayVisitFormatOptionLabel('очно'), 'очно');
  assert.equal(displayVisitFormatOptionLabel('онлайн'), 'онлайн');
});

// --- Чек-лист феноменального урока ------------------------------------------------
const GENERAL: PhenomenonGeneral = {
  ...emptyPhenomenonGeneral(new Date(2026, 10, 16), 'Наблюдатель Тестовый'),
  class_name: '8А',
  students_count: '24',
  lesson_number: '3',
  teacher1_id: 't1',
  teacher1_name: 'Педагог Первый',
  teacher2_id: 't2',
  teacher2_name: 'Педагог Второй',
};

function maxAnswers(): PhenomenonAnswers {
  const a: PhenomenonAnswers = {};
  for (const item of PHENOMENON_ITEMS) {
    const best = [...item.options].sort((x, y) => (y.score ?? -1) - (x.score ?? -1))[0];
    a[item.id] = best.id;
  }
  a[PHENOMENON_OVERALL.id] = 'very_high';
  a.ph_mastery_1 = '9';
  a.ph_mastery_2 = '7';
  return a;
}

describe('phenomenon checklist', () => {
  it('1. RU and EN with the same choices give the same record and the same total', () => {
    const answers = maxAnswers();
    answers.ph_objectives = 'joint';
    answers.ph_engagement = 'most';
    const ru = validatePhenomenon(GENERAL, answers, 'ru');
    const en = validatePhenomenon(GENERAL, answers, 'en');
    assert.equal(ru.ok, true);
    assert.equal(en.ok, true);
    // Форма отдаёт одинаковые идентификаторы на любом языке: язык в запись не попадает.
    const recRu = buildPhenomenonSubmission(GENERAL, answers);
    const recEn = buildPhenomenonSubmission(GENERAL, { ...answers });
    assert.deepEqual(recRu, recEn);
    assert.equal(JSON.stringify(recRu).includes('locale'), false);
    for (const v of Object.values(recRu.answers)) {
      assert.match(v, /^[a-z_0-9]+$/, 'stored values are ids, not texts');
    }
    assert.deepEqual(scorePhenomenon(recRu.answers), scorePhenomenon(recEn.answers));
  });

  it('2. all maximum answers: 22 of 22, total 100, very high', () => {
    assert.equal(maxScoreFromDefinition(), PHENOMENON_MAX_SCORE);
    const s = scorePhenomenon(maxAnswers());
    assert.equal(s.points, 22);
    assert.equal(s.max, 22);
    assert.equal(s.percent, 100);
    assert.equal(s.level, 'very_high');
    assert.equal(s.complete, true);
    // «Использование дополнительных инструментов» без баллов: любой вариант не меняет итог.
    for (const opt of PHENOMENON_ITEMS.find((i) => i.id === 'ph_tools')!.options) {
      assert.equal(scorePhenomenon({ ...maxAnswers(), ph_tools: opt.id }).points, 22);
    }
  });

  it('levels match the main checklist thresholds', () => {
    assert.equal(phenomenonLevel(39.9), 'very_low');
    assert.equal(phenomenonLevel(40), 'low');
    assert.equal(phenomenonLevel(49.9), 'low');
    assert.equal(phenomenonLevel(50), 'medium');
    assert.equal(phenomenonLevel(69.9), 'medium');
    assert.equal(phenomenonLevel(70), 'high');
    assert.equal(phenomenonLevel(84.9), 'high');
    assert.equal(phenomenonLevel(85), 'very_high');
    const order = ['very_low', 'low', 'medium', 'high', 'very_high'];
    for (const p of [0, 39.99, 40, 45, 49.99, 50, 69.99, 70, 84.99, 85, 100]) {
      assert.equal(order.indexOf(phenomenonLevel(p)), levelIndex(p), String(p));
    }
  });

  it('3. the same teacher cannot be chosen first and second', () => {
    const same = validatePhenomenon({ ...GENERAL, teacher2_id: 't1', teacher2_name: 'Педагог Первый' }, maxAnswers(), 'ru');
    assert.equal(same.ok, false);
    assert.equal(same.ok === false && same.sameTeacher, true);
    const page = readFileSync(fileURLToPath(new URL('../../pages/lessonFeedback/LessonVisitChecklistCabinetFormPage.tsx', import.meta.url)), 'utf8');
    // В списке второго педагога скрыт первый и наоборот.
    assert.match(page, /excludeNames=\{general\.teacher2_name \? \[general\.teacher2_name\] : \[\]\}/);
    assert.match(page, /excludeNames=\{general\.teacher1_name \? \[general\.teacher1_name\] : \[\]\}/);
  });

  it('4. mastery questions show the chosen teachers in both languages', () => {
    assert.equal(
      masteryQuestionText('ph_mastery_1', 'ru', GENERAL.teacher1_name),
      'Уровень профессионально-методического мастерства: Педагог Первый',
    );
    assert.equal(masteryQuestionText('ph_mastery_2', 'en', GENERAL.teacher2_name), 'Teaching expertise: Педагог Второй');
    assert.equal(masteryQuestionText('ph_mastery_2', 'ru', GENERAL.teacher2_name), 'Уровень профессионально-методического мастерства: Педагог Второй');
    assert.equal(masteryQuestionText('ph_mastery_1', 'en', GENERAL.teacher1_name), 'Teaching expertise: Педагог Первый');
    assert.equal(masteryQuestionText('ph_mastery_2', 'ru', ''), 'Уровень профессионально-методического мастерства: второй педагог');
  });

  it('5. required fields block submission, general comments are optional', () => {
    const ok = validatePhenomenon(GENERAL, maxAnswers(), 'ru');
    assert.equal(ok.ok, true, 'without comments');
    for (const key of ['date', 'observer_name', 'class_name', 'students_count', 'lesson_number', 'teacher1_name', 'teacher2_name'] as const) {
      const r = validatePhenomenon({ ...GENERAL, [key]: '' }, maxAnswers(), 'ru');
      assert.equal(r.ok, false, key);
    }
    for (const id of [...PHENOMENON_ITEMS.map((i) => i.id), PHENOMENON_OVERALL.id, ...PHENOMENON_MASTERY_IDS]) {
      const a = maxAnswers();
      delete a[id];
      const r = validatePhenomenon(GENERAL, a, 'en');
      assert.equal(r.ok, false, id);
      assert.ok(r.ok === false && r.missing.some((m) => m.id === `question-${id}`), id);
    }
    const sub = buildPhenomenonSubmission(GENERAL, { ...maxAnswers(), ph_comments: '  Вывод  ' });
    assert.equal(sub.answers.ph_comments, 'Вывод');
  });

  it('lesson total is the mean of all observers; mastery is per teacher and not in the lesson total', () => {
    const row = (id: number, answers: PhenomenonAnswers, general: Partial<PhenomenonGeneral> = {}) =>
      toPhenomenonRecord({ id, created_at: '2026-11-16T10:00:00Z', general: { ...GENERAL, ...general }, answers });
    const low = { ...maxAnswers(), ph_phenomenon: 'none', ph_mastery_1: '3', ph_mastery_2: '5' }; // 16 из 22
    const records = [
      row(1, maxAnswers()),
      // Тот же урок: педагоги в другом порядке, класс записан иначе.
      row(2, low, { class_name: '8 а', teacher1_id: 't2', teacher1_name: 'Педагог Второй', teacher2_id: 't1', teacher2_name: 'Педагог Первый' }),
      row(3, maxAnswers(), { date: '2026-11-17' }),
    ];
    const lessons = summarizePhenomenonLessons(records);
    assert.equal(lessons.length, 2);
    const first = lessons.find((l) => l.date === '2026-11-16')!;
    assert.equal(first.checklists, 2);
    assert.equal(first.percent, Math.round(((100 + (16 / 22) * 100) / 2) * 10) / 10);
    const teachers = summarizePhenomenonTeachers(records);
    const t1 = teachers.find((t) => t.key === 't1')!;
    // t1: 9 (урок 1), 5 (урок 2, вторым), 9 (урок 3)
    assert.equal(t1.ratings, 3);
    assert.equal(t1.mastery, Math.round(((9 + 5 + 9) / 3) * 10) / 10);
    // Мастерство не влияет на итог чек-листа.
    assert.equal(scorePhenomenon({ ...maxAnswers(), ph_mastery_1: '1', ph_mastery_2: '1' }).percent, 100);
    assert.equal(filterPhenomenonRecords(records, { from: '2026-11-17' }).length, 1);
    assert.equal(filterPhenomenonRecords(records, { teacher: 'педагог второй' }).length, 3);
    const sheets = phenomenonExcelSheets(records);
    assert.deepEqual(sheets.map((s) => s.name), ['Чек-листы', 'Уроки', 'Педагоги', 'Профиль по критериям', 'Расхождения']);
    assert.equal(sheets[0].rows.length, 4);
    assert.equal(sheets[0].rows[1][8], 100);
    assert.equal(sheets[0].rows[1][9], 'очень высокий');
  });

  describe('lesson count: lesson = date + teacher pair', () => {
    const row = (id: number, general: Partial<PhenomenonGeneral>, answers: PhenomenonAnswers = maxAnswers()) =>
      toPhenomenonRecord({ id, created_at: '2026-11-16T10:00:00Z', general: { ...GENERAL, ...general }, answers });
    const pairB = { teacher1_id: 't3', teacher1_name: 'Педагог Третий', teacher2_id: 't4', teacher2_name: 'Педагог Четвёртый' };
    const low = { ...maxAnswers(), ph_phenomenon: 'none' }; // 16 из 22

    it('«4АС» and «4AC» (Latin letters) for the same pair and date are one lesson; total = mean of all its checklists', () => {
      const records = [
        row(1, { class_name: '4АС', lesson_number: '8' }),
        row(2, { class_name: '4AC', lesson_number: '8' }, low),
        // Педагоги в другом порядке.
        row(3, { class_name: '4АС', lesson_number: '8', teacher1_id: 't2', teacher1_name: 'Педагог Второй', teacher2_id: 't1', teacher2_name: 'Педагог Первый' }),
      ];
      const lessons = summarizePhenomenonLessons(records);
      assert.equal(lessons.length, 1);
      assert.equal(lessons[0].checklists, 3);
      assert.equal(lessons[0].className, '4АС, 4AC');
      assert.equal(lessons[0].lessonNumber, '8');
      assert.equal(lessons[0].percent, Math.round(((100 + (16 / 22) * 100 + 100) / 3) * 10) / 10);
      const byRecord = phenomenonLessonByRecord(records);
      assert.equal(byRecord.get(2)?.percent, lessons[0].percent);
    });

    it('«10» and «10А», a wrong period number or an unreadable one do not split a lesson', () => {
      const records = [
        row(1, { class_name: '10', lesson_number: '8' }),
        row(2, { class_name: '10А', lesson_number: '8' }),
        row(3, { class_name: '10 А', lesson_number: '7' }),
        row(4, { class_name: 'кабинет 111', lesson_number: '11:50-12:30' }),
        row(5, { class_name: '10a', lesson_number: '8th period' }),
      ];
      const lessons = summarizePhenomenonLessons(records);
      assert.equal(lessons.length, 1);
      assert.equal(lessons[0].checklists, 5);
      assert.equal(lessons[0].lessonNumber, '8');
    });

    it('one pair with two lessons on one day (different period and class) gives two lessons', () => {
      const records = [
        row(1, { class_name: '5А', lesson_number: '2' }),
        row(2, { class_name: '5A', lesson_number: '2' }),
        row(3, { class_name: '6Б', lesson_number: '4' }, low),
        row(4, { class_name: '6Б', lesson_number: '' }, low),
        row(5, { ...pairB, class_name: '5А', lesson_number: '2' }),
        row(6, { class_name: '5А', lesson_number: '2', date: '2026-11-17' }),
      ];
      const lessons = summarizePhenomenonLessons(records);
      assert.equal(lessons.length, 4);
      const day1 = lessons.filter((l) => l.date === '2026-11-16' && l.teachers.includes('Педагог Первый'));
      assert.deepEqual(day1.map((l) => [l.lessonNumber, l.checklists]), [['2', 2], ['4', 2]]);
      assert.notEqual(day1[0].lessonKey, day1[1].lessonKey);
      const sheet = phenomenonExcelSheets(records).find((s) => s.name === 'Уроки')!;
      assert.deepEqual(sheet.rows[0].slice(0, 3), ['Дата', '№ урока', 'Класс']);
      assert.equal(sheet.rows.length, 5);
    });

    it('period number is read from the start of the answer; the form offers 1-9', () => {
      assert.deepEqual([...PHENOMENON_LESSON_NUMBERS], ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
      assert.equal(parsePhenomenonLessonNumber('3'), 3);
      assert.equal(parsePhenomenonLessonNumber('3rd period'), 3);
      assert.equal(parsePhenomenonLessonNumber('3 урок'), 3);
      assert.equal(parsePhenomenonLessonNumber('11:50-12:30'), null);
      assert.equal(parsePhenomenonLessonNumber('9.30'), null);
      assert.equal(parsePhenomenonLessonNumber(''), null);
      assert.equal(parsePhenomenonLessonNumber('12'), null);
    });
  });

  describe('analytics: weeks, summary, lessons', () => {
    const row = (id: number, general: Partial<PhenomenonGeneral>, answers: PhenomenonAnswers = maxAnswers()) =>
      toPhenomenonRecord({ id, created_at: '2026-11-16T10:00:00Z', general: { ...GENERAL, ...general }, answers });
    const pairB = { teacher1_id: 't3', teacher1_name: 'Педагог Третий', teacher2_id: 't4', teacher2_name: 'Педагог Четвёртый' };
    const weak: PhenomenonAnswers = { ...maxAnswers(), ph_phenomenon: 'parallel', ph_reflection: 'formal', ph_objectives: 'teachers', ph_coteaching: 'turns' };
    const records = [
      row(1, { observer_name: 'Наблюдатель 1' }),
      row(2, { observer_name: 'Наблюдатель 2' }, weak),
      row(3, { observer_name: 'Наблюдатель 3' }, weak),
      row(4, { ...pairB, observer_name: 'Наблюдатель 1', date: '2026-11-17' }),
      // Вне недель: только во «Все недели».
      row(5, { observer_name: 'Наблюдатель 4', date: '2026-11-10' }, weak),
    ];

    it('2. a checklist outside the weeks is in no week but is shown in «All weeks»', () => {
      assert.ok(PHENOMENON_WEEKS.some((w) => w.title === 'Эпохи России' && w.from === '2026-11-16' && w.to === '2026-11-18'));
      assert.equal(phenomenonWeekOf('2026-11-10'), null);
      assert.equal(phenomenonWeekOf('2026-11-18')?.title, 'Эпохи России');
      const week = phenomenonRecordsForWeek(records, '2026-11-16');
      assert.deepEqual(week.map((r) => r.id), [1, 2, 3, 4]);
      assert.equal(phenomenonRecordsForWeek(records, PHENOMENON_ALL_WEEKS).length, 5);
      assert.equal(defaultPhenomenonWeek(PHENOMENON_WEEKS, new Date(2026, 10, 17)), '2026-11-16');
      const two = [...PHENOMENON_WEEKS, { id: 'w2', title: 'Другой феномен', from: '2027-02-01', to: '2027-02-03' }];
      assert.equal(defaultPhenomenonWeek(two, new Date(2026, 11, 1)), '2026-11-16', 'future week is not the default');
      assert.equal(defaultPhenomenonWeek(two, new Date(2027, 1, 2)), 'w2', 'the latest week is the default');
    });

    it('summary cards: average by lessons, not by checklists', () => {
      const s = summarizePhenomenonWeek(phenomenonRecordsForWeek(records, '2026-11-16'));
      const weakPct = scorePhenomenon(weak).percent;
      const lessonA = (100 + 2 * (scorePhenomenon(weak).points / 22) * 100) / 3;
      assert.equal(s.lessons.length, 2);
      assert.equal(s.average, Math.round(((lessonA + 100) / 2) * 10) / 10);
      assert.equal(s.checklists, 4);
      assert.equal(s.observers, 3);
      assert.equal(s.teachers, 4);
      assert.equal(s.levelCounts.reduce((a, b) => a + b, 0), 2);
      const a = s.lessons.find((l) => l.date === '2026-11-16')!;
      assert.equal(a.observers, 3);
      assert.equal(a.minPercent, weakPct);
      assert.equal(a.maxPercent, 100);
    });

    it('3. key indicators are counted both by lessons and by checklists', () => {
      const s = summarizePhenomenonWeek(phenomenonRecordsForWeek(records, '2026-11-16'));
      const get = (id: string) => s.indicators.flatMap((g) => g.rows).find((r) => r.id === id)!;
      // Урок A: 1 из 3 наблюдателей «сами связывают», 2 из 3 «параллельно» → у урока ответ «параллельно».
      assert.deepEqual([get('students_link').lessons.count, get('students_link').lessons.total], [1, 2]);
      assert.deepEqual([get('students_link').checklists.count, get('students_link').checklists.total], [2, 4]);
      assert.equal(get('students_link').checklists.percent, 50);
      assert.deepEqual([get('not_revealed').lessons.count, get('not_revealed').checklists.count], [1, 2]);
      assert.deepEqual([get('turns').lessons.count, get('turns').checklists.count], [1, 2]);
      assert.deepEqual([get('reflection_formal').lessons.percent, get('reflection_meaningful').lessons.percent], [50, 50]);
      assert.equal(get('objectives_teachers').checklists.percent, 50);
      // Профиль: восемь пунктов с процентом, «Дополнительные инструменты» только распределением.
      const scored = s.profile.filter((p) => p.percent != null);
      assert.equal(scored.length, 8);
      const tools = s.profile.find((p) => p.id === 'ph_tools')!;
      assert.equal(tools.percent, null);
      assert.equal(tools.options.reduce((n, o) => n + o.count, 0), 4);
      const ph = s.profile.find((p) => p.id === 'ph_phenomenon')!;
      assert.equal(ph.options.find((o) => o.id === 'students_link')!.percent, 50);
    });

    it('lessons table: search by teacher, sort by score and date; lesson card with mastery per teacher', () => {
      const lessons = summarizePhenomenonWeek(phenomenonRecordsForWeek(records, '2026-11-16')).lessons;
      assert.deepEqual(phenomenonLessonRows(lessons, { search: 'третий' }).map((l) => l.date), ['2026-11-17']);
      assert.deepEqual(phenomenonLessonRows(lessons, { sort: 'score_asc' }).map((l) => l.date), ['2026-11-16', '2026-11-17']);
      assert.deepEqual(phenomenonLessonRows(lessons, { sort: 'date_asc' }).map((l) => l.date), ['2026-11-16', '2026-11-17']);
      assert.deepEqual(phenomenonLessonRows(lessons, { sort: 'date_desc' }).map((l) => l.date), ['2026-11-17', '2026-11-16']);
      const detail = phenomenonLessonDetail(records, lessons.find((l) => l.date === '2026-11-16')!);
      assert.equal(detail.checklists.length, 3);
      assert.deepEqual(
        detail.mastery.map((m) => [m.name, m.ratings, m.mean]),
        [['Педагог Второй', 3, 7], ['Педагог Первый', 3, 9]],
      );
    });
  });

  describe('analytics: teachers, slices, discrepancies, export', () => {
    const row = (id: number, general: Partial<PhenomenonGeneral>, answers: PhenomenonAnswers = maxAnswers()) =>
      toPhenomenonRecord({ id, created_at: '2026-11-16T10:00:00Z', general: { ...GENERAL, ...general }, answers });
    const directory = {
      departments: [
        { id: 'dl', name: 'Иностранные языки' },
        { id: 'ds', name: 'Социальные науки' },
      ],
      teachers: [
        { id: 't1', name: 'Педагог Первый', departmentId: 'ds' },
        { id: 't2', name: 'Педагог Второй', departmentId: 'dl' },
        { id: 't3', name: 'Педагог Третий', departmentId: 'dl' },
      ],
    };
    const pairB = { teacher1_id: 't3', teacher1_name: 'Педагог Третий', teacher2_id: 't2', teacher2_name: 'Педагог Второй', class_name: '10А' };
    // 16 из 22 ≈ 72,7 (высокий); оценка наблюдателя «низкий» → расхождение на 3 уровня.
    const low: PhenomenonAnswers = { ...maxAnswers(), ph_phenomenon: 'none', ph_overall: 'low', ph_mastery_1: '5', ph_mastery_2: '3' };
    const records = [
      row(1, { class_name: '4АС', observer_name: 'Наблюдатель 1' }),
      row(2, { class_name: '4AC', observer_name: 'Наблюдатель 2' }, low),
      row(3, { ...pairB, observer_name: 'Наблюдатель 1' }),
      row(4, { ...pairB, class_name: 'кабинет', observer_name: 'Наблюдатель 3', date: '2026-11-17' }),
    ];

    it('teachers: department, lessons, average of their lessons, mastery and number of ratings; sorts', () => {
      const rows = phenomenonTeacherRows(records, directory);
      const second = rows.find((t) => t.name === 'Педагог Второй')!;
      assert.equal(second.department, 'Иностранные языки');
      assert.equal(second.lessons, 3);
      assert.equal(second.ratings, 4);
      assert.equal(second.mastery, Math.round(((7 + 3 + 7 + 7) / 4) * 10) / 10);
      const first = rows.find((t) => t.name === 'Педагог Первый')!;
      assert.equal(first.lessons, 1);
      assert.equal(first.average, Math.round(((100 + (16 / 22) * 100) / 2) * 10) / 10);
      assert.deepEqual(sortPhenomenonTeachers(rows, 'lessons_desc').map((t) => t.name)[0], 'Педагог Второй');
      assert.deepEqual(sortPhenomenonTeachers(rows, 'average_asc').map((t) => t.name)[0], 'Педагог Первый');
      assert.deepEqual(sortPhenomenonTeachers(rows, 'name', 'социальн').map((t) => t.name), ['Педагог Первый']);
    });

    it('5. slices by school stage and by the pair of departments', () => {
      assert.equal(phenomenonStageOf('4АС'), '1-4 классы');
      assert.equal(phenomenonStageOf('9D'), '5-9 классы');
      assert.equal(phenomenonStageOf('10 А'), '10-11 классы');
      assert.equal(phenomenonStageOf('11'), '10-11 классы');
      assert.equal(phenomenonStageOf('A111'), 'не определено');
      assert.equal(phenomenonStageOf('12'), 'не определено');
      const lessons = summarizePhenomenonLessons(records);
      assert.deepEqual(
        phenomenonStageSlices(lessons).map((s) => [s.label, s.lessons]),
        [['1-4 классы', 1], ['10-11 классы', 1], ['не определено', 1]],
      );
      const pairs = phenomenonDepartmentPairSlices(records, lessons, directory);
      assert.deepEqual(pairs.map((p) => [p.label, p.lessons]), [
        ['Иностранные языки + Иностранные языки', 2],
        ['Иностранные языки + Социальные науки', 1],
      ]);
    });

    it('6. discrepancies: spread of 25+ between observers and observer rating 2+ levels from the score', () => {
      const d = phenomenonDiscrepancies(records);
      // Урок 4АС: 100 и 72,7 → разница 27,3.
      assert.equal(d.spread.length, 1);
      assert.equal(d.spread[0].className, '4АС, 4AC');
      assert.equal(d.ratingGaps.length, 1);
      assert.equal(d.ratingGaps[0].record.id, 2);
      assert.equal(d.ratingGaps[0].gap, -3);
      // Разница 2 уровня тоже считается, 1 уровень нет.
      const two = phenomenonDiscrepancies([row(9, {}, { ...maxAnswers(), ph_overall: 'average' })]);
      assert.equal(two.ratingGaps.length, 1);
      const one = phenomenonDiscrepancies([row(9, {}, { ...maxAnswers(), ph_overall: 'high' })]);
      assert.equal(one.ratingGaps.length, 0);
    });

    it('9. Excel: checklists, lessons, teachers, profile by criteria, discrepancies', () => {
      const sheets = phenomenonExcelSheets(records, directory);
      assert.deepEqual(sheets.map((s) => s.name), ['Чек-листы', 'Уроки', 'Педагоги', 'Профиль по критериям', 'Расхождения']);
      const lessons = sheets[1].rows;
      assert.equal(lessons.length, 1 + 3);
      assert.ok(lessons.some((r) => r[2] === '4АС, 4AC' && r[5] === 2));
      assert.equal(sheets[2].rows.length, 1 + 3);
      assert.ok(sheets[2].rows.some((r) => r[0] === 'Педагог Второй' && r[1] === 'Иностранные языки'));
      assert.equal(sheets[4].rows.length, 1 + 2);
    });
  });

  it('7-8. comments feed with text search; dynamics only for weeks with checklists', () => {
    const row = (id: number, general: Partial<PhenomenonGeneral>, comment: string) =>
      toPhenomenonRecord({ id, created_at: '', general: { ...GENERAL, ...general }, answers: { ...maxAnswers(), ph_comments: comment } });
    const records = [
      row(1, {}, 'Группы сами сформулировали вывод'),
      row(2, { observer_name: 'Наблюдатель Другой' }, ''),
      row(3, { date: '2027-02-02' }, 'Мало времени на рефлексию'),
    ];
    const feed = phenomenonComments(records);
    assert.deepEqual(feed.map((c) => c.id), [3, 1]);
    assert.equal(feed[1].lesson?.checklists, 2);
    assert.deepEqual(phenomenonComments(records, 'вывод').map((c) => c.id), [1]);
    const weeks = [
      { id: 'w1', title: 'Первая', from: '2026-11-16', to: '2026-11-18' },
      { id: 'w2', title: 'Вторая', from: '2027-02-01', to: '2027-02-03' },
      { id: 'w3', title: 'Без данных', from: '2027-04-01', to: '2027-04-03' },
    ];
    const dyn = phenomenonDynamics(records, weeks);
    assert.deepEqual(dyn.map((d) => [d.week.id, d.summary.checklists, d.summary.lessons.length]), [['w1', 2, 1], ['w2', 1, 1]]);
    assert.equal(dyn[0].summary.indicators.length, 4);
  });

  it('6. the phenomenon checklist stays out of the main checklist', () => {
    // Отдельный пункт меню, основной «Чек-лист» не подсвечивается на странице феноменального урока.
    assert.equal(isPhenomenonChecklistLocation(VISIT_CHECKLIST_FORM_PATH, '?form=phenomenon'), true);
    assert.equal(isVisitChecklistNavItemCurrent(VISIT_CHECKLIST_FORM_PATH, PHENOMENON_CHECKLIST_PATH, '?form=phenomenon'), true);
    assert.equal(isVisitChecklistNavItemCurrent(VISIT_CHECKLIST_FORM_PATH, VISIT_CHECKLIST_FORM_PATH, '?form=phenomenon'), false);
    assert.equal(isVisitChecklistNavItemCurrent(VISIT_CHECKLIST_FORM_PATH, VISIT_CHECKLIST_FORM_PATH, ''), true);
    assert.equal(isVisitChecklistNavItemCurrent(VISIT_CHECKLIST_FORM_PATH, PHENOMENON_CHECKLIST_PATH, ''), false);
    // Страница отправляет ответы только по своему адресу формы, а не по адресу основного чек-листа.
    const page = readFileSync(fileURLToPath(new URL('../../pages/lessonFeedback/LessonVisitChecklistCabinetFormPage.tsx', import.meta.url)), 'utf8');
    assert.match(page, /await postPhenomenonResponse\(payload\)/);
    assert.doesNotMatch(page, /postPublicLessonVisitResponse/);
    const access = readFileSync(fileURLToPath(new URL('../../pages/lessonFeedback/LessonVisitChecklistCabinetFormPage.tsx', import.meta.url)), 'utf8');
    assert.match(access, /lesson-visit-form\/\$\{encodeURIComponent\(PHENOMENON_FORM_TOKEN\)\}\/responses/);
    // Сервер: ответы феноменального урока сохраняются в отдельный проект без расчётов основного чек-листа
    // (проверяется в backend/functions/lib/lesson-visit-checklist.test.js).
    const server = readFileSync(fileURLToPath(new URL('../../../../backend/functions/lesson-visit-projects.js', import.meta.url)), 'utf8');
    assert.match(server, /if \(isPhenomenonToken\(tokenRaw\)\) return await postPhenomenonResponse\(pool, event\);/);
  });

  it('until opened for everyone, the menu item and button are hidden unless the server confirmed pilot access', () => {
    // sessionStorage в тестах эмулируется, чтобы проверить запомненный ответ сервера.
    const store = new Map<string, string>();
    const g = globalThis as { sessionStorage?: Storage };
    const prev = g.sessionStorage;
    g.sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    try {
      if (PHENOMENON_OPEN_FOR_ALL) {
        // Форма открыта всем: пункт меню виден без проверки пробного доступа.
        for (const cached of [null, true, false]) {
          if (cached != null) cachePhenomenonAccess(cached);
          assert.equal(phenomenonMenuVisible(), true);
          assert.ok(visitChecklistNavItems().some((i) => i.to === PHENOMENON_CHECKLIST_PATH));
        }
      } else {
        assert.equal(phenomenonMenuVisible(), false);
        assert.ok(!visitChecklistNavItems().some((i) => i.to === PHENOMENON_CHECKLIST_PATH));
        cachePhenomenonAccess(true);
        assert.equal(phenomenonMenuVisible(), true);
        assert.ok(visitChecklistNavItems().some((i) => i.to === PHENOMENON_CHECKLIST_PATH));
        cachePhenomenonAccess(false);
        assert.equal(phenomenonMenuVisible(), false);
      }
    } finally {
      g.sessionStorage = prev;
    }
    const page = readFileSync(fileURLToPath(new URL('../../pages/lessonFeedback/LessonVisitChecklistCabinetFormPage.tsx', import.meta.url)), 'utf8');
    assert.match(page, /access === 'denied'/);
    const cabinet = readFileSync(fileURLToPath(new URL('../../pages/lessonFeedback/LessonVisitChecklistCabinetFormPage.tsx', import.meta.url)), 'utf8');
    assert.match(cabinet, /\{showPhenomenon \? \(/);
    // Прямая ссылка /view/lesson-visit/phenomenon-lesson-2026 открывает сразу форму феноменального урока.
    const publicPage = readFileSync(fileURLToPath(new URL('../../pages/LessonVisitChecklistPublicPage.tsx', import.meta.url)), 'utf8');
    assert.match(publicPage, /if \(token === PHENOMENON_FORM_TOKEN\)/);
    assert.match(publicPage, /<PhenomenonLinkBoundary>/);
  });
});

// --- Прямая ссылка на чек-лист феноменального урока вне кабинета ----------------------
// Страница /view/lesson-visit/<токен> рендерится без оболочки кабинета (без входа и его настроек).
// Стили и картинки в Node заменяются пустыми модулями, import.meta.env: пустым объектом.
test('direct link /view/lesson-visit/phenomenon-lesson-2026 renders the phenomenon form outside the cabinet', async () => {
  register(
    'data:text/javascript,' +
      encodeURIComponent(
        "export async function load(url, ctx, next) {" +
          " if (/\\.(css|png|jpe?g|svg|webp)(\\?.*)?$/.test(url)) return { format: 'module', source: 'export default \"\";', shortCircuit: true };" +
          " const r = await next(url, ctx);" +
          " if (url.includes('/frontend/src/') && r.source != null) { const src = String(r.source);" +
          " if (src.includes('import.meta.env')) return { ...r, source: src.replaceAll('import.meta.env', '(import.meta.env ?? {})') }; }" +
          " return r; }",
      ),
  );
  const React = await import('react');
  const { renderToPipeableStream } = await import('react-dom/server');
  const { MemoryRouter, Route, Routes } = await import('react-router-dom');
  const { default: LessonVisitChecklistPublicPage } = await import('../../pages/LessonVisitChecklistPublicPage.tsx');
  const render = (path: string) =>
    new Promise<string>((resolve, reject) => {
      let out = '';
      const sink = new Writable({
        write(chunk: Buffer, _enc: string, cb: () => void) {
          out += chunk.toString();
          cb();
        },
        final(cb: () => void) {
          resolve(out);
          cb();
        },
      });
      const stream = renderToPipeableStream(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: '/view/lesson-visit/:token', element: React.createElement(LessonVisitChecklistPublicPage) }),
          ),
        ),
        { onAllReady: () => stream.pipe(sink), onShellError: reject, onError: reject },
      );
    });
  const phenomenon = await render('/view/lesson-visit/phenomenon-lesson-2026');
  assert.match(phenomenon, /Чек-лист феноменального урока/);
  assert.match(phenomenon, />RU</);
  assert.match(phenomenon, />EN</);
  assert.doesNotMatch(phenomenon, /Не удалось открыть чек-лист/);
  const main = await render('/view/lesson-visit/some-main-token');
  assert.doesNotMatch(main, /Чек-лист феноменального урока/);
});
