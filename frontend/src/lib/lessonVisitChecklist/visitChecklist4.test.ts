import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildLessonVisitAnalyticsHeaders,
  buildLessonVisitColumnRoles,
  LESSON_VISIT_ORDINAL_HEADER,
  LESSON_VISIT_RECOMMENDATIONS_HEADER,
  LESSON_VISIT_SECTION_DEFS,
  LESSON_VISIT_SUMMARY_HEADER,
  resolveVisitQuestionTarget,
} from './visitChecklistAnalyticsMapping.ts';
import type {
  LessonVisitChecklistConfig,
  LessonVisitDirectory,
  LessonVisitQuestion,
  LessonVisitSection,
} from './types.ts';
import {
  VISIT_CHECKLIST_TITLE,
  VISIT_FORMAT_SELF_ANALYSIS,
  displayVisitChecklistTitle,
  ensureVisitFormatSelfAnalysis,
  ensureSubjectSelectFromSeed,
  normalizeSavedChecklist,
} from './normalizeChecklist.ts';

const root = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(join(root, 'defaultSeed.json'), 'utf8')) as LessonVisitChecklistConfig;
const rubric = JSON.parse(readFileSync(join(root, 'visitChecklistRubric.json'), 'utf8')) as {
  sections: Array<{ code: string; items: unknown[] }>;
};

test('checklist seed has 10 sections, visit format options, subject select, and expected key items', () => {
  const visitFormat = seed.generalFields.find((f) => f.id === 'visit_format');
  assert.ok(visitFormat);
  assert.deepEqual(visitFormat.options, ['очно', 'онлайн', VISIT_FORMAT_SELF_ANALYSIS]);
  const subject = seed.generalFields.find((f) => f.id === 'subject');
  assert.ok(subject);
  assert.equal(subject.type, 'select');
  assert.ok(Array.isArray(subject.options));
  assert.ok(subject.options!.length >= 35);
  assert.ok(subject.options!.includes('Алгебра'));
  assert.ok(subject.options!.includes('Английский язык'));
  assert.ok(subject.options!.includes('Информатика'));
  assert.equal(seed.sections.length, 10);
  assert.equal(LESSON_VISIT_SECTION_DEFS.length, 10);
  assert.deepEqual(
    seed.sections.map((s) => s.code),
    LESSON_VISIT_SECTION_DEFS.map((d) => d.code),
  );
  const q11 = seed.sections[0].questions[0];
  assert.equal(q11.code, '1.1');
  assert.deepEqual(q11.options, ['готов', 'частично', 'не готов']);
  const q101 = seed.sections[9].questions[0];
  assert.equal(q101.code, '10.1');
  assert.equal(q101.options.length, 5);
  assert.equal(seed.sections[9].questions[1].type, 'text');
  assert.equal(seed.sections[9].questions[2].type, 'text');
  const scored = seed.sections.flatMap((s) => s.questions.filter((q) => q.type !== 'text'));
  assert.ok(scored.every((q) => q.options.length >= 2));
  assert.equal(rubric.sections.length, 10);
});

test('analytics mapping: 10.1 ordinal, 10.2 summary, 10.3 takeaway', () => {
  const sec10 = seed.sections[9] as LessonVisitSection;
  assert.equal(resolveVisitQuestionTarget(sec10.questions[0] as LessonVisitQuestion, sec10), 'ordinal');
  assert.equal(resolveVisitQuestionTarget(sec10.questions[1] as LessonVisitQuestion, sec10), 'text_summary');
  assert.equal(
    resolveVisitQuestionTarget(sec10.questions[2] as LessonVisitQuestion, sec10),
    'text_recommendations',
  );
  const sec1 = seed.sections[0] as LessonVisitSection;
  assert.equal(resolveVisitQuestionTarget(sec1.questions[0] as LessonVisitQuestion, sec1), 'lesson_visit_sec_1');
});

test('analytics headers and roles cover 10 sections plus 10.1–10.3', () => {
  const headers = buildLessonVisitAnalyticsHeaders(seed);
  const roles = buildLessonVisitColumnRoles(headers);
  assert.ok(headers.includes('1 Организационный блок'));
  assert.ok(headers.includes('10 Общая оценка урока'));
  assert.ok(headers.includes(LESSON_VISIT_ORDINAL_HEADER));
  assert.ok(headers.includes(LESSON_VISIT_SUMMARY_HEADER));
  assert.ok(headers.includes(LESSON_VISIT_RECOMMENDATIONS_HEADER));
  assert.equal(roles[headers.indexOf(LESSON_VISIT_ORDINAL_HEADER)], 'metric_ordinal_text');
  assert.equal(roles[headers.indexOf(LESSON_VISIT_SUMMARY_HEADER)], 'text_ai_summary');
  assert.equal(roles[headers.indexOf(LESSON_VISIT_RECOMMENDATIONS_HEADER)], 'text_ai_recommendations');
  assert.equal(roles[headers.indexOf('3 Методическая и психолого-педагогическая грамотность')], 'lesson_visit_sec_3');
  assert.equal(roles[headers.indexOf('Дата посещения')], 'date');
  assert.equal(roles[headers.indexOf('Количество обучающихся на уроке')], 'metric_numeric');
});

