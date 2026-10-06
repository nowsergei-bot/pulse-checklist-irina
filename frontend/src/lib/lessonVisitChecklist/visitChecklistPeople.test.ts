import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { LessonVisitChecklistConfig, LessonVisitDirectory } from './types.ts';
import {
  VISIT_ACADEMIC_DEPT_ID,
  VISIT_ADMIN_DEPT_ID,
  VISIT_CAMPUS_DEPT_LABEL,
  isDirectoryTeacherId,
  isVisitAdminLeadershipName,
  isVisitCampusDepartment,
  isVisitChecklistPersonField,
  isVisitUvpDepartment,
  findTeacherByLooseName,
  isKnownVisitTeacher,
  isKnownVisitTeacherResponse,
  resolveFullTeacherName,
  resolveVisitTeacherChoice,
  visitAdminRehomeDepartment,
  visitChecklistChairDepartments,
  visitChecklistObservedTeacherGroups,
  visitChecklistObservedTeachers,
  visitChecklistVisitorGroups,
  visitChecklistVisitorNames,
  visitTeacherDisplayName,
} from './visitChecklistPeople.ts';

const root = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(join(root, 'defaultSeed.json'), 'utf8')) as LessonVisitChecklistConfig & {
  directory: LessonVisitDirectory;
};
const directory = seed.directory;

test('visitor groups keep only four surnames in Administration', () => {
  const groups = visitChecklistVisitorGroups(directory);
  assert.equal(groups[0].heading, 'Администрация');
  assert.deepEqual(groups[0].choices, [
    'Басовский Виталий Валерьевич',
    'Зенькович Наталья Владимировна',
    'Майсурадзе Майя Отариевна',
    'Хорошилов Алексей Александрович',
  ]);
  assert.equal(groups.some((g) => g.heading === 'Кафедры'), false);
  const academic = groups.find((g) => g.heading === 'Учебная часть');
  assert.deepEqual(academic?.choices, [
    'Волкова Наталья Анатольевна',
    'Воробьева Лидия Анатольевна',
    'Зубова Кристина Андреевна',
    'Костюкович Ирина Сергеевна',
    'Петрова Наталья Витальевна',
  ]);
  assert.ok(groups.some((g) => g.heading === 'Кафедра лидерства' && g.choices.includes('Васенкова Елена Владимировна')));
  assert.equal(
    groups.find((g) => g.heading === 'Кафедра английского языка')?.choices.includes('Костюкович Ирина Сергеевна'),
    false,
  );
  const names = visitChecklistVisitorNames(directory);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.length, 187);
});

test('former Administration people sit in their staff/JD subdivisions', () => {
  const groups = visitChecklistVisitorGroups(directory);
  const byHeading = Object.fromEntries(groups.map((g) => [g.heading, g.choices]));
  assert.equal(byHeading['Администрация'].includes('Елисеев Артемий Сергеевич'), false);
  assert.equal(byHeading['Администрация'].includes('Прищеп Александр Александрович'), false);
  assert.equal(byHeading['Администрация'].includes('Фадеева Дарья Сергеевна'), false);
  assert.equal(byHeading['Администрация'].includes('Шинкевич Марина Николаевна'), false);
  assert.equal(byHeading['Администрация'].includes('Новожилов Сергей Валерьевич'), false);
  assert.ok(byHeading['Отдел разработки информационных систем']?.includes('Елисеев Артемий Сергеевич'));
  assert.ok(byHeading['Хозяйственный отдел']?.includes('Прищеп Александр Александрович'));
  assert.ok(byHeading['Центр Предшкола']?.includes('Фадеева Дарья Сергеевна'));
  assert.ok(byHeading['Отдел персонала']?.includes('Шинкевич Марина Николаевна'));
  assert.ok(byHeading['Отдел технического сопровождения мероприятий']?.includes('Новожилов Сергей Валерьевич'));
  assert.equal(isVisitAdminLeadershipName('майсурадзе майя'), true);
  assert.equal(isVisitAdminLeadershipName('Елисеев Артемий Сергеевич'), false);
  assert.equal(visitAdminRehomeDepartment('Новожилов Сергей Валерьевич'), 'Отдел технического сопровождения мероприятий');
});

