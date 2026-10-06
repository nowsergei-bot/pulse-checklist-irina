import assert from 'node:assert/strict';
import test from 'node:test';
import { VISIT_FORMAT_SELF_ANALYSIS } from './normalizeChecklist.ts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePublicLessonVisitDirectory } from './resolvePublicDirectory.ts';
import type { LessonVisitDirectory } from './types.ts';
import {
  LESSON_VISIT_PUBLIC_FORM_TOKEN,
  VISIT_CHECKLIST_FORM_PATH,
  isVisitChecklistCabinetFormPath,
  lessonVisitCabinetFormPath,
  lessonVisitCabinetSelfAnalysisFormPath,
  lessonVisitPublicFormPath,
  lessonVisitSelfAnalysisFormPath,
  preferredVisitFormatFromQuery,
} from './publicForm.ts';

test('public form token is env-only and never the 2026 9-block project', () => {
  assert.notEqual(LESSON_VISIT_PUBLIC_FORM_TOKEN, 'be57bd59186a4b30b467c9d2eb6b4b49');
  assert.doesNotMatch(String(LESSON_VISIT_PUBLIC_FORM_TOKEN || ''), /03b9a7dd035949e5a6247dbedc445592/);
});

test('lessonVisitPublicFormPath encodes token and optional format', () => {
  if (LESSON_VISIT_PUBLIC_FORM_TOKEN) {
    assert.equal(lessonVisitPublicFormPath(), `/view/lesson-visit/${LESSON_VISIT_PUBLIC_FORM_TOKEN}`);
  } else {
    assert.equal(lessonVisitPublicFormPath(), VISIT_CHECKLIST_FORM_PATH);
  }
  assert.equal(
    lessonVisitPublicFormPath({ token: 'abc' }),
    '/view/lesson-visit/abc',
  );
  assert.equal(
    lessonVisitSelfAnalysisFormPath('abc'),
    `/view/lesson-visit/abc?format=${encodeURIComponent(VISIT_FORMAT_SELF_ANALYSIS)}`,
  );
});

test('cabinet form path stays in Pulse shell and does not open /view', () => {
  assert.equal(VISIT_CHECKLIST_FORM_PATH, '/cabinet/feedback/form');
  assert.equal(lessonVisitCabinetFormPath(), '/cabinet/feedback/form');
  assert.equal(
    lessonVisitCabinetFormPath({ token: 'abc' }),
    '/cabinet/feedback/form?token=abc',
  );
  assert.equal(
    lessonVisitCabinetSelfAnalysisFormPath(),
    `/cabinet/feedback/form?format=${encodeURIComponent(VISIT_FORMAT_SELF_ANALYSIS)}`,
  );
  assert.equal(
    lessonVisitCabinetSelfAnalysisFormPath({ base: '/cabinet/as/feedback/form' }),
    `/cabinet/as/feedback/form?format=${encodeURIComponent(VISIT_FORMAT_SELF_ANALYSIS)}`,
  );
  assert.equal(
    lessonVisitCabinetSelfAnalysisFormPath({ base: '/cabinet/as/feedback/form?as=1' }),
    `/cabinet/as/feedback/form?as=1&format=${encodeURIComponent(VISIT_FORMAT_SELF_ANALYSIS)}`,
  );
  assert.equal(isVisitChecklistCabinetFormPath('/cabinet/feedback/form'), true);
  assert.equal(isVisitChecklistCabinetFormPath('/cabinet/as/feedback/form'), true);
  assert.equal(isVisitChecklistCabinetFormPath('/cabinet/feedback'), false);
  assert.equal(isVisitChecklistCabinetFormPath('/view/lesson-visit/abc'), false);
  assert.doesNotMatch(lessonVisitCabinetFormPath(), /\/view\/lesson-visit/);
});

test('public form directory prefers current seed over stale project snapshot', () => {
  const seedFile = join(dirname(fileURLToPath(import.meta.url)), 'defaultSeed.json');
  const seed = (JSON.parse(readFileSync(seedFile, 'utf8')) as { directory: LessonVisitDirectory }).directory;
  assert.ok(seed.departments.some((d) => d.name === 'Кафедра лидерства'));
  assert.ok(seed.departments.some((d) => d.id === 'dept_admin' && d.name === 'Администрация'));
  assert.ok(seed.departments.some((d) => d.id === 'dept_academic' && d.name === 'Учебная часть'));
  const stale = {
    departments: [{ id: 'dept_old', name: 'Старая кафедра' }],
    teachers: [{ id: 't_old', name: 'Старый педагог', departmentId: 'dept_old' }],
  };
  const resolved = resolvePublicLessonVisitDirectory(stale, seed);
  assert.ok(resolved.departments.some((d) => d.name === 'Кафедра лидерства'));
  assert.equal(resolved.departments.some((d) => d.id === 'dept_old'), false);
  assert.ok(resolved.teachers.some((t) => t.departmentId === seed.departments.find((d) => d.name === 'Кафедра лидерства')?.id));

  const fallback = resolvePublicLessonVisitDirectory(stale, { departments: [], teachers: [] });
  assert.deepEqual(fallback, stale);
});

test('preferredVisitFormatFromQuery maps Самоанализ aliases onto visit_format options', () => {
  const options = ['очно', 'онлайн', VISIT_FORMAT_SELF_ANALYSIS];
  assert.equal(preferredVisitFormatFromQuery('Самоанализ', options), VISIT_FORMAT_SELF_ANALYSIS);
  assert.equal(preferredVisitFormatFromQuery('самоанализ', options), VISIT_FORMAT_SELF_ANALYSIS);
  assert.equal(preferredVisitFormatFromQuery('self', options), VISIT_FORMAT_SELF_ANALYSIS);
  assert.equal(preferredVisitFormatFromQuery('очно', options), 'очно');
  assert.equal(preferredVisitFormatFromQuery('offline', options), null);
  assert.equal(preferredVisitFormatFromQuery('', options), null);
});