test('displayVisitChecklistTitle strips 4.0 from user-visible names', () => {
  assert.equal(displayVisitChecklistTitle('Чек-лист 4.0'), VISIT_CHECKLIST_TITLE);
  assert.equal(displayVisitChecklistTitle('Чек-лист посещения урока 4.0'), VISIT_CHECKLIST_TITLE);
  assert.equal(displayVisitChecklistTitle('Чек-лист посещения урока 4.0.0'), VISIT_CHECKLIST_TITLE);
  assert.equal(displayVisitChecklistTitle('Чек-лист посещения урока 10.1.1'), VISIT_CHECKLIST_TITLE);
  assert.equal(displayVisitChecklistTitle('Чек-лист посещения урока'), VISIT_CHECKLIST_TITLE);
  assert.equal(displayVisitChecklistTitle(''), VISIT_CHECKLIST_TITLE);
});

test('directory follows Excel chairs plus JD leadership teachers', () => {
  const full = JSON.parse(readFileSync(join(root, 'defaultSeed.json'), 'utf8')) as {
    directory: LessonVisitDirectory;
  };
  const { departments, teachers } = full.directory;
  assert.deepEqual(
    departments.map((d) => d.name),
    [
      'Кафедра начального образования',
      'Кафедра английского языка',
      'Кафедра математики и информатики',
      'Международный департамент',
      'Кафедра словесности',
      'Кафедра естественных наук',
      'Кафедра социальных наук',
      'Кафедра спорта',
      'Кафедра искусства и культуры',
      'Кафедра лидерства',
      'Администрация',
      'Учебная часть',
    ],
  );
  const leadership = teachers.filter((t) => t.departmentId === 'dept_8');
  const leadershipNames = leadership.map((t) => t.name);
  for (const name of [
    'Васенкова Елена Владимировна',
    'Камышанова Анастасия Валерьевна',
    'Клементьева Екатерина Сергеевна',
    'Круглова Галина Игоревна',
  ]) {
    assert.ok(leadershipNames.includes(name));
  }
  assert.equal(leadership.length, 5);
  const pe = new Set(teachers.filter((t) => t.departmentId === 'dept_6').map((t) => t.name));
  for (const name of leadership.map((t) => t.name)) {
    assert.equal(pe.has(name), false);
  }
  assert.equal(teachers.filter((t) => t.departmentId === 'dept_admin').length, 9);
  assert.equal(teachers.filter((t) => t.departmentId === 'dept_academic').length, 5);
  assert.equal(
    teachers.filter((t) => t.departmentId !== 'dept_admin' && t.departmentId !== 'dept_academic').length,
    177,
  );
  assert.equal(teachers.length, 191);
  const ids = teachers.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('ensureSubjectSelectFromSeed upgrades stale text subject to seed select options', () => {
  const stale = {
    v: 1 as const,
    generalFields: [{ id: 'subject', label: 'Предмет', type: 'text' as const, required: true }],
    sections: [],
  };
  const patched = ensureSubjectSelectFromSeed(stale);
  const subject = patched?.generalFields.find((f) => f.id === 'subject');
  assert.equal(subject?.type, 'select');
  assert.ok(Array.isArray(subject?.options));
  assert.ok((subject?.options?.length ?? 0) >= 35);
  assert.ok(subject?.options?.includes('Алгебра'));
});

test('normalizeSavedChecklist patches visit format and subject together', () => {
  const stale = {
    v: 1 as const,
    generalFields: [
      { id: 'visit_format', label: 'Формат посещения урока', type: 'radio' as const, options: ['очно', 'онлайн'] },
      { id: 'subject', label: 'Предмет', type: 'text' as const, required: true },
    ],
    sections: [],
  };
  const patched = normalizeSavedChecklist(stale);
  assert.ok(patched?.generalFields.find((f) => f.id === 'visit_format')?.options?.includes(VISIT_FORMAT_SELF_ANALYSIS));
  assert.equal(patched?.generalFields.find((f) => f.id === 'subject')?.type, 'select');
});

test('ensureVisitFormatSelfAnalysis adds Самоанализ next to existing formats', () => {
  const patched = ensureVisitFormatSelfAnalysis({
    v: 1,
    generalFields: [
      { id: 'visit_format', label: 'Формат посещения урока', type: 'radio', options: ['очно', 'онлайн'] },
    ],
    sections: [],
  });
  assert.deepEqual(patched?.generalFields[0].options, ['очно', 'онлайн', VISIT_FORMAT_SELF_ANALYSIS]);
  assert.deepEqual(ensureVisitFormatSelfAnalysis(patched)?.generalFields[0].options, [
    'очно',
    'онлайн',
    VISIT_FORMAT_SELF_ANALYSIS,
  ]);
});