test('visitor and teacher lists merge Campus 1+2 and drop UVP sections', () => {
  const mixed: LessonVisitDirectory = {
    departments: [
      { id: 'dept_admin', name: 'Администрация' },
      { id: 'dept_c1', name: 'Кампус 1' },
      { id: 'dept_c2', name: 'Кампус 2' },
      { id: 'dept_uvp', name: 'Учебно-вспомогательный персонал' },
      { id: 'dept_uvp2', name: 'УВП' },
      { id: 'dept_8', name: 'Кафедра лидерства' },
    ],
    teachers: [
      { id: 'a1', name: 'Майсурадзе Майя Отариевна', departmentId: 'dept_admin' },
      { id: 'a2', name: 'Елисеев Артемий Сергеевич', departmentId: 'dept_admin' },
      { id: 'c1', name: 'Кампус Один', departmentId: 'dept_c1' },
      { id: 'c2', name: 'Кампус Два', departmentId: 'dept_c2' },
      { id: 'u1', name: 'Увп Сотрудник', departmentId: 'dept_uvp' },
      { id: 'u2', name: 'Увп Два', departmentId: 'dept_uvp2' },
      { id: 't1', name: 'Круглова Галина Игоревна', departmentId: 'dept_8' },
    ],
  };
  const visitor = visitChecklistVisitorGroups(mixed);
  assert.deepEqual(
    visitor.map((g) => g.heading),
    ['Администрация', VISIT_CAMPUS_DEPT_LABEL, 'Кафедра лидерства', 'Отдел разработки информационных систем'],
  );
  assert.deepEqual(visitor.find((g) => g.heading === VISIT_CAMPUS_DEPT_LABEL)?.choices, [
    'Кампус Два',
    'Кампус Один',
  ]);
  assert.equal(visitor.some((g) => /увп|учебно-вспомогательн/i.test(g.heading)), false);
  assert.equal(visitChecklistVisitorNames(mixed).includes('Увп Сотрудник'), false);

  const chairs = visitChecklistChairDepartments(mixed);
  assert.deepEqual(
    chairs.map((d) => d.name),
    [VISIT_CAMPUS_DEPT_LABEL, 'Кафедра лидерства'],
  );
  const observed = visitChecklistObservedTeacherGroups(mixed);
  assert.deepEqual(
    observed.map((g) => g.heading),
    [VISIT_CAMPUS_DEPT_LABEL, 'Кафедра лидерства'],
  );
  assert.deepEqual(observed[0].choices, ['Кампус Два', 'Кампус Один']);
  assert.deepEqual(
    visitChecklistObservedTeachers(mixed, 'dept_c1').map((t) => t.name),
    ['Кампус Два', 'Кампус Один'],
  );
  assert.equal(isVisitCampusDepartment('Кампус 2'), true);
  assert.equal(isVisitUvpDepartment('УВП'), true);
  assert.equal(isVisitUvpDepartment('Отдел персонала'), false);
});

test('observed teachers exclude administration and academic office', () => {
  const chairs = visitChecklistObservedTeachers(directory);
  assert.equal(chairs.length, 175);
  assert.equal(chairs.some((t) => t.departmentId === VISIT_ADMIN_DEPT_ID), false);
  assert.equal(chairs.some((t) => t.departmentId === VISIT_ACADEMIC_DEPT_ID), false);
  assert.deepEqual(
    visitChecklistChairDepartments(directory).map((d) => d.id).includes(VISIT_ADMIN_DEPT_ID),
    false,
  );
  const leadership = visitChecklistObservedTeachers(directory, 'dept_8');
  assert.equal(leadership.length, 4);
  const groups = visitChecklistObservedTeacherGroups(directory);
  assert.ok(groups.some((g) => g.heading === 'Кафедра лидерства' && g.choices.includes('Круглова Галина Игоревна')));
  assert.equal(groups.some((g) => g.heading === 'Администрация'), false);
});

test('teacher choice maps list name to id and keeps manual FIO as text', () => {
  const picked = resolveVisitTeacherChoice(directory, 'Круглова Галина Игоревна');
  assert.equal(picked.teacherId, 'teacher_79');
  assert.equal(picked.departmentId, 'dept_8');
  assert.equal(visitTeacherDisplayName(directory, 'teacher_79'), 'Круглова Галина Игоревна');
  const manual = resolveVisitTeacherChoice(directory, 'Сидорова Анна Петровна');
  assert.deepEqual(manual, { teacherId: 'Сидорова Анна Петровна' });
  assert.equal(visitTeacherDisplayName(directory, 'Сидорова Анна Петровна'), 'Сидорова Анна Петровна');
  assert.equal(isDirectoryTeacherId(directory, 'teacher_79'), true);
  assert.equal(isDirectoryTeacherId(directory, 'Сидорова Анна Петровна'), false);
});

test('person fields are visitor_name and teacher_id', () => {
  assert.equal(isVisitChecklistPersonField({ id: 'visitor_name', type: 'text' }), 'visitor');
  assert.equal(isVisitChecklistPersonField({ id: 'teacher_id', type: 'teacher' }), 'teacher');
  assert.equal(isVisitChecklistPersonField({ id: 'class_name', type: 'text' }), null);
});

test('public visit form uses PersonSelect for visitor and teacher', () => {
  const page = readFileSync(join(root, '../../pages/LessonVisitChecklistPublicPage.tsx'), 'utf8');
  assert.match(page, /PersonSelectField/);
  assert.match(page, /visitChecklistVisitorGroups/);
  assert.match(page, /allowManualEntry/);
  assert.match(page, /Моей фамилии нет в списке/);
  assert.equal(page.includes('выберите педагога'), false);
});

test('public visit form renders subject as select and muted самоанализ label', () => {
  const page = readFileSync(join(root, '../../pages/LessonVisitChecklistPublicPage.tsx'), 'utf8');
  assert.match(page, /field\.type === 'select'/);
  assert.match(page, /выберите предмет/);
  assert.match(page, /displayVisitFormatOptionLabel/);
  assert.match(page, /is-self-analysis/);
  const subject = seed.generalFields.find((f) => f.id === 'subject');
  assert.equal(subject?.type, 'select');
});

test('resolveFullTeacherName expands surname to directory FIO', () => {
  const hit = findTeacherByLooseName(directory.teachers, 'Хорошилов');
  assert.equal(hit?.name, 'Хорошилов Алексей Александрович');
  assert.equal(resolveFullTeacherName('Хорошилов', directory), 'Хорошилов Алексей Александрович');
  assert.equal(resolveFullTeacherName('teacher_999', directory), '');
  assert.equal(resolveFullTeacherName('Педагог без ФИО', directory), '');
  assert.equal(resolveFullTeacherName('teacher162', directory), '');
  assert.equal(resolveFullTeacherName('teacher_162', directory), 'Митяжин Роман Валерьевич');
});

test('teacher162-style ids are unknown unless the directory has a real FIO', () => {
  assert.equal(isKnownVisitTeacher('teacher162', directory), false);
  assert.equal(isKnownVisitTeacher('t163', directory), false);
  assert.equal(isKnownVisitTeacher('teacher_162', directory), true);
  assert.equal(isKnownVisitTeacher('Акбатырова Мария Николаевна', directory), true);
  assert.equal(isKnownVisitTeacherResponse({ general: { teacher_id: 'teacher162' } }, directory), false);
  assert.equal(isKnownVisitTeacherResponse({ general: { teacher_id: 'teacher_162' } }, directory), true);
  assert.equal(isKnownVisitTeacherResponse({ general: { teacher_name: 'Петрова Анна' } }, directory), true);
});
